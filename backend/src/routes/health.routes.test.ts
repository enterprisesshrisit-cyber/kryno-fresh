import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { registerHealthRoutes } from './health.routes.js';

class BrokenStore {
  incr(_key: string, callback: (error: Error) => void) { callback(new Error('Redis unavailable')); }
  child() { return new BrokenStore(); }
}

test('liveness succeeds during Redis outage but normal routes stay rate-limited', async () => {
  const app = Fastify();
  await app.register(rateLimit, { store: BrokenStore, skipOnError: false });
  registerHealthRoutes(app, {
    environment: 'production',
    async database() { throw new Error('must not be called by liveness'); },
    async redis() { throw new Error('unavailble'); }
  });
  app.get('/protected-fixture', async () => ({ success: true }));
  try {
    assert.equal((await app.inject('/api/health')).statusCode, 200);
    assert.equal((await app.inject('/protected-fixture')).statusCode, 500);
    const ready = await app.inject('/api/ready');
    assert.equal(ready.statusCode, 503);
    assert.deepEqual(ready.json().checks, { database: 'failed', redis: 'failed' });
    assert.equal(ready.body.includes('unavailable'), false);
  } finally { await app.close(); }
});

test('production readiness requires both DB and Redis', async () => {
  const app = Fastify();
  registerHealthRoutes(app, { environment: 'production', async database() {}, async redis() {} });
  try { assert.equal((await app.inject('/api/ready')).statusCode, 200); }
  finally { await app.close(); }
});

test('readiness is bounded when a dependency never responds', async () => {
  const app = Fastify();
  registerHealthRoutes(app, { environment: 'production', async database() {}, redis: () => new Promise(() => {}), timeoutMs: 10 });
  try {
    const response = await app.inject('/api/ready');
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().checks.redis, 'failed');
  } finally { await app.close(); }
});

test('production cannot report ready with Redis missing', async () => {
  const app = Fastify();
  registerHealthRoutes(app, { environment: 'production', async database() {} });
  try { assert.equal((await app.inject('/api/ready')).statusCode, 503); }
  finally { await app.close(); }
});
