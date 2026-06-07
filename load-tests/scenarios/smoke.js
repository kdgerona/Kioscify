/**
 * Smoke test — run before every deployment.
 * 1 VU, 30 seconds. Validates the golden path: login → browse products → post a transaction.
 *
 * Required env vars:
 *   K6_STORE_SLUG_1    — store slug (e.g. mr-lemon-maasin)
 *   K6_CASHIER_USER_1  — cashier username
 *   K6_CASHIER_PASS_1  — cashier password
 *   K6_PRODUCT_ID_1    — any valid product ID in that store's brand catalog
 *
 * Optional:
 *   K6_BASE_URL        — defaults to http://localhost:3000/api/v1
 *
 * Run:
 *   k6 run \
 *     -e K6_TENANT_ID=<id> \
 *     -e K6_CASHIER_USER=cashier1 \
 *     -e K6_CASHIER_PASS=password \
 *     -e K6_PRODUCT_ID=<id> \
 *     load-tests/scenarios/smoke.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { login, authHeaders, jsonBody, randomId, thresholds, BASE_URL } from '../config.js';

export const options = {
  vus: 1,
  duration: '30s',
  thresholds,
};

export default function () {
  const storeSlug = __ENV.K6_STORE_SLUG_1;
  const productId = __ENV.K6_PRODUCT_ID_1;

  const token = login(storeSlug, __ENV.K6_CASHIER_USER_1, __ENV.K6_CASHIER_PASS_1);
  if (!token) return;

  const headers = authHeaders(token);

  const products = http.get(`${BASE_URL}/products`, headers);
  check(products, { 'GET /products 200': (r) => r.status === 200 });

  const txRes = http.post(
    `${BASE_URL}/transactions`,
    jsonBody({
      transactionId: `TXN${randomId()}`,
      subtotal: 150,
      total: 150,
      paymentMethod: 'CASH',
      cashReceived: 200,
      change: 50,
      clientId: randomId(),
      items: [{ productId, quantity: 1, subtotal: 150 }],
    }),
    headers,
  );
  check(txRes, {
    'POST /transactions 201': (r) => r.status === 201,
    'no duplicate error': (r) => r.status !== 500,
  });

  sleep(1);
}
