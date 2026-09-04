const request = require('supertest');
const app = require('../app');
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');

const { createToken } = require('./helpers/createToken');
const generateToken = createToken;

describe('Orders', () => {
  let adminAuthToken;
  let productId;

  beforeEach(async () => {
    const admin = await User.create({
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@test.com',
      password: 'password123',
      phone: '1234567890',
      role: 'admin',
    });
    adminAuthToken = await generateToken(admin._id);

    const product = await Product.create({
      name: 'Test Product',
      description: 'Test description',
      category: 'Smartphones',
      price: 999,
      condition: 'New',
      stock: 10,
      status: 'Active',
    });
    productId = product._id;
  });

  afterEach(async () => {
    await User.deleteMany({});
    await Product.deleteMany({});
    await Order.deleteMany({});
  });

  describe('GET /api/v1/orders/stats', () => {
    it('should return stats as admin', async () => {
      await Order.create({
        items: [{ product: productId, name: 'Test', condition: 'New', price: 999, quantity: 2 }],
        customer: { name: 'John Doe', email: 'john@test.com', phone: '1234567890' },
        totalAmount: 1998,
        status: 'Pending',
        paymentStatus: 'Paid',
      });

      const res = await request(app)
        .get('/api/v1/orders/stats')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalOrders).toBeGreaterThanOrEqual(1);
      expect(typeof res.body.data.revenueChange).toBe('number');
    });

    it('should fail without auth', async () => {
      const res = await request(app).get('/api/v1/orders/stats');
      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/orders', () => {
    beforeEach(async () => {
      await Order.create({
        items: [{ product: productId, name: 'Test', condition: 'New', price: 999, quantity: 1 }],
        customer: { name: 'Jane Doe', email: 'jane@test.com', phone: '1234567890' },
        totalAmount: 999,
        status: 'Pending',
        paymentStatus: 'Pending',
      });
    });

    it('should list orders as admin', async () => {
      const res = await request(app)
        .get('/api/v1/orders')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter orders by status', async () => {
      const res = await request(app)
        .get('/api/v1/orders?status=Pending')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.every((o) => o.status === 'Pending')).toBe(true);
    });
  });

  describe('GET /api/v1/orders/:id', () => {
    it('should get order by id', async () => {
      const order = await Order.create({
        items: [{ product: productId, name: 'Test', condition: 'New', price: 999, quantity: 1 }],
        customer: { name: 'Update', email: 'update@test.com', phone: '1234567890' },
        totalAmount: 999,
        status: 'Pending',
        paymentStatus: 'Pending',
      });

      const res = await request(app)
        .get(`/api/v1/orders/${order._id}`)
        .set('Cookie', `adminAuthToken=${adminAuthToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data._id).toEqual(order._id.toString());
    });

    it('should return 404 for invalid id', async () => {
      const res = await request(app)
        .get('/api/v1/orders/60d5ec9af6820b7e3c4b4567')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`);

      expect(res.statusCode).toEqual(404);
    });
  });

  describe('POST /api/v1/orders', () => {
    it('should create order and reduce stock', async () => {
      const product = await Product.create({
        name: 'Stock Product',
        description: 'Desc',
        category: 'Smartphones',
        price: 500,
        condition: 'New',
        stock: 5,
        status: 'Active',
      });

      const res = await request(app)
        .post('/api/v1/orders')
        .send({
          items: [{ product: product._id, quantity: 2 }],
          customer: { name: 'Buyer', email: 'buyer@test.com', phone: '1234567890' },
          totalAmount: 1000,
          paymentMethod: 'Cash',
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);

      const updatedProduct = await Product.findById(product._id);
      expect(updatedProduct.stock).toBe(3);
    });

    it('should fail with insufficient stock', async () => {
      const product = await Product.create({
        name: 'Low Stock',
        description: 'Desc',
        category: 'Smartphones',
        price: 500,
        condition: 'New',
        stock: 1,
        status: 'Active',
      });

      const res = await request(app)
        .post('/api/v1/orders')
        .send({
          items: [{ product: product._id, quantity: 5 }],
          customer: { name: 'Buyer', email: 'buyer2@test.com', phone: '1234567890' },
          totalAmount: 2500,
          paymentMethod: 'Cash',
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
    });

    it('should fail validation', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .send({
          items: [],
          customer: { name: '', email: 'invalid', phone: '' },
          totalAmount: -100,
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/v1/orders/:id', () => {
    it('should update order as admin', async () => {
      const order = await Order.create({
        items: [{ product: productId, name: 'Test', condition: 'New', price: 999, quantity: 1 }],
        customer: { name: 'Update', email: 'update@test.com', phone: '1234567890' },
        totalAmount: 999,
        status: 'Pending',
        paymentStatus: 'Pending',
      });

      const res = await request(app)
        .put(`/api/v1/orders/${order._id}`)
        .set('Cookie', `adminAuthToken=${adminAuthToken}`)
        .send({ status: 'Completed' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.status).toBe('Completed');
    });
  });

  describe('DELETE /api/v1/orders/:id', () => {
    it('should delete order as admin', async () => {
      const order = await Order.create({
        items: [{ product: productId, name: 'Test', condition: 'New', price: 999, quantity: 1 }],
        customer: { name: 'Delete', email: 'delete@test.com', phone: '1234567890' },
        totalAmount: 999,
        status: 'Pending',
        paymentStatus: 'Pending',
      });

      const res = await request(app)
        .delete(`/api/v1/orders/${order._id}`)
        .set('Cookie', `adminAuthToken=${adminAuthToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/orders/track', () => {
    it('should track order by ID', async () => {
      const order = await Order.create({
        items: [{ product: productId, name: 'Test', condition: 'New', price: 999, quantity: 1 }],
        customer: { name: 'Jane Doe', email: 'jane@test.com', phone: '1234567890' },
        totalAmount: 999,
        status: 'Pending',
        paymentStatus: 'Pending',
      });

      const res = await request(app)
        .get('/api/v1/orders/track')
        .query({ orderId: order._id.toString() });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data._id).toBe(order._id.toString());
    });

    it('should return 400 for invalid order ID format', async () => {
      const res = await request(app)
        .get('/api/v1/orders/track')
        .query({ orderId: 'invalid-id' });

      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid order ID format');
    });

    it('should return 404 for non-existent order', async () => {
      const res = await request(app)
        .get('/api/v1/orders/track')
        .query({ orderId: '507f1f77bcf86cd799439011' });

      expect(res.statusCode).toEqual(404);
    });
  });
});
