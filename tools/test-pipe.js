'use strict';

const net = require('net');
const fs = require('fs');
const path = require('path');

const PIPE_INDEX = process.argv[2] || '1';
const LOG = path.join(__dirname, `pipe-log-${PIPE_INDEX}.jsonl`);
const PIPE = '\\\\?\\pipe\\discord-ipc-' + PIPE_INDEX;

function writeLog(obj) {
  fs.appendFileSync(LOG, JSON.stringify(obj) + '\n');
}

function send(socket, op, payload) {
  const json = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.alloc(8);
  header.writeUInt32LE(op, 0);
  header.writeUInt32LE(json.length, 4);
  socket.write(Buffer.concat([header, json]));
}

function handle(socket, id) {
  let buf = Buffer.alloc(0);
  writeLog({ event: 'connection', id });

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
      writeLog({ event: 'frame', id, op, payload });

      if (op === 0) {
        const ready = {
          cmd: 'DISPATCH',
          evt: 'READY',
          data: { v: 1, config: {}, user: { username: 'mockuser', id: '123456' } },
          nonce: null,
        };
        send(socket, 1, ready);
        writeLog({ event: 'sent_ready', id });
      } else if (op === 1) {
        const ok = {
          cmd: payload.cmd,
          evt: null,
          data: payload.args || {},
          nonce: payload.nonce,
        };
        send(socket, 1, ok);
      } else if (op === 3) {
        send(socket, 4, payload);
      }
    }
  });

  socket.on('error', (e) => writeLog({ event: 'error', id, message: e.message }));
  socket.on('close', () => writeLog({ event: 'close', id }));
}

fs.writeFileSync(LOG, '');

let count = 0;
const server = net.createServer((socket) => handle(socket, count++));
server.listen({ path: PIPE }, () => {
  console.log('mock Discord escutando em ' + PIPE);
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));