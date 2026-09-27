'use strict';

const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SERVER_JS = path.join(ROOT, 'server', 'server.js');
const TEST_CONFIG = path.join(__dirname, 'test-config.json');
const TEST_LOG = path.join(__dirname, 'test-server.log');
const TEST_PIPE = 3;
const PIPE = `\\\\?\\pipe\\discord-ipc-${TEST_PIPE}`;
const BASE = 'http://127.0.0.1:4445';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
let failed = 0;

function ok(name, cond, extra) {
  if (cond) {
    passed++;
    console.log('  ✓ ' + name);
  } else {
    failed++;
    console.log('  ✗ ' + name + (extra !== undefined ? '  => ' + JSON.stringify(extra) : ''));
  }
}

function request(method, urlPath, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + urlPath);
    const req = http.request(
      {
        host: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers: { 'Content-Type': 'application/json', ...(headers || {}) },
      },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(b);
          } catch (e) {
            json = null;
          }
          resolve({ status: res.statusCode, headers: res.headers, json, raw: b });
        });
      }
    );
    req.on('error', reject);
    if (body === undefined) req.end();
    else if (typeof body === 'string') req.end(body);
    else req.end(JSON.stringify(body));
  });
}

const get = (p) => request('GET', p);
const post = async (p, body, headers) => {
  const r = await request('POST', p, body, headers);
  await sleep(150);
  return r;
};

// ---------------------------------------------------------------------------
// Mock Discord (pipe server)
// ---------------------------------------------------------------------------
let mockFrames = [];
let mockServer = null;
let mockSockets = new Set();

function sendFrame(socket, op, payload) {
  const json = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(8);
  header.writeUInt32LE(op, 0);
  header.writeUInt32LE(json.length, 4);
  socket.write(Buffer.concat([header, json]));
}

function startMock() {
  mockFrames = [];
  mockSockets = new Set();
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      mockSockets.add(socket);
      socket.on('close', () => mockSockets.delete(socket));
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
          mockFrames.push({ op, payload });
          if (op === 0) {
            sendFrame(socket, 1, {
              cmd: 'DISPATCH',
              evt: 'READY',
              data: { v: 1, config: {}, user: { username: 'mock', id: '1' } },
              nonce: null,
            });
          } else if (op === 1) {
            sendFrame(socket, 1, {
              cmd: payload.cmd,
              evt: null,
              data: payload.args || {},
              nonce: payload.nonce,
            });
          } else if (op === 3) {
            sendFrame(socket, 4, payload);
          }
        }
      });
      socket.on('error', () => {});
    });
    server.on('error', reject);
    server.listen({ path: PIPE }, () => {
      mockServer = server;
      resolve();
    });
  });
}

