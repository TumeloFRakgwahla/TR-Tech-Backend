const axios = require('axios');

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

const getPaystackClient = () => {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error('PAYSTACK_SECRET_KEY environment variable is required');
  }

  if (!getPaystackClient._instance) {
    getPaystackClient._instance = axios.create({
      baseURL: PAYSTACK_BASE_URL,
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    });
  }

  return getPaystackClient._instance;
};

const initializeTransaction = async ({ email, amount, reference, callbackUrl, metadata = {} }) => {
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
};

const verifyTransaction = async (reference) => {
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
};

module.exports = {
  initializeTransaction,
  verifyTransaction,
};
