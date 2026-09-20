import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionStorage, SessionStorageError } from './sessionStorage';

function setup() {
  const secure = new Map<string, string>();
  const legacy = new Map<string, string>();
  const deps = {
    secure: {
      async getItemAsync(key: string) { return secure.get(key) ?? null; },
      async setItemAsync(key: string, value: string) { secure.set(key, value); },
      async deleteItemAsync(key: string) { secure.delete(key); }
    },
    legacy: {
      async getItem(key: string) { return legacy.get(key) ?? null; },
      async removeItem(key: string) { legacy.delete(key); }
    }
  };
  return { secure, legacy, deps, store: createSessionStorage('session', deps) };
}

test('legacy auth tokens migrate even when SecureStore returns null', async () => {
  const f = setup();
  f.legacy.set('session', 'test-token');
  assert.equal(await f.store.read(), 'test-token');
  assert.equal(f.secure.get('session'), 'test-token');
  assert.equal(f.legacy.has('session'), false);
});

test('failed secure writes never fall back to plaintext and preserve legacy migration input', async () => {
  const f = setup();
  f.legacy.set('session', 'old');
  f.deps.secure.setItemAsync = async () => { throw new Error('native storage unavailable'); };
  await assert.rejects(f.store.write('new'), SessionStorageError);
  await assert.rejects(f.store.read(), SessionStorageError);
  assert.equal(f.legacy.get('session'), 'old');
});

test('migration verifies the secure copy before deleting legacy tokens', async () => {
  const f = setup();
  f.legacy.set('session', 'old');
  f.deps.secure.setItemAsync = async () => {};
  await assert.rejects(f.store.read(), SessionStorageError);
  assert.equal(f.legacy.get('session'), 'old');
});

test('new secure tokens win over stale legacy tokens', async () => {
  const f = setup();
  f.secure.set('session', 'new');
  f.legacy.set('session', 'old');
  assert.equal(await f.store.read(), 'new');
  assert.equal(f.legacy.has('session'), false);
});

test('logout attempts both stores even if secure deletion fails', async () => {
  const f = setup();
  f.legacy.set('session', 'old');
  f.deps.secure.deleteItemAsync = async () => { throw new Error('unavailable'); };
  await assert.rejects(f.store.clear(), SessionStorageError);
  assert.equal(f.legacy.has('session'), false);
});

test('a failed storage operation does not poison subsequent retries', async () => {
  const f = setup();
  const write = f.deps.secure.setItemAsync;
  f.deps.secure.setItemAsync = async () => { throw new Error('temporary'); };
  await assert.rejects(f.store.write('token'));
  f.deps.secure.setItemAsync = write;
  await f.store.write('token');
  assert.equal(await f.store.read(), 'token');
});
