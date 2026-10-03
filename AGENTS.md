# AGENTS.md

Discord Rich Presence for YouTube: a Manifest V3 browser extension + a local Node.js HTTP server that talks to the Discord desktop client over raw named-pipe IPC. Docs are Portuguese (`README.md`) with an English mirror (`README.en.md`) — keep both in sync when behavior changes.

## Commands

```bash
npm start                 # run server (node server/server.js), port 4444
npm test                  # integration suite (tools/run-tests.js)
npm run build:exe         # pkg -> dist/wytch-rpc.exe
npm run icons             # regenerate extension/icons/*.png
npm run diag -- <clientId>  # probe the real Discord pipe
node tools/test-pipe.js   # manual Discord mock to inspect the protocol
```

There is no lint, typecheck, formatter, CI, or test framework. Plain CommonJS JS with `'use strict'`. Runtime has zero deps, so `npm start`/`npm test` work without `npm install`; `npm install` is only needed for `npm run build:exe` (sole devDependency `@yao-pkg/pkg`, which downloads a Node binary on first build).

## Testing quirks

- `tools/run-tests.js` is one monolithic script, not a framework. There is no way to run a single case; comment out phases or copy the helper functions to focus a check.
- It spawns the **real** `server/server.js` with env `YT_RPC_PORT=4445`, `YT_RPC_CONFIG=tools/test-config.json`, `YT_RPC_LOG=tools/test-server.log`, and a mock Discord pipe on index `3`. It writes and deletes those two artifacts; don't commit them.
- The suite contains real sleeps (phases 5 and 6 wait ~25s combined), so a full run takes well over 30s. This is expected, not a hang.
- Named pipes (`\\?\pipe\discord-ipc-N`) are Windows-only, so the suite must be run on Windows.

## Architecture

- `server/server.js` is the entire backend (single file): HTTP server + Discord IPC client. Endpoints: `POST /update`, `POST /clear`, `POST /config`, `GET /` or `/status`. Runtime config lives in `server/config.json` (gitignored, auto-created); `server/config.example.json` is the committed template. Override with `YT_RPC_PORT`, `YT_RPC_CONFIG`, `YT_RPC_LOG`.
- Config changes via the extension's `POST /config` are applied live and a changed `clientId` forces a Discord reconnect.
- `extension/content.js` scrapes YouTube and POSTs to `/update` on a `setTimeout` loop (~1s playing, ~5s paused); `extension/background.js` POSTs `/clear` when the last YouTube tab closes. `content.js` matches only `https://www.youtube.com/*` (not m/music), even though the server's `Origin` allowlist also accepts those variants. `extension/options.js` and `extension/manifest.json` also hardcode `http://127.0.0.1:4444` (manifest via `host_permissions`), as does `tray.ps1` (port probe + status link). Changing the port means editing all of these, not just `server.js`.
- When packaged (`process.pkg`), `BASE_DIR` becomes the exe's directory, so `config.json`/`server.log` sit next to the `.exe`; otherwise next to `server.js`.
- A watchdog freezes progress after ~5s and clears the RPC after ~15s without updates (tab closed/paused). The mock in tests relies on this timing.
- Security: the HTTP API binds only to `127.0.0.1`, validates the `Host` header (anti DNS-rebinding: `127.0.0.1`/`localhost`/`::1` only) and `Origin` (only `https://www.youtube.com` + variants and `chrome-extension://`/`moz-extension://`); requests with no `Origin` (tests, curl) pass. CORS echoes the allowed origin instead of `*`, and `Access-Control-Allow-Private-Network` is only returned on a matching preflight. `/update` also drops `thumbnailUrl` not under `i.ytimg.com`/`img.youtube.com` and strips `videoId` to `[A-Za-z0-9_-]`; `log()` strips newlines. `/update` and `/config` share one global rate-limit bucket (30 req/s, not per-IP or per-endpoint). Don't loosen these without a token-based auth alternative.
- Windows launcher chain (not needed for development): `iniciar.bat` -> `wytch-rpc.vbs` -> hidden `tray.ps1` (tray icon, finds `wytch-rpc.exe` next to itself or in `dist\`). `parar.bat` only kills `wytch-rpc.exe`, not a `node`-run server.

## Protocol notes

Discord IPC frames are `uint32LE opcode | uint32LE json length | JSON`. Opcodes: `0` HANDSHAKE, `1` FRAME, `2` CLOSE, `3` PING, `4` PONG. The activity uses Discord `type: 3` (Watching) with `timestamps` in **seconds** and `buttons`. Thumbnails are square-padded through `images.weserv.nl` because Discord requires square images. No OAuth/tokens: Rich Presence works with just a `clientId` (an Application ID; a default is embedded).
