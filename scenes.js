import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

// The 3D view of the Navier–Stokes guide. Three scenes share one canvas: a whirlpool (steps 3 to 6), the can of Luo and
// Hou (steps 7 and 8) and a sketch of the blow-up announced in November 2026 (step 9). guide.js picks one with show().
// Colours mean what they mean on the page: ink is the flow, blue is spin, gold is viscosity, red is the blow-up.

const TAU = 2 * Math.PI, clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const INK = new THREE.Color(0xecebe6), BLUE = new THREE.Color(0x6ea8ff), GOLD = new THREE.Color(0xf5c542), RED = new THREE.Color(0xe6392d), HAIR = new THREE.Color(0x4a566b), GLARE = new THREE.Color(0xffd9d2);

// ---- drawing pieces ------------------------------------------------------------------------------------
function lines(positions, color, width = 1.2) {
  const g = new LineSegmentsGeometry().setPositions(positions);
  const o = new LineSegments2(g, new LineMaterial({ color, linewidth: width, transparent: true, depthWrite: false }));
  o.frustumCulled = false;
  return o;
}
// A circle of radius r about the y axis at height y, as line segments.
function ring(r = 1, y = 0, n = 96) {
  const a = [];
  for (let i = 0; i < n; i++) { const p = i / n * TAU, q = (i + 1) / n * TAU; a.push(r * Math.cos(p), y, r * Math.sin(p), r * Math.cos(q), y, r * Math.sin(q)); }
  return a;
}
// A soft blue column: a card that turns about the y axis to face the camera, with a Gaussian across it one sixth of its width wide.
function glow() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { gain: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float gain; varying vec2 vUv; void main() { float x = (vUv.x - 0.5) * 6.0, e = smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.85, vUv.y); gl_FragColor = vec4(vec3(0.43, 0.66, 1.0) * exp(-x * x) * e * gain, 1.0); }',
  }));
  m.onBeforeRender = (_, __, camera) => { m.rotation.y = Math.atan2(camera.position.x, camera.position.z); m.updateMatrixWorld(); };
  return m;
}

// The flow, drawn the way the page draws it: short ticks, each lying along the fluid's velocity where it is and moving with it.
class Ticks {
  constructor(n, width = 1.3, depthTest = true) {
    this.n = n; this.p = new Float32Array(n * 3); this.age = new Float32Array(n); this.life = new Float32Array(n); this.v = [0, 0, 0];
    const g = new LineSegmentsGeometry().setPositions(new Float32Array(n * 6)).setColors(new Float32Array(n * 6));
    this.seg = g.attributes.instanceStart.data; this.col = g.attributes.instanceColorStart.data;
    this.mesh = new LineSegments2(g, new LineMaterial({ linewidth: width, vertexColors: true, transparent: true, depthWrite: false, depthTest, blending: THREE.AdditiveBlending }));
    this.mesh.frustumCulled = false;
  }
  // flow(x, y, z, v) writes the velocity there into v and returns the tick's tone: 0 is ink, 1 is blue, below 0 means it has
  // left and is put back by spawn(p, j), which writes a position at p[j..j+2]. A tick is as long as the fluid moves in `stretch`
  // seconds, at most `max`. With dt = 0 (motion paused) the ticks hold still and stay drawn.
  step(dt, flow, spawn, stretch, max, gain = 1) {
    const { p, age, life, v } = this, seg = this.seg.array, col = this.col.array;
    for (let i = 0, j = 0, k = 0; i < this.n; i++, j += 3, k += 6) {
      if (age[i] >= life[i]) { spawn(p, j); age[i] = dt ? 0 : 1; life[i] = 2 + 3 * Math.random(); }
      const tone = flow(p[j], p[j + 1], p[j + 2], v);
      if (tone < 0) { life[i] = 0; col.fill(0, k, k + 6); continue; }
      const sp = Math.hypot(v[0], v[1], v[2]), h = sp > 1e-9 ? clamp(stretch, 0.02 / sp, max / sp) / 2 : 0;
      p[j] += v[0] * dt; p[j + 1] += v[1] * dt; p[j + 2] += v[2] * dt; age[i] += dt;
      const f = gain * clamp(Math.min(age[i], life[i] - age[i]) / 0.5, 0, 1) * (0.35 + 0.65 * Math.min(1, sp * stretch / max));
      const r = (INK.r + (BLUE.r - INK.r) * tone) * f, g = (INK.g + (BLUE.g - INK.g) * tone) * f, b = (INK.b + (BLUE.b - INK.b) * tone) * f;
      seg[k] = p[j] - v[0] * h; seg[k + 1] = p[j + 1] - v[1] * h; seg[k + 2] = p[j + 2] - v[2] * h;
      seg[k + 3] = p[j] + v[0] * h; seg[k + 4] = p[j + 1] + v[1] * h; seg[k + 5] = p[j + 2] + v[2] * h;
      col[k] = r * 0.12; col[k + 1] = g * 0.12; col[k + 2] = b * 0.12; col[k + 3] = r; col[k + 4] = g; col[k + 5] = b;   // a dim tail and a bright head
    }
    this.seg.needsUpdate = this.col.needsUpdate = true;
  }
}

