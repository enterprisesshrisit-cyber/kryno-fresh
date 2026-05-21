import assert from 'node:assert/strict';
import test from 'node:test';
import { SlidingWindowRateLimiter, isAllowedCorsOrigin, sanitizeDownloadFileName } from './security.js';

test('sliding window limiter blocks after limit is reached', () => {
  const limiter = new SlidingWindowRateLimiter(2, 60_000);
  assert.equal(limiter.hit('ip:user', 1_000).allowed, true);
  assert.equal(limiter.hit('ip:user', 2_000).allowed, true);
  const blocked = limiter.hit('ip:user', 3_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
});

test('cors allowlist accepts app origin and cloudflare tunnel origins', () => {
  assert.equal(isAllowedCorsOrigin('https://example.trycloudflare.com', 'https://players-management-courtesy-reviewer.trycloudflare.com'), true);
  assert.equal(isAllowedCorsOrigin('https://players-management-courtesy-reviewer.trycloudflare.com', 'https://players-management-courtesy-reviewer.trycloudflare.com'), true);
  assert.equal(isAllowedCorsOrigin('http://localhost:5173', 'https://players-management-courtesy-reviewer.trycloudflare.com'), true);
});

test('cors allowlist rejects unrelated origins', () => {
  assert.equal(isAllowedCorsOrigin('https://evil.example.com', 'https://players-management-courtesy-reviewer.trycloudflare.com'), false);
});

test('sanitizeDownloadFileName strips dangerous characters', () => {
  assert.equal(sanitizeDownloadFileName('..\\bad/<name>?.png'), '.._bad_name_.png');
});
