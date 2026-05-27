import 'react-native-get-random-values';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';
import {
  KeyHelper,
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
  type DeviceType,
  type Direction,
  type KeyPairType,
  type MessageType,
  type SessionRecordType,
  type StorageType
} from '@privacyresearch/libsignal-protocol-typescript';

type AuthSession = {
  user: {
    id: string;
    username: string;
    email: string;
  };
  accessToken: string;
  refreshToken: string;
};

type DeviceProfile = {
  deviceId: string;
  deviceName: string;
  deviceSeed: string;
};

type RecipientBundleResponse = {
  userId: string;
  bundles: Array<{
    deviceSessionId: string;
    registrationId: number;
    identityPublicKey: string;
    signedPrekey: {
      keyId: number;
      publicKey: string;
      signature: string;
    };
    oneTimePrekey: {
      keyId: number;
      publicKey: string;
    } | null;
  }>;
};

type InboxResponse = {
  messages: RelayMessageRecord[];
};

type RelayMessageRecord = {
  messageId: string;
  senderUserId: string;
  senderDeviceSessionId: string;
  recipientDeviceSessionId: string | null;
  messageType: string;
  ciphertext: string;
  encryptedContentType: string;
  clientCreatedAt: string;
  serverReceivedAt: string;
  expiresAt: string | null;
};

type TextPayload = {
  kind: 'text';
  text: string;
  senderUsername: string;
  senderUserId: string;
  createdAt: string;
};

type CallMediaKeyPayload = {
  kind: 'call_media_key';
  callId: string;
  mode: 'audio' | 'video';
  mediaProvider: 'livekit';
  roomName: string;
  mediaEncryptionKey: string;
  senderUsername: string;
  senderUserId: string;
  createdAt: string;
};

type PlaintextPayload = TextPayload | CallMediaKeyPayload;

type WireCiphertext = {
  type: number;
  body: string;
  registrationId?: number;
};

export type MobileSignalMessage = {
  id: string;
  conversationKey: string;
  direction: 'incoming' | 'outgoing';
  kind: 'text';
  text: string;
  createdAt: string;
  senderLabel: string;
};

export type MobileSignalCallMediaKey = {
  id: string;
  conversationKey: string;
  direction: 'incoming' | 'outgoing';
  kind: 'call_media_key';
  callId: string;
  mode: 'audio' | 'video';
  mediaProvider: 'livekit';
  roomName: string;
  mediaEncryptionKey: string;
  createdAt: string;
  senderLabel: string;
};

export type MobileSignalEnvelope = MobileSignalMessage | MobileSignalCallMediaKey;

export type RelayCallEvent =
  | {
      type: 'call_invite';
      callId: string;
      mode: 'audio' | 'video';
      callerSessionId: string;
      callerUserId: string;
      callerUsername: string;
      mediaProvider?: 'livekit' | 'webrtc';
      roomName?: string | null;
    }
  | {
      type: 'call_ringing';
      callId: string;
      recipientUserId: string;
      recipientUsername: string;
      mode: 'audio' | 'video';
      mediaProvider?: 'livekit' | 'webrtc';
      roomName?: string | null;
    }
  | {
      type: 'call_unavailable';
      callId: string;
      reason: string;
    }
  | {
      type: 'call_accepted';
      callId: string;
      peerSessionId: string;
      mediaProvider?: 'livekit' | 'webrtc';
      roomName?: string | null;
    }
  | {
      type: 'call_join';
      callId: string;
      peerSessionId: string;
      mediaProvider?: 'livekit' | 'webrtc';
      roomName?: string | null;
    }
  | {
      type: 'call_rejected';
      callId: string;
      reason: string;
      bySessionId: string;
    }
  | {
      type: 'call_ended';
      callId: string;
      reason: string;
      endedBySessionId: string | null;
    }
  | {
      type: 'call_signal';
      callId: string;
      fromSessionId: string;
      signal:
        | {
            type: 'offer' | 'answer';
            sdp: string;
          }
        | {
            type: 'ice-candidate';
            candidate: {
              candidate: string;
              sdpMid?: string | null;
              sdpMLineIndex?: number | null;
              usernameFragment?: string | null;
            };
          };
    };

type ClientRelayCommand = Record<string, unknown> & {
  type: string;
};

