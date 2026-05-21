import { pool, withTransaction } from '../db/pool.js';
import { AppError } from '../utils/errors.js';

type RevenueCatEvent = {
  id?: string;
  type?: string;
  app_user_id?: string;
  product_id?: string;
  entitlement_id?: string;
  entitlement_ids?: string[];
  store?: string;
  environment?: string;
  expiration_at_ms?: number | null;
  original_transaction_id?: string;
  transaction_id?: string;
};

type RevenueCatWebhookPayload = {
  event?: RevenueCatEvent;
};

function toDateFromMs(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) {
    return null;
  }

  return new Date(value).toISOString();
}

function subscriptionStatus(event: RevenueCatEvent) {
  const type = event.type ?? 'UNKNOWN';
  const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms).getTime() : null;

  if (type === 'EXPIRATION') return 'expired';
  if (type === 'REFUND') return 'refunded';
  if (type === 'BILLING_ISSUE') return 'billing_issue';
  if (type === 'CANCELLATION') return expiresAt && expiresAt > Date.now() ? 'cancelled_active' : 'expired';
  if (type === 'PAUSE') return 'paused';
  if (expiresAt && expiresAt <= Date.now()) return 'expired';

  if (
    type === 'INITIAL_PURCHASE' ||
    type === 'RENEWAL' ||
    type === 'UNCANCELLATION' ||
    type === 'PRODUCT_CHANGE' ||
    type === 'NON_RENEWING_PURCHASE'
  ) {
    return 'active';
  }

  return 'unknown';
}

function eventId(event: RevenueCatEvent) {
  return event.id || event.transaction_id || `${event.app_user_id ?? 'unknown'}:${event.type ?? 'UNKNOWN'}:${Date.now()}`;
}

export class BillingService {
  async processRevenueCatWebhook(payload: unknown) {
    const webhookPayload = payload as RevenueCatWebhookPayload;
    const event = webhookPayload.event;
    if (!event?.app_user_id || !event.type) {
      throw new AppError(400, 'Invalid RevenueCat webhook payload.', 'INVALID_REVENUECAT_WEBHOOK');
    }

    const id = eventId(event);
    const appUserId = event.app_user_id;
    const status = subscriptionStatus(event);
    const entitlementId = event.entitlement_id || event.entitlement_ids?.[0] || 'kryno_plus';
    const expiresAt = toDateFromMs(event.expiration_at_ms);

    return withTransaction(async (client) => {
      await client.query(
        `
          insert into billing_webhook_events (id, provider, event_type, app_user_id, payload)
          values ($1, 'revenuecat', $2, $3, $4::jsonb)
          on conflict (id) do nothing
        `,
        [id, event.type, appUserId, JSON.stringify(webhookPayload)]
      );

      const userResult = await client.query<{ id: string }>(
        `
          select id
          from users
          where id::text = $1
          limit 1
        `,
        [appUserId]
      );

      const user = userResult.rows[0];
      if (!user) {
        await client.query(
          `
            update billing_webhook_events
            set processing_error = $2
            where id = $1
          `,
          [id, 'RevenueCat app_user_id does not match a KRYNO user id.']
        );

        return {
          accepted: true,
          processed: false,
          reason: 'unknown_app_user_id'
        };
      }

      await client.query(
        `
          insert into user_subscriptions (
            user_id,
            provider,
            provider_app_user_id,
            entitlement_id,
            product_id,
            platform,
            status,
            current_period_ends_at,
            original_transaction_id,
            latest_event_id,
            updated_at
          )
          values ($1, 'revenuecat', $2, $3, $4, $5, $6, $7::timestamptz, $8, $9, now())
          on conflict (user_id)
          do update set
            provider_app_user_id = excluded.provider_app_user_id,
            entitlement_id = excluded.entitlement_id,
            product_id = excluded.product_id,
            platform = excluded.platform,
            status = excluded.status,
            current_period_ends_at = excluded.current_period_ends_at,
            original_transaction_id = excluded.original_transaction_id,
            latest_event_id = excluded.latest_event_id,
            updated_at = now()
        `,
        [
          user.id,
          appUserId,
          entitlementId,
          event.product_id ?? null,
          event.store ?? event.environment ?? null,
          status,
          expiresAt,
          event.original_transaction_id ?? null,
          id
        ]
      );

      await client.query(
        `
          update billing_webhook_events
          set processed_at = now(), processing_error = null
          where id = $1
        `,
        [id]
      );

      return {
        accepted: true,
        processed: true,
        status
      };
    });
  }

  async getUserEntitlement(userId: string) {
    const result = await pool.query<{
      entitlement_id: string;
      status: string;
      current_period_ends_at: string | null;
      product_id: string | null;
    }>(
      `
        select entitlement_id, status, current_period_ends_at, product_id
        from user_subscriptions
        where user_id = $1
        limit 1
      `,
      [userId]
    );

    const row = result.rows[0];
    if (!row) {
      return {
        entitlementId: 'free',
        active: false,
        status: 'free',
        productId: null,
        currentPeriodEndsAt: null
      };
    }

    const expiresAt = row.current_period_ends_at ? new Date(row.current_period_ends_at).getTime() : null;
    const active =
      (row.status === 'active' || row.status === 'cancelled_active') &&
      (!expiresAt || expiresAt > Date.now());

    return {
      entitlementId: row.entitlement_id,
      active,
      status: row.status,
      productId: row.product_id,
      currentPeriodEndsAt: row.current_period_ends_at
    };
  }
}

export const billingService = new BillingService();
