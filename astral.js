import * as THREE from 'three';

// The first screen's picture: a whirlpool of light in a night sky, pulled thinner and faster until it breaks, and then it
// starts again. It is the headline, drawn, and it stands for nothing more: nothing here is computed from the equations.
// The shape is the flow step 5 names (the Burgers vortex): motes spiral in along a plane and leave along the axis.
// The sky (a nebula, stars that twinkle, a shooting star now and then) is adapted from Zeta World's guide/astral.js, so the
// two sites share one night. Like that sky it keeps clear of the colours that mean something on the page, except in the
// whirlpool itself: its core is blue because blue is spin, and the break is red because red is the blow-up.

const TAU = Math.PI * 2, R_SKY = 300;
const BAND = new THREE.Vector3(0.5, 0.82, 0.28).normalize();   // the nebula's bright band is the great circle with this normal
const NOISE = `
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int k = 0; k < OCTAVES; k++) { s += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }`;
const DISC = 'float a = smoothstep(1.0, 0.0, length(gl_PointCoord - 0.5) * 2.0);';   // a soft round point
const far = { depthWrite: false, depthTest: false };
// A round glow, with four thin rays if asked: the picture behind the whirlpool's halo and the brightest stars.
function flare(rays) {
  const c = document.createElement('canvas'), ctx = c.getContext('2d');
  c.width = c.height = 128;
  const soft = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [at, a] of [[0, 1], [0.1, 0.6], [0.3, 0.16], [0.6, 0.04], [1, 0]]) soft.addColorStop(at, `rgb(255 255 255 / ${a})`);
  ctx.fillStyle = soft; ctx.fillRect(0, 0, 128, 128);
  for (let turn = 0; rays && turn < 2; turn++) {
    const ray = ctx.createLinearGradient(0, 0, 128, 0);
    for (const [at, a] of [[0, 0], [0.5, 0.9], [1, 0]]) ray.addColorStop(at, `rgb(255 255 255 / ${a})`);
    ctx.save(); ctx.translate(64, 64); ctx.rotate(turn * Math.PI / 2); ctx.translate(-64, -64); ctx.fillStyle = ray; ctx.fillRect(0, 63, 128, 2); ctx.restore();
  }
  return new THREE.CanvasTexture(c);
}

