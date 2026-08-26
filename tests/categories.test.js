const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const Category = require('../models/Category');

const { createToken } = require('./helpers/createToken');

describe('Categories', () => {
  let adminAuthToken;
  let categoryId;

  beforeEach(async () => {
    const admin = await User.create({
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@test.com',
      password: 'password123',
      phone: '1234567890',
      role: 'admin',
    });
    adminAuthToken = await createToken(admin._id);

    const category = await Category.create({
      name: 'Test Category',
      slug: 'test-category',
      status: 'Active',
    });
    categoryId = category._id;
  });

  afterEach(async () => {
    await User.deleteMany({});
    await Category.deleteMany({});
  });

  describe('GET /api/v1/categories/active', () => {
    it('should get all active categories', async () => {
      const res = await request(app).get('/api/v1/categories/active');
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should not return inactive categories', async () => {
      await Category.create({ name: 'Hidden', slug: 'hidden', status: 'Inactive' });
      const res = await request(app).get('/api/v1/categories/active');
      expect(res.statusCode).toEqual(200);
      expect(res.body.data.every((c) => c.status === 'Active')).toBe(true);
    });
  });

  describe('GET /api/v1/categories (admin)', () => {
    it('should require admin auth', async () => {
      const res = await request(app).get('/api/v1/categories');
      expect(res.statusCode).toEqual(401);
    });

    it('should get all categories as admin', async () => {
      const res = await request(app)
        .get('/api/v1/categories')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/categories/:id (admin)', () => {
    it('should get category by id', async () => {
      const res = await request(app)
        .get(`/api/v1/categories/${categoryId}`)
        .set('Cookie', `adminAuthToken=${adminAuthToken}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body.data.name).toBe('Test Category');
    });

    it('should return 404 for invalid id', async () => {
      const res = await request(app)
        .get('/api/v1/categories/60d5ec9af6820b7e3c4b4567')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`);
      expect(res.statusCode).toEqual(404);
    });
  });

  describe('POST /api/v1/categories (admin)', () => {
    it('should create category as admin', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`)
        .send({ name: 'New Category', slug: 'new-category' });
      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('New Category');
    });

    it('should fail without auth', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .send({ name: 'New Category' });
      expect(res.statusCode).toEqual(401);
    });

    it('should fail validation', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`)
        .send({ name: '' });
      expect(res.statusCode).toEqual(400);
    });
  });

  describe('PUT /api/v1/categories/:id (admin)', () => {
    it('should update category as admin', async () => {
      const res = await request(app)
        .put(`/api/v1/categories/${categoryId}`)
        .set('Cookie', `adminAuthToken=${adminAuthToken}`)
        .send({ name: 'Updated Category', status: 'Inactive' });
      expect(res.statusCode).toEqual(200);
      expect(res.body.data.name).toBe('Updated Category');
      expect(res.body.data.status).toBe('Inactive');
    });

    it('should return 404 for non-existent id', async () => {
      const res = await request(app)
        .put('/api/v1/categories/60d5ec9af6820b7e3c4b4567')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`)
        .send({ name: 'Updated' });
      expect(res.statusCode).toEqual(404);
    });
  });

  describe('DELETE /api/v1/categories/:id (admin)', () => {
    it('should delete category as admin', async () => {
      const res = await request(app)
        .delete(`/api/v1/categories/${categoryId}`)
        .set('Cookie', `adminAuthToken=${adminAuthToken}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent id', async () => {
      const res = await request(app)
        .delete('/api/v1/categories/60d5ec9af6820b7e3c4b4567')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`);
      expect(res.statusCode).toEqual(404);
    });
  });
});
