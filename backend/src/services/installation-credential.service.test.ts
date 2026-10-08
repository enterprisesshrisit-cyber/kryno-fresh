import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient } from 'pg';
import { authorizePushLogin, requireInstallationProof, verifyOrEnrollInstallation } from './installation-credential.service.js';
import { sha256 } from '../utils/crypto.js';
import { AppError } from '../utils/errors.js';

const proof = 'ab'.repeat(32);
function fixture(options: { hash?: string; owner?: string; otherSession?: boolean } = {}) {
  let hash = options.hash;
  const writes: unknown[][] = [];
  const client = { async query(sql: string, params: unknown[] = []) {
    if (sql.includes('select credential_hash')) return { rows: hash ? [{ credential_hash: hash }] : [] };
    if (sql.includes('select d.user_id')) return { rows: options.owner ? [{ user_id: options.owner }] : [] };
    if (sql.includes('select id from device_sessions')) return { rows: options.otherSession ? [{ id: 'other-session' }] : [] };
    if (sql.includes('insert into push_installation_credentials')) { hash = params[1] as string; writes.push(params); return { rows: [] }; }
    throw new Error('Unexpected fixture query');
  } } as unknown as PoolClient;
  return { client, writes };
}

test('installation enrollment persists only SHA256, idempotently', async () => {
  const f = fixture();
  await verifyOrEnrollInstallation(f.client, 'fixture-device', proof);
  await verifyOrEnrollInstallation(f.client, 'fixture-device', proof);
  assert.deepEqual(f.writes, [['fixture-device', sha256(proof)]]);
  assert.equal(JSON.stringify(f.writes).includes(proof), false);
});

test('wrong or corrupt proof fails without changing the saved hash', async () => {
  const f = fixture({ hash: sha256(proof) });
  await assert.rejects(authorizePushLogin(f.client, 'account-B', 'fixture-device', 'cd'.repeat(32)),
    (error: unknown) => error instanceof AppError && error.code === 'INSTALLATION_PROOF_MISMATCH');
  await assert.rejects(verifyOrEnrollInstallation(f.client, 'fixture-device', 'corrupt'), AppError);
  assert.equal(f.writes.length, 0);
});

test('knowing a device ID and an unrelated account password cannot claim an existing installation', async () => {
  for (const options of [{ owner: 'account-A' }, { otherSession: true }]) {
    const f = fixture(options);
    await assert.rejects(authorizePushLogin(f.client, 'account-B', 'fixture-device', proof),
      (error: unknown) => error instanceof AppError && error.code === 'INSTALLATION_ENROLLMENT_REQUIRED');
    assert.equal(f.writes.length, 0);
  }
});

test('same original account may bootstrap proof, then a local account switch uses the existing proof', async () => {
  const f = fixture({ owner: 'account-A', otherSession: true });
  assert.equal(await authorizePushLogin(f.client, 'account-A', 'fixture-device', proof), true);
  assert.equal(await authorizePushLogin(f.client, 'account-B', 'fixture-device', proof), true);
  assert.equal(f.writes.length, 1);
});

test('legacy authentication never moves push authority; enrolled or scoped registration requires proof', async () => {
  const f = fixture({ hash: sha256(proof) });
  assert.equal(await authorizePushLogin(f.client, 'account-B', 'fixture-device'), false);
  await assert.rejects(requireInstallationProof(f.client, 'fixture-device'), AppError);
  const legacy = fixture();
  await requireInstallationProof(legacy.client, 'fixture-device');
  await assert.rejects(requireInstallationProof(legacy.client, 'fixture-device', undefined, true), AppError);
  assert.equal(legacy.writes.length, 0);
});
