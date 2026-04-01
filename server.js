const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3847;

app.use(express.static(path.join(__dirname, 'public')));

const TICK_RATE = 60;
const DT = 1 / TICK_RATE;
const GRAVITY = 2600;
const MOVE_ACCEL = 2600;
const MAX_SPEED = 380;
const AIR_CONTROL = 0.58;
const JUMP_VELOCITY = -690;
const SLIDE_SPEED_MULT = 1.42;
const FRICTION_GROUND = 0.88;
const AIR_FRICTION = 0.992;
const PUSH_FORCE = 520;
const PUSH_RANGE = 72;
const PUSH_COOLDOWN_MS = 1600;

const PLAYER_W = 34;
const PLAYER_H = 50;
const PLAYER_SLIDE_H = 24;

const PLATFORMS = [
  { x: 0, y: 668, w: 4200, h: 400 },
  { x: 180, y: 540, w: 260, h: 22 },
  { x: 480, y: 440, w: 200, h: 22 },
  { x: 720, y: 360, w: 280, h: 22 },
  { x: 1080, y: 500, w: 180, h: 22 },
  { x: 1320, y: 400, w: 220, h: 22 },
  { x: 1580, y: 520, w: 300, h: 22 },
  { x: 1950, y: 420, w: 240, h: 22 },
  { x: 2280, y: 320, w: 160, h: 22 },
  { x: 2520, y: 460, w: 260, h: 22 },
  { x: 2860, y: 560, w: 200, h: 22 },
  { x: 3140, y: 380, w: 320, h: 22 },
  { x: 3520, y: 480, w: 240, h: 22 },
  { x: 3820, y: 580, w: 200, h: 22 },
];

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#AA96DA',
  '#FCBAD3', '#A8D8EA', '#FFAAA5', '#C7CEEA', '#B5EAD7',
];

const players = {};
const inputs = {};

function createPlayer(socketId, nickname) {
  return {
    id: socketId,
    nickname: (nickname || '플레이어').slice(0, 16),
    x: 350 + Math.random() * 120,
    y: 520,
    vx: 0,
    vy: 0,
    facing: 1,
    onGround: false,
    sliding: false,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    lastPush: -PUSH_COOLDOWN_MS,
    w: PLAYER_W,
    h: PLAYER_H,
  };
}

function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function resolveX(p, platforms) {
  for (const plat of platforms) {
    if (!rectOverlap(p.x, p.y, p.w, p.h, plat.x, plat.y, plat.w, plat.h)) continue;
    const overlapL = p.x + p.w - plat.x;
    const overlapR = plat.x + plat.w - p.x;
    if (overlapL < overlapR) {
      p.x = plat.x - p.w;
      if (p.vx > 0) p.vx = 0;
    } else {
      p.x = plat.x + plat.w;
      if (p.vx < 0) p.vx = 0;
    }
  }
}

function resolveY(p, platforms) {
  let onGround = false;
  for (const plat of platforms) {
    if (!rectOverlap(p.x, p.y, p.w, p.h, plat.x, plat.y, plat.w, plat.h)) continue;
    const overlapT = p.y + p.h - plat.y;
    const overlapB = plat.y + plat.h - p.y;
    if (overlapT < overlapB) {
      p.y = plat.y - p.h;
      if (p.vy > 0) {
        p.vy = 0;
        onGround = true;
      }
    } else {
      p.y = plat.y + plat.h;
      if (p.vy < 0) p.vy = 0;
    }
  }
  return onGround;
}

function computeAnim(p) {
  if (!p.onGround) return 'jump';
  if (p.sliding) return 'slide';
  if (Math.abs(p.vx) > 40) return 'run';
  return 'idle';
}

function publicState(now) {
  const t = now || Date.now();
  return Object.values(players).map((p) => ({
    id: p.id,
    nickname: p.nickname,
    x: p.x,
    y: p.y,
    vx: p.vx,
    vy: p.vy,
    facing: p.facing,
    sliding: p.sliding,
    color: p.color,
    anim: computeAnim(p),
    w: p.w,
    h: p.h,
    pushCdLeft: Math.max(0, PUSH_COOLDOWN_MS - (t - p.lastPush)),
  }));
}

