import assert from 'node:assert/strict';
import test from 'node:test';
import { messageRelayWakeTargetsSchema } from './messageRelayWake.js';

const pair = { recipientUserId: 'abcdefab-2222-4333-8444-555555555555',
  deviceSessionId: 'abcdefab-2222-4333-8444-666666666666' };

test('relay-wake canary is empty by default and normalizes only explicit UUID pairs', () => {
  assert.deepEqual(messageRelayWakeTargetsSchema.parse(undefined), []);
  assert.deepEqual(messageRelayWakeTargetsSchema.parse('[]'), []);
  assert.deepEqual(messageRelayWakeTargetsSchema.parse(JSON.stringify([{
    recipientUserId: pair.recipientUserId.toUpperCase(), deviceSessionId: pair.deviceSessionId.toUpperCase()
  }])), [pair]);
  assert.equal(messageRelayWakeTargetsSchema.parse(JSON.stringify([pair, pair])).length, 2);
});

test('malformed, wildcard, unpaired, unknown-field and oversized canaries fail closed', () => {
  for (const value of ['', '*', 'null', '{}', '[', 'true', '["*"]', JSON.stringify([{}]),
    JSON.stringify([{ ...pair, recipientUserId: '*' }]), JSON.stringify([{ ...pair, deviceSessionId: '' }]),
    JSON.stringify([{ recipientUserId: pair.recipientUserId }]), JSON.stringify([{ ...pair, all: true }]),
    JSON.stringify([pair, pair, pair]), ' '.repeat(1025)]) {
    assert.equal(messageRelayWakeTargetsSchema.safeParse(value).success, false, value.slice(0, 100));
  }
});
