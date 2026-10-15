const axios = require('axios');
const crypto = require('crypto');

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

const getSecretKey = () => {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key || key.length < 10) {
    throw new Error('PAYSTACK_SECRET_KEY environment variable is not configured');
  }
  return key;
};

const getWebhookSecret = () => {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key || key.length < 10) {
    throw new Error('PAYSTACK_SECRET_KEY environment variable is not configured');
  }
  return key;
};

const getPaystackClient = () => {
  const client = axios.create({
    baseURL: PAYSTACK_BASE_URL,
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  });
  return client;
};

const initializeTransaction = async ({ email, amount, reference, callbackUrl, metadata = {} }) => {
  try {
    const client = getPaystackClient();
    const response = await client.post('/transaction/initialize', {
      email,
      amount,
      reference,
      callback_url: callbackUrl,
      metadata,
    });

    if (response.status !== 200 || !response.data?.data?.authorization_url) {
      const message = response.data?.message || 'Failed to initialize transaction';
      const error = new Error(message);
      error.status = response.status || 400;
      error.paystackResponse = response.data;
      throw error;
    }

    return response.data.data;
  } catch (error) {
    if (error.paystackResponse) throw error;

    const paystackMessage =
      error.message || error.response?.data?.message || `Paystack API error: ${error.response?.status || 'unknown'}`;
    const newError = new Error(paystackMessage);
    newError.status = error.response?.status || (error.message?.includes('PAYSTACK_SECRET_KEY') ? 502 : 400);
    newError.paystackResponse = error.response?.data || {};
    throw newError;
  }
};

const verifyTransaction = async (reference) => {
  try {
    const client = getPaystackClient();
    const response = await client.get(`/transaction/verify/${encodeURIComponent(reference)}`);

    if (response.status !== 200 || !response.data?.data) {
      const message = response.data?.message || 'Failed to verify transaction';
      const error = new Error(message);
      error.status = response.status || 400;
      error.paystackResponse = response.data;
      throw error;
    }

    return response.data.data;
  } catch (error) {
    if (error.paystackResponse) throw error;

    const paystackMessage =
      error.message || error.response?.data?.message || `Paystack API error: ${error.response?.status || 'unknown'}`;
    const newError = new Error(paystackMessage);
    newError.status = error.response?.status || (error.message?.includes('PAYSTACK_SECRET_KEY') ? 502 : 400);
    newError.paystackResponse = error.response?.data || {};
    throw newError;
  }
};

const verifyWebhookSignature = (signature, payload) => {
  const secret = getWebhookSecret();
  if (!signature) return false;

  let payloadString;
  if (typeof payload === 'string') {
    payloadString = payload;
  } else if (Buffer.isBuffer(payload)) {
    payloadString = payload.toString();
  } else {
    payloadString = JSON.stringify(payload);
  }

  const expectedSignature = crypto
    .createHmac('sha512', secret)
    .update(payloadString)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
};

module.exports = {
  initializeTransaction,
  verifyTransaction,
  verifyWebhookSignature,
};
