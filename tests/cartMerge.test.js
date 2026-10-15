const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const Wishlist = require('../models/Wishlist');

// `authenticate` reads the token from the `authToken` cookie, not from an
// `Authorization` header, so tests authenticate through a real login.
const login = async (email, password = 'password123') => {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  return res.headers['set-cookie'][0].split(';')[0];
};

/**
 * Cart merge / sync contract tests.
 *
 * The properties under test are the ones the whole design rests on:
 *   - merges are IDEMPOTENT   (a replayed batch changes nothing)
 *   - merges are COMMUTATIVE  (line order is irrelevant)
 *   - the server is AUTHORITATIVE for price/name/stock
 *   - line identity is (product, variantKey)
 *
 * The idempotency test is a regression test for a real bug: the previous
 * client re-`add`ed every local line after each reload, and `POST /cart`
 * incremented quantities, so a cart inflated on every page refresh.
 */

const makeProduct = (overrides = {}) =>
  Product.create({
    name: 'Test Product',
    description: 'A product used in merge tests',
    category: 'Smartphones',
    price: 100,
    condition: 'New',
    stock: 10,
    status: 'Active',
    ...overrides,
  });

const seedCart = async (userId, items) => {
  const cart = await Cart.create({ user: userId, items });
  return cart;
};

