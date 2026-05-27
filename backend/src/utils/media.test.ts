import assert from 'node:assert/strict';
import test from 'node:test';
import { assertTrustedMediaPayload, decodeBase64TransportPayload, getCanonicalMediaExtension } from './media.js';

test('canonical extension is derived from mime type instead of user filename', () => {
  assert.equal(getCanonicalMediaExtension('image/jpeg'), '.jpg');
  assert.equal(getCanonicalMediaExtension('video/webm'), '.webm');
});

test('trusted media payload accepts valid png bytes', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  assert.doesNotThrow(() => assertTrustedMediaPayload('image/png', png));
});

test('trusted media payload trusts sniffed bytes over stale picker mime type', () => {
  const fake = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  assert.equal(assertTrustedMediaPayload('image/png', fake), 'image/jpeg');
});

test('base64 transport payload accepts data urls and whitespace', () => {
  const bytes = decodeBase64TransportPayload('data:image/png;base64, iVBORw0KGgoA ');
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});

test('base64 transport payload rejects invalid input', () => {
  assert.throws(() => decodeBase64TransportPayload('not base64!'));
});
