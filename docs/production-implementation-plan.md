# KRYNO Production Implementation Plan

## Phase 0: Lock The Target

Status: started.

- Use `mobile-kryno-ui-raw` as the only mobile app target.
- Keep the backend in `backend`.
- Keep the web demo only as legacy/reference until explicitly revived.
- Do not bake quick-tunnel URLs into release APKs.
- Keep login and core UI stable while wiring production services.
- Backend now exposes liveness/readiness endpoints and optional Sentry exception capture.

## Phase 1: Stable Hosted Backend

Goal: one permanent backend URL that the APK can trust.

- Create Supabase project for Postgres.
- Apply database schema and migrations with `npm run db:migrate` from `backend`.
- Move backend to a Node host with persistent environment variables.
- Configure `APP_BASE_URL=https://api.<domain>`.
- Enable `DATABASE_SSL=true`.
- Add production secrets from a password manager.
- Configure transactional email.
- Verify `/api/health`, signup, verification, login, refresh, logout.

Definition of done:

- No laptop backend needed for normal mobile testing.
- APK can sign up and log in using permanent HTTPS API.
- Backend boots with `APP_ENV=production`.
- Database migrations are tracked in `schema_migrations`.
- `/api/ready` returns healthy against hosted Postgres.

## Phase 2: Object Storage

Goal: media uploads stop depending on server disk.

Status: started.

- Backend storage adapter added with local and S3/R2-compatible modes.
- Keep local disk adapter for development.
- Configure Cloudflare R2 or another S3-compatible bucket with `MEDIA_STORAGE_DRIVER=s3`.
- Store profile pictures, posts, and stories through the adapter.
- Mobile profile photo upload is wired through the trusted `/api/social/media` flow.
- Mobile add-story is wired from feed/profile story controls through the trusted `/api/social/media` flow.
- Mobile post media publishing is wired from the profile post grid action through the trusted `/api/social/media` + `/api/social/posts` flow.
- Keep direct attachments encrypted before upload.
- Add file-size, MIME, magic-byte, and ownership checks.

Definition of done:

- Profile photo upload works on Android.
- Story upload works on Android.
- Post media upload works on Android.
- Media survives backend restart/redeploy.

## Phase 3: Paid Subscriptions

Goal: paid-product access is enforceable server-side.

- Add subscription tables: customer id, platform, entitlement, status, expiry.
- Integrate RevenueCat mobile SDK.
- Add backend RevenueCat webhook endpoint.
- Verify webhook authorization.
- Gate premium features through backend entitlement checks.

Status: backend foundation started.

- Subscription and billing webhook event tables added.
- RevenueCat webhook endpoint added at `/api/billing/revenuecat/webhook`.
- Authenticated entitlement endpoint added at `/api/billing/me`.
- Mobile backend context now loads the server-side entitlement state.

Definition of done:

- Test purchase grants entitlement.
- Expired/refunded subscription removes entitlement.
- Client UI never becomes the source of truth for paid access.

## Phase 4: Calls

Goal: reliable audio/video with E2EE.

- Choose LiveKit E2EE or dedicated Coturn plus hardened raw WebRTC.
- Implement backend call-token endpoint if LiveKit is selected.
- Replace temporary call signaling assumptions in mobile.
- Add proper call state machine and reconnect grace.
- Add audio-only and video call UI parity.

Status: LiveKit foundation and mobile binding started.

- LiveKit server SDK added to backend.
- Production config now requires LiveKit URL, API key, and API secret.
- Short-lived token endpoint added at `/api/calls/livekit-token`.
- Mobile backend context can request LiveKit room tokens.
- Call relay now carries managed media provider and room metadata.
- Mobile outgoing/incoming calls prefer LiveKit room tokens when available.
- Mobile call overlay can mount `LiveKitRoom` and render local/remote camera tracks with `VideoTrack`.
- Mobile LiveKit calls now generate a local 256-bit media key and deliver it through the Signal-style encrypted direct-message channel.
- Mobile LiveKit room mounting waits for the encrypted media key and passes it into the React Native LiveKit E2EE manager.
- Existing raw WebRTC signaling remains available as a development fallback when LiveKit is not configured.

Remaining production work:

- Add and validate real LiveKit Cloud credentials in staging.
- Test two physical devices on separate networks before shipping an APK candidate.
- Add automated call-state tests around key delivery, late key arrival, and failed key delivery.
- Add dedicated TURN credentials only if raw WebRTC fallback remains enabled for launch or LiveKit testing shows relay reliability gaps.

Definition of done:

- Audio call connects across two phones on different networks.
- Video call shows both local and remote video.
- Brief network drop enters reconnecting and recovers.
- Call logs are ordered by actual event timestamp.

## Phase 5: Messaging Security

Goal: move from compatibility encrypted transport to production-grade mobile encrypted messaging.

- Complete device identity and key publishing flow.
- Implement prekey/session creation per recipient device.
- Store message ciphertext only on backend.
- Add device verification UI.
- Add delivery/read receipts without exposing content.
- Add message ordering based on client-created and server-received timestamps.

Status: mobile Signal transport hardening started.

- Mobile Signal store now uses trust-on-first-use for saved device identity keys instead of trusting every identity key.
- Existing sessions reject a changed saved identity key, reducing silent MITM risk.

Remaining production work:

- Add visible safety-number/device-verification UI before claiming Signal-grade UX.
- Add identity-change recovery and warning flows.
- Expand encrypted delivery to every recipient device, not only the first device for normal text messages.

Definition of done:

- Fresh install can message another fresh install.
- Message content is unreadable in database.
- Multiple devices per account have deterministic delivery behavior.

## Phase 6: Observability And QA

Goal: stop guessing when something breaks.

- Add Sentry backend and mobile.
- Add structured backend logs.
- Add smoke test script for production/staging.
- Add Playwright or Detox flows for auth, feed, profile, chat.
- Add backend integration tests for social, auth, messaging, calls.

Status: production hardening started.

- Backend Sentry hook exists with PII/key/payload scrubbing.
- Mobile Sentry hook exists with PII/key/payload scrubbing.
- Production mobile builds require `EXPO_PUBLIC_SENTRY_DSN`.
- Backend production config requires Sentry, Redis, WAF provider, security alert mailbox, and backup policy URL.
- Redis-backed distributed rate limit wiring exists through `REDIS_URL`.
- New-device login security alert email is wired.
- Access-control regression tests cover direct attachment access, owned media kind checks, and social visibility.
- Security staging validation script exists at `backend npm run security:staging-check`.
- Security operations runbook exists at `docs/security-operations-runbook.md`.

Definition of done:

- Crash reports include app version and environment.
- Backend errors include request id and safe context.
- A release candidate has a repeatable test checklist.

Current verification status:

- Backend build, smoke tests, and production audit pass.
- Mobile TypeScript, Expo config check, and production dependency audit pass.

## Immediate Next Engineering Tasks

1. Follow the free-first staging path in `infra/free-first-staging.md`.
2. Deploy backend to a permanent staging URL.
3. Configure free-tier hosted Postgres, Redis, object storage, LiveKit, SMTP, Sentry, Cloudflare WAF, backup policy, and generated RevenueCat secret.
4. Run `npm run db:migrate` against hosted Postgres.
5. Run `npm run security:staging-check` against the permanent staging URL.
6. Build APK with `EXPO_PUBLIC_KRYNO_API_URL=<staging-api-url>` and `EXPO_PUBLIC_SENTRY_DSN=<mobile-sentry-dsn>`.
7. Validate profile uploads, stories, likes, chat, and LiveKit calls on two physical devices.
