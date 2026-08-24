const request = require('supertest');
const app = require('../app');
const mongoose = require('mongoose');
const Product = require('../models/Product');

describe('Product Brand', () => {
  beforeEach(async () => {
    await Product.create({
      name: 'Apple iPhone',
      description: 'Test',
      category: 'Smartphones',
      brand: 'Apple',
      price: 1000,
      condition: 'New',
      stock: 10,
      status: 'Active',
    });
    await Product.create({
      name: 'Samsung Galaxy',
      description: 'Test',
      category: 'Smartphones',
      brand: 'Samsung',
      price: 900,
      condition: 'New',
      stock: 5,
      status: 'Active',
    });
  });

  afterEach(async () => {
    await Product.deleteMany({});
  });

  it('filters products by brand', async () => {
    const res = await request(app).get('/api/v1/products?brand=Apple');
    expect(res.statusCode).toEqual(200);
    expect(res.body.data.every((p) => p.brand === 'Apple')).toBe(true);
  });

  it('requires brand on create', async () => {
    const res = await request(app)
      .post('/api/v1/products')
      .send({
        name: 'No Brand',
        description: 'Test',
        category: 'Smartphones',
        price: 100,
        condition: 'New',
        stock: 10,
        status: 'Active',
      });

    expect(res.statusCode).toEqual(401);
  });
});
