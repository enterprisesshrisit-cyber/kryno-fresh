import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SecureSignalStoreCore,
  SignalSecureStorageError,
  signalRawKey,
  signalSecureStoreKey,
  toBase64,
  type AsyncStorageLike,
  type SecureStoreLike
} from './mobileSignalSecureStoreCore';

function bytes(values: number[]) {
  return new Uint8Array(values).buffer;
}

function createMemoryStores(options: { corruptSecureRead?: boolean } = {}) {
  const asyncValues = new Map<string, string>();
  const secureValues = new Map<string, string>();

  const asyncStorage: AsyncStorageLike = {
    async getItem(key) {
      return asyncValues.get(key) ?? null;
    },
    async setItem(key, value) {
      asyncValues.set(key, value);
    },
    async removeItem(key) {
      asyncValues.delete(key);
    },
    async getAllKeys() {
      return Array.from(asyncValues.keys());
    }
  };

  const secureStore: SecureStoreLike = {
    async getItemAsync(key) {
      if (options.corruptSecureRead && secureValues.has(key)) {
        return `${secureValues.get(key)}-corrupt`;
      }
      return secureValues.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      secureValues.set(key, value);
    },
    async deleteItemAsync(key) {
      secureValues.delete(key);
    },
    async isAvailableAsync() {
      return true;
    }
  };

  return { asyncStorage, secureStore, asyncValues, secureValues };
}

test('Signal secure store migrates legacy AsyncStorage private key material into SecureStore', async () => {
  const stores = createMemoryStores();
  const namespace = 'user-1:device-1';
  const identityRawKey = signalRawKey(namespace, 'identity');
  const legacyIdentity = JSON.stringify({
    pubKey: toBase64(bytes([1, 2, 3])),
    privKey: toBase64(bytes([4, 5, 6]))
  });

  stores.asyncValues.set(identityRawKey, legacyIdentity);

  const store = new SecureSignalStoreCore(namespace, {
    asyncStorage: stores.asyncStorage,
    secureStore: stores.secureStore
  });

  const identity = await store.getIdentityKeyPair();

  assert.equal(toBase64(identity!.pubKey), toBase64(bytes([1, 2, 3])));
  assert.equal(toBase64(identity!.privKey), toBase64(bytes([4, 5, 6])));
  assert.equal(stores.asyncValues.has(identityRawKey), false);
  assert.equal(stores.secureValues.get(signalSecureStoreKey(identityRawKey)), legacyIdentity);
});

test('Signal secure store does not delete legacy key material when secure write verification fails', async () => {
  const stores = createMemoryStores({ corruptSecureRead: true });
  const namespace = 'user-2:device-2';
  const identityRawKey = signalRawKey(namespace, 'identity');
  stores.asyncValues.set(
    identityRawKey,
    JSON.stringify({
      pubKey: toBase64(bytes([7, 8, 9])),
      privKey: toBase64(bytes([10, 11, 12]))
    })
  );

  const store = new SecureSignalStoreCore(namespace, {
    asyncStorage: stores.asyncStorage,
    secureStore: stores.secureStore
  });

  await assert.rejects(() => store.getIdentityKeyPair(), SignalSecureStorageError);
  assert.equal(stores.asyncValues.has(identityRawKey), true);
});

test('Signal secure store writes new sessions only to SecureStore-backed storage', async () => {
  const stores = createMemoryStores();
  const namespace = 'user-3:device-3';
  const sessionRawKey = signalRawKey(namespace, 'session:recipient-device.1');
  const store = new SecureSignalStoreCore(namespace, {
    asyncStorage: stores.asyncStorage,
    secureStore: stores.secureStore
  });

  await store.storeSession('recipient-device.1', { record: 'cipher-session' } as never);

  assert.equal(stores.asyncValues.has(sessionRawKey), false);
  assert.equal(stores.secureValues.get(signalSecureStoreKey(sessionRawKey)), JSON.stringify({ record: 'cipher-session' }));
});

test('Signal secure store keys are valid Expo SecureStore keys', () => {
  const rawKey = signalRawKey('user-4:device-4', 'signed-prekey:1');
  const secureKey = signalSecureStoreKey(rawKey);

  assert.match(secureKey, /^[\w.-]+$/);
  assert.equal(secureKey.includes(':'), false);
});
