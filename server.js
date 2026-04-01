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
const GRAVITY = 2280;
const MOVE_ACCEL = 2800;
const MAX_SPEED = 400;
const AIR_CONTROL = 0.62;
const JUMP_VELOCITY = -910;
const JUMP_PAD_VELOCITY = -1080;
const SLIDE_SPEED_MULT = 1.42;
const FRICTION_GROUND = 0.88;
const AIR_FRICTION = 0.992;
const PUSH_FORCE = 540;
const PUSH_RANGE = 76;
const PUSH_COOLDOWN_MS = 1600;
const PUSH_ANIM_MS = 280;
const WATER_GRAVITY_MULT = 0.45;
const WATER_DRAG_X = 0.88;
const WATER_MAX_DOWN = 220;
const BUBBLE_MS = 5500;

const PLAYER_W = 34;
const PLAYER_H = 50;
const PLAYER_SLIDE_H = 24;

const SERVER_T0 = Date.now();

const STATIC_PLATFORMS = [
  { x: -200, y: 668, w: 9000, h: 400 },
  { x: 120, y: 560, w: 200, h: 20 },
  { x: 360, y: 500, w: 180, h: 20 },
  { x: 580, y: 440, w: 200, h: 20 },
  { x: 320, y: 380, w: 140, h: 20 },
  { x: 520, y: 320, w: 160, h: 20 },
  { x: 720, y: 260, w: 200, h: 20 },
  { x: 980, y: 200, w: 220, h: 20 },
  { x: 1280, y: 260, w: 160, h: 20 },
  { x: 1500, y: 340, w: 200, h: 20 },
  { x: 1760, y: 420, w: 180, h: 20 },
  { x: 2000, y: 500, w: 240, h: 20 },
  { x: 2300, y: 440, w: 160, h: 20 },
  { x: 2520, y: 360, w: 200, h: 20 },
  { x: 2780, y: 280, w: 180, h: 20 },
  { x: 3020, y: 360, w: 220, h: 20 },
  { x: 3300, y: 460, w: 200, h: 20 },
  { x: 3560, y: 540, w: 260, h: 20 },
  { x: 3880, y: 480, w: 180, h: 20 },
  { x: 4120, y: 400, w: 200, h: 20 },
  { x: 4380, y: 320, w: 240, h: 20 },
  { x: 4680, y: 400, w: 200, h: 20 },
  { x: 4940, y: 500, w: 300, h: 20 },
  { x: 5300, y: 440, w: 160, h: 20 },
  { x: 5520, y: 360, w: 180, h: 20 },
  { x: 5760, y: 280, w: 200, h: 20 },
  { x: 6020, y: 360, w: 220, h: 20 },
  { x: 6300, y: 460, w: 280, h: 20 },
  { x: 6640, y: 540, w: 200, h: 20 },
  { x: 6900, y: 460, w: 160, h: 20 },
  { x: 7120, y: 380, w: 200, h: 20 },
  { x: 7380, y: 300, w: 180, h: 20 },
  { x: 7620, y: 400, w: 240, h: 20 },
  { x: 7920, y: 500, w: 320, h: 20 },
  { x: 8300, y: 560, w: 400, h: 20 },
];

const MOVING_DEFS = [
  { baseX: 900, baseY: 520, w: 100, h: 18, amp: 100, omega: 0.0014, phase: 0 },
  { baseX: 2200, baseY: 400, w: 90, h: 18, amp: 80, omega: 0.002, phase: 1.2 },
  { baseX: 4500, baseY: 360, w: 110, h: 18, amp: 120, omega: 0.0011, phase: 0.5 },
  { baseX: 6200, baseY: 480, w: 100, h: 18, amp: 90, omega: 0.0018, phase: 2 },
  { baseX: 7500, baseY: 340, w: 95, h: 18, amp: 110, omega: 0.0013, phase: 0.8 },
];

const SPIKES = [
  { x: 800, y: 656, w: 80, h: 12 },
  { x: 2100, y: 656, w: 100, h: 12 },
  { x: 3400, y: 656, w: 120, h: 12 },
  { x: 5100, y: 656, w: 90, h: 12 },
  { x: 6800, y: 656, w: 110, h: 12 },
  { x: 2400, y: 428, w: 40, h: 12 },
  { x: 5000, y: 308, w: 50, h: 12 },
];

