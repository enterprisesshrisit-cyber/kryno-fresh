# KRYNO Security Operations Runbook

This runbook defines the controls that must be active before a paid public launch.

## WAF / CDN Baseline

Required provider: Cloudflare WAF or equivalent.

Minimum rules:

- Force HTTPS and HSTS.
- Block known malicious/bot ASN and threat-intel categories.
- Managed OWASP Core Ruleset enabled in simulate mode first, then block after tuning.
- Rate limit `/api/auth/*`, `/api/users/search`, `/api/social/media`, `/api/attachments/upload`, and `/api/messages/ws`.
- Challenge suspicious signup, login, reset, and search bursts.
- Block requests with executable upload extensions when they reach CDN/WAF.
- Cache immutable public media under the media domain only, never API auth responses.
- Disable cache for `/api/*`.
- Log WAF events to the monitoring workspace.

## Monitoring And Alerts

Required:

- Sentry backend DSN configured with PII scrubbing.
- Sentry mobile DSN configured before app-store release.
- Alert mailbox configured with `SECURITY_ALERT_EMAIL`.
- Provider alerts for CPU, memory, restart loops, failed deploys, 5xx spikes, DB connection exhaustion, Redis failures, SMTP failures, and storage failures.

Alert thresholds:

- 5xx rate above 1% for 5 minutes.
- Auth 401/429 spike above baseline for 5 minutes.
- Upload rejection spike above baseline for 10 minutes.
- WebSocket disconnect/call failure spike above baseline for 10 minutes.
- Billing webhook failures above 0.
- Database readiness failure above 1 minute.

## Incident Response

Severity 1:

- Token signing secret leak.
- Database credential leak.
- Confirmed account takeover campaign.
- Public media malware incident.
- Payment/subscription tampering.

Immediate actions:

- Freeze deploys.
- Rotate affected secrets.
- Revoke affected refresh token families.
- Put WAF into elevated protection mode.
- Disable risky endpoints if needed.
- Preserve logs and Sentry events.
- Publish user communication only after facts are confirmed.

## Backup And Recovery

Required:

- Managed Postgres point-in-time recovery enabled.
- Daily logical backup export retained for at least 14 days.
- Media bucket versioning/lifecycle policy enabled.
- Secrets backed up in password manager/secret manager, not in repo.
- Monthly restore drill to a staging database.

Recovery objectives:

- RPO: 24 hours maximum for early staging, 1 hour target before paid launch.
- RTO: 4 hours maximum for early staging, 1 hour target before paid launch.

## Staging Validation

Run before creating a release APK:

```powershell
cd C:\Users\ankit\Downloads\movies\Balti\project\kryno-fresh\backend
$env:APP_ENV='production'
npm.cmd run security:staging-check
npm.cmd run build
npm.cmd run test:smoke
npm.cmd run audit:prod
```

Manual validation:

- Create account.
- Verify email.
- Log in on two devices.
- Confirm new-device security alert email.
- Upload profile photo.
- Upload story.
- Publish post media.
- Like/unlike post.
- Search user.
- Start encrypted chat.
- Start LiveKit audio call.
- Start LiveKit video call.
- Confirm `/api/ready` remains healthy during the test.
