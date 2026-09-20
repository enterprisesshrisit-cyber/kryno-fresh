import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isUnrecoverableAuthError,
  safeUserFacingError,
  SESSION_EXPIRED_MESSAGE
} from './sessionErrors';

test('expired JWT provider errors are treated as an unrecoverable session', () => {
  const providerError = new Error('"exp" claim timestamp check failed');

  assert.equal(isUnrecoverableAuthError(providerError), true);
  assert.equal(safeUserFacingError(providerError, 'fallback'), SESSION_EXPIRED_MESSAGE);
});

test('transient network errors remain recoverable', () => {
  const networkError = new Error('Network request failed');

  assert.equal(isUnrecoverableAuthError(networkError), false);
  assert.equal(safeUserFacingError(networkError, 'fallback'), 'Network request failed');
});

test('provider and rate-limit details are converted to user-facing messages', () => {
  assert.equal(
    safeUserFacingError(new Error('column "push_provider" does not exist'), 'fallback'),
    'Kryno is finishing a service update. Please reopen the app and try again.'
  );
  assert.equal(
    safeUserFacingError(new Error('Rate limit exceeded, retry in 2 seconds'), 'fallback'),
    'Please wait a moment before trying again.'
  );
});
