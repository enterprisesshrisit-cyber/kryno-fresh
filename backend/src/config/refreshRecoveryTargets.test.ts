import assert from 'node:assert/strict';
import test from 'node:test';
import { refreshRecoveryTargetsSchema as schema } from './refreshRecoveryTargets.js';

const a = {
  userId: '2f669cf5-6330-4a57-9ee6-4af4d23f14c5',
  deviceSessionId: '7aa922bb-ae35-4564-9652-ab66672815f7',
  deviceId: 'FixtureInstallation_A'
};
const b = {
  userId: '4beefc72-67b8-4a25-9b25-a1afb2dc11b2',
  deviceSessionId: '503aad88-c66d-453e-b171-d1673950280d',
  deviceId: 'FixtureInstallation_B'
};

test('refresh recovery allowlist is empty by default and preserves installation ID case', () => {
  assert.deepEqual(schema.parse(undefined), []);
  assert.deepEqual(schema.parse(JSON.stringify([{ ...a, userId: a.userId.toUpperCase(), deviceSessionId: a.deviceSessionId.toUpperCase() }, b])), [a, b]);
});

test('refresh recovery allowlist requires two or fewer unique, complete exact tuples', () => {
  for (const invalid of [
    'not json', '"*"', '{}', JSON.stringify([{ ...a, userId: '*' }]),
    JSON.stringify([{ ...a, deviceId: 'all*' }]),
    JSON.stringify([{ userId: a.userId, deviceId: a.deviceId }]),
    JSON.stringify([{ ...a, accountName: 'unexpected' }]),
    JSON.stringify([a, a, b]), JSON.stringify([a, { ...b, deviceSessionId: a.deviceSessionId }]),
    JSON.stringify([a, { ...b, deviceId: a.deviceId }])
  ]) assert.equal(schema.safeParse(invalid).success, false);
});