// ---- the whirlpool (steps 3 to 6) ----------------------------------------------------------------------
// A vortex along the y axis with a Gaussian core of radius delta: it turns at the rate K (1 - exp(-r^2 / delta^2)) / r^2,
// so its spin (vorticity) is 2 K / delta^2 at the centre and dies off outside the core. With a pull of strength alpha the
// flow also moves in toward the axis and out along it, (-alpha x / 2, alpha y, -alpha z / 2): that is the Burgers vortex.
const K = 0.5, CORE = 0.45, REACH = 2.3, TALL = 1.7;
function whirlpool() {
  const group = new THREE.Group(), ticks = new Ticks(2600), core = glow();
  const want = { delta: CORE, alpha: 0, half: TALL }, now = { ...want };
  let mode = 'spin', wheelR = 2, wheelAt = 0, blown = false;
  // The paddle wheel: four blades in the horizontal plane, one of them blue so its turning can be seen.
  const wheel = new THREE.Group(), blades = [];
  for (let i = 0; i < 4; i++) blades.push(0, 0, 0, 0.2 * Math.cos(i * TAU / 4), 0, 0.2 * Math.sin(i * TAU / 4));
  wheel.add(lines(blades.slice(6), INK, 2.2), lines(blades.slice(0, 6), BLUE, 3), lines([0, -0.16, 0, 0, 0.16, 0], INK, 1.5));
  // The sleeve of step 4: a tube of fluid marked in ink, which gets longer and thinner as it is pulled.
  const cage = [...ring(1, 1, 64), ...ring(1, -1, 64)];
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; cage.push(Math.cos(a), -1, Math.sin(a), Math.cos(a), 1, Math.sin(a)); }
  const sleeve = lines(cage, HAIR, 1.2), balance = lines([...ring(1, 0), ...ring(1, 0.9), ...ring(1, -0.9)], GOLD, 2.2), axis = lines([0, -1, 0, 0, 1, 0], RED, 2.5);
  group.add(core, ticks.mesh, wheel, sleeve, balance, axis);

  const flow = (x, y, z, v) => {
    const r2 = x * x + z * z, d2 = now.delta * now.delta;
    if (r2 > REACH * REACH || Math.abs(y) > now.half) return -1;
    const f = K * (r2 > 1e-6 ? (1 - Math.exp(-r2 / d2)) / r2 : 1 / d2), a = now.alpha;
    v[0] = z * f - a * x / 2; v[1] = a * y; v[2] = -x * f - a * z / 2;
    const sp = Math.hypot(v[0], v[1], v[2]);
    if (sp > 6) { v[0] *= 6 / sp; v[1] *= 6 / sp; v[2] *= 6 / sp; }   // near the blow-up the true speed has no bound; the picture's does
    return Math.exp(-r2 / d2);
  };
  const spawn = (p, j) => { const r = REACH * Math.sqrt(Math.random()), a = Math.random() * TAU; p[j] = r * Math.cos(a); p[j + 1] = (2 * Math.random() - 1) * now.half; p[j + 2] = r * Math.sin(a); };
  return {
    group,
    enter(m) {
      mode = m; blown = false; wheel.visible = m === 'spin'; sleeve.visible = m === 'stretch'; balance.visible = m === 'brake'; axis.visible = false;
      Object.assign(want, { delta: m === 'runaway' ? 0.8 : CORE, alpha: 0, half: TALL });
      return { pos: [3.4, 2.3, 5.4], look: [0, 0, 0] };
    },
    // wheel: its distance from the axis. stretch: how many times longer the whirlpool has been pulled. pull, nu: step 5's two
    // dials. width2: step 6's core width squared, as a fraction of where it started, and blown, once it has reached zero.
    set(q) {
      if (q.wheel !== undefined) wheelR = q.wheel;
      if (q.stretch) { want.delta = CORE / Math.sqrt(q.stretch); want.half = Math.max(TALL, 0.55 * q.stretch + 0.3); sleeve.scale.set(0.95 / Math.sqrt(q.stretch), 0.55 * q.stretch, 0.95 / Math.sqrt(q.stretch)); }
      if (q.pull) { want.delta = 2 * Math.sqrt(q.nu / q.pull); want.alpha = 0.035 * q.pull; }   // the pull is drawn gently, so the swirl still shows
      if (q.width2 !== undefined) { blown = q.blown; want.delta = 0.8 * Math.sqrt(Math.max(q.width2, 1e-4)); want.alpha = blown ? 0 : Math.min(0.025 / Math.max(q.width2, 0.02), 0.2); }
      return want.half;
    },
    update(dt) {
      const e = dt ? Math.min(1, dt * 9) : 1;
      for (const k in want) now[k] += (want[k] - now[k]) * e;
      const spin = 2 * K / (now.delta * now.delta);                // the spin at the centre
      core.visible = !blown; axis.visible = blown; axis.scale.y = now.half;
      core.scale.set(6 * now.delta, 2 * now.half, 1);
      core.material.uniforms.gain.value = Math.min(1.5, 0.3 * Math.sqrt(spin / (2 * K / (CORE * CORE))) + 0.25);
      balance.scale.set(now.delta, 1, now.delta);
      group.scale.setScalar(TALL / now.half);                     // a pulled whirlpool is longer than the view: step back to keep all of it in
      ticks.step(dt, flow, spawn, 0.3, 0.42, blown ? 0.35 : 0.9);
      // The wheel is carried round the axis with the fluid, and turns on its own axle at half the spin where it sits.
      const r2 = wheelR * wheelR, g = Math.exp(-r2 / (now.delta * now.delta));
      wheelAt -= dt * K * (r2 > 1e-6 ? (1 - g) / r2 : 1 / (now.delta * now.delta));
      wheel.position.set(wheelR * Math.cos(wheelAt), 0, wheelR * Math.sin(wheelAt));
      wheel.rotation.y += dt * spin * g / 2;
    },
  };
}