const PREKEY_COUNT = 40;
const REQUEST_TIMEOUT_MS = 12000;
const STORE_PREFIX = 'kryno_mobile_signal';

function createUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function toBase64(buffer: ArrayBuffer) {
  return Buffer.from(buffer).toString('base64');
}

function fromBase64(value: string) {
  return Buffer.from(value, 'base64').buffer.slice(
    Buffer.from(value, 'base64').byteOffset,
    Buffer.from(value, 'base64').byteOffset + Buffer.from(value, 'base64').byteLength
  );
}

export function createCallMediaEncryptionKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64');
}

function buildApiBase(origin: string) {
  return `${origin.replace(/\/+$/, '')}/api`;
}

function buildRelayUrl(origin: string) {
  if (origin.startsWith('https://')) {
    return `${origin.replace(/^https:\/\//, 'wss://')}/api/messages/ws`;
  }
  if (origin.startsWith('http://')) {
    return `${origin.replace(/^http:\/\//, 'ws://')}/api/messages/ws`;
  }
  return `${origin}/api/messages/ws`;
}

async function apiJson<T>(origin: string, accessToken: string, path: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${buildApiBase(origin)}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(options.headers ?? {})
      },
      signal: controller.signal
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        typeof json?.message === 'string'
          ? json.message
          : typeof json?.error === 'string'
            ? json.error
            : 'Signal request failed.'
      );
    }

    return json as T;
  } finally {
    clearTimeout(timeout);
  }
}

function serializeKeyPair(keyPair: KeyPairType) {
  return {
    pubKey: toBase64(keyPair.pubKey),
    privKey: toBase64(keyPair.privKey)
  };
}

function deserializeKeyPair(serialized?: { pubKey: string; privKey: string }): KeyPairType | undefined {
  if (!serialized) {
    return undefined;
  }

  return {
    pubKey: fromBase64(serialized.pubKey),
    privKey: fromBase64(serialized.privKey)
  };
}

function serializeEncryptionResult(result: MessageType): WireCiphertext {
  return {
    type: result.type,
    body: result.body ?? '',
    registrationId: result.registrationId
  };
}

function deserializeRecipientBundle(bundle: RecipientBundleResponse['bundles'][number]): DeviceType {
  return {
    registrationId: bundle.registrationId,
    identityKey: fromBase64(bundle.identityPublicKey),
    signedPreKey: {
      keyId: bundle.signedPrekey.keyId,
      publicKey: fromBase64(bundle.signedPrekey.publicKey),
      signature: fromBase64(bundle.signedPrekey.signature)
    },
    preKey: bundle.oneTimePrekey
      ? {
          keyId: bundle.oneTimePrekey.keyId,
          publicKey: fromBase64(bundle.oneTimePrekey.publicKey)
        }
      : undefined
  };
}

function getRecipientAddress(deviceSessionId: string) {
  return new SignalProtocolAddress(deviceSessionId, 1);
}

class AsyncStorageSignalStore implements StorageType {
  private prefix: string;

  constructor(namespace: string) {
    this.prefix = `${STORE_PREFIX}:${namespace}`;
  }

  private key(suffix: string) {
    return `${this.prefix}:${suffix}`;
  }

  async getIdentityKeyPair() {
    const value = await AsyncStorage.getItem(this.key('identity'));
    return deserializeKeyPair(value ? JSON.parse(value) : undefined);
  }

  async setIdentityKeyPair(value: KeyPairType) {
    await AsyncStorage.setItem(this.key('identity'), JSON.stringify(serializeKeyPair(value)));
  }

  async getLocalRegistrationId() {
    const value = await AsyncStorage.getItem(this.key('registrationId'));
    return value ? Number(value) : undefined;
  }

  async setLocalRegistrationId(value: number) {
    await AsyncStorage.setItem(this.key('registrationId'), String(value));
  }

  async isTrustedIdentity(identifier: string, identityKey: ArrayBuffer, _direction: Direction) {
    const storedIdentity = await AsyncStorage.getItem(this.key(`identity:${identifier}`));
    if (!storedIdentity) {
      return true;
    }

    return storedIdentity === toBase64(identityKey);
  }

