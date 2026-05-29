import 'react-native-get-random-values';
import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system/legacy';
import {
  KeyHelper,
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
  setWebCrypto,
  type DeviceType,
  type MessageType,
} from '@privacyresearch/libsignal-protocol-typescript';
import { fromBase64, SecureSignalStore, toBase64 } from './mobileSignalSecureStore';

declare const require: (moduleName: string) => unknown;

type LibsignalWebCrypto = Crypto & {
  subtle: SubtleCrypto;
};

let activeCrypto: LibsignalWebCrypto | null = null;

function installLibsignalWebCryptoFallback() {
  const nativeCrypto = globalThis.crypto as Crypto | undefined;
  if (typeof nativeCrypto?.subtle?.importKey === 'function') {
    activeCrypto = nativeCrypto as LibsignalWebCrypto;
    return;
  }

  const fallbackCrypto = require('@privacyresearch/libsignal-protocol-typescript/lib/msrcrypto') as Partial<LibsignalWebCrypto>;
  if (typeof fallbackCrypto?.subtle?.importKey !== 'function') {
    throw new Error('Signal crypto runtime is unavailable on this device.');
  }

  const getRandomValues =
    typeof nativeCrypto?.getRandomValues === 'function'
      ? nativeCrypto.getRandomValues.bind(nativeCrypto)
      : fallbackCrypto.getRandomValues?.bind(fallbackCrypto);

  if (!getRandomValues) {
    throw new Error('Secure random generator is unavailable on this device.');
  }

  activeCrypto = {
    ...fallbackCrypto,
    getRandomValues,
    subtle: fallbackCrypto.subtle
  } as LibsignalWebCrypto;

  setWebCrypto(activeCrypto);
}

installLibsignalWebCryptoFallback();

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

type AttachmentPayload = {
  kind: 'attachment';
  attachmentId: string;
  mediaKind: 'voice' | 'image' | 'video' | 'file';
  fileName: string;
  mimeType: string;
  encryptedSize: number;
  durationSeconds?: number;
  encryption: {
    algorithm: 'AES-256-GCM';
    key: string;
    iv: string;
  };
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

type PlaintextPayload = TextPayload | AttachmentPayload | CallMediaKeyPayload;

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
  status?: 'sent' | 'delivered' | 'seen' | 'received';
};

export type MobileSignalAttachmentMessage = {
  id: string;
  conversationKey: string;
  direction: 'incoming' | 'outgoing';
  kind: 'attachment';
  mediaKind: 'voice' | 'image' | 'video' | 'file';
  text: string;
  localUri?: string;
  fileName: string;
  mimeType: string;
  durationSeconds?: number;
  createdAt: string;
  senderLabel: string;
  status?: 'sent' | 'delivered' | 'seen' | 'received' | 'failed';
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

export type MobileSignalEnvelope = MobileSignalMessage | MobileSignalAttachmentMessage | MobileSignalCallMediaKey;

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
    }
  | {
      type: 'message_seen';
      conversationKey: string;
      seenAt: string;
      readerSessionId?: string;
    };

type ClientRelayCommand = Record<string, unknown> & {
  type: string;
};

const PREKEY_COUNT = 40;
const REQUEST_TIMEOUT_MS = 12000;
const CHAT_QUEUE_TTL_HOURS = 24 * 365;

function createUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
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

function getActiveCrypto() {
  if (!activeCrypto) {
    installLibsignalWebCryptoFallback();
  }

  if (!activeCrypto?.subtle) {
    throw new Error('Secure media encryption is unavailable on this device.');
  }

  return activeCrypto;
}

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  getActiveCrypto().getRandomValues(bytes);
  return bytes;
}

function concatBytes(left: Uint8Array, right: Uint8Array) {
  const merged = new Uint8Array(left.byteLength + right.byteLength);
  merged.set(left, 0);
  merged.set(right, left.byteLength);
  return merged;
}

function exactArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function bytesToBase64(bytes: Uint8Array | ArrayBuffer) {
  return Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString('base64');
}

function base64ToBytes(value: string) {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

function inferMediaKind(mimeType: string): AttachmentPayload['mediaKind'] {
  if (mimeType.startsWith('audio/')) return 'voice';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
}

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('aac')) return 'aac';
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  return 'bin';
}

