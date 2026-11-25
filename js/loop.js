/* The acquisition loop: one schematic animation of DISEIL that runs through the whole page.
 *
 * Every frame is a pure function of time, so the large figure in the header, the margin figure beside the
 * text and the small dock on phones are views of the same clock. Nothing here is experiment data: start
 * configurations, failures and coverage come from the toy model below. The stage order, the 40 practice
 * resets per round, the discount on recently corrected modes and the two rejection rules follow the paper.
 */
(function () {
  'use strict';

  const INK = '#1e2430', MUTED = '#5e6773', GREY = '#98a0ab', LIGHT = '#d5dae1', RED = '#c1272d', WHITE = '#ffffff';
  const FONT = '"Source Sans 3", "Source Sans Pro", "Helvetica Neue", Arial, sans-serif';

  /* ---------------------------------------------------------------- stages */
  const STAGES = [
    { id: 'practice', name: 'Practice', secs: 6.6, text: 'The current policy runs from 40 random starts. Some attempts fail.' },
    { id: 'perceive', name: 'Perceive', secs: 4.6, text: 'Each failure is anchored at <em class="m">t*</em>, the first step of a sustained run of policy loss above a threshold. A vision-language model describes the failure.' },
    { id: 'partition', name: 'Partition', secs: 3.8, text: 'Failures with similar geometry at <em class="m">t*</em> are grouped into failure modes. No language model is involved.' },
    { id: 'prioritize', name: 'Prioritize', secs: 3.6, text: 'One large, high-loss mode is selected. Modes close to one already corrected are discounted.' },
    { id: 'prescribe', name: 'Prescribe', secs: 5.0, text: 'A language model proposes a start <em class="m red">ξ</em>. Infeasible or already solved proposals are sent back.' },
    { id: 'demonstrate', name: 'Demonstrate', secs: 4.2, text: 'The expert gives one demonstration from <em class="m red">ξ</em>.' },
    { id: 'update', name: 'Update', secs: 3.0, text: 'The policy is retrained with the new demonstration and practises again.' },
  ];
  const ROUND_SPEED = [1, 1.25, 1.25];
  const END_HOLD = 2.4;
  const TABLE = []; // {round, stage, t0, t1}
  let acc = 0;
  ROUND_SPEED.forEach((sp, r) => STAGES.forEach((s, i) => {
    const d = s.secs / sp;
    TABLE.push({ round: r, stage: i, t0: acc, t1: acc + d });
    acc += d;
  }));
  const TOTAL = acc + END_HOLD;

  /* ---------------------------------------------------------------- toy model (u in 0..1.5, v in 0..1) */
  const UMAX = 1.5;
  const BASE = [[0.2, 0.3], [0.44, 0.56], [0.62, 0.2], [0.2, 0.62], [0.78, 0.52]];
  const R0 = 0.25;
  // a prescribed demonstration solves a region of the same size as an initial one; lab: where its ξ label sits
  const XI = [{ u: 1.2, v: 0.28, r: R0, lab: [-1, 1.1] }, { u: 1.12, v: 0.82, r: R0, lab: [1, 1.1] }, { u: 0.4, v: 0.93, r: R0, lab: [-1, 1.1] }];
  const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
  const dist = (a, b) => Math.hypot(a.u - b.u, a.v - b.v);

  function solvedBy(q, n) {
    for (const b of BASE) if (Math.hypot(q.u - b[0], q.v - b[1]) < R0) return true;
    for (let i = 0; i < n; i++) if (dist(q, XI[i]) < XI[i].r) return true;
    return false;
  }
  const ROUNDS = XI.map((_, r) => {
    let pts;
    for (let k0 = 7 + r * 83; ; k0++) { // a sequence in which the round's target mode is a recurring failure
      pts = [];
      for (let k = k0; pts.length < 40; k++) {
        const q = { u: 0.05 + halton(k, 2) * 1.4, v: 0.06 + halton(k, 3) * 0.88 };
        q.ok = solvedBy(q, r);
        const d = XI.map((x) => dist(q, x)), o = d.slice().sort((e, f) => e - f);
        if (!q.ok && o[1] - o[0] < 0.2) continue; // the toy failures come in separate groups
        q.near = d.indexOf(o[0]);
        pts.push(q);
      }
      // at least four failures in at least two modes, the target within one member of the largest (as in the paper)
      const n = XI.map((_, j) => pts.filter((q) => !q.ok && q.near === j).length), size = n.filter(Boolean);
      const total = n.reduce((a, b) => a + b, 0), old = n.slice(0, r);
      if ((total >= 4 && size.length > 1 && Math.min(...size) > 1 && n[r] >= [6, 5, 4][r] && n[r] >= Math.max(...n) - 1 && old.every((c) => c === 0 || c <= 3) && (r === 0 || old.some((c) => c > 1))) || k0 > 4000) break;
    }
    // order: a lift, a miss, a miss, then everything else in sequence
    const ok = pts.filter((q) => q.ok), bad = pts.filter((q) => !q.ok);
    const far = bad.findIndex((q) => q.u > 1.03); // the example shown is one away from the base, where its labels fit
    if (far > 0) bad.unshift(bad.splice(far, 1)[0]);
    const lead = [ok[0], bad[0], bad[1] || ok[1]].filter(Boolean);
    const order = lead.concat(pts.filter((q) => !lead.includes(q)));
    bad.forEach((q) => { q.mode = q.near; });
    const modes = XI.map((_, j) => {
      const m = bad.filter((q) => q.mode === j);
      if (!m.length) return null;
      const cu = m.reduce((s, q) => s + q.u, 0) / m.length, cv = m.reduce((s, q) => s + q.v, 0) / m.length;
      const ring = [];
      m.forEach((q) => { for (let a = 0; a < 20; a++) ring.push([q.u + 0.058 * Math.cos(a * Math.PI / 10), q.v + 0.058 * Math.sin(a * Math.PI / 10)]); });
      const out = hull(ring), vs = out.map((p) => p[1]);
      return { u: cu, v: cv, out, top: Math.max(...vs), bottom: Math.min(...vs), n: m.length, pts: m, target: j === r, old: j < r };
    });
    return { pts: order, bad, modes, target: r };
  });

  /* ---------------------------------------------------------------- easing */
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const smooth = (x) => { const u = clamp(x); return u * u * (3 - 2 * u); };
  const ramp = (t, a, d) => smooth((t - a) / d);
  const lerp = (a, b, u) => a + (b - a) * u;

  /* ---------------------------------------------------------------- robot (side view, two-link inverse kinematics) */
  const A = { L1: 262, L2: 244, sh: 118, wrist: 58, body: 44, finger: 48, fw: 10, open: 92, cube: 56 };
  const cubeX = (q) => 200 + (q.u / UMAX) * 270;
  const yawOf = (q) => (q.v - 0.5) * 74;
  const HOME = { x: 215, y: 255 };

  function keys(u, list) {
    if (u <= list[0][0]) return { x: list[0][1], y: list[0][2] };
    for (let i = 1; i < list.length; i++) if (u <= list[i][0]) {
      const k = smooth((u - list[i - 1][0]) / (list[i][0] - list[i - 1][0]));
      return { x: lerp(list[i - 1][1], list[i][1], k), y: lerp(list[i - 1][2], list[i][2], k) };
    }
    const e = list[list.length - 1];
    return { x: e[1], y: e[2] };
  }
  function attempt(q, u, ok) {
    const x = cubeX(q);
    if (ok) {
      const g = keys(u, [[0, HOME.x, HOME.y], [0.3, x, 160], [0.5, x, 8], [0.62, x, 8], [0.95, x, 165]]);
      const gap = lerp(A.open, A.cube + 2, smooth((u - 0.5) / 0.11));
      return { g, gap, lift: u > 0.6 ? Math.max(0, g.y - 8) : 0 };
    }
    const e = x > 385 ? -46 : 46;
    const g = keys(u, [[0, HOME.x, HOME.y], [0.32, x + e, 165], [0.52, x + e, A.cube + 1], [0.66, x + e, A.cube + 1], [0.97, x + e, 185]]);
    return { g, gap: lerp(A.open, 16, smooth((u - 0.54) / 0.1)), lift: 0 };
  }

  function drawArm(c, M, pose, opt) {
    const o = Object.assign({ stroke: INK, alpha: 1, lw: 1.6, fill: WHITE }, opt || {});
    const S = { x: 0, y: A.sh }, g = pose.g;
    const W = { x: g.x, y: g.y + A.finger + A.body + A.wrist };
    const d = Math.min(Math.hypot(W.x - S.x, W.y - S.y), A.L1 + A.L2 - 1);
    const phi = Math.atan2(W.y - S.y, W.x - S.x);
    const al = Math.acos(Math.max(-1, Math.min(1, (A.L1 * A.L1 + d * d - A.L2 * A.L2) / (2 * A.L1 * d))));
    const E = { x: S.x + A.L1 * Math.cos(phi + al), y: S.y + A.L1 * Math.sin(phi + al) };
    const F = { x: g.x, y: g.y + A.finger + A.body };
    const P = (p) => [M.x(p.x), M.y(p.y)];
    c.save();
    c.globalAlpha *= o.alpha;
    c.lineJoin = 'round'; c.lineCap = 'round';
    const link = (a, b, w) => {
      const [ax, ay] = P(a), [bx, by] = P(b);
      c.strokeStyle = o.stroke; c.lineWidth = w * M.s + 2 * o.lw; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
      c.strokeStyle = o.fill; c.lineWidth = w * M.s; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
    };
    const box = (x, y, w, h, r) => {
      c.beginPath(); const X = M.x(x), Y = M.y(y + h), WW = w * M.s, HH = h * M.s;
      if (c.roundRect) c.roundRect(X, Y, WW, HH, r * M.s); else c.rect(X, Y, WW, HH);
      c.fillStyle = o.fill; c.fill(); c.strokeStyle = o.stroke; c.lineWidth = o.lw; c.stroke();
    };
    // base
    c.beginPath(); c.moveTo(...P({ x: -62, y: 0 })); c.lineTo(...P({ x: -44, y: 34 })); c.lineTo(...P({ x: 44, y: 34 })); c.lineTo(...P({ x: 62, y: 0 })); c.closePath();
    c.fillStyle = o.fill; c.fill(); c.strokeStyle = o.stroke; c.lineWidth = o.lw; c.stroke();
    box(-28, 34, 56, A.sh - 34, 2);
    link(S, E, 42); link(E, W, 34); link(W, F, 24);
    box(g.x - 34, F.y - A.body + 8, 68, A.body - 8, 8);
    box(g.x - 62, F.y - A.body - 1, 124, 13, 3);
    const fg = pose.gap / 2;
    box(g.x - fg - A.fw, g.y, A.fw, A.finger, 2); box(g.x + fg, g.y, A.fw, A.finger, 2);
    [[S, 27], [E, 23], [W, 17]].forEach(([p, r]) => {
      const [x, y] = P(p);
      c.beginPath(); c.arc(x, y, r * M.s, 0, 7); c.fillStyle = o.fill; c.fill(); c.strokeStyle = o.stroke; c.lineWidth = o.lw; c.stroke();
      c.beginPath(); c.arc(x, y, r * 0.4 * M.s, 0, 7); c.stroke();
    });
    c.restore();
  }

  const layer = document.createElement('canvas');
  function fadeArm(c, M, pose, a, opt) { // an arm drawn opaque on its own layer, then faded in as one piece
    if (a <= 0) return;
    if (a >= 1) { drawArm(c, M, pose, opt); return; }
    const cv = c.canvas, g = layer.getContext('2d');
    if (layer.width !== cv.width || layer.height !== cv.height) { layer.width = cv.width; layer.height = cv.height; }
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, layer.width, layer.height); g.setTransform(c.getTransform());
    drawArm(g, M, pose, opt);
    c.save(); c.globalAlpha *= a; c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(layer, 0, 0); c.restore();
  }

  function hull(pts) {
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of pts) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of pts.reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function drawCube(c, M, x, lift, yaw, opt) {
    const o = Object.assign({ stroke: INK, fill: '#eef0f3', alpha: 1, lw: 1.5, dash: null }, opt || {});
    const h = A.cube / 2, r = (yaw * Math.PI) / 180, top = [], bot = [];
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => {
      const X = a * h * Math.cos(r) - b * h * Math.sin(r), Z = a * h * Math.sin(r) + b * h * Math.cos(r);
      const px = M.x(x + X * 0.94 + Z * 0.22), py = (Y) => M.y(lift + Y + Z * 0.3 + h * 0.3);
      top.push([px, py(A.cube * 0.86)]); bot.push([px, py(0)]);
    });
    c.save(); c.globalAlpha *= o.alpha; c.lineJoin = 'round'; c.strokeStyle = o.stroke; c.lineWidth = o.lw; if (o.dash) c.setLineDash(o.dash);
    const poly = (ps) => { c.beginPath(); ps.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); };
    poly(hull(top.concat(bot))); if (o.fill) { c.fillStyle = o.fill; c.fill(); } c.stroke();
    poly(top); if (o.fill) { c.fillStyle = WHITE; c.fill(); } c.stroke();
    // the vertical edge nearest the viewer
    let n = 0; bot.forEach((p, i) => { if (p[1] > bot[n][1]) n = i; });
    c.beginPath(); c.moveTo(top[n][0], top[n][1]); c.lineTo(bot[n][0], bot[n][1]); c.stroke();
    c.restore();
  }

  let quiet = false; // the small dock view draws marks only
  const width = (c, txt, size, weight) => { c.save(); c.font = `${weight || 400} ${size}px ${FONT}`; const w = c.measureText(txt).width; c.restore(); return w; };
  function label(c, txt, x, y, opt) {
    if (quiet) return;
    const o = Object.assign({ size: 13, color: MUTED, weight: 400, align: 'left', italic: false, alpha: 1, halo: true }, opt || {});
    c.save(); c.globalAlpha *= o.alpha; c.font = `${o.italic ? 'italic ' : ''}${o.weight} ${o.size}px ${FONT}`; c.textAlign = o.align; c.textBaseline = 'middle';
    if (o.halo) { c.lineJoin = 'round'; c.strokeStyle = 'rgba(255,255,255,.94)'; c.lineWidth = 5; c.strokeText(txt, x, y); }
    c.fillStyle = o.color; c.fillText(txt, x, y); c.restore();
  }
  function diamond(c, x, y, r, fill, stroke) {
    c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.8; c.stroke(); }
  }

  /* ---------------------------------------------------------------- state */
  function stateAt(t) {
    const T = t >= 0 && t < TOTAL ? t : ((t % TOTAL) + TOTAL) % TOTAL;
    for (const e of TABLE) if (T < e.t1) {
      const sp = ROUND_SPEED[e.round];
      return { t: T, round: e.round, stage: e.stage, id: STAGES[e.stage].id, tau: (T - e.t0) * sp, p: (T - e.t0) / (e.t1 - e.t0), fade: t >= TOTAL && T < 0.4 ? smooth(T / 0.4) : 1 };
    }
    const last = STAGES.length - 1;
    const k = (T - acc) / END_HOLD;
    return { t: T, round: ROUND_SPEED.length - 1, stage: last, id: 'update', tau: STAGES[last].secs, p: 1, fade: 1 - smooth((k - 0.72) / 0.28) };
  }

  const RELEASE = 3.0;  // practice: the first three rollouts are shown one at a time
  function revealTime(i) { return i < 3 ? 1.0 * (i + 0.86) : RELEASE + 0.15 + ((i - 3) / 37) * 2.6; }
  // where the third attempt comes from: rejection rule shown in each round
  const REJECT = ['outside', 'solved', null];
  const REJECT_TEXT = { outside: 'out of reach', solved: 'already solved' };

  /* ---------------------------------------------------------------- right panel: map of start configurations */
  function drawField(c, b, st, big, tiny) { // tiny: the dock, marks only
    const R = ROUNDS[st.round], X = (u) => b.x + (u / UMAX) * b.w, Y = (v) => b.y + (1 - v) * b.h;
    const fs = big ? 15 : 12;
    const idx = st.stage;
    const grown = st.id === 'update' ? smooth((st.tau - 0.15) / 1.7) : 0;

    // coverage: a matrix of start configurations, dark where the policy succeeds
    const nx = big ? 48 : tiny ? 24 : 34, ny = big ? 32 : tiny ? 16 : 23;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const q = { u: ((i + 0.5) / nx) * UMAX, v: (j + 0.5) / ny };
      let a = solvedBy(q, st.round) ? 1 : 0, red = 0;
      if (!a && grown > 0) {
        const x = XI[st.round], d = dist(q, x);
        if (d < x.r * grown) { a = 1; red = 1 - smooth((st.tau - 1.2 - d * 1.2) / 1.1); }
      }
      c.beginPath(); c.arc(X(q.u), Y(q.v), a ? (big ? 1.75 : tiny ? 1.15 : 1.4) : (big ? 1.2 : tiny ? 0.8 : 0.95), 0, 7);
      c.fillStyle = a ? (red > 0.02 ? mix(RED, '#7d8794', red) : '#7d8794') : '#dfe3e8';
      c.fill();
    }

    // failure modes
    const formed = idx > 2 ? 1 : idx === 2 ? ramp(st.tau, 1.3, 0.9) : 0;
    const sel = idx > 3 ? 1 : idx === 3 ? ramp(st.tau, 1.3, 0.6) : 0;
    const gone = st.id === 'update' ? 1 - ramp(st.tau, 0.5, 0.9) : 1;
    R.modes.forEach((m) => {
      if (!m || formed <= 0) return;
      const tgt = m.target;
      const dim = tgt ? 1 : lerp(1, 0.4, sel);
      c.save(); c.globalAlpha *= formed * gone * dim;
      c.beginPath(); m.out.forEach((p, i) => (i ? c.lineTo(X(p[0]), Y(p[1])) : c.moveTo(X(p[0]), Y(p[1])))); c.closePath();
      if (tgt && sel > 0) { c.fillStyle = `rgba(193,39,45,${0.07 * sel})`; c.fill(); }
      c.lineWidth = tgt ? lerp(1.4, 2.4, sel) : 1.4; c.strokeStyle = tgt ? mix(RED, INK, sel) : INK;
      if (m.old && sel > 0) c.setLineDash([5, 5]);
      c.stroke(); c.restore();
      const pad = big ? 14 : 10, above = Y(m.top) - pad, ly = above > b.y - 8 ? above : Y(m.bottom) + pad;
      if (tiny) return;
      if (m.old && sel > 0) label(c, 'corrected earlier', clampX(X(m.u), b, width(c, 'corrected earlier', fs) / 2 - 8), ly, { size: fs, align: 'center', alpha: sel * gone });
      else if (tgt && sel > 0) label(c, 'selected', X(m.u), ly, { size: fs + 0.5, color: RED, weight: 600, align: 'center', alpha: sel * gone });
    });

    // demonstrations so far
    BASE.forEach(([u, v]) => { c.fillStyle = INK; const r = big ? 4 : tiny ? 1.8 : 3; c.fillRect(X(u) - r, Y(v) - r, 2 * r, 2 * r); });
    for (let i = 0; i < st.round; i++) diamond(c, X(XI[i].u), Y(XI[i].v), big ? 8 : tiny ? 4 : 6, RED, WHITE);

    // practice rollouts
    R.pts.forEach((q, i) => {
      const a = idx === 0 ? ramp(st.tau, revealTime(i), 0.22) : 1;
      if (a <= 0) return;
      let x = X(q.u), y = Y(q.v);
      if (q.ok) {
        const f = idx === 0 ? a : 1 - (idx === 1 ? ramp(st.tau, 0, 0.8) : 1);
        if (f <= 0) return;
        c.globalAlpha = f; c.beginPath(); c.arc(x, y, (big ? 4 : tiny ? 1.9 : 3) * a, 0, 7); c.fillStyle = INK; c.fill(); c.globalAlpha = 1;
        return;
      }
      const m = R.modes[q.mode];
      const inT = m.target, dim = inT ? 1 : lerp(1, 0.35, sel);
      const hid = Math.hypot(x - X(XI[st.round].u), y - Y(XI[st.round].v)) < (big ? 12 : tiny ? 6.5 : 10) ? (idx > 4 ? 1 : idx === 4 ? ramp(st.tau, REJECT[st.round] ? 2.6 : 0.8, 0.45) : 0) : 0; // a ring under the ξ diamond
      c.save(); c.globalAlpha *= a * dim * gone * (1 - hid);
      const rr = (big ? 5.2 : tiny ? 2.5 : 3.9) * (1 + 0.5 * (1 - a));
      c.beginPath(); c.arc(x, y, rr, 0, 7); c.fillStyle = WHITE; c.fill();
      c.lineWidth = big ? 1.8 : tiny ? 1.1 : 1.5; c.strokeStyle = inT ? mix(RED, INK, sel) : INK; c.stroke();
      const anch = idx > 1 ? 1 : idx === 1 ? ramp(st.tau, 0.5 + 2.2 * (R.bad.indexOf(q) / Math.max(1, R.bad.length)), 0.35) : 0;
      if (anch > 0) { c.beginPath(); c.arc(x, y, (big ? 2.1 : tiny ? 1 : 1.6) * anch, 0, 7); c.fillStyle = inT ? mix(RED, INK, sel) : INK; c.fill(); }
      c.restore();
    });

    // the proposal
    const x1 = XI[st.round];
    if (st.id === 'prescribe') {
      const rej = REJECT[st.round];
      const t2 = rej ? 2.6 : 0.8;
      if (rej) {
        const bad = rej === 'outside' ? { x: b.x + b.w + (big ? 24 : tiny ? 5 : 12), y: Y(x1.v + 0.04) } : { x: X(0.84), y: Y(0.64) };
        const a = ramp(st.tau, 0.6, 0.4) * (1 - ramp(st.tau, 2.2, 0.4));
        c.save(); c.globalAlpha *= a; diamond(c, bad.x, bad.y, big ? 11 : tiny ? 5 : 8.5, WHITE, RED);
        const s = big ? 4 : tiny ? 1.8 : 3, cross = ramp(st.tau, 1.15, 0.25);
        c.strokeStyle = RED; c.lineWidth = 1.5; c.beginPath(); c.moveTo(bad.x - s, bad.y - s); c.lineTo(bad.x - s + 2 * s * cross, bad.y - s + 2 * s * cross); c.moveTo(bad.x + s, bad.y - s); c.lineTo(bad.x + s - 2 * s * cross, bad.y - s + 2 * s * cross); c.stroke(); c.restore();
      }
      const a2 = ramp(st.tau, t2, 0.45);
      if (a2 > 0) { c.save(); c.globalAlpha *= a2; diamond(c, X(x1.u), Y(x1.v), (big ? 10 : tiny ? 5 : 7.5) * lerp(1.7, 1, a2), RED, WHITE); c.restore(); if (!tiny) label(c, 'ξ', X(x1.u) + x1.lab[0] * (big ? 18 : 14), Y(x1.v) + x1.lab[1] * (big ? 14 : 11), { size: big ? 21 : 16, color: RED, italic: true, weight: 600, align: 'center', halo: false, alpha: a2 }); }
    }
    if (st.id === 'demonstrate' || st.id === 'update') {
      const pulse = st.id === 'demonstrate' ? (st.tau * 0.75) % 1 : 0;
      if (st.id === 'demonstrate') { c.save(); c.globalAlpha *= (1 - pulse) * 0.5; c.beginPath(); c.arc(X(x1.u), Y(x1.v), (big ? 10 : tiny ? 5 : 7) + pulse * (big ? 30 : tiny ? 12 : 20), 0, 7); c.strokeStyle = RED; c.lineWidth = 1.6; c.stroke(); c.restore(); }
      diamond(c, X(x1.u), Y(x1.v), big ? 10 : tiny ? 5 : 7.5, RED, WHITE);
      if (st.id === 'demonstrate' && !tiny) label(c, 'ξ', X(x1.u) + x1.lab[0] * (big ? 18 : 14), Y(x1.v) + x1.lab[1] * (big ? 14 : 11), { size: big ? 21 : 16, color: RED, italic: true, weight: 600, align: 'center', halo: false });
    }
    if (tiny) return;
    // axes
    c.strokeStyle = LIGHT; c.lineWidth = 1; c.beginPath(); c.moveTo(b.x - 8, b.y - 6); c.lineTo(b.x - 8, b.y + b.h + 8); c.lineTo(b.x + b.w + 4, b.y + b.h + 8); c.stroke();
    label(c, 'object position', b.x + b.w, b.y + b.h + (big ? 24 : 18), { size: fs, align: 'right', halo: false });
    c.save(); c.translate(b.x - (big ? 22 : 17), b.y); c.rotate(-Math.PI / 2); label(c, 'object rotation', 0, 0, { size: fs, align: 'right', halo: false }); c.restore();
  }
  function clampX(x, b, m) { return Math.max(b.x + m, Math.min(b.x + b.w - m, x)); }
  function mix(a, b, k) { // k=1 -> a
    const h = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)), A1 = h(a), B1 = h(b);
    return `rgb(${A1.map((v, i) => Math.round(lerp(B1[i], v, clamp(k)))).join(',')})`;
  }

  /* ---------------------------------------------------------------- left panel: the robot */
  function drawRobot(c, b, st, big, tiny) {
    const R = ROUNDS[st.round], fs = big ? 15 : 12.5;
    const traceH = big ? 64 : tiny ? 16 : b.h < 230 ? 40 : 48;
    const s = Math.min(b.w / 640, (b.h - traceH - (tiny ? 4 : 18)) / 440);
    const ox = b.x + (b.w - 640 * s) / 2 + 84 * s, ty = b.y + b.h - traceH - (tiny ? 2 : 14);
    const M = { s, x: (x) => ox + x * s, y: (y) => ty - y * s };
    const line = (x0, x1) => { c.strokeStyle = INK; c.lineWidth = 1.6; c.beginPath(); c.moveTo(M.x(x0), ty); c.lineTo(M.x(x1), ty); c.stroke(); };
    line(-80, 502);
    c.strokeStyle = LIGHT; c.lineWidth = 1; if (!quiet) for (let x = -60; x < 502; x += 26) { c.beginPath(); c.moveTo(M.x(x), ty + 2); c.lineTo(M.x(x) - 7, ty + 9); c.stroke(); }
    const xi = XI[st.round], firstBad = R.bad[0];

    if (st.id === 'practice') {
      let q, u;
      if (st.tau < RELEASE) { const i = Math.min(2, Math.floor(st.tau)); q = R.pts[i]; u = st.tau - i; }
      else if (st.tau < 6.1) { const j = Math.floor((st.tau - RELEASE) / 0.52); q = R.pts[(3 + j * 6) % R.pts.length]; u = ((st.tau - RELEASE) % 0.52) / 0.52; }
      else { q = R.pts[39]; u = 0; }
      const a = attempt(q, u, q.ok);
      drawCube(c, M, cubeX(q), a.lift, yawOf(q));
      drawArm(c, M, a);
      const done = u > 0.8 && st.tau < RELEASE;
      if (done) label(c, q.ok ? 'lifted' : 'missed', M.x(cubeX(q)) + (q.ok ? 0 : -34 * s), ty + (big ? 24 : 17), { size: fs, align: 'center', color: INK, weight: 600 });
    } else if (st.id === 'perceive') {
      const q = firstBad, pose = (u) => attempt(q, u, false);
      drawCube(c, M, cubeX(q), 0, yawOf(q));
      [[0.06, -0.5], [0.96, 2.1]].forEach(([u, at]) => fadeArm(c, M, pose(u), ramp(st.tau, at, 0.5), { stroke: '#b4bbc5' }));
      fadeArm(c, M, pose(0.5), ramp(st.tau, 1.1, 0.5));
      const tag = (u, txt, at, col) => { const g = pose(u).g; label(c, txt, M.x(g.x) + 48 * s, M.y(g.y + 120), { size: fs + (txt === 't*' ? 2 : 0), color: col, italic: txt === 't*', weight: txt === 't*' ? 600 : 400, alpha: ramp(st.tau, at, 0.4) }); };
      tag(0.06, 'start', 0.4, MUTED); tag(0.5, 't*', 1.4, INK); tag(0.96, 'end', 2.3, MUTED);
      // loss trace
      const x0 = M.x(-40), x1 = M.x(500), y0 = quiet ? ty + 14 : ty + traceH + 2, h = quiet ? 10 : traceH - 20, n = 64, prog = clamp((st.tau - 0.2) / 2.5);
      const loss = (k) => 0.16 + 0.05 * Math.sin(k * 31) + 0.04 * Math.sin(k * 73 + 1) + 0.32 * Math.exp(-(((k - 0.27) / 0.018) ** 2)) + 0.5 * smooth((k - 0.46) / 0.14) + 0.03 * Math.sin(k * 47);
      c.strokeStyle = GREY; c.lineWidth = 1; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(x0, y0 - h * 0.5); c.lineTo(x1, y0 - h * 0.5); c.stroke(); c.setLineDash([]);
      c.strokeStyle = INK; c.lineWidth = 1.6; c.beginPath();
      for (let i = 0; i <= n * prog; i++) { const k = i / n, X1 = lerp(x0, x1, k), Y1 = y0 - h * loss(k); i ? c.lineTo(X1, Y1) : c.moveTo(X1, Y1); } c.stroke();
      const ts = 36 / 64;
      if (prog > ts) { c.strokeStyle = INK; c.lineWidth = 1.8; c.beginPath(); c.moveTo(lerp(x0, x1, ts), y0 + 2); c.lineTo(lerp(x0, x1, ts), y0 - h * 1.05); c.stroke(); }
      label(c, 'policy loss', x0, y0 - h * 0.92, { size: fs - 0.5 }); label(c, 'η', x1 + 8, y0 - h * 0.5, { size: fs + 2, italic: true });
    } else if (st.id === 'partition') {
      const q = firstBad, p = attempt(q, 0.5, false), xc = cubeX(q), on = (a) => ramp(st.tau, a, 0.5), side = p.g.x < xc ? -1 : 1;
      drawCube(c, M, xc, 0, yawOf(q)); drawArm(c, M, p, { stroke: '#a3abb6' });
      c.strokeStyle = RED; c.lineWidth = quiet ? 1.1 : 1.6;
      // position
      c.save(); c.globalAlpha *= on(0.2); c.beginPath(); const yp = ty + (quiet ? 9 : 20), tk = quiet ? 4 : 6; c.moveTo(M.x(0), yp); c.lineTo(M.x(xc), yp); c.moveTo(M.x(0), yp - tk); c.lineTo(M.x(0), yp + tk); c.moveTo(M.x(xc), yp - tk); c.lineTo(M.x(xc), yp + tk); c.stroke(); c.restore();
      label(c, 'position', M.x(xc / 2), ty + (big ? 38 : 33), { size: fs, color: RED, align: 'center', alpha: on(0.3) });
      // rotation: an arc on the side of the cube away from the gripper
      const wr = width(c, 'rotation', fs), wd = width(c, 'distance', fs);
      c.save(); c.globalAlpha *= on(0.7); c.beginPath(); c.ellipse(M.x(xc), M.y(30), 46 * s, 15 * s, 0, (side < 0 ? -0.32 : 0.45) * Math.PI, (side < 0 ? 0.55 : 1.32) * Math.PI); c.stroke(); c.restore();
      const room = b.x + b.w - wr - 2, rx = side < 0 ? M.x(xc + 56) : M.x(xc - 56) - wr, clampR = side < 0 && rx > room;
      label(c, 'rotation', clampR ? room : Math.max(rx, M.x(74)), clampR ? M.y(84) : M.y(32), { size: fs, color: RED, alpha: on(0.8) });
      // distance: between the fingertips and the object
      c.save(); c.globalAlpha *= on(1.2); c.setLineDash([3, 3]); c.beginPath(); c.moveTo(M.x(p.g.x), M.y(p.g.y + 18)); c.lineTo(M.x(xc), M.y(26)); c.stroke(); c.restore();
      label(c, 'distance', side < 0 ? M.x(p.g.x - 66) - wd : Math.min(M.x(p.g.x + 66), b.x + b.w - wd - 2), M.y(p.g.y + 22), { size: fs, color: RED, alpha: on(1.3) });
    } else if (st.id === 'prioritize') {
      const m = R.modes[R.target];
      const row = [];
      m.pts.slice().sort((p, q) => p.u - q.u).forEach((q) => { if (!row.length || cubeX(q) - cubeX(row[row.length - 1]) > 34) row.push(q); });
      row.forEach((q, i) => drawCube(c, M, cubeX(q), 0, yawOf(q), { stroke: RED, fill: '#fdf4f4', alpha: ramp(st.tau, 0.9 + i * 0.16, 0.4) }));
      drawArm(c, M, { g: HOME, gap: A.open }, { stroke: '#a3abb6' });
      label(c, 'failures in the selected mode', Math.min(M.x(cubeX({ u: m.u })), b.x + b.w - width(c, 'failures in the selected mode', fs) / 2 - 2), ty + (big ? 24 : 17), { size: fs, color: RED, align: 'center', alpha: ramp(st.tau, 1.7, 0.4) });
    } else if (st.id === 'prescribe') {
      drawArm(c, M, { g: HOME, gap: A.open }, { stroke: '#a3abb6' });
      const rej = REJECT[st.round], t2 = rej ? 2.6 : 0.8;
      if (rej) {
        const a = ramp(st.tau, 0.6, 0.4) * (1 - ramp(st.tau, 2.2, 0.4));
        const bx = rej === 'outside' ? 526 : cubeX({ u: 0.84 });
        drawCube(c, M, bx, 0, 14, { stroke: RED, fill: null, alpha: a, dash: [4, 3] });
        c.save(); c.globalAlpha *= a * ramp(st.tau, 1.15, 0.25); c.strokeStyle = RED; c.lineWidth = 2; const X1 = M.x(bx), Y1 = M.y(34), r = 17 * s + 3; c.beginPath(); c.moveTo(X1 - r, Y1 - r); c.lineTo(X1 + r, Y1 + r); c.moveTo(X1 + r, Y1 - r); c.lineTo(X1 - r, Y1 + r); c.stroke(); c.restore();
        label(c, REJECT_TEXT[rej], M.x(rej === 'outside' ? 554 : bx), ty + (big ? 24 : 17), { size: fs, color: RED, align: rej === 'outside' ? 'right' : 'center', alpha: ramp(st.tau, 1.2, 0.3) * (1 - ramp(st.tau, 2.2, 0.4)) });
      }
      const a2 = ramp(st.tau, t2, 0.45);
      if (a2 > 0) { drawCube(c, M, cubeX(xi), 0, yawOf(xi), { stroke: RED, fill: '#fbeceb', alpha: a2, lw: 1.9 }); label(c, 'start here', M.x(cubeX(xi)), ty + (big ? 24 : 17), { size: fs, color: RED, weight: 600, align: 'center', alpha: a2 }); }
    } else if (st.id === 'demonstrate') {
      const u = clamp((st.tau - 0.1) / 3.5), a = attempt(xi, u, true);
      drawCube(c, M, cubeX(xi), a.lift, yawOf(xi), { stroke: RED, fill: '#fbeceb', lw: 1.9 });
      drawArm(c, M, a, { stroke: RED, lw: 1.9 });
      label(c, 'expert demonstration', M.x(cubeX(xi)), ty + (big ? 24 : 17), { size: fs, color: RED, weight: 600, align: 'center' });
    } else {
      const back = smooth((st.tau - 0.1) / 1.0), x = cubeX(xi);
      drawCube(c, M, x, 157, yawOf(xi), { stroke: RED, fill: '#fbeceb', lw: 1.9, alpha: 1 - ramp(st.tau, 0, 0.35) });
      drawArm(c, M, { g: { x: lerp(x, HOME.x, back), y: lerp(165, HOME.y, back) }, gap: lerp(A.cube + 2, A.open, back) }, { stroke: mix(RED, INK, 1 - back) });
      label(c, 'policy retrained', M.x(250), ty + (big ? 24 : 17), { size: fs, color: INK, weight: 600, align: 'center', alpha: ramp(st.tau, 0.5, 0.4) });
    }
  }

  /* ---------------------------------------------------------------- views */
  const views = [];
  const api = { STAGES, TOTAL, time: 0, playing: true, held: null, round: 0, onStage: [], stateAt };

  function addView(canvas) { // the drawing adapts to the canvas: robot + map, or the map alone when very small
    const v = { canvas, ctx: canvas.getContext('2d'), w: 0, h: 0, visible: true };
    const size = () => {
      const r = canvas.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
      if (!r.width) { v.w = 0; return; }
      v.w = r.width; v.h = r.height; canvas.width = Math.round(r.width * d); canvas.height = Math.round(r.height * d); v.ctx.setTransform(d, 0, 0, d, 0, 0); v.dirty = true;
    };
    size();
    if ('ResizeObserver' in window) new ResizeObserver(size).observe(canvas); else window.addEventListener('resize', size);
    if ('IntersectionObserver' in window) new IntersectionObserver((es) => { v.visible = es[es.length - 1].isIntersecting; v.dirty = true; }).observe(canvas);
    views.push(v);
    return v;
  }
  function paint(v, st) { // drawn opaque, then faded as one piece
    draw(v, st);
    if (st.fade < 1 && v.w) { const c = v.ctx; c.save(); c.globalAlpha = 1 - st.fade; c.fillStyle = WHITE; c.fillRect(0, 0, v.w, v.h); c.restore(); }
  }
  function draw(v, st) {
    const c = v.ctx; c.clearRect(0, 0, v.w, v.h); if (!v.w) return;
    c.globalAlpha = 1;
    quiet = v.h < 150;
    const mapOnly = v.w < 200;
    if (mapOnly) { drawField(c, { x: 2, y: 2, w: v.w - 14, h: v.h - 4 }, st, false, true); quiet = false; return; }
    const wide = v.w / v.h > 1.5, big = v.w > 620;
    if (quiet) {
      drawRobot(c, { x: 0, y: 2, w: v.w * 0.44, h: v.h - 4 }, st, false, true);
      const fh = v.h - 6; drawField(c, { x: v.w - fh * UMAX - 16, y: 3, w: fh * UMAX, h: fh }, st, false, true); quiet = false; return;
    }
    if (wide) {
      const gap = v.w * 0.075, rw = v.w * 0.43;
      drawRobot(c, { x: 0, y: 8, w: rw, h: v.h - 12 }, st, big);
      const fx = rw + gap, fw = v.w - fx - (big ? 46 : 22), fh = Math.min(v.h - 58, fw / UMAX);
      drawField(c, { x: fx, y: (v.h - fh) / 2 - 8, w: fh * UMAX > fw ? fw : fh * UMAX, h: fh }, st, big);
    } else {
      const fw = v.w - 52, fh = Math.min(fw / UMAX, v.h * (v.h < 420 ? 0.42 : 0.47)), rh = v.h - fh - 44;
      drawRobot(c, { x: 0, y: 0, w: v.w, h: rh }, st, big);
      drawField(c, { x: fh * UMAX < fw - 24 ? (v.w - fh * UMAX) / 2 + 10 : 30, y: rh + 14, w: fh * UMAX, h: fh }, st, big);
    }
  }
  function currentTime() {
    if (api.held === null) return api.time;
    const e = TABLE[api.held], d = e.t1 - e.t0, hold = 1.1;
    const k = api.time % (d + hold);
    return e.t0 + Math.max(1e-3, Math.min(k, d - 1e-3));
  }
  let last = null, prevKey = '';
  function notify(st) {
    const key = st.stage + ':' + st.round;
    api.onStage.forEach((f) => f(st, key !== prevKey));
    prevKey = key;
  }
  function frame(now) {
    const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000); last = now;
    if (api.playing && !document.hidden) api.time += dt;
    const st = stateAt(currentTime());
    if (api.playing || views.some((v) => v.dirty)) {
      views.forEach((v) => { if ((v.visible || v.dirty) && v.w) paint(v, st); v.dirty = false; });
      notify(st);
    }
    requestAnimationFrame(frame);
  }
  api.addView = addView;
  api.paintNow = () => { const st = stateAt(currentTime()); views.forEach((v) => paint(v, st)); notify(st); };
  api.start = () => requestAnimationFrame(frame);
  api.redraw = () => views.forEach((v) => { v.dirty = true; });
  api.setPlaying = (p) => { api.playing = p; api.redraw(); };
  api.jump = (stage, at) => { // go to a stage of the first round and keep running
    const e = TABLE[stage]; api.held = null; api.time = e.t0 + Math.max(1e-3, (at || 0) * (e.t1 - e.t0)); api.redraw();
  };
  let saved = 0;
  api.hold = (stage) => { // loop one stage while the reader is on its text, then carry on from where the loop was
    if (stage === api.held) return;
    if (stage === null) { api.held = null; api.time = saved; } else {
      if (api.held === null) saved = api.time;
      const e = TABLE[stage]; api.held = stage; api.time = api.playing ? 0 : 0.9 * (e.t1 - e.t0);
    }
    api.redraw();
  };
  api.seekStill = (stage, p, round) => { const e = TABLE[stage + STAGES.length * (round || 0)]; api.held = null; api.time = e.t0 + p * (e.t1 - e.t0); api.redraw(); };
  window.DISEIL_LOOP = api;
})();
