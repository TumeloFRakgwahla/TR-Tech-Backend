const request = require('supertest');
const app = require('../app');
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');

const generateToken = (id) => {
  const jwt = require('jsonwebtoken');
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

describe('Products', () => {
  let adminToken;
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
    adminToken = generateToken(admin._id);

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
  });

  describe('GET /api/products', () => {
    it('should get all products', async () => {
      const res = await request(app).get('/api/products');
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should filter products by category', async () => {
      const res = await request(app).get('/api/products?category=Smartphones');
      expect(res.statusCode).toEqual(200);
      expect(res.body.data.every((p) => p.category === 'Smartphones')).toBe(true);
    });

    it('should paginate products', async () => {
      const res = await request(app).get('/api/products?page=1&limit=1');
      expect(res.statusCode).toEqual(200);
      expect(res.body.count).toBe(1);
    });
  });

  describe('GET /api/products/:id', () => {
    it('should get product by id', async () => {
      const res = await request(app).get(`/api/products/${productId}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body.data.name).toBe('Test Product');
    });

    it('should return 404 for invalid id', async () => {
      const res = await request(app).get('/api/products/60d5ec9af6820b7e3c4b4567');
      expect(res.statusCode).toEqual(404);
    });
  });

  describe('POST /api/products', () => {
    it('should create product as admin', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Cookie', `authToken=${adminToken}`)
        .send({
          name: 'New Product',
          description: 'New description',
          category: 'Laptops',
          price: 1999,
          condition: 'New',
          stock: 5,
          status: 'Active',
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('New Product');
    });

    it('should fail without auth', async () => {
      const res = await request(app)
        .post('/api/products')
        .send({
          name: 'No Auth Product',
          description: 'Desc',
          category: 'Laptops',
          price: 1000,
          condition: 'New',
          stock: 5,
          status: 'Active',
        });

      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
    });

    it('should fail validation', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Cookie', `authToken=${adminToken}`)
        .send({
          name: '',
          description: 'Desc',
          category: 'Laptops',
          price: -100,
          condition: 'New',
          stock: 5,
          status: 'Active',
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/products/:id', () => {
    it('should update product as admin', async () => {
      const res = await request(app)
        .put(`/api/products/${productId}`)
        .set('Cookie', `authToken=${adminToken}`)
        .send({
          name: 'Test Product',
          description: 'Test description',
          category: 'Smartphones',
          price: 1200,
          condition: 'New',
          stock: 10,
          status: 'Active',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.price).toBe(1200);
    });
  });

  describe('DELETE /api/products/:id', () => {
    it('should delete product as admin', async () => {
      const res = await request(app)
        .delete(`/api/products/${productId}`)
        .set('Cookie', `authToken=${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
    });
  });
});