  async saveIdentity(encodedAddress: string, publicKey: ArrayBuffer) {
    const key = this.key(`identity:${encodedAddress}`);
    const existing = await AsyncStorage.getItem(key);
    const next = toBase64(publicKey);
    await AsyncStorage.setItem(key, next);
    return existing !== next;
  }

  async loadPreKey(encodedAddress: string | number) {
    const value = await AsyncStorage.getItem(this.key(`prekey:${encodedAddress}`));
    return deserializeKeyPair(value ? JSON.parse(value) : undefined);
  }

  async storePreKey(keyId: number | string, keyPair: KeyPairType) {
    await AsyncStorage.setItem(this.key(`prekey:${keyId}`), JSON.stringify(serializeKeyPair(keyPair)));
  }

  async removePreKey(keyId: number | string) {
    await AsyncStorage.removeItem(this.key(`prekey:${keyId}`));
  }

  async storeSession(encodedAddress: string, record: SessionRecordType) {
    await AsyncStorage.setItem(this.key(`session:${encodedAddress}`), JSON.stringify(record));
  }

  async loadSession(encodedAddress: string) {
    const value = await AsyncStorage.getItem(this.key(`session:${encodedAddress}`));
    return value ? (JSON.parse(value) as SessionRecordType) : undefined;
  }

  async loadSignedPreKey(keyId: number | string) {
    const value = await AsyncStorage.getItem(this.key(`signed-prekey:${keyId}`));
    return deserializeKeyPair(value ? JSON.parse(value) : undefined);
  }

  async storeSignedPreKey(keyId: number | string, keyPair: KeyPairType) {
    await AsyncStorage.setItem(this.key(`signed-prekey:${keyId}`), JSON.stringify(serializeKeyPair(keyPair)));
  }

  async removeSignedPreKey(keyId: number | string) {
    await AsyncStorage.removeItem(this.key(`signed-prekey:${keyId}`));
  }

  async getValue<T>(suffix: string) {
    const value = await AsyncStorage.getItem(this.key(suffix));
    return value ? (JSON.parse(value) as T) : undefined;
  }

  async setValue(suffix: string, value: unknown) {
    await AsyncStorage.setItem(this.key(suffix), JSON.stringify(value));
  }

  async clearNamespaceState() {
    const keys = await AsyncStorage.getAllKeys();
    const matching = keys.filter((entry) => entry.startsWith(this.prefix));
    if (matching.length > 0) {
      await Promise.all(matching.map((entry) => AsyncStorage.removeItem(entry)));
    }
  }
}

function getStore(session: AuthSession, deviceProfile: DeviceProfile) {
  return new AsyncStorageSignalStore(`${session.user.id}:${deviceProfile.deviceId}`);
}

async function ensureLocalBundle(origin: string, session: AuthSession, deviceProfile: DeviceProfile) {
  const store = getStore(session, deviceProfile);
  const existingRegistrationId = await store.getLocalRegistrationId();
  const existingIdentity = await store.getIdentityKeyPair();
  const existingSignedPreKeyId = await store.getValue<number>('signedPreKeyId');
  const alreadyUploaded = await store.getValue<boolean>('bundleUploaded');

  if (existingRegistrationId && existingIdentity && existingSignedPreKeyId !== undefined && alreadyUploaded) {
    return store;
  }

  const registrationId = existingRegistrationId ?? KeyHelper.generateRegistrationId();
  const identityKeyPair = existingIdentity ?? (await KeyHelper.generateIdentityKeyPair());
  const signedPreKeyId = existingSignedPreKeyId ?? 1;
  const signedPreKey = await KeyHelper.generateSignedPreKey(identityKeyPair, signedPreKeyId);
  const prekeys = [];

  for (let index = 1; index <= PREKEY_COUNT; index += 1) {
    const preKey = await KeyHelper.generatePreKey(index);
    prekeys.push(preKey);
    await store.storePreKey(preKey.keyId, preKey.keyPair);
  }

  await store.setLocalRegistrationId(registrationId);
  await store.setIdentityKeyPair(identityKeyPair);
  await store.storeSignedPreKey(signedPreKeyId, signedPreKey.keyPair);
  await store.setValue('signedPreKeyId', signedPreKeyId);

  await apiJson(
    origin,
    session.accessToken,
    '/keys/bundle',
    {
      method: 'POST',
      body: JSON.stringify({
        registrationId,
        identityPublicKey: toBase64(identityKeyPair.pubKey),
        signedPrekey: {
          keyId: signedPreKeyId,
          publicKey: toBase64(signedPreKey.keyPair.pubKey),
          signature: toBase64(signedPreKey.signature)
        },
        oneTimePrekeys: prekeys.map((preKey) => ({
          keyId: preKey.keyId,
          publicKey: toBase64(preKey.keyPair.pubKey)
        }))
      })
    }
  );

  await store.setValue('bundleUploaded', true);
  return store;
}

