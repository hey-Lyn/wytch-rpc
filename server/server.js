'use strict';

const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

const SERVER_PORT = parseInt(process.env.YT_RPC_PORT, 10) || 4444;
const CONFIG_FILE = process.env.YT_RPC_CONFIG
  ? path.resolve(process.env.YT_RPC_CONFIG)
  : path.join(__dirname, 'config.json');
const EXAMPLE_FILE = path.join(__dirname, 'config.example.json');
const LOG_FILE = process.env.YT_RPC_LOG
  ? path.resolve(process.env.YT_RPC_LOG)
  : path.join(__dirname, 'server.log');
const HEARTBEAT_MS = 30000;
const CONNECT_TIMEOUT_MS = 3000;
const RETRY_MS = 5000;
const PLAYING_TIMEOUT_MS = 5000;
const CLEAR_TIMEOUT_MS = 15000;

let config = {
  clientId: '',
  activityName: 'YouTube',
  credit: '',
  squareThumb: true,
  thumbFit: 'cover',
  thumbBg: '000000',
};

function log(msg) {
  const ts = new Date().toLocaleTimeString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (e) {
    // ignora
  }
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE) && fs.existsSync(EXAMPLE_FILE)) {
    fs.copyFileSync(EXAMPLE_FILE, CONFIG_FILE);
    log('config.json criado a partir de config.example.json — preencha o "clientId"!');
  }
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8').replace(/^\uFEFF/, '');
      config = { ...config, ...JSON.parse(raw) };
    } catch (e) {
      log('ERRO: config.json inválido (' + e.message + ')');
    }
  }
  if (!config.clientId) {
    log('ATENÇÃO: "clientId" não configurado. Crie um app em discord.com/developers e coloque o Application ID em server/config.json');
  }
}

const state = {
  active: false,
  videoId: null,
  title: null,
  channel: null,
  positionMs: 0,
  durationMs: 0,
  paused: false,
  thumbnailUrl: null,
  startEpochMs: null,
  lastUpdateMs: 0,
  lastSig: '',
};

const discord = {
  socket: null,
  ready: false,
  connecting: false,
  retryTimer: null,
  connectTimer: null,
  readyTimer: null,
  heartbeatTimer: null,
  pending: null,
  lastSentPayload: null,
};

function nonce() {
  return 'ytrpc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function sendFrame(op, payload) {
  if (!discord.socket || discord.socket.destroyed) return;
  try {
    const json = Buffer.from(JSON.stringify(payload), 'utf8');
    const header = Buffer.alloc(8);
    header.writeUInt32LE(op, 0);
    header.writeUInt32LE(json.length, 4);
    discord.socket.write(Buffer.concat([header, json]));
  } catch (e) {
    // socket em estado inválido — o reconexão cuida
  }
}

function startHeartbeat() {
  clearInterval(discord.heartbeatTimer);
  discord.heartbeatTimer = setInterval(() => {
    sendFrame(3, { nonce: nonce() });
  }, HEARTBEAT_MS);
}

function handleOpcode(op, payload) {
  if (op === 1) {
    if (payload.evt === 'READY') {
      clearTimeout(discord.connectTimer);
      clearTimeout(discord.readyTimer);
      discord.ready = true;
      log('Conectado ao Discord (IPC READY)');
      startHeartbeat();
      if (discord.pending) {
        const p = discord.pending;
        discord.pending = null;
        sendFrame(1, p);
      } else if (discord.lastSentPayload) {
        sendFrame(1, discord.lastSentPayload);
      }
    } else if (payload.evt === 'ERROR') {
      log('Erro do Discord RPC: ' + (payload.data && payload.data.message));
    }
  } else if (op === 2) {
    log('Discord fechou a conexão (CLOSE)');
    clearInterval(discord.heartbeatTimer);
    if (discord.socket) discord.socket.destroy();
    discord.ready = false;
    discord.socket = null;
    scheduleReconnect();
  } else if (op === 3) {
    sendFrame(4, payload);
  } else if (op === 4) {
    // PONG
  }
}

function attach(socket) {
  discord.socket = socket;
  let buf = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 8) {
      const op = buf.readUInt32LE(0);
      const len = buf.readUInt32LE(4);
      if (buf.length < 8 + len) break;
      let payload;
      try {
        payload = JSON.parse(buf.subarray(8, 8 + len).toString('utf8'));
      } catch (e) {
        buf = buf.subarray(8 + len);
        continue;
      }
      buf = buf.subarray(8 + len);
      handleOpcode(op, payload);
    }
  });
  socket.on('error', (err) => {
    if (err.code !== 'ECONNREFUSED' && err.code !== 'ENOENT') {
      log('Erro no pipe do Discord: ' + err.message);
    }
  });
  socket.on('close', () => {
    log('Conexão com o Discord fechada');
    clearTimeout(discord.readyTimer);
    clearInterval(discord.heartbeatTimer);
    discord.ready = false;
    discord.socket = null;
    scheduleReconnect();
  });
}

