(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const L = window.DISEIL_LOOP;
  let halted = false; // the reader paused the page's motion

  /* ---------------------------------------------------------------- videos: load and play only in view; keep groups in step */
  const inView = new Set();
  const start = (v) => {
    if (v.error || halted || reduce) return;
    v.preload = 'auto';
    v.play().catch((e) => { if (e.name === 'NotAllowedError') v.controls = true; });
  };
  const vids = $$('video[data-auto]');
  vids.forEach((v) => {
    v.muted = true; v.loop = !v.closest('[data-sync]');
    if (!reduce) return;
    if (v.dataset.end) v.poster = v.dataset.end; // the still shows the outcome; controls would cover it, so they come with the first play
    const b = document.createElement('button'); b.type = 'button'; b.className = 'plain'; b.style.cssText = 'display:inline-block;margin-top:6px';
    b.textContent = 'Play clip'; b.setAttribute('aria-label', 'Play clip: ' + v.getAttribute('aria-label'));
    b.addEventListener('click', () => { v.controls = true; v.play(); v.focus(); b.remove(); });
    v.closest('figure').appendChild(b);
  });
  const solo = new IntersectionObserver((es) => es.forEach((e) => {
    const v = e.target;
    if (e.isIntersecting) { inView.add(v); start(v); } else { inView.delete(v); v.pause(); }
  }), { rootMargin: '120px 0px' });
  vids.filter((v) => v.loop).forEach((v) => solo.observe(v));
  const groups = $$('[data-sync]').map((g) => {
    const vs = $$('video', g), st = { vs, seen: false, timer: 0 };
    const done = () => vs.every((v) => v.ended || v.error);
    const restart = () => { st.timer = 0; if (!st.seen || halted) return; vs.forEach((v) => { if (!v.error) { v.currentTime = 0; start(v); } }); };
    st.resume = () => {
      if (!st.seen || halted || reduce) return;
      if (done()) { if (!st.timer) st.timer = setTimeout(restart, 1400); return; }
      vs.forEach((v) => { if (!v.ended) start(v); });
    };
    st.stop = () => { clearTimeout(st.timer); st.timer = 0; vs.forEach((v) => v.pause()); };
    vs.forEach((v) => ['ended', 'error'].forEach((k) => v.addEventListener(k, () => { if (done()) st.resume(); })));
    new IntersectionObserver((es) => { st.seen = es[es.length - 1].isIntersecting; if (st.seen) st.resume(); else if (!reduce) st.stop(); }, { rootMargin: '120px 0px' }).observe(g);
    return st;
  });
  // printed pages show outcomes, not starting frames
  addEventListener('load', () => setTimeout(() => vids.forEach((v) => { if (v.dataset.end) new Image().src = v.dataset.end; }), 4000));
  const film = $('.film video');
  addEventListener('beforeprint', () => { film.controls = false; vids.forEach((v) => { if (v.dataset.end && v.readyState === 0) v.poster = v.dataset.end; }); });
  addEventListener('afterprint', () => { film.controls = true; });
  const haltVideos = () => { vids.forEach((v) => v.pause()); groups.forEach((g) => g.stop()); };
  const resumeVideos = () => { inView.forEach(start); groups.forEach((g) => g.resume()); };

  /* ---------------------------------------------------------------- the running loop */
  if (L) {
    const hero = $('#loop-hero'), dock = $('.dock');
    [hero, $('#loop-rail'), $('#loop-dock')].forEach((c) => L.addView(c));
    const score = $('.score'), now = $('.now'), railStage = $('.rail-stage'), toggles = $$('[data-loop-toggle]');
    L.STAGES.forEach((s, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = s.name;
      b.addEventListener('click', () => { if (reduce || !L.playing) L.seekStill(i, 0.9); else L.jump(i); });
      score.appendChild(b);
    });
    const btns = $$('button', score);
    L.onStage.push((st, changed) => {
      btns.forEach((b, i) => b.style.setProperty('--p', i < st.stage ? 1 : i === st.stage ? st.p.toFixed(3) : 0));
      railStage.style.setProperty('--p', st.p.toFixed(3)); dock.style.setProperty('--p', st.p.toFixed(3));
      if (!changed) return;
      const s = L.STAGES[st.stage];
      btns.forEach((b, i) => b.setAttribute('aria-current', i === st.stage ? 'true' : 'false'));
      now.innerHTML = '<strong>' + s.name + '.</strong> ' + s.text;
      [railStage, dock].forEach((r) => { $('strong', r).textContent = s.name; $('p', r).innerHTML = s.text; });
    });
    const setPlay = (p) => {
      L.setPlaying(p); halted = !p;
      toggles.forEach((t) => { t.textContent = 'short' in t.dataset ? (p ? 'Pause' : 'Play') : (p ? 'Pause animation' : 'Play animation'); });
      if (p) resumeVideos(); else haltVideos();
    };
    toggles.forEach((t) => t.addEventListener('click', () => setPlay(!L.playing)));
    if (reduce) { setPlay(false); L.seekStill(4, 0.92); }
    L.start();
    if (document.fonts) { document.fonts.ready.then(L.redraw); document.fonts.addEventListener('loadingdone', L.redraw); }

    // phones and tablets: dock the figure once the large one has scrolled away
    new IntersectionObserver((es) => dock.classList.toggle('on', !es[es.length - 1].isIntersecting), { rootMargin: '0px 0px 100000px 0px', threshold: 0.05 }).observe(hero);

    // while a method step is being read, the figure beside it stays on that stage
    const steps = $$('.step[data-stage]');
    let active = null;
    const pick = () => {
      const mid = window.innerHeight * 0.46; let best = null;
      steps.forEach((s) => { const r = s.getBoundingClientRect(); if (r.top < mid && r.bottom > mid) best = s; });
      const k = best ? +best.dataset.stage : null;
      if (k === active) return;
      active = k;
      if (reduce && !L.playing) L.seekStill(k === null ? 4 : k, 0.92); else L.hold(k);
    };
    window.addEventListener('scroll', pick, { passive: true }); window.addEventListener('resize', pick); pick();
  }

  /* ---------------------------------------------------------------- contents */
  const navs = $$('.rail nav a');
  const mark = (id) => navs.forEach((a) => a.setAttribute('aria-current', a.hash === '#' + id ? 'true' : 'false'));
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) mark(e.target.id); }), { rootMargin: '-35% 0px -60% 0px' });
  $$('main > section[id]').forEach((s) => io.observe(s));
  window.addEventListener('scroll', () => {
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) mark('cite');
    else if (navs[navs.length - 1].getAttribute('aria-current') === 'true' && $('#cite').getBoundingClientRect().top > innerHeight * 0.4) mark('paper');
  }, { passive: true });

  /* ---------------------------------------------------------------- results chart and table (Table 1) */
  const chart = $('#chart');
  const fmt = (v) => v.toFixed(1);
  if (chart) { const d = JSON.parse($('#table1').textContent); build(d); table(d); }
  function build(d) {
    const svgNS = 'http://www.w3.org/2000/svg', tip = $('.tip', chart), host = $('.plot', chart);
    const el = (n, a, p) => { const e = document.createElementNS(svgNS, n); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
    const txt = (s, a, p) => { const t = el('text', a, p); t.textContent = s; return t; };
    const draw = () => {
      host.innerHTML = '';
      const W = Math.max(320, host.clientWidth), narrow = W < 600;
      const left = narrow ? 124 : 176, right = narrow ? 50 : 270, top = narrow ? 24 : 30, rh = narrow ? 27 : 30, gap = 13;
      const H = top + 10 * rh + 5 * gap + 44, x0 = 66, x1 = 101;
      const X = (v) => left + ((v - x0) / (x1 - x0)) * (W - left - right);
      const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': 'Held-out success after 20 added demonstrations for DISEIL and every baseline on ten settings' }, host);
      const fs = narrow ? 14 : 16;
      [70, 80, 90, 100].forEach((v) => { el('line', { x1: X(v), x2: X(v), y1: top - 4, y2: H - 40, stroke: '#e6e9ed', 'stroke-width': 1 }, svg); txt(v, { x: X(v), y: H - 22, 'text-anchor': 'middle', 'font-size': fs - 1, class: 'num' }, svg); });
      txt(narrow ? 'Success after 20 added demonstrations (%)' : 'Held-out success after 20 added demonstrations (%)', narrow ? { x: W, y: H - 2, 'text-anchor': 'end', 'font-size': fs - 1 } : { x: (left + W - right) / 2, y: H - 2, 'text-anchor': 'middle', 'font-size': fs - 1 }, svg);
      if (narrow) txt('DISEIL', { x: W, y: 12, 'font-size': 13, 'text-anchor': 'end' }, svg);
      else { txt('DISEIL', { x: W - right + 78, y: 14, 'font-size': 14, 'text-anchor': 'end' }, svg); txt('Strongest baseline', { x: W - right + 104, y: 14, 'font-size': 14 }, svg); }
      const names = el('g', { 'pointer-events': 'none' });
      d.rows.forEach((r, i) => {
        const y = top + i * rh + Math.floor(i / 2) * gap + rh / 2 + 4, cols = d.methods.length - 1, D = r.vals[cols];
        const base = r.vals.slice(0, cols).map((v, j) => v && { m: d.methods[j], v: v[0], s: v[1] }).filter(Boolean);
        const best = Math.max(...base.map((b) => b.v)), top3 = base.filter((b) => b.v === best), se = Math.max(...top3.map((b) => b.s)), tie = D[0] - best < 0.05;
        const g = el('g', { class: 'row', tabindex: 0, role: 'img', 'aria-label': `${r.task} ${r.obs}: DISEIL ${fmt(D[0])} plus or minus ${fmt(D[1])}, strongest baseline ${fmt(best)} (${top3.map((b) => b.m).join(', ')})` }, svg);
        el('rect', { class: 'row-bg', x: left - (narrow ? 50 : 60), y: y - rh / 2, width: W - left + (narrow ? 50 : 60), height: rh, fill: 'transparent' }, g);
        if (i % 2 === 0) txt(r.task, { x: 0, y: y + rh / 2 + 5, 'font-size': fs + (narrow ? 0 : 1), class: 'task' }, names);
        txt(r.obs, { x: left - 14, y: y + 5, 'font-size': fs - 1, 'text-anchor': 'end' }, g);
        el('line', { x1: X(Math.min(...base.map((b) => b.v))), x2: X(D[0]), y1: y, y2: y, stroke: '#e6e9ed', 'stroke-width': 5, 'stroke-linecap': 'round' }, g);
        base.filter((b) => b.v !== best).forEach((b) => el('circle', { cx: X(b.v), cy: y, r: 4.6, fill: '#fff', stroke: '#8a929d', 'stroke-width': 1.7 }, g));
        const bar = (v, s, dy, col) => el('path', { d: `M${X(v - s)} ${y + dy}H${X(v + s)}M${X(v - s)} ${y + dy - 2.5}v5M${X(v + s)} ${y + dy - 2.5}v5`, stroke: col, 'stroke-width': 1.5, fill: 'none' }, g);
        if (se > 0.05 && !tie) bar(best, se, 5, '#3b4a5e');
        if (D[1] > 0.05) bar(D[0], D[1], -5, '#c1272d');
        const cx = X(D[0]), dy = !tie && cx - X(best) < 9 ? 5 : 0; // two close markers sit one above the other
        const dot = () => el('circle', { cx: X(best), cy: y + dy, r: narrow ? 4.4 : 5.4, fill: '#3b4a5e', stroke: '#fff', 'stroke-width': 1.4 }, g);
        const q = narrow ? 6 : 7.6, dia = () => el('path', { d: `M${cx} ${y - dy - q}L${cx + q} ${y - dy}L${cx} ${y - dy + q}L${cx - q} ${y - dy}Z`, fill: '#c1272d', stroke: '#fff', 'stroke-width': narrow ? 1 : 1.6 }, g);
        if (tie) { el('circle', { cx, cy: y, r: narrow ? 8.6 : 10.5, fill: 'none', stroke: '#3b4a5e', 'stroke-width': 1.8 }, g); dia(); } else { dot(); dia(); }
        txt(fmt(D[0]), { x: narrow ? W : W - right + 78, y: y + 5.5, 'font-size': fs, 'text-anchor': 'end', class: 'val' }, g);
        if (!narrow) {
          txt(fmt(best), { x: W - right + 134, y: y + 5.5, 'font-size': fs - 1, 'text-anchor': 'end', class: 'num' }, g);
          txt((top3.length > 1 ? ['two', 'three', 'four', 'five'][top3.length - 2] + ' baselines' : top3[0].m) + (tie ? ' (tie)' : ''), { x: W - right + 144, y: y + 5.5, 'font-size': fs - 1 }, g);
        }
        const show = (px, py) => {
          tip.hidden = false;
          const rows = d.methods.map((m, j) => r.vals[j] && { m, v: r.vals[j][0], s: r.vals[j][1], d: j === cols }).filter(Boolean).sort((a, b) => b.v - a.v || b.d - a.d);
          tip.innerHTML = `<b>${r.task}, ${r.obs}</b><br>start ${fmt(r.init)} with ${r.D0} initial demonstrations<table>${rows.map((x) => `<tr class="${x.d ? 'd' : ''}"><td>${x.m}</td><td>${fmt(x.v)} ± ${fmt(x.s)}</td></tr>`).join('')}</table>`;
          const bw = chart.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
          tip.style.left = Math.max(0, Math.min(bw - tw, px + 18)) + 'px';
          tip.style.top = (py + 16 + th > chart.clientHeight + 40 ? py - th - 14 : py + 16) + 'px';
        };
        g.addEventListener('pointermove', (e) => { const b = chart.getBoundingClientRect(); show(e.clientX - b.left, e.clientY - b.top); });
        g.addEventListener('pointerleave', () => { tip.hidden = true; });
        g.addEventListener('focus', () => { const b = chart.getBoundingClientRect(), h = host.getBoundingClientRect(); show(X(D[0]) - 150, h.top - b.top + (y / H) * host.clientHeight); });
        g.addEventListener('blur', () => { tip.hidden = true; });
        g.addEventListener('keydown', (e) => { if (e.key === 'Escape') tip.hidden = true; });
      });
      svg.appendChild(names); host.style.minHeight = '0';
    };
    draw(); let w = host.clientWidth; new ResizeObserver(() => { if (Math.abs(host.clientWidth - w) > 2) { w = host.clientWidth; draw(); } }).observe(host);
  }
  function table(d) {
    const t = $('table.t1'); if (!t) return;
    const last = d.methods.length - 1, order = [last].concat(d.methods.map((_, j) => j).filter((j) => j !== last)); // DISEIL first
    t.innerHTML = '<thead><tr>' +
      ['Setting', 'Initial demos', 'Start'].map((h) => `<th scope="col">${h}</th>`).join('') + order.map((j) => `<th scope="col"${j === last ? ' class="red"' : ''}>${d.methods[j]}</th>`).join('') + '</tr></thead><tbody>' +
      d.rows.map((r) => {
        const mx = Math.max(...r.vals.filter(Boolean).map((v) => v[0]));
        return `<tr><th scope="row">${r.task} <span>${r.obs}</span></th><td>${r.D0}</td><td>${fmt(r.init)}</td>` + order.map((j) => { const v = r.vals[j]; return v ? `<td class="${v[0] === mx ? 'b' : ''}${j === last ? ' red' : ''}">${fmt(v[0])} <small>± ${fmt(v[1])}</small></td>` : '<td>–</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody>';
  }

  /* ---------------------------------------------------------------- enlarge figures and pages; copy citation */
  const dlg = $('dialog');
  $$('[data-zoom]').forEach((b) => b.addEventListener('click', () => {
    const i = $('img', b), big = $('img', dlg);
    big.src = b.dataset.zoom; big.alt = i.alt; $('.bar span', dlg).textContent = b.dataset.label || '';
    dlg.classList.toggle('sheet', b.dataset.zoom.includes('/page-'));
    dlg.showModal();
    const center = () => dlg.scrollTo(dlg.classList.contains('sheet') ? (dlg.scrollWidth - dlg.clientWidth) / 2 : 0, 0);
    center(); big.onload = center;
  }));
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('button')) dlg.close(); });
  const copy = $('#copy');
  copy.addEventListener('click', () => {
    const pre = $('#bibtex'), done = () => { copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy'; }, 1600); };
    const select = () => { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
    if (navigator.clipboard) navigator.clipboard.writeText(pre.textContent.trim()).then(done).catch(select); else select();
  });
})();
