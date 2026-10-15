const request = require('supertest');
const app = require('../app');
const Product = require('../models/Product');
const Order = require('../models/Order');

describe('Order numbers', () => {
  let product;

  beforeEach(async () => {
    product = await Product.create({
      name: 'Phone',
      description: 'Desc',
      category: 'Smartphones',
      price: 500,
      condition: 'New',
      stock: 10,
      status: 'Active',
    });
  });

  afterEach(async () => {
    await Order.deleteMany({});
  });

  const createOrder = () =>
    request(app)
      .post('/api/v1/orders')
      .send({
        items: [{ product: product._id, quantity: 1 }],
        customer: { name: 'Buyer', email: 'buyer@test.com', phone: '1234567890' },
        paymentMethod: 'Cash',
      });

  it('assigns a short TR-prefixed order number on creation', async () => {
    const res = await createOrder();
    expect(res.statusCode).toEqual(201);
    expect(res.body.data.orderNumber).toMatch(/^TR-\d{6}$/);
  });

  it('assigns a unique order number to each order', async () => {
    const first = await createOrder();
    const second = await createOrder();
    expect(first.body.data.orderNumber).not.toEqual(second.body.data.orderNumber);
  });

  it('persists the order number on the document', async () => {
    const res = await createOrder();
    const doc = await Order.findById(res.body.data._id);
    expect(doc.orderNumber).toBe(res.body.data.orderNumber);
  });

  it('tracks an order by its order number', async () => {
    const created = await createOrder();
    const orderNumber = created.body.data.orderNumber;

    const res = await request(app)
      .get(`/api/v1/orders/track?orderId=${encodeURIComponent(orderNumber)}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.orderNumber).toEqual(orderNumber);
    expect(res.body.data._id).toEqual(created.body.data._id);
  });

  it('still tracks an order by its ObjectId', async () => {
    const created = await createOrder();
    const res = await request(app)
      .get(`/api/v1/orders/track?orderId=${created.body.data._id}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.orderNumber).toBe(created.body.data.orderNumber);
  });

  it('does not resolve an unknown order number', async () => {
    const res = await request(app)
      .get('/api/v1/orders/track?orderId=TR-999999');
    expect(res.statusCode).toEqual(404);
  });
});
