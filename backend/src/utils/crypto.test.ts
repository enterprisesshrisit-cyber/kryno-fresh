import assert from 'node:assert/strict';
import test from 'node:test';
import { generateOtpCode, hmacSha256, sha256 } from './crypto.js';

test('generateOtpCode returns a 6 digit numeric code by default', () => {
  const code = generateOtpCode();
  assert.match(code, /^\d{6}$/);
});

test('hmacSha256 is deterministic for the same secret and input', () => {
  const left = hmacSha256('verify:user-1:123456', 'pepper-secret');
  const right = hmacSha256('verify:user-1:123456', 'pepper-secret');
  assert.equal(left, right);
});

test('hmacSha256 changes when the secret changes', () => {
  const left = hmacSha256('verify:user-1:123456', 'pepper-secret');
  const right = hmacSha256('verify:user-1:123456', 'different-secret');
  assert.notEqual(left, right);
});

test('hmacSha256 is stronger context separation than plain sha256 for OTPs', () => {
  const plain = sha256('123456');
  const contextual = hmacSha256('verify:user-1:123456', 'pepper-secret');
  assert.notEqual(plain, contextual);
});