// ---- the can (steps 7 and 8) --------------------------------------------------------------------------
// can.bin is written by bake.py, which documents its layout. It holds this page's solution of the 3D Euler equations in
// Luo and Hou's setting at a few dozen times, twice over: on a wide grid over a quarter of one layer, and in a window that
// shrinks with the collapse (40 by 12 times the thickness lz of the layer of spin on the wall), which is the microscope's view.
const LAYER = 1 / 12, QUARTER = LAYER / 2, LAYERS = 10, HALF_CAN = LAYERS * LAYER / 2;     // a layer is half of Luo and Hou's period L = 1/6
const WIN_W = 2.4, WIN_H = 0.72, WIN_R = 40, WIN_Z = 12;                                  // the window's size on screen, and in units of lz
async function loadCan() {
  const res = await fetch('./can.bin');
  if (!res.ok) throw new Error(`can.bin: ${res.status}`);
  const buf = await res.arrayBuffer(), [magic, ns, wr, wz, mr, mz, nh] = new Uint32Array(buf, 0, 8);
  if (magic !== 0x314e4143) throw new Error('can.bin: not the file this page expects');
  let o = 32;
  const f32 = n => { const a = new Float32Array(buf, o, n); o += 4 * n; return a; };
  const d = f32(wr), z = f32(wz), t = f32(ns), w = f32(ns), lz = f32(ns), hist = f32(2 * nh), bytes = new Uint8Array(buf, o);
  const per = 2 * wr * wz + 3 * mr * mz;
  if (bytes.length !== per * ns) throw new Error('can.bin: wrong length');
  return { ns, wr, wz, mr, mz, d, z, t, w, lz, hist, snap: k => bytes.subarray(k * per, (k + 1) * per) };
}
// Spin as a colour: from the ground through blue to nearly white. The same ramp for the whole can and for the microscope.
// solid: the microscope's picture is a filled pane. The cut through the can is see-through instead, so the fluid behind it shows,
// and it also carries the swirl (attribute b) as a faint wash: bright bands where a layer turns, dark where two layers meet.
const washMaterial = solid => new THREE.ShaderMaterial({
  side: THREE.DoubleSide, uniforms: { solid: { value: solid ? 1 : 0 } }, ...(solid ? {} : { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  vertexShader: `attribute float a; attribute float b; varying float vA; varying float vB;
    void main() { vA = a; vB = b; vec4 p = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
    #endif
      gl_Position = projectionMatrix * modelViewMatrix * p; }`,
  fragmentShader: `uniform float solid; varying float vA; varying float vB;
    void main() { float t = clamp(vA, 0.0, 1.0); vec3 lo = vec3(0.04, 0.055, 0.08) * solid, mid = vec3(0.43, 0.66, 1.0), hi = vec3(0.94, 0.97, 1.0);
      vec3 c = t < 0.72 ? mix(lo, mid, pow(t / 0.72, 1.5)) : mix(mid, hi, (t - 0.72) / 0.28);
      gl_FragColor = vec4(c + vec3(0.93, 0.92, 0.9) * 0.11 * vB * (1.0 - solid), 1.0); }`,
});
// A grid of nx by ny vertices at (xs[i], ys[j], 0), with two numbers per vertex to colour it by.
function sheet(xs, ys) {
  const nx = xs.length, ny = ys.length, pos = new Float32Array(nx * ny * 3), idx = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { pos[(i * ny + j) * 3] = xs[i]; pos[(i * ny + j) * 3 + 1] = ys[j]; }
  for (let i = 0; i < nx - 1; i++) for (let j = 0; j < ny - 1; j++) { const a = i * ny + j; idx.push(a, a + ny, a + 1, a + 1, a + ny, a + ny + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('a', new THREE.BufferAttribute(new Float32Array(nx * ny), 1));
  g.setAttribute('b', new THREE.BufferAttribute(new Float32Array(nx * ny), 1));
  g.setIndex(idx);
  return g;
}
const below = (xs, x) => { let lo = 0, hi = xs.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; } return lo; };   // xs[lo] <= x < xs[lo + 1]

function theCan(ctx) {
  const group = new THREE.Group(), wide = new THREE.Group(), scope = new THREE.Group();
  group.add(wide, scope);
  let D = null, mode = 'wide', k0 = 0, k1 = 0, mix = 0, A = null, B = null, slice = null, pane = null;
  const swirl = new Ticks(2400), drift = new Ticks(900, 1.3, false);

  // The can itself: its two ends in ink, and in red every ring where two layers meet. Those are the rings that blow up;
  // the middle one, which the microscope follows, is drawn brighter.
  wide.add(lines([...ring(1, HALF_CAN), ...ring(1, -HALF_CAN)], HAIR, 1.2));
  const meets = [];
  for (let n = 1 - LAYERS / 2; n < LAYERS / 2; n++) if (n) meets.push(...ring(1, n * LAYER));
  const others = lines(meets, RED, 1), middle = lines(ring(1, 0), RED, 1.8);
  wide.add(others, middle, swirl.mesh);
  // The microscope's frame: the wall in ink, and the blow-up point in red.
  scope.position.set(1, 0, 0);
  scope.add(lines([0, -WIN_H, 0, 0, WIN_H, 0], INK, 1.5), lines([-0.03, -0.03, 0, 0.03, 0.03, 0, -0.03, 0.03, 0, 0.03, -0.03, 0], RED, 3), drift.mesh);
  drift.mesh.position.z = 0.01; drift.mesh.renderOrder = 2;

  const ready = loadCan().then(d => {
    D = d;
    // The whole can: the wide grid, mirrored into every quarter-layer on both sides of the axis. Positions are measured from
    // the corner (the wall at the middle ring), so the slice hangs from the same point as the microscope.
    slice = new THREE.InstancedMesh(sheet(Array.from(d.d, x => -x), Array.from(d.z)), washMaterial(false), 4 * LAYERS);
    const m = new THREE.Matrix4();
    for (let n = -LAYERS, i = 0; n < LAYERS; n++) for (const side of [1, -1]) {
      const up = n % 2 === 0;                                    // odd quarters are the mirror image of even ones
      m.makeScale(side, up ? 1 : -1, 1).setPosition(side === 1 ? 0 : -2, (up ? n : n + 1) * QUARTER, 0);
      slice.setMatrixAt(i++, m);
    }
    slice.frustumCulled = false; slice.position.set(1, 0, 0);
    wide.add(slice);
    // The microscope's view: the window, and its mirror image below the middle ring.
    const xs = Array.from({ length: d.mr }, (_, i) => -WIN_W * i / (d.mr - 1)), ys = Array.from({ length: d.mz }, (_, j) => WIN_H * j / (d.mz - 1));
    pane = new THREE.Mesh(sheet(xs, ys), washMaterial(true));
    const twin = new THREE.Mesh(pane.geometry, pane.material); twin.scale.y = -1;
    scope.add(pane, twin);
    set(0);
    return { ns: d.ns, hist: d.hist };
  }).catch(e => (console.error(e), null));

  // The data at the fractional snapshot k. Returns what the page prints: the time, the largest spin, how far the microscope
  // has zoomed, and a scale bar as [its width in CSS pixels, the length it stands for as a fraction of the can's radius].
  function set(k) {
    const { ns, wr, wz, mr, mz } = D;
    k = clamp(k, 0, ns - 1); k0 = Math.min(Math.floor(k), ns - 2); k1 = k0 + 1; mix = k - k0; A = D.snap(k0); B = D.snap(k1);
    const lw0 = Math.log10(D.w[k0]), lw1 = Math.log10(D.w[k1]), a = slice.geometry.attributes.a, u = slice.geometry.attributes.b, b = pane.geometry.attributes.a;
    // On the wide grid the file holds log10 of the spin from 2 up to that moment's largest; the can paints 2.9 to 5.3 as dark to bright.
    for (let i = 0, n = wr * wz; i < n; i++) {
      a.array[i] = ((2 + A[i] / 255 * (lw0 - 2)) * (1 - mix) + (2 + B[i] / 255 * (lw1 - 2)) * mix - 2.9) / 2.4;
      u.array[i] = (A[n + i] * (1 - mix) + B[n + i] * mix) / 255;
    }
    // In the window it holds the top 1.5 decades below that moment's largest, so the microscope's picture keeps its contrast.
    for (let i = 0, n = mr * mz, o = 2 * wr * wz; i < n; i++) b.array[i] = (A[o + i] * (1 - mix) + B[o + i] * mix) / 255;
    a.needsUpdate = u.needsUpdate = b.needsUpdate = true;
    // Seen whole, the can hardly changes: the growth is on the rings, in a layer soon too thin to see. So the rings carry it,
    // from dim at the start to bright where this page's solution stops.
    const grown = clamp((lw0 * (1 - mix) + lw1 * mix - Math.log10(D.w[0])) / 6.2, 0, 1);
    others.material.color.copy(RED).multiplyScalar(0.25 + 0.45 * grown);
    middle.material.color.copy(RED).lerp(GLARE, 0.55 * grown); middle.material.linewidth = 1.8 + 3.2 * grown;
    const lz = Math.exp(Math.log(D.lz[k0]) * (1 - mix) + Math.log(D.lz[k1]) * mix), per = ctx.perPixel() * lz * WIN_R / WIN_W;
    const len = 10 ** Math.floor(Math.log10(per * 240));          // a power of ten that is between 24 and 240 pixels long
    return { t: D.t[k0] * (1 - mix) + D.t[k1] * mix, w: 10 ** (lw0 * (1 - mix) + lw1 * mix), zoom: D.lz[0] / lz, bar: [len / per, len] };
  }
  // The swirl u1 at distance d from the wall and height y in the can, from the wide grid: bilinear in space, linear in time.
  function swirlAt(d, y) {
    const { wr, wz } = D, m = y / LAYER, n = Math.floor(m), f = m - n, zq = (f <= 0.5 ? f : 1 - f) * LAYER;   // fold into a quarter-layer
    const i = below(D.d, d), j = below(D.z, zq), u = clamp((d - D.d[i]) / (D.d[i + 1] - D.d[i]), 0, 1), v = clamp((zq - D.z[j]) / (D.z[j + 1] - D.z[j]), 0, 1);
    const o = wr * wz + i * wz + j, at = S => (S[o] * (1 - u) + S[o + wz] * u) * (1 - v) + (S[o + 1] * (1 - u) + S[o + wz + 1] * u) * v;
    return (n % 2 === 0 ? 1 : -1) * (at(A) * (1 - mix) + at(B) * mix) / 255;   // each layer turns the other way; 1 is the fastest swirl
  }
  // The can's own flow is almost all swirl: round the axis, one way or the other. Only the half behind the slice is drawn.
  const swirlFlow = (x, y, z, v) => {
    const r = Math.hypot(x, z);
    if (z > 0 || r > 1) return -1;
    const s = 0.75 * swirlAt(1 - r, y + HALF_CAN);
    v[0] = z * s; v[1] = 0; v[2] = -x * s;
    return 0;
  };
  const swirlSpawn = (p, j) => { const r = Math.sqrt(0.3 + 0.7 * Math.random()), a = -Math.random() * Math.PI; p[j] = r * Math.cos(a); p[j + 1] = (2 * Math.random() - 1) * HALF_CAN; p[j + 2] = r * Math.sin(a); };
  // Under the microscope the swirl is into the screen, so the ticks show the slow flow in the slice instead: down the wall
  // from both sides to the middle ring, and away from the wall along it. The file holds it as a fraction of the window's fastest.
  const driftFlow = (x, y, z, v) => {
    if (x > 0 || x < 0.06 - WIN_W || Math.abs(y) > WIN_H) return -1;
    const { wr, wz, mr, mz } = D, fi = -x / WIN_W * (mr - 1), fj = Math.abs(y) / WIN_H * (mz - 1), i = Math.min(fi | 0, mr - 2), j = Math.min(fj | 0, mz - 2), u = fi - i, w = fj - j;
    const at = (S, o) => (S[o + i * mz + j] * (1 - u) + S[o + (i + 1) * mz + j] * u) * (1 - w) + (S[o + i * mz + j + 1] * (1 - u) + S[o + (i + 1) * mz + j + 1] * u) * w;
    const o = 2 * wr * wz + mr * mz, both = q => (at(A, q) * (1 - mix) + at(B, q) * mix - 127.5) / 127.5;
    v[0] = 0.8 * both(o); v[1] = 0.8 * both(o + mr * mz) * Math.sign(y); v[2] = 0;   // the flow toward the axis is the same above and below; the flow along the wall is mirrored
    return 0;
  };
  const driftSpawn = (p, j) => { p[j] = -WIN_W * Math.random(); p[j + 1] = WIN_H * (2 * Math.random() - 1); p[j + 2] = 0; };

  return {
    group, ready, set: k => D ? set(k) : null,
    enter(m) {
      mode = m; wide.visible = m === 'wide'; scope.visible = m === 'scope';
      if (m === 'wide') return { pos: [0.3, 1.0, 3.0], look: [0, -0.02, 0] };
      const dist = Math.max((WIN_W + 0.3) / ctx.across(), (2 * WIN_H + 0.25) / ctx.down());   // far enough back for the whole window
      return { pos: [1 - WIN_W / 2, 0, dist], look: [1 - WIN_W / 2, 0, 0], fixed: true };
    },
    update(dt) {
      if (!D) return;
      if (mode === 'wide') swirl.step(dt, swirlFlow, swirlSpawn, 0.36, 0.3, 1); else drift.step(dt, driftFlow, driftSpawn, 0.22, 0.2, 0.8);
    },
  };
}

// ---- the announced blow-up (step 9): a sketch ------------------------------------------------------------
// Drawn from the description in Alpöge and Buckmaster's paper of 20 Nov 2026 (section 1.1, appendix C), not from its data,
// which has not been released. What is taken from the paper: the spin sits in a column about an axis and, on either side of a
// plane, in a layer divided into nineteen spiral arms that end in nineteen vortices; the swirl has opposite signs on the two
// sides; the half below is the half above turned over; and in the variables s = log(T / (T - t)), y = x / sqrt(T - t) the
// picture has period S of about 0.36, turning 1/19 of a circle in each period. So lengths shrink like e^(-s/2), and a point
// on an arm that stays put in space traces r = r0 exp(-kappa phi) with kappa = 19 S / (4 pi). The shapes are schematic.
const PERIOD = 0.36, ARMS = 19, KAPPA = ARMS * PERIOD / (2 * TAU);
function announced() {
  const group = new THREE.Group(), pattern = new THREE.Group(), trails = new THREE.Group(), ticks = new Ticks(1500), core = glow();
  const at = (r, phi, y) => [r * Math.cos(phi), y, -r * Math.sin(phi)];        // so that turning the group by +theta about y adds theta to phi
  function layer() {
    const g = new THREE.Group(), arms = [], ends = [];
    for (let m = 0; m < ARMS; m++) {
      const p0 = m * TAU / ARMS;
      for (let i = 0; i < 28; i++) {                                           // from the column out to radius 1.6, along the spiral
        const ra = 0.5 * (1.6 / 0.5) ** (i / 28), rb = 0.5 * (1.6 / 0.5) ** ((i + 1) / 28);
        arms.push(...at(ra, p0 - Math.log(ra) / KAPPA, 0.24), ...at(rb, p0 - Math.log(rb) / KAPPA, 0.24));
      }
      const c = at(1.72, p0 - Math.log(1.6) / KAPPA - 0.05, 0.24);             // and the vortex each arm ends in
      for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, b = (i + 1) / 14 * TAU; ends.push(c[0] + 0.085 * Math.cos(a), c[1], c[2] + 0.085 * Math.sin(a), c[0] + 0.085 * Math.cos(b), c[1], c[2] + 0.085 * Math.sin(b)); }
    }
    g.add(lines(arms, BLUE, 2), lines(ends, BLUE, 1.4));
    return g;
  }
  const upper = layer(), lower = layer(), under = new THREE.Group().add(lower);
  under.rotation.x = Math.PI;                                                  // the half below is the half above, turned over
  core.scale.set(6 * 0.3, 3.4, 1);
  pattern.add(upper, under, core, ticks.mesh);
  // The tracks the arms are reeled in along. They stay put in space, so far from the point the flow is already frozen.
  const track = [];
  for (let m = 0; m < ARMS; m++) for (let i = 0; i < 90; i++) {
    const ra = 0.03 * (40 / 0.03) ** (i / 90), rb = 0.03 * (40 / 0.03) ** ((i + 1) / 90), p0 = m * TAU / ARMS;
    track.push(...at(ra, p0 - Math.log(ra) / KAPPA, 0.24), ...at(rb, p0 - Math.log(rb) / KAPPA, 0.24));
  }
  const faint = HAIR.clone().multiplyScalar(0.45), over = lines(track, faint, 1), turned = new THREE.Group().add(lines(track, faint, 1));
  turned.rotation.x = Math.PI;
  trails.add(over, turned);
  group.add(pattern, trails, lines([-0.05, 0, 0, 0.05, 0, 0, 0, -0.05, 0, 0, 0.05, 0, 0, 0, -0.05, 0, 0, 0.05], RED, 3));
  let speed = 1;
  // The sketch's flow: swirl one way above the plane and the other way below, fastest near the column.
  const flow = (x, y, z, v) => {
    const r2 = x * x + z * z;
    if (r2 > 4.4 || Math.abs(y) > 1.5) return -1;
    const f = speed * 0.55 * Math.sign(y) / (r2 + 0.25);
    v[0] = z * f; v[1] = 0; v[2] = -x * f;
    return Math.exp(-r2 / 0.09);
  };
  const spawn = (p, j) => { const r = 2.1 * Math.sqrt(Math.random()), a = Math.random() * TAU; p[j] = r * Math.cos(a); p[j + 1] = 3 * Math.random() - 1.5; p[j + 2] = r * Math.sin(a); };
  return {
    group,
    enter: () => ({ pos: [2.6, 2.5, 4.1], look: [0, -0.1, 0] }),
    // s = log(T / (T - t)). pace: zoom in as fast as the picture shrinks, so that only its turning shows.
    set(s, pace) {
      const shrink = Math.exp(-s / 2);
      pattern.scale.setScalar(pace ? 1 : shrink); trails.scale.setScalar(pace ? 1 / shrink : 1);
      upper.rotation.y = lower.rotation.y = TAU / ARMS * s / PERIOD;
      speed = pace ? 1 : Math.min(1 / shrink, 12);                             // the fluid's speed grows like 1 / sqrt(time left)
    },
    update(dt) { ticks.step(dt, flow, spawn, 0.2, 0.3, 0.8); },
  };
}

// ---- the view -----------------------------------------------------------------------------------------
// Starts the 3D view on a canvas. quiet() is true while motion is paused; panel is the step card, which the scene is framed
// clear of; backdrop() makes the ground behind the scene (astral.js). Returns { run, show, tube, can, nested }. Throws where
// WebGL is unavailable.
export function start(canvas, { quiet, panel, backdrop }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x0b0d11);
  const ground = backdrop();
  const scene = new THREE.Scene().add(ground.mesh), camera = new THREE.PerspectiveCamera(36, 1, 0.05, 400), controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.enablePan = false;
  const free = { w: 1, h: 1 }, tan = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const ctx = {
    across: () => 2 * tan() * free.w / free.h, down: () => 2 * tan(),          // how much of a plane one unit away the clear part of the view shows
    perPixel: () => 2 * tan() * camera.position.distanceTo(controls.target) / free.h,   // world units per CSS pixel, at the point looked at
  };
  const scenes = { tube: whirlpool(), can: theCan(ctx), nested: announced() };
  for (const s of Object.values(scenes)) { s.group.visible = false; scene.add(s.group); }
  let current = null, mode = null, fly = null, last = 0;

  function aim(jump) {
    if (!current) return;
    const p = current.enter(mode), pos = new THREE.Vector3(...p.pos), look = new THREE.Vector3(...p.look);
    controls.enableRotate = controls.enableZoom = !p.fixed;
    const d = pos.distanceTo(look); controls.minDistance = d * 0.5; controls.maxDistance = d * 2.2;
    if (jump || quiet() || !last) { camera.position.copy(pos); controls.target.copy(look); fly = null; }
    else fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: look, at: performance.now() };
  }
  // The step bar runs along the top, and the card is a column down the left, or on a narrow screen a sheet along the bottom.
  // The scene is centred in what is left: under the bar, and to the right of the card or above it.
  const BAR = 46;
  function resize() {
    const W = innerWidth, H = innerHeight, beside = panel.offsetWidth < W - 8;
    const dock = beside ? 0 : panel.offsetHeight, off = beside ? panel.offsetWidth : 0;
    free.w = W - off; free.h = Math.max(H - dock - BAR, H / 4);
    renderer.setSize(W, H, false);
    camera.fov = 2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(18)) * Math.max(1, 1.25 * free.h / free.w)));   // narrow screens look wider
    camera.setViewOffset(free.w, free.h, -off, -BAR, W, H);
    if (current && mode === 'scope') aim(true);                                // the microscope's distance depends on the view's shape
  }
  addEventListener('resize', resize);
  new ResizeObserver(resize).observe(panel);
  resize();

  function frame(t) {
    const dt = quiet() || !last ? 0 : Math.min((t - last) / 1000, 0.05);
    last = t;
    if (fly) {
      const u = Math.min((t - fly.at) / 1100, 1), e = u * u * (3 - 2 * u);
      camera.position.lerpVectors(fly.p0, fly.p1, e); controls.target.lerpVectors(fly.t0, fly.t1, e);
      if (u === 1) fly = null;
    }
    current?.update(dt);
    ground.tick(dt);
    controls.update();
    renderer.render(scene, camera);
  }
  return {
    tube: scenes.tube, can: scenes.can, nested: scenes.nested,
    run(on) { renderer.setAnimationLoop(on ? frame : null); if (!on) last = 0; },
    // Puts one scene on screen, in one of its modes, and moves the camera to where that mode is seen from.
    show(name, m) {
      const same = current === scenes[name];
      for (const s of Object.values(scenes)) s.group.visible = s === scenes[name];
      current = scenes[name]; mode = m;
      aim(!same);
      resize();
    },
  };
}