async function ensureRecipientSession(origin: string, session: AuthSession, deviceProfile: DeviceProfile, recipientLookup: string) {
  const store = await ensureLocalBundle(origin, session, deviceProfile);
  const recipientCacheKey = `recipient:${recipientLookup}:deviceSessionId`;
  const cachedRecipientDeviceSessionId = await store.getValue<string>(recipientCacheKey);
  const recipient = await apiJson<RecipientBundleResponse>(origin, session.accessToken, `/keys/${encodeURIComponent(recipientLookup)}`);
  const bundle = recipient.bundles[0];

  if (!bundle) {
    throw new Error('Recipient has no available Signal device bundle.');
  }

  const recipientDeviceSessionId = bundle.deviceSessionId;
  let existingSession = await store.loadSession(getRecipientAddress(recipientDeviceSessionId).toString());

  if (cachedRecipientDeviceSessionId !== recipientDeviceSessionId || !existingSession) {
    await store.setValue(recipientCacheKey, recipientDeviceSessionId);
    const address = getRecipientAddress(recipientDeviceSessionId);
    const builder = new SessionBuilder(store, address);
    await builder.processPreKey(deserializeRecipientBundle(bundle));
    existingSession = await store.loadSession(address.toString());
  }

  return {
    store,
    recipientDeviceSessionId,
    address: getRecipientAddress(recipientDeviceSessionId)
  };
}

async function processIncomingMessage(
  origin: string,
  session: AuthSession,
  deviceProfile: DeviceProfile,
  message: RelayMessageRecord
): Promise<MobileSignalEnvelope | null> {
  const store = await ensureLocalBundle(origin, session, deviceProfile);
  const address = getRecipientAddress(message.senderDeviceSessionId);
  const wire = JSON.parse(message.ciphertext) as WireCiphertext;
  const cipher = new SessionCipher(store, address);
  const plaintext =
    wire.type === 3
      ? await cipher.decryptPreKeyWhisperMessage(wire.body, 'binary')
      : await cipher.decryptWhisperMessage(wire.body, 'binary');

  const payload = JSON.parse(new TextDecoder().decode(new Uint8Array(plaintext))) as PlaintextPayload;
  await store.setValue(`recipient:${payload.senderUsername}:deviceSessionId`, message.senderDeviceSessionId);

  if (payload.kind === 'text') {
    return {
      id: message.messageId,
      conversationKey: payload.senderUsername,
      direction: 'incoming' as const,
      kind: 'text' as const,
      text: payload.text,
      createdAt: payload.createdAt,
      senderLabel: payload.senderUsername
    };
  }

  if (payload.kind === 'call_media_key') {
    return {
      id: message.messageId,
      conversationKey: payload.senderUsername,
      direction: 'incoming' as const,
      kind: 'call_media_key' as const,
      callId: payload.callId,
      mode: payload.mode,
      mediaProvider: payload.mediaProvider,
      roomName: payload.roomName,
      mediaEncryptionKey: payload.mediaEncryptionKey,
      createdAt: payload.createdAt,
      senderLabel: payload.senderUsername
    };
  }

  return null;
}

export async function bootstrapMobileSignalDevice(origin: string, session: AuthSession, deviceProfile: DeviceProfile) {
  await ensureLocalBundle(origin, session, deviceProfile);
}

