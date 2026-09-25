// Procedural brain: a signed-distance shape, sampled into glowing points,
// a neuron network, white-matter tracts and deep nuclei. Every point carries
// a region id so a region can be lit later (see REGIONS / brain.highlight).

import { createNoise3D } from './noise.js';

export const REGIONS = [
  'frontal', 'parietal', 'temporal', 'occipital', 'cerebellum', 'brainstem',
  'thalamus', 'hippocampus', 'amygdala', 'vta', 'accumbens', 'basalForebrain',
  'locusCoeruleus',
];
const R = Object.fromEntries(REGIONS.map((n, i) => [n, i]));

function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sdEllipsoid(x, y, z, rx, ry, rz) {
  const k0 = Math.hypot(x / rx, y / ry, z / rz);
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return (k0 * (k0 - 1)) / k1;
}
function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
function smax(a, b, k) { return -smin(-a, -b, k); }
function sdCapsule(x, y, z, ax, ay, az, bx, by, bz, r0, r1 = r0) {
  const px = x - ax, py = y - ay, pz = z - az;
  const qx = bx - ax, qy = by - ay, qz = bz - az;
  const h = Math.min(1, Math.max(0, (px * qx + py * qy + pz * qz) / (qx * qx + qy * qy + qz * qz)));
  return Math.hypot(px - qx * h, py - qy * h, pz - qz * h) - (r0 + (r1 - r0) * h);
}

// +x = right, +y = up, +z = front (nose)
function cerebrum(x, y, z) {
  const ax = Math.abs(x);
  const wx = ax * (1 + 0.13 * z);                     // narrower at the front
  const lift = 0.07 * z * z;                          // poles sit a little lower
  let d = sdEllipsoid(wx - 0.37, y - 0.12 + lift, z + 0.02, 0.47, 0.6, 1.0);
  const temporal = sdEllipsoid(ax - 0.5, y + 0.27, z - 0.1, 0.3, 0.25, 0.56);
  d = smin(d, temporal, 0.14);
  d = smax(d, -(y + 0.5), 0.12);                      // flat underside
  d = smax(d, 0.028 - ax, 0.05);                      // longitudinal fissure
  // Sylvian fissure: a shallow groove above the temporal lobe
  const sylv = Math.hypot(Math.max(0, 0.46 - ax) * 2, y + 0.08 + 0.2 * z) - 0.035;
  d = smax(d, -sylv, 0.04);
  return d;
}
function cerebellum(x, y, z) {
  let d = sdEllipsoid(x, y + 0.47, z + 0.66, 0.54, 0.25, 0.33);
  d = smax(d, -(Math.hypot(x * 3, (y + 0.36) * 1.2) - 0.06), 0.05); // vermis notch
  return d;
}
function brainstem(x, y, z) {
  return sdCapsule(x * 1.15, y, z, 0, -0.2, -0.24, 0, -0.95, -0.42, 0.15, 0.075);
}

