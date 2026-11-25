/* One acquisition round of DISEIL as a looping line drawing. Every frame is a function of time; the starts and
   outcomes are invented for the drawing and are not experiment data. */
(function () {
  'use strict';
  const INK = '#1e2430', GREY = '#a9b0ba', RED = '#c1272d', WHITE = '#fff';
  const clamp = (x) => Math.max(0, Math.min(1, x)), smooth = (x) => { const u = clamp(x); return u * u * (3 - 2 * u); };
  const ramp = (t, a, d) => smooth((t - a) / d), lerp = (a, b, u) => a + (b - a) * u;
  const mix = (a, b, k) => { const h = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)), A = h(a), B = h(b); return `rgb(${A.map((v, i) => Math.round(lerp(B[i], v, clamp(k)))).join(',')})`; };

  /* scene, in table units */
  const W = 1040, D = 540, BASE = { x: 130, y: 280 }, CUBE = 54, HOME = { x: 650, y: 280, z: 205 };
  const GROUPS = [[[690, 92], [826, 62], [862, 166], [722, 196]], [[810, 428], [896, 388], [890, 482]], [[372, 462], [458, 420], [450, 502]]];
  const XI = { x: 762, y: 34, yaw: 0.6 }; // to one side of the group, not its midpoint
  const GOOD = [[540, 190], [470, 250], [480, 340], [620, 300], [640, 440], [580, 90], [450, 130], [700, 320], [560, 360]];
  const yaw = (i) => [0.2, 0.9, -0.3, 0.55, 1.2, -0.6, 0.05, 0.75, -0.15, 1.0][i % 10];
  const fails = GROUPS.flatMap((g, k) => g.map(([x, y], i) => ({ x, y, g: k, i, ok: false })));
  const goods = GOOD.map(([x, y]) => ({ x, y, ok: true }));
  const pick = (list, n) => list.splice(n, 1)[0], F = fails.slice(), G = goods.slice();
  const ORDER = [pick(G, 0), pick(F, 0), pick(F, 1)];
  while (F.length || G.length) { if (G.length) ORDER.push(G.shift()); if (F.length) ORDER.push(F.splice((ORDER.length * 5) % F.length, 1)[0]); }
  ORDER.forEach((q, i) => { q.yaw = yaw(i); });
  const SLOW = 1.5, FAST = 0.27;
  const doneAt = (i) => (i < 3 ? SLOW * (i + 0.72) : SLOW * 3 + FAST * (i - 3 + 0.8));
  const hull = (pts) => {
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    for (const p of pts) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of pts.reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  };
  const RINGS = GROUPS.map((g) => hull(g.flatMap(([x, y]) => Array.from({ length: 24 }, (_, a) => [x + 62 * Math.cos(a * Math.PI / 12), y + 62 * Math.sin(a * Math.PI / 12)]))));

  /* stages */
  const T0 = SLOW * 3 + FAST * (ORDER.length - 3) + 0.9;
  const STAGES = [
    { t: 0, text: 'The policy practises. Some attempts fail.' },
    { t: T0, text: 'Similar failures are grouped.' },
    { t: T0 + 2.8, text: 'One group is selected.' },
    { t: T0 + 5.2, text: 'A language model recommends where to demonstrate next.' },
    { t: T0 + 8.2, text: 'An expert demonstrates once, from there.' },
    { t: T0 + 12.0, text: 'The policy is updated and tries again.' },
  ];
  const TOTAL = T0 + 18.4, S = (i) => STAGES[i].t;

  /* projection */
  const ca = Math.cos(0.26), sa = Math.sin(0.26), se = Math.sin(0.5), ce = Math.cos(0.5);
  let c, s, ox, oy, lw;
  const P = (x, y, z) => [ox + s * (x * ca + y * sa), oy - s * ((y * ca - x * sa) * se + (z || 0) * ce)];
  const depth = (x, y) => y * ca - x * sa;
  const path = (pts) => { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); };
  const poly = (pts, fill, stroke, w) => { path(pts); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = w || lw; c.stroke(); } };

  function cube(q, z, o) {
    const h = CUBE / 2, cs = Math.cos(q.yaw), sn = Math.sin(q.yaw), k = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [q.x + h * (a * cs - b * sn), q.y + h * (a * sn + b * cs)]);
    c.save(); c.globalAlpha *= o.a === undefined ? 1 : o.a; c.lineJoin = 'round';
    for (let i = 0; i < 4; i++) {
      const a = k[i], b = k[(i + 1) % 4], nx = b[1] - a[1], ny = -(b[0] - a[0]);
      if (nx * -sa + ny * ca < 0) poly([P(a[0], a[1], z), P(b[0], b[1], z), P(b[0], b[1], z + CUBE), P(a[0], a[1], z + CUBE)], o.side, o.stroke);
    }
    poly(k.map((p) => P(p[0], p[1], z + CUBE)), o.top, o.stroke);
    if (o.x) {
      const t = (a, b) => P(q.x + h * 0.5 * (a * cs - b * sn), q.y + h * 0.5 * (a * sn + b * cs), z + CUBE);
      c.strokeStyle = o.stroke; c.lineWidth = lw * 1.25; c.lineCap = 'round'; path([t(-1, -1), t(1, 1)]); c.stroke(); path([t(-1, 1), t(1, -1)]); c.stroke();
    }
    c.restore();
  }
  function arm(g, gap, col) {
    const L1 = 410, L2 = 400, sh = 150, H = { fin: 56, body: 52, wrist: 56 };
    const w = { x: g.x, y: g.y, z: g.z + H.fin + H.body + H.wrist }, dx = w.x - BASE.x, dy = w.y - BASE.y, r = Math.hypot(dx, dy), dz = w.z - sh;
    const d = Math.min(Math.hypot(r, dz), L1 + L2 - 1), phi = Math.atan2(dz, r), al = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
    const er = L1 * Math.cos(phi + al), E = { x: BASE.x + (dx / r) * er, y: BASE.y + (dy / r) * er, z: sh + L1 * Math.sin(phi + al) };
    const p = (q) => P(q.x, q.y, q.z), Sh = p({ ...BASE, z: sh }), e = p(E), wr = p(w), tip = P(g.x, g.y, g.z), b = P(BASE.x, BASE.y, 0);
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
    const link = (a, q, wd) => [[col, wd * s + 2 * lw], [WHITE, wd * s]].forEach(([st, l]) => { c.strokeStyle = st; c.lineWidth = l; path([a, q]); c.stroke(); });
    const ell = (x, y, rx, ry) => { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.fillStyle = WHITE; c.fill(); c.strokeStyle = col; c.lineWidth = lw; c.stroke(); };
    ell(b[0], b[1], 78 * s, 40 * s);
    const bx = (x, y, ww, hh, rr) => { c.beginPath(); if (c.roundRect) c.roundRect(x, y, ww, hh, rr * s); else c.rect(x, y, ww, hh); c.fillStyle = WHITE; c.fill(); c.strokeStyle = col; c.lineWidth = lw; c.stroke(); };
    c.beginPath(); c.moveTo(b[0] - 44 * s, Sh[1]); c.lineTo(b[0] - 44 * s, b[1]); c.ellipse(b[0], b[1], 44 * s, 22 * s, 0, Math.PI, 0, true); c.lineTo(b[0] + 44 * s, Sh[1]); c.fillStyle = WHITE; c.fill(); c.strokeStyle = col; c.lineWidth = lw; c.stroke();
    const k = ce * s, gw = gap / 2;
    const hand = () => {
      link(wr, [wr[0], wr[1] + H.wrist * k], 30);
      bx(tip[0] - 38 * s, tip[1] - (H.fin + H.body) * k, 76 * s, (H.body - 8) * k, 8); bx(tip[0] - 66 * s, tip[1] - (H.fin + 12) * k, 132 * s, 14 * k, 3);
      bx(tip[0] - gw * s - 12 * s, tip[1] - H.fin * k, 12 * s, H.fin * k, 2); bx(tip[0] + gw * s, tip[1] - H.fin * k, 12 * s, H.fin * k, 2);
    };
    link(Sh, e, 52); link(e, wr, 42); hand();
    [[Sh, 34], [e, 29], [wr, 21]].forEach(([q, rr]) => { ell(q[0], q[1], rr * s, rr * s); c.beginPath(); c.arc(q[0], q[1], rr * 0.4 * s, 0, 7); c.stroke(); });
    c.restore();
  }
  const keys = (u, l) => { if (u <= l[0][0]) return l[0][1]; for (let i = 1; i < l.length; i++) if (u <= l[i][0]) { const k = smooth((u - l[i - 1][0]) / (l[i][0] - l[i - 1][0])), a = l[i - 1][1], b = l[i][1]; return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) }; } return l[l.length - 1][1]; };
  const endOf = (q, ok) => ({ x: q.x + (ok ? 0 : 48), y: q.y, z: 210, gap: ok ? CUBE + 6 : 18 }); // where an attempt leaves the gripper
  function attempt(q, u, ok, from) {
    const at = (z, e) => ({ x: q.x + (e || 0), y: q.y, z }), h = from || HOME, open = lerp(h.gap || 104, 104, smooth(u / 0.18));
    if (ok) { const g = keys(u, [[0, h], [0.28, at(150)], [0.46, at(6)], [0.58, at(6)], [0.95, at(210)]]); return { g, gap: lerp(open, CUBE + 6, smooth((u - 0.46) / 0.11)), lift: u > 0.56 ? Math.max(0, g.z - 6) : 0 }; }
    const g = keys(u, [[0, h], [0.3, at(160, 48)], [0.5, at(CUBE + 2, 48)], [0.64, at(CUBE + 2, 48)], [0.95, at(210, 48)]]);
    return { g, gap: lerp(open, 18, smooth((u - 0.52) / 0.1)), lift: 0 };
  }

  function draw(cv, ctx, w, h, t) {
    c = ctx; c.setTransform(cv.width / w, 0, 0, cv.width / w, 0, 0); c.clearRect(0, 0, w, h);
    s = Math.min(w / 1180, h / 830); lw = Math.max(1.15, 2.5 * s); ox = (w - 1145 * s) / 2 + 4 * s; oy = h - 175 * s;
    // table
    const th = 30, edge = '#8d95a1';
    poly([P(0, 0), P(W, 0), P(W, 0, -th), P(0, 0, -th)], '#f1f3f6', edge); poly([P(W, 0), P(W, D), P(W, D, -th), P(W, 0, -th)], '#e9ecf0', edge); poly([P(0, 0), P(W, 0), P(W, D), P(0, D)], WHITE, edge);

    const grouped = ramp(t, S(1) + 0.2, 1.3), sel = ramp(t, S(2) + 0.3, 0.7), rec = ramp(t, S(3) + 0.5, 0.9), upd = t >= S(5);
    const retry = [0, 1, 3], R0 = S(5) + 1.2, RD = 1.35; // after the update: three of the four are solved
    const solvedAt = (q) => (q.g === 0 && retry.includes(q.i) ? R0 + RD * (retry.indexOf(q.i) + 0.75) : Infinity);
    const regroup = 1 - ramp(t, R0 + RD * 3 + 0.2, 0.6);

    // where the policy succeeded: a small mark stays on the table
    const spot = (q, col, a) => { const r = 11; poly([P(q.x - r, q.y - r), P(q.x + r, q.y - r), P(q.x + r, q.y + r), P(q.x - r, q.y + r)], col, null); };
    ORDER.forEach((q, i) => { const a = q.ok ? ramp(t, doneAt(i), 0.25) : ramp(t, solvedAt(q), 0.25); if (a > 0) { c.globalAlpha = a; spot(q, q.ok ? '#c3c9d1' : RED); c.globalAlpha = 1; } });
    if (t > S(4) + 3) { spot(XI, RED); }

    // groups, drawn on the table
    RINGS.forEach((ring, k) => {
      if (grouped <= 0) return;
      const pts = ring.concat([ring[0]]).map((p) => P(p[0], p[1])), red = k === 0 ? sel : 0, a = (k === 0 ? 1 : lerp(1, 0.35, sel)) * (k === 0 ? regroup : 1);
      c.save(); c.globalAlpha = a; c.lineJoin = 'round';
      if (red) { poly(pts, `rgba(193,39,45,${0.08 * red})`, null); }
      let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      c.setLineDash([len * grouped, len]); path(pts); c.strokeStyle = mix(RED, INK, red); c.lineWidth = lw * lerp(1.1, 1.5, red); c.stroke(); c.restore();
    });

    // what the robot is doing
    let pose = { g: HOME, gap: 104, lift: 0 }, col = INK, live = null;
    if (t < T0 - 0.9) {
      if (t < SLOW * 3) { const i = Math.floor(t / SLOW); live = { q: ORDER[i], i }; pose = attempt(ORDER[i], (t / SLOW) % 1, ORDER[i].ok, i ? endOf(ORDER[i - 1], ORDER[i - 1].ok) : HOME); } else {
        const f = (t - SLOW * 3) / FAST, i = Math.min(ORDER.length - 1, 3 + Math.floor(f)), prev = ORDER[i - 1], q = ORDER[i];
        live = { q, i }; pose = attempt(q, 0.95 * (f % 1), q.ok, endOf(prev, prev.ok));
      }
    } else if (t < S(4)) { const q = ORDER[ORDER.length - 1], l = endOf(q, q.ok), k = smooth((t - (T0 - 0.9)) / 0.8); pose = { g: { x: lerp(l.x, HOME.x, k), y: lerp(l.y, HOME.y, k), z: lerp(210, HOME.z, k) }, gap: lerp(l.gap, 104, k), lift: 0 }; col = mix(GREY, INK, ramp(t, S(1), 0.6)); } else if (t < S(5)) { const u = clamp((t - S(4) - 0.2) / 3.2); pose = attempt(XI, u, true); col = mix(RED, GREY, ramp(t, S(4), 0.4)); live = { xi: true }; } else if (t < R0) { const k = smooth((t - S(5)) / 1.0); pose = { g: { x: lerp(XI.x, HOME.x, k), y: lerp(XI.y, HOME.y, k), z: lerp(210, HOME.z, k) }, gap: lerp(CUBE + 6, 104, k), lift: 0 }; col = mix(INK, RED, k); } else {
      const f = (t - R0) / RD, j = Math.floor(f);
      if (j < 3) { const q = fails[retry[j]], from = j ? endOf(fails[retry[j - 1]], true) : HOME; live = { q, again: true }; pose = attempt(q, f % 1, true, from); } else { const q = fails[retry[2]], k = smooth((f - 3) * RD / 0.9); pose = { g: { x: lerp(q.x, HOME.x, k), y: lerp(q.y, HOME.y, k), z: lerp(210, HOME.z, k) }, gap: lerp(CUBE + 6, 104, k), lift: 0 }; }
    }

    // objects, far to near; the one being lifted is drawn with the arm
    const items = [];
    ORDER.forEach((q, i) => {
      const at = doneAt(i), isLive = live && live.q === q;
      if (q.ok) { if (isLive) items.push({ q, z: pose.lift, a: 1 - ramp(t, at + (i < 3 ? 0.12 : 0), 0.2), o: { top: WHITE, side: '#e9ecf0', stroke: INK } }); return; }
      const seen = t >= at || isLive; if (!seen) return;
      const gone = ramp(t, solvedAt(q), 0.25); if (gone >= 1) return;
      const red = q.g === 0 ? sel * (upd ? 1 - ramp(t, S(5) + 0.2, 0.6) : 1) : 0, dim = q.g === 0 ? 0 : sel * 0.6, stroke = red > 0 ? mix(RED, INK, red) : mix(GREY, INK, dim);
      items.push({ q, z: isLive && live.again ? pose.lift : 0, a: 1 - gone, o: { top: red ? mix('#fbeceb', WHITE, red) : WHITE, side: red ? mix('#f6dcda', '#e9ecf0', red) : '#e9ecf0', stroke, x: t >= at && !(isLive && live.again) } });
    });
    if (rec > 0 && t < S(4) + 3.1) items.push({ q: XI, z: live && live.xi ? pose.lift : (1 - rec) * 150, a: rec * (1 - ramp(t, S(4) + 2.75, 0.3)), o: { top: '#d8585d', side: RED, stroke: '#8f1a1f' } });
    items.sort((a, b) => depth(b.q.x, b.q.y) - depth(a.q.x, a.q.y));
    const near = depth(pose.g.x, pose.g.y), held = items.filter((m) => m.z > 1 && live), ground = items.filter((m) => !held.includes(m));
    ground.forEach((m) => cube(m.q, m.z, { ...m.o, a: m.a }));
    held.forEach((m) => cube(m.q, m.z, { ...m.o, a: m.a }));
    arm(pose.g, pose.gap, col);
    ground.filter((m) => depth(m.q.x, m.q.y) < near - 40 && pose.g.z < 160).forEach((m) => cube(m.q, m.z, { ...m.o, a: m.a }));
    const fade = Math.max(1 - ramp(t, 0, 0.35), ramp(t, TOTAL - 0.5, 0.45));
    if (fade > 0.003) { c.globalAlpha = fade; c.fillStyle = WHITE; c.fillRect(0, 0, w, h); c.globalAlpha = 1; }
  }

  const cv = document.getElementById('teaser'), cap = document.getElementById('teaser-caption'), btn = document.getElementById('teaser-pause');
  const ctx = cv.getContext('2d'), reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let time = reduce ? S(3) + 2 : 0, playing = !reduce, last = null, w = 0, h = 0, dirty = true, seen = true, shown = -1;
  const size = () => { const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); w = r.width; h = r.height; cv.width = Math.round(w * d); cv.height = Math.round(h * d); dirty = true; };
  size(); new ResizeObserver(size).observe(cv);
  new IntersectionObserver((e) => { seen = e[e.length - 1].isIntersecting; }).observe(cv);
  const paint = () => {
    if (w) draw(cv, ctx, w, h, time);
    let k = 0; STAGES.forEach((q, i) => { if (time >= q.t) k = i; });
    if (k !== shown) { shown = k; cap.textContent = STAGES[k].text; }
  };
  const frame = (now) => {
    const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000); last = now;
    if (playing && seen && !document.hidden) { time = (time + dt) % TOTAL; dirty = true; }
    if (dirty) { paint(); dirty = false; }
    requestAnimationFrame(frame);
  };
  const label = () => { btn.textContent = playing ? 'Pause' : 'Play'; };
  btn.addEventListener('click', () => { playing = !playing; label(); document.dispatchEvent(new CustomEvent('motion', { detail: playing })); });
  label(); requestAnimationFrame(frame);
  window.TEASER = { TOTAL, STAGES, seek: (x) => { playing = false; time = x; paint(); label(); } };
})();