// The sky: { group, update(seconds) }. It is centred on the camera, so it is infinitely far away. `lite` is for small screens.
function makeSky(lite) {
  const group = new THREE.Group(), clock = { value: 0 }, stars = lite ? 1400 : 3200;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R_SKY, 48, 24), new THREE.ShaderMaterial({
    ...far, side: THREE.BackSide, defines: { OCTAVES: lite ? 4 : 5 },
    uniforms: { uTime: clock, uBand: { value: BAND }, uGround: { value: new THREE.Color(0x0d1117) }, uA: { value: new THREE.Color(0x2b1f5c) }, uB: { value: new THREE.Color(0x0c3340) }, uC: { value: new THREE.Color(0x4a2148) } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float uTime; uniform vec3 uBand, uGround, uA, uB, uC; varying vec3 vDir;
      ${NOISE}
      void main() {
        vec3 d = normalize(vDir);
        float off = dot(d, uBand), band = exp(-off * off / 0.09);
        vec3 q = d * 2.3 + vec3(0.0, uTime * 0.004, 0.0);
        float n1 = fbm(q), n2 = fbm(q * 2.1 + n1 * 1.9 + 3.0);
        vec3 col = uGround;
        col += uA * smoothstep(0.38, 0.8, n2) * (0.3 + 1.1 * band);
        col += uB * smoothstep(0.42, 0.85, n1) * (0.5 + 0.5 * band);
        col += uC * band * band * smoothstep(0.3, 0.75, n2 * n1 * 2.2);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  dome.renderOrder = -3;

  // More stars along the band, most of them faint, a few large. Each twinkles at its own pace.
  const at = new Float32Array(stars * 3), size = new Float32Array(stars), phase = new Float32Array(stars), tint = new Float32Array(stars * 3);
  const v = new THREE.Vector3(), c = new THREE.Color();
  for (let k = 0; k < stars; k++) {
    do v.randomDirection(); while (Math.random() > 0.3 + 0.7 * Math.exp(-(v.dot(BAND) ** 2) / 0.06));
    v.multiplyScalar(R_SKY * 0.95).toArray(at, k * 3);
    const big = Math.random() ** 7;
    size[k] = 1.1 + 3.4 * big; phase[k] = Math.random();
    c.setHSL([0.6, 0.62, 0.08, 0.72][k % 4], 0.5 * Math.random(), 0.72 + 0.2 * Math.random()).multiplyScalar(0.35 + 0.65 * Math.max(big, Math.random() ** 2)).toArray(tint, k * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(at, 3)); geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1)); geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({
    ...far, transparent: true, blending: THREE.AdditiveBlending, uniforms: { uTime: clock, uDpr: { value: Math.min(devicePixelRatio, 2) } },
    vertexShader: `
      attribute float aSize, aPhase; attribute vec3 aTint; uniform float uTime, uDpr; varying vec3 vTint;
      void main() {
        vTint = aTint * (0.7 + 0.3 * sin(uTime * (0.5 + 2.2 * fract(aPhase * 7.13)) + aPhase * 6.2832));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uDpr;
      }`,
    fragmentShader: `varying vec3 vTint; void main() { ${DISC} gl_FragColor = vec4(vTint * a * a, 1.0);
      #include <colorspace_fragment>
      }`,
  }));
  points.renderOrder = -2; points.frustumCulled = false;

  // A shooting star: one line, bright at its head and nothing at its tail, that crosses a little of the sky in under a second.
  const streak = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)).setAttribute('color', new THREE.BufferAttribute(new Float32Array(6), 3)),
    new THREE.LineBasicMaterial({ ...far, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending }));
  streak.renderOrder = -1; streak.frustumCulled = false; streak.visible = false;
  const from = new THREE.Vector3(), along = new THREE.Vector3(), P = streak.geometry.attributes.position, C = streak.geometry.attributes.color;
  let next = 2.5, born = -1;

  // A few stars near enough to have rays. They sit ahead of the camera, where the first screen looks.
  const rayed = new THREE.SpriteMaterial({ map: flare(true), transparent: true, blending: THREE.AdditiveBlending, ...far });
  const bright = Array.from({ length: lite ? 4 : 9 }, (_, k) => {
    const star = new THREE.Sprite(rayed.clone());
    star.position.set(Math.random() * 2 - 1, Math.random() * 1.1 - 0.35, -0.6 - Math.random() * 0.6).normalize().multiplyScalar(R_SKY * 0.9);
    star.material.color.setHSL([0.6, 0.08, 0.72][k % 3], 0.35, 0.8);
    star.userData = { size: R_SKY * (0.03 + 0.045 * Math.random()), pace: 0.6 + 1.5 * Math.random(), at: Math.random() * TAU };
    star.renderOrder = -2;
    return star;
  });
  group.add(dome, points, streak, ...bright);
  return {
    group,
    update(seconds) {
      clock.value = seconds;
      points.rotation.y = seconds * 0.002;
      for (const b of bright) b.scale.setScalar(b.userData.size * (0.8 + 0.2 * Math.sin(seconds * b.userData.pace + b.userData.at)));
      if (born < 0 && seconds > next) {               // start one somewhere ahead and above, heading any way across the sky
        born = seconds;
        from.set(Math.random() * 2 - 1, Math.random() * 0.9 - 0.1, -0.5 - Math.random()).normalize();
        along.randomDirection().cross(from).normalize();
      }
      if (born >= 0) {
        const u = (seconds - born) / 0.8, glow = Math.sin(Math.PI * Math.min(u, 1));
        v.copy(from).addScaledVector(along, 0.3 * u).normalize().multiplyScalar(R_SKY * 0.9).toArray(P.array, 0);
        v.copy(from).addScaledVector(along, 0.3 * Math.max(0, u - 0.3)).normalize().multiplyScalar(R_SKY * 0.9).toArray(P.array, 3);
        C.array.fill(glow, 0, 3); P.needsUpdate = C.needsUpdate = true;
        streak.visible = u < 1;
        if (u >= 1) { born = -1; next = seconds + 4 + 7 * Math.random(); }
      }
    },
  };
}