function part(x, y, z) {
  const a = cerebrum(x, y, z), b = cerebellum(x, y, z), c = brainstem(x, y, z);
  if (a <= b && a <= c) return [a, 0];
  if (b <= c) return [b, 1];
  return [c, 2];
}
function sdf(x, y, z) {
  const [a, b, c] = [cerebrum(x, y, z), cerebellum(x, y, z), brainstem(x, y, z)];
  return Math.min(a, b, c);
}
function normal(x, y, z) {
  const e = 0.004;
  const nx = sdf(x + e, y, z) - sdf(x - e, y, z);
  const ny = sdf(x, y + e, z) - sdf(x, y - e, z);
  const nz = sdf(x, y, z + e) - sdf(x, y, z - e);
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

function cortexRegion(x, y, z) {
  const ax = Math.abs(x);
  if (y < -0.12 && ax > 0.3 && z > -0.45 && z < 0.62) return R.temporal;
  if (z > 0.22) return R.frontal;
  if (z < -0.52) return R.occipital;
  return R.parietal;
}

const NUCLEI = [
  // name, centre (mirrored when x != 0), sigma
  ['thalamus', [0.11, -0.06, -0.08], [0.06, 0.05, 0.09], 700],
  ['hippocampus', [0.33, -0.3, -0.12], [0.04, 0.035, 0.18], 700],
  ['amygdala', [0.31, -0.31, 0.14], [0.045, 0.04, 0.045], 400],
  ['vta', [0.0, -0.33, -0.2], [0.05, 0.03, 0.035], 300],
  ['accumbens', [0.1, -0.2, 0.3], [0.04, 0.035, 0.04], 350],
  ['basalForebrain', [0.08, -0.27, 0.19], [0.05, 0.025, 0.035], 350],
  ['locusCoeruleus', [0.04, -0.55, -0.37], [0.015, 0.03, 0.02], 150],
];

export function buildBrain({ seed = 7, points = 90000 } = {}) {
  const rand = rng(seed);
  const noise = createNoise3D(rand);
  const gauss = () => {
    const u = 1 - rand(), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  // ---------- cortex surface points ----------
  const TARGET = points;
  const pos = [], col = [], size = [], region = [], phase = [];
  const surf = []; // candidates for neuron nodes
  const box = { x: 1.05, y0: -1.08, y1: 0.78, z0: -1.08, z1: 1.08 };
  let tries = 0;
  while (pos.length / 3 < TARGET && tries < points * 160) {
    tries++;
    const x = (rand() * 2 - 1) * box.x;
    const y = box.y0 + rand() * (box.y1 - box.y0);
    const z = box.z0 + rand() * (box.z1 - box.z0);
    const [d, which] = part(x, y, z);
    if (Math.abs(d) > 0.014) continue;

    let keep, ridge;
    if (which === 0) {
      // winding gyri: ridged noise, two octaves
      const n1 = 1 - Math.abs(noise(x * 2.7, y * 2.7, z * 2.7));
      const n2 = 1 - Math.abs(noise(x * 6.5 + 11, y * 6.5, z * 6.5));
      ridge = n1 * 0.72 + n2 * 0.28;
      keep = 0.025 + Math.pow(Math.max(0, (ridge - 0.72) / 0.28), 1.5) * 0.975;
    } else if (which === 1) {
      // cerebellar folia: fine horizontal stripes
      const s = Math.abs(Math.sin(y * 70 + noise(x * 4, y * 4, z * 4) * 2.2));
      ridge = s;
      keep = 0.08 + Math.pow(s, 5) * 0.9;
    } else {
      ridge = 0.62 + 0.3 * Math.abs(noise(x * 9, y * 3, z * 9));
      keep = 0.5;
    }
    if (rand() > keep) continue;

    // push sulci inward so folds have real depth
    const [nx, ny, nz] = normal(x, y, z);
    const off = -d + (ridge - 0.7) * 0.05;
    const px = x + nx * off, py = y + ny * off, pz = z + nz * off;
    pos.push(px, py, pz);

    const reg = which === 0 ? cortexRegion(px, py, pz) : which === 1 ? R.cerebellum : R.brainstem;
    region.push(reg);
    const hot = Math.max(0, ridge - 0.55) / 0.45;
    // blue in the folds, cyan on the crests, a few white-hot sparks
    const spark = rand() < 0.003;
    const c = spark ? [0.9, 0.97, 1] : [
      0.03 + 0.32 * hot * hot,
      0.14 + 0.72 * hot,
      0.55 + 0.45 * hot,
    ];
    col.push(...c);
    size.push(spark ? 2.0 : 1.1 + hot * 1.1 + rand() * 0.4);
    phase.push(rand() * Math.PI * 2);
    if (which !== 2 && ridge > 0.8 && rand() < 0.1) surf.push([px, py, pz, reg]);
  }

  // ---------- deep nuclei ----------
  for (const [name, c, s, n] of NUCLEI) {
    const sides = c[0] === 0 ? [1] : [1, -1];
    for (const side of sides) {
      for (let i = 0; i < n; i++) {
        pos.push(c[0] * side + gauss() * s[0], c[1] + gauss() * s[1], c[2] + gauss() * s[2]);
        region.push(R[name]);
        col.push(0.25, 0.55, 1.0);
        size.push(1.2 + rand() * 0.8);
        phase.push(rand() * Math.PI * 2);
      }
    }
  }

  // ---------- neuron network (kNN over sparse nodes) ----------
  const nodes = [];
  for (let i = 0; i < surf.length && nodes.length < 2400; i++) nodes.push(surf[i]);
  let guard = 0;
  while (nodes.length < 3300 && guard++ < 2e5) {
    const x = (rand() * 2 - 1) * 0.9, y = -0.45 + rand() * 1.1, z = (rand() * 2 - 1) * 0.95;
    const d = sdf(x, y, z);
    if (d < -0.06 && d > -0.35) nodes.push([x, y, z, cortexRegion(x, y, z)]);
  }
  const net = { pos: [], t: [], seed: [], region: [] };
  const K = 3, MAXD = 0.16;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    const best = [];
    for (let j = 0; j < nodes.length; j++) {
      if (j === i) continue;
      const b = nodes[j];
      const dd = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
      if (dd > MAXD * MAXD) continue;
      if (best.length < K) { best.push([dd, j]); best.sort((p, q) => p[0] - q[0]); }
      else if (dd < best[K - 1][0]) { best[K - 1] = [dd, j]; best.sort((p, q) => p[0] - q[0]); }
    }
    for (const [, j] of best) {
      if (j < i) continue;
      const b = nodes[j];
      const s = rand();
      net.pos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      net.t.push(0, 1);
      net.seed.push(s, s);
      net.region.push(a[3], b[3]);
    }
  }
  const nodePts = { pos: [], region: [] };
  for (const n of nodes) { nodePts.pos.push(n[0], n[1], n[2]); nodePts.region.push(n[3]); }

  // ---------- white-matter tracts (quadratic curves) ----------
  const tracts = { pos: [], t: [], seed: [], region: [] };
  const SEG = 36;
  const addCurve = (p0, p1, p2, reg0, reg1) => {
    const s = rand();
    let prev = null;
    for (let k = 0; k <= SEG; k++) {
      const t = k / SEG, u = 1 - t;
      const p = [0, 1, 2].map(i => u * u * p0[i] + 2 * u * t * p1[i] + t * t * p2[i]);
      if (prev) {
        tracts.pos.push(...prev.p, ...p);
        tracts.t.push(prev.t, t);
        tracts.seed.push(s, s);
        const r = t < 0.5 ? reg0 : reg1;
        tracts.region.push(r, r);
      }
      prev = { p, t };
    }
  };
  const surfPick = () => surf[Math.floor(rand() * surf.length)];
  // projection fibres: brainstem / thalamus fanning up into cortex
  for (let i = 0; i < 170; i++) {
    const e = surfPick();
    const side = Math.sign(e[0]) || 1;
    const start = rand() < 0.5
      ? [0.11 * side + gauss() * 0.03, -0.06 + gauss() * 0.03, -0.08 + gauss() * 0.05]
      : [gauss() * 0.03, -0.55 + gauss() * 0.1, -0.33 + gauss() * 0.02];
    const mid = [start[0] * 0.3 + e[0] * 0.55, (start[1] + e[1]) * 0.5 + 0.12, (start[2] + e[2]) * 0.5];
    addCurve(start, mid, e, start[1] < -0.3 ? R.brainstem : R.thalamus, e[3]);
  }
  // corpus callosum: arcs crossing the midline
  for (let i = 0; i < 70; i++) {
    const z = -0.55 + rand() * 1.05;
    const x = 0.25 + rand() * 0.35;
    const y = 0.05 + rand() * 0.28;
    addCurve([-x, y, z], [0, 0.12 + (y - 0.05) * 0.2, z], [x, y, z], cortexRegion(-x, y, z), cortexRegion(x, y, z));
  }
  // association fibres: front-to-back within a hemisphere
  for (let i = 0; i < 60; i++) {
    const side = rand() < 0.5 ? -1 : 1;
    const x = (0.22 + rand() * 0.28) * side;
    const a = [x, -0.05 + rand() * 0.3, 0.55 + rand() * 0.3];
    const b = [x + gauss() * 0.05, -0.1 + rand() * 0.3, -0.75 + rand() * 0.2];
    addCurve(a, [x * 1.15, 0.25 + rand() * 0.15, (a[2] + b[2]) / 2], b, R.frontal, R.occipital);
  }

  // shuffle so any prefix is an even sample of the whole brain
  const n = region.length;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    for (const [arr, w] of [[pos, 3], [col, 3], [size, 1], [region, 1], [phase, 1]]) {
      for (let k = 0; k < w; k++) {
        const t = arr[i * w + k]; arr[i * w + k] = arr[j * w + k]; arr[j * w + k] = t;
      }
    }
  }

  return {
    surf, rand, gauss,
    points: {
      pos: new Float32Array(pos), col: new Float32Array(col), size: new Float32Array(size),
      region: new Float32Array(region), phase: new Float32Array(phase),
    },
    network: {
      pos: new Float32Array(net.pos), t: new Float32Array(net.t),
      seed: new Float32Array(net.seed), region: new Float32Array(net.region),
    },
    nodes: { pos: new Float32Array(nodePts.pos), region: new Float32Array(nodePts.region) },
    tracts: {
      pos: new Float32Array(tracts.pos), t: new Float32Array(tracts.t),
      seed: new Float32Array(tracts.seed), region: new Float32Array(tracts.region),
    },
  };
}
