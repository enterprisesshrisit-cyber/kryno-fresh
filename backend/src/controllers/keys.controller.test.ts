import assert from 'node:assert/strict';
import { test } from 'node:test';
import { uploadBundleSchema } from './keys.controller.js';

const validBundle = {
  registrationId: 1234,
  identityPublicKey: 'public-identity-key-value',
  signedPrekey: {
    keyId: 1,
    publicKey: 'signed-public-key-value',
    signature: 'signed-prekey-signature-value'
  },
  oneTimePrekeys: [
    {
      keyId: 1,
      publicKey: 'one-time-public-key-value'
    }
  ]
};

test('Signal key bundle validation rejects private key material', () => {
  assert.throws(() =>
    uploadBundleSchema.parse({
      ...validBundle,
      privateKey: 'private-key-must-stay-on-device'
    })
  );

  assert.throws(() =>
    uploadBundleSchema.parse({
      ...validBundle,
      signedPrekey: {
        ...validBundle.signedPrekey,
        privKey: 'signed-prekey-private-material'
      }
    })
  );
});

