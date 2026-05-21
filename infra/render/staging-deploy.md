# KRYNO Render Staging Deploy

Render is acceptable for free-first staging. The free web service can sleep after inactivity, so it is not the final paid-launch hosting target unless upgraded.

## Deployment Mode

- Service name: `kryno-api-staging`
- Public URL target: `https://kryno-api-staging.onrender.com`
- Runtime: Node
- Region: Singapore
- Root directory: `backend`
- Build command: `npm ci --include=dev && npm run build`
- Start command: `npm run start`
- Health check path: `/api/health`

The repo includes a Render Blueprint at:

```text
C:\Users\ankit\Downloads\movies\Balti\project\kryno-fresh\render.yaml
```

## Required Private Environment Values

Add these in the Render dashboard. Do not commit them.

```env
DATABASE_URL=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
OTP_PEPPER=
EMAIL_FROM=verify.kryno@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_PASS=
SMTP_USER=verify.kryno@gmail.com
SECURITY_ALERT_EMAIL=verify.kryno@gmail.com
REDIS_URL=
SENTRY_DSN=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
REVENUECAT_WEBHOOK_SECRET=
BACKUP_POLICY_URL=https://docs.kryno.local/security/backup-recovery
```

## Public/Non-Secret Environment Values

These are already declared in `render.yaml`.

```env
APP_ENV=production
NODE_ENV=production
HOST=0.0.0.0
PORT=8080
APP_BASE_URL=https://kryno-api-staging.onrender.com
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=false
JWT_ISSUER=kryno-auth
JWT_AUDIENCE=kryno-mobile
ALLOW_DEV_EMAIL_TOKEN_PREVIEW=false
REDIS_TLS=true
WAF_PROVIDER=cloudflare
MEDIA_STORAGE_DRIVER=s3
R2_BUCKET=kryno-staging-media
R2_REGION=auto
R2_PUBLIC_BASE_URL=https://pub-0cb7c93c361f4935b749eefc449dd301.r2.dev
KRYNO_STUN_URLS=stun:stun.l.google.com:19302
KRYNO_TURN_URLS=
KRYNO_TURN_USERNAME=
KRYNO_TURN_CREDENTIAL=
MAX_ATTACHMENT_BYTES=15728640
MAX_SOCIAL_MEDIA_BYTES=20971520
```

## Manual Render Steps

1. Create or sign in to Render.
2. Connect the GitHub repository or upload/import this repo.
3. Create a new Blueprint from `render.yaml`, or create a Web Service manually with the settings above.
4. Add all private environment values.
5. Deploy.
6. Run migrations separately when schema changes:

```powershell
cd C:\Users\ankit\Downloads\movies\Balti\project\kryno-fresh\backend
$env:DATABASE_URL="<staging database url>"
$env:DATABASE_SSL="true"
$env:DATABASE_SSL_REJECT_UNAUTHORIZED="false"
npm.cmd run build
npm.cmd run db:migrate:dist
```

7. Open:

```text
https://kryno-api-staging.onrender.com/api/health
https://kryno-api-staging.onrender.com/api/ready
```

8. Run the staging security check locally against the Render URL.

```powershell
cd C:\Users\ankit\Downloads\movies\Balti\project\kryno-fresh\backend
$env:APP_BASE_URL="https://kryno-api-staging.onrender.com"
npm.cmd run security:staging-check
```

## Notes

- Render Free is fine for staging, but sleeping services may make first requests slow.
- Rotate all secrets before paid public launch because several staging values were shared during setup.
- If Gmail SMTP fails on Render with TLS verification, set `SMTP_TLS_REJECT_UNAUTHORIZED=false` for staging only and plan to move to a transactional provider before launch.
