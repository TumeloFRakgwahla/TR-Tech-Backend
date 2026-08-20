const request = require('supertest');
const app = require('../app');
const mongoose = require('mongoose');
const User = require('../models/User');

const generateToken = (id) => {
  const jwt = require('jsonwebtoken');
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

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
    adminToken = generateToken(admin._id);
    userToken = generateToken(user._id);
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
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
        .post('/api/auth/register')
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
        .post('/api/auth/register')
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

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
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
        .post('/api/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'wrongpassword',
        });

      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return user when authenticated', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `authToken=${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.email).toBe('admin@test.com');
    });

    it('should return 401 when not authenticated', async () => {
      const res = await request(app)
        .get('/api/auth/me');

      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', `authToken=${adminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('PUT /api/auth/updateprofile', () => {
    it('should update profile when authenticated', async () => {
      const res = await request(app)
        .put('/api/auth/updateprofile')
        .set('Cookie', `authToken=${userToken}`)
        .send({ firstName: 'Updated' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.firstName).toBe('Updated');
    });

    it('should fail when not authenticated', async () => {
      const res = await request(app)
        .put('/api/auth/updateprofile')
        .send({ firstName: 'Updated' });

      expect(res.statusCode).toEqual(401);
      expect(res.body.success).toBe(false);
    });
  });
});