// The whirlpool: motes on four spiral arms, each on its way in from the rim to the axis and then out along it, all of it
// worked out in the vertex shader from one seed per mote. uStretch is how far it has been pulled: 1 at rest. The pull makes it
// taller and thinner, winds the arms tighter and brightens the core. uFlash is 1 at the instant it breaks and fades from there.
const ROUT = 3.0, CORE = 0.36, TALL = 1.5, ARMS = 4, CYCLE = 15, TOP = 6;   // CYCLE: seconds from rest to the break and back. TOP: the stretch at the break
function makeWhirlpool(lite) {
  const group = new THREE.Group(), n = lite ? 7000 : 17000, seed = new Float32Array(n * 4);
  for (let k = 0; k < n; k++) {
    const arm = Math.random() < 0.72;
    seed[k * 4] = Math.random();                                                       // how far along its way in it starts
    seed[k * 4 + 1] = arm ? (Math.floor(Math.random() * ARMS) + (Math.random() + Math.random() + Math.random() - 1.5) * 0.2) * TAU / ARMS : Math.random() * TAU;
    seed[k * 4 + 2] = (Math.random() * 2 - 1) * (Math.random() < 0.5 ? 1 : 0.4);       // which way along the axis it leaves, and how far
    seed[k * 4 + 3] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const U = { uTime: { value: 0 }, uStretch: { value: 1 }, uFlash: { value: 0 }, uDim: { value: 1 }, uDpr: { value: Math.min(devicePixelRatio, 2) } };
  const motes = new THREE.Points(geo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, uniforms: U,
    vertexShader: `
      attribute vec4 aSeed; uniform float uTime, uStretch, uFlash, uDim, uDpr; varying vec3 vCol;
      void main() {
        float s = uStretch, life = fract(aSeed.x + uTime * (0.02 + 0.02 * aSeed.w));
        float rim = ${ROUT.toFixed(1)} / pow(s, 0.3), d2 = ${(CORE * CORE).toFixed(4)} / s, tall = ${TALL.toFixed(1)} * (0.55 + 0.45 * s);
        float r = rim * exp(-3.4 * pow(life, 1.6));                                // in toward the axis, slowly at first,
        float th = aSeed.y + 0.5 * s * (1.0 / (r * r + d2) - 1.0 / (rim * rim + d2)) + uTime * 0.05;   // winding as it goes,
        float y = aSeed.z * tall * 0.3 * d2 / (r * r + 0.3 * d2);                   // and out along the axis at the end
        vec3 p = vec3(r * cos(th), y + 0.05 * (aSeed.w - 0.5) * r, r * sin(th));
        float core = exp(-r * r / (5.0 * d2)), fade = smoothstep(0.0, 0.05, life) * (1.0 - smoothstep(0.7, 1.0, abs(y) / tall));
        vec3 ink = mix(vec3(0.93, 0.92, 0.9), vec3(1.0, 0.86, 0.7), fract(aSeed.w * 5.3) * 0.6);   // starlight, some of it warm
        vCol = mix(ink * (0.34 + 0.6 * pow(aSeed.w, 3.0)), vec3(0.3, 0.5, 0.95), core) * fade * uDim * (1.0 + 0.35 * (s - 1.0) * core);
        vCol = mix(vCol, vec3(1.0, 0.45, 0.38) * fade * uDim * 1.6, uFlash * (0.25 + 0.75 * core));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uDpr * (1.5 + 2.8 * pow(aSeed.w, 9.0) + 0.9 * core) * (1.0 + uFlash) * 7.5 / -mv.z;
      }`,
    fragmentShader: `varying vec3 vCol; void main() { ${DISC} gl_FragColor = vec4(vCol * a * a, 1.0);
      #include <colorspace_fragment>
      }`,
  }));
  motes.frustumCulled = false;
  // The core's glow: a card that turns about the axis to face the camera, blue with a white-hot middle that the pull brings out.
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uHot: { value: 0 }, uFlash: U.uFlash, uDim: U.uDim },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uHot, uFlash, uDim; varying vec2 vUv;
      void main() {
        float x = (vUv.x - 0.5) * 8.0, e = smoothstep(0.0, 0.42, vUv.y) * smoothstep(1.0, 0.58, vUv.y);
        vec3 col = vec3(0.3, 0.52, 1.0) * exp(-x * x) * 0.42 + vec3(0.85, 0.93, 1.0) * exp(-x * x * 14.0) * (0.08 + 0.7 * uHot);
        gl_FragColor = vec4(mix(col, vec3(1.0, 0.5, 0.42) * (exp(-x * x) + exp(-x * x * 14.0)), uFlash) * e * uDim, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  // The break: a ring of light that spreads through the plane of the whirlpool.
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.975, 1, 128).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd9d2, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: flare(false), color: 0x3a4ea8, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
  halo.scale.setScalar(7.5);
  group.add(halo, glow, motes, ring);
  return {
    group, dim: U.uDim,
    // phase runs from 0 to 1 over one cycle: the pull runs away over the first four fifths, then the break, then rest.
    update(seconds, phase, camera) {
      const u = Math.min(phase / 0.8, 1), after = Math.max(phase - 0.8, 0) / 0.2;
      const s = phase < 0.8 ? 1 / (1 - (1 - 1 / TOP) * u ** 1.6) : 1 + (TOP - 1) * (1 - after) ** 3;   // slowly, then all at once
      U.uTime.value = seconds; U.uStretch.value = s; U.uFlash.value = phase < 0.8 ? 0 : Math.exp(-5 * after);
      glow.scale.set(8 * CORE / Math.sqrt(s), 2.9 * TALL * (0.55 + 0.45 * s), 1);
      glow.rotation.y = Math.atan2(camera.position.x, camera.position.z);
      glow.material.uniforms.uHot.value = (s - 1) / (TOP - 1);
      ring.scale.setScalar(0.2 + 3.3 * (1 - (1 - after) ** 3)); ring.material.opacity = phase < 0.8 ? 0 : 0.7 * (1 - after) ** 2 * U.uDim.value;
    },
  };
}

