/**
 * Dashboard test — simulates concurrent company admins loading their dashboards.
 * 3 VUs, 2 minutes. Each VU hits the analytics aggregation endpoints with realistic pacing.
 *
 * This is the heaviest read path: MongoDB aggregation pipelines over the full
 * transactions collection, grouped by brand/store/product. Critical to measure
 * after adding the [tenantId, createdAt] index.
 *
 * Required env vars:
 *   K6_COMPANY_SLUG    — company slug (used for company-login)
 *   K6_COMPANY_USER    — company admin username
 *   K6_COMPANY_PASS    — company admin password
 *   K6_BRAND_ID        — any valid brand ID in the company (for top-products query)
 *   K6_TENANT_ID       — store tenant ID (for store-level reports)
 *   K6_STORE_ADMIN_USER — store admin username
 *   K6_STORE_ADMIN_PASS — store admin password
 *
 * Optional:
 *   K6_BASE_URL — defaults to http://localhost:3000/api/v1
 *
 * Run:
 *   k6 run \
 *     -e K6_COMPANY_SLUG=greatserve \
 *     -e K6_COMPANY_USER=admin \
 *     -e K6_COMPANY_PASS=password \
 *     -e K6_BRAND_ID=<id> \
 *     -e K6_TENANT_ID=<id> \
 *     -e K6_STORE_ADMIN_USER=storeadmin \
 *     -e K6_STORE_ADMIN_PASS=password \
 *     load-tests/scenarios/dashboard.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { companyLogin, login, authHeaders, dateRange, analyticsThresholds, BASE_URL } from '../config.js';

export const options = {
  vus: 3,
  duration: '2m',
  thresholds: analyticsThresholds,
};

export default function () {
  const { startDate, endDate } = dateRange(30);
  const brandId = __ENV.K6_BRAND_ID;
  const dateParams = `startDate=${startDate}&endDate=${endDate}`;

  // VUs 1-2: company admin dashboard (analytics endpoints)
  if (__VU <= 2) {
    const token = companyLogin(
      __ENV.K6_COMPANY_SLUG,
      __ENV.K6_COMPANY_USER,
      __ENV.K6_COMPANY_PASS,
    );
    if (!token) return;
    const headers = authHeaders(token);

    const overview = http.get(
      `${BASE_URL}/analytics/company/overview?${dateParams}`,
      { ...headers, tags: { endpoint: 'analytics' } },
    );
    check(overview, { 'overview 200': (r) => r.status === 200 });
    sleep(0.5);

    const topBrands = http.get(
      `${BASE_URL}/analytics/company/top-brands?${dateParams}`,
      { ...headers, tags: { endpoint: 'analytics' } },
    );
    check(topBrands, { 'top-brands 200': (r) => r.status === 200 });
    sleep(0.5);

    const topProducts = http.get(
      `${BASE_URL}/analytics/company/top-products?${dateParams}&brandId=${brandId}`,
      { ...headers, tags: { endpoint: 'analytics' } },
    );
    check(topProducts, { 'top-products 200': (r) => r.status === 200 });
    sleep(0.5);

    const topStores = http.get(
      `${BASE_URL}/analytics/company/top-stores?${dateParams}`,
      { ...headers, tags: { endpoint: 'analytics' } },
    );
    check(topStores, { 'top-stores 200': (r) => r.status === 200 });
    sleep(0.5);

    const growth = http.get(
      `${BASE_URL}/analytics/company/growth?${dateParams}`,
      { ...headers, tags: { endpoint: 'analytics' } },
    );
    check(growth, { 'growth 200': (r) => r.status === 200 });

    // Realistic admin browsing pause between dashboard refreshes
    sleep(5);
  }

  // VU 3: store admin hitting store-level report (different role, different endpoint)
  if (__VU === 3) {
    const token = login(
      __ENV.K6_STORE_SLUG,
      __ENV.K6_STORE_ADMIN_USER,
      __ENV.K6_STORE_ADMIN_PASS,
    );
    if (!token) return;
    const headers = authHeaders(token);

    const daily = http.get(
      `${BASE_URL}/reports/daily`,
      { ...headers, tags: { endpoint: 'reports' } },
    );
    check(daily, { 'daily report 200': (r) => r.status === 200 });
    sleep(0.5);

    const analytics = http.get(
      `${BASE_URL}/reports/analytics?${dateParams}`,
      { ...headers, tags: { endpoint: 'reports' } },
    );
    check(analytics, { 'analytics report 200': (r) => r.status === 200 });

    sleep(5);
  }
}