export async function sendMobileDirectText(
  origin: string,
  session: AuthSession,
  deviceProfile: DeviceProfile,
  recipientLookup: string,
  text: string
) {
  const { recipientDeviceSessionId, address } = await ensureRecipientSession(origin, session, deviceProfile, recipientLookup);
  const store = getStore(session, deviceProfile);
  const cipher = new SessionCipher(store, address);
  const createdAt = new Date().toISOString();
  const payload: TextPayload = {
    kind: 'text',
    text,
    senderUsername: session.user.username,
    senderUserId: session.user.id,
    createdAt
  };

  const plaintext = new TextEncoder().encode(JSON.stringify(payload)).buffer;
  const encrypted = await cipher.encrypt(plaintext);
  const messageId = createUuid();

  await apiJson(origin, session.accessToken, '/messages/send', {
    method: 'POST',
    body: JSON.stringify({
      messageId,
      recipientLookup,
      recipientDeviceSessionId,
      messageType: 'text',
      ciphertext: JSON.stringify(serializeEncryptionResult(encrypted)),
      encryptedContentType: 'signal',
      clientCreatedAt: createdAt,
      ttlHours: 24
    })
  });

  return {
    id: messageId,
    conversationKey: recipientLookup,
    direction: 'outgoing' as const,
    kind: 'text' as const,
    text,
    createdAt,
    senderLabel: session.user.username
  };
}

async function ensureRecipientSessions(origin: string, session: AuthSession, deviceProfile: DeviceProfile, recipientLookup: string) {
  const store = await ensureLocalBundle(origin, session, deviceProfile);
  const recipient = await apiJson<RecipientBundleResponse>(origin, session.accessToken, `/keys/${encodeURIComponent(recipientLookup)}`);

  if (recipient.bundles.length === 0) {
    throw new Error('Recipient has no available Signal device bundle.');
  }

  const sessions = [];
  for (const bundle of recipient.bundles) {
    const recipientDeviceSessionId = bundle.deviceSessionId;
    const address = getRecipientAddress(recipientDeviceSessionId);
    const existingSession = await store.loadSession(address.toString());

    if (!existingSession) {
      const builder = new SessionBuilder(store, address);
      await builder.processPreKey(deserializeRecipientBundle(bundle));
    }

    await store.setValue(`recipient:${recipientLookup}:deviceSessionId`, recipientDeviceSessionId);
    sessions.push({
      recipientDeviceSessionId,
      address
    });
  }

  return {
    store,
    sessions
  };
}

export async function sendMobileDirectCallMediaKey(
  origin: string,
  session: AuthSession,
  deviceProfile: DeviceProfile,
  recipientLookup: string,
  input: {
    callId: string;
    mode: 'audio' | 'video';
    roomName: string;
    mediaEncryptionKey: string;
  }
) {
  const { store, sessions } = await ensureRecipientSessions(origin, session, deviceProfile, recipientLookup);
  const createdAt = new Date().toISOString();
  const payload: CallMediaKeyPayload = {
    kind: 'call_media_key',
    callId: input.callId,
    mode: input.mode,
    mediaProvider: 'livekit',
    roomName: input.roomName,
    mediaEncryptionKey: input.mediaEncryptionKey,
    senderUsername: session.user.username,
    senderUserId: session.user.id,
    createdAt
  };

  const plaintext = new TextEncoder().encode(JSON.stringify(payload)).buffer;
  const sentMessageIds: string[] = [];

  for (const recipient of sessions) {
    const cipher = new SessionCipher(store, recipient.address);
    const encrypted = await cipher.encrypt(plaintext);
    const messageId = createUuid();

    await apiJson(origin, session.accessToken, '/messages/send', {
      method: 'POST',
      body: JSON.stringify({
        messageId,
        recipientLookup,
        recipientDeviceSessionId: recipient.recipientDeviceSessionId,
        messageType: 'call_media_key',
        ciphertext: JSON.stringify(serializeEncryptionResult(encrypted)),
        encryptedContentType: 'signal',
        clientCreatedAt: createdAt,
        ttlHours: 1
      })
    });

    sentMessageIds.push(messageId);
  }

  return {
    id: sentMessageIds[0] ?? createUuid(),
    conversationKey: recipientLookup,
    direction: 'outgoing' as const,
    kind: 'call_media_key' as const,
    callId: input.callId,
    mode: input.mode,
    mediaProvider: 'livekit' as const,
    roomName: input.roomName,
    mediaEncryptionKey: input.mediaEncryptionKey,
    createdAt,
    senderLabel: session.user.username
  };
}

