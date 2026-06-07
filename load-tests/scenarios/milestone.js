/**
 * Milestone gate test — combined realistic load across all user types.
 * Run this before each growth milestone (Gate 0 baseline, then before each new batch of stores).
 * Save results to results/gate-N.json and compare against the baseline.
 *
 * 10 VUs, 5 minutes:
 *   VUs 1-5  → cashiers syncing (sync-burst pattern)
 *   VUs 6-7  → company admins on dashboard (analytics pattern)
 *   VUs 8-9  → store admins on reports
 *   VU  10   → smoke health check (golden path)
 *
 * Required env vars: all vars from sync-burst.js + dashboard.js + smoke.js
 * (see those files for the full list)
 *
 * Run and save baseline:
 *   k6 run \
 *     -e K6_TENANT_ID_1=<id> ... \
 *     --out json=load-tests/results/gate-0.json \
 *     load-tests/scenarios/milestone.js
 *
 * Compare against baseline using k6 Cloud or jq:
 *   jq '.metrics.http_req_duration.values.p95' load-tests/results/gate-0.json
 *   jq '.metrics.http_req_duration.values.p95' load-tests/results/gate-1.json
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import {
  login, companyLogin, authHeaders, jsonBody,
  randomId, today, dateRange, analyticsThresholds, BASE_URL,
} from '../config.js';

export const options = {
  vus: 10,
  duration: '5m',
  thresholds: analyticsThresholds,
};

function runCashierSync(vuIndex) {
  const suffix = ((vuIndex - 1) % 5) + 1;
  const storeSlug = __ENV[`K6_STORE_SLUG_${suffix}`] || __ENV.K6_STORE_SLUG_1;
  const username = __ENV[`K6_CASHIER_USER_${suffix}`] || __ENV.K6_CASHIER_USER_1;
  const password = __ENV[`K6_CASHIER_PASS_${suffix}`] || __ENV.K6_CASHIER_PASS_1;
  const productId = __ENV[`K6_PRODUCT_ID_${suffix}`] || __ENV.K6_PRODUCT_ID_1;

  const token = login(storeSlug, username, password);
  if (!token) return;
  const headers = authHeaders(token);

  for (let i = 0; i < 2; i++) {
    const res = http.post(
      `${BASE_URL}/transactions`,
      jsonBody({
        transactionId: `TXN${randomId()}`,
        subtotal: 100 + i * 50,
        total: 100 + i * 50,
        paymentMethod: 'CASH',
        cashReceived: 200,
        change: 100 - i * 50,
        clientId: randomId(),
        timestamp: new Date().toISOString(),
        items: [{ productId, quantity: 1, subtotal: 100 + i * 50 }],
      }),
      headers,
    );
    check(res, { 'milestone tx synced': (r) => r.status === 201 || r.status === 409 });
    sleep(0.5);
  }

  const expRes = http.post(
    `${BASE_URL}/expenses`,
    jsonBody({
      description: 'Milestone test expense',
      amount: 100,
      category: 'MISCELLANEOUS',
      clientId: randomId(),
    }),
    headers,
  );
  check(expRes, { 'milestone expense synced': (r) => r.status === 201 || r.status === 409 });
  sleep(2);
}

function runCompanyDashboard() {
  const { startDate, endDate } = dateRange(30);
  const brandId = __ENV.K6_BRAND_ID;
  const dateParams = `startDate=${startDate}&endDate=${endDate}`;

  const token = companyLogin(__ENV.K6_COMPANY_SLUG, __ENV.K6_COMPANY_USER, __ENV.K6_COMPANY_PASS);
  if (!token) return;
  const headers = authHeaders(token);

  const endpoints = [
    `${BASE_URL}/analytics/company/overview?${dateParams}`,
    `${BASE_URL}/analytics/company/top-brands?${dateParams}`,
    `${BASE_URL}/analytics/company/top-products?${dateParams}&brandId=${brandId}`,
    `${BASE_URL}/analytics/company/top-stores?${dateParams}`,
  ];

  for (const url of endpoints) {
    const res = http.get(url, { ...headers, tags: { endpoint: 'analytics' } });
    check(res, { 'analytics endpoint 200': (r) => r.status === 200 });
    sleep(0.5);
  }
  sleep(5);
}

function runStoreAdminReport() {
  const { startDate, endDate } = dateRange(30);
  const dateParams = `startDate=${startDate}&endDate=${endDate}`;

  const token = login(__ENV.K6_STORE_SLUG, __ENV.K6_STORE_ADMIN_USER, __ENV.K6_STORE_ADMIN_PASS);
  if (!token) return;
  const headers = authHeaders(token);

  const daily = http.get(`${BASE_URL}/reports/daily`, { ...headers, tags: { endpoint: 'reports' } });
  check(daily, { 'daily report 200': (r) => r.status === 200 });
  sleep(0.5);

  const analytics = http.get(
    `${BASE_URL}/reports/analytics?${dateParams}`,
    { ...headers, tags: { endpoint: 'reports' } },
  );
  check(analytics, { 'store analytics 200': (r) => r.status === 200 });
  sleep(5);
}

function runSmoke() {
  const storeSlug = __ENV.K6_STORE_SLUG_1;
  const productId = __ENV.K6_PRODUCT_ID_1;

  const token = login(storeSlug, __ENV.K6_CASHIER_USER_1, __ENV.K6_CASHIER_PASS_1);
  if (!token) return;
  const headers = authHeaders(token);

  const products = http.get(`${BASE_URL}/products`, headers);
  check(products, { 'smoke GET /products 200': (r) => r.status === 200 });

  const txRes = http.post(
    `${BASE_URL}/transactions`,
    jsonBody({
      transactionId: `TXN${randomId()}`,
      subtotal: 99,
      total: 99,
      paymentMethod: 'CASH',
      cashReceived: 100,
      change: 1,
      clientId: randomId(),
      items: [{ productId, quantity: 1, subtotal: 99 }],
    }),
    headers,
  );
  check(txRes, { 'smoke POST /transactions 201': (r) => r.status === 201 || r.status === 409 });
  sleep(3);
}

export default function () {
  const vu = __VU;

  if (vu >= 1 && vu <= 5) {
    runCashierSync(vu);
  } else if (vu === 6 || vu === 7) {
    runCompanyDashboard();
  } else if (vu === 8 || vu === 9) {
    runStoreAdminReport();
  } else {
    runSmoke();
  }
}
