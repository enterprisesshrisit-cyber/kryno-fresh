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

test('message service records dispatch and preference outcomes with canonical target authority', () => {
  const source = readFileSync(new URL('./messages.service.ts', import.meta.url), 'utf8');
  assert.match(source, /messagePushDiagnostic\(messageId, excludeSessionIds\?\.length \?\? 0, result\)/);
  assert.match(source, /messagePushDiagnostic\(row\.message_id, excluded\.length/);
  assert.match(source, /skipped: notificationPrefs\.muted \? 'muted' : 'focus-mode'/);
  assert.match(source, /skipped: 'dispatch-task-failed'/);
  assert.match(source, /trySendMessagePush\(row\.message_id, row\.recipient_user_id, row\.sender_user_id,\s*targets,/);
});

test('actual target/exclusion/stale counts are allowlisted and separate from input exclusions', () => {
  const result = messagePushDiagnostic(id, 9, { attempted: 0, sent: 0,
    intendedTargetCount: 2, eligibleTargetCount: 1, matchedRelayExclusionCount: 1, revalidatedOutCount: 0,
    token: 'not-for-logs' } as Parameters<typeof messagePushDiagnostic>[2]);
  assert.equal(result.relayExcludedCount, 9);
  assert.equal(result.matchedRelayExclusionCount, 1);
  assert.equal(result.reason, 'relay-excluded');
  assert.equal(JSON.stringify(result).includes('not-for-logs'), false);
});

test('zero provider attempts distinguish actual relay exclusions, revalidation and pre-submit failure', () => {
  for (const [outcome, expected] of [
    [{ eligibleTargetCount: 1, matchedRelayExclusionCount: 1 }, 'relay-excluded'],
    [{ eligibleTargetCount: 1, revalidatedOutCount: 1 }, 'target-invalidated'],
    [{ eligibleTargetCount: 2, matchedRelayExclusionCount: 1, revalidatedOutCount: 1 }, 'target-invalidated'],
    [{ eligibleTargetCount: 1, matchedRelayExclusionCount: 0 }, 'provider-not-submitted'],
    [{ eligibleTargetCount: 0, matchedRelayExclusionCount: 0 }, 'no-eligible-targets']
  ] as const) {
    assert.equal(messagePushDiagnostic(id, 99, { ...outcome, attempted: 0, sent: 0 }).reason, expected);
  }
});
