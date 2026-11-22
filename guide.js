// The Navier–Stokes guide: an intro and a climb of ten short steps, in the shell of Zeta World's guide
// (github.com/Alex-lop/zeta-world, guide/guide.js).
// Each step is about 50 words: one idea, one thing to do, one payoff. Every sentence of mathematics or news here was
// checked against a primary source on 22 Nov 2026 (the sources are linked from the last step). Do not add one from memory.

const $ = id => document.getElementById(id), root = document.documentElement;
const ZETA = 'https://alex-lop.github.io/zeta-world/';   // the companion site, on the Riemann hypothesis
const el = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const still = () => reduce.matches || root.dataset.motion === 'off';
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (x, d = 0) => x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const times = x => x < 9.95 ? num(x, 1) : x < 1e6 ? num(+x.toPrecision(3)) : `${num(x / 1e6, x < 1e7 ? 1 : 0)} million`;   // three figures: "1.4", "1,140", "775,000", "1.5 million"

// ---- the page's own fluid ------------------------------------------------------------------------------
// The ticks behind every 2D screen are a real two-dimensional flow: a handful of vortices, each carried along by the
// velocity the others induce, whose cores spread at the rate viscosity sets (a Lamb-Oseen vortex has core radius^2 =
// s2 + 4 nu t). Moving the pointer sheds a pair of opposite vortices, as a finger drawn through water does. A slow drag
// (the cup's walls and floor, in effect) brings the page back to rest in about ten seconds, so the words stay readable.
// The ticks themselves are the ones on Alex's personal site: they rest upright and turn to follow the flow.
const fluid = (() => {
  const canvas = $('field'), ctx = canvas.getContext('2d');
  const LEN = 9, GROW = 6, A0 = 0.1, A1 = 0.75, V0 = 90, REST = 6;   // tick length and what a flow adds to it, opacity at rest and in a flow, the speed (px/s) a tick fully follows, and the speed below which it rests
  const MAX = 70, S0 = 22 * 22, HALF = 16, DRAG = 10;          // vortices kept, a new core's radius^2, half the gap of a shed pair, seconds for a swirl to fade
  const api = { nu: 30, onstir: null, kick, demo };            // nu in px^2/s: 30 reads as water, 8000 as honey
  const unseen = () => root.dataset.mode === 'world' || (root.dataset.mode === 'intro' && root.dataset.sky === 'on');   // the 3D view or the intro's sky is over the ticks
  let W = 0, H = 0, ticks = [], vort = [], raf = 0, last = 0, lx = 0, ly = 0, lt = 0, vx = 0, vy = 0, ghost = null;
  const buckets = Array.from({ length: 8 }, () => []);
  const modPi = a => a - Math.PI * Math.round(a / Math.PI), smooth = q => q * q * (3 - 2 * q);
  canvas.style.touchAction = 'pan-y';                          // a vertical swipe still scrolls; a sideways one stirs

  function size() {
    W = innerWidth; H = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let step = W <= 620 ? 34 : 26;
    const cap = W <= 620 ? 600 : 1800, est = Math.ceil(W / step) * Math.ceil(H / step);
    if (est > cap) step *= Math.sqrt(est / cap);
    const old = ticks; ticks = [];
    for (let y = ((H % step) + step) / 2; y < H; y += step) for (let x = ((W % step) + step) / 2; x < W; x += step) ticks.push({ x, y, a: 0, v: 0 });
    if (old.length === ticks.length) ticks = old;              // a phone's address bar must not reset the field
  }
  // Velocity at (x, y) from every vortex but `skip`, into vx and vy. q.g is the circulation over 2 pi.
  function vel(x, y, skip) {
    vx = vy = 0;
    for (const q of vort) {
      if (q === skip) continue;
      const dx = x - q.x, dy = y - q.y, r2 = dx * dx + dy * dy, k = q.g * (r2 > 1e-3 ? (1 - Math.exp(-r2 / q.s2)) / r2 : 1 / q.s2);
      vx -= dy * k; vy += dx * k;
    }
  }
  function frame(t) {
    raf = 0;
    const dt = Math.min((t - last) / 1000, 0.05); last = t;
    if (still()) vort = [];
    for (const q of vort) { vel(q.x, q.y, q); q.ux = vx; q.uy = vy; }
    for (const q of vort) { q.x += q.ux * dt; q.y += q.uy * dt; q.s2 += 4 * api.nu * dt; q.g *= 1 - dt / DRAG; }
    vort = vort.filter(q => Math.abs(q.g) / Math.sqrt(q.s2) > 1.5 && q.x > -300 && q.x < W + 300 && q.y > -300 && q.y < H + 300);
    let moving = 0;
    for (const b of buckets) b.length = 0;
    for (const k of ticks) {
      vel(k.x, k.y);
      const w = smooth(clamp((Math.hypot(vx, vy) - REST) / V0, 0, 1)), e = modPi(w * modPi(Math.atan2(vx, -vy)) - k.a);
      k.v = (k.v + e * 0.16) * 0.78; k.a += k.v;
      if (Math.abs(k.v) > 5e-4 || Math.abs(e) > 1e-3) moving++;
      const half = (LEN + w * GROW) / 2, s = Math.sin(k.a) * half, c = Math.cos(k.a) * half;
      buckets[Math.min(7, (w * 7 + 0.5) | 0)].push(k.x - s, k.y + c, k.x + s, k.y - c);
    }
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1; ctx.strokeStyle = '#ecebe6';
    buckets.forEach((b, i) => {
      if (!b.length) return;
      ctx.globalAlpha = A0 + i * (A1 - A0) / 7;
      ctx.beginPath();
      for (let j = 0; j < b.length; j += 4) { ctx.moveTo(b[j], b[j + 1]); ctx.lineTo(b[j + 2], b[j + 3]); }
      ctx.stroke();
    });
    if (ghost) { ctx.globalAlpha = 0.9; ctx.strokeStyle = css('--act'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ghost[0], ghost[1], 11, 0, 2 * Math.PI); ctx.stroke(); }
    if ((vort.length || moving || ghost) && !unseen() && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  // A pair of opposite vortices either side of the point, set so the fluid between them moves along (dx, dy) at about `speed`.
  function shed(x, y, dx, dy, speed) {
    const d = Math.hypot(dx, dy), g = 0.6 * speed * Math.min(d, 48) / (2 * Math.PI), nx = -dy / d * HALF, ny = dx / d * HALF;   // one event's reach is capped: a pointer that jumps is not a faster stir
    vort.push({ x: x + nx, y: y + ny, g, s2: S0 }, { x: x - nx, y: y - ny, g: -g, s2: S0 });
    if (vort.length > MAX) vort.splice(0, vort.length - MAX);
    kick();
  }
  // What stirring is, shown: the page makes one stroke by itself, a ring in the visitor's colour sweeping an arc through the
  // part of the page to the right of `left`. Any stroke of the visitor's own ends it.
  function demo(left) {
    const from = performance.now();
    let sx, sy;
    const go = now => {
      const u = (now - from) / 1300;
      if (u >= 1 || !ghost || still() || unseen()) { ghost = null; return; }
      const e = smooth(u), x = left + (W - left) * (0.2 + 0.6 * e), y = H * (0.62 - 0.26 * Math.sin(Math.PI * e));
      if (Math.hypot(x - sx, y - sy) >= 20) { shed(x, y, x - sx, y - sy, 800); sx = x; sy = y; }
      sx ??= x; sy ??= y;
      ghost = [x, y];
      requestAnimationFrame(go);
    };
    ghost = []; kick(); requestAnimationFrame(go);
  }
  addEventListener('pointermove', e => {
    if (unseen() || still()) return;
    const now = performance.now(), dx = e.clientX - lx, dy = e.clientY - ly, d = Math.hypot(dx, dy), gap = now - lt;
    if (gap > 150 || d > 240) { lx = e.clientX; ly = e.clientY; lt = now; return; }   // a new stroke: no jump from wherever the pointer last was
    if (d < 14) return;
    ghost = null;
    shed(e.clientX, e.clientY, dx, dy, Math.min(d / Math.max(gap, 4) * 1000, 1500));
    lx = e.clientX; ly = e.clientY; lt = now;
    api.onstir?.();
  }, { passive: true });
  addEventListener('resize', () => { size(); kick(); });
  document.addEventListener('visibilitychange', kick);
  reduce.addEventListener('change', kick);
  size();
  if (!still()) for (let i = 0; i < 3; i++) {                  // so the first screen is already moving
    const a = Math.random() * 2 * Math.PI;
    shed(W * (0.45 + 0.5 * Math.random()), H * (0.15 + 0.7 * Math.random()), 30 * Math.cos(a), 30 * Math.sin(a), 260);
  }
  kick();
  return api;
})();

// ---- the ground, and the first screen's whirlpool --------------------------------------------------------------
// astral.js draws the ground behind every screen (plain and dark) and, on the first one, a whirlpool on it. It starts after the words are on
// screen, and where it cannot start (no WebGL, or the library did not load) the page keeps its plain ground and the ticks.
let hero = null, heroing = null, astral = null;
const openAstral = () => astral ??= import('./astral.js?v=3');
const openHero = () => heroing ??= openAstral().then(m => { hero = m.startHero($('sky'), { quiet: still, notes: $('notes') }); root.dataset.sky = 'on'; return hero; }).catch(e => (console.warn(e), null));

// ---- the 3D view, loaded the first time a step needs it ---------------------------------------------------
let view = null, opening = null, turn = 0;
const NO_WEBGL = 'This browser could not start WebGL, so the 3D view is off. The words still tell the story.';
const open3D = () => opening ??= Promise.all([import('./scenes.js?v=2'), openAstral()]).then(([m, a]) => view = m.start($('world'), { quiet: still, panel: $('panel'), backdrop: a.backdrop })).catch(e => (console.error(e), null));
// Runs fn(view) once the 3D view is up, unless the visitor has moved on to another step by then.
function with3D(fn) {
  const mine = turn;
  open3D().then(v => {
    if (mine !== turn) return;
    if (v) { v.run(true); fn(v); } else $('s-stage').prepend(el(`<p class="small">${NO_WEBGL}</p>`));
  });
}

// ---- small pieces the steps share ---------------------------------------------------------------------------
// A labelled slider: [the row, its input, its readout]. `colour` tints the label when the slider sets a coloured thing.
const slide = (label, min, max, step, value, colour = '') => {
  const s = el(`<label class="slide"><span class="${colour}">${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}"><output></output></label>`);
  return [s, s.querySelector('input'), s.querySelector('output')];
};
const timeSlide = () => { const [row, input, out] = slide('time', 0, 1, 0.0005, 0); out.remove(); row.classList.add('bare'); return [row, input]; };
// A canvas sized for the screen's pixels. Returns its 2D context and its size in CSS pixels.
function pen(canvas, h) {
  const dpr = Math.min(devicePixelRatio || 1, 2), w = canvas.clientWidth || 300;
  canvas.style.height = h + 'px'; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.font = '11px ui-monospace, Menlo, monospace'; c.lineWidth = 1;
  return [c, w, h];
}
const css = name => getComputedStyle(root).getPropertyValue(name).trim();
const short = () => innerWidth < 900 || innerHeight < 800;   // little room for a chart: beside the 3D view on a phone, or in a short window

// ---- step 2's wave ------------------------------------------------------------------------------------------
// The rule on one line with the pressure left out, u_t + u u_x = nu u_xx (Burgers' equation), started as one sine wave.
// The fast fluid catches the slow, so the front in the middle steepens. With no viscosity the slope there is 1 / (1 - t)
// (along a path that moves with the fluid, u_x = u0' / (1 + u0' t), and the wave starts with u0' = -1 at its middle):
// infinite at t = 1. Any viscosity holds the front at a finite slope, about 1 / (2 nu) once it has formed.
// The figure runs this over and over at whatever viscosity the slider says, and traces the front's slope against that
// runaway. Returns { set(nu), stop() }. With motion paused it shows the wave part-way through one run instead.
function wave(canvas, read) {
  const N = innerWidth < 900 ? 512 : 1024, dx = 2 * Math.PI / N, T_END = 3, PACE = 1.5, TOP = 2.4;   // PACE: seconds on screen per unit of the wave's time. TOP: the chart's ceiling, as a power of ten
  let u = new Float64Array(N), v = new Float64Array(N), nu = 0.02, t = 0, hist = [], raf = 0, last = 0, rest = 0, frozen = false, sized = '', c, W, H;
  const begin = () => { for (let i = 0; i < N; i++) u[i] = Math.sin(i * dx); t = 0; hist = [[0, 1]]; };
  const steepest = () => { let m = Math.abs(u[0] - u[N - 1]); for (let i = 1; i < N; i++) m = Math.max(m, Math.abs(u[i] - u[i - 1])); return m / dx; };
  // Explicit steps: Godunov's flux for the carrying term, which stays stable through a front, and centred differences for viscosity.
  function advance(until) {
    while (t < until - 1e-12) {
      const dt = Math.min(0.4 * dx, 0.2 * dx * dx / nu, until - t), k = dt / dx, d = dt * nu / (dx * dx);
      for (let i = 0; i < N; i++) {
        const a = u[i ? i - 1 : N - 1], b = u[i], e = u[i + 1 < N ? i + 1 : 0];
        const ap = a > 0 ? a : 0, bm = b < 0 ? b : 0, bp = b > 0 ? b : 0, em = e < 0 ? e : 0;
        v[i] = b - k * (Math.max(bp * bp, em * em) - Math.max(ap * ap, bm * bm)) / 2 + d * (a - 2 * b + e);
      }
      [u, v] = [v, u]; t += dt;
    }
    hist.push([t, steepest()]);
  }
  function draw() {
    const roomy = innerWidth >= 900 && innerHeight >= 620, h1 = roomy ? 230 : 128, h2 = roomy ? 150 : 86, key = `${canvas.clientWidth} ${h1}`;   // beside the card there is room; inside it, on a phone, there is not
    if (key !== sized) { [c, W, H] = pen(canvas, h1 + h2); sized = key; } else c.clearRect(0, 0, W, H);
    const ink = css('--ink'), muted = css('--muted'), hair = css('--hair-strong'), gold = css('--gold'), red = css('--red');
    // The wave, over the wave it started as.
    const px = i => 12 + i / N * (W - 24), py = y => h1 / 2 + 4 - y * (h1 / 2 - 22);
    c.lineWidth = 1; c.strokeStyle = hair; c.beginPath(); c.moveTo(12, py(0)); c.lineTo(W - 12, py(0)); c.moveTo(0, h1 + 0.5); c.lineTo(W, h1 + 0.5); c.stroke();
    c.setLineDash([3, 4]); c.strokeStyle = muted; c.beginPath();
    for (let i = 0; i <= N; i += 4) c[i ? 'lineTo' : 'moveTo'](px(i), py(Math.sin(i * dx)));
    c.stroke(); c.setLineDash([]);
    c.lineWidth = 2.2; c.strokeStyle = c.fillStyle = ink; c.beginPath();
    for (let i = 0; i <= N; i++) c[i ? 'lineTo' : 'moveTo'](px(i), py(u[i % N]));
    c.stroke();
    c.lineTo(px(N), py(0)); c.lineTo(px(0), py(0)); c.globalAlpha = 0.07; c.fill(); c.globalAlpha = 1;   // a faint body under the line
    // Gold over the line where viscosity is doing the work: where nu u_xx is large beside the carrying term u u_x.
    c.strokeStyle = gold;
    for (let band = 1; band <= 3; band++) {
      c.globalAlpha = band / 3; c.beginPath();
      for (let i = 1; i < N - 1; i++) {
        const vis = nu * Math.abs(u[i + 1] - 2 * u[i] + u[i - 1]) / (dx * dx), adv = Math.abs(u[i] * (u[i + 1] - u[i - 1])) / (2 * dx);
        if (Math.min(3, Math.ceil(3 * vis / (vis + adv + 0.03))) === band) { c.moveTo(px(i - 0.5), py((u[i - 1] + u[i]) / 2)); c.lineTo(px(i + 0.5), py((u[i] + u[i + 1]) / 2)); }
      }
      c.stroke();
    }
    c.globalAlpha = 1; c.fillStyle = muted;
    c.fillText('the fluid’s speed, along a line', 14, 15); c.fillText('moving right →', px(N / 4) - 44, py(0) + 16); c.fillText('← moving left', px(3 * N / 4) - 44, py(0) - 8);
    c.textAlign = 'right'; c.fillText('dashed: how it started', W - 14, 15); c.textAlign = 'left';
    // How steep the front is, on a scale where each line is ten times the one below, against the runaway.
    const tx = s => 58 + s / T_END * (W - 76), sy = m => H - 16 - Math.min(Math.log10(Math.max(m, 1)), TOP) / TOP * (h2 - 36);
    c.lineWidth = 1; c.strokeStyle = css('--hair'); c.textAlign = 'right';
    [['×1', 1], ['×10', 10], ['×100', 100]].forEach(([s, m]) => { c.beginPath(); c.moveTo(58, sy(m)); c.lineTo(W - 18, sy(m)); c.stroke(); c.fillText(s, 52, sy(m) + 4); });
    c.textAlign = 'left'; c.fillText('how steep the front is', 64, h1 + 16);
    c.strokeStyle = c.fillStyle = red; c.setLineDash([4, 4]); c.beginPath();
    for (let s = 0; s < 0.9961; s += 0.004) c[s ? 'lineTo' : 'moveTo'](tx(s), sy(1 / (1 - s)));
    c.lineTo(tx(1), sy(10 ** TOP)); c.stroke(); c.setLineDash([]);
    c.fillText('with no viscosity: infinite here', tx(1) + 8, h1 + 16);
    c.strokeStyle = ink; c.lineWidth = 2; c.beginPath();
    hist.forEach(([s, m], k) => c[k ? 'lineTo' : 'moveTo'](tx(s), sy(m)));
    c.stroke();
    const [s, m] = hist.at(-1);
    c.fillStyle = ink; c.beginPath(); c.arc(tx(s), sy(m), 3.5, 0, 2 * Math.PI); c.fill();
    read.innerHTML = `the front is <b>×${num(m, m < 9.95 ? 1 : 0)}</b> as steep as the wave began`;
  }
  // With motion paused: one run to a little after the front has formed, drawn once.
  function freeze() { begin(); for (let k = 1; k <= 80; k++) advance(1.6 * k / 80); draw(); frozen = true; }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (still()) { if (!frozen) freeze(); return; }
    frozen = false;
    if (t < T_END) advance(Math.min(t + dt / PACE, T_END)); else if ((rest += dt) > 1) { begin(); rest = 0; }   // a breath at the end, then again
    draw();
  }
  begin(); last = performance.now(); raf = requestAnimationFrame(frame);
  return { set(value) { nu = value; if (still()) freeze(); }, stop() { cancelAnimationFrame(raf); } };
}

// ---- step 6's toy -------------------------------------------------------------------------------------------
// A whirlpool with a Gaussian core in a pull of strength a has width^2 changing at the rate 4 nu - a width^2 (step 5 is
// its steady state). Tie the pull to the spin by hand, a = c * (peak spin) = c Gamma / (pi width^2), and the rate becomes
// the constant 4 nu - c Gamma / pi. In units where width^2 starts at 1 and c Gamma / pi = 1: width^2 = 1 - (1 - x) t,
// with x = 4 nu. So the spin, 1 / width^2, is infinite at t = 1 / (1 - x) when x < 1, and never when x >= 1.
function runaway(stage, ui) {
  const [row, input, out] = slide('stickiness', 0, 1.4, 0.01, 0, 'gold'), go = el('<button type="button" class="btn btn-go">Run</button>');
  const plot = el('<canvas class="plot" role="img" aria-label="The toy whirlpool’s spin against time."></canvas>'), read = el('<p class="readout"></p>');
  const bar = el('<div class="row"></div>'), left = el('<div></div>'), two = el('<div class="two"></div>');
  bar.append(go, row); left.append(bar, read, el('<p class="note">a toy: here the pull is tied to the spin by hand</p>')); two.append(left, plot); stage.append(two);
  const T_MAX = 4, S_MAX = 12;
  let t = 0, raf = 0, x = 0;
  const w = tt => Math.max(1 - (1 - x) * tt, 0);
  function draw() {
    const [c, W, H] = pen(plot, short() ? 84 : 112), px = tt => 8 + tt / T_MAX * (W - 16), py = s => H - 16 - Math.min(s, S_MAX) / S_MAX * (H - 28);
    c.strokeStyle = css('--hair-strong'); c.beginPath(); c.moveTo(8, H - 16); c.lineTo(W - 8, H - 16); c.stroke();
    c.fillStyle = css('--muted'); c.fillText('time →', W - 52, H - 3); c.fillText('spin', 10, 12);
    const T = x < 1 ? 1 / (1 - x) : Infinity;
    if (T < T_MAX) { c.strokeStyle = c.fillStyle = css('--red'); c.setLineDash([4, 4]); c.beginPath(); c.moveTo(px(T), 6); c.lineTo(px(T), H - 16); c.stroke(); c.setLineDash([]); c.fillText('blow-up', Math.min(px(T) + 5, W - 56), 24); }
    c.strokeStyle = css('--blue'); c.lineWidth = 2; c.beginPath();
    for (let i = 0; i <= 200; i++) { const tt = t * i / 200, s = 1 / Math.max(w(tt), 1e-4); c[i ? 'lineTo' : 'moveTo'](px(tt), py(s)); if (s > S_MAX) break; }
    c.stroke();
  }
  function show() {
    x = +input.value;
    out.textContent = x === 0 ? 'none' : x < 1 ? 'some' : 'a lot';
    const T = x < 1 ? 1 / (1 - x) : Infinity, blown = t >= T - 1e-9;
    read.innerHTML = x < 1 ? `spin <b>×${blown ? '∞' : times(1 / w(t))}</b> · infinite at time <b>${num(T, 2)}</b>` : `spin <b>×${num(1 / w(t), 2)}</b> · no blow-up: spreading wins`;
    view?.tube.set({ width2: w(t), blown });
    draw();
    return blown;
  }
  function tick(now, from) {
    t = Math.min((now - from) / 1600, T_MAX);
    if (show() || t >= T_MAX) { ui.done(); go.textContent = 'Run again'; raf = 0; return; }
    raf = requestAnimationFrame(n => tick(n, from));
  }
  go.onclick = () => {
    cancelAnimationFrame(raf); t = 0;
    if (still()) { t = Math.min(x < 1 ? 1 / (1 - x) : T_MAX, T_MAX); show(); ui.done(); return; }
    const from = performance.now(); raf = requestAnimationFrame(n => tick(n, from));
  };
  input.oninput = () => { cancelAnimationFrame(raf); t = 0; show(); };
  with3D(v => { v.show('tube', 'runaway'); show(); });
  show();
  return () => cancelAnimationFrame(raf);
}

// ---- steps 7 and 8: the can -------------------------------------------------------------------------------
// Luo and Hou's own numbers (arXiv:1310.0497, table 4.2.2, 2048 x 2048 mesh; 0.003504 from table 4.3.3) and their estimate
// of the blow-up time. The chart draws them as rings beside this page's own solution.
const T_BLOW = 0.0035056, W0 = 1200 * Math.PI;
const PUBLISHED = [[0.003, 9.0847e4], [0.0034, 4.3127e6], [0.0035, 5.8413e9], [0.003504, 1.2209e11], [0.003505, 1.2401e12]];
const fraction = len => { const n = Math.round(-Math.log10(len)); return n <= 0 ? '1' : `1/${num(10 ** n)}`; };
function can(scope) {
  return (stage, ui) => {
    const [row, input] = timeSlide(), go = el('<button type="button" class="btn btn-go">Play</button>');
    const plot = el('<canvas class="plot" role="img" aria-label="The largest spin against the time left before the blow-up, on logarithmic scales: a line climbing steadily, with rings for the values Luo and Hou published."></canvas>');
    const read = el('<p class="readout">Loading the computed flow…</p>'), bar = el('<div class="row"></div>'), left = el('<div></div>'), two = el('<div class="two"></div>');
    bar.append(go, row); left.append(bar, read); two.append(left, plot); stage.append(two);
    let data = null, raf = 0;
    const X = t => -Math.log10(1 - t / T_BLOW), Y = w => Math.log10(w / W0);
    function draw(t, w) {
      const [c, W, H] = pen(plot, short() ? 92 : 124), px = x => 82 + x / 4 * (W - 112), py = y => H - 24 - y / 9 * (H - 36);
      c.strokeStyle = css('--hair'); c.fillStyle = css('--muted');
      c.textAlign = 'center';
      ['100%', '10%', '1%', '0.1%', '0.01%'].forEach((s, x) => { c.beginPath(); c.moveTo(px(x), 12); c.lineTo(px(x), H - 24); c.stroke(); c.fillText(s, px(x), H - 9); });
      c.textAlign = 'right';
      [['×1', 0], ['×1,000', 3], ['×1 million', 6], ['×1 billion', 9]].forEach(([s, y]) => { c.beginPath(); c.moveTo(82, py(y)); c.lineTo(W - 30, py(y)); c.stroke(); c.fillText(s, 76, py(y) + 4); });
      c.fillText('time left', W - 34, H - 30);
      c.textAlign = 'left'; c.fillText('largest spin', 88, 24);
      c.strokeStyle = css('--blue'); c.lineWidth = 2; c.beginPath();
      for (let i = 0; i < data.hist.length; i += 2) c[i ? 'lineTo' : 'moveTo'](px(X(data.hist[i])), py(Y(data.hist[i + 1])));
      c.stroke(); c.lineWidth = 1.5; c.strokeStyle = css('--ink');
      for (const [pt, pw] of PUBLISHED) { c.beginPath(); c.arc(px(X(pt)), py(Y(pw)), 4.5, 0, 2 * Math.PI); c.stroke(); }
      c.fillStyle = css('--blue'); c.beginPath(); c.arc(px(X(t)), py(Y(w)), 4, 0, 2 * Math.PI); c.fill();
    }
    function show() {
      if (!data) return;
      const x = +input.value, s = view.can.set(x * (data.ns - 1));
      read.innerHTML = `time left <b>${num((1 - s.t / T_BLOW) * 100, s.t / T_BLOW > 0.99 ? 2 : 1)}%</b> · spin <b>×${times(s.w / W0)}</b>` + (scope ? ` · zoom <b>×${times(s.zoom)}</b>` : '');
      $('hud').innerHTML = scope ? `<span class="rule" style="width:${Math.round(s.bar[0])}px"></span>bar: <b>${fraction(s.bar[1])}</b> of the can’s radius`
        : '<span class="red">○</span> red rings: the spin blows up here';
      draw(s.t, s.w);
      if (x > 0.6) ui.done();
    }
    function play(now, from, x0) {
      input.value = Math.min(x0 + (now - from) / 16000, 1); show();
      raf = +input.value < 1 ? requestAnimationFrame(n => play(n, from, x0)) : 0;
      if (!raf) go.textContent = 'Play';
    }
    go.onclick = () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; go.textContent = 'Play'; return; }
      if (still()) { input.value = 1; show(); return; }
      const x0 = +input.value >= 1 ? 0 : +input.value, from = performance.now();
      go.textContent = 'Pause'; raf = requestAnimationFrame(n => play(n, from, x0));
    };
    input.oninput = () => { if (raf) go.onclick(); show(); };
    with3D(v => v.can.ready.then(d => {
      if (!d) { read.textContent = 'The computed flow did not load. Reload to try again.'; return; }
      data = d; v.show('can', scope ? 'scope' : 'wide'); show();
    }));
    addEventListener('resize', show);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', show); };
  };
}

