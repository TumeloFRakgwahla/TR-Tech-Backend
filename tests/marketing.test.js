const request = require('supertest');
const app = require('../app');
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

  describe('GET /api/v1/marketing/coupons/validate', () => {
    it('should validate a valid percentage coupon and compute discount', async () => {
      await Coupon.create({
        code: 'SAVE10',
        discount: 10,
        type: 'Percentage',
        minOrder: 0,
        status: 'Active',
      });

      const res = await request(app).get('/api/v1/marketing/coupons/validate?code=save10&cartTotal=100');
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.discountAmount).toBe(10);
      expect(res.body.data.finalTotal).toBe(90);
    });

    it('should validate a valid fixed coupon', async () => {
      await Coupon.create({
        code: 'FIXED5',
        discount: 5,
        type: 'Fixed',
        minOrder: 0,
        status: 'Active',
      });

      const res = await request(app).get('/api/v1/marketing/coupons/validate?code=FIXED5&cartTotal=100');
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.discountAmount).toBe(5);
      expect(res.body.data.finalTotal).toBe(95);
    });

    it('should not apply a fixed discount greater than cart total', async () => {
      await Coupon.create({
        code: 'BIGFIXED',
        discount: 200,
        type: 'Fixed',
        minOrder: 0,
        status: 'Active',
      });

      const res = await request(app).get('/api/v1/marketing/coupons/validate?code=BIGFIXED&cartTotal=50');
      expect(res.statusCode).toEqual(200);
      expect(res.body.data.discountAmount).toBe(50);
      expect(res.body.data.finalTotal).toBe(0);
    });

    it('should reject an invalid coupon code', async () => {
      const res = await request(app).get('/api/v1/marketing/coupons/validate?code=NOPE&cartTotal=100');
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid or expired coupon code');
    });

    it('should reject an expired coupon', async () => {
      await Coupon.create({
        code: 'EXPIRED',
        discount: 10,
        type: 'Percentage',
        minOrder: 0,
        expires: new Date(Date.now() - 86400000),
        status: 'Active',
      });

      const res = await request(app).get('/api/v1/marketing/coupons/validate?code=EXPIRED&cartTotal=100');
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('This coupon has expired');
    });

    it('should reject when cart total is below minimum order', async () => {
      await Coupon.create({
        code: 'MIN50',
        discount: 10,
        type: 'Percentage',
        minOrder: 50,
        status: 'Active',
      });

      const res = await request(app).get('/api/v1/marketing/coupons/validate?code=MIN50&cartTotal=20');
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Minimum order of $50.00 required for this coupon');
    });

    it('should fail validation when code is missing', async () => {
      const res = await request(app).get('/api/v1/marketing/coupons/validate?cartTotal=100');
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
    });

    it('should fail validation when cartTotal is missing', async () => {
      const res = await request(app).get('/api/v1/marketing/coupons/validate?code=SAVE10');
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
    });

    it('should fail validation when cartTotal is invalid', async () => {
      const res = await request(app).get('/api/v1/marketing/coupons/validate?code=SAVE10&cartTotal=not-a-number');
      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
    });
  });
});
