import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildBrain, REGIONS } from './geometry.js';
import { buildPathways, ANCHORS, PFC_CENTRE } from './pathways.js';
import { STEPS, CHEM } from './steps.js';

const NR = REGIONS.length;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const $ = (id) => document.getElementById(id);

// ---------- quality tier: phones get fewer points and a lower pixel ratio ----------
const TIER = coarse
  ? { points: 60000, dpr: Math.min(devicePixelRatio, 1.75) }
  : { points: 90000, dpr: Math.min(devicePixelRatio, 2) };

// ---------- renderer ----------
const canvas = $('c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 unavailable');
} catch (e) {
  document.body.classList.add('nogl');
  throw e;
}
renderer.setPixelRatio(TIER.dpr);
renderer.setClearColor(0x020409, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
camera.position.set(0, 0.05, 3.9);
const brain = new THREE.Group();
brain.position.y = 0.12;
scene.add(brain);

const uniforms = {
  uTime: { value: 0 },
  uNetT: { value: 0 },                 // network clock, runs faster when "enhanced"
  uPixel: { value: renderer.getPixelRatio() },
  uScreen: { value: 1 },               // point size follows on-screen brain size
  uDim: { value: 1 },                  // base brain brightness (dims to focus a pathway)
  uGlow: { value: new Array(NR).fill(0) },
  uGlowColor: { value: Array.from({ length: NR }, () => new THREE.Color(0xffffff)) },
  uWave: { value: new THREE.Vector4(0, 0, 0, -1) },
  uWaveAmp: { value: 0 },
  uWaveColor: { value: new THREE.Color(0xffffff) },
};

// depth fade is measured from the brain's centre, so it holds at any camera distance
const DEPTH = '(-mv.z + modelViewMatrix[3].z + 3.9)';
const regionGLSL = /* glsl */ `
  uniform float uGlow[${NR}];
  uniform vec3 uGlowColor[${NR}];
  uniform vec4 uWave; uniform float uWaveAmp; uniform vec3 uWaveColor;
  vec4 regionGlow(float r) { int i = int(r + 0.5); return vec4(uGlowColor[i], uGlow[i]); }
  float waveAt(vec3 p) {
    float d = distance(vec3(abs(p.x), p.yz), uWave.xyz);   // mirrored: both hemispheres
    return uWaveAmp * exp(-pow((d - uWave.w) * 11.0, 2.0));
  }
`;

const shedable = [];   // geometries whose drawRange shrinks on slow devices

function buildScene(data) {
  // ---------- cortex + nuclei points ----------
  {
    const g = new THREE.BufferGeometry();
    const p = data.points;
    g.setAttribute('position', new THREE.BufferAttribute(p.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(p.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(p.size, 1));
    g.setAttribute('aRegion', new THREE.BufferAttribute(p.region, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(p.phase, 1));
    brain.add(new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms, vertexColors: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        ${regionGLSL}
        uniform float uTime, uPixel, uScreen, uDim;
        attribute float aSize, aRegion, aPhase;
        varying vec3 vCol; varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float tw = 0.72 + 0.28 * sin(uTime * (0.8 + fract(aPhase) * 1.6) + aPhase * 7.0);
          float depth = smoothstep(6.2, 3.4, ${DEPTH});
          vec4 rg = regionGlow(aRegion);
          float w = waveAt(position);
          vCol = mix(mix(color, rg.rgb, rg.a), uWaveColor, min(1.0, w));
          vA = tw * mix(0.12, 0.62, depth) * (uDim + rg.a * 0.6 + w * 0.8);
          gl_PointSize = aSize * uPixel * uScreen * (1.0 + rg.a * 0.25 + w * 0.3) * (5.2 / -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vCol; varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float a = exp(-dot(c, c) * 12.8) * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vCol * a, a);
        }`,
    })));
    shedable.push({ geo: g, count: p.region.length });
  }

  // ---------- network + tracts with travelling signals ----------
  const lines = (src, o) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(src.pos, 3));
    g.setAttribute('aT', new THREE.BufferAttribute(src.t, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(src.seed, 1));
    g.setAttribute('aRegion', new THREE.BufferAttribute(src.region, 1));
    return new THREE.LineSegments(g, new THREE.ShaderMaterial({
      uniforms: {
        ...uniforms,
        uBase: { value: new THREE.Color(o.base) }, uPulse: { value: new THREE.Color(o.pulse) },
        uAlpha: { value: o.alpha }, uSpeed: { value: o.speed }, uRate: { value: o.rate },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        ${regionGLSL}
        attribute float aT, aSeed, aRegion;
        varying float vT, vSeed, vDepth; varying vec4 vRg;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          vT = aT; vSeed = aSeed; vRg = regionGlow(aRegion);
          vDepth = smoothstep(6.2, 3.4, ${DEPTH});
        }`,
      fragmentShader: /* glsl */ `
        uniform float uNetT, uAlpha, uSpeed, uRate, uDim;
        uniform vec3 uBase, uPulse;
        varying float vT, vSeed, vDepth; varying vec4 vRg;
        void main() {
          float cycle = uNetT * uSpeed + vSeed * 97.0;
          float live = step(1.0 - uRate, fract(sin((floor(cycle) + vSeed * 13.0) * 43.758) * 43758.5453));
          float head = fract(cycle) * 1.4 - 0.2;
          float pulse = live * exp(-pow((vT - head) * 11.0, 2.0)) * 0.8;
          vec3 base = mix(uBase, vRg.rgb, vRg.a);
          vec3 col = base * uAlpha * (uDim + vRg.a * 0.8) + mix(uPulse, vRg.rgb, vRg.a) * pulse * uDim;
          float a = (uAlpha + pulse) * mix(0.3, 1.0, vDepth);
          gl_FragColor = vec4(col * mix(0.3, 1.0, vDepth), a);
        }`,
    }));
  };
  brain.add(lines(data.network, { base: 0x2a6bff, pulse: 0x7fdcff, alpha: 0.07, speed: 0.55, rate: 0.22 }));
  brain.add(lines(data.tracts, { base: 0x3b5bff, pulse: 0xb8f0ff, alpha: 0.1, speed: 0.32, rate: 0.35 }));

  // ---------- neuron bodies ----------
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.nodes.pos, 3));
    g.setAttribute('aRegion', new THREE.BufferAttribute(data.nodes.region, 1));
    brain.add(new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        ${regionGLSL}
        uniform float uNetT, uPixel, uScreen, uDim;
        attribute float aRegion;
        varying float vA; varying vec3 vCol;
        float h(float n) { return fract(sin(n) * 43758.5453); }
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float id = float(gl_VertexID);
          float fire = pow(max(0.0, sin(uNetT * (0.6 + h(id) * 1.4) + h(id + 1.0) * 40.0)), 24.0);
          vec4 rg = regionGlow(aRegion);
          float w = waveAt(position);
          vCol = mix(mix(mix(vec3(0.45, 0.8, 1.0), vec3(1.0), fire), rg.rgb, rg.a), uWaveColor, min(1.0, w));
          vA = ((0.22 + fire * 1.3) * uDim + rg.a * 0.3 + w) * mix(0.3, 1.0, smoothstep(6.2, 3.4, ${DEPTH}));
          gl_PointSize = (2.2 + fire * 4.5 + rg.a * 0.8 + w * 3.0) * uPixel * uScreen * (5.2 / -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA; varying vec3 vCol;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float a = exp(-dot(c, c) * 14.0) * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vCol * a, a);
        }`,
    })));
  }
}

// ---------- faint dust for depth ----------
{
  const n = 700, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 5 + Math.random() * 9, t = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1;
    const s = Math.sqrt(1 - u * u);
    p.set([r * s * Math.cos(t), r * u, r * s * Math.sin(t) - 6], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({
    color: 0x3a5fa8, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })));
}

// ---------- post: bloom, then speed-scaled trails ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.95, 0.22, 0.1);
composer.addPass(bloom);
const afterimage = new AfterimagePass(0);   // after bloom, so trails are not re-bloomed
composer.addPass(afterimage);
composer.addPass(new OutputPass());

// ---------- layout: brain sits above the phone panel, right of the desktop panel ----------
const wide = matchMedia('(min-width: 900px) and (min-aspect-ratio: 1/1)');
const TAN = Math.tan(THREE.MathUtils.degToRad(19));
function resize() {
  const w = innerWidth, h = innerHeight, aspect = w / h;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = aspect;
  let z = 3.9, ox = 0, oy = 0;
  if (wide.matches) {
    ox = -Math.min(230, w * 0.16);                 // push the brain right of the panel
  } else {
    const free = h * 0.6;                          // the panel owns the bottom ~40%
    oy = (h - free) / 2;                           // centre the brain in the space above the panel
    const fitW = 1.08 / (TAN * aspect);
    const fitH = 1.2 / (TAN * (free / h));
    z = Math.max(3.9, fitW, fitH);
  }
  camera.position.z = z;
  camera.setViewOffset(w, h, ox, oy, w, h);
  camera.updateProjectionMatrix();
  // points scale with the brain's size on screen (brain px ~ h / z; shaders already divide by z)
  uniforms.uScreen.value = THREE.MathUtils.clamp(h / 800, 0.6, 1.6);
}

// ---------- rotation: drag, inertia, idle drift, and step aiming ----------
const vel = { x: 0, y: 0 };
let dragging = false, last = null, lastMoveT = 0, idleSince = performance.now();
let aim = null;                                  // target orientation for the current step
const qTmp = new THREE.Quaternion();
const AX_Y = new THREE.Vector3(0, 1, 0), AX_X = new THREE.Vector3(1, 0, 0);
function spin(dx, dy) {
  qTmp.setFromAxisAngle(AX_Y, dx); brain.quaternion.premultiply(qTmp);
  qTmp.setFromAxisAngle(AX_X, dy); brain.quaternion.premultiply(qTmp);
}
canvas.addEventListener('pointerdown', e => {
  dragging = true; aim = null; last = { x: e.clientX, y: e.clientY, t: performance.now() };
  vel.x = vel.y = 0;
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  document.body.classList.add('grabbing');
});
canvas.addEventListener('pointermove', e => {
  if (!dragging) return;
  const now = performance.now();
  const dt = Math.max(1, now - last.t) / 1000;
  const k = 3.2 / Math.min(innerWidth, innerHeight);
  const dx = (e.clientX - last.x) * k, dy = (e.clientY - last.y) * k;
  spin(dx, dy);
  vel.x = vel.x * 0.6 + (dx / dt) * 0.4;
  vel.y = vel.y * 0.6 + (dy / dt) * 0.4;
  last = { x: e.clientX, y: e.clientY, t: now };
  lastMoveT = now;
});
const endDrag = () => {
  if (!dragging) return;
  dragging = false; idleSince = performance.now();
  if (performance.now() - lastMoveT > 90) vel.x = vel.y = 0;
  document.body.classList.remove('grabbing');
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  camera.zoom = THREE.MathUtils.clamp(camera.zoom * Math.exp(-e.deltaY * 0.001), 0.7, 2.2);
  camera.updateProjectionMatrix();
}, { passive: false });

// ---------- step engine ----------
let paths = {};
const pathState = {};
const glowTarget = new Array(NR).fill(0);
const glowColorTarget = Array.from({ length: NR }, () => new THREE.Color(0xffffff));
let dimTarget = 1, actTarget = 1, act = 1, flickerRegion = -1;
let wave = null, waveClock = 0, waveAmp = 0;
let stepIndex = 0, enhanced = false, autoTimer = 0, userToggled = false;

function applyState() {
  const s = STEPS[stepIndex];
  const key = enhanced ? 'enh' : 'nat';
  for (const name in paths) {
    const ps = pathState[name];
    const cfg = s.pathways[name];
    if (cfg) {
      const c = cfg[key];
      ps.target = { i: 1, b: c.b, flow: c.flow };
      ps.colorTarget.set(c.color);
      if (ps.cur.i < 0.02) ps.color.set(c.color);   // appearing: no colour sweep
      paths[name].group.visible = true;
    } else {
      ps.target = { ...ps.target, i: 0 };
    }
  }
  glowTarget.fill(0);
  const g = (s.glow && s.glow[key]) || {};
  for (const [region, [hex, amt]] of Object.entries(g)) {
    const i = REGIONS.indexOf(region);
    glowTarget[i] = amt;
    glowColorTarget[i].set(hex);
    if (uniforms.uGlow.value[i] < 0.02) uniforms.uGlowColor.value[i].set(hex);
  }
  flickerRegion = s.flicker && s.flicker[key] ? REGIONS.indexOf(s.flicker[key]) : -1;
  dimTarget = s.dim;
  actTarget = s.activity ? s.activity[key] : 1;
  wave = s.wave && enhanced ? s.wave : null;
  if (wave) {
    const o = wave.from === 'pfc' ? PFC_CENTRE : ANCHORS[wave.from];
    uniforms.uWave.value.set(Math.abs(o[0]), o[1], o[2], -1);
    uniforms.uWaveColor.value.set(wave.color);
    waveClock = wave.period * 0.9;               // first ripple fires almost at once
  }
  renderUI();
}

function goTo(i) {
  i = Math.max(0, Math.min(STEPS.length - 1, i));
  stepIndex = i;
  enhanced = false; userToggled = false;
  const v = STEPS[i].view;
  aim = new THREE.Quaternion().setFromEuler(new THREE.Euler(v[0], v[1], 0));
  if (reduceMotion) { brain.quaternion.copy(aim); aim = null; }
  vel.x = vel.y = 0;
  clearTimeout(autoTimer);
  // drug steps flip to Enhanced on their own, unless the viewer has taken the toggle
  if (i > 0) autoTimer = setTimeout(() => { if (!userToggled) setEnhanced(true); }, 2600);
  if (location.hash !== '#' + (i + 1)) try { history.replaceState(null, '', '#' + (i + 1)); } catch {}
  applyState();
}
function setEnhanced(on, byUser = false) {
  if (byUser) { userToggled = true; clearTimeout(autoTimer); }
  if (on === enhanced) return;
  enhanced = on;
  applyState();
}

// ---------- UI ----------
const ui = {
  progress: $('progress'), chemLabel: $('chemLabel'), count: $('count'),
  title: $('title'), body: $('body'), state: $('state'), prev: $('prev'), next: $('next'),
  nat: $('tNat'), enh: $('tEnh'), toggle: $('toggle'), panel: $('panel'), announce: $('announce'),
};
ui.progress.innerHTML = STEPS.map(() => '<span></span>').join('');
let shownStep = -1;
function renderUI() {
  const s = STEPS[stepIndex];
  const chem = CHEM[s.chem];
  // GB-115 reads red while the alarm runs, violet once calmed
  const stateHex = s.chem === 'calm' && !enhanced ? CHEM.alarm.hex : chem.hex;
  const root = document.documentElement.style;
  root.setProperty('--chem', chem.hex);
  root.setProperty('--state', stateHex);
  if (shownStep !== stepIndex) {
    ui.panel.classList.remove('swap'); void ui.panel.offsetWidth; ui.panel.classList.add('swap');
    ui.chemLabel.textContent = chem.label;
    ui.count.textContent = `${stepIndex + 1} / ${STEPS.length}`;
    ui.title.textContent = s.title;
    ui.body.textContent = s.body;
    [...ui.progress.children].forEach((el, k) => {
      el.className = k < stepIndex ? 'done' : k === stepIndex ? 'on' : '';
    });
    ui.prev.disabled = stepIndex === 0;
    ui.next.disabled = stepIndex === STEPS.length - 1;
    ui.announce.textContent = `Step ${stepIndex + 1} of ${STEPS.length}: ${s.title}.`;
    shownStep = stepIndex;
  }
  ui.state.textContent = enhanced ? s.enh : s.nat;
  ui.state.classList.remove('flip'); void ui.state.offsetWidth; ui.state.classList.add('flip');
  ui.toggle.dataset.on = enhanced ? 'enh' : 'nat';
  ui.nat.setAttribute('aria-checked', String(!enhanced));
  ui.enh.setAttribute('aria-checked', String(enhanced));
}
ui.prev.addEventListener('click', () => goTo(stepIndex - 1));
ui.next.addEventListener('click', () => goTo(stepIndex + 1));
ui.nat.addEventListener('click', () => setEnhanced(false, true));
ui.enh.addEventListener('click', () => setEnhanced(true, true));
// arrow keys inside the radio group flip the toggle, as a radio group should
ui.toggle.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.stopPropagation(); e.preventDefault();
    setEnhanced(e.key === 'ArrowRight', true);
    (enhanced ? ui.enh : ui.nat).focus();
  }
});
addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k === 'ArrowRight' || k === 'PageDown') { goTo(stepIndex + 1); e.preventDefault(); }
  else if (k === 'ArrowLeft' || k === 'PageUp') { goTo(stepIndex - 1); e.preventDefault(); }
  else if (k === 'e' || k === 'E' || (k === ' ' && document.activeElement?.tagName !== 'BUTTON')) {
    setEnhanced(!enhanced, true); e.preventDefault();
  }
  else if (k === 'q' || k === 'Q') toggleQR();
  else if (k === 'Escape') toggleQR(false);
});
function toggleQR(force) {
  const el = $('qr');
  el.hidden = !(force ?? el.hidden);
}
$('qrOpen').addEventListener('click', () => toggleQR(true));
$('qr').addEventListener('click', () => toggleQR(false));
addEventListener('hashchange', () => {
  const m = /^#(\d+)/.exec(location.hash);
  if (m && +m[1] - 1 !== stepIndex) goTo(+m[1] - 1);
});

// ---------- adaptive quality: step down while the device cannot hold ~45 fps ----------
let fpsFrames = 0, fpsStart = 0, fpsWarm = 0, shed = 0;
function watchFps(now) {
  if (now < fpsWarm || document.hidden) { fpsStart = 0; return; }
  if (!fpsStart) { fpsStart = now; fpsFrames = 0; return; }
  fpsFrames++;
  if (now - fpsStart < 2000) return;
  const fps = (fpsFrames * 1000) / (now - fpsStart);
  fpsStart = 0;
  if (fps >= 45) return;
  const pr = renderer.getPixelRatio();
  if (pr > 1.01) {
    renderer.setPixelRatio(Math.max(1, pr - 0.35));
    uniforms.uPixel.value = renderer.getPixelRatio();
    resize();
  } else if (shed < 2) {
    shed++;
    for (const d of shedable) d.geo.setDrawRange(0, Math.floor(d.count * (shed === 1 ? 0.7 : 0.5)));
  }
  fpsWarm = now + 1000;
}

// ---------- loop ----------
let angSpeed = 0, prevT = performance.now();
function frame() {
  const now = performance.now();
  const dt = Math.min((now - prevT) / 1000, 0.05);
  prevT = now;
  const e = (rate) => 1 - Math.exp(-dt * rate);   // frame-rate independent easing
  uniforms.uTime.value += dt;
  act += (actTarget - act) * e(2);
  uniforms.uNetT.value += dt * act;
  uniforms.uDim.value += (dimTarget - uniforms.uDim.value) * e(2.5);

  if (!dragging) {
    const decay = Math.exp(-dt * 2.2);
    vel.x *= decay; vel.y *= decay;
    spin(vel.x * dt, vel.y * dt);
    if (aim) {
      brain.quaternion.slerp(aim, e(2.4));
      if (brain.quaternion.angleTo(aim) < 0.002) { aim = null; idleSince = now; }
    } else if (!reduceMotion && now - idleSince > 1800) {
      brain.rotateOnWorldAxis(AX_Y, dt * 0.07);
    }
  }

  const target = dragging && now - lastMoveT > 80 ? 0 : Math.hypot(vel.x, vel.y);
  angSpeed += (target - angSpeed) * Math.min(1, dt * 12);
  afterimage.uniforms.damp.value = reduceMotion ? 0 : THREE.MathUtils.clamp(angSpeed * 0.16, 0, 0.8);

  // region glow, with an anxious flicker where a step asks for one
  const glow = uniforms.uGlow.value;
  for (let i = 0; i < NR; i++) {
    let t = glowTarget[i];
    if (i === flickerRegion) t *= 0.55 + 0.45 * Math.abs(Math.sin(now * 0.011) * Math.sin(now * 0.0047 + 1.3));
    glow[i] += (t - glow[i]) * e(i === flickerRegion ? 14 : 3);
    uniforms.uGlowColor.value[i].lerp(glowColorTarget[i], e(3));
  }

  // pathways ease toward their step targets; flow is integrated so speed changes never jump
  for (const name in paths) {
    const ps = pathState[name], u = paths[name].uniforms;
    ps.cur.i += (ps.target.i - ps.cur.i) * e(3);
    ps.cur.b += (ps.target.b - ps.cur.b) * e(2.5);
    ps.cur.flow += (ps.target.flow - ps.cur.flow) * e(2.5);
    ps.color.lerp(ps.colorTarget, e(2.5));
    u.uI.value = ps.cur.i; u.uB.value = ps.cur.b; u.uColor.value.copy(ps.color);
    u.uPhase.value += dt * ps.cur.flow;
    u.uPixel.value = uniforms.uPixel.value * uniforms.uScreen.value;
    if (ps.cur.i < 0.005 && ps.target.i === 0) paths[name].group.visible = false;
  }

  // expanding ripple (TAK-653, ketamine)
  if (wave) {
    waveClock += dt;
    if (waveClock > wave.period) waveClock = 0;
    const r = waveClock * 0.75;
    uniforms.uWave.value.w = r;
    waveAmp += (wave.amp * Math.max(0, 1 - r / 1.5) - waveAmp) * e(8);
  } else waveAmp += (0 - waveAmp) * e(4);
  uniforms.uWaveAmp.value = reduceMotion ? 0 : waveAmp;

  watchFps(now);
  composer.render();
  requestAnimationFrame(frame);
}

// ---------- boot: paint the loading state first, then build ----------
function boot() {
  const data = buildBrain({ points: TIER.points });
  buildScene(data);
  paths = buildPathways(data);
  for (const [name, p] of Object.entries(paths)) {
    brain.add(p.group);
    pathState[name] = {
      cur: { i: 0, b: 0.3, flow: 0.3 }, target: { i: 0, b: 0.3, flow: 0.3 },
      color: new THREE.Color(), colorTarget: new THREE.Color(),
    };
  }
  const m = /^#(\d+)/.exec(location.hash);
  const start = m ? Math.max(0, Math.min(STEPS.length - 1, +m[1] - 1)) : 0;
  const v = STEPS[start].view;
  brain.quaternion.setFromEuler(new THREE.Euler(v[0], v[1] + 0.6, 0));   // arrive with a turn
  addEventListener('resize', resize);
  resize();
  goTo(start);
  fpsWarm = performance.now() + 2500;
  document.body.classList.add('ready');
  window.__brain = { goTo, setEnhanced, get step() { return stepIndex; }, renderer };
  requestAnimationFrame(frame);
}
requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(boot, 30)));
