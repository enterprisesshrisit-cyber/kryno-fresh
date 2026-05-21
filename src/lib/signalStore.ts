import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Direction, KeyPairType, SessionRecordType, StorageType } from '@privacyresearch/libsignal-protocol-typescript';

type StoredValue = unknown;

export type ConversationSummary = {
  conversationKey: string;
  lastMessageText: string;
  lastMessageAt: string;
  lastDirection: 'incoming' | 'outgoing';
  senderLabel: string;
};

export type AttachmentRecord = {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  durationSeconds?: number;
  aesKey?: string;
  iv?: string;
};

export type LocalMessageRecord = {
  id: string;
  conversationKey: string;
  direction: 'incoming' | 'outgoing';
  kind: 'text' | 'attachment' | 'voice';
  text: string;
  createdAt: string;
  senderLabel: string;
  attachment?: AttachmentRecord;
};

export type CallLogRecord = {
  id: string;
  ownerKey: string;
  conversationKey: string;
  remoteLabel: string;
  direction: 'incoming' | 'outgoing';
  mode: 'audio' | 'video';
  outcome: 'completed' | 'missed' | 'declined' | 'cancelled' | 'unavailable' | 'failed';
  statusText: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
};

interface KrynoDb extends DBSchema {
  kv: {
    key: string;
    value: StoredValue;
  };
  messages: {
    key: string;
    value: LocalMessageRecord;
    indexes: {
      'by-conversation': string;
    };
  };
  calls: {
    key: string;
    value: CallLogRecord;
    indexes: {
      'by-owner-conversation': [string, string];
      'by-owner-endedAt': [string, string];
    };
  };
}

type SerializedKeyPair = {
  pubKey: string;
  privKey: string;
};

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function serializeKeyPair(keyPair: KeyPairType): SerializedKeyPair {
  return {
    pubKey: toBase64(keyPair.pubKey),
    privKey: toBase64(keyPair.privKey)
  };
}

function deserializeKeyPair(serialized?: SerializedKeyPair): KeyPairType | undefined {
  if (!serialized) return undefined;
  return {
    pubKey: fromBase64(serialized.pubKey),
    privKey: fromBase64(serialized.privKey)
  };
}

async function openKrynoDb() {
  return openDB<KrynoDb>('kryno-fresh-signal', 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv');
      }

      if (!db.objectStoreNames.contains('messages')) {
        const store = db.createObjectStore('messages', { keyPath: 'id' });
        store.createIndex('by-conversation', 'conversationKey');
      }

      if (!db.objectStoreNames.contains('calls')) {
        const callsStore = db.createObjectStore('calls', { keyPath: 'id' });
        callsStore.createIndex('by-owner-conversation', ['ownerKey', 'conversationKey']);
        callsStore.createIndex('by-owner-endedAt', ['ownerKey', 'endedAt']);
      }
    }
  });
}

export class IndexedDbSignalStore implements StorageType {
  private dbPromise: Promise<IDBPDatabase<KrynoDb>>;
  private prefix: string;

  constructor(namespace: string) {
    this.dbPromise = openKrynoDb();
    this.prefix = `signal:${namespace}`;
  }

  private async getDb() {
    return this.dbPromise;
  }

  private key(suffix: string) {
    return `${this.prefix}:${suffix}`;
  }

  async getIdentityKeyPair() {
    const db = await this.getDb();
    const value = (await db.get('kv', this.key('identity'))) as SerializedKeyPair | undefined;
    return deserializeKeyPair(value);
  }

  async setIdentityKeyPair(value: KeyPairType) {
    const db = await this.getDb();
    await db.put('kv', serializeKeyPair(value), this.key('identity'));
  }

  async getLocalRegistrationId() {
    const db = await this.getDb();
    return (await db.get('kv', this.key('registrationId'))) as number | undefined;
  }

  async setLocalRegistrationId(value: number) {
    const db = await this.getDb();
    await db.put('kv', value, this.key('registrationId'));
  }

  async isTrustedIdentity(_identifier: string, _identityKey: ArrayBuffer, _direction: Direction) {
    return true;
  }

