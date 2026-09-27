# Wytch RPC

![Node](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![Tests](https://img.shields.io/badge/tests-43%20passing-brightgreen)
![Discord](https://img.shields.io/badge/Discord-Rich%20Presence-5865F2?logo=discord&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

> Show on your Discord status **what you're watching on YouTube**: title, channel, timestamp with a progress bar, thumbnail and a button to resume at the exact second. All done by talking to Discord over the **raw IPC protocol** — no external libraries.

[Versão em português 🇧🇷](README.md)

---

## Demo

While you watch a video, your status looks like this:

```
▶ Watching YouTube
   Channel · Video title
   ▶ 03:21 / 10:45 · by @hey-Lyn

   [Watch on YouTube]     ← opens the video at the exact timestamp
```

- **Paused** (or switched tabs)? The progress freezes (`❚❚ 03:21 / 10:45`).
- **Closed** the YouTube tab? The RPC disappears.
- **Watching a live stream?** No progress bar, just elapsed time.
- **An ad is playing?** The RPC never shows ads.

---

## Features

- ⏱️ **Real-time timestamp** with progress bar (playing / paused / live)
- 🖼️ **Video thumbnail** as the RPC large image in a **square frame** — Discord requires a square image; the server generates it via `images.weserv.nl` (default: zoom-fill the square, no borders; or `contain` with a background)
- 🔘 **"Watch on YouTube" button** that opens the video at the current second
- 🧊 Freezes progress on pause, tab switch or during ads
- 🧹 Clears the RPC automatically when the last YouTube tab closes
- 🔁 Auto-reconnect: if Discord restarts or the app closes, the server recovers by itself
- 🛡️ Validated input (anti-NaN, truncation, payload limits) — production-grade
- 🧪 Automated test suite (42 tests) validating the protocol end-to-end
- 📦 **Zero dependencies** — pure Node.js, no `npm install`
- 🏷️ Configurable credit (`by @yourhandle`)

---

## How it works

```
┌──────────────────────────┐      ┌──────────────────────────────┐
│   Extension (MV3)        │      │  Local server (Node.js)      │
│   content.js             │ HTTP │  server.js                   │
│   reads the <video> and  ├─────►│  validates, builds the       │
│   the YouTube DOM        │  POST│  activity and sends it via   │
└──────────────────────────┘      │  the named pipe              │
                                 │  http://127.0.0.1:4444/update └─────────────┬────────┐
                                                                              │ IPC     │
                                                                              ▼         │
                                                                      ┌────────────────┐│
                                                                      │ Discord        ││
                                                                      │ \\.\pipe\      ││
                                                                      │ discord-ipc-0  ││
                                                                      └────────────────┘│
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
  "state": "▶ 03:21 / 10:45 · by @hey-Lyn",
  "timestamps": { "start": 1790000000 },
  "assets": { "large_image": "https://i.ytimg.com/vi/<id>/maxresdefault.jpg" },
  "buttons": [{ "label": "Watch on YouTube", "url": "https://www.youtube.com/watch?v=<id>&t=201" }]
}
```

---

## Requirements

- **Node.js 18+** (tested on v24)
- **Discord desktop** (Windows, macOS or Linux) running and logged in
- **Chrome / Edge / Vivaldi / Brave** (any Chromium browser) — the extension uses Manifest V3

---

## Installation

### 1. Create the Discord app

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) → **New Application**.
2. Copy the **Application ID** (that's your `client_id`).
3. In **Rich Presence**, enable *Rich Presence Asset* (optional — the thumbnail is sent as a URL and works without it).

### 2. Configure the server

```bash
git clone https://github.com/hey-Lyn/wytch-rpc.git
cd wytch-rpc
cp server/config.example.json server/config.json
# edit server/config.json and paste your Application ID
```

```json
{
  "clientId": "YOUR_APPLICATION_ID_HERE",
  "activityName": "YouTube",
  "credit": "by @hey-Lyn"
}
```

### 3. Start the server

```bash
npm start
```

You should see: `Servidor local ouvindo em http://127.0.0.1:4444` and `Conectado ao Discord (IPC READY)`.

### 4. Install the extension

1. Open `chrome://extensions` in your browser.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the `extension/` folder.
4. Open a YouTube video and check your Discord status. 🎉

---

## Configuration (`server/config.json`)

| field | default | description |
|-------|---------|-------------|
| `clientId` | — | Application ID of your Discord app (required) |
| `activityName` | `"YouTube"` | Name shown under the status (the "game" name) |
| `credit` | `""` | Extra text at the end of the state line, e.g. `"by @hey-Lyn"` |
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

The suite boots the real server against a **Discord mock** (dedicated pipe + own port, never touching your real Discord) and validates 43 cases: handshake, payload, states (playing/paused/live), truncation, input sanitization, HTTP robustness, timeouts and reconnection.

```
RESULTADO: 43 passaram, 0 falharam
```

---

## Dev tools

| command | what it does |
|---------|--------------|
| `npm start` | starts the server |
| `npm test` | runs the 43 integration tests |
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
│   └── icons/          Generated icons
├── server/
│   ├── server.js       HTTP server + Discord IPC client (zero deps)
│   ├── config.example.json
│   └── config.json     (git-ignored — your personal clientId)
├── tools/
│   ├── run-tests.js    43 integration tests
│   ├── test-pipe.js    Discord mock
│   ├── diag-pipe.js    Real-pipe diagnostics
│   └── generate-icons.js
├── package.json        Scripts (npm start / test / icons / diag)
└── README.md
```

---

## Roadmap / ideas

- [ ] Firefox support (WebExtensions)
- [ ] Extension popup settings (toggle, credit)
- [ ] Detect music videos and use the Spotify RPC
- [ ] Ship the server as a single binary (e.g. `pkg`)
- [ ] Publish to the Chrome Web Store

---

## Troubleshooting

**Status not showing**
1. Is the server running? `npm start` should print `Conectado ao Discord (IPC READY)`.
2. Extension loaded? Open `chrome://extensions` and check it's enabled.
3. RPC buttons only appear to **other users** — you won't see your own button.
4. The name shown in the status is your Discord **app** name (if you named it "Wytch", it shows "Watching Wytch").

**"porta 4444 já está em uso"**
An instance is already running. Kill the previous process (PID in `server/server.pid`).

**Progress not updating**
Check `server/server.log` — it logs every RPC change, connection and error.

---

## License

[MIT](LICENSE) © 2026 [hey-Lyn](https://github.com/hey-Lyn)

Built from scratch with pure Node.js, zero dependencies, as a portfolio project.
