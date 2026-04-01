(function () {
  'use strict';

  const STORAGE_KEY = 'mp_platformer_nick';
  const CANVAS_W = 1280;
  const CANVAS_H = 720;
  const CAMERA_LERP = 0.12;
  const REMOTE_LERP = 0.35;

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
  let platforms = [];
  let lastState = [];
  let displayPlayers = new Map();
  let camera = { x: 0, y: 0 };
  let keys = { left: false, right: false, down: false, jump: false, push: false };
  let lastJump = false;
  let lastPush = false;
  const particles = [];

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

  function mergeState(incoming) {
    const byId = new Map(incoming.map((p) => [p.id, p]));
    for (const p of incoming) {
      if (!displayPlayers.has(p.id)) {
        displayPlayers.set(p.id, {
          ...p,
          dx: p.x,
          dy: p.y,
          prevAnim: p.anim,
          prevOnGround: p.anim !== 'jump',
        });
      } else {
        const d = displayPlayers.get(p.id);
        const wasGround = d.prevOnGround;
        const nowGround = p.anim !== 'jump';
        if (nowGround && !wasGround && p.id === myId) {
          addParticle(p.x + p.w * 0.5, p.y + p.h, {
            count: 10,
            speed: 180,
            vy: -80,
            color: 'rgba(180,200,230,0.85)',
          });
        }
        if (p.anim === 'jump' && d.prevAnim !== 'jump' && p.id === myId) {
          addParticle(p.x + p.w * 0.5, p.y + p.h, {
            count: 6,
            speed: 90,
            vy: -40,
            color: 'rgba(120,200,255,0.7)',
          });
        }
        if (p.sliding && p.id === myId && Math.abs(p.vx) > 100) {
          if (Math.random() < 0.4) {
            addParticle(p.x + (p.facing > 0 ? 0 : p.w), p.y + p.h - 4, {
              count: 2,
              speed: 60,
              vx: -p.facing * 40,
              life: 0.25,
              color: 'rgba(200,210,240,0.5)',
            });
          }
        }
        d.prevAnim = p.anim;
        d.prevOnGround = nowGround;
        Object.assign(d, p, { dx: d.dx, dy: d.dy });
      }
    }
    for (const id of displayPlayers.keys()) {
      if (!byId.has(id)) displayPlayers.delete(id);
    }
  }

  function smoothPlayers(dt) {
    for (const [, d] of displayPlayers) {
      const targetX = d.x;
      const targetY = d.y;
      const k = d.id === myId ? 1 : REMOTE_LERP;
      d.dx += (targetX - d.dx) * Math.min(1, k * (dt * 60));
      d.dy += (targetY - d.dy) * Math.min(1, k * (dt * 60));
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

  function drawPlayer(d, camX, camY, isLocal) {
    const x = d.dx - camX;
    const y = d.dy - camY;
    const w = d.w;
    const h = d.h;
    let sx = 1;
    let sy = 1;
    if (d.anim === 'jump') {
      sy = 1.08;
      sx = 0.92;
    } else if (d.anim === 'slide') {
      sy = 0.65;
      sx = 1.12;
    } else if (d.anim === 'run') {
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

    const grd = ctx.createLinearGradient(ox, oy, ox + dw, oy + dh);
    grd.addColorStop(0, d.color);
    grd.addColorStop(1, shadeColor(d.color, -25));
    ctx.fillStyle = grd;
    drawRoundedRect(ox, oy, dw, dh, Math.min(10, dh * 0.25));
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const eyeX = ox + (d.facing > 0 ? dw * 0.58 : dw * 0.22);
    const eyeY = oy + dh * 0.32;
    ctx.fillStyle = 'rgba(15,20,30,0.9)';
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, Math.max(2, dw * 0.08), 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(eyeX + d.facing * dw * 0.14, eyeY + 1, Math.max(1.5, dw * 0.05), 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '600 11px Outfit, sans-serif';
    ctx.fillStyle = isLocal ? 'rgba(255,255,255,0.95)' : 'rgba(230,235,245,0.88)';
    ctx.textAlign = 'center';
    ctx.fillText(d.nickname, ox + dw / 2, oy - 8);
    ctx.textAlign = 'left';
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
    return `rgb(${r|0},${g|0},${b|0})`;
  }

  function drawWorld(camX, camY) {
    ctx.save();
    const grd = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    grd.addColorStop(0, '#1a2332');
    grd.addColorStop(1, '#0f1419');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    for (const plat of platforms) {
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

    const sorted = [...displayPlayers.values()].sort((a, b) => a.dy - b.dy);
    for (const d of sorted) {
      drawPlayer(d, camX, camY, d.id === myId);
    }

    drawParticles(camX, camY);
    ctx.restore();
  }

  let lastTs = performance.now();
  function frame(ts) {
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;

    smoothPlayers(dt);
    updateParticles(dt);

    const me = displayPlayers.get(myId);
    if (me) {
      const targetCamX = me.dx + me.w / 2 - CANVAS_W / 2;
      const targetCamY = me.dy + me.h / 2 - CANVAS_H * 0.55;
      camera.x += (targetCamX - camera.x) * CAMERA_LERP;
      camera.y += (targetCamY - camera.y) * CAMERA_LERP;
      camera.y = Math.min(180, Math.max(-80, camera.y));
    }

    updateParallax(camera.x);
    drawWorld(camera.x, camera.y);

    const cd = me?.pushCdLeft ?? 0;
    hudPush.textContent =
      cd > 80 ? `밀치기: ${(cd / 1000).toFixed(1)}초` : '밀치기: 준비됨';

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
      platforms = data.platforms || [];
    });

    socket.on('state', (list) => {
      lastState = list;
      mergeState(list);
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
    if (!socket || !myId) return;
    const jumpEdge = keys.jump && !lastJump;
    const pushEdge = keys.push && !lastPush;
    lastJump = keys.jump;
    lastPush = keys.push;

    socket.emit('input', {
      left: keys.left,
      right: keys.right,
      down: keys.down,
      jump: jumpEdge,
      push: pushEdge,
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
    if (e.code === 'ArrowDown') keys.down = true;
    if (e.code === 'Space') {
      e.preventDefault();
      keys.jump = true;
    }
    if (e.code === 'KeyF') keys.push = true;
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.left = false;
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.right = false;
    if (e.code === 'ArrowDown') keys.down = false;
    if (e.code === 'Space') keys.jump = false;
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
