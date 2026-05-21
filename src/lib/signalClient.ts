import {
  KeyHelper,
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
  type DeviceType,
  type MessageType
} from '@privacyresearch/libsignal-protocol-typescript';
import {
  fromBase64,
  IndexedDbSignalStore,
  toBase64,
  type AttachmentRecord,
  type CallLogRecord,
  type ConversationSummary,
  type LocalMessageRecord
} from './signalStore';
import type { ClientRelayCommand, RelayCallEvent } from './callClient';
import { getApiBase, getBackendOrigin, getRelayWsBase } from './runtimeConfig';

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
  messages: Array<{
    messageId: string;
    senderUserId: string;
    senderDeviceSessionId: string;
    recipientDeviceSessionId: string | null;
    messageType: string;
    ciphertext: string;
    encryptedContentType: string;
    clientCreatedAt: string;
    serverReceivedAt: string;
    expiresAt: string;
  }>;
};

type RelayMessageRecord = InboxResponse['messages'][number];

type TextPayload = {
  kind: 'text';
  text: string;
  senderUsername: string;
  senderUserId: string;
  createdAt: string;
};

type AttachmentPayload = {
  kind: 'attachment';
  text: string;
  senderUsername: string;
  senderUserId: string;
  createdAt: string;
  attachment: AttachmentRecord & {
    aesKey: string;
    iv: string;
  };
};

type PlaintextPayload = TextPayload | AttachmentPayload;

type WireCiphertext = {
  type: number;
  body: string;
  registrationId?: number;
};

const PREKEY_COUNT = 100;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ATTACHMENT_TRANSFER_TIMEOUT_MS = 180_000;

function getStore(session: AuthSession, deviceProfile: DeviceProfile) {
  return new IndexedDbSignalStore(`${session.user.id}:${deviceProfile.deviceId}`);
}

function getRecipientAddress(deviceSessionId: string) {
  return new SignalProtocolAddress(deviceSessionId, 1);
}

const REQUEST_TIMEOUT_MS = 12_000;

async function apiJson<T>(accessToken: string, path: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  const apiBase = getApiBase();

  try {
    response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(options.headers ?? {})
      },
      signal: controller.signal
    });
  } catch {
    throw new Error(`Cannot reach the backend at ${getBackendOrigin()}.`);
  } finally {
    window.clearTimeout(timeout);
  }

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

async function ensureLocalBundle(session: AuthSession, deviceProfile: DeviceProfile) {
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

async function ensureRecipientSession(session: AuthSession, deviceProfile: DeviceProfile, recipientLookup: string) {
  const store = await ensureLocalBundle(session, deviceProfile);
  const recipientCacheKey = `recipient:${recipientLookup}:deviceSessionId`;
  const cachedRecipientDeviceSessionId = await store.getValue<string>(recipientCacheKey);
  const recipient = await apiJson<RecipientBundleResponse>(session.accessToken, `/keys/${encodeURIComponent(recipientLookup)}`);
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

async function sendEncryptedPayload(
  session: AuthSession,
  deviceProfile: DeviceProfile,
  recipientLookup: string,
  messageType: string,
  payload: PlaintextPayload
) {
  const { recipientDeviceSessionId, address } = await ensureRecipientSession(session, deviceProfile, recipientLookup);
  const store = getStore(session, deviceProfile);
  const cipher = new SessionCipher(store, address);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload)).buffer;
  const encrypted = await cipher.encrypt(plaintext);
  const messageId = crypto.randomUUID();

  await apiJson(session.accessToken, '/messages/send', {
    method: 'POST',
    body: JSON.stringify({
      messageId,
      recipientLookup,
      recipientDeviceSessionId,
      messageType,
      ciphertext: JSON.stringify(serializeEncryptionResult(encrypted)),
      encryptedContentType: 'signal',
      clientCreatedAt: payload.createdAt,
      ttlHours: 24
    })
  });

  return {
    store,
    messageId,
    recipientDeviceSessionId
  };
}

