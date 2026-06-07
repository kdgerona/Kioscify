/**
 * Sync-burst test — simulates 5 stores coming back online simultaneously
 * and flushing their offline queues.
 * 5 VUs, 2 minutes. Each VU represents one store's cashier syncing a small queue.
 *
 * Each VU syncs: 3 transactions → 1 expense → 1 submitted report
 * This matches the typical mobile offline queue after a brief connectivity drop.
 *
 * Required env vars (credentials for 5 cashier accounts, one per store):
 *   K6_TENANT_ID_1 .. K6_TENANT_ID_5
 *   K6_CASHIER_USER_1 .. K6_CASHIER_USER_5
 *   K6_CASHIER_PASS_1 .. K6_CASHIER_PASS_5
 *   K6_PRODUCT_ID_1 .. K6_PRODUCT_ID_5   — one product ID per store's catalog
 *
 * For a single-store test (5 VUs hitting the same store), pass identical values for _1 through _5.
 *
 * Optional:
 *   K6_BASE_URL — defaults to http://localhost:3000/api/v1
 *
 * Run:
 *   k6 run \
 *     -e K6_TENANT_ID_1=<id> -e K6_CASHIER_USER_1=cashier1 -e K6_CASHIER_PASS_1=pass \
 *     -e K6_PRODUCT_ID_1=<id> \
 *     ... (repeat for _2 through _5 or use same values) \
 *     load-tests/scenarios/sync-burst.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { login, authHeaders, jsonBody, randomId, today, thresholds, BASE_URL } from '../config.js';

export const options = {
  vus: 5,
  duration: '2m',
  thresholds,
};

export default function () {
  const vuIndex = __VU; // 1-based VU index
  const suffix = vuIndex <= 5 ? vuIndex : ((vuIndex - 1) % 5) + 1;

  const storeSlug = __ENV[`K6_STORE_SLUG_${suffix}`] || __ENV.K6_STORE_SLUG_1;
  const username = __ENV[`K6_CASHIER_USER_${suffix}`] || __ENV.K6_CASHIER_USER_1;
  const password = __ENV[`K6_CASHIER_PASS_${suffix}`] || __ENV.K6_CASHIER_PASS_1;
  const productId = __ENV[`K6_PRODUCT_ID_${suffix}`] || __ENV.K6_PRODUCT_ID_1;

  const token = login(storeSlug, username, password);
  if (!token) return;

  const headers = authHeaders(token);
  const syncedTxIds = [];

  // Sync 3 transactions (mimics small offline queue)
  for (let i = 0; i < 3; i++) {
    const res = http.post(
      `${BASE_URL}/transactions`,
      jsonBody({
        transactionId: `TXN${randomId()}`,
        subtotal: 120 + i * 30,
        total: 120 + i * 30,
        paymentMethod: 'CASH',
        cashReceived: 200,
        change: 80 - i * 30,
        clientId: randomId(),
        timestamp: new Date().toISOString(),
        items: [{ productId, quantity: 1, subtotal: 120 + i * 30 }],
      }),
      headers,
    );
    check(res, {
      [`tx ${i + 1} synced`]: (r) => r.status === 201 || r.status === 409,
    });
    if (res.status === 201) {
      try {
        syncedTxIds.push(JSON.parse(res.body).id);
      } catch (_) {}
    }
    sleep(0.5);
  }

  // Sync 1 expense
  const expenseClientId = randomId();
  const expRes = http.post(
    `${BASE_URL}/expenses`,
    jsonBody({
      description: 'Load test expense',
      amount: 250,
      category: 'SUPPLIES',
      date: new Date().toISOString(),
      clientId: expenseClientId,
    }),
    headers,
  );
  check(expRes, {
    'expense synced': (r) => r.status === 201 || r.status === 409,
  });

  const syncedExpenseId = expRes.status === 201 ? JSON.parse(expRes.body).id : null;

  sleep(0.5);

  // Sync 1 submitted report (daily snapshot)
  const reportDate = today();
  const reportRes = http.post(
    `${BASE_URL}/submitted-reports`,
    jsonBody({
      reportDate,
      periodStart: `${reportDate}T00:00:00.000Z`,
      periodEnd: `${reportDate}T23:59:59.999Z`,
      clientId: randomId(),
      transactionIds: syncedTxIds,
      expenseIds: syncedExpenseId ? [syncedExpenseId] : [],
      salesSnapshot: {
        totalAmount: 360,
        transactionCount: 3,
        averageTransaction: 120,
        totalItemsSold: 3,
        paymentMethodBreakdown: { CASH: { total: 360, count: 3 } },
      },
      expensesSnapshot: {
        totalAmount: 250,
        expenseCount: 1,
        averageExpense: 250,
        categoryBreakdown: { SUPPLIES: { total: 250, count: 1 } },
      },
      summarySnapshot: {
        grossProfit: 110,
        profitMargin: 30.6,
        netRevenue: 110,
      },
    }),
    headers,
  );
  check(reportRes, {
    'submitted report synced': (r) => r.status === 201 || r.status === 409,
  });

  sleep(2);
}
