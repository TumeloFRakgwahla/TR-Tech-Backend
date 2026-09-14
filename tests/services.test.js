const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const Service = require('../models/Service');

const { createToken } = require('./helpers/createToken');

describe('Services', () => {
  let adminAuthToken;
  let serviceId;

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

    const service = await Service.create({
      name: 'Test Service',
      description: 'Test description',
      category: 'Phone Repair',
      price: 99,
      estimatedTime: '1-2 hours',
      status: 'Active',
    });
    serviceId = service._id;
  });

  afterEach(async () => {
    await Service.deleteMany({});
  });

  describe('GET /api/v1/services', () => {
    it('should get all services', async () => {
      const res = await request(app).get('/api/v1/services');
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should filter services by category', async () => {
      const res = await request(app).get('/api/v1/services?category=Phone%20Repair');
      expect(res.statusCode).toEqual(200);
      expect(res.body.data.every((s) => s.category === 'Phone Repair')).toBe(true);
    });

    it('should filter services by status', async () => {
      const res = await request(app).get('/api/v1/services?status=Active');
      expect(res.statusCode).toEqual(200);
      expect(res.body.data.every((s) => s.status === 'Active')).toBe(true);
    });

    it('should paginate services', async () => {
      const res = await request(app).get('/api/v1/services?page=1&limit=1');
      expect(res.statusCode).toEqual(200);
      expect(res.body.count).toBe(1);
      expect(res.body.totalPages).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/services/:id', () => {
    it('should get service by id', async () => {
      const res = await request(app).get(`/api/v1/services/${serviceId}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Test Service');
    });

    it('should return 404 for invalid id', async () => {
      const res = await request(app).get('/api/v1/services/60d5ec9af6820b7e3c4b4567');
      expect(res.statusCode).toEqual(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/services', () => {
    it('should create service as admin', async () => {
      const res = await request(app)
        .post('/api/v1/services')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`)
        .send({
          name: 'New Service',
          description: 'New description',
          category: 'Computer Repair',
          price: 199,
          estimatedTime: '2-3 hours',
          status: 'Active',
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('New Service');
    });

    it('should fail without auth', async () => {
      const res = await request(app)
        .post('/api/v1/services')
        .send({
          name: 'No Auth Service',
          description: 'Desc',
          category: 'Phone Repair',
          price: 100,
        });

      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
    });

    it('should fail validation', async () => {
      const res = await request(app)
        .post('/api/v1/services')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`)
        .send({
          name: '',
          description: 'Desc',
          category: 'Phone Repair',
          price: -100,
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
    });

    it('should fail for non-admin', async () => {
      const customer = await User.create({
        firstName: 'Customer',
        lastName: 'User',
        email: 'customer@test.com',
        password: 'password123',
        phone: '1234567890',
        role: 'customer',
      });
      const customerToken = await createToken(customer._id);

      const res = await request(app)
        .post('/api/v1/services')
        .set('Cookie', `adminAuthToken=${customerToken}`)
        .send({
          name: 'Customer Service',
          description: 'Desc',
          category: 'Phone Repair',
          price: 100,
        });

      expect(res.statusCode).toEqual(403);
      expect(res.body.success).toBe(false);
    });

    it('should require 2FA for admin with twoFactorEnabled', async () => {
      const admin2FA = await User.create({
        firstName: 'Admin',
        lastName: 'TwoFactor',
        email: 'admin2fa@test.com',
        password: 'password123',
        phone: '1234567890',
        role: 'admin',
        twoFactorEnabled: true,
      });
      const token = await createToken(admin2FA._id);

      const res = await request(app)
        .post('/api/v1/services')
        .set('Cookie', `adminAuthToken=${token}`)
        .send({
          name: '2FA Service',
          description: 'Desc',
          category: 'Phone Repair',
          price: 100,
        });

      expect(res.statusCode).toEqual(403);
      expect(res.body.success).toBe(false);
      expect(res.body.requiresTwoFactor).toBe(true);
    });
  });

  describe('PUT /api/v1/services/:id', () => {
    it('should update service as admin', async () => {
      const res = await request(app)
        .put(`/api/v1/services/${serviceId}`)
        .set('Cookie', `adminAuthToken=${adminAuthToken}`)
        .send({
          name: 'Updated Service',
          description: 'Updated description',
          category: 'Tablet Repair',
          price: 299,
          estimatedTime: '3-4 hours',
          status: 'Inactive',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated Service');
      expect(res.body.data.price).toBe(299);
    });

    it('should return 404 for non-existent id', async () => {
      const res = await request(app)
        .put('/api/v1/services/60d5ec9af6820b7e3c4b4567')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`)
        .send({
          name: 'Updated',
          description: 'Desc',
          category: 'Phone Repair',
          price: 100,
        });

      expect(res.statusCode).toEqual(404);
      expect(res.body.success).toBe(false);
    });

    it('should fail validation', async () => {
      const res = await request(app)
        .put(`/api/v1/services/${serviceId}`)
        .set('Cookie', `adminAuthToken=${adminAuthToken}`)
        .send({
          name: '',
          description: 'Desc',
          category: 'Phone Repair',
          price: -50,
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
    });

    it('should require 2FA for admin with twoFactorEnabled', async () => {
      const admin2FA = await User.create({
        firstName: 'Admin',
        lastName: 'TwoFactor',
        email: 'admin2fa@test.com',
        password: 'password123',
        phone: '1234567890',
        role: 'admin',
        twoFactorEnabled: true,
      });
      const token = await createToken(admin2FA._id);

      const res = await request(app)
        .put(`/api/v1/services/${serviceId}`)
        .set('Cookie', `adminAuthToken=${token}`)
        .send({
          name: 'Updated Service',
          description: 'Desc',
          category: 'Phone Repair',
          price: 100,
        });

      expect(res.statusCode).toEqual(403);
      expect(res.body.requiresTwoFactor).toBe(true);
    });
  });

  describe('DELETE /api/v1/services/:id', () => {
    it('should delete service as admin', async () => {
      const res = await request(app)
        .delete(`/api/v1/services/${serviceId}`)
        .set('Cookie', `adminAuthToken=${adminAuthToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent id', async () => {
      const res = await request(app)
        .delete('/api/v1/services/60d5ec9af6820b7e3c4b4567')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`);

      expect(res.statusCode).toEqual(404);
      expect(res.body.success).toBe(false);
    });

    it('should fail without auth', async () => {
      const res = await request(app)
        .delete(`/api/v1/services/${serviceId}`);

      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
    });

    it('should require 2FA for admin with twoFactorEnabled', async () => {
      const admin2FA = await User.create({
        firstName: 'Admin',
        lastName: 'TwoFactor',
        email: 'admin2fa@test.com',
        password: 'password123',
        phone: '1234567890',
        role: 'admin',
        twoFactorEnabled: true,
      });
      const token = await createToken(admin2FA._id);

      const res = await request(app)
        .delete(`/api/v1/services/${serviceId}`)
        .set('Cookie', `adminAuthToken=${token}`);

      expect(res.statusCode).toEqual(403);
      expect(res.body.requiresTwoFactor).toBe(true);
    });
  });
});
