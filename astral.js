import * as THREE from 'three';

// Two things: the ground every picture on the site sits on, and the first screen's picture.
// The ground is a wind tunnel's: dark, with thin lines of smoke carried across it from left to right, straight where they
// come in and wavier the further downstream. It is drawn in the ink's own grey, because smoke lines are the flow made
// visible, and it keeps clear of the colours that mean something on the page.
// The picture is a stretched whirlpool drawn as its streamlines: ribbons that spiral in along a plane and leave along the
// axis. It is the Burgers vortex, the exact solution step 5 names, and every ribbon is a stretch of one of its streamlines,
// worked out in the vertex shader from the solution's formula. Its colours are the page's: blue where the spin is, and
// gold in the core, whose width viscosity sets.

const TAU = 2 * Math.PI, f = x => x.toFixed(4);

// ---- the smoke ---------------------------------------------------------------------------------------------
// One triangle over the whole view, coloured by where it is on screen and not by the camera, so the first screen's canvas
// and the 3D steps' canvas show the same ground. They share one clock too: DRIFT, in seconds.
const DRIFT = { value: 0 };
export function backdrop() {
  const res = new THREE.Vector2(1, 1);
  const mesh = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)), new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, uniforms: { uTime: DRIFT, uRes: { value: res } },
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }',
    fragmentShader: `
      uniform float uTime; uniform vec2 uRes;
      float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float noise(vec2 x) {
        vec2 i = floor(x), u = fract(x); u = u * u * (3.0 - 2.0 * u);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      void main() {
        vec2 uv = gl_FragCoord.xy / uRes, p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
        // The ground: a soft light on the wall behind where the pictures stand, falling off into the dark.
        vec3 col = mix(vec3(0.074, 0.082, 0.100), vec3(0.026, 0.029, 0.037), smoothstep(0.0, 1.05, length(p - vec2(0.3, 0.08))));
        // The smoke. Everything is carried downstream at one speed; the lines waver more the further they have come.
        float x = p.x - uTime * 0.035, far = smoothstep(-0.9, 0.9, p.x);
        float y = p.y + (0.015 + 0.085 * far) * (noise(vec2(x * 1.4, p.y * 1.6)) - 0.5) * 2.0 + 0.022 * far * far * (noise(vec2(x * 5.0, p.y * 5.0 + 3.0)) - 0.5);
        float k = y * 13.0, id = floor(k), off = fract(k) - 0.5;
        float lit = smoothstep(0.3, 0.8, noise(vec2(x * 0.8 + id * 7.3, id * 1.7))) * (0.45 + 0.55 * hash(vec2(id, 3.0)));   // each line comes and goes along its length
        col += vec3(0.80, 0.83, 0.88) * lit * (0.15 * exp(-off * off * 2600.0) + 0.04 * exp(-off * off * 60.0));   // a thread, and the haze round it
        col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;   // a grain, so the dark gradient does not band
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  mesh.frustumCulled = false; mesh.renderOrder = -10;
  mesh.onBeforeRender = renderer => renderer.getDrawingBufferSize(res);
  return { mesh, tick(dt) { DRIFT.value += dt; } };
}

// ---- the whirlpool -----------------------------------------------------------------------------------------
// The Burgers vortex about the y axis, in the picture's own units. A pull of strength A moves fluid in toward the axis at
// A r / 2 and out along it at A y, and the fluid turns at the rate K (1 - exp(-r^2 / D2)) / r^2, where D2 is the core's
// radius squared. So a bit of fluid that starts at the rim, at height y0, is after a time t at
//   r = rim exp(-A t / 2),   y = y0 exp(A t),   angle = where it started + wind(r) - wind(rim),
// where wind(r) = TURN ((1 - exp(-u)) / u + E1(u)), u = r^2 / D2, is the integral of the turning rate along the way in,
// and TURN = K / (A D2) is how fast the core turns compared with the pull. E1 is the exponential integral.
const CORE = 0.5, RIM = 3.3, PULL = 0.22, TURN = 24, TOP = 2.6;   // the core's radius, the rim's, the pull (per second), TURN, and the height at which a ribbon ends
const FLOW = `
  const float D2 = ${f(CORE * CORE)}, A = ${f(PULL)}, K = ${f(TURN * PULL * CORE * CORE)};
  // Abramowitz and Stegun 5.1.53 and 5.1.56. Checked against the integral itself: within 2 parts in 10 million.
  float e1(float x) {
    if (x < 1.0) return -log(x) - 0.57721566 + x * (0.99999193 + x * (-0.24991055 + x * (0.05519968 + x * (-0.00976004 + x * 0.00107857))));
    return exp(-x) / x * (0.2677737343 + x * (8.6347608925 + x * (18.0590169730 + x * (8.5733287401 + x)))) / (3.9584969228 + x * (21.0996530827 + x * (25.6329561486 + x * (9.5733223454 + x))));
  }
  float wind(float r2) { float u = r2 / D2; return ${f(TURN)} * ((1.0 - exp(-u)) / u + e1(u)); }`;

function makeWhirlpool(lite) {
  const n = lite ? 170 : 340, SEG = lite ? 56 : 88, SIDES = 6;
  // One ribbon, as a strip: position.x is how far along it a vertex is (0 the tail, 1 the head), position.y the angle round it.
  const strip = [], index = [];
  for (let i = 0; i <= SEG; i++) for (let j = 0; j <= SIDES; j++) strip.push(i / SEG, j / SIDES * TAU, 0);
  for (let i = 0; i < SEG; i++) for (let j = 0; j < SIDES; j++) { const a = i * (SIDES + 1) + j, b = a + SIDES + 1; index.push(a, b, a + 1, a + 1, b, b + 1); }
  // One seed per ribbon: the angle it starts at, the height it starts at (its sign is the way it leaves; the nearer the
  // plane, the closer to the axis it ends up), where in its life it is, and a random number for everything else.
  const seed = new Float32Array(n * 4);
  for (let k = 0; k < n; k++) seed.set([Math.random() * TAU, (k % 2 ? 1 : -1) * 0.0004 * 500 ** Math.random(), Math.random(), Math.random()], k * 4);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(strip, 3)); geo.setIndex(index);
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  geo.instanceCount = n;
  const U = { uTime: { value: 60 }, uDim: { value: 1 } };
  const ribbons = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    side: THREE.DoubleSide, uniforms: U,
    vertexShader: `
      attribute vec4 aSeed; uniform float uTime; varying vec3 vN, vCol, vAt;
      ${FLOW}
      void main() {
        float rnd = aSeed.w, rim = ${f(RIM)} * (0.7 + 0.3 * fract(rnd * 7.31)), y0 = aSeed.y, len = 3.0 + 4.6 * fract(rnd * 3.17);
        float life = log(${f(TOP)} / abs(y0)) / A + len;                         // from the rim to the top, and its own length more
        float t = mod(aSeed.z * life + uTime, life) - len * (1.0 - position.x), tc = max(t, 0.0);
        float r = rim * exp(-0.5 * A * tc), y = y0 * exp(A * tc), r2 = r * r, th = aSeed.x + wind(r2) - wind(rim * rim);
        vec3 er = vec3(cos(th), 0.0, sin(th)), et = vec3(-er.z, 0.0, er.x), up = vec3(0.0, 1.0, 0.0);
        float ur = -0.5 * A * r, uy = A * y, ut = K * (1.0 - exp(-r2 / D2)) / r;   // the velocity there: inward, along the axis, and round it
        vec3 along = normalize(ur * er + uy * up + ut * et), flat_ = normalize(uy * er - ur * up), side = cross(along, flat_);
        float q = r / ${f(CORE)};
        // A ribbon is wide and flat where the flow is slow and broad, and a thin thread in the core. It tapers to nothing at
        // both ends, where it is born at the rim, and where it leaves at the top.
        float wide = (0.014 + 0.034 * smoothstep(0.6, 4.5, q)) * (0.65 + 0.7 * fract(rnd * 5.77));
        wide *= pow(sin(3.14159 * position.x), 0.55) * smoothstep(0.0, 0.6, t) * (1.0 - smoothstep(0.6, 1.0, abs(y) / ${f(TOP)}));
        vec3 n = cos(position.y) * flat_ + 0.42 * sin(position.y) * side;       // the normal of an ellipse 0.42 times as thick as it is wide
        vec3 p = r * er + y * up + wide * (0.42 * cos(position.y) * flat_ + sin(position.y) * side);
        vec3 c = mix(vec3(0.99, 0.68, 0.24), vec3(0.15, 0.25, 0.78), smoothstep(0.42, 0.8, q));
        c = mix(c, vec3(0.22, 0.47, 0.98), smoothstep(0.8, 1.7, q));
        c = mix(c, vec3(0.16, 0.74, 0.86), smoothstep(1.9, 3.6, q));
        c = mix(c, vec3(0.74, 0.94, 0.95), 0.55 * smoothstep(4.5, 8.0, q));
        vCol = c * (0.78 + 0.44 * fract(rnd * 11.7));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalMatrix * n; vAt = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uDim; varying vec3 vN, vCol, vAt;
      void main() {
        vec3 N = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0), V = normalize(-vAt), L = normalize(vec3(0.3, 0.9, 0.45));   // lit from above
        float lit = 0.5 + 0.5 * dot(N, L), shine = pow(max(dot(N, normalize(L + V)), 0.0), 42.0), edge = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        vec3 col = vCol * (0.22 + 0.9 * lit * lit) + vec3(0.9, 0.97, 1.0) * shine * 0.5 + vCol * edge * 0.45;
        col = mix(col, vec3(0.04, 0.045, 0.055), 0.8 * smoothstep(7.0, 14.0, -vAt.z));   // the far side falls back into the dark
        gl_FragColor = vec4(col * uDim, 1.0);
      }`,
  }));
  ribbons.frustumCulled = false;
  // A soft light round the core.
  const c = document.createElement('canvas'), ctx = c.getContext('2d');
  c.width = c.height = 128;
  const soft = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [at, a] of [[0, 1], [0.15, 0.5], [0.4, 0.14], [0.7, 0.03], [1, 0]]) soft.addColorStop(at, `rgb(255 255 255 / ${a})`);
  ctx.fillStyle = soft; ctx.fillRect(0, 0, 128, 128);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color: 0x223a5c, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
  halo.scale.set(8, 9, 1); halo.renderOrder = -5;
  const group = new THREE.Group().add(halo, ribbons);
  return { group, time: U.uTime, dim: U.uDim };
}

// Starts the ground and the whirlpool on a canvas and returns { run(on, pool), kick() }. quiet() is true while motion is
// paused: everything then holds still. notes is an <svg> of <g><line><text> pairs, the labels pinned to the picture.
// Throws where WebGL is unavailable.
const NOTES = [[[-2.3, 0.05, -1.0], [-0.1, -0.2]], [[0.12, 1.75, 0], [0.11, -0.1]]];   // where on the whirlpool each label points, and where its words sit from there, as fractions of the view's height
export function startHero(canvas, { quiet, notes }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const lite = Math.min(innerWidth, innerHeight) < 600;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  const ground = backdrop(), pool = makeWhirlpool(lite), v = new THREE.Vector3();
  scene.add(ground.mesh, pool.group);
  pool.group.rotation.z = 0.1;                                 // the axis leans a little
  let last = 0, on = false, px = 0, py = 0, ex = 0, ey = 0;

  // Beside the words on a wide screen, above them on a narrow one.
  function resize() {
    const W = innerWidth, H = innerHeight, wide = W >= 900;
    renderer.setSize(W, H, false);
    camera.fov = wide ? 36 : 60;
    camera.setViewOffset(W, H, wide ? -0.215 * W : 0, wide ? 0 : 0.2 * H, W, H);
  }
  function frame(now) {
    const dt = last && !quiet() ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    ground.tick(dt); pool.time.value += dt;
    ex += (px - ex) * 0.04; ey += (py - ey) * 0.04;            // the view leans a little toward the pointer
    camera.position.set(9.4 * Math.sin(0.3 * ex), 3.1 + 1.1 * ey, 9.4 * Math.cos(0.3 * ex));
    camera.lookAt(0, -0.05, 0);
    renderer.render(scene, camera);
    if (pool.group.visible) NOTES.forEach(([at, off], k) => {
      v.fromArray(at).applyMatrix4(pool.group.matrixWorld).project(camera);
      const H = innerHeight, x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * H, [line, text] = notes.children[k].children;
      line.setAttribute('x1', x); line.setAttribute('y1', y); line.setAttribute('x2', x + off[0] * H); line.setAttribute('y2', y + off[1] * H);
      text.setAttribute('x', x + off[0] * H + Math.sign(off[0]) * 8); text.setAttribute('y', y + off[1] * H - 2);
    });
    if (quiet() && Math.abs(px - ex) + Math.abs(py - ey) < 1e-3) { renderer.setAnimationLoop(null); last = 0; }   // nothing left to move: stop drawing
  }
  const kick = () => { if (on) renderer.setAnimationLoop(frame); };
  addEventListener('pointermove', e => { px = e.clientX / innerWidth * 2 - 1; py = e.clientY / innerHeight * 2 - 1; kick(); }, { passive: true });
  addEventListener('resize', () => { resize(); kick(); });
  resize();
  // withPool: whether the whirlpool is drawn. On the steps that have no 3D view the ground is there alone.
  return { kick, run(go, withPool = true) { on = go; pool.group.visible = withPool; last = 0; renderer.setAnimationLoop(go ? frame : null); } };
}