describe('Cart merge', () => {
  let user;
  let cookie;
  let p1;
  let p2;

  beforeEach(async () => {
    user = await User.create({
      firstName: 'Cart',
      lastName: 'Tester',
      email: `cart-${Date.now()}@test.com`,
      password: 'password123',
      phone: '1234567890',
      role: 'customer',
      emailVerified: true,
    });
    cookie = await login(user.email);
    p1 = await makeProduct({ name: 'Alpha', price: 100, stock: 10 });
    p2 = await makeProduct({ name: 'Beta', price: 50, stock: 4 });
  });

  afterEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Product.deleteMany({}),
      Cart.deleteMany({}),
      Wishlist.deleteMany({}),
    ]);
  });

  const merge = (body) =>
    request(app)
      .post('/api/v1/cart/merge')
      .set('Cookie', cookie)
      .send(body);

  describe('authentication', () => {
    it('requires auth', async () => {
      const res = await request(app).post('/api/v1/cart/merge').send({ lines: [], clientBatchId: 'abcdefgh' });
      expect(res.statusCode).toBe(401);
    });

    it('requires a clientBatchId', async () => {
      const res = await merge({ lines: [] });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('idempotency', () => {
    it('is a no-op when the same clientBatchId is replayed', async () => {
      const first = await merge({
        lines: [{ product: String(p1._id), quantity: 2 }],
        clientBatchId: 'batch-replay-1',
      });
      expect(first.statusCode).toBe(200);
      expect(first.body.data).toHaveLength(1);
      expect(first.body.data[0].quantity).toBe(2);

      const replay = await merge({
        lines: [{ product: String(p1._id), quantity: 2 }],
        clientBatchId: 'batch-replay-1',
      });
      expect(replay.statusCode).toBe(200);
      // The bug: this used to be 4.
      expect(replay.body.data[0].quantity).toBe(2);
      expect(replay.body.replayed).toBe(true);
    });

    it('does not inflate quantities across repeated reloads', async () => {
      // Simulate the client re-sending the same guest cart on every reload.
      for (let i = 0; i < 3; i += 1) {
        const res = await merge({
          lines: [{ product: String(p1._id), quantity: 2 }],
          clientBatchId: 'stable-batch-id',
        });
        expect(res.statusCode).toBe(200);
      }

      const cart = await Cart.findOne({ user: user._id });
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].quantity).toBe(2);
    });

    it('sums quantities across distinct batches', async () => {
      await merge({ lines: [{ product: String(p1._id), quantity: 2 }], clientBatchId: 'batch-one' });
      const second = await merge({ lines: [{ product: String(p1._id), quantity: 3 }], clientBatchId: 'batch-two' });
      expect(second.body.data[0].quantity).toBe(5);
    });
  });

  describe('commutativity', () => {
    it('produces the same result regardless of line order', async () => {
      const orderA = await merge({
        lines: [
          { product: String(p1._id), quantity: 1 },
          { product: String(p2._id), quantity: 2 },
        ],
        clientBatchId: 'commutativity-order-a',
      });

      // Fresh user so the second merge is not blocked by the batch ledger.
      const user2 = await User.create({
        firstName: 'Two', lastName: 'Tester', email: `c2-${Date.now()}@test.com`,
        password: 'password123', phone: '099', role: 'customer', emailVerified: true,
      });
      const cookie2 = await login(user2.email);

      const orderB = await request(app)
        .post('/api/v1/cart/merge')
        .set('Cookie', cookie2)
        .send({
          lines: [
            { product: String(p2._id), quantity: 2 },
            { product: String(p1._id), quantity: 1 },
          ],
          clientBatchId: 'commutativity-order-b',
        });

      const normalise = (items) =>
        items.map((i) => `${i.product}:${i.quantity}`).sort().join(',');

      expect(normalise(orderB.body.data)).toBe(normalise(orderA.body.data));
    });
  });

  describe('server authority', () => {
    it('ignores a client-supplied price', async () => {
      const res = await merge({
        lines: [{ product: String(p1._id), quantity: 1, price: 0.01, name: 'Free Stuff' }],
        clientBatchId: 'price-attack',
      });

      expect(res.body.data[0].price).toBe(100);
      expect(res.body.data[0].name).toBe('Alpha');
      expect(res.body.subtotal).toBe(100);
    });

    it('ignores client-supplied name and image', async () => {
      const res = await merge({
        lines: [{ product: String(p1._id), quantity: 1, name: 'Hacked', image: 'http://evil/x.png' }],
        clientBatchId: 'name-attack',
      });
      expect(res.body.data[0].name).toBe('Alpha');
    });
  });

  describe('stock clamping', () => {
    it('clamps to live stock and reports the clamp', async () => {
      // p2 has stock 4; ask for 10.
      const res = await merge({
        lines: [{ product: String(p2._id), quantity: 10 }],
        clientBatchId: 'stock-clamped-batch-1',
      });

      expect(res.body.data[0].quantity).toBe(4);
      const warning = res.body.warnings.find((w) => w.reason === 'STOCK_CLAMPED');
      expect(warning).toBeDefined();
      expect(warning.requested).toBe(10);
      expect(warning.available).toBe(4);
    });

    it('drops out-of-stock products and reports them', async () => {
      await Product.updateOne({ _id: p2._id }, { stock: 0 });
      const res = await merge({
        lines: [{ product: String(p2._id), quantity: 1 }],
        clientBatchId: 'out-of-stock-batch-1',
      });

      expect(res.body.data.find((i) => i.product === String(p2._id))).toBeUndefined();
      expect(res.body.warnings.some((w) => w.reason === 'OUT_OF_STOCK')).toBe(true);
    });

    it('drops unknown product ids without failing the whole merge', async () => {
      const res = await merge({
        lines: [
          { product: 'ffffffffffffffffffffffff', quantity: 1 },
          { product: String(p1._id), quantity: 1 },
        ],
        clientBatchId: 'partial-1',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].product).toBe(String(p1._id));
      expect(res.body.warnings.some((w) => w.reason === 'PRODUCT_UNAVAILABLE')).toBe(true);
    });
  });

  describe('line identity', () => {
    it('keeps two variants of one product as separate lines', async () => {
      const res = await merge({
        lines: [
          { product: String(p1._id), variantKey: 'black-256', quantity: 1 },
          { product: String(p1._id), variantKey: 'silver-512', quantity: 1 },
        ],
        clientBatchId: 'variants-1',
      });

      expect(res.body.data).toHaveLength(2);
    });

    it('sums quantities within the same variant key', async () => {
      await merge({
        lines: [{ product: String(p1._id), variantKey: 'black-256', quantity: 1 }],
        clientBatchId: 'variant-batch-a',
      });
      const res = await merge({
        lines: [{ product: String(p1._id), variantKey: 'black-256', quantity: 2 }],
        clientBatchId: 'variant-batch-b',
      });

      const lines = res.body.data.filter((i) => i.variantKey === 'black-256');
      expect(lines).toHaveLength(1);
      expect(lines[0].quantity).toBe(3);
    });
  });

  describe('guest -> account merge', () => {
    it('unions a guest line with an existing server line', async () => {
      await seedCart(user._id, [{
        product: p1._id, name: 'Alpha', condition: 'New', price: 100, quantity: 2, image: '',
      }]);

      const res = await merge({
        lines: [{ product: String(p1._id), quantity: 3 }],
        clientBatchId: 'guest-merge-1',
      });

      const line = res.body.data.find((i) => i.product === String(p1._id));
      expect(line.quantity).toBe(5);
      expect(res.body.data).toHaveLength(1);
    });
  });
});

