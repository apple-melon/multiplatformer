(function () {
  'use strict';

  const STORAGE_KEY = 'mp_platformer_nick';
  const CANVAS_W = 1280;
  const CANVAS_H = 720;
  const CAMERA_SMOOTH = 0.48;
  const REMOTE_LERP = 0.42;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const nickModal = document.getElementById('overlay-nickname');
  const nickInput = document.getElementById('nickname-input');
  const btnEnter = document.getElementById('btn-enter');
  const hudNick = document.getElementById('hud-nick');
  const hudPush = document.getElementById('hud-push');
  const chatLog = document.getElementById('chat-log');
  const chatInput = document.getElementById('chat-input');
  const btnSend = document.getElementById('btn-send');
  const emojiBar = document.getElementById('emoji-bar');
  const layers = {
    far: document.querySelector('.layer-far'),
    mid: document.querySelector('.layer-mid'),
    near: document.querySelector('.layer-near'),
  };

  const EMOJIS = ['😀', '😎', '🔥', '👍', '❤️', '🎮', '✨', '🚀', '💀', '🙌'];

  let socket = null;
  let myId = null;
  let C = null;
  let staticPlats = [];
  let movingDefs = [];
  let spikes = [];
  let waterZones = [];
  let jumpPads = [];
  let cannons = [];
  let worldBounds = { minX: -80, maxX: 8800, fallY: 1300 };
  let finishX = 0;
  let displayPlayers = new Map();
  let myVoteMode = '';
  let localPred = null;
  let timeSkew = 0;
  let camera = { x: 0, y: 0 };
  let keys = { left: false, right: false, down: false, jump: false, push: false, dash: false };
  let lastJump = false;
  let lastPush = false;
  let lastDash = false;
  let predJump = false;
  let predPush = false;
  let predDash = false;
  let amSpectator = false;
  let sessionPhaseRef = 'playing';
  const particles = [];
  let voteModesRef = [];

  const minigameBarEl = document.getElementById('minigame-bar');
  const modeStatusEl = document.getElementById('mode-status');
  const toastEl = document.getElementById('game-toast');
  const spectateBannerEl = document.getElementById('spectate-banner');

  function estServerTime() {
    return Date.now() + timeSkew;
  }

  function applyLevelPack(data) {
    if (!data) return;
    if (data.platforms) staticPlats = data.platforms;
    if (data.movingDefs) movingDefs = data.movingDefs;
    if (data.spikes) spikes = data.spikes;
    if (data.water) waterZones = data.water;
    if (data.jumpPads) jumpPads = data.jumpPads;
    if (data.cannons) cannons = data.cannons;
    if (data.world) worldBounds = { ...data.world };
    finishX = data.finishX || 0;
  }

  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => toastEl.classList.remove('show'), 3200);
  }

  function updateSessionUI(pack) {
    sessionPhaseRef = pack.sessionPhase || 'playing';
    const lobby = sessionPhaseRef === 'lobby';
    if (minigameBarEl) minigameBarEl.classList.toggle('lobby-visible', lobby);
    if (spectateBannerEl) spectateBannerEl.classList.toggle('visible', amSpectator);
    if (!modeStatusEl) return;
    if (lobby && pack.lobbyEndsAt) {
      const left = Math.max(0, pack.lobbyEndsAt - (Date.now() + timeSkew));
      const sec = Math.ceil(left / 1000);
      modeStatusEl.textContent = `로비 — ${sec}초 후 다음 미니게임 (투표 반영)`;
    } else if (pack.roundEndsAt && sessionPhaseRef === 'playing') {
      const left = Math.max(0, pack.roundEndsAt - (Date.now() + timeSkew));
      const sec = Math.ceil(left / 1000);
      modeStatusEl.textContent = `${pack.modeLabel || ''} · ${sec}초 후 라운드 종료`;
    } else {
      modeStatusEl.textContent = pack.modeLabel ? `모드: ${pack.modeLabel}` : '';
    }
  }

  function buildVoteBar(modes) {
    voteModesRef = modes || [];
    if (!minigameBarEl || !modes) return;
    minigameBarEl.innerHTML = '';
    modes.forEach((m, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `${i + 1}. ${m.label}`;
      b.dataset.mode = m.id;
      b.addEventListener('click', () => {
        if (!socket || !myId || sessionPhaseRef !== 'lobby') return;
        myVoteMode = m.id;
        socket.emit('voteMode', { modeId: m.id });
        minigameBarEl.querySelectorAll('button').forEach((btn) => {
          btn.classList.toggle('voted', btn.dataset.mode === myVoteMode);
        });
      });
      minigameBarEl.appendChild(b);
    });
  }

  function movingPlatRect(m, tMs) {
    return {
      x: m.baseX + Math.sin(tMs * m.omega + m.phase) * m.amp,
      y: m.baseY,
      w: m.w,
      h: m.h,
    };
  }

  function solidRects(tMs) {
    const list = staticPlats.map((p) => ({ ...p }));
    for (const m of movingDefs) list.push(movingPlatRect(m, tMs));
    return list;
  }

  function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function centerInWater(p) {
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    for (const wz of waterZones) {
      if (cx >= wz.x && cx <= wz.x + wz.w && cy >= wz.y && cy <= wz.y + wz.h) return true;
    }
    return false;
  }

  function resolveXPlayer(p, rects) {
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

  function resolveYPlayer(p, rects) {
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

  function applyCannonsPred(p, tMs) {
    if (tMs < p.cannonCooldownUntil) return;
    for (let i = 0; i < cannons.length; i++) {
      const c = cannons[i];
      if (rectOverlap(p.x, p.y, p.w, p.h, c.x, c.y, c.w, c.h)) {
        p.vx = c.vx;
        p.vy = c.vy;
        p.cannonCooldownUntil = tMs + 900;
        break;
      }
    }
  }

  function simulateLocalPred(inp, dt, tMs) {
    if (!localPred || !C || amSpectator) return;
    const p = localPred;
    const coyoteMs = C.coyoteMs != null ? C.coyoteMs : 120;
    const coyoteJump =
      p.onGround ||
      (p.lastGroundedAt > 0 && tMs - p.lastGroundedAt < coyoteMs);

    const wasSliding = p.sliding;
    const slideWant = !!(inp.down && (p.onGround || wasSliding));

    if (slideWant) {
      if (!wasSliding && p.onGround) {
        const feetY = p.y + p.h;
        p.h = C.playerSlideH;
        p.y = feetY - p.h;
      }
      p.sliding = true;
      p.h = C.playerSlideH;
    } else {
      if (wasSliding) {
        const feetY = p.y + p.h;
        p.h = C.playerH;
        p.y = feetY - p.h;
      }
      p.sliding = false;
    }

    const inWater = centerInWater(p);
    const g = inWater ? C.gravity * C.waterGravityMult : C.gravity;
    const accel = p.onGround ? C.moveAccel : C.moveAccel * C.airControl;
    const maxSp = p.sliding ? C.maxSpeed * C.slideMult : C.maxSpeed;

    if (inp.left && !inp.right) {
      p.vx -= accel * dt;
      p.facing = -1;
    } else if (inp.right && !inp.left) {
      p.vx += accel * dt;
      p.facing = 1;
    } else if (p.onGround) {
      p.vx *= Math.pow(C.frictionGround, dt * 60);
    } else {
      p.vx *= Math.pow(C.airFriction, dt * 60);
    }

    if (inWater) {
      p.vx *= Math.pow(C.waterDragX, dt * 60);
      if (p.vy > C.waterMaxDown) p.vy = C.waterMaxDown;
      p.vy -= 420 * dt;
    }

    if (Math.abs(p.vx) > maxSp) p.vx = Math.sign(p.vx) * maxSp;

    const dashCd = C.dashCdMs != null ? C.dashCdMs : 1100;
    const dashImp = C.dashImpulse != null ? C.dashImpulse : 540;
    if (inp.dashQueued && tMs - p.lastDash >= dashCd) {
      p.vx += p.facing * dashImp;
      const cap = maxSp * 1.35;
      if (Math.abs(p.vx) > cap) p.vx = Math.sign(p.vx) * cap;
      p.lastDash = tMs;
    }

    if (inp.jumpQueued && coyoteJump && !p.sliding) {
      p.vy = C.jumpVel;
      p.onGround = false;
      p.lastGroundedAt = -1e12;
    }

    p.vy += g * dt;

    const solids = solidRects(tMs);

    p.x += p.vx * dt;
    resolveXPlayer(p, solids);
    p.y += p.vy * dt;
    p.onGround = resolveYPlayer(p, solids);

    if (p.onGround) {
      p.lastGroundedAt = tMs;
      const fx = p.x + 4;
      const fy = p.y + p.h - 6;
      for (const pad of jumpPads) {
        if (rectOverlap(fx, fy, p.w - 8, 10, pad.x, pad.y, pad.w, pad.h)) {
          p.vy = C.jumpPadVel;
          p.onGround = false;
          break;
        }
      }
    }

    applyCannonsPred(p, tMs);

    const w = worldBounds;
    p.x = Math.max(w.minX, Math.min(w.maxX - p.w, p.x));
    if (p.y > w.fallY) {
      p.x = w.minX + 80;
      p.y = 400;
      p.vx = 0;
      p.vy = 0;
    }
  }

  function loadNick() {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch {
      return '';
    }
  }

  function saveNick(n) {
    try {
      localStorage.setItem(STORAGE_KEY, n);
    } catch (_) {}
  }

  nickInput.value = loadNick();
  document.body.classList.add('modal-open');

  if (hudPush) hudPush.style.display = 'none';

  EMOJIS.forEach((e) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = e;
    b.addEventListener('click', () => sendChat('', e));
    emojiBar.appendChild(b);
  });

  function addParticle(x, y, opts) {
    const n = opts.count || 8;
    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const sp = (opts.speed || 120) * (0.5 + Math.random());
      particles.push({
        x,
        y,
        vx: Math.cos(ang) * sp + (opts.vx || 0),
        vy: Math.sin(ang) * sp * 0.6 + (opts.vy || 0),
        life: opts.life || 0.45,
        maxLife: opts.life || 0.45,
        r: opts.r || 3 + Math.random() * 3,
        color: opts.color || 'rgba(200,220,255,0.9)',
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 400 * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles(camX, camY) {
    for (const p of particles) {
      const a = p.life / p.maxLife;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x - camX, p.y - camY, p.r * (0.5 + a * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function mergePlayers(list) {
    const byId = new Map(list.map((p) => [p.id, p]));
    for (const p of list) {
      if (!displayPlayers.has(p.id)) {
        displayPlayers.set(p.id, {
          ...p,
          dx: p.x,
          dy: p.y,
          prevAnim: p.anim,
          prevOnGround: p.anim !== 'jump',
        });
        if (p.id === myId) {
          amSpectator = !!p.spectator;
          if (p.spectator) {
            localPred = null;
          } else {
            localPred = {
              x: p.x,
              y: p.y,
              vx: p.vx,
              vy: p.vy,
              facing: p.facing,
              onGround: p.onGround,
              sliding: !!p.sliding,
              h: p.h,
              w: p.w,
              cannonCooldownUntil: 0,
              lastGroundedAt: p.onGround ? estServerTime() : -1e12,
              lastDash: -1e12,
            };
          }
        }
      } else {
        const d = displayPlayers.get(p.id);
        const wasGround = d.prevOnGround;
        const nowGround = p.anim !== 'jump';
        if (p.id === myId) {
          amSpectator = !!p.spectator;
          if (p.spectator) {
            localPred = null;
          } else if (localPred) {
            const ex = p.x - localPred.x;
            const ey = p.y - localPred.y;
            const err = Math.hypot(ex, ey);
            if (err > 100) {
              localPred.x = p.x;
              localPred.y = p.y;
              localPred.vx = p.vx;
              localPred.vy = p.vy;
              localPred.onGround = p.onGround;
              localPred.sliding = !!p.sliding;
              localPred.h = p.h;
              localPred.w = p.w;
            } else if (err > 3) {
              const blend = err > 35 ? 0.42 : 0.32;
              localPred.x += ex * blend;
              localPred.y += ey * blend;
              localPred.vx = p.vx * 0.22 + localPred.vx * 0.78;
              localPred.vy = p.vy * 0.22 + localPred.vy * 0.78;
            }
          } else {
            localPred = {
              x: p.x,
              y: p.y,
              vx: p.vx,
              vy: p.vy,
              facing: p.facing,
              onGround: p.onGround,
              sliding: !!p.sliding,
              h: p.h,
              w: p.w,
              cannonCooldownUntil: p.cannonCooldownUntil || 0,
              lastGroundedAt: p.onGround ? estServerTime() : -1e12,
              lastDash: -1e12,
            };
          }
        } else if (p.id !== myId) {
          if (nowGround && !wasGround) {
            addParticle(p.x + p.w * 0.5, p.y + p.h, {
              count: 8,
              speed: 160,
              vy: -70,
              color: 'rgba(180,200,230,0.75)',
            });
          }
        }
        if (p.sliding && p.id === myId && localPred && Math.abs(localPred.vx) > 100) {
          if (Math.random() < 0.35) {
            addParticle(
              localPred.x + (localPred.facing > 0 ? 0 : localPred.w),
              localPred.y + localPred.h - 4,
              {
                count: 2,
                speed: 60,
                vx: -localPred.facing * 40,
                life: 0.25,
                color: 'rgba(200,210,240,0.5)',
              }
            );
          }
        }
        d.prevAnim = p.anim;
        d.prevOnGround = nowGround;
        Object.assign(d, p, { dx: d.dx, dy: d.dy });
        if (p.id === myId && localPred && p.cannonCooldownUntil != null) {
          localPred.cannonCooldownUntil = Math.max(
            localPred.cannonCooldownUntil || 0,
            p.cannonCooldownUntil
          );
        }
      }
    }
    for (const id of displayPlayers.keys()) {
      if (!byId.has(id)) {
        displayPlayers.delete(id);
        if (id === myId) localPred = null;
      }
    }
  }

  function smoothRemotes(dt) {
    for (const [id, d] of displayPlayers) {
      if (id === myId || d.spectator) continue;
      const k = REMOTE_LERP;
      d.dx += (d.x - d.dx) * Math.min(1, k * (dt * 60));
      d.dy += (d.y - d.dy) * Math.min(1, k * (dt * 60));
    }
  }

  function updateParallax(camX) {
    const cx = camX * 0.02;
    layers.far.style.transform = `translate3d(${-cx * 0.15}px, 0, 0)`;
    layers.mid.style.transform = `translate3d(${-cx * 0.45}px, 0, 0)`;
    layers.near.style.transform = `translate3d(${-cx * 0.75}px, 0, 0)`;
  }

  function drawRoundedRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawSpeechBubble(text, ox, oy, dw) {
    if (!text) return;
    ctx.save();
    ctx.font = '600 13px Outfit, sans-serif';
    const pad = 8;
    const maxW = 200;
    const lines = [];
    let cur = '';
    for (const ch of text) {
      const test = cur + ch;
      if (ctx.measureText(test).width > maxW && cur) {
        lines.push(cur);
        cur = ch;
      } else cur = test;
    }
    if (cur) lines.push(cur);
    let tw = 0;
    for (const ln of lines) tw = Math.max(tw, ctx.measureText(ln).width);
    const bw = tw + pad * 2;
    const bh = lines.length * 16 + pad * 2;
    const bx = ox + dw / 2 - bw / 2;
    const by = oy - bh - 14;
    ctx.fillStyle = 'rgba(20,25,35,0.92)';
    drawRoundedRect(bx, by, bw, bh, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,180,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#e6edf3';
    ctx.textAlign = 'center';
    lines.forEach((ln, i) => {
      ctx.fillText(ln, bx + bw / 2, by + pad + 13 + i * 16);
    });
    ctx.beginPath();
    ctx.moveTo(ox + dw / 2 - 6, by + bh);
    ctx.lineTo(ox + dw / 2 + 6, by + bh);
    ctx.lineTo(ox + dw / 2, by + bh + 8);
    ctx.closePath();
    ctx.fillStyle = 'rgba(20,25,35,0.92)';
    ctx.fill();
    ctx.restore();
    ctx.textAlign = 'left';
  }

  function getDrawAnim(d, isSelfView) {
    if (d.anim === 'push') return 'push';
    if (isSelfView && localPred) {
      if (localPred.sliding) return 'slide';
      if (!localPred.onGround) return 'jump';
      if (Math.abs(localPred.vx) > 40) return 'run';
      return 'idle';
    }
    return d.anim;
  }

  function drawPushCooldownGauge(d, ox, oy, dw, isSelfView) {
    if (!isSelfView || d.pushCdLeft == null || d.pushCdLeft <= 0) return;
    const maxCd = 1600;
    const t = Math.min(1, d.pushCdLeft / maxCd);
    const gw = 44;
    const gh = 5;
    const gx = ox + dw / 2 - gw / 2;
    const gy = oy - 20;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    drawRoundedRect(gx - 1, gy - 1, gw + 2, gh + 2, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(80,120,200,0.5)';
    ctx.fillRect(gx, gy, gw, gh);
    ctx.fillStyle = 'rgba(120,200,255,0.95)';
    ctx.fillRect(gx, gy, gw * (1 - t), gh);
  }

  function drawPlayer(d, camX, camY, isSelfView) {
    if (d.spectator) return;
    const px = isSelfView && localPred ? localPred.x : d.dx;
    const py = isSelfView && localPred ? localPred.y : d.dy;
    const x = px - camX;
    const y = py - camY;
    const w = isSelfView && localPred ? localPred.w : d.w;
    const h = isSelfView && localPred ? localPred.h : d.h;
    const facing = isSelfView && localPred ? localPred.facing : d.facing;
    const anim = getDrawAnim(d, isSelfView);
    let sx = 1;
    let sy = 1;
    if (anim === 'push') {
      sx = 1.18;
      sy = 0.92;
    } else if (anim === 'jump') {
      sy = 1.08;
      sx = 0.92;
    } else if (anim === 'slide') {
      sy = 0.65;
      sx = 1.12;
    } else if (anim === 'run') {
      const bob = Math.sin(performance.now() / 60) * 0.04;
      sy = 1 + bob;
    } else {
      const breathe = Math.sin(performance.now() / 400) * 0.02;
      sy = 1 + breathe;
    }
    const dw = w * sx;
    const dh = h * sy;
    const ox = x + (w - dw) / 2;
    const oy = y + (h - dh);

    if (d.isIt) {
      ctx.strokeStyle = 'rgba(255, 140, 60, 0.95)';
      ctx.lineWidth = 4;
      drawRoundedRect(ox - 4, oy - 4, dw + 8, dh + 8, 12);
      ctx.stroke();
    }

    if (anim === 'push') {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,200,120,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      const hx = ox + (facing > 0 ? dw : 0);
      const hy = oy + dh * 0.45;
      ctx.moveTo(ox + dw / 2, oy + dh * 0.35);
      ctx.lineTo(hx + facing * 22, hy);
      ctx.stroke();
      ctx.restore();
    }

    const grd = ctx.createLinearGradient(ox, oy, ox + dw, oy + dh);
    grd.addColorStop(0, d.color);
    grd.addColorStop(1, shadeColor(d.color, -25));
    ctx.fillStyle = grd;
    drawRoundedRect(ox, oy, dw, dh, Math.min(10, dh * 0.25));
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const eyeX = ox + (facing > 0 ? dw * 0.58 : dw * 0.22);
    const eyeY = oy + dh * 0.32;
    ctx.fillStyle = 'rgba(15,20,30,0.9)';
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, Math.max(2, dw * 0.08), 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eyeX + facing * dw * 0.14, eyeY + 1, Math.max(1.5, dw * 0.05), 0, Math.PI * 2);
    ctx.fill();

    drawPushCooldownGauge(d, ox, oy, dw, isSelfView);

    ctx.font = '600 11px Outfit, sans-serif';
    ctx.fillStyle = isSelfView ? 'rgba(255,255,255,0.95)' : 'rgba(230,235,245,0.88)';
    ctx.textAlign = 'center';
    ctx.fillText(d.nickname, ox + dw / 2, oy - 8);
    ctx.textAlign = 'left';

    if (d.bubbleText) {
      drawSpeechBubble(d.bubbleText, ox, oy, dw);
    }
  }

  function shadeColor(hex, percent) {
    const n = hex.replace('#', '');
    const num = parseInt(n, 16);
    let r = (num >> 16) + percent;
    let g = ((num >> 8) & 0xff) + percent;
    let b = (num & 0xff) + percent;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }

  function drawSpikes(camX, camY) {
    for (const s of spikes) {
      const px = s.x - camX;
      const py = s.y - camY;
      if (px + s.w < 0 || px > CANVAS_W) continue;
      const n = Math.max(3, Math.floor(s.w / 10));
      ctx.fillStyle = '#c94c4c';
      ctx.strokeStyle = '#8b2222';
      ctx.lineWidth = 1;
      for (let i = 0; i < n; i++) {
        const tx = px + (i / n) * s.w;
        const tw = s.w / n + 1;
        ctx.beginPath();
        ctx.moveTo(tx, py + s.h);
        ctx.lineTo(tx + tw / 2, py);
        ctx.lineTo(tx + tw, py + s.h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  function drawWater(camX, camY) {
    for (const wz of waterZones) {
      const px = wz.x - camX;
      const py = wz.y - camY;
      if (px + wz.w < 0 || px > CANVAS_W) continue;
      ctx.fillStyle = 'rgba(60,140,220,0.45)';
      ctx.fillRect(px, py, wz.w, wz.h);
      ctx.strokeStyle = 'rgba(100,180,255,0.4)';
      ctx.strokeRect(px + 0.5, py + 0.5, wz.w - 1, wz.h - 1);
    }
  }

  function drawJumpPads(camX, camY) {
    for (const pad of jumpPads) {
      const px = pad.x - camX;
      const py = pad.y - camY;
      if (px + pad.w < 0 || px > CANVAS_W) continue;
      const g = ctx.createLinearGradient(px, py, px, py + pad.h);
      g.addColorStop(0, '#6ecf8b');
      g.addColorStop(1, '#2d8a4e');
      ctx.fillStyle = g;
      drawRoundedRect(px, py, pad.w, pad.h, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.stroke();
    }
  }

  function drawCannons(camX, camY) {
    for (const c of cannons) {
      const px = c.x - camX;
      const py = c.y - camY;
      if (px + c.w < 0 || px > CANVAS_W) continue;
      ctx.fillStyle = '#4a4a52';
      drawRoundedRect(px, py, c.w, c.h, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,200,220,0.4)';
      ctx.stroke();
      ctx.fillStyle = '#2a2a30';
      ctx.beginPath();
      ctx.arc(px + c.w / 2, py + c.h / 2, c.w * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawWorld(camX, camY, tMs) {
    ctx.save();
    const grd = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    grd.addColorStop(0, '#1a2332');
    grd.addColorStop(1, '#0f1419');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    for (const plat of staticPlats) {
      const px = plat.x - camX;
      const py = plat.y - camY;
      if (px + plat.w < 0 || px > CANVAS_W || py + plat.h < 0 || py > CANVAS_H) continue;
      const pg = ctx.createLinearGradient(px, py, px, py + plat.h);
      pg.addColorStop(0, '#3d4f66');
      pg.addColorStop(1, '#252f3d');
      ctx.fillStyle = pg;
      drawRoundedRect(px, py, plat.w, plat.h, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(100,140,200,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      ctx.moveTo(px + 8, py + 4);
      ctx.lineTo(px + plat.w - 8, py + 4);
      ctx.stroke();
    }

    for (const m of movingDefs) {
      const r = movingPlatRect(m, tMs);
      const px = r.x - camX;
      const py = r.y - camY;
      if (px + r.w < 0 || px > CANVAS_W) continue;
      const pg = ctx.createLinearGradient(px, py, px, py + r.h);
      pg.addColorStop(0, '#5a6d8a');
      pg.addColorStop(1, '#3a4a62');
      ctx.fillStyle = pg;
      drawRoundedRect(px, py, r.w, r.h, 5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(180,200,255,0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    drawWater(camX, camY);
    drawJumpPads(camX, camY);
    drawCannons(camX, camY);
    drawSpikes(camX, camY);

    if (finishX > 0) {
      const fx = finishX - camX;
      if (fx > -20 && fx < CANVAS_W + 20) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 220, 100, 0.9)';
        ctx.lineWidth = 4;
        ctx.setLineDash([14, 10]);
        ctx.beginPath();
        ctx.moveTo(fx, 0);
        ctx.lineTo(fx, CANVAS_H);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255, 220, 100, 0.35)';
        ctx.fillRect(fx - 3, 0, 6, CANVAS_H);
        ctx.restore();
      }
    }

    const sorted = [...displayPlayers.values()]
      .filter((pl) => !pl.spectator)
      .sort((a, b) => {
        const ay = a.id === myId && localPred ? localPred.y : a.dy;
        const by = b.id === myId && localPred ? localPred.y : b.dy;
        return ay - by;
      });
    for (const d of sorted) {
      drawPlayer(d, camX, camY, d.id === myId);
    }

    drawParticles(camX, camY);
    ctx.restore();
  }

  let lastTs = performance.now();
  function frame(ts) {
    const dt = Math.min(0.055, (ts - lastTs) / 1000);
    lastTs = ts;

    const tMs = estServerTime();
    const jumpEdge = keys.jump && !predJump;
    const pushEdge = keys.push && !predPush;
    const dashEdge = keys.dash && !predDash;
    predJump = keys.jump;
    predPush = keys.push;
    predDash = keys.dash;

    if (localPred && C && !amSpectator) {
      simulateLocalPred(
        {
          left: keys.left,
          right: keys.right,
          down: keys.down,
          jumpQueued: jumpEdge,
          pushQueued: false,
          dashQueued: dashEdge,
        },
        dt,
        tMs
      );
    }

    smoothRemotes(dt);
    updateParticles(dt);

    const me = displayPlayers.get(myId);
    const actives = [...displayPlayers.values()].filter((pl) => !pl.spectator);
    const px = localPred ? localPred.x + localPred.w / 2 : me ? me.dx + me.w / 2 : 0;
    const py = localPred ? localPred.y + localPred.h / 2 : me ? me.dy + me.h / 2 : 0;

    if (amSpectator && actives.length > 0) {
      let sx = 0;
      let sy = 0;
      for (const pl of actives) {
        sx += pl.dx + pl.w / 2;
        sy += pl.dy + pl.h / 2;
      }
      sx /= actives.length;
      sy /= actives.length;
      const targetCamX = sx - CANVAS_W / 2;
      const targetCamY = sy - CANVAS_H * 0.52;
      camera.x += (targetCamX - camera.x) * CAMERA_SMOOTH;
      camera.y += (targetCamY - camera.y) * CAMERA_SMOOTH;
      camera.y = Math.min(260, Math.max(-140, camera.y));
      const wx = worldBounds;
      camera.x = Math.max(wx.minX - 100, Math.min(wx.maxX - CANVAS_W + 100, camera.x));
    } else if (me && localPred && !amSpectator) {
      const targetCamX = px - CANVAS_W / 2;
      const targetCamY = py - CANVAS_H * 0.52;
      camera.x += (targetCamX - camera.x) * CAMERA_SMOOTH;
      camera.y += (targetCamY - camera.y) * CAMERA_SMOOTH;
      camera.y = Math.min(220, Math.max(-120, camera.y));
      const wx = worldBounds;
      camera.x = Math.max(
        wx.minX - 100,
        Math.min(wx.maxX - CANVAS_W + 100, camera.x)
      );
    } else if (me && !amSpectator) {
      const targetCamX = me.dx + me.w / 2 - CANVAS_W / 2;
      const targetCamY = me.dy + me.h / 2 - CANVAS_H * 0.52;
      camera.x += (targetCamX - camera.x) * CAMERA_SMOOTH;
      camera.y += (targetCamY - camera.y) * CAMERA_SMOOTH;
    }

    updateParallax(camera.x);
    drawWorld(camera.x, camera.y, tMs);

    requestAnimationFrame(frame);
  }

  function connectGame(nickname) {
    if (typeof io !== 'function') {
      window.alert(
        'Socket.IO를 불러오지 못했습니다. 페이지를 새로고침하거나 서버 주소를 확인하세요.'
      );
      return;
    }
    saveNick(nickname);
    hudNick.textContent = `닉네임: ${nickname}`;
    nickModal.classList.add('hidden');
    document.body.classList.remove('modal-open');

    try {
      socket = io();
    } catch (err) {
      nickModal.classList.remove('hidden');
      document.body.classList.add('modal-open');
      window.alert('연결에 실패했습니다. 잠시 후 다시 시도하세요.');
      return;
    }
    socket.on('init', (data) => {
      myId = data.id;
      amSpectator = !!data.spectator;
      applyLevelPack(data);
      C = data.constants || null;
      buildVoteBar(data.modes);
      if (data.session) {
        sessionPhaseRef = data.session.sessionPhase || 'playing';
        if (minigameBarEl)
          minigameBarEl.classList.toggle('lobby-visible', sessionPhaseRef === 'lobby');
      }
      if (spectateBannerEl) spectateBannerEl.classList.toggle('visible', amSpectator);
    });

    socket.on('level', (data) => {
      applyLevelPack(data);
    });

    socket.on('toast', (t) => {
      showToast(t.message || '');
    });

    socket.on('state', (pack) => {
      if (pack.serverTime != null) {
        timeSkew += (pack.serverTime - Date.now() - timeSkew) * 0.15;
      }
      if (pack.finishX !== undefined) finishX = pack.finishX;
      mergePlayers(pack.players || []);
      updateSessionUI(pack);
      if (spectateBannerEl) spectateBannerEl.classList.toggle('visible', amSpectator);
    });

    socket.on('chat', appendChat);

    socket.emit('join', { nickname });

    requestAnimationFrame(frame);
  }

  function appendChat(msg) {
    const line = document.createElement('div');
    line.className = 'chat-line';
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = msg.nickname + ':';
    line.appendChild(who);
    if (msg.emoji) {
      const em = document.createElement('span');
      em.className = 'emo';
      em.textContent = msg.emoji;
      line.appendChild(em);
    }
    if (msg.text) {
      line.appendChild(document.createTextNode(msg.text));
    }
    chatLog.appendChild(line);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function sendChat(text, emoji) {
    if (!socket || !myId) return;
    socket.emit('chat', { text: text || '', emoji: emoji || '' });
  }

  function tickInput() {
    if (!socket || !myId || amSpectator) return;
    const jumpEdge = keys.jump && !lastJump;
    const pushEdge = keys.push && !lastPush;
    const dashEdge = keys.dash && !lastDash;
    lastJump = keys.jump;
    lastPush = keys.push;
    lastDash = keys.dash;

    socket.emit('input', {
      left: keys.left,
      right: keys.right,
      down: keys.down,
      jump: jumpEdge,
      push: pushEdge,
      dash: dashEdge,
    });
  }

  btnEnter.addEventListener('click', () => {
    const n = (nickInput.value || '').trim() || '플레이어';
    connectGame(n.slice(0, 16));
  });

  nickInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnEnter.click();
  });

  window.addEventListener('keydown', (e) => {
    if (nickModal && !nickModal.classList.contains('hidden')) return;
    if (e.target === chatInput) return;
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = true;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = true;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.down = true;
    if (e.code === 'KeyW' || e.code === 'ArrowUp') {
      e.preventDefault();
      keys.jump = true;
    }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.dash = true;
    const dk = e.code.match(/^Digit([1-5])$/);
    if (
      dk &&
      voteModesRef.length &&
      socket &&
      myId &&
      sessionPhaseRef === 'lobby'
    ) {
      const idx = parseInt(dk[1], 10) - 1;
      const m = voteModesRef[idx];
      if (m) {
        myVoteMode = m.id;
        socket.emit('voteMode', { modeId: m.id });
        if (minigameBarEl) {
          minigameBarEl.querySelectorAll('button').forEach((btn) => {
            btn.classList.toggle('voted', btn.dataset.mode === myVoteMode);
          });
        }
      }
    }
    if (e.code === 'Space') {
      e.preventDefault();
      keys.jump = true;
    }
    if (e.code === 'KeyF') keys.push = true;
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = false;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = false;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.down = false;
    if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') keys.jump = false;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.dash = false;
    if (e.code === 'KeyF') keys.push = false;
  });

  setInterval(tickInput, 1000 / 30);

  btnSend.addEventListener('click', () => {
    const t = chatInput.value.trim();
    if (t) {
      sendChat(t, '');
      chatInput.value = '';
    }
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnSend.click();
    }
  });
})();
