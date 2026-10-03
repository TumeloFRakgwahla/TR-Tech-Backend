const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const Settings = require('../models/Settings');

const { createToken } = require('./helpers/createToken');

describe('Settings', () => {
  let adminAuthToken;

  beforeEach(async () => {
    const admin = await User.create({
      firstName: 'Admin',
      lastName: 'User',
      email: 'settings-admin@test.com',
      password: 'password123',
      phone: '1234567890',
      role: 'admin',
    });
    adminAuthToken = await createToken(admin._id);
  });

  afterEach(async () => {
    await Settings.deleteMany({});
  });

  const cookie = () => ({ Cookie: `adminAuthToken=${adminAuthToken}` });

  describe('PUT /api/v1/settings', () => {
    it('saves business settings without requiring a password', async () => {
      // Regression: the password validation chain previously ran on every
      // PUT, so a settings save without a `password` field was rejected
      // with "Current password is required" and the page could never save.
      const res = await request(app)
        .put('/api/v1/settings')
        .set(cookie())
        .send({ business: { businessName: 'TR-Tech', phone: '+27 123' } });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);

      const saved = await Settings.findOne();
      expect(saved.business.businessName).toBe('TR-Tech');
    });

    it('rejects a password change with a weak new password', async () => {
      const res = await request(app)
        .put('/api/v1/settings')
        .set(cookie())
        .send({ password: { currentPassword: 'password123', newPassword: 'short' } });

      expect(res.statusCode).toEqual(400);
      const messages = res.body.errors.map((e) => e.msg);
      expect(messages).toContain('Password must be at least 8 characters');
    });

    it('rejects an unknown action', async () => {
      const res = await request(app)
        .put('/api/v1/settings')
        .set(cookie())
        .send({ action: 'wipe-everything' });

      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .put('/api/v1/settings')
        .send({ business: { businessName: 'X' } });

      expect(res.statusCode).toEqual(401);
    });
  });

  describe('GET /api/v1/settings', () => {
    it('returns settings for an admin', async () => {
      const res = await request(app).get('/api/v1/settings').set(cookie());
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.settings).toBeDefined();
    });
  });
});
