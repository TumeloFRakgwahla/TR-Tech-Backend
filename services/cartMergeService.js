const Cart = require('../models/Cart');
const Product = require('../models/Product');

/**
 * Cart merge / sync service.
 *
 * Design contract
 * ---------------
 * `mergeCart` is CONVERGENT: it is idempotent and commutative. A merge that
 * satisfies both properties needs no locking, no read-modify-write guard and no
 * version check, because two concurrent merges reach the same final state.
 * Idempotency comes from the `appliedBatches` ledger; commutativity comes from
 * unioning into a map before applying per-line rules.
 *
 * The merge SUMS quantities when a product is present in both carts. That is
 * only safe because a replayed batch is a no-op — without the ledger, summing
 * inflates quantities on every page reload.
 *
 * Server authority: name/condition/price/image are always read from the
 * Product document. A client-supplied price is never trusted.
 */

const MAX_LINES = 100;
const MAX_QTY_PER_LINE = 99;
const BATCH_LEDGER_LIMIT = 50;

/** Canonical line identity. */
const lineKey = (product, variantKey = '') => `${product}:${variantKey || ''}`;

function isObjectId(value) {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

function alreadyApplied(doc, batchId) {
  if (!batchId || !doc.appliedBatches?.length) return false;
  return doc.appliedBatches.some((b) => b.batchId === batchId);
}

function recordBatch(doc, batchId) {
  if (!batchId) return;
  doc.appliedBatches.push({ batchId, appliedAt: new Date() });
  if (doc.appliedBatches.length > BATCH_LEDGER_LIMIT) {
    doc.appliedBatches = doc.appliedBatches.slice(-BATCH_LEDGER_LIMIT);
  }
}

async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ user: userId });
  if (cart) return cart;
  try {
    return await Cart.create({ user: userId, items: [] });
  } catch (error) {
    // Unique index on `user`: a concurrent request won the race.
    if (error && error.code === 11000) {
      const existing = await Cart.findOne({ user: userId });
      if (existing) return existing;
    }
    throw error;
  }
}

/**
 * Project a cart into the wire format. Populates live `stock`/`status` so the
 * client can render availability, and computes `subtotal` from server-side
 * prices (the client must not compute its own total).
 */
async function hydrate(cart) {
  const populated = await Cart.findById(cart._id)
    // `product` lives inside the `items` subdocuments, not at the top level of
    // the Cart schema, so the global `strictPopulate` option would reject it.
    // Scoped to this query rather than disabled globally.
    .populate({ path: 'items.product', select: 'name price image condition stock status category' })
    .lean();

  const items = (populated?.items || []).map((item) => ({
    product: String(item.product?._id || item.product),
    variantKey: item.variantKey || '',
    name: item.name,
    condition: item.condition,
    category: item.category || item.product?.category || '',
    price: item.price,
    image: item.image,
    quantity: item.quantity,
    stock: item.product?.stock ?? 0,
    available: (item.product?.status === 'Active') && (item.product?.stock ?? 0) >= item.quantity,
    lineTotal: Math.round(item.price * item.quantity * 100) / 100,
  }));

  return {
    items,
    rev: populated?.rev ?? 0,
    // Rounded to cents to avoid float drift accumulating over lines.
    subtotal: Math.round(items.reduce((sum, i) => sum + i.lineTotal, 0) * 100) / 100,
    updatedAt: populated?.updatedAt || cart.updatedAt,
  };
}

/**
 * Merge a guest cart into an authenticated user's cart.
 *
 * Per line:
 *   1. union by (product, variantKey)          -> order-independent
 *   2. quantity = guestQty + serverQty          -> both intents honoured
 *   3. clamped to live stock                     -> never oversell
 *   4. snapshot re-read from Product             -> client cannot set price
 *   5. dropped only if the product is gone or Inactive, and reported
 *
 * @param {string} userId
 * @param {Array<{product:string, variantKey?:string, quantity:number}>} guestLines
 * @param {string} batchId idempotency key; replaying the same value is a no-op
 */
