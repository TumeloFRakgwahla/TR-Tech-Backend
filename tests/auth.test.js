const request = require('supertest');
const app = require('../app');
const mongoose = require('mongoose');
const User = require('../models/User');

const { createToken } = require('./helpers/createToken');
const generateToken = createToken;

describe('Auth', () => {
  let adminToken;
  let userToken;

  beforeEach(async () => {
    await User.create({
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@test.com',
      password: 'password123',
      phone: '1234567890',
      role: 'admin',
    });

    await User.create({
      firstName: 'Test',
      lastName: 'User',
      email: 'user@test.com',
      password: 'password123',
      phone: '1234567890',
      role: 'customer',
    });

    const admin = await User.findOne({ email: 'admin@test.com' });
    const user = await User.findOne({ email: 'user@test.com' });
    adminToken = await generateToken(admin._id);
    userToken = await generateToken(user._id);
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          firstName: 'New',
          lastName: 'User',
          email: 'newuser@test.com',
          password: 'password123',
          phone: '0987654321',
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.user.email).toBe('newuser@test.com');
    });

    it('should fail with duplicate email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          firstName: 'Duplicate',
          lastName: 'User',
          email: 'admin@test.com',
          password: 'password123',
          phone: '0987654321',
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
    });

    it('should fail validation', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          firstName: 'A',
          lastName: 'B',
          email: 'invalid-email',
          password: 'short',
          phone: '',
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'password123',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.email).toBe('admin@test.com');
    });

    it('should fail with invalid credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'wrongpassword',
        });

      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return user when authenticated', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', `authToken=${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.email).toBe('admin@test.com');
    });

    it('should return 401 when not authenticated', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me');

      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should logout successfully', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', `authToken=${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('PUT /api/v1/auth/updateprofile', () => {
    it('should update profile when authenticated', async () => {
      const res = await request(app)
        .put('/api/v1/auth/updateprofile')
        .set('Cookie', `authToken=${userToken}`)
        .send({ firstName: 'Updated' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.firstName).toBe('Updated');
    });

    it('should fail when not authenticated', async () => {
      const res = await request(app)
        .put('/api/v1/auth/updateprofile')
        .send({ firstName: 'Updated' });

      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/admin/login', () => {
    it('should login with valid admin credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/admin/login')
        .send({
          email: 'admin@test.com',
          password: 'password123',
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.email).toBe('admin@test.com');
      expect(res.body.user.role).toBe('admin');
    });

    it('should fail with customer credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/admin/login')
        .send({
          email: 'user@test.com',
          password: 'password123',
        });

      expect(res.statusCode).toEqual(403);
      expect(res.body.success).toBe(false);
    });

    it('should fail with invalid credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/admin/login')
        .send({
          email: 'admin@test.com',
          password: 'wrongpassword',
        });

      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/auth/admin/me', () => {
    it('should return user when authenticated with admin token', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/admin/login')
        .send({
          email: 'admin@test.com',
          password: 'password123',
        });
      expect(loginRes.statusCode).toEqual(200);
      const cookie = loginRes.headers['set-cookie'][0].split(';')[0];

      const res = await request(app)
        .get('/api/v1/auth/admin/me')
        .set('Cookie', cookie);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.email).toBe('admin@test.com');
    });

    it('should return 401 when not authenticated', async () => {
      const res = await request(app)
        .get('/api/v1/auth/admin/me');

      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/admin/logout', () => {
    it('should logout successfully', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/admin/login')
        .send({
          email: 'admin@test.com',
          password: 'password123',
        });
      expect(loginRes.statusCode).toEqual(200);
      const cookie = loginRes.headers['set-cookie'][0].split(';')[0];

      const res = await request(app)
        .post('/api/v1/auth/admin/logout')
        .set('Cookie', cookie);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
    });
  });
});