// ---- step 9: the announced blow-up -------------------------------------------------------------------------
// From the paper (Alpöge and Buckmaster, 20 Nov 2026, section 1.1 and appendix C): in the variables s = log(T / (T - t)) and
// y = x / sqrt(T - t) the solution has period S of about 0.36 in s. So each time the time left falls by the factor
// e^-0.36 (about 30%) the same picture returns, e^-0.18 times the size (16% smaller) and e^0.18 times as fast (20% faster).
const PERIOD = 0.36, PERIODS = 14;
function announced(stage, ui) {
  const [row, input] = timeSlide(), pace = el('<label class="slide bare" style="cursor:pointer"><input type="checkbox" style="width:1.1rem;height:1.1rem;accent-color:var(--act)"><span>zoom to keep pace</span></label>');
  const read = el('<p class="readout"></p>'), two = el('<div class="two"></div>'), a = el('<div></div>'), b = el('<div></div>');
  a.append(row, pace); b.append(read, el('<p class="note">a sketch from the paper’s description, not its data, which is not yet released</p>'));
  two.append(a, b); stage.append(two);
  const box = pace.querySelector('input');
  function show() {
    const s = +input.value * PERIODS * PERIOD;
    view?.nested.set(s, box.checked);
    read.innerHTML = `time left <b>${num(Math.exp(-s) * 100, s > 2.3 ? 2 : 1)}%</b> · size <b>×${num(Math.exp(-s / 2), 2)}</b> · speed <b>×${num(Math.exp(s / 2), 1)}</b> · repeats so far <b>${Math.floor(s / PERIOD + 1e-9)}</b>`;
    if (s > 2 * PERIOD) ui.done();
  }
  input.oninput = box.onchange = show;
  with3D(v => { v.show('nested'); show(); });
  show();
}

