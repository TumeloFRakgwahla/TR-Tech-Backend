const request = require('supertest');
const app = require('../app');
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Session = require('../models/Session');

const { createToken } = require('./helpers/createToken');
const generateToken = createToken;

describe('XSS Sanitization', () => {
  let adminToken;

  beforeEach(async () => {
    const admin = await User.create({
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@test.com',
      password: 'password123',
      phone: '1234567890',
      role: 'admin',
    });
    adminToken = await generateToken(admin._id);
    await Session.create({ userId: admin._id, tokenIdentifier: 'xssjti', isActive: true, expiresAt: new Date(Date.now() + 86400000) });
  });

  afterEach(async () => {
    await User.deleteMany({});
    await Product.deleteMany({});
  });

  it('escapes HTML in product name on create', async () => {
    const res = await request(app)
      .post('/api/v1/products')
      .set('Cookie', `authToken=${adminToken}`)
      .send({
        name: '<script>alert("xss")</script>',
        description: 'Test',
        category: 'Smartphones',
        brand: 'Other',
        price: 100,
        condition: 'New',
        stock: 10,
        status: 'Active',
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.data.name).not.toContain('<script>');
    expect(res.body.data.name).toContain('&lt;script&gt;');
  });

  it('escapes HTML in product name on update', async () => {
    const product = await Product.create({
      name: 'Safe Product',
      description: 'Test',
      category: 'Smartphones',
      brand: 'Other',
      price: 100,
      condition: 'New',
      stock: 10,
      status: 'Active',
    });

    const res = await request(app)
      .put(`/api/v1/products/${product._id}`)
      .set('Cookie', `authToken=${adminToken}`)
      .send({
        name: '<img src=x onerror=alert(1)>',
        description: 'Test',
        category: 'Smartphones',
        brand: 'Other',
        price: 100,
        condition: 'New',
        stock: 10,
        status: 'Active',
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.name).not.toContain('<img');
    expect(res.body.data.name).toContain('&lt;img');
  });
});
