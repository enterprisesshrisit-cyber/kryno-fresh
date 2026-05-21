# KRYNO Security Checklist

This checklist tracks the real production hardening status for KRYNO. It is not a promise of "unhackable" security; it is a practical control map for reducing real-world risk across account takeover, API abuse, uploads, encryption, scraping, unauthorized access, and infrastructure attacks.

## Current Status Legend

- Implemented: code exists and local checks currently pass.
- Partial: foundation exists, but production validation or a missing control remains.
- Required: must be added before a public paid launch.

## Account Takeover

Status: partial.

Implemented:

- Passwords are hashed with Argon2id.
- Email verification is required before login.
- Access and refresh tokens use separate secrets.
- Refresh tokens are stored server-side as hashes.
- Refresh token rotation is implemented.
- Refresh-token reuse detection revokes the token family.
- Device ID is bound into refresh-token validation.
- Logout revokes the stored refresh token.
- Password reset revokes active refresh tokens after reset.
- Secrets are redacted from backend logs.
- New-device login security alert email is sent when a previously unseen device ID logs in.

Required:

- Add optional MFA/passkeys for high-value accounts.
- Add device management UI and "log out all devices".
- Add suspicious login risk scoring.
- Move mobile release sessions toward OS-backed secure storage only where feasible.

## Brute Force And Credential Stuffing

Status: partial.

Implemented:

- Global API rate limiting is enabled.
- Redis-backed distributed rate limiting is wired for production via `REDIS_URL`.
- Auth routes have stricter route-level rate limits.
- Login failure limiter blocks repeated failures per identifier and IP.
- Verification and password-reset OTP sends are throttled.
- OTP verification/reset attempts are limited.
- Password reset requests are rate-limited.

Required:

- Validate Redis-backed rate limiting in hosted staging under multi-instance load.
- Add IP reputation and ASN/country anomaly checks.
- Add CAPTCHA or proof-of-work only after suspicious behavior.
- Add breached-password checks during signup/reset.
- Add account lock or step-up challenge after high-risk attempts.

## API Abuse And Bots

Status: partial.

Implemented:

- Auth middleware protects social, messaging, upload, calls, billing, keys, users, and attachment routes.
- Route-level limits exist for auth, keys, users, calls, messages, billing, attachments, and social APIs.
- Request body size limits are configured.
- Zod validation is used on controllers.
- Search results are capped.
- Feed/story limits are capped.

Required:

- Add per-user action quotas for likes, follows, posts, stories, comments, and searches.
- Add spam heuristics and abuse scoring.
- Add bot/device fingerprinting in a privacy-conscious way.
- Add shadow bans/report/moderation tooling for social abuse.

## Unauthorized Access / Broken Access Control

Status: partial-to-strong foundation.

Implemented:

- API handlers trust backend auth context, not frontend user IDs.
- Attachment downloads verify sender/recipient ownership and target device session.
- Profile media updates verify avatar asset ownership and kind.
- Post creation verifies media asset ownership and kind.
- Post deletion requires author ownership.
- Story creation verifies media asset ownership and kind.
- Feed/story queries enforce public/follower/owner visibility rules.
- Calls validate caller/recipient sessions before signaling.
- WebSocket relay requires an authentication handshake before commands.
- Access-control regression tests cover direct attachment access, media ownership/kind checks, and social visibility rules.

Required:

- Expand access-control regression tests to billing, calls, key bundles, and every social mutation.
- Add admin/RBAC model before any admin panel exists.
- Add server-side entitlement checks to all paid-only features.
- Add audit logs for sensitive access and account changes.

## Malicious Uploads

Status: implemented foundation, production storage pending.

Implemented:

- Social media upload validates size.
- MIME type is not trusted blindly.
- File signatures are sniffed for JPG, PNG, GIF, WEBP, MP4, MOV, and WEBM.
- Declared MIME and detected MIME mismatch is rejected.
- Canonical extensions are generated server-side.
- Server generates random asset IDs and storage keys.
- Avatar uploads require image MIME types.
- Direct-message attachments are stored encrypted as opaque bytes.
- Attachment downloads enforce TTL and access control.
- S3/R2-compatible storage adapter exists.

Required:

- Use Cloudflare R2/S3 in production, not local disk.
- Put uploaded media behind a CDN with safe content headers.
- Add async malware scanning for public media.
- Add image/video transcoding to strip metadata and normalize files.
- Add signed upload/download URLs for larger media.
- Add EXIF/location stripping.

