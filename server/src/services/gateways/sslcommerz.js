/**
 * SSLCommerz (Bangladesh) hosted payment gateway.
 * Docs: https://developer.sslcommerz.com/doc/v4/
 *
 * We never trust what the browser or the IPN post says about a payment:
 * every result is confirmed with SSLCommerz's validation API (server-to-server)
 * before an invoice is credited.
 */
import { env } from '../../config/env.js';

const hosts = () =>
  env.SSLCOMMERZ_SANDBOX
    ? { init: 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php', validate: 'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php' }
    : { init: 'https://securepay.sslcommerz.com/gwprocess/v4/api.php', validate: 'https://securepay.sslcommerz.com/validator/api/validationserverAPI.php' };

export const isConfigured = () => Boolean(env.SSLCOMMERZ_STORE_ID && env.SSLCOMMERZ_STORE_PASSWORD && env.API_PUBLIC_URL);

/** Start a hosted checkout session; returns the URL to send the payer to. */
export async function initSession({ tranId, amount, customer, productName }) {
  const callback = (result) => `${env.API_PUBLIC_URL}/api/payments/online/return/${result}`;
  const body = new URLSearchParams({
    store_id: env.SSLCOMMERZ_STORE_ID,
    store_passwd: env.SSLCOMMERZ_STORE_PASSWORD,
    total_amount: amount.toFixed(2),
    currency: 'BDT',
    tran_id: tranId,
    success_url: callback('success'),
    fail_url: callback('fail'),
    cancel_url: callback('cancel'),
    ipn_url: `${env.API_PUBLIC_URL}/api/payments/online/ipn`,
    cus_name: customer.name,
    cus_email: customer.email || 'noreply@example.com',
    cus_phone: customer.phone || '01700000000',
    cus_add1: customer.address || 'Bangladesh',
    cus_city: 'Dhaka',
    cus_country: 'Bangladesh',
    shipping_method: 'NO',
    product_name: productName.slice(0, 250),
    product_category: 'Education',
    product_profile: 'non-physical-goods',
  });
  const res = await fetch(hosts().init, { method: 'POST', body, signal: AbortSignal.timeout(15000) });
  const data = await res.json();
  if (data.status !== 'SUCCESS' || !data.GatewayPageURL) {
    throw new Error(`SSLCommerz session failed: ${data.failedreason ?? data.status ?? res.status}`);
  }
  return { gatewayUrl: data.GatewayPageURL, sessionKey: data.sessionkey };
}

/** Ask SSLCommerz whether a transaction really succeeded. */
export async function validateTransaction(valId) {
  const url = new URL(hosts().validate);
  url.search = new URLSearchParams({
    val_id: valId,
    store_id: env.SSLCOMMERZ_STORE_ID,
    store_passwd: env.SSLCOMMERZ_STORE_PASSWORD,
    format: 'json',
  }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const data = await res.json();
  return {
    valid: ['VALID', 'VALIDATED'].includes(data.status),
    tranId: data.tran_id,
    amount: Number(data.amount),
    currency: data.currency,
    raw: data,
  };
}
