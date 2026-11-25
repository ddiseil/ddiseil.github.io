/* Final policy success (Table 1 of the paper): one mark per method, hover for values, zoom, highlight a method. */
(function () {
  'use strict';
  const root = document.getElementById('chart'), d = JSON.parse(document.getElementById('table1').textContent);
  const STYLE = { // colours pass an all-pairs colour-blind check; shape repeats the identity
    DISEIL: ['#c1272d', 'diamond'], SafeDAgger: ['#876df9', 'circle'], DropoutDAgger: ['#1442be', 'square'], EnsembleDAgger: ['#3fc347', 'up'],
    ThriftyDAgger: ['#7d2386', 'down'], 'Diff-DAgger': ['#6bbaf0', 'star'], Stagger: ['#e166ab', 'plus'],
  };
  const LEGEND = ['DISEIL', 'SafeDAgger', 'DropoutDAgger', 'EnsembleDAgger', 'ThriftyDAgger', 'Diff-DAgger', 'Stagger'];
  const FULL = [66, 101], MIN = 1.5, NS = 'http://www.w3.org/2000/svg', fmt = (v) => v.toFixed(1);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = (n, a, p, t) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); if (t !== undefined) e.textContent = t; return e; };
  const shape = (kind, r) => {
    const pts = (n, f) => Array.from({ length: n }, (_, i) => f(i)).map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L');
    const pol = (n, rr, a0) => `M${pts(n, (i) => { const a = a0 + i * 2 * Math.PI / n, q = typeof rr === 'function' ? rr(i) : rr; return [q * Math.cos(a), q * Math.sin(a)]; })}Z`;
    if (kind === 'circle') return `M${-r} 0A${r} ${r} 0 1 1 ${r} 0A${r} ${r} 0 1 1 ${-r} 0Z`;
    if (kind === 'square') { const s = r * 0.9; return `M${-s} ${-s}H${s}V${s}H${-s}Z`; }
    if (kind === 'up') return pol(3, r * 1.25, -Math.PI / 2); if (kind === 'down') return pol(3, r * 1.25, Math.PI / 2);
    if (kind === 'star') return pol(10, (i) => (i % 2 ? r * 0.56 : r * 1.32), -Math.PI / 2);
    if (kind === 'plus') { const a = r * 1.12, b = r * 0.42; return `M${-b} ${-a}H${b}V${-b}H${a}V${b}H${b}V${a}H${-b}V${b}H${-a}V${-b}H${-b}Z`; }
    return pol(4, r * 1.5, -Math.PI / 2);
  };
  const dark = (h) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * 0.72).toString(16).padStart(2, '0')).join('');
  const data = d.rows.map((r) => ({ task: r.task, obs: r.obs, pts: d.methods.map((m, j) => r.vals[j] && { m, v: r.vals[j][0], s: r.vals[j][1] }).filter(Boolean) }));

  let dom = FULL.slice(), goal = FULL.slice(), pinned = null, hover = null, hotM = null, geo = null, anim = 0;

  /* legend and buttons */
  const legend = root.querySelector('.legend'), host = root.querySelector('.plot'), tip = root.querySelector('.tip'), live = root.querySelector('[aria-live]');
  LEGEND.forEach((m) => {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-pressed', 'false'); b.dataset.m = m;
    b.innerHTML = `<svg width="20" height="20" viewBox="-10 -10 20 20" aria-hidden="true"><path d="${shape(STYLE[m][1], m === 'DISEIL' ? 6 : 6.2)}" fill="${STYLE[m][0]}" stroke="${dark(STYLE[m][0])}" stroke-width="1"/></svg>${m}`;
    b.addEventListener('click', () => { pinned = pinned === m ? null : m; paint(); });
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { hotM = m; paint(); } });
    b.addEventListener('pointerleave', () => { hotM = null; paint(); });
    legend.appendChild(b);
  });
  const zoomTo = (a, b) => {
    let span = Math.max(MIN, Math.min(FULL[1] - FULL[0], b - a)), c = (a + b) / 2; a = Math.max(FULL[0], Math.min(FULL[1] - span, c - span / 2)); b = a + span; goal = [a, b];
    const from = dom.slice(), t0 = performance.now(); cancelAnimationFrame(anim); tip.hidden = true; hover = null;
    if (reduce) { dom = [a, b]; paint(); return; }
    const tick = (now) => { const k = Math.min(1, (now - t0) / 260), e = k * k * (3 - 2 * k); dom = [from[0] + (a - from[0]) * e, from[1] + (b - from[1]) * e]; paint(); if (k < 1) anim = requestAnimationFrame(tick); };
    anim = requestAnimationFrame(tick);
  };
  const setDom = (a, b) => { const span = Math.max(MIN, Math.min(FULL[1] - FULL[0], b - a)); a = Math.max(FULL[0], Math.min(FULL[1] - span, a)); cancelAnimationFrame(anim); dom = [a, a + span]; goal = dom.slice(); tip.hidden = true; hover = null; paint(); };
  const by = (f, at) => { const c = at === undefined ? (dom[0] + dom[1]) / 2 : at; return [c - (c - dom[0]) * f, c + (dom[1] - c) * f]; };
  const step = (f) => { const c = (goal[0] + goal[1]) / 2, h = (goal[1] - goal[0]) / 2 * f; return [c - h, c + h]; };
  root.querySelector('[data-z="in"]').addEventListener('click', () => zoomTo(...step(0.5)));
  root.querySelector('[data-z="out"]').addEventListener('click', () => zoomTo(...step(2)));
  root.querySelector('[data-z="reset"]').addEventListener('click', () => { pinned = null; zoomTo(...FULL); });

  /* drawing */
  function layout(W) {
    const n = W < 640, left = n ? 58 : 168, right = n ? 62 : 132, pitch = n ? 78 : W < 800 ? 76 : 56, gap = n ? 34 : 12, top = n ? 44 : 34;
    const y = data.map((_, i) => top + (n ? Math.floor(i / 2) + 1 : Math.floor(i / 2)) * gap - (n ? 10 : 0) + i * pitch + pitch / 2);
    return { W, n, left, right, pitch, gap, top, y, r: n ? 4.5 : 5.4, H: y[9] + pitch / 2 + 62, x0: left, x1: W - right };
  }
  function place(g, X) { // keep marks that would overlap apart, vertically, around their row
    const gapPx = g.r * 2 + 1.2, out = [];
    data.forEach((row, i) => {
      const items = row.pts.map((p) => ({ ...p, i, x: X(p.v), y: 0 })).sort((a, b) => (b.m === 'DISEIL') - (a.m === 'DISEIL') || b.v - a.v), done = [];
      items.forEach((p) => {
        const need = (q) => (p.m === 'DISEIL' || q.m === 'DISEIL' ? gapPx + 2 : gapPx);
        const ok = (y) => done.every((q) => Math.hypot(q.x - p.x, q.y - y) >= need(q) - 0.01);
        for (let k = 0; k < 64; k++) { const y = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (gapPx / 4); if (ok(y)) { p.y = y; break; } }
        done.push(p);
      });
      const lo = Math.min(...done.map((p) => p.y)), hi = Math.max(...done.map((p) => p.y)), lim = g.pitch / 2 - g.r;
      if (hi > lim || lo < -lim) { const mid = (lo + hi) / 2; done.forEach((p) => { p.y -= mid; }); }
      out.push(...done.map((p) => ({ ...p, cy: g.y[i] + p.y })));
    });
    return out;
  }
  function ticks(a, b) { const span = b - a, st = [0.1, 0.2, 0.5, 1, 2, 5, 10].find((s) => span / s <= 7) || 10, o = []; for (let v = Math.ceil(a / st - 1e-6) * st; v <= Math.min(b, 100) + 1e-6; v += st) o.push(+v.toFixed(2)); return { o, dec: st < 1 ? 1 : 0 }; }
  function paint() {
    const W = Math.max(240, host.clientWidth), g = layout(W), X = (v) => g.x0 + ((v - dom[0]) / (dom[1] - dom[0])) * (g.x1 - g.x0);
    const focusM = hotM || (hover && hover.m) || pinned, col = hotM || pinned || 'DISEIL', zoomed = dom[1] - dom[0] < FULL[1] - FULL[0] - 0.01;
    const had = host.contains(document.activeElement);
    host.innerHTML = '';
    const svg = el('svg', { viewBox: `0 0 ${W} ${g.H}`, width: W, height: g.H, role: 'img', tabindex: 0, 'aria-label': 'Held-out success after 20 demonstrations for DISEIL and six baselines on ten settings. Arrow keys step through the values.' }, host);
    svg.classList.toggle('zoomed', zoomed);
    const defs = el('defs', {}, svg), cp = el('clipPath', { id: 'plotclip' }, defs); el('rect', { x: g.x0 - 9, y: 0, width: g.x1 - g.x0 + 18, height: g.H }, cp);
    const base = g.y[9] + g.pitch / 2 + 6, f1 = g.n ? 14 : 16, f2 = g.n ? 15 : 18;
    const tk = ticks(...dom);
    tk.o.forEach((v) => { el('line', { x1: X(v), x2: X(v), y1: g.top - 6, y2: base, stroke: '#e6e9ed' }, svg); el('line', { x1: X(v), x2: X(v), y1: base, y2: base + 6, stroke: '#5e6773' }, svg); el('text', { x: X(v), y: base + 24, 'text-anchor': 'middle', 'font-size': f1, class: 'num' }, svg, v.toFixed(tk.dec)); });
    el('line', { x1: g.x0 - 8, x2: g.x1 + 8, y1: base, y2: base, stroke: '#5e6773', 'stroke-width': 1.3 }, svg);
    el('text', g.n ? { x: W, y: base + 48, 'text-anchor': 'end', 'font-size': 14 } : { x: (g.x0 + g.x1) / 2, y: base + 50, 'text-anchor': 'middle', 'font-size': 16 }, svg, 'Held-out success after 20 demonstrations (%)');
    el('text', { x: g.n ? W : W - 48, y: g.n ? 18 : 18, 'text-anchor': 'end', 'font-size': g.n ? 13 : 15, class: 'colhead' }, svg, col);
    const marks = place(g, X), inn = el('g', { 'clip-path': 'url(#plotclip)' }, svg);
    data.forEach((r, i) => {
      if (i % 2 === 0) el('text', g.n ? { x: 0, y: g.y[i] - g.pitch / 2 - 6, 'font-size': f1 + 1, class: 'task' } : { x: 0, y: (g.y[i] + g.y[i + 1]) / 2 + 6, 'font-size': f2, class: 'task' }, svg, r.task);
      el('text', { x: g.x0 - (g.n ? 16 : 22), y: g.y[i] + 5, 'text-anchor': 'end', 'font-size': f1 }, svg, r.obs);
      const D = r.pts.find((p) => p.m === 'DISEIL'), lo = Math.min(...r.pts.map((p) => p.v));
      const yd = marks.find((p) => p.i === i && p.m === 'DISEIL').cy;
      el('line', { x1: X(lo), x2: X(D.v), y1: yd, y2: yd, stroke: '#eceff2', 'stroke-width': 6, 'stroke-linecap': 'round' }, inn);
      const c = r.pts.find((p) => p.m === col), t = el('text', { x: W - (g.n ? 0 : 0), y: g.y[i] + 6, 'text-anchor': 'end', class: 'num' }, svg);
      if (c) { el('tspan', { class: 'val' + (col === 'DISEIL' ? ' red' : ''), 'font-size': g.n ? 14.5 : 18 }, t, fmt(c.v)); if (!g.n) el('tspan', { class: col === 'DISEIL' ? 'red' : '', 'font-size': 14, dx: 5 }, t, `± ${fmt(c.s)}`); } else t.textContent = '–';
    });
    const bar = (p, w) => { if (p.s > 0.04) el('path', { d: `M${X(p.v - p.s)} ${p.cy}H${X(p.v + p.s)}M${X(p.v - p.s)} ${p.cy - 4}v8M${X(p.v + p.s)} ${p.cy - 4}v8`, stroke: STYLE[p.m][0], 'stroke-width': w, fill: 'none' }, inn); };
    marks.forEach((p) => { if (p.m === focusM || (p.m === 'DISEIL' && !focusM)) bar(p, 1.8); });
    const draw = (p) => {
      const on = !focusM || p.m === focusM, hot = hover && hover.m === p.m && hover.i === p.i, k = p.m === 'DISEIL' ? g.r * 1.06 : g.r;
      el('path', { d: shape(STYLE[p.m][1], hot ? k * 1.35 : k), transform: `translate(${p.x.toFixed(2)} ${p.cy.toFixed(2)})`, fill: STYLE[p.m][0], stroke: hot ? '#1e2430' : dark(STYLE[p.m][0]), 'stroke-width': hot ? 1.8 : 0.9, opacity: on ? 1 : 0.22 }, inn);
    };
    marks.filter((p) => p.m !== 'DISEIL').forEach(draw); marks.filter((p) => p.m === 'DISEIL').forEach(draw); if (hover) marks.filter((p) => p.m === hover.m && p.i === hover.i).forEach(draw);
    if (brush) el('rect', { x: Math.min(brush[0], brush[1]), y: g.top - 6, width: Math.abs(brush[1] - brush[0]), height: base - g.top + 6, fill: '#1e2430', opacity: 0.08 }, svg);
    root.querySelectorAll('.legend button').forEach((b) => { b.setAttribute('aria-pressed', String(pinned === b.dataset.m)); b.classList.toggle('off', !!focusM && focusM !== b.dataset.m); });
    root.querySelector('[data-z="out"]').disabled = !zoomed; root.querySelector('[data-z="reset"]').disabled = !zoomed && !pinned; root.querySelector('[data-z="in"]').disabled = dom[1] - dom[0] <= MIN + 0.01;
    if (had) svg.focus({ preventScroll: true });
    geo = { g, X, marks, inv: (px) => dom[0] + ((px - g.x0) / (g.x1 - g.x0)) * (dom[1] - dom[0]) };
  }
  function show(p) {
    if (p && (p.v < dom[0] || p.v > dom[1])) { const s = dom[1] - dom[0]; setDom(p.v - s / 2, p.v + s / 2); }
    hover = p ? { m: p.m, i: p.i } : null; paint();
    if (!p) { tip.hidden = true; return; }
    const q = geo.marks.find((z) => z.m === p.m && z.i === p.i), r = data[p.i];
    tip.innerHTML = `<b><svg width="16" height="16" viewBox="-9 -9 18 18" aria-hidden="true"><path d="${shape(STYLE[p.m][1], 5.6)}" fill="${STYLE[p.m][0]}" stroke="${dark(STYLE[p.m][0])}"/></svg>${p.m}</b><span class="big">${fmt(p.v)}% <small>± ${fmt(p.s)}</small></span><span>${r.task}, ${r.obs}</span>`;
    tip.hidden = false; live.textContent = `${p.m}, ${r.task} ${r.obs}: ${fmt(p.v)} percent, standard error ${fmt(p.s)}`;
    const w = tip.offsetWidth, h = tip.offsetHeight, W = host.clientWidth, ox = host.offsetLeft, oy = host.offsetTop;
    tip.style.left = Math.max(0, Math.min(W - w, q.x + 16 + w > W ? q.x - w - 14 : q.x + 16)) + ox + 'px'; tip.style.top = (q.cy - h - 12 < 0 ? q.cy + 16 : q.cy - h - 10) + oy + 'px';
  }

  /* pointer: hover for values, drag to zoom, pinch or two fingers on touch */
  let brush = null, down = null, lastTouch = false; const touch = new Map();
  const at = (e) => { const b = host.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  const nearest = (x, y, lim) => { let best = null, bd = lim; geo.marks.forEach((p) => { if (p.x < geo.g.x0 - 9 || p.x > geo.g.x1 + 9) return; const k = Math.hypot(p.x - x, p.cy - y); if (k < bd) { bd = k; best = p; } }); return best; };
  host.addEventListener('pointerdown', (e) => {
    const [x, y] = at(e); lastTouch = e.pointerType !== 'mouse';
    if (e.pointerType === 'mouse') { if (e.button === 0 && x > geo.g.x0 - 12 && x < geo.g.x1 + 12) { down = [x, y]; host.setPointerCapture(e.pointerId); } return; }
    touch.set(e.pointerId, [x, y]); down = [x, y, dom.slice()];
    if (touch.size === 1) show(nearest(x, y, 26));
  });
  host.addEventListener('pointermove', (e) => {
    const [x, y] = at(e);
    if (e.pointerType !== 'mouse') {
      if (!touch.has(e.pointerId)) return;
      const prev = new Map(touch); touch.set(e.pointerId, [x, y]);
      if (touch.size === 2) { const a = [...prev.values()], b = [...touch.values()], d0 = Math.abs(a[0][0] - a[1][0]) || 1, d1 = Math.abs(b[0][0] - b[1][0]) || 1; setDom(...by(Math.max(0.5, Math.min(2, d0 / d1)), geo.inv((b[0][0] + b[1][0]) / 2))); } else if (down && down[2] && Math.abs(x - down[0]) > 8) { const k = (down[0] - x) / (geo.g.x1 - geo.g.x0) * (down[2][1] - down[2][0]); if (dom[1] - dom[0] < FULL[1] - FULL[0] - 0.01) setDom(down[2][0] + k, down[2][1] + k); }
      return;
    }
    if (down && Math.abs(x - down[0]) > 5) { hover = null; tip.hidden = true; const c = (v) => Math.max(geo.g.x0, Math.min(geo.g.x1, v)); brush = [c(down[0]), c(x)]; paint(); return; }
    const p = nearest(x, y, 18); if ((p && p.m) !== (hover && hover.m) || (p && p.i) !== (hover && hover.i)) show(p);
  });
  const up = (e) => {
    touch.delete(e.pointerId);
    if (brush) { const a = geo.inv(Math.min(...brush)), b = geo.inv(Math.max(...brush)); brush = null; if (b - a > 0.2) zoomTo(a, b); else paint(); }
    down = null;
  };
  host.addEventListener('pointerup', up); host.addEventListener('pointercancel', up);
  host.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !down) show(null); });
  document.addEventListener('pointerdown', (e) => { if (hover && !e.composedPath().includes(host)) show(null); });
  host.addEventListener('dblclick', (e) => { if (!lastTouch) zoomTo(...FULL); });
  host.addEventListener('wheel', (e) => {
    const [x] = at(e), span = dom[1] - dom[0];
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); setDom(...by(Math.exp(e.deltaY * 0.01), geo.inv(x))); } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && span < FULL[1] - FULL[0] - 0.01) { e.preventDefault(); const k = e.deltaX / (geo.g.x1 - geo.g.x0) * span; setDom(dom[0] + k, dom[1] + k); }
  }, { passive: false });
  host.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { show(null); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const rows = data.map((r, i) => r.pts.map((p) => ({ ...p, i })).sort((a, b) => a.v - b.v)); let i = hover ? hover.i : 0, j = hover ? rows[i].findIndex((p) => p.m === hover.m) : rows[0].length - 1;
    if (hover) { if (e.key === 'ArrowLeft') j = Math.max(0, j - 1); if (e.key === 'ArrowRight') j = Math.min(rows[i].length - 1, j + 1); if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { const m = hover.m; i = Math.max(0, Math.min(9, i + (e.key === 'ArrowUp' ? -1 : 1))); j = rows[i].findIndex((p) => p.m === m); if (j < 0) j = rows[i].length - 1; } }
    show(rows[i][j]); host.querySelector('svg').focus({ preventScroll: true });
  });

  root.querySelector('table').innerHTML = '<thead><tr><th>Setting</th>' + LEGEND.map((m) => `<th>${m}</th>`).join('') + '</tr></thead><tbody>' + data.map((r) => `<tr><th>${r.task} ${r.obs}</th>` + LEGEND.map((m) => { const p = r.pts.find((z) => z.m === m); return `<td>${p ? fmt(p.v) + ' ± ' + fmt(p.s) : ''}</td>`; }).join('') + '</tr>').join('') + '</tbody>';
  paint(); let w = host.clientWidth; new ResizeObserver(() => { if (Math.abs(host.clientWidth - w) > 2) { w = host.clientWidth; tip.hidden = true; hover = null; paint(); } }).observe(host);
  if (document.fonts) document.fonts.ready.then(paint);
  window.CHART = { zoomTo, show: (m, i) => show({ ...data[i].pts.find((p) => p.m === m), i }), get domain() { return dom; } };
})();
