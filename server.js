const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { getLevel, clientLevelPayload, MODE_ORDER, MODES_UI } = require('./levels');

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

let currentLevel = getLevel('classic');
let playerVotes = {};
let pendingMode = null;
let modeSwitchAt = 0;
let taggerId = null;
let raceCooldownUntil = 0;
let tickCounter = 0;

const players = {};
const inputs = {};

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#AA96DA',
  '#FCBAD3', '#A8D8EA', '#FFAAA5', '#C7CEEA', '#B5EAD7',
];

function serverTime() {
  return Date.now();
}

function movingPlatRect(m, tMs) {
  const x = m.baseX + Math.sin(tMs * m.omega + m.phase) * m.amp;
  return { x, y: m.baseY, w: m.w, h: m.h };
}

function allSolidRects(tMs) {
  const list = currentLevel.staticPlatforms.map((p) => ({ ...p }));
  for (const m of currentLevel.movingDefs) {
    list.push(movingPlatRect(m, tMs));
  }
  return list;
}

function spawnPlayer(p) {
  const sp = currentLevel.spawn;
  p.x = sp.x + Math.random() * sp.w;
  p.y = sp.y;
  p.vx = 0;
  p.vy = 0;
  p.h = PLAYER_H;
  p.sliding = false;
}

function loadMode(modeId) {
  currentLevel = getLevel(modeId);
  playerVotes = {};
  pendingMode = null;
  modeSwitchAt = 0;
  raceCooldownUntil = 0;
  const ids = Object.keys(players);
  if (currentLevel.id === 'tag' && ids.length > 0) {
    taggerId = ids[Math.floor(Math.random() * ids.length)];
  } else {
    taggerId = null;
  }
  for (const p of Object.values(players)) spawnPlayer(p);
  io.emit('level', clientLevelPayload(currentLevel));
}

function scheduleModeSwitch(modeId, tMs) {
  if (!MODE_ORDER.includes(modeId) || modeId === currentLevel.id || pendingMode) return;
  pendingMode = modeId;
  modeSwitchAt = tMs + 4000;
}

function checkVoteMajority(tMs) {
  const ids = Object.keys(players);
  const n = ids.length;
  if (n === 0 || pendingMode) return;
  const counts = {};
  for (const pid of ids) {
    const v = playerVotes[pid];
    if (v && MODE_ORDER.includes(v)) counts[v] = (counts[v] || 0) + 1;
  }
  let best = null;
  let bc = 0;
  for (const [k, v] of Object.entries(counts)) {
    if (v > bc) {
      bc = v;
      best = k;
    }
  }
  if (!best) return;
  const need = n === 1 ? 1 : Math.floor(n / 2) + 1;
  if (bc >= need) scheduleModeSwitch(best, tMs);
}

function looseOverlap(a, b, shrink) {
  const sa = a.w * shrink;
  const sb = b.w * shrink;
  const ax = a.x + (a.w - sa) / 2;
  const ay = a.y + (a.h - a.h * shrink) / 2;
  const ah = a.h * shrink;
  const bx = b.x + (b.w - sb) / 2;
  const by = b.y + (b.h - b.h * shrink) / 2;
  const bh = b.h * shrink;
  return ax < bx + sb && ax + sa > bx && ay < by + bh && ay + ah > by;
}

function processTagMode() {
  if (currentLevel.id !== 'tag' || !taggerId || !players[taggerId]) return;
  const t = players[taggerId];
  for (const pid of Object.keys(players)) {
    if (pid === taggerId) continue;
    const o = players[pid];
    if (looseOverlap(t, o, 0.72)) {
      taggerId = pid;
      break;
    }
  }
}

function processRaceMode(tMs) {
  const fx = currentLevel.finishX;
  if (currentLevel.id !== 'race' || !fx || tMs < raceCooldownUntil) return;
  for (const p of Object.values(players)) {
    if (p.x + p.w >= fx) {
      io.emit('toast', { message: `${p.nickname} 결승!` });
      raceCooldownUntil = tMs + 3500;
      for (const pl of Object.values(players)) spawnPlayer(pl);
      break;
    }
  }
}

