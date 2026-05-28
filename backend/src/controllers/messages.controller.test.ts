import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sendMessageSchema } from './messages.controller.js';

const validSignalCiphertext = JSON.stringify({
  type: 3,
  body: 'base64-like-signal-ciphertext-body',
  registrationId: 1234
});

test('send message validation rejects extra plaintext fields', () => {
  assert.throws(() =>
    sendMessageSchema.parse({
      messageId: '11111111-1111-4111-8111-111111111111',
      recipientLookup: 'recipient_user',
      recipientDeviceSessionId: '22222222-2222-4222-8222-222222222222',
      messageType: 'text',
      ciphertext: validSignalCiphertext,
      encryptedContentType: 'signal',
      clientCreatedAt: new Date().toISOString(),
      plaintext: 'server should never accept this'
    })
  );
});