function stopMock() {
  return new Promise((resolve) => {
    for (const s of mockSockets) s.destroy();
    mockSockets.clear();
    if (mockServer) {
      mockServer.close(() => {
        mockServer = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

function lastSetActivity() {
  for (let i = mockFrames.length - 1; i >= 0; i--) {
    const f = mockFrames[i];
    if (f.op === 1 && f.payload && f.payload.cmd === 'SET_ACTIVITY') return f.payload;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  fs.writeFileSync(
    TEST_CONFIG,
    JSON.stringify({
      clientId: 'TEST_CLIENT_ID_999',
      activityName: 'YouTube',
      credit: 'by @hey-Lyn',
      pipeIndex: TEST_PIPE,
    })
  );
  fs.writeFileSync(TEST_LOG, '');

  const srv = spawn(process.execPath, [SERVER_JS], {
    env: {
      ...process.env,
      YT_RPC_PORT: '4445',
      YT_RPC_CONFIG: TEST_CONFIG,
      YT_RPC_LOG: TEST_LOG,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let serverOut = '';
  srv.stdout.on('data', (d) => (serverOut += d));
  srv.stderr.on('data', (d) => (serverOut += d));

  const dump = () => console.log('--- server output ---\n' + serverOut.slice(-4000));

  try {
    console.log('== Fase 0: servidor inicia sem Discord ==');
    await sleep(2000);
    let st = await get('/');
    ok('servidor responde sem Discord', st.status === 200 && st.json && st.json.ok === true, st.raw);
    ok('discordConnected=false sem Discord', st.json.discordConnected === false, st.json);
    ok('status expõe pid', typeof st.json.pid === 'number');

    const playing = {
      active: true,
      videoId: 'dQw4w9WgXcQ',
      title: 'Rick Astley - Never Gonna Give You Up',
      channel: 'Rick Astley',
      positionMs: 83000,
      durationMs: 212000,
      paused: false,
      thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
    };
    const r1 = await post('/update', playing);
    ok('update aceito enquanto desconectado', r1.status === 200 && r1.json.ok === true, r1.raw);

    console.log('== Fase 1: conexão com mock + payload ==');
    await startMock();
    let ready = false;
    for (let i = 0; i < 30 && !ready; i++) {
      await sleep(500);
      try {
        st = await get('/');
        ready = st.json && st.json.discordConnected === true;
      } catch (e) {
        ready = false;
      }
    }
    ok('conecta ao mock (READY)', ready);
    ok('update pendente é enviado após READY', lastSetActivity() !== null);

    st = await get('/');
    ok('discordConnected=true no status', st.json.discordConnected === true);

    const a = lastSetActivity();
    ok('activity com type Watching (3)', a.args.activity.type === 3, a);
    ok(
      'details = canal · título',
      a.args.activity.details === 'Rick Astley · Rick Astley - Never Gonna Give You Up',
      a.args.activity.details
    );
    ok('state começa com ▶', a.args.activity.state.startsWith('▶ '), a.args.activity.state);
    ok('state contém crédito', a.args.activity.state.includes('by @hey-Lyn'), a.args.activity.state);
    ok('timestamps.start é número', Number.isFinite(a.args.activity.timestamps.start));
    ok('timestamps.end ausente tocando', a.args.activity.timestamps.end === undefined, a.args.activity.timestamps);
    ok(
      'botão aponta timestamp exato',
      a.args.activity.buttons &&
        a.args.activity.buttons[0].url === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=83',
      a && a.args.activity.buttons
    );
    ok('thumbnail como large_image', a.args.activity.assets.large_image.includes('i.ytimg.com'));
    ok('thumbnail usa proxy quadrado (letterbox)', a.args.activity.assets.large_image.includes('images.weserv.nl'), a.args.activity.assets.large_image);
    ok('thumbnail quadrada aponta o vídeo certo', a.args.activity.assets.large_image.includes('dQw4w9WgXcQ'), a.args.activity.assets.large_image);
    ok('activity.name = YouTube', a.args.activity.name === 'YouTube');

    console.log('== Fase 2: estados ==');
    await post('/update', { ...playing, paused: true, positionMs: 100000 });
    let b = lastSetActivity().args.activity;
    ok('pausado: state começa com ❚❚', b.state.startsWith('❚❚ '), b.state);
    ok('pausado: timestamps.end presente', Number.isFinite(b.timestamps.end), b.timestamps);
    ok('pausado: barra congelada (end-start=posição)', Math.round((b.timestamps.end - b.timestamps.start) * 1000) === 100000, b.timestamps);

    await post('/update', { ...playing, paused: false });
    b = lastSetActivity().args.activity;
    ok('retomado: timestamps.end removido', b.timestamps.end === undefined, b.timestamps);

    await post('/update', { ...playing, durationMs: 0, paused: false });
    b = lastSetActivity().args.activity;
    ok('live (duração 0): sem " / " no state', !b.state.includes(' / '), b.state);
    ok('live: sem timestamps.end', b.timestamps.end === undefined, b.timestamps);

    const longTitle = 'X'.repeat(300);
    await post('/update', { ...playing, title: longTitle });
    b = lastSetActivity().args.activity;
    ok('título longo truncado em details (<=128)', b.details.length <= 128 && b.details.endsWith('…'), b.details.length);
    ok('título longo truncado em large_text', b.assets.large_text.length <= 128, b.assets.large_text.length);

    await post('/update', { ...playing, positionMs: 'abc' });
    b = lastSetActivity().args.activity;
    ok(
      'positionMs inválido é sanado (sem NaN)',
      Number.isFinite(b.timestamps.start) &&
        typeof b.state === 'string' &&
        !b.state.includes('NaN') &&
        b.timestamps.start > 0,
      b
    );

    await post('/update', { active: true, videoId: 'dQw4w9WgXcQ', channel: 'X', positionMs: 10 });
    ok('update sem título não derruba o servidor', true);
    st = await get('/');
    ok('servidor segue respondendo após payload incompleto', st.status === 200);

    console.log('== Fase 3: HTTP robustez ==');
    let r = await post('/update', '{isso não é json');
    ok('JSON inválido → 400', r.status === 400, r.status);
    r = await post('/update', '');
    ok('corpo vazio → 400', r.status === 400, r.status);
    r = await post('/update', 'olá mundo');
    ok('corpo não-JSON → 400', r.status === 400, r.status);

    r = await request('OPTIONS', '/update', undefined);
    ok('preflight OPTIONS → 204', r.status === 204, r.status);
    ok('CORS allow-origin', r.headers['access-control-allow-origin'] === '*', r.headers['access-control-allow-origin']);
    ok('CORS private network header', r.headers['access-control-allow-private-network'] === 'true', r.headers['access-control-allow-private-network']);

    r = await get('/nao-existe');
    ok('rota desconhecida → 404', r.status === 404, r.status);

    console.log('== Fase 4: clear ==');
    r = await post('/clear', {});
    ok('clear → 200', r.status === 200);
    ok('clear envia activity null', lastSetActivity().args.activity === null);

    console.log('== Fase 5: timeout congela e limpa ==');
    await post('/update', { ...playing, paused: false });
    await sleep(6500);
    st = await get('/');
    ok('sem updates (tocando) congela após ~5s', st.json.current && st.json.current.paused === true, st.json.current);
    await sleep(10000);
    st = await get('/');
    ok('sem updates limpa após ~15s', st.json.current === null, st.json.current);

    console.log('== Fase 6: reconexão ==');
    await stopMock();
    await sleep(8000);
    st = await get('/');
    ok('servidor continua no ar após Discord cair', st.status === 200 && st.json.ok === true);
    ok('discordConnected=false após queda', st.json.discordConnected === false, st.json);

    await startMock();
    ready = false;
    for (let i = 0; i < 30 && !ready; i++) {
      await sleep(500);
      try {
        st = await get('/');
        ready = st.json && st.json.discordConnected === true;
      } catch (e) {
        ready = false;
      }
    }
    ok('reconecta sozinho após Discord voltar', ready);
    ok('último payload é reenviado após reconectar', lastSetActivity() !== null);

    console.log('\n==========================');
    console.log(`RESULTADO: ${passed} passaram, ${failed} falharam`);
    console.log('==========================');
  } catch (e) {
    failed++;
    console.log('  ✗ EXCEÇÃO no teste: ' + e.message);
    dump();
  } finally {
    try {
      srv.kill();
    } catch (e) {}
    await stopMock();
    await sleep(300);
    try {
      fs.unlinkSync(TEST_CONFIG);
      fs.unlinkSync(TEST_LOG);
    } catch (e) {}
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();