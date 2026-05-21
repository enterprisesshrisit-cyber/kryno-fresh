# Android Foundation

KRYNO now has a rebuilt Capacitor Android shell in this workspace so we can test encrypted messaging and 1:1 calling on-device.

## Current status

- Android project recreated under [`android`](C:/Users/ankit/Downloads/movies/Balti/project/kryno-fresh/android)
- Capacitor config added in [`capacitor.config.ts`](C:/Users/ankit/Downloads/movies/Balti/project/kryno-fresh/capacitor.config.ts)
- Android sync works with:

```bash
npm run android:sync
```

- Base permissions added:
  - `INTERNET`
  - `CAMERA`
  - `RECORD_AUDIO`
  - `MODIFY_AUDIO_SETTINGS`

## Scripts

```bash
npm run android:sync
npm run android:open
npm run android:run
```

## Backend target

The app no longer assumes browser-relative `/api` only.

Runtime backend resolution lives in:

- [`runtimeConfig.ts`](C:/Users/ankit/Downloads/movies/Balti/project/kryno-fresh/src/lib/runtimeConfig.ts)

Resolution order:

1. `localStorage["kryno_backend_origin"]`
2. `VITE_KRYNO_BACKEND_ORIGIN`
3. fallback LAN origin for native-like hosts
4. current browser origin for normal web

Current fallback LAN backend:

```text
http://192.168.243.116:8080
```

## What this enables now

- installable Android shell
- real microphone/camera permission prompts
- on-device testing for:
  - auth
  - encrypted DM
  - 1:1 audio calls
  - 1:1 video calls

## What we should add next for mobile quality

1. Persistent call history inside chat UI
2. Proper full-screen incoming call surface
3. Better mobile audio route handling
4. Push/incoming call wake flow
5. Native secure storage instead of browser-style IndexedDB

## Important limitation

This is still a mobile shell around the current React app. It is the right testing step, but it is not yet the final native Kotlin architecture.
