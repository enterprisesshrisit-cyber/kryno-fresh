create table if not exists user_subscriptions (
  user_id uuid primary key references users(id) on delete cascade,
  provider varchar(32) not null default 'revenuecat',
  provider_app_user_id text not null unique,
  entitlement_id text not null default 'kryno_plus',
  product_id text,
  platform text,
  status varchar(32) not null,
  current_period_ends_at timestamptz,
  original_transaction_id text,
  latest_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_subscriptions_status_check check (
    status in ('active', 'cancelled_active', 'billing_issue', 'expired', 'refunded', 'paused', 'unknown')
  )
);

create index if not exists user_subscriptions_status_idx on user_subscriptions(status, current_period_ends_at);

create table if not exists billing_webhook_events (
  id text primary key,
  provider varchar(32) not null,
  event_type text not null,
  app_user_id text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);

create index if not exists billing_webhook_events_app_user_idx on billing_webhook_events(provider, app_user_id, received_at desc);
