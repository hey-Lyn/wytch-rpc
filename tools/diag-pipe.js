'use strict';

const net = require('net');

const PIPE = '\\\\?\\pipe\\discord-ipc-0';
const CLIENT_ID = process.argv[2] || '';

const sock = net.createConnection({ path: PIPE });
let buf = Buffer.alloc(0);

function send(op, payload) {
  const json = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(8);
  header.writeUInt32LE(op, 0);
  header.writeUInt32LE(json.length, 4);
  sock.write(Buffer.concat([header, json]));
}

sock.once('connect', () => {
  console.log('conectado ao pipe, enviando HANDSHAKE...');
  send(0, { v: 1, client_id: CLIENT_ID });
});

sock.on('data', (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  while (buf.length >= 8) {
    const op = buf.readUInt32LE(0);
    const len = buf.readUInt32LE(4);
    if (buf.length < 8 + len) break;
    const payload = JSON.parse(buf.subarray(8, 8 + len).toString('utf8'));
    buf = buf.subarray(8 + len);
    console.log('op=' + op + ' payload=' + JSON.stringify(payload));
    if (payload.evt === 'READY') {
      console.log('>>> READY recebido, testando SET_ACTIVITY...');
      send(1, {
        cmd: 'SET_ACTIVITY',
        args: { pid: process.pid, activity: { type: 3, details: 'teste', state: 'teste', buttons: [{ label: 'Teste', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=83' }] } },
        nonce: 'diag-1',
      });
    }
  }
});

sock.on('error', (e) => console.log('erro: ' + e.code + ' ' + e.message));
sock.on('close', () => console.log('fechado'));
setTimeout(() => process.exit(0), 8000);