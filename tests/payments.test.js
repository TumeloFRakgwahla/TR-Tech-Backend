const request = require('supertest');
const crypto = require('crypto');
const app = require('../app');
const Order = require('../models/Order');
const User = require('../models/User');

jest.mock('../services/paystackService', () => {
  const actual = jest.requireActual('../services/paystackService');
  return {
    ...actual,
    initializeTransaction: jest.fn(),
    verifyTransaction: jest.fn(),
  };
});

const paystackService = require('../services/paystackService');
const { verifyWebhookSignature } = paystackService;

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

const createTestOrder = async (overrides = {}) => {
  return await Order.create({
    customer: {
      name: 'Test Customer',
      email: 'customer@test.com',
      phone: '1234567890',
    },
    totalAmount: 999,
    ...overrides,
  });
};

const signPayload = (payload) => {
  if (typeof payload !== 'string') payload = JSON.stringify(payload);
  return crypto.createHmac('sha512', PAYSTACK_SECRET).update(payload).digest('hex');
};

describe('Payments - Paystack', () => {
  beforeEach(async () => {
    await User.create({
      firstName: 'Test',
      lastName: 'User',
      email: 'test@test.com',
      password: 'password123',
      phone: '1234567890',
    });
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await Order.deleteMany({});
    await User.deleteMany({});
  });

  describe('POST /api/v1/payments/paystack/initialize', () => {
    it('should initialize a Paystack transaction successfully', async () => {
      const order = await createTestOrder();
      paystackService.initializeTransaction.mockResolvedValue({
        authorization_url: 'https://checkout.paystack.com/abc',
        access_code: 'code123',
        reference: 'ref123',
      });

      const res = await request(app)
        .post('/api/v1/payments/paystack/initialize')
        .send({ orderId: order._id, email: 'customer@test.com', amount: 999 });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.authorizationUrl).toBe('https://checkout.paystack.com/abc');
      expect(res.body.data.reference).toBeDefined();
    });

    it('should return 404 if order not found', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .post('/api/v1/payments/paystack/initialize')
        .send({ orderId: fakeId, email: 'customer@test.com', amount: 999 });

      expect(res.statusCode).toEqual(404);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 if order is already paid', async () => {
      const order = await createTestOrder({ paymentStatus: 'Paid' });
      const res = await request(app)
        .post('/api/v1/payments/paystack/initialize')
        .send({ orderId: order._id, email: 'customer@test.com', amount: 999 });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toBe('Order has already been paid');
    });

    it('should return existing paid status if reference already verified as success', async () => {
      const order = await createTestOrder({ paystackReference: 'existing_ref' });
      paystackService.verifyTransaction.mockResolvedValue({
        status: 'success',
        reference: 'existing_ref',
      });

      const res = await request(app)
        .post('/api/v1/payments/paystack/initialize')
        .send({ orderId: order._id, email: 'customer@test.com', amount: 999 });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.paid).toBe(true);
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/v1/payments/paystack/initialize')
        .send({});

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('POST /api/v1/payments/paystack/verify', () => {
    it('should verify a successful payment and mark order as Paid', async () => {
      const order = await createTestOrder();
      paystackService.verifyTransaction.mockResolvedValue({
        status: 'success',
        amount: 99900,
        reference: 'verify_ref',
        gateway_response: 'Successful',
        paid_at: '2024-01-01T00:00:00Z',
        metadata: { orderId: order._id.toString() },
      });

      const res = await request(app)
        .post('/api/v1/payments/paystack/verify')
        .send({ reference: 'verify_ref' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.paid).toBe(true);

      const updated = await Order.findById(order._id);
      expect(updated.paymentStatus).toBe('Paid');
      expect(updated.status).toBe('Processing');
    });

    it('should return 400 on amount mismatch', async () => {
      const order = await createTestOrder({ totalAmount: 999 });
      paystackService.verifyTransaction.mockResolvedValue({
        status: 'success',
        amount: 50000,
        reference: 'verify_ref_2',
        metadata: { orderId: order._id.toString() },
      });

      const res = await request(app)
        .post('/api/v1/payments/paystack/verify')
        .send({ reference: 'verify_ref_2' });

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toBe('Payment amount does not match order total');
    });

    it('should return 404 if order not found', async () => {
      paystackService.verifyTransaction.mockResolvedValue({
        status: 'success',
        amount: 99900,
        reference: 'verify_ref_3',
        metadata: { orderId: '507f1f77bcf86cd799439011' },
      });

      const res = await request(app)
        .post('/api/v1/payments/paystack/verify')
        .send({ reference: 'verify_ref_3' });

      expect(res.statusCode).toEqual(404);
    });

    it('should return 400 if payment was not successful', async () => {
      const order = await createTestOrder();
      paystackService.verifyTransaction.mockResolvedValue({
        status: 'failed',
        amount: 99900,
        reference: 'verify_ref_4',
        gateway_response: 'Declined',
        metadata: { orderId: order._id.toString() },
      });

      const res = await request(app)
        .post('/api/v1/payments/paystack/verify')
        .send({ reference: 'verify_ref_4' });

      expect(res.statusCode).toEqual(400);
      expect(res.body.success).toBe(false);
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/v1/payments/paystack/verify')
        .send({});

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('POST /api/v1/payments/paystack/webhook', () => {
    it('should return 400 if signature header is missing', async () => {
      const res = await request(app)
        .post('/api/v1/payments/paystack/webhook')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ event: 'charge.success', data: { reference: 'ref' } }));

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toBe('Missing Paystack signature header');
    });

    it('should return 401 if signature is invalid', async () => {
      const payload = JSON.stringify({
        event: 'charge.success',
        data: { reference: 'ref_invalid', amount: 99900 },
      });

      const res = await request(app)
        .post('/api/v1/payments/paystack/webhook')
        .set('Content-Type', 'application/json')
        .set('x-paystack-signature', 'invalid_signature')
        .send(payload);

      expect(res.statusCode).toEqual(401);
      expect(res.body.message).toBe('Invalid signature');
    });

    it('should return 400 if payload is invalid JSON', async () => {
      const payload = 'not-json{';
      const signature = signPayload(payload);

      const res = await request(app)
        .post('/api/v1/payments/paystack/webhook')
        .set('Content-Type', 'application/json')
        .set('x-paystack-signature', signature)
        .send(payload);

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toBe('Invalid JSON payload');
    });

    it('should mark order as Paid on charge.success with matching amount', async () => {
      const order = await createTestOrder({
        totalAmount: 999,
        paystackReference: 'ref_success',
        paymentStatus: 'Pending',
      });

      const payload = JSON.stringify({
        event: 'charge.success',
        data: { reference: 'ref_success', amount: 99900 },
      });
      const signature = signPayload(payload);

      const res = await request(app)
        .post('/api/v1/payments/paystack/webhook')
        .set('Content-Type', 'application/json')
        .set('x-paystack-signature', signature)
        .send(payload);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);

      const updated = await Order.findById(order._id);
      expect(updated.paymentStatus).toBe('Paid');
      expect(updated.status).toBe('Processing');
    });

    it('should not update order on charge.success with amount mismatch', async () => {
      const order = await createTestOrder({
        totalAmount: 999,
        paystackReference: 'ref_mismatch',
        paymentStatus: 'Pending',
      });

      const payload = JSON.stringify({
        event: 'charge.success',
        data: { reference: 'ref_mismatch', amount: 5000 },
      });
      const signature = signPayload(payload);

      const res = await request(app)
        .post('/api/v1/payments/paystack/webhook')
        .set('Content-Type', 'application/json')
        .set('x-paystack-signature', signature)
        .send(payload);

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toBe('Amount mismatch, order not updated');

      const updated = await Order.findById(order._id);
      expect(updated.paymentStatus).toBe('Pending');
    });

    it('should skip already-paid orders on charge.success', async () => {
      await createTestOrder({
        totalAmount: 999,
        paystackReference: 'ref_already_paid',
        paymentStatus: 'Paid',
      });

      const payload = JSON.stringify({
        event: 'charge.success',
        data: { reference: 'ref_already_paid', amount: 99900 },
      });
      const signature = signPayload(payload);

      const res = await request(app)
        .post('/api/v1/payments/paystack/webhook')
        .set('Content-Type', 'application/json')
        .set('x-paystack-signature', signature)
        .send(payload);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
    });

    it('should handle charge.failed events', async () => {
      await createTestOrder({
        totalAmount: 999,
        paystackReference: 'ref_failed',
        paymentStatus: 'Pending',
      });

      const payload = JSON.stringify({
        event: 'charge.failed',
        data: { reference: 'ref_failed', amount: 99900 },
      });
      const signature = signPayload(payload);

      const res = await request(app)
        .post('/api/v1/payments/paystack/webhook')
        .set('Content-Type', 'application/json')
        .set('x-paystack-signature', signature)
        .send(payload);

      expect(res.statusCode).toEqual(200);
    });

    it('should return 200 if reference not found', async () => {
      const payload = JSON.stringify({
        event: 'charge.success',
        data: { reference: 'ref_not_found', amount: 99900 },
      });
      const signature = signPayload(payload);

      const res = await request(app)
        .post('/api/v1/payments/paystack/webhook')
        .set('Content-Type', 'application/json')
        .set('x-paystack-signature', signature)
        .send(payload);

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toBe('Reference not found, ignored');
    });

    it('should return 400 if no reference in payload', async () => {
      const payload = JSON.stringify({
        event: 'charge.success',
        data: { amount: 99900 },
      });
      const signature = signPayload(payload);

      const res = await request(app)
        .post('/api/v1/payments/paystack/webhook')
        .set('Content-Type', 'application/json')
        .set('x-paystack-signature', signature)
        .send(payload);

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toBe('No reference in webhook payload');
    });
  });
});