let pipeIndex = 0;

function tryConnect() {
  if (!config.clientId) {
    scheduleReconnect();
    return;
  }
  if (discord.connecting || discord.socket) return;
  discord.connecting = true;

  const fixed = Number.isInteger(config.pipeIndex);
  const idx = fixed ? config.pipeIndex : pipeIndex;
  const pipePath = '\\\\?\\pipe\\discord-ipc-' + idx;
  const sock = net.createConnection({ path: pipePath });

  clearTimeout(discord.connectTimer);
  discord.connectTimer = setTimeout(() => {
    sock.destroy();
    discord.connecting = false;
    advancePipe(fixed);
  }, CONNECT_TIMEOUT_MS);

  sock.once('connect', () => {
    clearTimeout(discord.connectTimer);
    log('Conectado ao pipe discord-ipc-' + idx);
    discord.connecting = false;
    attach(sock);
    sendFrame(0, { v: 1, client_id: config.clientId });
    pipeIndex = 0;
    startReadyWatchdog();
  });

  sock.once('error', (err) => {
    clearTimeout(discord.connectTimer);
    sock.destroy();
    discord.connecting = false;
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOENT') {
      advancePipe(fixed);
    } else {
      scheduleReconnect();
    }
  });
}

function advancePipe(fixed) {
  if (fixed) {
    scheduleReconnect();
    return;
  }
  if (pipeIndex < 9) {
    pipeIndex++;
    tryConnect();
  } else {
    pipeIndex = 0;
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  discord.connecting = false;
  clearTimeout(discord.retryTimer);
  discord.retryTimer = setTimeout(tryConnect, RETRY_MS);
}

function startReadyWatchdog() {
  clearTimeout(discord.readyTimer);
  discord.readyTimer = setTimeout(() => {
    if (!discord.ready && discord.socket) {
      log('Timeout esperando READY do Discord — reconectando');
      if (discord.socket) discord.socket.destroy();
    }
  }, CONNECT_TIMEOUT_MS);
}

function setActivity(activity) {
  if (!config.clientId) return;
  if (activity) {
    const sig = `${state.videoId}|${state.title}|${state.channel}|${state.paused}`;
    if (sig !== state.lastSig) {
      state.lastSig = sig;
      const btn = activity.buttons && activity.buttons[0] ? activity.buttons[0].url : '';
      const img = activity.assets && activity.assets.large_image ? activity.assets.large_image : '';
      log(`RPC: ${activity.details} | ${activity.state} | botão: ${btn} | img: ${img.slice(0, 120)}`);
    }
  }
  const payload = {
    cmd: 'SET_ACTIVITY',
    args: { pid: process.pid, activity },
    nonce: nonce(),
  };
  discord.pending = payload;
  discord.lastSentPayload = payload;
  if (discord.ready) {
    sendFrame(1, payload);
    discord.pending = null;
  }
}

function truncate(str, max) {
  const s = str == null ? '' : String(str);
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toStr(v, max) {
  const s = v == null ? '' : String(v);
  return truncate(s, max || 256);
}

function formatTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function squareThumbUrl(url) {
  if (!config.squareThumb || typeof url !== 'string') return url;
  if (/^https:\/\/(i\.ytimg\.com|img\.youtube\.com)\//.test(url)) {
    const fit = config.thumbFit === 'contain' ? 'contain' : 'cover';
    const bg = /^[0-9a-fA-F]{6}$/.test(config.thumbBg || '') ? config.thumbBg : '000000';
    return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=640&h=640&fit=${fit}&bg=${bg}`;
  }
  return url;
}

function buildActivity() {
  if (!state.active || !state.title) return null;

  const play = state.paused ? '❚❚' : '▶';
  const now = Date.now();
  const startEpoch = state.startEpochMs != null ? state.startEpochMs : now - state.positionMs;
  const startSec = Math.round(startEpoch / 1000);
  const credit = config.credit ? ` · ${config.credit}` : '';
  const positionSec = Math.floor(state.positionMs / 1000);

  let stateLine;
  const timestamps = {};
  if (state.durationMs > 0) {
    stateLine = `${play} ${formatTime(state.positionMs)} / ${formatTime(state.durationMs)}${credit}`;
    if (state.paused) {
      timestamps.start = startSec;
      timestamps.end = Math.round((startEpoch + state.positionMs) / 1000);
    } else {
      timestamps.start = startSec;
    }
  } else {
    stateLine = `${play} ${formatTime(state.positionMs)}${credit}`;
    timestamps.start = startSec;
  }

  const activity = {
    type: 3,
    details: truncate(`${state.channel || 'YouTube'} · ${state.title}`, 128),
    state: truncate(stateLine, 128),
    timestamps,
    assets: {
      large_image: squareThumbUrl(state.thumbnailUrl || ''),
      large_text: truncate(state.title, 128),
    },
    buttons: [
      {
        label: 'Assistir',
        url: `https://www.youtube.com/watch?v=${state.videoId}&t=${positionSec}`,
      },
    ],
  };

  if (config.activityName) activity.name = config.activityName;

  return activity;
}