  async saveIdentity(encodedAddress: string, publicKey: ArrayBuffer) {
    const db = await this.getDb();
    const key = this.key(`identity:${encodedAddress}`);
    const existing = (await db.get('kv', key)) as string | undefined;
    const next = toBase64(publicKey);
    await db.put('kv', next, key);
    return existing !== next;
  }

  async loadPreKey(encodedAddress: string | number) {
    const db = await this.getDb();
    const value = (await db.get('kv', this.key(`prekey:${encodedAddress}`))) as SerializedKeyPair | undefined;
    return deserializeKeyPair(value);
  }

  async storePreKey(keyId: number | string, keyPair: KeyPairType) {
    const db = await this.getDb();
    await db.put('kv', serializeKeyPair(keyPair), this.key(`prekey:${keyId}`));
  }

  async removePreKey(keyId: number | string) {
    const db = await this.getDb();
    await db.delete('kv', this.key(`prekey:${keyId}`));
  }

  async storeSession(encodedAddress: string, record: SessionRecordType) {
    const db = await this.getDb();
    await db.put('kv', record, this.key(`session:${encodedAddress}`));
  }

  async loadSession(encodedAddress: string) {
    const db = await this.getDb();
    return (await db.get('kv', this.key(`session:${encodedAddress}`))) as SessionRecordType | undefined;
  }

  async loadSignedPreKey(keyId: number | string) {
    const db = await this.getDb();
    const value = (await db.get('kv', this.key(`signed-prekey:${keyId}`))) as SerializedKeyPair | undefined;
    return deserializeKeyPair(value);
  }

  async storeSignedPreKey(keyId: number | string, keyPair: KeyPairType) {
    const db = await this.getDb();
    await db.put('kv', serializeKeyPair(keyPair), this.key(`signed-prekey:${keyId}`));
  }

  async removeSignedPreKey(keyId: number | string) {
    const db = await this.getDb();
    await db.delete('kv', this.key(`signed-prekey:${keyId}`));
  }

  async getValue<T>(suffix: string) {
    const db = await this.getDb();
    return (await db.get('kv', this.key(suffix))) as T | undefined;
  }

  async setValue(suffix: string, value: unknown) {
    const db = await this.getDb();
    await db.put('kv', value, this.key(suffix));
  }

  async clearNamespaceState() {
    const db = await this.getDb();
    const keys = await db.getAllKeys('kv');

    await Promise.all(
      keys
        .filter((entry): entry is string => typeof entry === 'string' && entry.startsWith(this.prefix))
        .map((entry) => db.delete('kv', entry))
    );
  }

  async saveLocalMessage(message: LocalMessageRecord) {
    const db = await this.getDb();
    await db.put('messages', message);
  }

  async listConversationMessages(conversationKey: string) {
    const db = await this.getDb();
    const values = await db.getAllFromIndex('messages', 'by-conversation', conversationKey);
    return values.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async listConversationKeys() {
    const db = await this.getDb();
    const allMessages = await db.getAll('messages');
    return Array.from(new Set(allMessages.map((message) => message.conversationKey)));
  }

  async listConversationSummaries() {
    const db = await this.getDb();
    const allMessages = await db.getAll('messages');
    const latestByConversation = new Map<string, LocalMessageRecord>();

    for (const message of allMessages) {
      const existing = latestByConversation.get(message.conversationKey);
      if (!existing || existing.createdAt.localeCompare(message.createdAt) < 0) {
        latestByConversation.set(message.conversationKey, message);
      }
    }

    return Array.from(latestByConversation.values())
      .map<ConversationSummary>((message) => ({
        conversationKey: message.conversationKey,
        lastMessageText: message.text,
        lastMessageAt: message.createdAt,
        lastDirection: message.direction,
        senderLabel: message.senderLabel
      }))
      .sort((left, right) => right.lastMessageAt.localeCompare(left.lastMessageAt));
  }

  async saveCallRecord(record: Omit<CallLogRecord, 'ownerKey'>) {
    const db = await this.getDb();
    await db.put('calls', {
      ...record,
      ownerKey: this.prefix
    });
  }

  async listConversationCallRecords(conversationKey: string) {
    const db = await this.getDb();
    const values = await db.getAllFromIndex('calls', 'by-owner-conversation', [this.prefix, conversationKey]);
    return values.sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  }
}

export { fromBase64, toBase64 };
