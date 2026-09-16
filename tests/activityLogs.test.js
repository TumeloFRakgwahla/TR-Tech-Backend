const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');

const { createToken } = require('./helpers/createToken');
const generateToken = createToken;

describe('Activity Logs (Audit)', () => {
  let adminAuthToken;

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

    await ActivityLog.create([
      {
        userId: admin._id,
        userEmail: 'admin@test.com',
        userRole: 'admin',
        action: 'GET',
        resource: 'orders',
        method: 'GET',
        endpoint: '/orders',
        statusCode: 200,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      },
      {
        userId: admin._id,
        userEmail: 'admin@test.com',
        userRole: 'admin',
        action: 'POST',
        resource: 'products',
        method: 'POST',
        endpoint: '/products',
        statusCode: 201,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      },
      {
        userEmail: 'customer@test.com',
        userRole: 'customer',
        action: 'GET',
        resource: 'orders',
        method: 'GET',
        endpoint: '/orders',
        statusCode: 401,
        ipAddress: '192.168.1.1',
        userAgent: 'test-agent',
      },
    ]);
  });

  afterEach(async () => {
    await User.deleteMany({});
    await ActivityLog.deleteMany({});
  });

  describe('GET /api/v1/users/activity-logs', () => {
    it('should return activity logs as admin', async () => {
      const res = await request(app)
        .get('/api/v1/users/activity-logs')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    });

    it('should return 401 without auth', async () => {
      const res = await request(app).get('/api/v1/users/activity-logs');
      expect(res.statusCode).toEqual(401);
    });

    it('should filter logs by action', async () => {
      const res = await request(app)
        .get('/api/v1/users/activity-logs?action=POST')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].action).toBe('POST');
    });

    it('should filter logs by userRole', async () => {
      const res = await request(app)
        .get('/api/v1/users/activity-logs?userRole=customer')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].userRole).toBe('customer');
    });

    it('should filter logs by statusCode', async () => {
      const res = await request(app)
        .get('/api/v1/users/activity-logs?statusCode=201')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].statusCode).toBe(201);
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/v1/users/activity-logs?page=1&limit=2')
        .set('Cookie', `adminAuthToken=${adminAuthToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toBe(2);
    });

    it('should support date range filtering', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const startDateStr = yesterday.toISOString().split('T')[0];
      const endDateStr = new Date(now.getTime() + 86400000).toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/v1/users/activity-logs?startDate=${startDateStr}&endDate=${endDateStr}`)
        .set('Cookie', `adminAuthToken=${adminAuthToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });
});
