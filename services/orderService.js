const Order = require('../models/Order');
const Product = require('../models/Product');

const ORDER_NUMBER_PREFIX = 'TR-';
const ORDER_NUMBER_PAD = 6;

/**
 * Returns the next value from a named, atomic server-side counter.
 *
 * Uses the driver's native `counters` collection with an upserting
 * `$inc`, which is atomic in MongoDB, so two concurrent orders can
 * never be assigned the same sequence number. The counter document
 * is created on first use, so no migration or seed is required.
 */
const getNextSequence = async (name) => {
  const counters = Order.db.collection('counters');
  const result = await counters.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return result.seq;
};

/**
 * Builds a short, customer-facing order number such as `TR-000123`.
 * Retries once if the generated number ever collides with an existing
 * order (possible only if the unique index was rebuilt or seeded).
 */
const generateOrderNumber = async () => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const seq = await getNextSequence('orderNumber');
    const candidate = `${ORDER_NUMBER_PREFIX}${String(seq).padStart(ORDER_NUMBER_PAD, '0')}`;
    const exists = await Order.findOne({ orderNumber: candidate }, { _id: 1 }).lean();
    if (!exists) return candidate;
  }
  // Practically unreachable: fall back to a timestamp-suffixed number.
  return `${ORDER_NUMBER_PREFIX}${Date.now().toString(36).toUpperCase()}`;
};

// Rolls back stock reservations for a list of product/quantity pairs.
// Used when order creation fails partway through to prevent stock from being permanently deducted.
const rollbackStock = async (reserved) => {
  for (const r of reserved) {
    try {
      await Product.findByIdAndUpdate(r.id, { $inc: { stock: r.quantity } });
    } catch (rollbackError) {
      console.error('Stock rollback failed:', rollbackError);
    }
  }
};

// Creates an order with atomic stock deduction.
// Each item's stock is decremented using findOneAndUpdate with a $gte condition
// to ensure we never sell more than is available. If any item is out of stock,
// all previous deductions are rolled back and the order is not created.
// Also clears the user's cart after a successful order.
const createOrder = async (orderData) => {
  const reservedStock = [];
  const validatedItems = [];
  let computedTotal = 0;
  let discount = orderData.discount || 0;

  for (const item of orderData.items) {
    const product = await Product.findById(item.product);
    if (!product) {
      await rollbackStock(reservedStock);
      throw new Error(`Product ${item.product} not found`);
    }

    const updatedProduct = await Product.findOneAndUpdate(
      { _id: product._id, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity } },
      { new: true }
    );

    if (!updatedProduct) {
      await rollbackStock(reservedStock);
      throw new Error(`Insufficient stock for ${product.name}`);
    }

    reservedStock.push({ id: product._id, quantity: item.quantity });

    validatedItems.push({
      product: product._id,
      name: product.name,
      condition: product.condition,
      price: product.price,
      quantity: item.quantity,
    });
    computedTotal += product.price * item.quantity;
  }

  const shippingCost = computeShippingCost(computedTotal, orderData.customer);
  const finalTotal = Math.max(0, computedTotal - discount + shippingCost);

  const order = await Order.create({
    orderNumber: await generateOrderNumber(),
    items: validatedItems,
    customer: orderData.customer,
    userId: orderData.userId,
    totalAmount: finalTotal,
    paymentMethod: orderData.paymentMethod,
    status: 'Pending',
    paymentStatus: 'Pending',
    notes: orderData.notes,
    coupon: orderData.coupon || undefined,
  });

  if (orderData.userId) {
    const Cart = require('../models/Cart');
    await Cart.findOneAndUpdate(
      { user: orderData.userId },
      { $set: { items: [] } }
    );
  }

  return order;
};

// Retrieves a paginated list of orders matching the query.
// Populates the product reference inside each order item for display.
const getOrders = async (query = {}, page = 1, limit = 20) => {
  const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;
  const [orders, total] = await Promise.all([
    Order.find(query).populate('items.product').sort({ createdAt: -1 }).skip(skip).limit(limit),
    Order.countDocuments(query),
  ]);
  return { orders, total };
};

// Finds a single order by ID with populated product references.
const FREE_SHIPPING_THRESHOLD = 500;
const SHIPPING_FEE = 50;
const FREE_SHIPPING_CITIES = ['haenerstburg'];

const computeShippingCost = (subtotal, customer) => {
  if (subtotal >= FREE_SHIPPING_THRESHOLD || subtotal === 0) return 0;
  if (customer?.address?.city && FREE_SHIPPING_CITIES.includes(customer.address.city.toLowerCase())) return 0;
  return SHIPPING_FEE;
};

const getOrderById = async (id) => {
  return Order.findById(id).populate('items.product');
};

// Updates an order by ID. Returns the updated document with populated references.
const updateOrder = async (id, updateData) => {
  return Order.findByIdAndUpdate(id, updateData, { new: true }).populate('items.product');
};

// Permanently deletes an order by ID.
const deleteOrder = async (id) => {
  return Order.findByIdAndDelete(id);
};

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  updateOrder,
  deleteOrder,
  rollbackStock,
};