const WATER_ZONES = [
  { x: 1600, y: 620, w: 420, h: 60 },
  { x: 5600, y: 620, w: 380, h: 60 },
];

const JUMP_PADS = [
  { x: 1050, y: 648, w: 70, h: 20 },
  { x: 2900, y: 648, w: 70, h: 20 },
  { x: 4800, y: 648, w: 70, h: 20 },
  { x: 7200, y: 648, w: 70, h: 20 },
  { x: 1950, y: 488, w: 56, h: 16 },
  { x: 4200, y: 388, w: 56, h: 16 },
];

const CANNONS = [
  { x: 1350, y: 600, w: 44, h: 44, vx: 720, vy: -520 },
  { x: 3800, y: 580, w: 44, h: 44, vx: -680, vy: -480 },
  { x: 6100, y: 600, w: 44, h: 44, vx: 700, vy: -540 },
  { x: 7800, y: 560, w: 44, h: 44, vx: -660, vy: -500 },
];

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#AA96DA',
  '#FCBAD3', '#A8D8EA', '#FFAAA5', '#C7CEEA', '#B5EAD7',
];

const players = {};
const inputs = {};

function serverTime() {
  return Date.now();
}

function movingPlatRect(m, tMs) {
  const x = m.baseX + Math.sin(tMs * m.omega + m.phase) * m.amp;
  return { x, y: m.baseY, w: m.w, h: m.h };
}

function allSolidRects(tMs) {
  const list = STATIC_PLATFORMS.map((p) => ({ ...p }));
  for (const m of MOVING_DEFS) {
    list.push(movingPlatRect(m, tMs));
  }
  return list;
}

function createPlayer(socketId, nickname) {
  return {
    id: socketId,
    nickname: (nickname || '플레이어').slice(0, 16),
    x: 200 + Math.random() * 80,
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
    bubbleText: '',
    bubbleUntil: 0,
    pushAnimUntil: 0,
    lastCannonIdx: -1,
    cannonCooldownUntil: 0,
  };
}

function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function centerInWater(p) {
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  for (const wz of WATER_ZONES) {
    if (cx >= wz.x && cx <= wz.x + wz.w && cy >= wz.y && cy <= wz.y + wz.h) return true;
  }
  return false;
}

