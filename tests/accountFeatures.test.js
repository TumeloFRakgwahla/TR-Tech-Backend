const request = require('supertest');
const app = require('../app');
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const PaymentMethod = require('../models/PaymentMethod');

const loginAndGetCookie = async (email, password) => {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  return res.headers['set-cookie'][0].split(';')[0];
};

describe('Account features', () => {
  describe('Account lockout', () => {
    it('locks the account after 5 failed logins (429 on next attempt)', async () => {
      await User.create({ firstName: 'L', lastName: 'U', email: 'lock@test.com', password: 'password123', phone: '1' });

      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .send({ email: 'lock@test.com', password: 'wrongpassword' });
        expect(res.statusCode).toEqual(401);
      }

      const locked = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'lock@test.com', password: 'wrongpassword' });
      expect(locked.statusCode).toEqual(429);
    });

    it('resets attempts on successful login', async () => {
      const user = await User.create({ firstName: 'R', lastName: 'U', email: 'resetlock@test.com', password: 'password123', phone: '1' });
      for (let i = 0; i < 3; i++) {
        await request(app).post('/api/v1/auth/login').send({ email: 'resetlock@test.com', password: 'wrong' });
      }
      const ok = await request(app).post('/api/v1/auth/login').send({ email: 'resetlock@test.com', password: 'password123' });
      expect(ok.statusCode).toEqual(200);
      const after = await User.findById(user._id);
      expect(after.failedLoginAttempts).toEqual(0);
      expect(after.lockUntil).toBeFalsy();
    });
  });

  describe('Email verification', () => {
    it('verifies a valid token and marks the user verified', async () => {
      const user = await User.create({ firstName: 'V', lastName: 'U', email: 'verify@test.com', password: 'password123', phone: '1' });
      const token = user.generateEmailVerificationToken();
      await user.save();

      const res = await request(app).post('/api/v1/auth/verify-email').send({ token });
      expect(res.statusCode).toEqual(200);

      const updated = await User.findById(user._id);
      expect(updated.emailVerified).toBe(true);
      expect(updated.emailVerificationToken).toBeUndefined();
    });

    it('rejects an invalid/expired token', async () => {
      const res = await request(app).post('/api/v1/auth/verify-email').send({ token: 'not-a-real-token' });
      expect(res.statusCode).toEqual(400);
    });
  });

  describe('Customer order history', () => {
    it('returns only the authenticated user’s orders', async () => {
      const user = await User.create({ firstName: 'O', lastName: 'U', email: 'orders@test.com', password: 'password123', phone: '1' });
      const cookie = await loginAndGetCookie('orders@test.com', 'password123');
      const product = await Product.create({ name: 'P', description: 'd', category: 'Smartphones', price: 10, condition: 'New', stock: 5, status: 'Active' });

      const createRes = await request(app)
        .post('/api/v1/orders')
        .set('Cookie', cookie)
        .send({
          items: [{ product: product._id, quantity: 1 }],
          customer: { name: 'O U', email: 'orders@test.com', phone: '1' },
          paymentMethod: 'Card',
        });
      expect(createRes.statusCode).toEqual(201);
      expect(createRes.body.data.userId).toEqual(user._id.toString());

      // Another user's order must not appear in this user's history.
      await Order.create({
        userId: new mongoose.Types.ObjectId(),
        items: [{ product: product._id, name: 'P', condition: 'New', price: 10, quantity: 1 }],
        customer: { name: 'Other', email: 'other@test.com', phone: '1' },
        totalAmount: 10,
      });

      const list = await request(app).get('/api/v1/orders/my-orders').set('Cookie', cookie);
      expect(list.statusCode).toEqual(200);
      expect(list.body.data.length).toBe(1);
      expect(list.body.data[0]._id).toEqual(createRes.body.data._id);
    });

    it('requires authentication', async () => {
      const res = await request(app).get('/api/v1/orders/my-orders');
      expect(res.statusCode).toEqual(401);
    });
  });

  describe('Saved payment methods (PCI tokenization)', () => {
    it('stores only tokenized metadata, never raw card data', async () => {
      const user = await User.create({ firstName: 'P', lastName: 'M', email: 'pay@test.com', password: 'password123', phone: '1' });
      const cookie = await loginAndGetCookie('pay@test.com', 'password123');

      const add = await request(app)
        .post('/api/v1/payment-methods')
        .set('Cookie', cookie)
        .send({ gateway: 'stripe', gatewayToken: 'tok_visa_123', brand: 'Visa', last4: '4242' });
      expect(add.statusCode).toEqual(201);
      expect(add.body.data.last4).toEqual('4242');
      expect(add.body.data).not.toHaveProperty('number');
      expect(add.body.data).not.toHaveProperty('cvv');
      expect(add.body.data).not.toHaveProperty('gatewayToken', undefined);

      const list = await request(app).get('/api/v1/payment-methods').set('Cookie', cookie);
      expect(list.statusCode).toEqual(200);
      expect(list.body.data.length).toBe(1);

      // A different user cannot see or delete the first user's method.
      const other = await User.create({ firstName: 'P2', lastName: 'M2', email: 'pay2@test.com', password: 'password123', phone: '1' });
      const otherCookie = await loginAndGetCookie('pay2@test.com', 'password123');
      const otherList = await request(app).get('/api/v1/payment-methods').set('Cookie', otherCookie);
      expect(otherList.body.data.length).toBe(0);

      const crossDelete = await request(app)
        .delete(`/api/v1/payment-methods/${add.body.data._id}`)
        .set('Cookie', otherCookie);
      expect(crossDelete.statusCode).toEqual(404);

      const del = await request(app)
        .delete(`/api/v1/payment-methods/${add.body.data._id}`)
        .set('Cookie', cookie);
      expect(del.statusCode).toEqual(200);
    });

    it('rejects an invalid gateway', async () => {
      const user = await User.create({ firstName: 'P3', lastName: 'M3', email: 'pay3@test.com', password: 'password123', phone: '1' });
      const cookie = await loginAndGetCookie('pay3@test.com', 'password123');
      const res = await request(app)
        .post('/api/v1/payment-methods')
        .set('Cookie', cookie)
        .send({ gateway: 'sketchy', gatewayToken: 'x', last4: '1234' });
      expect(res.statusCode).toEqual(400);
    });
  });
});
