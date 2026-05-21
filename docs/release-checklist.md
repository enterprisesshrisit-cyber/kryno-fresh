# KRYNO Release Checklist

## Backend

Run from `backend`:

```powershell
npm install
npm run build
npm run test:smoke
$env:NODE_OPTIONS='--use-system-ca'; npm run audit:prod
npm run db:migrate
npm start
```

Production environment must include:

- `APP_ENV=production`
- `DATABASE_URL`
- `DATABASE_SSL=true`
- `APP_BASE_URL=https://api.<domain>`
- high-entropy JWT secrets and OTP pepper
- SMTP config
- dedicated TURN config
- LiveKit config
- RevenueCat webhook secret
- Sentry DSN
- R2/S3 storage config when `MEDIA_STORAGE_DRIVER=s3`

Health checks:

- `GET /api/health` must return `ok: true`.
- `GET /api/ready` must return database `ok`.

## Mobile

Run from `mobile-kryno-ui-raw`:

```powershell
npm install
npm run typecheck
npm run config:check
$env:NODE_OPTIONS='--use-system-ca'; npm audit --omit=dev
npm run build:android:preview
```

For store builds:

```powershell
$env:EXPO_PUBLIC_KRYNO_API_URL='https://api.<domain>'
npm run build:android:production
```

Production builds must never use localhost, LAN IP, or a `trycloudflare.com` URL.

## Manual Smoke Test

- Create account.
- Verify email.
- Log in.
- Upload profile photo.
- Create post with image.
- Create story.
- Confirm uploaded profile/story media survives backend restart when using R2/S3 storage.
- Like/unlike post and verify count.
- Search for user.
- Open chat.
- Send encrypted text message.
- Send encrypted attachment.
- Start audio call.
- Start video call.
- Confirm LiveKit audio/video calls connect on two physical phones using mobile data or separate Wi-Fi networks.
- Confirm LiveKit call setup never enters the room until the encrypted media key is received.
- Verify subscription entitlement after RevenueCat sandbox purchase.

## Blockers Before Paid Launch

- Hosted backend on permanent domain.
- Object storage configured outside local disk.
- LiveKit Cloud credentials configured and tested in staging.
- Call E2EE late-key/failure cases covered by automated tests.
- RevenueCat mobile SDK purchase flow wired.
- Sentry mobile SDK wired.
- Store signing and app privacy disclosures completed.
