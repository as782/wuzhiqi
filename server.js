// Gomoku online server — Node.js + WebSocket, no database.
// Deploy on Abasthan as a Web Service: start command `npm start`
// (or `node server.js`), port from $PORT (default 3000).
// One free app is enough: this one process serves the page AND the game.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(PUBLIC, p);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const SIZE = 15;
const rooms = new Map(); // code -> { board, turn, players:{black,white}, spectators:Set, winner, winLine, scores }

function newRoom() {
  return { board: Array.from({ length: SIZE }, () => Array(SIZE).fill(0)), turn: 1, players: {}, spectators: new Set(), winner: 0, winLine: null, scores: { black: 0, white: 0 }, moves: 0 };
}
function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? makeCode() : code;
}
function checkWin(board, x, y, c) {
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (const [dx, dy] of dirs) {
    const line = [[x, y]];
    for (const s of [1, -1]) {
      for (let i = 1; i < 5; i++) {
        const nx = x + dx * i * s, ny = y + dy * i * s;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE || board[ny][nx] !== c) break;
        line.push([nx, ny]);
      }
    }
    if (line.length >= 5) return line.slice(0, 5);
  }
  return null;
}
function state(room, code) {
  return { type: 'state', room: code, board: room.board, turn: room.turn, winner: room.winner, winLine: room.winLine, scores: room.scores, moves: room.moves,
    players: { black: !!room.players.black, white: !!room.players.white }, spectators: room.spectators.size };
}
function broadcast(room, code) {
  const msg = JSON.stringify(state(room, code));
  for (const ws of [room.players.black, room.players.white, ...room.spectators]) if (ws && ws.readyState === 1) ws.send(msg);
}
function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }

wss.on('connection', (ws) => {
  ws.roomCode = null; ws.color = 0; // 1 black, 2 white, 0 spectator
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.type === 'create') {
      const code = makeCode();
      const room = newRoom(); room.players.black = ws;
      rooms.set(code, room); ws.roomCode = code; ws.color = 1;
      send(ws, { type: 'joined', room: code, color: 'black' });
      broadcast(room, code); return;
    }
    if (m.type === 'join') {
      const code = String(m.room || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) { send(ws, { type: 'error', message: '房间不存在，请检查房间码' }); return; }
      ws.roomCode = code;
      if (!room.players.black) { room.players.black = ws; ws.color = 1; send(ws, { type: 'joined', room: code, color: 'black' }); }
      else if (!room.players.white) { room.players.white = ws; ws.color = 2; send(ws, { type: 'joined', room: code, color: 'white' }); }
      else { room.spectators.add(ws); ws.color = 0; send(ws, { type: 'joined', room: code, color: 'spectator' }); }
      broadcast(room, code); return;
    }
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    if (m.type === 'move') {
      if (room.winner) return;
      if (ws.color !== room.turn) { send(ws, { type: 'error', message: '还没轮到你' }); return; }
      const x = m.x | 0, y = m.y | 0;
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || room.board[y][x]) return;
      room.board[y][x] = ws.color; room.moves++;
      const line = checkWin(room.board, x, y, ws.color);
      if (line) { room.winner = ws.color; room.winLine = line; room.scores[ws.color === 1 ? 'black' : 'white']++; }
      else room.turn = room.turn === 1 ? 2 : 1;
      broadcast(room, ws.roomCode); return;
    }
    if (m.type === 'rematch') {
      if (ws.color === 0) return;
      const r = newRoom(); r.scores = room.scores;
      // swap colours so the loser / other side starts black next game
      r.players.black = room.players.white; r.players.white = room.players.black;
      for (const p of [r.players.black, r.players.white]) if (p) { p.color = p === r.players.black ? 1 : 2; }
      r.spectators = room.spectators;
      rooms.set(ws.roomCode, r);
      for (const p of [r.players.black, r.players.white]) if (p) send(p, { type: 'joined', room: ws.roomCode, color: p === r.players.black ? 'black' : 'white' });
      broadcast(r, ws.roomCode); return;
    }
    if (m.type === 'leave') { leave(ws); }
  });
  ws.on('close', () => leave(ws));
  function leave(ws) {
    const room = rooms.get(ws.roomCode); if (!room) return;
    if (room.players.black === ws) room.players.black = null;
    else if (room.players.white === ws) room.players.white = null;
    else room.spectators.delete(ws);
    if (!room.players.black && !room.players.white && room.spectators.size === 0) { rooms.delete(ws.roomCode); return; }
    broadcast(room, ws.roomCode);
  }
});

server.listen(PORT, () => console.log(`Gomoku online listening on ${PORT}`));
