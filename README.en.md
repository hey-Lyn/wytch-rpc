# Wytch RPC

![Node](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)
![Dependencies](https://img.shields.io/badge/runtime-0%20dependencies-brightgreen)
![Tests](https://img.shields.io/badge/tests-50%20passing-brightgreen)
![Discord](https://img.shields.io/badge/Discord-Rich%20Presence-5865F2?logo=discord&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

> Show on your Discord status **what you're watching on YouTube**: title, channel, timestamp with a progress bar, thumbnail and a button to resume at the exact second. All done by talking to Discord over the **raw IPC protocol** — no external libraries.

[Versão em português 🇧🇷](README.md)

---

## Quick start (Windows) 🚀

Don't want to touch any code? Grab the ready-made executable:

1. **Download** `wytch-rpc-win-x64.zip` from the [**Releases**](https://github.com/hey-Lyn/wytch-rpc/releases) page and extract the folder.
2. **Run the app**: double-click `wytch-rpc.vbs` (or `iniciar.bat`).
   - It runs **hidden**, with an **icon in the system tray** (near the clock). Right-click the icon to **Open YouTube**, see **Status** or **Quit**.
   - Want it to start with Windows? Run `instalar-autostart.bat` once.
3. **Install the extension**: open `chrome://extensions` (or `vivaldi://extensions` / `edge://extensions`) → enable **Developer mode** → **Load unpacked** → select the `extension` folder.
4. Open a YouTube video. Done! 🎉

> **No Discord app creation needed** — it ships with a default Application ID. To customize (credit, thumbnail style or your own ID), click the **Wytch RPC icon** in the toolbar.

**Requirements:** Discord desktop running and logged in (the app, not the browser).

---

## Demo

While you watch a video, your status looks like this:

```
▶ Watching YouTube
   Channel · Video title
   ▶ 03:21 / 10:45 · by @yourhandle

   [Assistir]            ← opens the video at the exact timestamp
```

- **Paused** (or switched tabs)? The progress freezes (`❚❚ 03:21 / 10:45`).
- **Closed** the YouTube tab? The RPC disappears.
- **Watching a live stream?** No progress bar, just elapsed time.
- **An ad is playing?** The RPC never shows ads.

---

## Features

- ⏱️ **Real-time timestamp** with progress bar (playing / paused / live)
- 🖼️ **Video thumbnail** as the RPC large image in a **square frame** — Discord requires a square image; the server generates it via `images.weserv.nl` (default: zoom-fill, no borders; or `contain` with a background)
- 🔘 **"Assistir" button** that opens the video at the current second
- 🧊 Freezes progress on pause, tab switch or during ads
- 🧹 Clears the RPC automatically when the last YouTube tab closes
- 🔁 **Auto-reconnect**: if Discord restarts or the app closes, the server recovers by itself
- 🛡️ Validated input (anti-NaN, truncation, payload limits) — production-grade
- 🧪 Automated test suite (**50 tests**) validating the protocol end-to-end
- 🖱️ **Beginner-friendly**: ready-made executable (`wytch-rpc.exe`), `iniciar.bat`/`parar.bat` scripts, Windows auto-start and an extension **settings popup**
- 🗂️ **Runs hidden** with an **icon in the system tray** — no always-open console window
- 📦 **Zero runtime dependencies** — pure Node.js (the `.exe` embeds the runtime)
- 🏷️ Configurable credit (`by @yourhandle`)

---

## How it works

```
Extension (MV3) ──HTTP POST /update──► Local server (Node.js) ──IPC (named pipe)──► Discord
  content.js                              server.js                        \\.\pipe\discord-ipc-{0..9}
```

**No OAuth, no tokens.** Discord lets you update an app's Rich Presence by just sending the `client_id` (Application ID) — the same mechanism PreMiD uses. That keeps the project dead simple.

### The protocol

The Discord desktop app exposes **named pipes** `\\.\pipe\discord-ipc-{0..9}`. Every message is a frame:

| bytes 0–3 | bytes 4–7 | bytes 8+ |
|-----------|-----------|----------|
| opcode (uint32 LE) | JSON size (uint32 LE) | JSON payload |

Opcodes used:

| opcode | name | direction |
|--------|------|-----------|
| `0` | HANDSHAKE | client → Discord (`{ "v": 1, "client_id": "..." }`) |
| `1` | FRAME | both (`SET_ACTIVITY` with the activity, or `READY`/`CLOSE`/`ERROR`) |
| `2` | CLOSE | Discord → client |
| `3` | PING | both (heartbeat) |
| `4` | PONG | reply to PING |

The activity is the standard Discord object (type `3` = Watching) with `timestamps` in **seconds** and a `buttons` URL:

```json
{
  "type": 3,
  "details": "Channel · Video title",
  "state": "▶ 03:21 / 10:45 · by @yourhandle",
  "timestamps": { "start": 1790000000 },
  "assets": { "large_image": "https://images.weserv.nl/?url=...&w=640&h=640&fit=cover" },
  "buttons": [{ "label": "Assistir", "url": "https://www.youtube.com/watch?v=<id>&t=201" }]
}
```

---

## Requirements

- **Discord desktop** (Windows, macOS or Linux) running and logged in
- **Chrome / Edge / Vivaldi / Brave** (any Chromium browser) — the extension uses Manifest V3
- For the **manual install**: **Node.js 18+** (tested on v24)

---

## Manual install (Node.js / developers)

```bash
git clone https://github.com/hey-Lyn/wytch-rpc.git
cd wytch-rpc
npm start
```

`server/config.json` is created automatically on first run. You should see:

```
Servidor local ouvindo em http://127.0.0.1:4444
Conectado ao Discord (IPC READY)
```

Then load the extension: `chrome://extensions` → **Developer mode** → **Load unpacked** → `extension/` folder.

To build the standalone executable:

```bash
npm install          # installs the packager (build-time only)
npm run build:exe    # outputs dist/wytch-rpc.exe
```

---

## Configuration

The easiest way is the **extension popup** (click the Wytch RPC icon). Changes are saved to `server/config.json` and applied immediately.

| field | default | description |
|-------|---------|-------------|
| `clientId` | *(project default)* | Discord Application ID. Only change it if you created your own. |
| `activityName` | `"YouTube"` | Name shown under the status (the "game" name) |
| `credit` | `""` | Extra text at the end of the state line, e.g. `"by @yourhandle"` |
| `squareThumb` | `true` | Embeds the thumbnail in a 640×640 square (via `images.weserv.nl`) so Discord doesn't crop it |
| `thumbFit` | `"cover"` | How the square is filled: `cover` (zoom, no borders) or `contain` (whole video + background) |
| `thumbBg` | `"000000"` | Background color (hex) used when `thumbFit` is `contain` |
| `pipeIndex` | *(auto)* | Force a fixed pipe index `discord-ipc-N` (optional) |

Optional environment variables: `YT_RPC_PORT`, `YT_RPC_CONFIG`, `YT_RPC_LOG`.

---

## Tests

```bash
npm test
```

The suite boots the real server against a **Discord mock** (dedicated pipe + own port, never touching your real Discord) and validates 50 cases: handshake, payload, states (playing/paused/live), truncation, input sanitization, HTTP robustness, configuration, timeouts and reconnection.

```
RESULTADO: 50 passaram, 0 falharam
```

---

## Dev tools

| command | what it does |
|---------|--------------|
| `npm start` | starts the server |
| `npm test` | runs the 50 integration tests |
| `npm run build:exe` | builds the standalone executable into `dist/` |
| `npm run icons` | regenerates the extension icons (PNG) |
| `npm run diag -- <clientId>` | named pipe diagnostics against real Discord |
| `node tools/test-pipe.js` | manual Discord mock to inspect the protocol |

---

## Project structure

```
wytch-rpc/
├── extension/          Manifest V3 extension (Chrome/Edge/Vivaldi/Brave)
│   ├── manifest.json
│   ├── content.js      Extracts video, title, channel, timestamp, ads
│   ├── background.js   Clears RPC when the last tab closes
│   ├── options.html/js Settings popup (extension icon)
│   └── icons/          Generated icons
├── server/
│   ├── server.js       HTTP server + Discord IPC client (zero deps)
│   ├── config.example.json
│   └── config.json     (git-ignored — auto-created)
├── tools/
│   ├── run-tests.js    50 integration tests
│   ├── test-pipe.js    Discord mock
│   ├── diag-pipe.js    Real-pipe diagnostics
│   └── generate-icons.js
├── iniciar.bat / parar.bat / instalar-autostart.bat
├── wytch-rpc.vbs / tray.ps1        Starts hidden + tray icon
├── iniciar-console.bat             Console mode (debug)
├── package.json        Scripts (start / test / build:exe / icons / diag)
└── README.md
```

---

## Roadmap / ideas

- [x] Extension settings popup
- [x] Server packaged as a single binary (`.exe`)
- [ ] Firefox support (WebExtensions)
- [ ] Detect music videos and use the Spotify RPC
- [ ] Publish to the Chrome Web Store

---

## Troubleshooting

**Status not showing**
1. Is the server running? Open http://127.0.0.1:4444/ — it should show `"discordConnected": true`.
2. Extension loaded? Open `chrome://extensions` and check it's enabled.
3. RPC buttons only appear to **other users** — you won't see your own button.
4. The name in the status is your Discord **app** name (the project default shows "Wytch").

**"porta 4444 já está em uso" (port already in use)**
An instance is already running. Right-click the tray icon → **Quit** (or run `parar.bat`).

**Progress not updating**
Check `server.log` (next to `server.js` or the `.exe`) — it logs every RPC change, connection and error.

---

## License

[MIT](LICENSE) © 2026 [hey-Lyn](https://github.com/hey-Lyn)

Built from scratch with pure Node.js, zero runtime dependencies, as a portfolio project.
