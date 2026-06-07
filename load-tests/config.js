import http from 'k6/http';
import { check } from 'k6';

export const BASE_URL = __ENV.K6_BASE_URL || 'http://localhost:3000/api/v1';

export const thresholds = {
  http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: false }],
  http_req_duration: [{ threshold: 'p(95)<800', abortOnFail: false }],
};

export const analyticsThresholds = {
  ...thresholds,
  'http_req_duration{endpoint:analytics}': [{ threshold: 'p(95)<2000', abortOnFail: false }],
  'http_req_duration{endpoint:reports}': [{ threshold: 'p(95)<2000', abortOnFail: false }],
};

export function login(storeSlug, username, password) {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ storeSlug, username, password }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(res, { 'login succeeded': (r) => r.status === 201 || r.status === 200 });
  if (res.status !== 200 && res.status !== 201) return null;
  return JSON.parse(res.body).accessToken;
}

export function companyLogin(companySlug, username, password) {
  const res = http.post(
    `${BASE_URL}/auth/company-login`,
    JSON.stringify({ companySlug, username, password }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(res, { 'company login succeeded': (r) => r.status === 201 || r.status === 200 });
  if (res.status !== 200 && res.status !== 201) return null;
  return JSON.parse(res.body).accessToken;
}

export function authHeaders(token) {
  return {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
}

export function jsonBody(payload) {
  return JSON.stringify(payload);
}

export function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function dateRange(daysBack = 30) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - daysBack);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}