function createPlayer(socketId, nickname) {
  const p = {
    id: socketId,
    nickname: (nickname || '플레이어').slice(0, 16),
    x: 200,
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
  spawnPlayer(p);
  return p;
}

function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function centerInWater(p) {
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  for (const wz of currentLevel.water) {
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
  for (const s of currentLevel.spikes) {
    if (rectOverlap(p.x + 4, p.y + 4, p.w - 8, p.h - 8, s.x, s.y, s.w, s.h)) return true;
  }
  return false;
}

function respawn(p) {
  spawnPlayer(p);
}

function applyCannons(p, tMs) {
  if (tMs < p.cannonCooldownUntil) return;
  for (let i = 0; i < currentLevel.cannons.length; i++) {
    const c = currentLevel.cannons[i];
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
  const moving = currentLevel.movingDefs.map((m) => movingPlatRect(m, tMs));
  return {
    serverTime: tMs,
    mode: currentLevel.id,
    modeLabel: currentLevel.label,
    pendingMode: pendingMode || '',
    modeSwitchAt: pendingMode ? modeSwitchAt : 0,
    taggerId: currentLevel.id === 'tag' ? taggerId || '' : '',
    finishX: currentLevel.finishX || 0,
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
      isIt: currentLevel.id === 'tag' && p.id === taggerId,
    })),
  };
}

function applyPhysics(p, inp, tMs) {
  const inWater = centerInWater(p);
  const wasSliding = p.sliding;
  const slideWant = !!(inp.down && p.onGround);

  if (slideWant && p.onGround) {
    if (!wasSliding) {
      const feetY = p.y + p.h;
      p.h = PLAYER_SLIDE_H;
      p.y = feetY - p.h;
    }
    p.sliding = true;
  } else {
    if (wasSliding) {
      const feetY = p.y + p.h;
      p.h = PLAYER_H;
      p.y = feetY - p.h;
    }
    p.sliding = false;
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
    for (const pad of currentLevel.jumpPads) {
      if (rectOverlap(fx, fy, p.w - 8, 10, pad.x, pad.y, pad.w, pad.h)) {
        p.vy = JUMP_PAD_VELOCITY;
        p.onGround = false;
        break;
      }
    }
  }

  applyCannons(p, tMs);

  if (hitSpikes(p)) respawn(p);

  const w = currentLevel.world;
  p.x = Math.max(w.minX, Math.min(w.maxX - p.w, p.x));
  if (p.y > w.fallY) respawn(p);
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
    if (currentLevel.id === 'tag' && !taggerId) {
      taggerId = socket.id;
    }
    socket.emit('init', {
      id: socket.id,
      ...clientLevelPayload(currentLevel),
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
      modes: MODES_UI,
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

  socket.on('voteMode', ({ modeId }) => {
    if (!players[socket.id] || !MODE_ORDER.includes(modeId)) return;
    playerVotes[socket.id] = modeId;
    checkVoteMajority(serverTime());
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
    delete playerVotes[socket.id];
    if (taggerId === socket.id) {
      const ids = Object.keys(players);
      taggerId = ids.length ? ids[Math.floor(Math.random() * ids.length)] : null;
    }
    io.emit('state', publicState(serverTime()));
  });
});

setInterval(() => {
  const tMs = serverTime();
  if (pendingMode && tMs >= modeSwitchAt) {
    loadMode(pendingMode);
    pendingMode = null;
    modeSwitchAt = 0;
  }

  for (const id of Object.keys(players)) {
    const p = players[id];
    const inp = inputs[id];
    if (!inp) continue;
    applyPhysics(p, inp, tMs);
    inp.jumpQueued = false;
    inp.pushQueued = false;
  }

  processTagMode();
  processRaceMode(tMs);

  tickCounter += 1;
  if (tickCounter >= TICK_RATE) {
    tickCounter = 0;
    checkVoteMajority(tMs);
  }

  io.emit('state', publicState(tMs));
}, 1000 / TICK_RATE);

const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`플랫포머 서버: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});