function resolveX(p, rects) {
  for (const plat of rects) {
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

function resolveY(p, rects) {
  let onGround = false;
  for (const plat of rects) {
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

function hitSpikes(p) {
  for (const s of SPIKES) {
    if (rectOverlap(p.x + 4, p.y + 4, p.w - 8, p.h - 8, s.x, s.y, s.w, s.h)) return true;
  }
  return false;
}

function respawn(p) {
  p.x = 200 + Math.random() * 100;
  p.y = 400;
  p.vx = 0;
  p.vy = 0;
}

function applyCannons(p, tMs) {
  if (tMs < p.cannonCooldownUntil) return;
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  for (let i = 0; i < CANNONS.length; i++) {
    const c = CANNONS[i];
    if (rectOverlap(p.x, p.y, p.w, p.h, c.x, c.y, c.w, c.h)) {
      p.vx = c.vx;
      p.vy = c.vy;
      p.cannonCooldownUntil = tMs + 900;
      p.lastCannonIdx = i;
      break;
    }
  }
}

function computeAnim(p, tMs) {
  if (tMs < p.pushAnimUntil) return 'push';
  if (!p.onGround) return 'jump';
  if (p.sliding) return 'slide';
  if (Math.abs(p.vx) > 40) return 'run';
  return 'idle';
}

function publicState(now) {
  const tMs = now;
  const moving = MOVING_DEFS.map((m) => movingPlatRect(m, tMs));
  return {
    serverTime: tMs,
    movingPlats: moving,
    players: Object.values(players).map((p) => ({
      id: p.id,
      nickname: p.nickname,
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      facing: p.facing,
      sliding: p.sliding,
      color: p.color,
      anim: computeAnim(p, tMs),
      w: p.w,
      h: p.h,
      pushCdLeft: Math.max(0, PUSH_COOLDOWN_MS - (tMs - p.lastPush)),
      cannonCooldownUntil: p.cannonCooldownUntil || 0,
      bubbleText: tMs < p.bubbleUntil ? p.bubbleText : '',
      bubbleUntil: p.bubbleUntil,
    })),
  };
}

function applyPhysics(p, inp, tMs) {
  const inWater = centerInWater(p);

  const slideWant = !!(inp.down && p.onGround);
  if (slideWant) {
    p.sliding = true;
    p.h = PLAYER_SLIDE_H;
  } else {
    p.sliding = false;
    p.h = PLAYER_H;
  }

  const g = inWater ? GRAVITY * WATER_GRAVITY_MULT : GRAVITY;
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

  if (inWater) {
    p.vx *= WATER_DRAG_X;
    if (p.vy > WATER_MAX_DOWN) p.vy = WATER_MAX_DOWN;
    p.vy -= 420 * DT;
  }

  if (Math.abs(p.vx) > maxSp) p.vx = Math.sign(p.vx) * maxSp;

  if (inp.jumpQueued && p.onGround && !p.sliding) {
    p.vy = JUMP_VELOCITY;
    p.onGround = false;
  }

  if (inp.pushQueued && tMs - p.lastPush >= PUSH_COOLDOWN_MS) {
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
    p.lastPush = tMs;
    p.pushAnimUntil = tMs + PUSH_ANIM_MS;
  }

  p.vy += g * DT;

  const solids = allSolidRects(tMs);

  p.x += p.vx * DT;
  resolveX(p, solids);
  p.y += p.vy * DT;
  p.onGround = resolveY(p, solids);

  if (p.onGround) {
    const fx = p.x + 4;
    const fy = p.y + p.h - 6;
    for (const pad of JUMP_PADS) {
      if (rectOverlap(fx, fy, p.w - 8, 10, pad.x, pad.y, pad.w, pad.h)) {
        p.vy = JUMP_PAD_VELOCITY;
        p.onGround = false;
        break;
      }
    }
  }

  applyCannons(p, tMs);

  if (hitSpikes(p)) respawn(p);

  p.x = Math.max(-80, Math.min(8800 - p.w, p.x));
  if (p.y > 1300) respawn(p);

  if (p.x < -40 || p.x > 8750) respawn(p);
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
      platforms: STATIC_PLATFORMS,
      movingDefs: MOVING_DEFS,
      spikes: SPIKES,
      water: WATER_ZONES,
      jumpPads: JUMP_PADS,
      cannons: CANNONS,
      tickRate: TICK_RATE,
      constants: {
        gravity: GRAVITY,
        moveAccel: MOVE_ACCEL,
        maxSpeed: MAX_SPEED,
        airControl: AIR_CONTROL,
        jumpVel: JUMP_VELOCITY,
        jumpPadVel: JUMP_PAD_VELOCITY,
        slideMult: SLIDE_SPEED_MULT,
        frictionGround: FRICTION_GROUND,
        airFriction: AIR_FRICTION,
        waterGravityMult: WATER_GRAVITY_MULT,
        waterDragX: WATER_DRAG_X,
        waterMaxDown: WATER_MAX_DOWN,
        playerW: PLAYER_W,
        playerH: PLAYER_H,
        playerSlideH: PLAYER_SLIDE_H,
      },
    });
    io.emit('state', publicState(serverTime()));
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
    const text = String(payload.text || '').slice(0, 120);
    const emoji = String(payload.emoji || '').slice(0, 8);
    const combined = [emoji, text].filter(Boolean).join(' ').trim();
    p.bubbleText = combined || '…';
    p.bubbleUntil = serverTime() + BUBBLE_MS;
    io.emit('chat', {
      id: socket.id,
      nickname: p.nickname,
      text,
      emoji,
      t: serverTime(),
    });
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    delete inputs[socket.id];
    io.emit('state', publicState(serverTime()));
  });
});

setInterval(() => {
  const tMs = serverTime();
  for (const id of Object.keys(players)) {
    const p = players[id];
    const inp = inputs[id];
    if (!inp) continue;
    applyPhysics(p, inp, tMs);
    inp.jumpQueued = false;
    inp.pushQueued = false;
  }
  io.emit('state', publicState(tMs));
}, 1000 / TICK_RATE);

const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`플랫포머 서버: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});
