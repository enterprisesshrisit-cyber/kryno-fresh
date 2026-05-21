import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError } from './errors.js';
import { assertTrustedMediaPayload, getCanonicalMediaExtension } from './media.js';

test('canonical extension is derived from mime type instead of user filename', () => {
  assert.equal(getCanonicalMediaExtension('image/jpeg'), '.jpg');
  assert.equal(getCanonicalMediaExtension('video/webm'), '.webm');
});

test('trusted media payload accepts valid png bytes', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  assert.doesNotThrow(() => assertTrustedMediaPayload('image/png', png));
});

test('trusted media payload rejects mime/signature mismatch', () => {
  const fake = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  assert.throws(() => assertTrustedMediaPayload('image/png', fake), AppError);
});