export async function syncMobileDirectInbox(origin: string, session: AuthSession, deviceProfile: DeviceProfile) {
  await ensureLocalBundle(origin, session, deviceProfile);
  const inbox = await apiJson<InboxResponse>(origin, session.accessToken, '/messages/inbox?limit=100');
  const ackIds: string[] = [];
  const messages: MobileSignalEnvelope[] = [];

  for (const message of inbox.messages) {
    try {
      if (message.encryptedContentType !== 'signal') {
        continue;
      }
      const localMessage = await processIncomingMessage(origin, session, deviceProfile, message);
      if (localMessage) {
        messages.push(localMessage);
        ackIds.push(message.messageId);
      }
    } catch {
      continue;
    }
  }

  if (ackIds.length > 0) {
    await apiJson(origin, session.accessToken, '/messages/ack', {
      method: 'POST',
      body: JSON.stringify({ messageIds: ackIds })
    });
  }

  return messages;
}

export function connectMobileDirectRelay(
  origin: string,
  session: AuthSession,
  deviceProfile: DeviceProfile,
  handlers: {
    onMessage?: (message: MobileSignalEnvelope) => void | Promise<void>;
    onCallEvent?: (event: RelayCallEvent) => void | Promise<void>;
    onStatus?: (status: 'connecting' | 'connected' | 'disconnected' | 'error', detail?: string) => void;
  }
) {
  let disposed = false;
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let open = false;
  let authenticated = false;

  const clearHeartbeat = () => {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const openSocket = async () => {
    await ensureLocalBundle(origin, session, deviceProfile);
    if (disposed) {
      return;
    }

    handlers.onStatus?.('connecting');
    socket = new WebSocket(buildRelayUrl(origin));

    socket.onopen = () => {
      open = true;
      authenticated = false;
      socket?.send(JSON.stringify({ type: 'auth', accessToken: session.accessToken }));
      clearHeartbeat();
      heartbeatTimer = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }));
        }
      }, 15000);
    };

    socket.onmessage = async (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as
          | { type: 'relay_ready'; sessionId: string }
          | { type: 'relay_error'; message: string }
          | { type: 'pong' }
          | { type: 'direct_message'; message: RelayMessageRecord }
          | RelayCallEvent;

        if (payload.type === 'relay_error') {
          handlers.onStatus?.('error', 'message' in payload ? payload.message : 'Relay error.');
          socket?.close();
          return;
        }

        if (payload.type === 'relay_ready') {
          authenticated = true;
          handlers.onStatus?.('connected');
          return;
        }

        if (payload.type === 'pong') {
          return;
        }

        if (payload.type === 'direct_message') {
          if (!('message' in payload) || payload.message.encryptedContentType !== 'signal') {
            return;
          }
          const localMessage = await processIncomingMessage(origin, session, deviceProfile, payload.message);
          if (localMessage) {
            await handlers.onMessage?.(localMessage);
          }
          await apiJson(origin, session.accessToken, '/messages/ack', {
            method: 'POST',
            body: JSON.stringify({ messageIds: [payload.message.messageId] })
          });
          return;
        }

        await handlers.onCallEvent?.(payload);
      } catch (error) {
        handlers.onStatus?.('error', error instanceof Error ? error.message : 'Relay message handling failed.');
      }
    };

    socket.onclose = () => {
      open = false;
      authenticated = false;
      clearHeartbeat();
      if (disposed) {
        return;
      }
      handlers.onStatus?.('disconnected');
      reconnectTimer = setTimeout(() => {
        void openSocket();
      }, 3000);
    };

    socket.onerror = () => {
      open = false;
      authenticated = false;
      clearHeartbeat();
      handlers.onStatus?.('error', 'Direct relay socket error.');
    };
  };

  void openSocket();

  return {
    send(command: ClientRelayCommand) {
      if (!socket || !open || !authenticated || socket.readyState !== WebSocket.OPEN) {
        return false;
      }

      socket.send(JSON.stringify(command));
      return true;
    },
    disconnect() {
      disposed = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
      }
      clearHeartbeat();
      if (socket && socket.readyState < WebSocket.CLOSING) {
        socket.close();
      }
    }
  };
}
