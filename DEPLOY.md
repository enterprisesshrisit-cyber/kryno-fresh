# KRYNO Deployment

This repo is now packaged to deploy as one service:

- frontend build served by the backend
- API under `/api/*`
- websocket relay under `/api/messages/ws`
- live calling and encrypted messaging on the same origin

## Good hosts

- Render
- Railway
- Fly.io
- any Docker-capable VPS

## Not ideal as-is

- Vercel alone

This app needs a persistent Node server, websocket relay, PostgreSQL, and writable attachment storage. A static-only frontend host is not enough by itself.

## Build and run locally

```bash
npm run build:all
npm run start:live
```

The app will be served from:

```text
http://localhost:8080
```

## Docker deployment

This repo includes:

- `Dockerfile`
- `.dockerignore`

Default container port:

```text
8080
```

## Required backend environment variables

```text
APP_ENV=production
HOST=0.0.0.0
PORT=8080
DATABASE_URL=...
JWT_ISSUER=...
JWT_AUDIENCE=...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
ACCESS_TOKEN_TTL_MINUTES=15
REFRESH_TOKEN_TTL_DAYS=30
EMAIL_VERIFICATION_TTL_HOURS=24
APP_BASE_URL=https://your-live-domain.example
ATTACHMENT_STORAGE_DIR=./storage/attachments
MAX_ATTACHMENT_BYTES=15728640
```

## Deployment notes

- `APP_BASE_URL` must match your public HTTPS URL
- attach a persistent disk if you want attachment files to survive restarts
- configure a managed PostgreSQL database
- use HTTPS in production so microphone/camera and WebRTC work correctly on mobile browsers
