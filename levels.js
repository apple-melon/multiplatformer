'use strict';

const CLASSIC_STATIC = [
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

const CLASSIC_MOVING = [
  { baseX: 900, baseY: 520, w: 100, h: 18, amp: 100, omega: 0.0014, phase: 0 },
  { baseX: 2200, baseY: 400, w: 90, h: 18, amp: 80, omega: 0.002, phase: 1.2 },
  { baseX: 4500, baseY: 360, w: 110, h: 18, amp: 120, omega: 0.0011, phase: 0.5 },
  { baseX: 6200, baseY: 480, w: 100, h: 18, amp: 90, omega: 0.0018, phase: 2 },
  { baseX: 7500, baseY: 340, w: 95, h: 18, amp: 110, omega: 0.0013, phase: 0.8 },
];

const CLASSIC_SPIKES = [
  { x: 800, y: 656, w: 80, h: 12 },
  { x: 2100, y: 656, w: 100, h: 12 },
  { x: 3400, y: 656, w: 120, h: 12 },
  { x: 5100, y: 656, w: 90, h: 12 },
  { x: 6800, y: 656, w: 110, h: 12 },
  { x: 2400, y: 428, w: 40, h: 12 },
  { x: 5000, y: 308, w: 50, h: 12 },
];

const CLASSIC_WATER = [
  { x: 1600, y: 620, w: 420, h: 60 },
  { x: 5600, y: 620, w: 380, h: 60 },
];

const CLASSIC_PADS = [
  { x: 1050, y: 648, w: 70, h: 20 },
  { x: 2900, y: 648, w: 70, h: 20 },
  { x: 4800, y: 648, w: 70, h: 20 },
  { x: 7200, y: 648, w: 70, h: 20 },
  { x: 1950, y: 488, w: 56, h: 16 },
  { x: 4200, y: 388, w: 56, h: 16 },
];

const CLASSIC_CANNONS = [
  { x: 1350, y: 600, w: 44, h: 44, vx: 720, vy: -520 },
  { x: 3800, y: 580, w: 44, h: 44, vx: -680, vy: -480 },
  { x: 6100, y: 600, w: 44, h: 44, vx: 700, vy: -540 },
  { x: 7800, y: 560, w: 44, h: 44, vx: -660, vy: -500 },
];

const LEVELS = {
  classic: {
    id: 'classic',
    label: '대탐험',
    staticPlatforms: CLASSIC_STATIC,
    movingDefs: CLASSIC_MOVING,
    spikes: CLASSIC_SPIKES,
    water: CLASSIC_WATER,
    jumpPads: CLASSIC_PADS,
    cannons: CLASSIC_CANNONS,
    spawn: { x: 180, y: 520, w: 100 },
    world: { minX: -80, maxX: 8800, fallY: 1300 },
    finishX: 0,
  },
  race: {
    id: 'race',
    label: '스프린트',
    staticPlatforms: [
      { x: -100, y: 668, w: 3400, h: 400 },
      { x: 200, y: 560, w: 140, h: 18 },
      { x: 520, y: 500, w: 120, h: 18 },
      { x: 800, y: 440, w: 100, h: 18 },
      { x: 1050, y: 520, w: 130, h: 18 },
      { x: 1350, y: 460, w: 110, h: 18 },
      { x: 1650, y: 400, w: 100, h: 18 },
      { x: 1900, y: 480, w: 140, h: 18 },
      { x: 2200, y: 420, w: 120, h: 18 },
      { x: 2450, y: 360, w: 100, h: 18 },
      { x: 2650, y: 440, w: 200, h: 18 },
    ],
    movingDefs: [
      { baseX: 1100, baseY: 380, w: 85, h: 16, amp: 70, omega: 0.0022, phase: 0 },
    ],
    spikes: [
      { x: 600, y: 656, w: 60, h: 12 },
      { x: 1500, y: 656, w: 70, h: 12 },
      { x: 2100, y: 656, w: 60, h: 12 },
    ],
    water: [{ x: 900, y: 628, w: 200, h: 45 }],
    jumpPads: [
      { x: 400, y: 648, w: 64, h: 18 },
      { x: 1280, y: 648, w: 64, h: 18 },
      { x: 2000, y: 648, w: 64, h: 18 },
    ],
    cannons: [{ x: 300, y: 590, w: 40, h: 40, vx: 620, vy: -450 }],
    spawn: { x: 120, y: 520, w: 80 },
    world: { minX: -50, maxX: 3200, fallY: 1200 },
    finishX: 2920,
  },
  sumo: {
    id: 'sumo',
    label: '스모 아레나',
    staticPlatforms: [
      { x: -400, y: 900, w: 2800, h: 500 },
      { x: 380, y: 520, w: 560, h: 24 },
    ],
    movingDefs: [
      { baseX: 520, baseY: 420, w: 70, h: 16, amp: 55, omega: 0.0025, phase: 0 },
      { baseX: 720, baseY: 380, w: 70, h: 16, amp: 55, omega: 0.0025, phase: 1.57 },
    ],
    spikes: [
      { x: 350, y: 656, w: 620, h: 12 },
    ],
    water: [],
    jumpPads: [{ x: 600, y: 648, w: 56, h: 16 }],
    cannons: [],
    spawn: { x: 520, y: 460, w: 280 },
    world: { minX: 200, maxX: 1200, fallY: 850 },
    finishX: 0,
  },
  tag: {
    id: 'tag',
    label: '술래잡기',
    staticPlatforms: [
      { x: 100, y: 668, w: 1800, h: 400 },
      { x: 200, y: 520, w: 220, h: 18 },
      { x: 520, y: 440, w: 200, h: 18 },
      { x: 800, y: 360, w: 220, h: 18 },
      { x: 1100, y: 480, w: 240, h: 18 },
      { x: 1400, y: 380, w: 200, h: 18 },
    ],
    movingDefs: [
      { baseX: 700, baseY: 300, w: 90, h: 16, amp: 100, omega: 0.0016, phase: 0 },
    ],
    spikes: [],
    water: [{ x: 400, y: 630, w: 300, h: 45 }],
    jumpPads: [
      { x: 350, y: 648, w: 56, h: 16 },
      { x: 950, y: 648, w: 56, h: 16 },
    ],
    cannons: [{ x: 1300, y: 580, w: 40, h: 40, vx: -500, vy: -400 }],
    spawn: { x: 280, y: 520, w: 400 },
    world: { minX: 50, maxX: 1750, fallY: 1200 },
    finishX: 0,
  },
  tower: {
    id: 'tower',
    label: '타워 점프',
    staticPlatforms: [
      { x: 300, y: 668, w: 700, h: 400 },
      { x: 420, y: 600, w: 100, h: 16 },
      { x: 520, y: 530, w: 100, h: 16 },
      { x: 620, y: 460, w: 100, h: 16 },
      { x: 720, y: 390, w: 100, h: 16 },
      { x: 620, y: 320, w: 100, h: 16 },
      { x: 520, y: 250, w: 100, h: 16 },
      { x: 420, y: 180, w: 120, h: 16 },
      { x: 580, y: 120, w: 160, h: 16 },
    ],
    movingDefs: [
      { baseX: 480, y: 560, w: 80, h: 14, amp: 60, omega: 0.002, phase: 0 },
    ],
    spikes: [{ x: 400, y: 656, w: 500, h: 12 }],
    water: [],
    jumpPads: [
      { x: 380, y: 648, w: 50, h: 16 },
      { x: 650, y: 648, w: 50, h: 16 },
    ],
    cannons: [],
    spawn: { x: 480, y: 520, w: 80 },
    world: { minX: 200, maxX: 1100, fallY: 1100 },
    finishX: 0,
  },
};

const MODE_ORDER = ['classic', 'race', 'sumo', 'tag', 'tower'];

const MODES_UI = MODE_ORDER.map((id) => ({
  id,
  label: LEVELS[id].label,
}));

function getLevel(modeId) {
  const base = LEVELS[modeId] || LEVELS.classic;
  return {
    id: base.id,
    label: base.label,
    staticPlatforms: base.staticPlatforms.map((p) => ({ ...p })),
    movingDefs: base.movingDefs.map((m) => ({ ...m })),
    spikes: base.spikes.map((s) => ({ ...s })),
    water: base.water.map((w) => ({ ...w })),
    jumpPads: base.jumpPads.map((j) => ({ ...j })),
    cannons: base.cannons.map((c) => ({ ...c })),
    spawn: { ...base.spawn },
    world: { ...base.world },
    finishX: base.finishX || 0,
  };
}

function clientLevelPayload(L) {
  return {
    mode: L.id,
    modeLabel: L.label,
    platforms: L.staticPlatforms,
    movingDefs: L.movingDefs,
    spikes: L.spikes,
    water: L.water,
    jumpPads: L.jumpPads,
    cannons: L.cannons,
    world: L.world,
    finishX: L.finishX,
  };
}

module.exports = {
  LEVELS,
  MODE_ORDER,
  MODES_UI,
  getLevel,
  clientLevelPayload,
};