function handleUpdate(data) {
  state.lastUpdateMs = Date.now();

  if (!data || typeof data !== 'object' || !data.active) {
    state.active = false;
    state.title = null;
    setActivity(null);
    return;
  }

  const videoId = toStr(data.videoId, 32);
  const title = toStr(data.title, 300);
  const channel = toStr(data.channel, 300);
  const positionMs = Math.max(0, toNum(data.positionMs));
  const durationMs = Math.max(0, toNum(data.durationMs));
  const paused = !!data.paused;
  const thumbnailUrl = toStr(data.thumbnailUrl, 512);

  if (!videoId || !title || !channel) {
    // metadados incompletos (página carregando) — mantém estado atual, não limpa
    return;
  }

  const now = Date.now();
  const changed =
    videoId !== state.videoId || title !== state.title || channel !== state.channel;
  const playing = !paused;

  if (changed || (playing && state.paused)) {
    state.startEpochMs = now - positionMs;
  } else if (playing && state.startEpochMs != null) {
    const expected = now - state.startEpochMs;
    if (Math.abs(expected - positionMs) > 3000) {
      state.startEpochMs = now - positionMs;
    }
  }
  if (state.startEpochMs == null) {
    state.startEpochMs = now - positionMs;
  }

  state.active = true;
  state.videoId = videoId;
  state.title = title;
  state.channel = channel;
  state.positionMs = positionMs;
  state.durationMs = durationMs;
  state.paused = paused;
  state.thumbnailUrl = thumbnailUrl;

  setActivity(buildActivity());
}

function status() {
  return {
    ok: true,
    server: 'rodando',
    pid: process.pid,
    uptimeSec: Math.floor(process.uptime()),
    discordConnected: discord.ready,
    discordClientId: config.clientId ? 'configurado' : 'AUSENTE',
    current: state.active
      ? {
          title: state.title,
          channel: state.channel,
          positionMs: state.positionMs,
          durationMs: state.durationMs,
          paused: state.paused,
          videoId: state.videoId,
          thumbnailUrl: state.thumbnailUrl,
        }
      : null,
  };
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

const server = http.createServer((req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/update') {
    let body = '';
    let tooLarge = false;
    req.on('data', (c) => {
      body += c;
      if (body.length > 100000) {
        tooLarge = true;
        req.removeAllListeners('data');
      }
    });
    req.on('end', () => {
      if (tooLarge) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'payload muito grande' }));
        return;
      }
      try {
        const data = JSON.parse(body);
        handleUpdate(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, discordConnected: discord.ready }));
      } catch (e) {
        log('ERRO no /update: ' + (e && e.stack ? e.stack : e));
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'json inválido' }));
      }
    });
    req.on('error', () => {});
    return;
  }

  if (req.method === 'POST' && req.url === '/clear') {
    handleUpdate({ active: false });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/status')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status(), null, 2));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'not found' }));
});

setInterval(() => {
  if (!state.active) return;
  const since = Date.now() - state.lastUpdateMs;
  if (state.paused && since > CLEAR_TIMEOUT_MS) {
    log('Sem atualizações — tab de YouTube fechada, limpando RPC');
    handleUpdate({ active: false });
  } else if (!state.paused && since > PLAYING_TIMEOUT_MS) {
    log('Sem atualizações — congelando progresso');
    state.paused = true;
    setActivity(buildActivity());
  }
}, 1000);

loadConfig();
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    log(`ERRO: porta ${SERVER_PORT} já está em uso — outra instância do servidor está rodando?`);
    process.exit(1);
  } else {
    log('Erro no servidor HTTP: ' + err.message);
  }
});
server.listen(SERVER_PORT, '127.0.0.1', () => {
  log(`Servidor local ouvindo em http://127.0.0.1:${SERVER_PORT}`);
});
tryConnect();

process.on('uncaughtException', (err) => {
  log('ERRO não tratado: ' + (err && err.stack ? err.stack : err));
});
process.on('unhandledRejection', (reason) => {
  log('Rejeição não tratada: ' + (reason && reason.stack ? reason.stack : reason));
});