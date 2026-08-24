const request = require('supertest');
const app = require('../app');
const mongoose = require('mongoose');
const Coupon = require('../models/Coupon');
const Campaign = require('../models/Campaign');
const Promotion = require('../models/Promotion');

describe('Marketing Public Routes', () => {
  beforeEach(async () => {
    await Coupon.create({ code: 'TEST10', discount: 10, type: 'Percentage', status: 'Active' });
    await Campaign.create({ name: 'Test Campaign', type: 'Email', status: 'Active' });
    await Promotion.create({ title: 'Test Promotion', image: 'test.jpg', location: 'homepage', status: 'Active' });
  });

  afterEach(async () => {
    await Coupon.deleteMany({});
    await Campaign.deleteMany({});
    await Promotion.deleteMany({});
  });

  describe('GET /api/v1/marketing/coupons', () => {
    it('returns only active coupons without auth', async () => {
      const res = await request(app).get('/api/v1/marketing/coupons');
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.every((c) => c.status === 'Active')).toBe(true);
    });
  });

  describe('GET /api/v1/marketing/campaigns', () => {
    it('returns only active campaigns without auth', async () => {
      const res = await request(app).get('/api/v1/marketing/campaigns');
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.every((c) => c.status === 'Active')).toBe(true);
    });
  });

  describe('GET /api/v1/marketing/promotions', () => {
    it('returns only active promotions without auth', async () => {
      const res = await request(app).get('/api/v1/marketing/promotions');
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.every((p) => p.status === 'Active')).toBe(true);
    });
  });
});
