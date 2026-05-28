const SIGNAL_MESSAGE_TYPES = new Set([1, 3]);
const FORBIDDEN_SIGNAL_PAYLOAD_KEYS = new Set([
  'text',
  'bodyText',
  'plaintext',
  'senderUsername',
  'senderUserId',
  'mediaEncryptionKey',
  'identityKey',
  'identityKeyPair',
  'privKey',
  'privateKey',
  'sessionKey'
]);

export function isSignalCiphertextEnvelope(value: string) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    return false;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return false;
  }

  const envelope = parsed as Record<string, unknown>;
  if (!SIGNAL_MESSAGE_TYPES.has(Number(envelope.type))) {
    return false;
  }

  if (typeof envelope.body !== 'string' || envelope.body.length < 16) {
    return false;
  }

  if (envelope.registrationId !== undefined && typeof envelope.registrationId !== 'number') {
    return false;
  }

  return !Object.keys(envelope).some((key) => FORBIDDEN_SIGNAL_PAYLOAD_KEYS.has(key));
}