// ---- the ten steps --------------------------------------------------------------------------------------
// id is the name in the URL hash, and tab the short name in the step bar and on the Next and Back buttons. title, idea, act
// (the one instruction) and payoff are the step's words. more is a closed <details>. world says the step needs the 3D view.
// mount(stage, ui) builds the step's controls and may return a function that undoes it.
const INK = '<span class="inked"><i class="sw"></i>the flow</span>', BLUE = '<span class="blue"><i class="sw"></i>spin</span>';
const STEPS = [
  { id: 'flow', tab: 'Flow', title: 'A fluid is a field of arrows',
    idea: 'At every point a fluid has a speed and a direction. Each tick on this page is one of those arrows.',
    act: 'Sweep across the page.',
    payoff: 'It kept moving after you stopped. The Navier–Stokes equations are the rule for what a flow does next.',
    mount(stage, ui) {
      if (still()) ui.done();                                  // nothing can be stirred while motion is paused
      const show = setTimeout(() => fluid.demo(innerWidth >= 900 ? $('panel').offsetWidth : 0), 1000);
      fluid.onstir = () => { clearTimeout(show); ui.done(); };
      return () => { clearTimeout(show); fluid.onstir = null; };
    } },
  { id: 'law', tab: 'The rule', title: 'One rule, three pushes',
    idea: 'The equation, term by term. Viscosity is the fluid’s stickiness.',
    act: 'Slide from water to honey and watch the wave.',
    payoff: 'In water the wave rears up into a cliff. In honey it hardly tips. Viscosity is the brake. The million-dollar question: does the brake always hold?',
    more: '<details><summary>What the wave is</summary><p>The rule on a single line, with the pressure term left out: <a href="https://en.wikipedia.org/wiki/Burgers%27_equation">Burgers’ equation</a>. Fast fluid catches slow fluid, so the front steepens, and only viscosity holds it. With no viscosity at all its slope becomes infinite at a finite time. With any viscosity it never does. Gold marks where viscosity is doing the work.</p></details>',
    mount(stage, ui) {
      const [row, input, out] = slide('stickiness', 0, 1, 0.01, 0, 'gold'), read = el('<p class="readout"></p>');
      const plot = el('<canvas class="plot" role="img" aria-label="A wave of fluid speed along a line. Its front steepens until viscosity holds it: into a cliff in water, hardly at all in honey. Below it, how steep the front is over time, against the runaway it would follow with no viscosity."></canvas>');
      ui.big.append(el(`<p class="law" role="img" aria-label="The Navier–Stokes equation: the rate of change of the velocity u equals minus u dot grad u, minus the gradient of the pressure p, plus the viscosity nu times the Laplacian of u.">
        <span>∂u/∂t =<small>how the flow changes</small></span><span>− (u·∇)u<small>it carries itself along</small></span>
        <span>− ∇p<small>pressure stops it piling up</small></span><span class="gold">+ ν ∆u<small>viscosity smooths it</small></span></p>`), plot);
      stage.append(row, read);
      const fig = wave(plot, read);
      if (still()) ui.done();
      // One slider, two fluids: the wave's viscosity, and the page's own (stir it to see).
      const set = () => { const x = +input.value; fluid.nu = 30 * (8000 / 30) ** x; fig.set(0.012 * (0.3 / 0.012) ** x); out.textContent = x < 0.2 ? 'water' : x < 0.5 ? 'oil' : x < 0.8 ? 'syrup' : 'honey'; };
      input.oninput = () => { set(); if (+input.value > 0.5) ui.done(); };
      set();
      return () => { fig.stop(); fluid.nu = 30; };
    } },
  { id: 'spin', tab: 'Spin', world: true, title: 'What matters is spin',
    idea: 'Drop a paddle wheel into a whirlpool. How fast it turns on its own axle is the spin there.',
    act: 'Slide the wheel into the middle.',
    payoff: 'Outside, the wheel is carried round without turning. The spin all sits in the blue core. A blow-up means infinite spin somewhere.',
    legend: `${INK}${BLUE}`,
    more: '<details><summary>Its proper name</summary><p>Spin is called vorticity. The wheel turns at half of it.</p></details>',
    mount(stage, ui) {
      const [row, input, out] = slide('wheel', 0, 1, 0.005, 0), read = el('<p class="readout"></p>');
      stage.append(row, read);
      const set = () => {
        const r = 2 * (1 - input.value), f = Math.exp(-((r / 0.45) ** 2));   // 0.45: the core's radius in scenes.js
        view?.tube.set({ wheel: r });
        out.textContent = r > 0.9 ? 'outside' : r > 0.25 ? 'at the edge' : 'in the core';
        read.innerHTML = `the wheel turns at <b>${num(f * 100)}%</b> of the core’s spin`;
        if (r < 0.3) ui.done();
      };
      input.oninput = set;
      with3D(v => { v.show('tube', 'spin'); set(); }); set();
    } },
  { id: 'stretch', tab: 'Stretch', world: true, title: 'Stretch it and it spins faster',
    idea: 'Pull a whirlpool longer and it gets thinner and faster, like a skater pulling in her arms.',
    act: 'Drag the pull.',
    payoff: 'Twice as long, twice the spin. A flat, two-dimensional flow has nothing to stretch, and those are known to stay smooth for ever.',
    legend: `${INK}${BLUE}`,
    mount(stage, ui) {
      const [row, input, out] = slide('pull', 1, 6, 0.01, 1), read = el('<p class="readout"></p>');
      stage.append(row, read);
      const set = () => {
        const s = +input.value;
        view?.tube.set({ stretch: s });
        out.textContent = `×${num(s, 1)}`;
        read.innerHTML = `length <b>×${num(s, 1)}</b> · width <b>÷${num(Math.sqrt(s), 2)}</b> · spin <b>×${num(s, 1)}</b>`;
        if (s > 2.5) ui.done();
      };
      input.oninput = set;
      with3D(v => { v.show('tube', 'stretch'); set(); }); set();
    } },
  { id: 'brake', tab: 'The brake', world: true, title: 'Viscosity pushes back',
    idea: 'Stickiness spreads the spin outward, and it spreads a thin core fastest.',
    act: 'Set the pull, then the stickiness.',
    payoff: 'Every steady pull finds a width where squeezing and spreading balance. To break the equations, the pull itself would have to keep growing.',
    legend: `${INK}${BLUE}<span class="gold"><i class="sw open"></i>where the two balance</span>`,
    more: '<details><summary>The formula</summary><p>This whirlpool is an exact solution of the equations, the Burgers vortex (1948). For a pull of strength a and viscosity ν its core has radius 2√(ν/a), and its peak spin is proportional to a/ν.</p></details>',
    mount(stage, ui) {
      const [r1, pull, o1] = slide('pull', 0.3, 3, 0.01, 1), [r2, nu, o2] = slide('stickiness', 0.02, 0.3, 0.002, 0.1, 'gold'), read = el('<p class="readout"></p>'), two = el('<div class="two"></div>');
      two.append(r1, r2); stage.append(two, read);
      let moved = 0;
      const set = () => {
        const a = +pull.value, n = +nu.value;
        view?.tube.set({ pull: a, nu: n });
        o1.textContent = `×${num(a, 1)}`; o2.textContent = `×${num(n / 0.1, 1)}`;
        read.innerHTML = `core width <b>×${num(Math.sqrt(n / a / 0.1), 2)}</b> · spin <b>×${num(a / n * 0.1, 1)}</b>`;
        if (moved === 3) ui.done();
      };
      pull.oninput = () => { moved |= 1; set(); }; nu.oninput = () => { moved |= 2; set(); };
      with3D(v => { v.show('tube', 'brake'); set(); }); set();
    } },
  { id: 'runaway', tab: 'Runaway', world: true, title: 'What if the spin did the pulling?',
    idea: 'Suppose the pull grew with the spin: more spin, harder pull, more spin.',
    act: 'Press Run. Then add stickiness and run again.',
    payoff: 'Infinite spin at a finite time: a blow-up. Enough stickiness prevents it, but thinness alone never does.',
    legend: `${BLUE}<span class="red"><i class="sw"></i>the blow-up</span>`,
    more: '<details><summary>What the toy is</summary><p>The last step’s whirlpool, with its pull set by hand to a fixed multiple of its own peak spin. Its width² then changes at a constant rate, so it reaches zero at a finite time unless the viscosity is above a threshold. Thinness alone never stops it: squeezing and spreading both grow as 1/width². Nothing here shows that a real flow can pull on itself this way. That is the next step.</p></details>',
    mount: runaway },
  { id: 'can', tab: 'The can', world: true, title: 'A flow that pulls on itself',
    idea: 'A can of fluid with no stickiness. Each layer swirls the opposite way to its neighbours.',
    act: 'Drag time forward.',
    payoff: 'The swirl drives fluid along the wall to where two layers meet, and the spin there climbs without limit. Guo Luo and Thomas Hou found this by computer in 2013.',
    legend: `${INK}${BLUE}<span class="inked"><i class="sw open"></i>Luo and Hou’s published values</span>`,
    more: `<details><summary>What is computed here</summary><p>The 3D Euler equations (Navier–Stokes with the viscosity set to zero) for a flow that is the same all the way round the can, from the starting flow of <a href="https://arxiv.org/abs/1310.0497">Luo and Hou</a>. The line on the chart is this page’s own solution (<a href="https://github.com/Alex-lop/navier-stokes/blob/main/bake.py">bake.py</a>). The can shows ten of an endless stack of layers, cut open: blue is the spin on the cut, and the ticks show which way the fluid behind it is moving at that instant.</p></details>`,
    mount: can(false) },
  { id: 'collapse', tab: 'The collapse', world: true, title: 'Follow it down',
    idea: 'It shrinks into the wall too fast to follow. So let a microscope zoom in to keep pace.',
    act: 'Drag time, and watch the scale bar.',
    payoff: 'The picture barely changes while it shrinks millions of times: the flow is copying itself, ever smaller and faster. In 2022 Chen and Hou announced a proof that blow-up of this kind happens.',
    legend: `${INK}${BLUE}<span class="red"><i class="sw"></i>the blow-up point</span>`,
    more: '<details><summary>How far to trust it</summary><p>Their proof is computer-assisted. This page’s solution agrees with Luo and Hou’s published table to 0.05% at 97% of the way to the blow-up. Where it stops, at 99.84%, it is 6% low. Theirs went on to 99.98%, on meshes that moved with the collapse. <a href="https://arxiv.org/abs/2210.07191">Chen and Hou’s theorem</a> is about starting flows close to a self-similar one, not exactly this one.</p></details>',
    mount: can(true) },
  { id: 'announced', tab: '2026', world: true, title: 'And with stickiness?',
    idea: 'That needed a wall and no stickiness. On 20 Nov 2026 a paper by Alpöge and Buckmaster claimed a blow-up in a sticky fluid with no wall.',
    act: 'Drag time toward the blow-up.',
    payoff: 'The paper describes a column of spin with nineteen spiral arms, shrinking to a point. Each time the time left falls by about 30%, the picture returns, smaller and faster.',
    legend: `${BLUE}<span class="red"><i class="sw"></i>the blow-up point</span>`,
    more: '<details><summary>In the paper’s words</summary><p>A “backward discretely self-similar solution”: speeds grow like 1/√(time left), sizes shrink like √(time left), and the pattern repeats each time log(1/time left) grows by about 0.36: 16% smaller, 20% faster. Source: <a href="https://github.com/tristanbuckmaster/navier-stokes">the paper</a>, section 1.1 and appendix C.</p></details>',
    mount: announced },
  { id: 'status', tab: 'The record', title: 'What is settled, and what is not',
    idea: 'As of 22 Nov 2026. Open a line to see what it rests on.',
    act: '', payoff: '',
    mount(stage, ui) {
      const row = (title, tag, cls, body) => `<details><summary><b>${title}</b><span class="${cls}">${tag}</span></summary><p>${body}</p></details>`;
      const box = el('<div class="backed"></div>');
      box.append(el(`<div class="checks">
        ${row('Flat, two-dimensional flows stay smooth for ever', 'proved', '', 'Known for a long time. The <a href="https://www.claymath.org/wp-content/uploads/2022/06/navierstokes.pdf">official problem statement</a> credits Ladyzhenskaya. In two dimensions a whirlpool cannot be stretched.')}
        ${row('In 3D: smooth for a short time at least', 'proved', '', 'Every smooth start stays smooth for some time, and for ever if it is small enough. Leray showed in 1934 that solutions in a weaker, rougher sense exist for all time. Whether those are unique is not known.')}
        ${row('No viscosity, inside a wall: blow-up', 'proof, computer-assisted', 'blue', 'Luo and Hou’s computation (2014) followed the spin to 300 million times its start. <a href="https://arxiv.org/abs/2210.07191">Chen and Hou</a> (2022) proved that blow-up of this kind happens for some smooth starting flows in a cylinder. The half of the proof that does the rigorous numerics <a href="https://doi.org/10.1137/23M1580395">was published in 2025</a>; the other half is a preprint.')}
        ${row('With viscosity and a driving force: blow-up', 'announced 8 Sep 2026', 'red', 'A <a href="https://openai.com/index/navier-stokes-solution/">166-page paper by OpenAI</a> constructs, for every viscosity, a flow that starts at rest, is pushed by a smooth force, and reaches unbounded speed in finite time while its energy stays bounded. The problem’s “breakdown” statements allow such a force. Not peer reviewed.')}
        ${row('With viscosity and no force: blow-up', 'announced 20 Nov 2026', 'red', 'A <a href="https://github.com/tristanbuckmaster/navier-stokes">79-page paper by Alpöge and Buckmaster</a> claims smooth starting flows that blow up with nothing pushing them. Its repository says the data the proof rests on, a “certificate”, is not yet released, and that the computation checking it is not part of the accompanying Lean formalization. Not peer reviewed.')}
        ${row('The prize', 'Clay: “active”', '', 'On 11 Sep 2026 the Clay Mathematics Institute <a href="https://www.claymath.org/news/navier-stokes-announcement/">wrote</a> of “the announcement that the Navier-Stokes problem has apparently been settled” and called its own process “deliberately unhurried”. Its <a href="https://www.claymath.org/millennium-problems/rules/">rules</a> ask for publication, two years, and general acceptance.')}
      </div>`), el('<p class="status">Neither announcement has been peer reviewed. This page shows what the claims say. It proves nothing.</p>'));
      ui.big.append(box);
    } },
];