function applyPhysics(p, inp, now) {
  const slideWant = !!(inp.down && p.onGround);
  if (slideWant) {
    p.sliding = true;
    p.h = PLAYER_SLIDE_H;
  } else {
    p.sliding = false;
    p.h = PLAYER_H;
  }

  const accel = p.onGround ? MOVE_ACCEL : MOVE_ACCEL * AIR_CONTROL;
  const maxSp = p.sliding ? MAX_SPEED * SLIDE_SPEED_MULT : MAX_SPEED;

  if (inp.left && !inp.right) {
    p.vx -= accel * DT;
    p.facing = -1;
  } else if (inp.right && !inp.left) {
    p.vx += accel * DT;
    p.facing = 1;
  } else if (p.onGround) {
    p.vx *= FRICTION_GROUND;
  } else {
    p.vx *= AIR_FRICTION;
  }

  if (Math.abs(p.vx) > maxSp) p.vx = Math.sign(p.vx) * maxSp;

  if (inp.jumpQueued && p.onGround && !p.sliding) {
    p.vy = JUMP_VELOCITY;
    p.onGround = false;
  }

  if (inp.pushQueued && now - p.lastPush >= PUSH_COOLDOWN_MS) {
    for (const other of Object.values(players)) {
      if (other.id === p.id) continue;
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      const ox = other.x + other.w / 2;
      const oy = other.y + other.h / 2;
      const dx = ox - cx;
      const dy = oy - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < PUSH_RANGE && dist > 1) {
        const nx = dx / dist;
        const ny = dy / dist;
        other.vx += nx * PUSH_FORCE;
        other.vy += (ny * PUSH_FORCE * 0.45) - 180;
      }
    }
    p.lastPush = now;
  }

  p.vy += GRAVITY * DT;

  p.x += p.vx * DT;
  resolveX(p, PLATFORMS);
  p.y += p.vy * DT;
  p.onGround = resolveY(p, PLATFORMS);

  p.x = Math.max(-50, Math.min(4160 - p.w, p.x));
  if (p.y > 1200) {
    p.y = 400;
    p.x = 350 + Math.random() * 100;
    p.vx = 0;
    p.vy = 0;
  }
}

io.on('connection', (socket) => {
  socket.on('join', ({ nickname }) => {
    players[socket.id] = createPlayer(socket.id, nickname);
    inputs[socket.id] = {
      left: false,
      right: false,
      down: false,
      jumpQueued: false,
      pushQueued: false,
    };
    socket.emit('init', {
      id: socket.id,
      platforms: PLATFORMS,
      tickRate: TICK_RATE,
    });
    io.emit('state', publicState(Date.now()));
  });

  socket.on('input', (inp) => {
    const cur = inputs[socket.id];
    if (!cur || !players[socket.id]) return;
    if (inp.left !== undefined) cur.left = !!inp.left;
    if (inp.right !== undefined) cur.right = !!inp.right;
    if (inp.down !== undefined) cur.down = !!inp.down;
    if (inp.jump) cur.jumpQueued = true;
    if (inp.push) cur.pushQueued = true;
  });

  socket.on('chat', (payload) => {
    const p = players[socket.id];
    if (!p) return;
    const text = String(payload.text || '').slice(0, 200);
    const emoji = String(payload.emoji || '').slice(0, 8);
    io.emit('chat', {
      id: socket.id,
      nickname: p.nickname,
      text,
      emoji,
      t: Date.now(),
    });
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    delete inputs[socket.id];
    io.emit('state', publicState(Date.now()));
  });
});

setInterval(() => {
  const now = Date.now();
  for (const id of Object.keys(players)) {
    const p = players[id];
    const inp = inputs[id];
    if (!inp) continue;
    applyPhysics(p, inp, now);
    inp.jumpQueued = false;
    inp.pushQueued = false;
  }
  io.emit('state', publicState(now));
}, 1000 / TICK_RATE);

const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`플랫포머 서버: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});
