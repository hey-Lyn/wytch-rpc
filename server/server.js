'use strict';

const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

const IS_PACKAGED = !!process.pkg;
const BASE_DIR = IS_PACKAGED ? path.dirname(process.execPath) : __dirname;

const SERVER_PORT = parseInt(process.env.YT_RPC_PORT, 10) || 4444;
const CONFIG_FILE = process.env.YT_RPC_CONFIG
  ? path.resolve(process.env.YT_RPC_CONFIG)
  : path.join(BASE_DIR, 'config.json');
const LOG_FILE = process.env.YT_RPC_LOG
  ? path.resolve(process.env.YT_RPC_LOG)
  : path.join(BASE_DIR, 'server.log');
const HEARTBEAT_MS = 30000;
const CONNECT_TIMEOUT_MS = 3000;
const RETRY_MS = 5000;
const PLAYING_TIMEOUT_MS = 5000;
const CLEAR_TIMEOUT_MS = 15000;

// Application ID padrão (app "Wytch"). Rich Presence não exige login,
// então qualquer Application ID válido funciona — assim quem usa não
// precisa criar um app no portal do Discord.
const DEFAULT_CLIENT_ID = '1520940765423865886';

let config = {
  clientId: DEFAULT_CLIENT_ID,
  activityName: 'YouTube',
  credit: '',
  squareThumb: true,
  thumbFit: 'cover',
  thumbBg: '000000',
};

function log(msg) {
  const ts = new Date().toLocaleTimeString();
  const safe = String(msg).replace(/[\r\n\u2028\u2029]+/g, ' ');
  const line = `[${ts}] ${safe}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (e) {
    // ignora
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n');
  } catch (e) {
    log('Não foi possível salvar config.json (' + e.message + ')');
  }
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    saveConfig();
    if (!IS_PACKAGED) log('config.json criado com os valores padrão');
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
    log('ATENÇÃO: "clientId" não configurado (veja o README).');
  }
}

function applyConfig(patch) {
  if (!patch || typeof patch !== 'object') return;
  const before = config.clientId;
  if (typeof patch.clientId === 'string') {
    config.clientId = patch.clientId.trim().slice(0, 64) || DEFAULT_CLIENT_ID;
  }
  if (typeof patch.activityName === 'string') config.activityName = toStr(patch.activityName, 128) || 'YouTube';
  if (typeof patch.credit === 'string') config.credit = toStr(patch.credit, 128);
  if (typeof patch.squareThumb === 'boolean') config.squareThumb = patch.squareThumb;
  if (patch.thumbFit === 'cover' || patch.thumbFit === 'contain') config.thumbFit = patch.thumbFit;
  if (typeof patch.thumbBg === 'string' && /^[0-9a-fA-F]{6}$/.test(patch.thumbBg)) config.thumbBg = patch.thumbBg;
  saveConfig();
  log('Configuração atualizada via extensão');
  if (config.clientId !== before) {
    if (discord.socket) discord.socket.destroy();
    discord.ready = false;
  }
  setActivity(buildActivity());
}

function publicConfig() {
  return {
    clientId: config.clientId,
    activityName: config.activityName,
    credit: config.credit,
    squareThumb: config.squareThumb,
    thumbFit: config.thumbFit,
    thumbBg: config.thumbBg,
  };
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
        label: 'Watch',
        url: `https://www.youtube.com/watch?v=${state.videoId}&t=${positionSec}`,
      },
      {
        label: 'Get it',
        url: 'https://github.com/hey-Lyn/wytch-rpc',
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

  const videoId = toStr(data.videoId, 32).replace(/[^A-Za-z0-9_-]/g, '');
  const title = toStr(data.title, 300);
  const channel = toStr(data.channel, 300);
  const positionMs = Math.max(0, toNum(data.positionMs));
  const durationMs = Math.max(0, toNum(data.durationMs));
  const paused = !!data.paused;
  const rawThumb = toStr(data.thumbnailUrl, 512);
  const thumbnailUrl = /^https:\/\/(i\.ytimg\.com|img\.youtube\.com)\//.test(rawThumb)
    ? rawThumb
    : '';

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
    config: publicConfig(),
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

const ALLOWED_ORIGINS = new Set([
  'https://www.youtube.com',
  'https://youtube.com',
  'https://m.youtube.com',
  'https://music.youtube.com',
]);
const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function normalizeHost(hostHeader) {
  if (typeof hostHeader !== 'string') return '';
  let h = hostHeader.trim().toLowerCase();
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    if (end !== -1) h = h.slice(0, end + 1);
  } else {
    const colon = h.indexOf(':');
    if (colon !== -1) h = h.slice(0, colon);
  }
  return h;
}

function isAllowedHost(req) {
  return ALLOWED_HOSTS.has(normalizeHost(req.headers.host));
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  return /^(chrome|moz)-extension:\/\//.test(origin);
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (String(req.headers['access-control-request-private-network']).toLowerCase() === 'true') {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
  }
}

const RATE_WINDOW_MS = 1000;
const RATE_MAX = 30;
let rateHits = [];

function isRateLimited() {
  const now = Date.now();
  rateHits = rateHits.filter((t) => now - t < RATE_WINDOW_MS);
  if (rateHits.length >= RATE_MAX) return true;
  rateHits.push(now);
  return false;
}

const server = http.createServer((req, res) => {
  if (!isAllowedHost(req)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'host não permitido' }));
    return;
  }
  if (req.headers.origin && !isAllowedOrigin(req.headers.origin)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'origem não permitida' }));
    return;
  }
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/update') {
    if (isRateLimited()) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'rate limit' }));
      return;
    }
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

  if (req.method === 'POST' && req.url === '/config') {
    if (isRateLimited()) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'rate limit' }));
      return;
    }
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 20000) req.removeAllListeners('data');
    });
    req.on('end', () => {
      try {
        applyConfig(JSON.parse(body || '{}'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, config: publicConfig() }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'json inválido' }));
      }
    });
    req.on('error', () => {});
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