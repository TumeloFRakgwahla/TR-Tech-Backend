const request = require('supertest');
const app = require('../app');
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');

const { createToken } = require('./helpers/createToken');
const generateToken = createToken;

describe('Products', () => {
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
      brand: 'Other',
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

  describe('GET /api/v1/products', () => {
    it('should get all products', async () => {
      const res = await request(app).get('/api/v1/products');
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should filter products by category', async () => {
      const res = await request(app).get('/api/v1/products?category=Smartphones');
      expect(res.statusCode).toEqual(200);
      expect(res.body.data.every((p) => p.category === 'Smartphones')).toBe(true);
    });

    it('should paginate products', async () => {
      const res = await request(app).get('/api/v1/products?page=1&limit=1');
      expect(res.statusCode).toEqual(200);
      expect(res.body.count).toBe(1);
    });
  });

  describe('GET /api/v1/products/:id', () => {
    it('should get product by id', async () => {
      const res = await request(app).get(`/api/v1/products/${productId}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body.data.name).toBe('Test Product');
    });

    it('should return 404 for invalid id', async () => {
      const res = await request(app).get('/api/v1/products/60d5ec9af6820b7e3c4b4567');
      expect(res.statusCode).toEqual(404);
    });
  });

  describe('POST /api/v1/products', () => {
    it('should create product as admin', async () => {
      const res = await request(app)
        .post('/api/v1/products')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`)
        .send({
          name: 'New Product',
          description: 'New description',
          category: 'Laptops',
          brand: 'Other',
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
        .post('/api/v1/products')
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
        .post('/api/v1/products')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`)
        .send({
          name: '',
          description: 'Desc',
          category: 'Laptops',
          brand: 'Other',
          price: -100,
          condition: 'New',
          stock: 5,
          status: 'Active',
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/v1/products/:id', () => {
    it('should update product as admin', async () => {
      const res = await request(app)
        .put(`/api/v1/products/${productId}`)
        .set('Cookie', `adminAuthToken=${adminAuthToken}`)
        .send({
          name: 'Test Product',
          description: 'Test description',
          category: 'Smartphones',
          brand: 'Other',
          price: 1200,
          condition: 'New',
          stock: 10,
          status: 'Active',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.price).toBe(1200);
    });
  });

  describe('DELETE /api/v1/products/:id', () => {
    it('should delete product as admin', async () => {
      const res = await request(app)
        .delete(`/api/v1/products/${productId}`)
        .set('Cookie', `adminAuthToken=${adminAuthToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
    });
  });
});
