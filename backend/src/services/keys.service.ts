import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../utils/errors.js';

type UploadPrekey = {
  keyId: number;
  publicKey: string;
};

type UploadBundleInput = {
  userId: string;
  sessionId: string;
  registrationId: number;
  identityPublicKey: string;
  signedPrekey: {
    keyId: number;
    publicKey: string;
    signature: string;
  };
  oneTimePrekeys: UploadPrekey[];
};

type FetchBundleTarget = {
  lookup: string;
};

export class KeysService {
  async uploadBundle(input: UploadBundleInput) {
    return withTransaction(async (client) => {
      await client.query(
        `
          insert into signal_key_bundles (
            user_id,
            device_session_id,
            registration_id,
            identity_public_key,
            signed_prekey_id,
            signed_prekey_public_key,
            signed_prekey_signature,
            updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, now())
          on conflict (device_session_id)
          do update set
            registration_id = excluded.registration_id,
            identity_public_key = excluded.identity_public_key,
            signed_prekey_id = excluded.signed_prekey_id,
            signed_prekey_public_key = excluded.signed_prekey_public_key,
            signed_prekey_signature = excluded.signed_prekey_signature,
            updated_at = now()
        `,
        [
          input.userId,
          input.sessionId,
          input.registrationId,
          input.identityPublicKey,
          input.signedPrekey.keyId,
          input.signedPrekey.publicKey,
          input.signedPrekey.signature
        ]
      );

      await client.query('delete from signal_one_time_prekeys where device_session_id = $1 and claimed_at is null', [input.sessionId]);

      for (const prekey of input.oneTimePrekeys) {
        await client.query(
          `
            insert into signal_one_time_prekeys (
              device_session_id,
              key_id,
              public_key
            )
            values ($1, $2, $3)
            on conflict (device_session_id, key_id)
            do update set
              public_key = excluded.public_key,
              claimed_at = null
          `,
          [input.sessionId, prekey.keyId, prekey.publicKey]
        );
      }

      return {
        uploaded: true,
        prekeyCount: input.oneTimePrekeys.length
      };
    });
  }

  async fetchRecipientBundles(target: FetchBundleTarget) {
    return withTransaction(async (client) => {
      const recipientResult = await client.query<{
        id: string;
      }>(
        `
          select id
          from users
          where id::text = $1 or lower(username) = lower($1)
          limit 1
        `,
        [target.lookup]
      );

      const recipient = recipientResult.rows[0];

      if (!recipient) {
        throw new AppError(404, 'Recipient not found.', 'RECIPIENT_NOT_FOUND');
      }

      const bundleRows = await client.query<{
        device_session_id: string;
        registration_id: number;
        identity_public_key: string;
        signed_prekey_id: number;
        signed_prekey_public_key: string;
        signed_prekey_signature: string;
      }>(
        `
          select
            skb.device_session_id,
            skb.registration_id,
            skb.identity_public_key,
            skb.signed_prekey_id,
            skb.signed_prekey_public_key,
            skb.signed_prekey_signature
          from signal_key_bundles skb
          inner join device_sessions ds on ds.id = skb.device_session_id
          where skb.user_id = $1
            and ds.trusted = true
          order by ds.last_seen_at desc, skb.updated_at desc
          limit 1
        `,
        [recipient.id]
      );

      const bundles = [];

      for (const row of bundleRows.rows) {
        const prekeyResult = await client.query<{
          id: string;
          key_id: number;
          public_key: string;
        }>(
          `
            select id, key_id, public_key
            from signal_one_time_prekeys
            where device_session_id = $1
              and claimed_at is null
            order by created_at asc
            limit 1
            for update skip locked
          `,
          [row.device_session_id]
        );

        const prekey = prekeyResult.rows[0];

        if (prekey) {
          await client.query('update signal_one_time_prekeys set claimed_at = now() where id = $1', [prekey.id]);
        }

        bundles.push({
          deviceSessionId: row.device_session_id,
          registrationId: row.registration_id,
          identityPublicKey: row.identity_public_key,
          signedPrekey: {
            keyId: row.signed_prekey_id,
            publicKey: row.signed_prekey_public_key,
            signature: row.signed_prekey_signature
          },
          oneTimePrekey: prekey
            ? {
                keyId: prekey.key_id,
                publicKey: prekey.public_key
              }
            : null
        });
      }

      return {
        userId: recipient.id,
        bundles
      };
    });
  }
}

export const keysService = new KeysService();
