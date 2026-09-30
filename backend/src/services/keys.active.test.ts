import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { pool } from '../db/pool.js';
import { KeysService } from './keys.service.js';

const originalQuery = pool.query.bind(pool);

afterEach(() => {
  pool.query = originalQuery as typeof pool.query;
});

test('active Signal device lookup does not claim a one-time prekey', async () => {
  const deviceSessionId = '33333333-3333-4333-8333-333333333333';
  pool.query = (async (sql: string, values: unknown[]) => {
    assert.match(sql, /signal_key_bundles/);
    assert.doesNotMatch(sql, /signal_one_time_prekeys/);
    assert.deepEqual(values, ['recipient']);
    return { rows: [{ device_session_id: deviceSessionId }] };
  }) as typeof pool.query;

  const result = await new KeysService().fetchActiveRecipientDevice({ lookup: 'recipient' });
  assert.equal(result.deviceSessionId, deviceSessionId);
});
