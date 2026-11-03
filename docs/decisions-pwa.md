# Decisions: installable app (PWA)

Goal: let the app be seen and demoed as a phone app, including the offline
checklist, without a native build.

| # | Decision | Why | Alternatives rejected |
|---|----------|-----|-----------------------|
| D1 | Ship the web app as a PWA (manifest + icons + existing service worker). Chosen by the user. | The offline queue, IndexedDB store and service worker are already web tech; a native shell adds no demo value. | Capacitor + Android emulator: needs Android Studio/SDK, a rebuild-and-sync per change, and a different API URL (10.0.2.2). Revisit if a native app is asked for. |
| D2 | `display: standalone`, portrait, theme and background colour `#00338D`. | Looks like an app (no browser bar) and matches the brand blue. | `browser` display: no install feel. |
| D3 | Icons are generated PNGs (192, 512, maskable 512, 180 apple-touch) with "RS" on brand blue. | Chrome needs 192 and 512 PNGs to offer install; maskable needs a wide safe margin. | SVG only: not accepted by every installability check. A real logo can replace the files later. |
| D4 | Add the manifest and icons to the service worker precache and bump the cache to `v2`. | The installed app must start offline with its icon and manifest; the version bump drops the old cache. | Leave the worker alone: install would work only while online. |
| D5 | `npm run pwa` = production build + `vite preview` on port 4173, with the same `/api` proxy as the dev server. | The service worker only registers in production builds, so the dev server (5173/5174) cannot show offline. | Register the worker in dev: caches stale dev modules and confuses hot reload. |
| D6 | Demo on the desktop at `http://localhost:4173` in a phone-sized window. | `localhost` counts as a secure context, so the service worker and install work with no HTTPS setup. | Phone over Wi-Fi at `http://<LAN-IP>:4173`: not a secure context, so the service worker will not register. |

## Open point

A real phone needs a secure origin. Options when needed: an HTTPS tunnel, a
self-signed certificate on `vite preview`, or USB port forwarding
(`chrome://inspect` -> port forwarding) so the phone sees `localhost`.