## Data Leakage And Privacy

Status: partial.

Implemented:

- Sensitive request fields are redacted from logs.
- Backend Sentry events scrub authorization, cookies, passwords, OTPs, media payloads, ciphertext, and tokens.
- Mobile Sentry events scrub auth tokens, OTPs, device seeds, media E2EE keys, media payloads, ciphertext, and tokens.
- Generic auth errors avoid confirming whether password/email is valid in login/reset paths.
- Production env validation rejects weak JWT/OTP secrets.
- Production env validation disables dev OTP preview.
- Attachments are encrypted client-side before upload.
- Direct message contents are transported through Signal-style encrypted payloads.
- Backend stores direct message ciphertext, not plaintext, for mobile direct messages.

Required:

- Add structured safe logging with request IDs.
- Add data retention policy and deletion jobs.
- Add privacy-preserving analytics only.
- Minimize metadata leakage where practical.
- Encrypt particularly sensitive database columns if needed.

## MITM, Replay, And Session Security

Status: partial.

Implemented:

- Production backend requires HTTPS `APP_BASE_URL`.
- HSTS is sent when behind HTTPS.
- Access and refresh tokens have separate signing secrets.
- Refresh token rotation and reuse detection mitigate replay.
- Device mismatch blocks refresh-token use from another device ID.
- WebSocket tokens are not sent in URL query strings; relay uses an auth message handshake.
- LiveKit calls use short-lived server-issued room tokens.
- LiveKit media E2EE key is generated on mobile and delivered through the encrypted Signal-style direct-message channel.
- Mobile Signal store now uses trust-on-first-use for device identity keys.
- New-device login alerts reduce silent account-takeover risk.

Required:

- Add certificate pinning or trust-on-first-launch policy for high-security builds.
- Add explicit identity-change warning UI.
- Add safety-number/device-verification UI.
- Add server-side nonce/idempotency protections for high-value mutation endpoints.
- Add replay tests for refresh, OTP, call signaling, billing webhooks, and media actions.

## Scraping And Enumeration

Status: partial.

Implemented:

- User search requires authentication.
- User search results are capped.
- Feed and story list limits are capped.
- CORS allowlist rejects unrelated browser origins.

Required:

- Add per-user and per-IP search quotas.
- Add cursor pagination with abuse detection.
- Add private account controls and blocked-user model.
- Add anti-enumeration delays or generic responses where appropriate.
- Add CDN/WAF bot rules for public media and API routes.

## Infrastructure-Level Attacks

Status: partial.

Implemented:

- Production startup rejects localhost and temporary tunnel base URLs.
- Production startup requires high-entropy secrets.
- Production startup requires SMTP, TURN, LiveKit, Redis, Sentry, WAF provider, security alert mailbox, backup policy URL, RevenueCat secret, and production media config where relevant.
- Database SSL is supported.
- Health and readiness endpoints exist.
- Sentry backend and mobile hooks exist with PII scrubbing.
- Dependency audits currently pass for backend and mobile.
- Security operations runbook exists for WAF/CDN, incident response, monitoring, backup/recovery, and staging validation.
- Staging security check script exists at `backend npm run security:staging-check`.

Required:

- Deploy behind Cloudflare WAF or equivalent.
- Use managed Postgres with backups and point-in-time recovery.
- Store secrets in hosting provider secret manager, not files.
- Enable database least-privilege roles.
- Add CI/CD with tests, audit, and migration checks.
- Add monitoring/alerts for 5xx spikes, auth abuse, billing webhook failures, call failures, and upload anomalies.
- Add regular dependency scanning with Dependabot/Snyk.
- Add backup restore drills.

## Current Verified Checks

- Backend TypeScript build passes.
- Backend smoke tests pass.
- Backend production dependency audit reports zero vulnerabilities.
- Mobile TypeScript check passes.
- Mobile Expo config check passes.
- Mobile production dependency audit reports zero vulnerabilities.

## Launch Gate

KRYNO should not be sold as a paid production app until these are completed:

- Permanent hosted backend.
- Hosted Postgres with migrations applied.
- Cloudflare R2/S3 production media storage.
- LiveKit production credentials and two-device call validation.
- Redis or edge-backed distributed rate limiting.
- Sentry backend and mobile enabled with PII scrubbing.
- Device verification / identity-change warning UI.
- Access-control regression tests for social, media, messaging, billing, and calls.
- Production APK built against permanent HTTPS API, not a temporary tunnel.
