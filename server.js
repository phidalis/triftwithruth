// =============================================
// TRIFT WITH RUTH — Backend Server
// M-Pesa STK Push via Daraja API
// Deploy on Render — reads env vars from dashboard
// =============================================

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST'],
}));

// ── Environment Variables (set in Render Dashboard) ──
// MPESA_CONSUMER_KEY      — from Safaricom Developer Portal
// MPESA_CONSUMER_SECRET   — from Safaricom Developer Portal
// MPESA_SHORTCODE         — your Paybill / Till number
// MPESA_PASSKEY           — Lipa Na M-Pesa passkey
// MPESA_CALLBACK_URL      — public URL: https://yourapp.onrender.com/mpesa/callback
// MPESA_ENV               — 'sandbox' or 'production'

const MPESA_ENV        = process.env.MPESA_ENV || 'sandbox';
const BASE_URL         = MPESA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';
const SHORTCODE        = process.env.MPESA_SHORTCODE;
const PASSKEY          = process.env.MPESA_PASSKEY;
const CALLBACK_URL     = process.env.MPESA_CALLBACK_URL;
const CONSUMER_KEY     = process.env.MPESA_CONSUMER_KEY;
const CONSUMER_SECRET  = process.env.MPESA_CONSUMER_SECRET;

// ── Health check ─────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Trift With Ruth — M-Pesa Server' });
});

// ── Generate OAuth token ──────────────────────────────
async function getMpesaToken() {
  const creds = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
  const res = await axios.get(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` },
  });
  return res.data.access_token;
}

// ── Build timestamp + password ────────────────────────
function getMpesaTimestampAndPassword() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp =
    `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const password = Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString('base64');
  return { timestamp, password };
}

// ── POST /mpesa/stkpush ───────────────────────────────
// Body: { phone, amount, orderId, customerName }
app.post('/mpesa/stkpush', async (req, res) => {
  try {
    const { phone, amount, orderId, customerName } = req.body;

    if (!phone || !amount) {
      return res.status(400).json({ success: false, message: 'Phone and amount are required.' });
    }

    // Normalize phone: strip leading 0 or +254, add 254
    const normalized = phone.replace(/\D/g, '').replace(/^0/, '254').replace(/^\+/, '');

    const token = await getMpesaToken();
    const { timestamp, password } = getMpesaTimestampAndPassword();

    const payload = {
      BusinessShortCode: SHORTCODE,
      Password:          password,
      Timestamp:         timestamp,
      TransactionType:   'CustomerPayBillOnline',
      Amount:            Math.ceil(amount),
      PartyA:            normalized,
      PartyB:            SHORTCODE,
      PhoneNumber:       normalized,
      CallBackURL:       CALLBACK_URL,
      AccountReference:  orderId || 'TRIFT-ORDER',
      TransactionDesc:   `Trift With Ruth — Order ${orderId || ''}`.slice(0, 60),
    };

    const response = await axios.post(
      `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
      payload,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    const data = response.data;
    if (data.ResponseCode === '0') {
      return res.json({
        success: true,
        message: 'STK push sent. Please check your phone.',
        checkoutRequestID: data.CheckoutRequestID,
        merchantRequestID: data.MerchantRequestID,
      });
    } else {
      return res.status(400).json({ success: false, message: data.ResponseDescription || 'M-Pesa error' });
    }

  } catch (err) {
    console.error('STK Push Error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.errorMessage || 'Server error. Try again.',
    });
  }
});

// ── POST /mpesa/callback ──────────────────────────────
// Safaricom calls this URL after payment
app.post('/mpesa/callback', (req, res) => {
  const body = req.body?.Body?.stkCallback;
  if (!body) return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  const resultCode = body.ResultCode;
  const checkoutRequestID = body.CheckoutRequestID;

  if (resultCode === 0) {
    // Payment successful
    const meta = body.CallbackMetadata?.Item || [];
    const get = (name) => meta.find(i => i.Name === name)?.Value;
    console.log('✅ M-Pesa Payment Success:', {
      amount:      get('Amount'),
      mpesaRef:    get('MpesaReceiptNumber'),
      phone:       get('PhoneNumber'),
      checkoutRequestID,
    });
    // TODO: Update Firestore order status to 'paid' using Admin SDK if desired
  } else {
    console.log('❌ M-Pesa Payment Failed:', { resultCode, checkoutRequestID, desc: body.ResultDesc });
  }

  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

// ── POST /mpesa/query ─────────────────────────────────
// Query transaction status
app.post('/mpesa/query', async (req, res) => {
  try {
    const { checkoutRequestID } = req.body;
    const token = await getMpesaToken();
    const { timestamp, password } = getMpesaTimestampAndPassword();

    const response = await axios.post(
      `${BASE_URL}/mpesa/stkpushquery/v1/query`,
      {
        BusinessShortCode: SHORTCODE,
        Password:          password,
        Timestamp:         timestamp,
        CheckoutRequestID: checkoutRequestID,
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    const data = response.data;
    res.json({
      success: data.ResultCode === '0',
      resultCode: data.ResultCode,
      message: data.ResultDesc,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.response?.data?.errorMessage || 'Query failed' });
  }
});

// ── Start server ──────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌸 Trift With Ruth server running on port ${PORT} [${MPESA_ENV}]`);
});