async function processIncomingMessage(
  store: IndexedDbSignalStore,
  message: RelayMessageRecord
) {
  const address = getRecipientAddress(message.senderDeviceSessionId);
  const wire = JSON.parse(message.ciphertext) as WireCiphertext;
  const cipher = new SessionCipher(store, address);
  const plaintext =
    wire.type === 3
      ? await cipher.decryptPreKeyWhisperMessage(wire.body, 'binary')
      : await cipher.decryptWhisperMessage(wire.body, 'binary');

  const payload = JSON.parse(new TextDecoder().decode(new Uint8Array(plaintext))) as PlaintextPayload;
  await store.setValue(`recipient:${payload.senderUsername}:deviceSessionId`, message.senderDeviceSessionId);

  const localMessage: LocalMessageRecord = {
    id: message.messageId,
    conversationKey: payload.senderUsername,
    direction: 'incoming',
    kind: payload.kind,
    text: payload.text,
    createdAt: payload.createdAt,
    senderLabel: payload.senderUsername,
    attachment:
      payload.kind === 'attachment'
        ? {
            attachmentId: payload.attachment.attachmentId,
            fileName: payload.attachment.fileName,
            mimeType: payload.attachment.mimeType,
            byteSize: payload.attachment.byteSize,
            aesKey: payload.attachment.aesKey,
            iv: payload.attachment.iv
          }
        : undefined
  };

  await store.saveLocalMessage(localMessage);
  return localMessage;
}

async function encryptAttachment(file: File) {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const exportedKey = await crypto.subtle.exportKey('raw', key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const fileBytes = await file.arrayBuffer();
  const encryptedBytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, fileBytes);

  return {
    encryptedBytes,
    aesKey: toBase64(exportedKey),
    iv: toBase64(iv.buffer)
  };
}

async function uploadEncryptedAttachment(
  session: AuthSession,
  recipientLookup: string,
  recipientDeviceSessionId: string,
  file: File,
  encryptedBytes: ArrayBuffer
) {
  const apiBase = getApiBase();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), ATTACHMENT_TRANSFER_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(`${apiBase}/attachments/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`
      },
      body: JSON.stringify({
        recipientLookup,
        recipientDeviceSessionId,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        encryptedSize: encryptedBytes.byteLength,
        ttlHours: 24,
        encryptedBytesBase64: toBase64(encryptedBytes)
      }),
      signal: controller.signal
    });
  } catch {
    throw new Error(`Cannot reach the backend at ${getBackendOrigin()}.`);
  } finally {
    window.clearTimeout(timeout);
  }

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof json?.message === 'string'
        ? json.message
        : typeof json?.error === 'string'
          ? json.error
          : 'Encrypted attachment upload failed.'
    );
  }

  const result = json as {
    attachmentId: string;
    recipientUserId: string;
    recipientDeviceSessionId: string | null;
    expiresAt: string;
  };

  if (!UUID_REGEX.test(result.attachmentId)) {
    throw new Error('Attachment upload returned an invalid attachment id.');
  }

  return result;
}

export async function bootstrapSignalDevice(session: AuthSession, deviceProfile: DeviceProfile) {
  await ensureLocalBundle(session, deviceProfile);
}

export async function sendDirectText(
  session: AuthSession,
  deviceProfile: DeviceProfile,
  recipientLookup: string,
  text: string
) {
  const store = await ensureLocalBundle(session, deviceProfile);
  const payload: TextPayload = {
    kind: 'text',
    text,
    senderUsername: session.user.username,
    senderUserId: session.user.id,
    createdAt: new Date().toISOString()
  };

  const { messageId } = await sendEncryptedPayload(session, deviceProfile, recipientLookup, 'text', payload);

  const localMessage: LocalMessageRecord = {
    id: messageId,
    conversationKey: recipientLookup,
    direction: 'outgoing',
    kind: 'text',
    text,
    createdAt: payload.createdAt,
    senderLabel: session.user.username
  };

  await store.saveLocalMessage(localMessage);
  return localMessage;
}

