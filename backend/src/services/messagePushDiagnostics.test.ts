import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { messagePushDiagnostic } from './messagePushDiagnostics.js';

const id = '11111111-2222-4333-8444-ABCDEF012345';

test('push diagnostics correlate only a UUID suffix and bounded outcome fields', () => {
  const providerResult = { attempted: 2, sent: 1, token: 'private-token', recipient: 'private-user', body: 'private-body' };
  assert.deepEqual(messagePushDiagnostic(id, 3, providerResult), {
    reason: 'partial-acceptance', relayExcludedCount: 3, attemptedCount: 2,
    acceptedCount: 1, messageTag: 'abcdef012345'
  });
});

test('invalid identifiers and invalid counts cannot leak through diagnostics', () => {
  assert.deepEqual(messagePushDiagnostic('private-message-text', -1, { attempted: NaN, sent: Infinity }), {
    reason: 'invalid-outcome', relayExcludedCount: 0, attemptedCount: 0, acceptedCount: 0
  });
});

test('zero targets, rejected targets, accepted targets and schema failures stay distinguishable', () => {
  const cases = [
    [{ attempted: 0, sent: 0 }, 'no-eligible-targets'],
    [{ attempted: 1, sent: 0 }, 'not-accepted'],
    [{ attempted: 1, sent: 1 }, 'provider-accepted'],
    [{ attempted: 1, sent: 2 }, 'invalid-outcome'],
    [{ attempted: 0, sent: 0, disabled: true }, 'schema-unavailable'],
    [{ attempted: 0, sent: 0, failed: true }, 'dispatch-failed']
  ] as const;
  for (const [result, reason] of cases) assert.equal(messagePushDiagnostic(id, 0, result).reason, reason);
});

test('preference skips are explicit instead of being mistaken for provider failure', () => {
  for (const skipped of ['muted', 'focus-mode', 'dispatch-task-failed'] as const) {
    assert.equal(messagePushDiagnostic(id, 0, { skipped }).reason, skipped);
  }
});

test('message service records dispatch and preference outcomes without changing relay exclusion', () => {
  const source = readFileSync(new URL('./messages.service.ts', import.meta.url), 'utf8');
  assert.match(source, /messagePushDiagnostic\(messageId, excludeSessionIds\?\.length \?\? 0, result\)/);
  assert.match(source, /messagePushDiagnostic\(persisted\.messageId, relayResult\.deliveredSessionIds\.length/);
  assert.match(source, /skipped: notificationPrefs\.muted \? 'muted' : 'focus-mode'/);
  assert.match(source, /skipped: 'dispatch-task-failed'/);
  assert.match(source, /trySendMessagePush\(\s*persisted\.messageId,\s*persisted\.recipientUserId,\s*persisted\.senderUsername,\s*relayResult\.deliveredSessionIds,/);
});