async function mergeCart(userId, guestLines = [], batchId) {
  const cart = await getOrCreateCart(userId);

  if (alreadyApplied(cart, batchId)) {
    return { cart: await hydrate(cart), warnings: [], replayed: true };
  }

  const warnings = [];
  const clean = (guestLines || [])
    .filter((l) => l && isObjectId(String(l.product || '')))
    .map((l) => ({
      product: l.product,
      variantKey: String(l.variantKey || '').slice(0, 64),
      quantity: Math.min(MAX_QTY_PER_LINE, Math.max(1, parseInt(l.quantity, 10) || 1)),
    }));

  if (clean.length === 0) {
    return { cart: await hydrate(cart), warnings, replayed: false };
  }

  // One query for all products, rather than one per line.
  const ids = [...new Set([...clean.map((l) => l.product), ...cart.items.map((i) => String(i.product))])];
  const products = await Product.find({ _id: { $in: ids } }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  // Step 1 + 2: union with summed quantities.
  const merged = new Map();
  for (const item of cart.items) {
    merged.set(lineKey(item.product, item.variantKey), {
      product: String(item.product),
      variantKey: item.variantKey || '',
      quantity: item.quantity,
    });
  }
  for (const line of clean) {
    const key = lineKey(line.product, line.variantKey);
    const existing = merged.get(key);
    merged.set(key, {
      product: String(line.product),
      variantKey: line.variantKey,
      quantity: (existing ? existing.quantity : 0) + line.quantity,
    });
  }

  // Step 3 + 4 + 5.
  const nextItems = [];
  for (const line of merged.values()) {
    const product = byId.get(line.product);

    if (!product) {
      warnings.push({ product: line.product, reason: 'PRODUCT_UNAVAILABLE' });
      continue;
    }
    if (product.status !== 'Active') {
      warnings.push({ product: line.product, name: product.name, reason: 'PRODUCT_INACTIVE' });
      continue;
    }

    let quantity = Math.min(line.quantity, MAX_QTY_PER_LINE);
    if (product.stock <= 0) {
      warnings.push({ product: line.product, name: product.name, reason: 'OUT_OF_STOCK' });
      continue;
    }
    if (quantity > product.stock) {
      warnings.push({
        product: line.product,
        name: product.name,
        reason: 'STOCK_CLAMPED',
        requested: quantity,
        available: product.stock,
      });
      quantity = product.stock;
    }

    nextItems.push({
      product: product._id,
      variantKey: line.variantKey,
      name: product.name,
      condition: product.condition,
      category: product.category || '',
      price: product.price,
      image: product.image || '',
      quantity,
      lineRev: 1,
    });
  }

  cart.items = nextItems.slice(0, MAX_LINES);
  cart.rev += 1;
  recordBatch(cart, batchId);
  await cart.save();

  return { cart: await hydrate(cart), warnings, replayed: false };
}

/**
 * Apply intent operations to a cart.
 *
 * Unlike merge, mutation is NOT convergent, so it requires optimistic
 * concurrency: a caller passing a `baseRev` that no longer matches gets a
 * 409 plus the authoritative state, and is expected to re-apply its intent.
 *
 * @param {string} userId
 * @param {Array<{type:'ADD'|'SET_QTY'|'REMOVE'|'CLEAR', product?:string,
 *                variantKey?:string, quantity?:number}>} ops
 * @param {number} baseRev
 * @param {string} batchId
 * @returns {{status:'applied'|'stale'|'replayed', cart?:object, warnings?:Array}}
 */
async function applyOps(userId, ops = [], baseRev, batchId) {
  const cart = await getOrCreateCart(userId);

  if (alreadyApplied(cart, batchId)) {
    return { status: 'replayed', cart: await hydrate(cart) };
  }

  if (Number.isInteger(baseRev) && baseRev !== cart.rev) {
    return { status: 'stale', cart: await hydrate(cart) };
  }

  const byKey = new Map(
    cart.items.map((i) => [lineKey(i.product, i.variantKey), i])
  );

  for (const op of ops) {
    if (op.type === 'CLEAR') {
      byKey.clear();
      continue;
    }
    if (!op.product || !isObjectId(String(op.product))) continue;

    const key = lineKey(op.product, op.variantKey);
    const line = byKey.get(key);

    if (op.type === 'REMOVE') {
      byKey.delete(key);
    } else if (op.type === 'ADD' || op.type === 'SET_QTY') {
      const requested = parseInt(op.quantity, 10) || 1;
      const next = op.type === 'ADD'
        ? (line ? line.quantity : 0) + requested
        : requested;
      const quantity = Math.max(1, Math.min(MAX_QTY_PER_LINE, next));

      if (line) {
        line.quantity = quantity;
        line.lineRev = (line.lineRev || 1) + 1;
      } else {
        byKey.set(key, {
          product: op.product,
          variantKey: op.variantKey || '',
          quantity,
          lineRev: 1,
          // Placeholder snapshot; replaced from Product below before save.
          name: '',
          condition: '',
          price: 0,
          image: '',
        });
      }
    }
  }

  // Re-assert the snapshot and stock clamp from Product for every touched
  // line, so an ADD cannot introduce a client-controlled price.
  const touched = [...byKey.values()];
  const ids = [...new Set(touched.map((i) => String(i.product)))];
  const products = await Product.find({ _id: { $in: ids } }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const warnings = [];
  const nextItems = [];
  for (const line of touched) {
    const product = byId.get(String(line.product));
    if (!product) {
      warnings.push({ product: String(line.product), reason: 'PRODUCT_UNAVAILABLE' });
      continue;
    }
    if (product.status !== 'Active') {
      warnings.push({ product: String(line.product), name: product.name, reason: 'PRODUCT_INACTIVE' });
      continue;
    }
    if (product.stock <= 0) {
      warnings.push({ product: String(line.product), name: product.name, reason: 'OUT_OF_STOCK' });
      continue;
    }
    let quantity = line.quantity;
    if (quantity > product.stock) {
      warnings.push({
        product: String(line.product), name: product.name,
        reason: 'STOCK_CLAMPED', requested: quantity, available: product.stock,
      });
      quantity = product.stock;
    }
    nextItems.push({
      product: product._id,
      variantKey: line.variantKey || '',
      name: product.name,
      condition: product.condition,
      category: product.category || '',
      price: product.price,
      image: product.image || '',
      quantity,
      lineRev: line.lineRev || 1,
    });
  }

  cart.items = nextItems.slice(0, MAX_LINES);
  cart.rev += 1;
  recordBatch(cart, batchId);
  await cart.save();

  return { status: 'applied', cart: await hydrate(cart), warnings };
}

module.exports = {
  mergeCart,
  applyOps,
  hydrate,
  getOrCreateCart,
  lineKey,
  isObjectId,
  alreadyApplied,
  recordBatch,
  MAX_LINES,
  MAX_QTY_PER_LINE,
};
