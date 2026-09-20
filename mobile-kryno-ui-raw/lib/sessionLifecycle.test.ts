import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionLifecycle, SessionChangedError } from './sessionLifecycle';

const original = { user: 'A', accessToken: 'access-1', refreshToken: 'refresh-1' };
const rotated = { accessToken: 'access-2', refreshToken: 'refresh-2' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function fixture() {
  const saved: (typeof original | null)[] = [];
  const published: (typeof original | null)[] = [];
  const deps = {
    async persist(value: typeof original | null) { saved.push(value); },
    publish(value: typeof original | null) { published.push(value); }
  };
  return { saved, published, deps, lifecycle: new SessionLifecycle(deps) };
}

test('concurrent expired requests share one refresh and persist before publishing', async () => {
  const f = fixture();
  await f.lifecycle.replace(original);
  let exchanges = 0;
  const exchange = async () => { exchanges++; return rotated; };
  const results = await Promise.all(Array.from({ length: 20 }, () => f.lifecycle.refresh(exchange)));
  assert.equal(exchanges, 1);
  assert.equal(results.every((result) => result.refreshToken === rotated.refreshToken), true);
  assert.deepEqual(f.saved.at(-1), f.published.at(-1));
});

test('late 401 responses reuse the current access token without extra rotation', async () => {
  const f = fixture();
  await f.lifecycle.replace(original);
  await f.lifecycle.refresh(async () => rotated);
  const next = await f.lifecycle.refresh(async () => { throw new Error('must not rotate twice'); }, original.accessToken);
  assert.equal(next.accessToken, rotated.accessToken);
});

test('logout during refresh cannot resurrect the old session', async () => {
  const f = fixture();
  await f.lifecycle.replace(original);
  const response = deferred<typeof rotated>();
  const request = f.lifecycle.refresh(() => response.promise);
  const rejected = assert.rejects(request, SessionChangedError);
  await f.lifecycle.replace(null);
  response.resolve(rotated);
  await rejected;
  assert.equal(f.lifecycle.current(), null);
  assert.equal(f.saved.at(-1), null);
});

test('old refresh completion cannot overwrite a new account', async () => {
  const f = fixture();
  await f.lifecycle.replace(original);
  const response = deferred<typeof rotated>();
  const request = f.lifecycle.refresh(() => response.promise);
  const rejected = assert.rejects(request, SessionChangedError);
  const accountB = { user: 'B', accessToken: 'B-access', refreshToken: 'B-refresh' };
  await f.lifecycle.replace(accountB);
  response.resolve(rotated);
  await rejected;
  assert.deepEqual(f.lifecycle.current(), accountB);
  assert.deepEqual(f.saved.at(-1), accountB);
});

test('secure-storage retry reuses the rotated result, not an already consumed refresh token', async () => {
  const f = fixture();
  await f.lifecycle.replace(original);
  const persist = f.deps.persist;
  f.deps.persist = async () => { throw new Error('storage temporarily locked'); };
  let exchanges = 0;
  const exchange = async () => { exchanges++; return rotated; };
  await assert.rejects(f.lifecycle.refresh(exchange));
  f.deps.persist = persist;
  const next = await f.lifecycle.refresh(exchange);
  assert.equal(exchanges, 1);
  assert.equal(next.refreshToken, rotated.refreshToken);
});

test('network failure retains the existing session and permits a later attempt', async () => {
  const f = fixture();
  await f.lifecycle.replace(original);
  await assert.rejects(f.lifecycle.refresh(async () => { throw new Error('offline'); }));
  assert.deepEqual(f.lifecycle.current(), original);
  assert.equal((await f.lifecycle.refresh(async () => rotated)).accessToken, rotated.accessToken);
});