export async function sendDirectAttachment(
  session: AuthSession,
  deviceProfile: DeviceProfile,
  recipientLookup: string,
  file: File
) {
  const { store, recipientDeviceSessionId } = await ensureRecipientSession(session, deviceProfile, recipientLookup);
  const encryptedAttachment = await encryptAttachment(file);
  const uploaded = await uploadEncryptedAttachment(
    session,
    recipientLookup,
    recipientDeviceSessionId,
    file,
    encryptedAttachment.encryptedBytes
  );
  const createdAt = new Date().toISOString();
  const payload: AttachmentPayload = {
    kind: 'attachment',
    text: `Attachment: ${file.name}`,
    senderUsername: session.user.username,
    senderUserId: session.user.id,
    createdAt,
    attachment: {
      attachmentId: uploaded.attachmentId,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      byteSize: file.size,
      aesKey: encryptedAttachment.aesKey,
      iv: encryptedAttachment.iv
    }
  };

  const { messageId } = await sendEncryptedPayload(session, deviceProfile, recipientLookup, 'attachment', payload);

  const localMessage: LocalMessageRecord = {
    id: messageId,
    conversationKey: recipientLookup,
    direction: 'outgoing',
    kind: 'attachment',
    text: `Attachment: ${file.name}`,
    createdAt,
    senderLabel: session.user.username,
    attachment: {
      attachmentId: uploaded.attachmentId,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      byteSize: file.size,
      aesKey: encryptedAttachment.aesKey,
      iv: encryptedAttachment.iv
    }
  };

  await store.saveLocalMessage(localMessage);
  return localMessage;
}

export async function syncDirectInbox(session: AuthSession, deviceProfile: DeviceProfile) {
  const store = await ensureLocalBundle(session, deviceProfile);
  const inbox = await apiJson<InboxResponse>(session.accessToken, '/messages/inbox?limit=100');
  const ackIds: string[] = [];

  for (const message of inbox.messages) {
    try {
      await processIncomingMessage(store, message);
      ackIds.push(message.messageId);
    } catch (error) {
      console.error('[SIGNAL_SYNC]', 'decrypt failed', error);
    }
  }

  if (ackIds.length > 0) {
    await apiJson(session.accessToken, '/messages/ack', {
      method: 'POST',
      body: JSON.stringify({
        messageIds: ackIds
      })
    });
  }

  return store;
}

