const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const Brand = require('../models/Brand');

const { createToken } = require('./helpers/createToken');

describe('Brands', () => {
  let adminAuthToken;
  let brandId;

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

    const brand = await Brand.create({
      name: 'Test Brand',
      slug: 'test-brand',
      status: 'Active',
      logo: '/uploads/test.png',
    });
    brandId = brand._id;
  });

  afterEach(async () => {
    await User.deleteMany({});
    await Brand.deleteMany({});
  });

  describe('GET /api/v1/brands/active', () => {
    it('should get all active brands', async () => {
      const res = await request(app).get('/api/v1/brands/active');
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should not return inactive brands', async () => {
      await Brand.create({ name: 'Hidden Brand', slug: 'hidden-brand', status: 'Inactive' });
      const res = await request(app).get('/api/v1/brands/active');
      expect(res.statusCode).toEqual(200);
      expect(res.body.data.every((b) => b.status === 'Active')).toBe(true);
    });
  });

  describe('GET /api/v1/brands (admin)', () => {
    it('should require admin auth', async () => {
      const res = await request(app).get('/api/v1/brands');
      expect(res.statusCode).toEqual(401);
    });

    it('should get all brands as admin', async () => {
      const res = await request(app)
        .get('/api/v1/brands')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/brands/:id (admin)', () => {
    it('should get brand by id', async () => {
      const res = await request(app)
        .get(`/api/v1/brands/${brandId}`)
        .set('Cookie', `adminAuthToken=${adminAuthToken}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body.data.name).toBe('Test Brand');
    });

    it('should return 404 for invalid id', async () => {
      const res = await request(app)
        .get('/api/v1/brands/60d5ec9af6820b7e3c4b4567')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`);
      expect(res.statusCode).toEqual(404);
    });
  });

  describe('POST /api/v1/brands (admin)', () => {
    it('should create brand as admin', async () => {
      const res = await request(app)
        .post('/api/v1/brands')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`)
        .send({ name: 'New Brand', slug: 'new-brand' });
      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('New Brand');
    });

    it('should fail without auth', async () => {
      const res = await request(app)
        .post('/api/v1/brands')
        .send({ name: 'New Brand' });
      expect(res.statusCode).toEqual(401);
    });

    it('should fail validation', async () => {
      const res = await request(app)
        .post('/api/v1/brands')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`)
        .send({ name: '' });
      expect(res.statusCode).toEqual(400);
    });
  });

  describe('PUT /api/v1/brands/:id (admin)', () => {
    it('should update brand as admin', async () => {
      const res = await request(app)
        .put(`/api/v1/brands/${brandId}`)
        .set('Cookie', `adminAuthToken=${adminAuthToken}`)
        .send({ name: 'Updated Brand', status: 'Inactive' });
      expect(res.statusCode).toEqual(200);
      expect(res.body.data.name).toBe('Updated Brand');
      expect(res.body.data.status).toBe('Inactive');
    });

    it('should return 404 for non-existent id', async () => {
      const res = await request(app)
        .put('/api/v1/brands/60d5ec9af6820b7e3c4b4567')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`)
        .send({ name: 'Updated' });
      expect(res.statusCode).toEqual(404);
    });
  });

  describe('DELETE /api/v1/brands/:id (admin)', () => {
    it('should delete brand as admin', async () => {
      const res = await request(app)
        .delete(`/api/v1/brands/${brandId}`)
        .set('Cookie', `adminAuthToken=${adminAuthToken}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent id', async () => {
      const res = await request(app)
        .delete('/api/v1/brands/60d5ec9af6820b7e3c4b4567')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`);
      expect(res.statusCode).toEqual(404);
    });
  });
});