// Starts the picture on a canvas and returns { run(on), kick() }. quiet() is true while motion is paused: the picture then
// holds still, part way through a pull. Throws where WebGL is unavailable.
export function startHero(canvas, { quiet }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x0d1117);
  const lite = Math.min(innerWidth, innerHeight) < 600;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 1, 0.1, 2 * R_SKY);
  const sky = makeSky(lite), pool = makeWhirlpool(lite);
  scene.add(sky.group, pool.group);
  pool.group.rotation.z = 0.2;                                 // the axis leans a little, as a galaxy seen from outside does
  let seconds = 0, phase = 0.3, last = 0, on = false, px = 0, py = 0, ex = 0, ey = 0;

  // Beside the words on a wide screen; above them, and dimmer, on a narrow one, so the words stay readable.
  function resize() {
    const W = innerWidth, H = innerHeight, wide = W >= 900;
    renderer.setSize(W, H, false);
    camera.fov = wide ? 38 : 52;
    camera.setViewOffset(W, H, wide ? -0.2 * W : 0, wide ? 0 : 0.27 * H, W, H);
    pool.dim.value = wide ? 1 : 0.45;
  }
  function frame(now) {
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    if (!quiet()) { seconds += dt; phase = (phase + dt / CYCLE) % 1; }
    ex += (px - ex) * 0.04; ey += (py - ey) * 0.04;            // the view leans a little toward the pointer
    camera.position.set(7.6 * Math.sin(0.25 * ex), 2.5 + 0.9 * ey, 7.6 * Math.cos(0.25 * ex));
    camera.lookAt(0, 0.1, 0);
    sky.group.position.copy(camera.position);
    sky.update(seconds);
    pool.update(seconds, phase, camera);
    renderer.render(scene, camera);
    if (quiet() && Math.abs(px - ex) + Math.abs(py - ey) < 1e-3) { renderer.setAnimationLoop(null); last = 0; }   // nothing left to move: stop drawing
  }
  const kick = () => { if (on) renderer.setAnimationLoop(frame); };
  addEventListener('pointermove', e => { px = e.clientX / innerWidth * 2 - 1; py = e.clientY / innerHeight * 2 - 1; kick(); }, { passive: true });
  addEventListener('resize', () => { resize(); kick(); });
  resize();
  return { kick, run(go) { on = go; last = 0; renderer.setAnimationLoop(go ? frame : null); } };
}