// ---- the shell: one step on screen, named by the URL hash ----------------------------------------------------
// The climb has four parts. The step bar marks where each begins, and every step says which it belongs to.
const PARTS = [['The fluid', 2], ['The whirlpool', 4], ['The blow-up', 3], ['The record', 1]];
const part = PARTS.flatMap(([name, n]) => Array(n).fill(name));
let leave = null;
const TITLE = document.title;
function show() {
  const id = location.hash.slice(1), i = STEPS.findIndex(s => s.id === id), step = STEPS[i];
  leave?.(); leave = null; turn++;
  const mode = step ? (step.world ? 'world' : 'paper') : 'intro';
  root.dataset.mode = mode; root.dataset.step = step ? id : '';
  document.title = step ? `${step.title} · Navier–Stokes` : TITLE;
  for (const tab of $('tabs').children) {
    tab.classList.toggle('past', tab.dataset.k < i);
    if (step && tab.hash === location.hash) { tab.setAttribute('aria-current', 'step'); tab.scrollIntoView({ block: 'nearest', inline: 'center' }); } else tab.removeAttribute('aria-current');
  }
  view?.run(mode === 'world');                                // no drawing while the 3D view is off screen
  // The ground is behind every screen that has no 3D view (that one draws its own), with the whirlpool on it on the intro.
  if (mode === 'world') hero?.run(false); else openHero().then(h => { const m = root.dataset.mode; h?.run(m !== 'world', m === 'intro'); });
  if (mode !== 'world') fluid.kick();
  $('hud').innerHTML = '';
  if (!step) return;

  const stage = $('s-stage'), payoff = $('s-payoff');
  $('s-count').innerHTML = `Step ${i + 1} of ${STEPS.length} · <b>${part[i]}</b>`;
  $('s-title').textContent = step.title; $('s-idea').textContent = step.idea;
  $('s-do').textContent = step.act; $('s-try').hidden = !step.act;
  $('s-legend').innerHTML = step.legend || ''; $('s-more').innerHTML = step.more || '';
  // Next and Back say where they lead, and the last step leads on to the companion site.
  $('s-back').href = '#' + (STEPS[i - 1]?.id || ''); $('s-back').textContent = `‹ ${STEPS[i - 1]?.tab || 'Start'}`;
  $('s-next').href = STEPS[i + 1] ? '#' + STEPS[i + 1].id : ZETA; $('s-next').textContent = STEPS[i + 1] ? `Next: ${STEPS[i + 1].tab} ›` : 'Zeta World ›';
  $('s-home').hidden = !!STEPS[i + 1];                        // the last card also offers the way home, to this guide's first screen

  // The point of the step appears once the visitor has done the thing, or asks for it.
  const ui = { big: $('s-big'), done() { if (payoff.classList.contains('on')) return; payoff.classList.add('on'); payoff.textContent = $('s-live').textContent = step.payoff; } };
  payoff.hidden = !step.payoff; payoff.classList.remove('on'); $('s-live').textContent = '';
  payoff.innerHTML = '<button type="button" class="link">Skip to the point</button>';
  payoff.firstElementChild.onclick = ui.done;
  stage.replaceChildren(); ui.big.replaceChildren();
  leave = step.mount?.(stage, ui) || null;
  scrollTo(0, 0); $('panel').scrollTop = 0; $('s-title').focus({ preventScroll: true });
  if (!still()) $('s-body').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });   // each step flows in
}
// The step bar: the way back to this guide's start, the ten steps by number and name, and the way to the companion site.
$('tabs').innerHTML = '<a class="wordmark" href="#">Navier–Stokes</a>' + STEPS.map((s, k) => `<a href="#${s.id}" data-k="${k}"${part[k] !== part[k - 1] ? ' class="part"' : ''} title="${part[k]}: ${s.tab}" aria-label="Step ${k + 1}: ${s.tab}"><b>${k + 1}</b><span>${s.tab}</span></a>`).join('') + `<a class="out" href="${ZETA}"><span>Zeta World</span></a>`;
addEventListener('hashchange', show);
show();
$('world').addEventListener('pointerdown', () => root.dataset.turned = '');   // the hint that the picture turns has done its job

// Arrow keys and Space move between steps, and a digit jumps to that step (0 is the tenth), unless a slider, button, link
// or summary has the focus: then the key is theirs.
addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, button, select, textarea, summary')) return;
  const intro = root.dataset.mode === 'intro', forward = e.key === 'ArrowRight' || e.key === ' ';
  const to = /^\d$/.test(e.key) ? '#' + STEPS[(+e.key + 9) % 10].id : intro ? (e.key === 'ArrowRight' ? '#' + STEPS[0].id : null) : forward ? $('s-next').getAttribute('href') : e.key === 'ArrowLeft' ? $('s-back').hash || '#' : null;
  if (to === null) return;
  e.preventDefault(); location.href = to;
});

// Pause motion: the same rest state as the system's reduced-motion setting.
{
  const b = $('motion'), label = () => { b.textContent = still() ? 'Resume motion' : 'Pause motion'; b.disabled = reduce.matches; };
  b.onclick = () => { if (root.dataset.motion === 'off') delete root.dataset.motion; else root.dataset.motion = 'off'; label(); fluid.kick(); hero?.kick(); };
  reduce.addEventListener('change', () => { label(); hero?.kick(); }); label();
}
