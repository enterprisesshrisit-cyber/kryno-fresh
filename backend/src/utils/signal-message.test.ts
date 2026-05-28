import assert from 'node:assert/strict';
import test from 'node:test';
import { isSignalCiphertextEnvelope } from './signal-message.js';

test('Signal ciphertext validator accepts a libsignal wrapper envelope', () => {
  assert.equal(
    isSignalCiphertextEnvelope(
      JSON.stringify({
        type: 3,
        body: 'base64-like-signal-ciphertext-body',
        registrationId: 12345
      })
    ),
    true
  );
});

test('Signal ciphertext validator rejects plaintext-shaped message bodies', () => {
  assert.equal(
    isSignalCiphertextEnvelope(
      JSON.stringify({
        type: 3,
        body: 'base64-like-signal-ciphertext-body',
        text: 'hello server should not store me'
      })
    ),
    false
  );
});

test('Signal ciphertext validator rejects private key leakage fields', () => {
  assert.equal(
    isSignalCiphertextEnvelope(
      JSON.stringify({
        type: 3,
        body: 'base64-like-signal-ciphertext-body',
        privKey: 'private-key-material'
      })
    ),
    false
  );
});

test('Signal ciphertext validator rejects malformed or non-Signal payloads', () => {
  assert.equal(isSignalCiphertextEnvelope('not json'), false);
  assert.equal(isSignalCiphertextEnvelope(JSON.stringify({ type: 9, body: 'not-a-supported-signal-type' })), false);
  assert.equal(isSignalCiphertextEnvelope(JSON.stringify({ type: 3, body: 'too-short' })), false);
});