export function connectDirectRelay(
  session: AuthSession,
  deviceProfile: DeviceProfile,
  handlers: {
    onMessage?: (message: LocalMessageRecord) => void | Promise<void>;
    onCallEvent?: (event: RelayCallEvent) => void | Promise<void>;
    onStatus?: (status: 'connecting' | 'connected' | 'disconnected' | 'error', detail?: string) => void;
  }
) {
  let disposed = false;
  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let heartbeatTimer: number | null = null;
  let open = false;

  const clearHeartbeat = () => {
    if (heartbeatTimer !== null) {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const openSocket = async () => {
    const store = await ensureLocalBundle(session, deviceProfile);
    if (disposed) {
      return;
    }

    handlers.onStatus?.('connecting');
    const url = `${getRelayWsBase()}/api/messages/ws`;
    socket = new WebSocket(url);

    socket.addEventListener('open', () => {
      open = true;
      socket?.send(
        JSON.stringify({
          type: 'auth',
          accessToken: session.accessToken
        })
      );
      clearHeartbeat();
      heartbeatTimer = window.setInterval(() => {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          return;
        }
        socket.send(JSON.stringify({ type: 'ping' }));
      }, 15000);
    });

    socket.addEventListener('message', async (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as
          | { type: 'relay_ready'; sessionId: string }
          | { type: 'relay_error'; message: string }
          | { type: 'pong' }
          | { type: 'direct_message'; message: RelayMessageRecord }
          | RelayCallEvent;

        if (payload.type === 'relay_error') {
          handlers.onStatus?.('error', payload.message);
          socket?.close();
          return;
        }

        if (payload.type === 'direct_message') {
          const localMessage = await processIncomingMessage(store, payload.message);
          await handlers.onMessage?.(localMessage);
          return;
        }

        if (payload.type === 'pong') {
          return;
        }

        if (payload.type === 'relay_ready') {
          handlers.onStatus?.('connected');
          return;
        }

        await handlers.onCallEvent?.(payload);
      } catch (error) {
        handlers.onStatus?.('error', error instanceof Error ? error.message : 'Relay message handling failed.');
      }
    });

    socket.addEventListener('close', () => {
      open = false;
      clearHeartbeat();
      if (disposed) {
        return;
      }
      handlers.onStatus?.('disconnected');
      reconnectTimer = window.setTimeout(() => {
        void openSocket();
      }, 3000);
    });

    socket.addEventListener('error', () => {
      open = false;
      clearHeartbeat();
      handlers.onStatus?.('error', 'Direct relay socket error.');
    });
  };

  void openSocket();

  return {
    send(command: ClientRelayCommand) {
      if (!socket || !open || socket.readyState !== WebSocket.OPEN) {
        return false;
      }

      socket.send(JSON.stringify(command));
      return true;
    },
    disconnect() {
      disposed = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      clearHeartbeat();
      if (socket && socket.readyState < WebSocket.CLOSING) {
        socket.close();
      }
    }
  };
}

export async function listConversationMessages(session: AuthSession, deviceProfile: DeviceProfile, conversationKey: string) {
  const store = getStore(session, deviceProfile);
  return store.listConversationMessages(conversationKey);
}

export async function listConversationSummaries(session: AuthSession, deviceProfile: DeviceProfile): Promise<ConversationSummary[]> {
  const store = getStore(session, deviceProfile);
  return store.listConversationSummaries();
}

export async function saveConversationCallRecord(
  session: AuthSession,
  deviceProfile: DeviceProfile,
  record: Omit<CallLogRecord, 'ownerKey'>
) {
  const store = getStore(session, deviceProfile);
  await store.saveCallRecord(record);
}

export async function listConversationCallRecords(session: AuthSession, deviceProfile: DeviceProfile, conversationKey: string) {
  const store = getStore(session, deviceProfile);
  return store.listConversationCallRecords(conversationKey);
}

export async function resetDirectSignalState(session: AuthSession, deviceProfile: DeviceProfile) {
  const store = getStore(session, deviceProfile);
  await store.clearNamespaceState();
}

export async function downloadDirectAttachment(session: AuthSession, message: LocalMessageRecord) {
  if (!message.attachment?.aesKey || !message.attachment?.iv) {
    throw new Error('Attachment decryption data is not available on this device.');
  }

  if (!UUID_REGEX.test(message.attachment.attachmentId)) {
    throw new Error('This attachment was saved with an invalid attachment id. Please resend the file with the latest app build.');
  }

  const apiBase = getApiBase();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), ATTACHMENT_TRANSFER_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(`${apiBase}/attachments/${message.attachment.attachmentId}`, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`
      },
      signal: controller.signal
    });
  } catch {
    throw new Error(`Cannot reach the backend at ${getBackendOrigin()}.`);
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    throw new Error(
      typeof json?.message === 'string'
        ? json.message
        : typeof json?.error === 'string'
          ? json.error
          : 'Encrypted attachment download failed.'
    );
  }

  const encryptedBytes = await response.arrayBuffer();
  const importedKey = await crypto.subtle.importKey(
    'raw',
    fromBase64(message.attachment.aesKey),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(fromBase64(message.attachment.iv)) },
    importedKey,
    encryptedBytes
  );

  return {
    blob: new Blob([decrypted], { type: message.attachment.mimeType || 'application/octet-stream' }),
    fileName: message.attachment.fileName
  };
}
