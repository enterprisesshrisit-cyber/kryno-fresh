# KRYNO Staging Infrastructure Setup

This folder contains the staging setup package for KRYNO's production-ready path.

For the current phase, use the free-first setup in `free-first-staging.md`. Paid upgrades should happen only when a free-tier limit blocks staging or when we are preparing for public paid launch.

## Target Staging Architecture

- Mobile app: Expo/EAS Android build.
- API: Node/Fastify backend on a permanent HTTPS staging domain.
- Database: Supabase Free Postgres for early staging.
- Rate limiting: Upstash Redis Free or managed Redis free tier.
- Media: Cloudflare R2 free allowance preferred, Supabase Storage acceptable for earliest staging.
- WAF/CDN: Cloudflare Free first.
- Calls: LiveKit Free first, dedicated TURN/Coturn before launch if reliability requires it.
- Email: existing free SMTP or Resend Free first.
- Monitoring: Sentry Free backend and mobile projects.
- Billing: RevenueCat webhook secret.

## Setup Order

1. Create the free accounts listed in `free-first-staging.md`.
2. Create backend staging host.
3. Create Supabase Postgres project and use SSL.
4. Create Upstash Redis Free database.
5. Create R2 bucket or choose Supabase Storage for earliest staging.
6. Create Sentry backend and mobile projects.
7. Confirm free SMTP credentials work.
8. Create LiveKit Free project.
9. Generate RevenueCat webhook secret locally.
10. Fill host secrets from `infra/env/backend.staging.env.example`.
11. Run backend migrations.
12. Run `npm run security:staging-check`.
13. Build mobile with `infra/env/mobile.staging.env.example`.

## Backend Commands

```powershell
cd C:\Users\ankit\Downloads\movies\Balti\project\kryno-fresh\backend
npm.cmd install
npm.cmd run build
npm.cmd run db:migrate
npm.cmd run security:staging-check
npm.cmd run test:smoke
npm.cmd run audit:prod
```

## Mobile Commands

```powershell
cd C:\Users\ankit\Downloads\movies\Balti\project\kryno-fresh\mobile-kryno-ui-raw
npm.cmd install
npm.cmd run typecheck
npm.cmd run config:check
npm.cmd run build:android:production
```

## Files

- `env/backend.staging.env.example`: backend staging secret template.
- `env/mobile.staging.env.example`: mobile staging build env template.
- `free-first-staging.md`: free-tier setup and credential checklist.
- `render/staging-deploy.md`: Render free-first backend deployment guide.
- `cloudflare/waf-baseline.md`: Cloudflare WAF/CDN baseline.
- `postgres/backup-recovery.md`: backup and restore baseline.

## Completion Criteria

Staging is security-complete only when:

- Backend has a permanent HTTPS API URL.
- Cloudflare WAF is active and logging.
- Redis-backed distributed rate limits are active.
- Supabase/managed Postgres migrations are applied.
- Postgres backups and restore drill are documented.
- R2 media uploads work and survive backend redeploy.
- Sentry receives backend and mobile test events without PII.
- SMTP sends verification, reset, and new-device emails.
- LiveKit audio/video calls connect on two phones.
- `npm run security:staging-check` passes against the public staging URL.