describe('Cart mutate (optimistic concurrency)', () => {
  let user;
  let cookie;
  let p1;

  beforeEach(async () => {
    user = await User.create({
      firstName: 'Mut', lastName: 'Tester', email: `mut-${Date.now()}@test.com`,
      password: 'password123', phone: '123', role: 'customer', emailVerified: true,
    });
    cookie = await login(user.email);
    p1 = await makeProduct({ name: 'Widget', price: 200, stock: 10 });
    await Cart.create({ user: user._id, items: [] });
  });

  afterEach(async () => {
    await Promise.all([User.deleteMany({}), Product.deleteMany({}), Cart.deleteMany({})]);
  });

  const mutate = (body) =>
    request(app)
      .post('/api/v1/cart/mutate')
      .set('Cookie', cookie)
      .send(body);

  it('applies an ADD and bumps rev', async () => {
    const res = await mutate({
      ops: [{ type: 'ADD', product: String(p1._id), quantity: 2 }],
      baseRev: 0,
      clientBatchId: 'mut-add-1',
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].quantity).toBe(2);
    expect(res.body.rev).toBe(1);
  });

  it('returns 409 with authoritative state on a stale baseRev', async () => {
    await mutate({
      ops: [{ type: 'ADD', product: String(p1._id), quantity: 1 }],
      baseRev: 0,
      clientBatchId: 'mut-first',
    });

    const stale = await mutate({
      ops: [{ type: 'ADD', product: String(p1._id), quantity: 1 }],
      baseRev: 0, // now outdated
      clientBatchId: 'mut-stale',
    });

    expect(stale.statusCode).toBe(409);
    expect(stale.body.code).toBe('STALE_REV');
    expect(stale.body.rev).toBe(1);
    expect(stale.body.data).toHaveLength(1);
  });

  it('succeeds when the client re-applies with the fresh rev', async () => {
    await mutate({
      ops: [{ type: 'ADD', product: String(p1._id), quantity: 1 }],
      baseRev: 0,
      clientBatchId: 'mut-reapply-first',
    });

    const retry = await mutate({
      ops: [{ type: 'ADD', product: String(p1._id), quantity: 1 }],
      baseRev: 1,
      clientBatchId: 'mut-reapply-retry',
    });

    expect(retry.statusCode).toBe(200);
    expect(retry.body.data[0].quantity).toBe(2);
  });

  it('is idempotent for a replayed batch id', async () => {
    const body = {
      ops: [{ type: 'ADD', product: String(p1._id), quantity: 3 }],
      baseRev: 0,
      clientBatchId: 'mut-idem',
    };

    const first = await mutate(body);
    const replay = await mutate(body);

    expect(replay.body.data[0].quantity).toBe(3);
    expect(replay.body.replayed).toBe(true);
    expect(replay.body.rev).toBe(first.body.rev);
  });

  it('applies SET_QTY, REMOVE and CLEAR', async () => {
    await mutate({
      ops: [{ type: 'ADD', product: String(p1._id), quantity: 1 }],
      baseRev: 0, clientBatchId: 'ops-sequence-add',
    });
    const setQty = await mutate({
      ops: [{ type: 'SET_QTY', product: String(p1._id), quantity: 7 }],
      baseRev: 1, clientBatchId: 'ops-sequence-setqty',
    });
    expect(setQty.body.data[0].quantity).toBe(7);

    const removed = await mutate({
      ops: [{ type: 'REMOVE', product: String(p1._id) }],
      baseRev: 2, clientBatchId: 'ops-sequence-remove',
    });
    expect(removed.body.data).toHaveLength(0);

    await mutate({ ops: [{ type: 'ADD', product: String(p1._id), quantity: 1 }], baseRev: 3, clientBatchId: 'ops-sequence-readd' });
    const cleared = await mutate({ ops: [{ type: 'CLEAR' }], baseRev: 4, clientBatchId: 'ops-sequence-clear' });
    expect(cleared.body.data).toHaveLength(0);
  });
});

describe('Wishlist merge', () => {
  let user;
  let cookie;
  let p1;
  let p2;

  beforeEach(async () => {
    user = await User.create({
      firstName: 'Wish', lastName: 'Tester', email: `wish-${Date.now()}@test.com`,
      password: 'password123', phone: '123', role: 'customer', emailVerified: true,
    });
    cookie = await login(user.email);
    p1 = await makeProduct({ name: 'Wish A' });
    p2 = await makeProduct({ name: 'Wish B' });
    await Wishlist.create({ user: user._id, products: [] });
  });

  afterEach(async () => {
    await Promise.all([User.deleteMany({}), Product.deleteMany({}), Wishlist.deleteMany({})]);
  });

  const merge = (body) =>
    request(app)
      .post('/api/v1/wishlist/merge')
      .set('Cookie', cookie)
      .send(body);

  it('unions guest products into the account wishlist', async () => {
    const res = await merge({ productIds: [String(p1._id), String(p2._id)], clientBatchId: 'w-merge-1' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('is idempotent on replay', async () => {
    const body = { productIds: [String(p1._id)], clientBatchId: 'wishlist-idem-batch' };
    await merge(body);
    const replay = await merge(body);

    expect(replay.body.data).toHaveLength(1);
    expect(replay.body.replayed).toBe(true);
  });

  it('never produces duplicates', async () => {
    await Wishlist.findOneAndUpdate(
      { user: user._id },
      { products: [p1._id] },
      { new: true }
    );
    const res = await merge({ productIds: [String(p1._id)], clientBatchId: 'w-dedupe' });

    const ids = res.body.data.map((p) => String(p._id || p));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('drops inactive products and reports them', async () => {
    await Product.updateOne({ _id: p2._id }, { status: 'Inactive' });
    const res = await merge({ productIds: [String(p1._id), String(p2._id)], clientBatchId: 'w-inactive' });

    expect(res.body.data).toHaveLength(1);
    expect(res.body.warnings.some((w) => w.reason === 'PRODUCT_UNAVAILABLE')).toBe(true);
  });
});
