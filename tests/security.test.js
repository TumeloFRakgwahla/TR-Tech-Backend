const request = require('supertest');
const app = require('../app');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Product = require('../models/Product');
const Session = require('../models/Session');

const generateToken = require('./helpers/createToken').createToken;

describe('Security', () => {
  describe('Order total is server-computed (price manipulation)', () => {
    it('ignores a tampered client totalAmount and recomputes from DB price', async () => {
      const product = await Product.create({
        name: 'Phone',
        description: 'Desc',
        category: 'Smartphones',
        price: 500,
        condition: 'New',
        stock: 5,
        status: 'Active',
      });

      const res = await request(app)
        .post('/api/v1/orders')
        .send({
          items: [{ product: product._id, quantity: 2 }],
          customer: { name: 'Buyer', email: 'buyer@test.com', phone: '1234567890' },
          totalAmount: 0.01,
          paymentMethod: 'Cash',
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      // 2 x 500 = 1000, not the client's 0.01
      expect(res.body.data.totalAmount).toBe(1000);
      expect(res.body.data.items[0].price).toBe(500);

      const updated = await Product.findById(product._id);
      expect(updated.stock).toBe(3);
    });
  });

  describe('Path traversal on image delete', () => {
    it('rejects traversal / invalid filenames (never 200)', async () => {
      const admin = await User.create({
        firstName: 'A', lastName: 'B', email: 'admin@test.com', password: 'password123', phone: '1', role: 'admin',
      });
      const token = await generateToken(admin._id);
      await Session.create({ userId: admin._id, tokenIdentifier: 'testjti', isActive: true, expiresAt: new Date(Date.now() + 86400000) });

      const attempts = ['..', 'a;b', '..%2F..%2Fpackage.json', 'con%2Ffile'];
      for (const filename of attempts) {
      const res = await request(app)
        .delete(`/api/v1/upload/image/${filename}`)
        .set('Cookie', `adminAuthToken=${token}`);
        expect(res.statusCode).toBeGreaterThanOrEqual(400);
        expect(res.body.success).toBe(false);
      }
    });
  });

  describe('NoSQL operator injection on query params', () => {
    it('does not interpret an object value as an operator', async () => {
      await Product.create({ name: 'A', description: 'd', category: 'Smartphones', price: 1, condition: 'New', stock: 1, status: 'Active' });
      await Product.create({ name: 'B', description: 'd', category: 'Laptops', price: 1, condition: 'New', stock: 1, status: 'Active' });

      // ?category[$ne]=Smartphones would exclude Smartphones if the operator were applied.
      const res = await request(app).get('/api/v1/products?category[$ne]=Smartphones');
      expect(res.statusCode).toEqual(200);
      const cats = new Set(res.body.data.map((p) => p.category));
      // Operator ignored => BOTH categories returned (filter dropped), not just Laptops.
      expect(cats.has('Smartphones')).toBe(true);
      expect(cats.has('Laptops')).toBe(true);
    });
  });

  describe('Authorization', () => {
    it('blocks a non-admin from admin routes', async () => {
      const customer = await User.create({
        firstName: 'C', lastName: 'D', email: 'cust@test.com', password: 'password123', phone: '1', role: 'customer',
      });
      const token = await generateToken(customer._id);
      await Session.create({ userId: customer._id, tokenIdentifier: 'custjti', isActive: true, expiresAt: new Date(Date.now() + 86400000) });

      const res = await request(app)
        .get('/api/v1/products/low-stock')
        .set('Cookie', `adminAuthToken=${token}`);
      expect(res.statusCode).toEqual(403);
    });
  });

  describe('Session revocation', () => {
    it('rejects a token after logout', async () => {
      const user = await User.create({
        firstName: 'E', lastName: 'F', email: 'e@test.com', password: 'password123', phone: '1', role: 'customer',
      });

      // Simulate a real login: issue a session-backed token via the auth flow.
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'e@test.com', password: 'password123' });
      expect(loginRes.statusCode).toEqual(200);
      const cookie = loginRes.headers['set-cookie'][0].split(';')[0];

      // Token works
      const meRes = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);
      expect(meRes.statusCode).toEqual(200);

      // Logout revokes the session
      const logoutRes = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);
      expect(logoutRes.statusCode).toEqual(200);

      // Token is now rejected
      const afterRes = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);
      expect(afterRes.statusCode).toEqual(401);
    });
  });

  describe('Admin password reset (hashed)', () => {
    const setup = async () => {
      const admin = await User.create({ firstName: 'Ad', lastName: 'Min', email: 'admin2@test.com', password: 'password123', phone: '1', role: 'admin' });
      const target = await User.create({ firstName: 'Tg', lastName: 'User', email: 'target@test.com', password: 'oldpass123', phone: '1', role: 'customer' });
      const token = await generateToken(admin._id);
      await Session.create({ userId: admin._id, tokenIdentifier: 'adm2jti', isActive: true, expiresAt: new Date(Date.now() + 86400000) });
      return { admin, target, token };
    };

    it('hashes the new password and lets the user log in with it', async () => {
      const { target, token } = await setup();

      const res = await request(app)
        .put(`/api/v1/users/${target._id}/password`)
        .set('Cookie', `adminAuthToken=${token}`)
        .send({ password: 'newpass123' });
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);

      const stored = await User.findById(target._id).select('+password');
      expect(stored.password).not.toEqual('newpass123');
      expect(stored.password.startsWith('$2')).toBe(true);

      const loginNew = await request(app).post('/api/v1/auth/login').send({ email: 'target@test.com', password: 'newpass123' });
      expect(loginNew.statusCode).toEqual(200);
      const loginOld = await request(app).post('/api/v1/auth/login').send({ email: 'target@test.com', password: 'oldpass123' });
      expect(loginOld.statusCode).toEqual(401);
    });

    it('rejects a weak password', async () => {
      const { target, token } = await setup();
      const res = await request(app)
        .put(`/api/v1/users/${target._id}/password`)
        .set('Cookie', `adminAuthToken=${token}`)
        .send({ password: 'short' });
      expect(res.statusCode).toEqual(400);
    });

    it('blocks non-admins', async () => {
      const { target } = await setup();
      const customer = await User.create({ firstName: 'C', lastName: 'U', email: 'cust2@test.com', password: 'password123', phone: '1', role: 'customer' });
      const custToken = await generateToken(customer._id);
      await Session.create({ userId: customer._id, tokenIdentifier: 'cust2jti', isActive: true, expiresAt: new Date(Date.now() + 86400000) });
      const res = await request(app)
        .put(`/api/v1/users/${target._id}/password`)
        .set('Cookie', `authToken=${custToken}`)
        .send({ password: 'newpass123' });
      expect(res.statusCode).toEqual(401);
    });
  });
});
