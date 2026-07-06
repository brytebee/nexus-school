/**
 * paystack-service.js
 * Wrapper for Paystack API integration.
 */
"use strict";

const crypto = require('crypto');

const PAYSTACK_BASE = 'https://api.paystack.co';

function getSecret() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new Error('PAYSTACK_SECRET_KEY not configured');
  }
  return key;
}

async function paystackFetch(path, options = {}) {
  const url = `${PAYSTACK_BASE}${path}`;
  const headers = {
    'Authorization': `Bearer ${getSecret()}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const json = await response.json();
  if (!response.ok || !json.status) {
    throw new Error(json.message || `Paystack error ${response.status}`);
  }
  return json.data;
}

async function getBanks() {
  return paystackFetch('/bank?country=nigeria&per_page=100');
}

async function resolveAccount(accountNumber, bankCode) {
  return paystackFetch(`/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`);
}

async function createSubaccount(businessName, bankCode, accountNumber, percentageCharge = 100) {
  return paystackFetch('/subaccount', {
    method: 'POST',
    body: JSON.stringify({
      business_name: businessName,
      settlement_bank: bankCode,
      account_number: accountNumber,
      percentage_charge: percentageCharge,
    })
  });
}

async function initializeTransaction(params) {
  const body = {
    email: params.email,
    amount: params.amount, // in kobo
    reference: params.reference,
    callback_url: params.callbackUrl,
    metadata: params.metadata,
  };
  
  if (params.subaccountCode) {
    body.subaccount = params.subaccountCode;
    body.bearer = params.bearer || 'subaccount';
  }

  return paystackFetch('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

async function verifyTransaction(reference) {
  return paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`);
}

async function initiateRefund(transactionIdOrRef, amountKobo = null, reason = "") {
  const body = {
    transaction: transactionIdOrRef,
  };
  if (amountKobo) {
    body.amount = amountKobo;
  }
  if (reason) {
    body.customer_note = reason;
  }
  return paystackFetch('/refund', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

function verifyWebhookSignature(body, signature) {
  const secret = process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signature) return false;
  
  const hash = crypto.createHmac('sha512', secret).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch (_) {
    return false;
  }
}

module.exports = {
  getBanks,
  resolveAccount,
  createSubaccount,
  initializeTransaction,
  verifyTransaction,
  initiateRefund,
  verifyWebhookSignature,
};

