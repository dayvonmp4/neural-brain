// Neurotransmitter pathways: bundles of curved fibres between anatomical
// anchors, drawn as faint routes with bright signal packets travelling along
// them. Each pathway has its own uniforms so a step can recolour, brighten
// and speed it up independently.

import * as THREE from 'three';

// model space: +x right, +y up, +z front
const A = {
  vta: [0, -0.33, -0.2],
  nac: [0.1, -0.2, 0.3],
  bf: [0.08, -0.27, 0.19],
  hip: [0.33, -0.3, -0.12],
  amy: [0.31, -0.31, 0.14],
  thal: [0.11, -0.06, -0.08],
  stem: [0, -0.58, -0.34],
  hypo: [0.03, -0.36, 0.08],
};
export const ANCHORS = A;
export const PFC_CENTRE = [0, 0.02, 0.78];

const side = (p, s) => [p[0] * s, p[1], p[2]];

export function buildPathways(data) {
  const { surf, rand, gauss } = data;
  const jit = (p, s) => [p[0] + gauss() * s, p[1] + gauss() * s, p[2] + gauss() * s];
  const pick = (filter) => {
    for (let i = 0; i < 400; i++) {
      const p = surf[Math.floor(rand() * surf.length)];
      if (filter(p)) return [p[0], p[1], p[2]];
    }
    return [0, 0.2, 0.6];
  };
  const pfc = (s) => pick(p => p[2] > 0.5 && p[1] > -0.25 && Math.sign(p[0]) === s);
  const cortex = (s) => pick(p => p[3] <= 3 && Math.sign(p[0]) === s);
  const frontal = (s) => pick(p => p[2] > 0.3 && Math.sign(p[0]) === s);
  const S = () => (rand() < 0.5 ? -1 : 1);

  // control point: between the ends, lifted, and pulled toward the midline
  const ctrl = (a, b, lift, inward = 0.35) => [
    (a[0] + b[0]) * 0.5 * (1 - inward),
    (a[1] + b[1]) * 0.5 + lift,
    (a[2] + b[2]) * 0.5,
  ];

  const defs = {
    // mesolimbic (VTA -> nucleus accumbens) + mesocortical (VTA -> prefrontal)
    dopamine() {
      const f = [];
      for (let i = 0; i < 26; i++) { const s = S(), a = jit(A.vta, 0.02), b = jit(side(A.nac, s), 0.025); f.push([a, ctrl(a, b, 0.06, 0), b]); }
      for (let i = 0; i < 44; i++) { const s = S(), a = jit(A.vta, 0.02), b = pfc(s); f.push([a, ctrl(a, b, 0.12, 0.3), b]); }
      return f;
    },
    // basal forebrain -> whole cortex, septum -> hippocampus
    acetylcholine() {
      const f = [];
      for (let i = 0; i < 80; i++) { const s = S(), a = jit(side(A.bf, s), 0.02), b = cortex(s); f.push([a, ctrl(a, b, 0.28, 0.45), b]); }
      for (let i = 0; i < 22; i++) { const s = S(), a = jit(side(A.bf, s), 0.02), b = jit(side(A.hip, s), 0.04); f.push([a, ctrl(a, b, 0.12, 0.2), b]); }
      return f;
    },
    // hippocampus -> prefrontal, plus cortical association fibres
    glutamate() {
      const f = [];
      for (let i = 0; i < 40; i++) { const s = S(), a = jit(side(A.hip, s), 0.035), b = pfc(s); f.push([a, ctrl(a, b, 0.2, 0.25), b]); }
      for (let i = 0; i < 44; i++) {
        const s = S(), a = cortex(s), b = cortex(s);
        const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        if (d < 0.5) { i--; continue; }
        f.push([a, ctrl(a, b, -0.12, 0.1), b]);
      }
      return f;
    },
    // amygdala -> prefrontal, hypothalamus, brainstem
    alarm() {
      const f = [];
      for (let i = 0; i < 34; i++) { const s = S(), a = jit(side(A.amy, s), 0.025), b = pfc(s); f.push([a, ctrl(a, b, 0.14, 0.3), b]); }
      for (let i = 0; i < 16; i++) { const s = S(), a = jit(side(A.amy, s), 0.025), b = jit(A.hypo, 0.02); f.push([a, ctrl(a, b, -0.02, 0), b]); }
      for (let i = 0; i < 16; i++) { const s = S(), a = jit(side(A.amy, s), 0.025), b = jit(A.stem, 0.03); f.push([a, ctrl(a, b, -0.05, 0), b]); }
      return f;
    },
    // ketamine: a prefrontal surge (local fibres), fed by thalamus + hippocampus
    burst() {
      const f = [];
      for (let i = 0; i < 56; i++) { const s = S(), a = frontal(s), b = frontal(s); f.push([a, ctrl(a, b, 0.08, 0), b]); }
      for (let i = 0; i < 20; i++) { const s = S(), a = jit(side(A.thal, s), 0.03), b = pfc(s); f.push([a, ctrl(a, b, 0.15, 0.2), b]); }
      for (let i = 0; i < 16; i++) { const s = S(), a = jit(side(A.hip, s), 0.035), b = pfc(s); f.push([a, ctrl(a, b, 0.2, 0.25), b]); }
      return f;
    },
  };

  const out = {};
  for (const [name, make] of Object.entries(defs)) out[name] = makePathway(make(), rand);
  return out;
}

