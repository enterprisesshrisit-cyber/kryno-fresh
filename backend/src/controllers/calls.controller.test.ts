import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acceptLiveKitCallSchema, liveKitTokenSchema } from './calls.controller.js';

test('LiveKit token requests require a durable call id', () => {
  const parsed = liveKitTokenSchema.parse({
    call_id: '11111111-1111-4111-8111-111111111111'
  });
  assert.equal(parsed.call_id, '11111111-1111-4111-8111-111111111111');
});

test('LiveKit token requests reject client-selected rooms and recipients', () => {
  assert.throws(() =>
    liveKitTokenSchema.parse({
      call_id: '11111111-1111-4111-8111-111111111111',
      room_name: 'attacker_selected_room',
      recipient_lookup: 'someone_else'
    })
  );
});

test('LiveKit acceptance accepts only a durable call id', () => {
  const parsed = acceptLiveKitCallSchema.parse({
    call_id: '11111111-1111-4111-8111-111111111111'
  });
  assert.equal(parsed.call_id, '11111111-1111-4111-8111-111111111111');
  assert.throws(() =>
    acceptLiveKitCallSchema.parse({
      call_id: '11111111-1111-4111-8111-111111111111',
      accepted_device_session_id: 'attacker-selected-device'
    })
  );
});
