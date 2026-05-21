# Kryno Fresh

This is the clean rebuild workspace for Kryno.

The existing app in the project root remains untouched. Everything inside this folder is meant for the fresh restart so we can rebuild the encrypted platform from a stable baseline instead of patching unstable flows.

## Purpose

- restart architecture cleanly
- keep old code available for reference only
- rebuild deterministic messaging and calling flows

## Intended stack

- React
- TypeScript
- Vite
- Supabase
- Signal-based direct messaging
- sender-key encrypted groups
- WebRTC audio-first calling

## Next rebuild order

1. auth and device bootstrap
2. Signal direct messaging
3. encrypted voice notes and attachments
4. encrypted group messaging
5. stable direct audio calling
6. group calling

## Current Cloudflare Testing Flow

Until feature freeze, KRYNO is tested through Cloudflare Tunnel.

1. Start the local backend:
   - `npm run start:live`
2. Start the public tunnel:
   - `npm run tunnel`
3. Open the latest `trycloudflare.com` URL on every device.

Notes:
- `127.0.0.1:8080` is only the local origin behind Cloudflare.
- The app should be validated against the Cloudflare URL first.
- Android packaging should wait until the browser build is stable.

## Security Hardening Notes

- WebSocket relay auth now uses an in-band authentication handshake instead of putting the access token in the WebSocket URL.
- Email verification and password reset OTPs now use HMAC-based hashing with a server-side pepper instead of plain SHA-only hashing.
- OTP resend/reset creation is throttled server-side over a rolling window.

## TURN / Call Infrastructure

The app now supports runtime ICE config from the backend, so web clients can pick up TURN/STUN changes without a fresh frontend rebuild.

Configure these backend env vars:

- `KRYNO_STUN_URLS`
- `KRYNO_TURN_URLS`
- `KRYNO_TURN_USERNAME`
- `KRYNO_TURN_CREDENTIAL`

Example:

```env
KRYNO_STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
KRYNO_TURN_URLS=turn:turn.example.com:3478,turns:turn.example.com:5349?transport=tcp
KRYNO_TURN_USERNAME=myturnuser
KRYNO_TURN_CREDENTIAL=myturnpassword
```

Notes:
- if these are not set, the app falls back to the built-in public STUN/TURN development defaults
- if they are set, authenticated clients fetch `/api/calls/ice-config` at runtime and use the dedicated servers first

## Smoke Tests

Run the current backend smoke suite with:

- `npm run test:smoke`

This currently validates:
- relay auth message parsing
- JWT access/refresh round-trips
- OTP hashing helpers