const TRAIL = 5;
function makePathway(fibres, rand) {
  const group = new THREE.Group();
  const uniforms = {
    uColor: { value: new THREE.Color(0xffffff) },
    uI: { value: 0 },          // visibility 0..1
    uB: { value: 0.3 },        // brightness
    uPhase: { value: 0 },      // accumulated flow time
    uPixel: { value: 1 },
  };

  // faint route lines
  const SEG = 28, lp = [], lt = [];
  for (const [a, b, c] of fibres) {
    let prev = null;
    for (let k = 0; k <= SEG; k++) {
      const t = k / SEG, u = 1 - t;
      const p = [0, 1, 2].map(i => u * u * a[i] + 2 * u * t * b[i] + t * t * c[i]);
      if (prev) { lp.push(...prev, ...p); lt.push((k - 1) / SEG, t); }
      prev = p;
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lp), 3));
  lg.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(lt), 1));
  group.add(new THREE.LineSegments(lg, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aT; varying float vT;
      void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uI, uB; varying float vT;
      void main() {
        float a = uI * (0.1 + 0.22 * uB) * smoothstep(0.0, 0.06, vT) * smoothstep(1.0, 0.94, vT);
        gl_FragColor = vec4(uColor * a, a);
      }`,
  })));

  // signal packets: a few per fibre, each a short comet of TRAIL dots
  const PER = 2;
  const n = fibres.length * PER * TRAIL;
  const pa = new Float32Array(n * 3), pb = new Float32Array(n * 3), pc = new Float32Array(n * 3);
  const off = new Float32Array(n), spd = new Float32Array(n), kk = new Float32Array(n);
  let i = 0;
  for (const [a, b, c] of fibres) {
    for (let p = 0; p < PER; p++) {
      const o = rand(), sp = 0.75 + rand() * 0.5;
      for (let k = 0; k < TRAIL; k++, i++) {
        pa.set(a, i * 3); pb.set(b, i * 3); pc.set(c, i * 3);
        off[i] = o; spd[i] = sp; kk[i] = k;
      }
    }
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pa, 3)); // (a) doubles as bounds
  pg.setAttribute('aB', new THREE.BufferAttribute(pb, 3));
  pg.setAttribute('aC', new THREE.BufferAttribute(pc, 3));
  pg.setAttribute('aOff', new THREE.BufferAttribute(off, 1));
  pg.setAttribute('aSpd', new THREE.BufferAttribute(spd, 1));
  pg.setAttribute('aK', new THREE.BufferAttribute(kk, 1));
  const pts = new THREE.Points(pg, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uPhase, uPixel, uI, uB;
      attribute vec3 aB, aC; attribute float aOff, aSpd, aK;
      varying float vA, vCore;
      void main() {
        float t = fract(uPhase * aSpd * 0.45 + aOff) - aK * 0.016;
        float u = 1.0 - t;
        vec3 p = u * u * position + 2.0 * u * t * aB + t * t * aC;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float ends = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.9, t) * step(0.0, t);
        vA = uI * uB * ends * (1.0 - aK / ${TRAIL.toFixed(1)});
        vCore = aK < 0.5 ? 1.0 : 0.0;
        gl_PointSize = (5.5 - aK * 0.8) * (0.6 + 0.4 * uB) * uPixel * (5.2 / -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; varying float vA, vCore;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = dot(c, c) * 4.0;
        float a = exp(-d * 3.0) * vA;
        if (a < 0.01) discard;
        vec3 col = mix(uColor, vec3(1.0), vCore * exp(-d * 10.0) * 0.7);
        gl_FragColor = vec4(col * a * 1.25, a);
      }`,
  }));
  pts.frustumCulled = false;
  group.add(pts);
  group.visible = false;
  return { group, uniforms };
}