async function encryptAttachmentBytes(plainBytes: Uint8Array) {
  const cryptoRuntime = getActiveCrypto();
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const importedKey = await cryptoRuntime.subtle.importKey('raw', exactArrayBuffer(key), { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = await cryptoRuntime.subtle.encrypt({ name: 'AES-GCM', iv: exactArrayBuffer(iv) }, importedKey, exactArrayBuffer(plainBytes));

  return {
    encryptedBytes: new Uint8Array(ciphertext),
    keyBase64: bytesToBase64(key),
    ivBase64: bytesToBase64(iv)
  };
}

async function decryptAttachmentBytes(encryptedBytes: ArrayBuffer, payload: AttachmentPayload) {
  const cryptoRuntime = getActiveCrypto();
  const key = base64ToBytes(payload.encryption.key);
  const iv = base64ToBytes(payload.encryption.iv);
  const importedKey = await cryptoRuntime.subtle.importKey('raw', exactArrayBuffer(key), { name: 'AES-GCM' }, false, ['decrypt']);
  const plaintext = await cryptoRuntime.subtle.decrypt({ name: 'AES-GCM', iv: exactArrayBuffer(iv) }, importedKey, encryptedBytes);
  return new Uint8Array(plaintext);
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

async function apiBinary(origin: string, accessToken: string, path: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${buildApiBase(origin)}${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || 'Encrypted attachment download failed.');
    }

    return response.arrayBuffer();
  } finally {
    clearTimeout(timeout);
  }
}

async function uploadEncryptedAttachment(
  origin: string,
  session: AuthSession,
  input: {
    recipientLookup: string;
    recipientDeviceSessionId: string;
    fileName: string;
    mimeType: string;
    encryptedBytes: Uint8Array;
  }
) {
  return apiJson<{ attachmentId: string; expiresAt: string }>(origin, session.accessToken, '/attachments', {
    method: 'POST',
    body: JSON.stringify({
      recipientLookup: input.recipientLookup,
      recipientDeviceSessionId: input.recipientDeviceSessionId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      encryptedSize: input.encryptedBytes.byteLength,
      ttlHours: CHAT_QUEUE_TTL_HOURS,
      encryptedBytesBase64: bytesToBase64(input.encryptedBytes)
    })
  });
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

function getStore(session: AuthSession, deviceProfile: DeviceProfile) {
  return new SecureSignalStore(`${session.user.id}:${deviceProfile.deviceId}`);
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

  if (payload.kind === 'attachment') {
    try {
      const encryptedBytes = await apiBinary(origin, session.accessToken, `/attachments/${encodeURIComponent(payload.attachmentId)}`);
      const plainBytes = await decryptAttachmentBytes(encryptedBytes, payload);
      const extension = extensionForMimeType(payload.mimeType);
      const localUri = `${FileSystem.cacheDirectory ?? ''}kryno-${payload.attachmentId}.${extension}`;
      await FileSystem.writeAsStringAsync(localUri, bytesToBase64(plainBytes), {
        encoding: FileSystem.EncodingType.Base64
      });

      return {
        id: message.messageId,
        conversationKey: payload.senderUsername,
        direction: 'incoming' as const,
        kind: 'attachment' as const,
        mediaKind: payload.mediaKind,
        text:
          payload.mediaKind === 'voice'
            ? 'Voice message'
            : payload.mediaKind === 'image'
              ? 'Photo'
              : payload.mediaKind === 'video'
                ? 'Video'
                : 'File',
        localUri,
        fileName: payload.fileName,
        mimeType: payload.mimeType,
        durationSeconds: payload.durationSeconds,
        createdAt: payload.createdAt,
        senderLabel: payload.senderUsername,
        status: 'received' as const
      };
    } catch {
      return {
        id: message.messageId,
        conversationKey: payload.senderUsername,
        direction: 'incoming' as const,
        kind: 'attachment' as const,
        mediaKind: payload.mediaKind,
        text: 'Encrypted attachment could not be opened',
        fileName: payload.fileName,
        mimeType: payload.mimeType,
        durationSeconds: payload.durationSeconds,
        createdAt: payload.createdAt,
        senderLabel: payload.senderUsername,
        status: 'failed' as const
      };
    }
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

  const result = await apiJson<{ deliveryMode?: 'live' | 'queued' }>(origin, session.accessToken, '/messages/send', {
    method: 'POST',
    body: JSON.stringify({
      messageId,
      recipientLookup,
      recipientDeviceSessionId,
      messageType: 'text',
      ciphertext: JSON.stringify(serializeEncryptionResult(encrypted)),
      encryptedContentType: 'signal',
      clientCreatedAt: createdAt,
      ttlHours: CHAT_QUEUE_TTL_HOURS
    })
  });

  const status: MobileSignalMessage['status'] = result.deliveryMode === 'live' ? 'delivered' : 'sent';

  return {
    id: messageId,
    conversationKey: recipientLookup,
    direction: 'outgoing' as const,
    kind: 'text' as const,
    text,
    createdAt,
    senderLabel: session.user.username,
    status
  };
}

export async function sendMobileDirectAttachment(
  origin: string,
  session: AuthSession,
  deviceProfile: DeviceProfile,
  recipientLookup: string,
  input: {
    uri: string;
    fileName: string;
    mimeType: string;
    mediaKind?: 'voice' | 'image' | 'video' | 'file';
    durationSeconds?: number;
  }
) {
  const { recipientDeviceSessionId, address } = await ensureRecipientSession(origin, session, deviceProfile, recipientLookup);
  const store = getStore(session, deviceProfile);
  const cipher = new SessionCipher(store, address);
  const createdAt = new Date().toISOString();
  const fileBase64 = await FileSystem.readAsStringAsync(input.uri, { encoding: FileSystem.EncodingType.Base64 });
  const plainBytes = base64ToBytes(fileBase64);
  const encrypted = await encryptAttachmentBytes(plainBytes);
  const upload = await uploadEncryptedAttachment(origin, session, {
    recipientLookup,
    recipientDeviceSessionId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    encryptedBytes: encrypted.encryptedBytes
  });
  const mediaKind = input.mediaKind ?? inferMediaKind(input.mimeType);
  const payload: AttachmentPayload = {
    kind: 'attachment',
    attachmentId: upload.attachmentId,
    mediaKind,
    fileName: input.fileName,
    mimeType: input.mimeType,
    encryptedSize: encrypted.encryptedBytes.byteLength,
    durationSeconds: input.durationSeconds,
    encryption: {
      algorithm: 'AES-256-GCM',
      key: encrypted.keyBase64,
      iv: encrypted.ivBase64
    },
    senderUsername: session.user.username,
    senderUserId: session.user.id,
    createdAt
  };

  const plaintext = new TextEncoder().encode(JSON.stringify(payload)).buffer;
  const signalCiphertext = await cipher.encrypt(plaintext);
  const messageId = createUuid();

  const result = await apiJson<{ deliveryMode?: 'live' | 'queued' }>(origin, session.accessToken, '/messages/send', {
    method: 'POST',
    body: JSON.stringify({
      messageId,
      recipientLookup,
      recipientDeviceSessionId,
      messageType: 'attachment',
      ciphertext: JSON.stringify(serializeEncryptionResult(signalCiphertext)),
      encryptedContentType: 'signal',
      clientCreatedAt: createdAt,
      ttlHours: CHAT_QUEUE_TTL_HOURS
    })
  });

  const status: MobileSignalAttachmentMessage['status'] = result.deliveryMode === 'live' ? 'delivered' : 'sent';
  return {
    id: messageId,
    conversationKey: recipientLookup,
    direction: 'outgoing' as const,
    kind: 'attachment' as const,
    mediaKind,
    text:
      mediaKind === 'voice'
        ? 'Voice message'
        : mediaKind === 'image'
          ? 'Photo'
          : mediaKind === 'video'
            ? 'Video'
            : 'File',
    localUri: input.uri,
    fileName: input.fileName,
    mimeType: input.mimeType,
    durationSeconds: input.durationSeconds,
    createdAt,
    senderLabel: session.user.username,
    status
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
  const connectionWaiters = new Set<{
    resolve: (value: boolean) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  const clearHeartbeat = () => {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const isConnected = () => Boolean(socket && open && authenticated && socket.readyState === WebSocket.OPEN);

  const resolveConnectionWaiters = (value: boolean) => {
    for (const waiter of connectionWaiters) {
      clearTimeout(waiter.timer);
      waiter.resolve(value);
    }
    connectionWaiters.clear();
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
          resolveConnectionWaiters(true);
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
      const activeSocket = socket;
      if (!activeSocket || !isConnected()) {
        return false;
      }

      activeSocket.send(JSON.stringify(command));
      return true;
    },
    waitUntilConnected(timeoutMs = 6500) {
      if (isConnected()) {
        return Promise.resolve(true);
      }

      return new Promise<boolean>((resolve) => {
        const waiter = {
          resolve,
          timer: setTimeout(() => {
            connectionWaiters.delete(waiter);
            resolve(false);
          }, timeoutMs)
        };
        connectionWaiters.add(waiter);
      });
    },
    disconnect() {
      disposed = true;
      resolveConnectionWaiters(false);
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
