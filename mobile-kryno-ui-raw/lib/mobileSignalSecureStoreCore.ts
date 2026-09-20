import { Buffer } from 'buffer';
import type { Direction, KeyPairType, SessionRecordType, StorageType } from '@privacyresearch/libsignal-protocol-typescript';

export const SIGNAL_STORE_PREFIX = 'kryno_mobile_signal';
const SIGNAL_INDEX_PREFIX = 'kryno_mobile_signal_secure_index';

type SerializedKeyPair = {
  pubKey: string;
  privKey: string;
};

export type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
};

export type SecureStoreLike = {
  getItemAsync(key: string, options?: unknown): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: unknown): Promise<void>;
  deleteItemAsync(key: string, options?: unknown): Promise<void>;
  isAvailableAsync?: () => Promise<boolean>;
};

export type SecureSignalStorageDeps = {
  asyncStorage: AsyncStorageLike;
  secureStore: SecureStoreLike;
  secureOptions?: unknown;
};

export class SignalSecureStorageError extends Error {
  constructor(message = 'Private chat keys could not be opened from secure device storage.') {
    super(message);
    this.name = 'SignalSecureStorageError';
  }
}

export function toBase64(buffer: ArrayBuffer) {
  return Buffer.from(buffer).toString('base64');
}

export function fromBase64(value: string) {
  const buffer = Buffer.from(value, 'base64');
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

export function signalRawKey(namespace: string, suffix: string) {
  return `${SIGNAL_STORE_PREFIX}:${namespace}:${suffix}`;
}

export function signalSecureStoreKey(rawKey: string) {
  return `${SIGNAL_STORE_PREFIX}.${Buffer.from(rawKey, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')}`;
}

function serializeKeyPair(keyPair: KeyPairType): SerializedKeyPair {
  return {
    pubKey: toBase64(keyPair.pubKey),
    privKey: toBase64(keyPair.privKey)
  };
}

function deserializeKeyPair(serialized?: SerializedKeyPair): KeyPairType | undefined {
  if (!serialized) {
    return undefined;
  }

  return {
    pubKey: fromBase64(serialized.pubKey),
    privKey: fromBase64(serialized.privKey)
  };
}

export class SecureSignalStoreCore implements StorageType {
  private readonly namespace: string;
  private readonly rawPrefix: string;
  private readonly secureIndexKey: string;
  private readonly deps: SecureSignalStorageDeps;
  private migrationPromise: Promise<void> | null = null;

  constructor(namespace: string, deps: SecureSignalStorageDeps) {
    this.namespace = namespace;
    this.rawPrefix = `${SIGNAL_STORE_PREFIX}:${namespace}`;
    this.secureIndexKey = `${SIGNAL_INDEX_PREFIX}:${namespace}`;
    this.deps = deps;
  }

  private key(suffix: string) {
    return signalRawKey(this.namespace, suffix);
  }

  private async readIndex() {
    const stored = await this.deps.asyncStorage.getItem(this.secureIndexKey);
    if (!stored) {
      return [] as string[];
    }

    try {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
    } catch {
      return [];
    }
  }

  private async writeIndex(rawKeys: string[]) {
    await this.deps.asyncStorage.setItem(this.secureIndexKey, JSON.stringify(Array.from(new Set(rawKeys)).sort()));
  }

  private async addIndexKey(rawKey: string) {
    const keys = await this.readIndex();
    if (!keys.includes(rawKey)) {
      keys.push(rawKey);
      await this.writeIndex(keys);
    }
  }

  private async removeIndexKey(rawKey: string) {
    const keys = await this.readIndex();
    const next = keys.filter((entry) => entry !== rawKey);
    if (next.length !== keys.length) {
      await this.writeIndex(next);
    }
  }

  private async assertSecureStoreAvailable() {
    if (this.deps.secureStore.isAvailableAsync) {
      const available = await this.deps.secureStore.isAvailableAsync();
      if (!available) {
        throw new SignalSecureStorageError('Secure device storage is not available for private chat keys.');
      }
    }
  }

  private async setSecureRaw(rawKey: string, value: string) {
    const secureKey = signalSecureStoreKey(rawKey);
    await this.deps.secureStore.setItemAsync(secureKey, value, this.deps.secureOptions);
    const verified = await this.deps.secureStore.getItemAsync(secureKey, this.deps.secureOptions);
    if (verified !== value) {
      throw new SignalSecureStorageError('Secure device storage verification failed for private chat keys.');
    }
    await this.addIndexKey(rawKey);
  }

  private async getSecureRaw(rawKey: string) {
    await this.ensureMigrated();
    return this.deps.secureStore.getItemAsync(signalSecureStoreKey(rawKey), this.deps.secureOptions);
  }

  private async deleteSecureRaw(rawKey: string) {
    await this.ensureMigrated();
    await this.deps.secureStore.deleteItemAsync(signalSecureStoreKey(rawKey), this.deps.secureOptions);
    await this.deps.asyncStorage.removeItem(rawKey);
    await this.removeIndexKey(rawKey);
  }

  async ensureMigrated() {
    if (!this.migrationPromise) {
      this.migrationPromise = this.migrateLegacyAsyncStorage();
    }

    return this.migrationPromise;
  }

  private async migrateLegacyAsyncStorage() {
    await this.assertSecureStoreAvailable();
    const keys = await this.deps.asyncStorage.getAllKeys();
    const legacyKeys = keys.filter((entry) => entry.startsWith(`${this.rawPrefix}:`));
    const migrated: string[] = [];

    try {
      for (const rawKey of legacyKeys) {
        const value = await this.deps.asyncStorage.getItem(rawKey);
        if (value === null) {
          continue;
        }

        await this.setSecureRaw(rawKey, value);
        migrated.push(rawKey);
      }

      for (const rawKey of migrated) {
        await this.deps.asyncStorage.removeItem(rawKey);
      }
    } catch (error) {
      throw error instanceof SignalSecureStorageError
        ? error
        : new SignalSecureStorageError('Private chat key migration to secure storage failed.');
    }
  }

  async getIdentityKeyPair() {
    const value = await this.getSecureRaw(this.key('identity'));
    return deserializeKeyPair(value ? JSON.parse(value) : undefined);
  }

  async setIdentityKeyPair(value: KeyPairType) {
    await this.ensureMigrated();
    await this.setSecureRaw(this.key('identity'), JSON.stringify(serializeKeyPair(value)));
  }

  async getLocalRegistrationId() {
    const value = await this.getSecureRaw(this.key('registrationId'));
    return value ? Number(value) : undefined;
  }

  async setLocalRegistrationId(value: number) {
    await this.ensureMigrated();
    await this.setSecureRaw(this.key('registrationId'), String(value));
  }

  async isTrustedIdentity(identifier: string, identityKey: ArrayBuffer, _direction: Direction) {
    const storedIdentity = await this.getSecureRaw(this.key(`identity:${identifier}`));
    if (!storedIdentity) {
      return true;
    }

    return storedIdentity === toBase64(identityKey);
  }

  async saveIdentity(encodedAddress: string, publicKey: ArrayBuffer) {
    const key = this.key(`identity:${encodedAddress}`);
    const existing = await this.getSecureRaw(key);
    const next = toBase64(publicKey);
    await this.setSecureRaw(key, next);
    return existing !== next;
  }

  async loadPreKey(encodedAddress: string | number) {
    const value = await this.getSecureRaw(this.key(`prekey:${encodedAddress}`));
    return deserializeKeyPair(value ? JSON.parse(value) : undefined);
  }

  async storePreKey(keyId: number | string, keyPair: KeyPairType) {
    await this.ensureMigrated();
    await this.setSecureRaw(this.key(`prekey:${keyId}`), JSON.stringify(serializeKeyPair(keyPair)));
  }

  async removePreKey(keyId: number | string) {
    await this.deleteSecureRaw(this.key(`prekey:${keyId}`));
  }

  async storeSession(encodedAddress: string, record: SessionRecordType) {
    await this.ensureMigrated();
    await this.setSecureRaw(this.key(`session:${encodedAddress}`), JSON.stringify(record));
  }

  async loadSession(encodedAddress: string) {
    const value = await this.getSecureRaw(this.key(`session:${encodedAddress}`));
    return value ? (JSON.parse(value) as SessionRecordType) : undefined;
  }

  async loadSignedPreKey(keyId: number | string) {
    const value = await this.getSecureRaw(this.key(`signed-prekey:${keyId}`));
    return deserializeKeyPair(value ? JSON.parse(value) : undefined);
  }

  async storeSignedPreKey(keyId: number | string, keyPair: KeyPairType) {
    await this.ensureMigrated();
    await this.setSecureRaw(this.key(`signed-prekey:${keyId}`), JSON.stringify(serializeKeyPair(keyPair)));
  }

  async removeSignedPreKey(keyId: number | string) {
    await this.deleteSecureRaw(this.key(`signed-prekey:${keyId}`));
  }

  async getValue<T>(suffix: string) {
    const value = await this.getSecureRaw(this.key(suffix));
    return value ? (JSON.parse(value) as T) : undefined;
  }

  async setValue(suffix: string, value: unknown) {
    await this.ensureMigrated();
    await this.setSecureRaw(this.key(suffix), JSON.stringify(value));
  }

  async clearNamespaceState() {
    await this.ensureMigrated();
    const indexedKeys = await this.readIndex();
    const legacyKeys = (await this.deps.asyncStorage.getAllKeys()).filter((entry) => entry.startsWith(`${this.rawPrefix}:`));
    const rawKeys = Array.from(new Set([...indexedKeys, ...legacyKeys]));

    await Promise.all(
      rawKeys.map(async (rawKey) => {
        await this.deps.secureStore.deleteItemAsync(signalSecureStoreKey(rawKey), this.deps.secureOptions);
        await this.deps.asyncStorage.removeItem(rawKey);
      })
    );

    await this.deps.asyncStorage.removeItem(this.secureIndexKey);
  }
}
