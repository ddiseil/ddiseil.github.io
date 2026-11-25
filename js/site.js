(function () {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let halted = false;

  /* before/after clips: play in view, in step, and restart together */
  const groups = Array.from(document.querySelectorAll('[data-sync]')).map((g) => {
    const vs = Array.from(g.querySelectorAll('video')), st = { seen: false, timer: 0 };
    vs.forEach((v) => { v.muted = true; if (reduce) { v.poster = v.dataset.end; v.controls = true; } });
    const play = (v) => { if (v.error) return; v.preload = 'auto'; v.play().catch((e) => { if (e.name === 'NotAllowedError') v.controls = true; }); };
    const done = () => vs.every((v) => v.ended || v.error);
    st.resume = () => {
      if (!st.seen || halted || reduce) return;
      if (!done()) { vs.forEach((v) => { if (!v.ended) play(v); }); return; }
      if (!st.timer) st.timer = setTimeout(() => { st.timer = 0; if (st.seen && !halted) vs.forEach((v) => { v.currentTime = 0; play(v); }); }, 1600);
    };
    st.stop = () => { clearTimeout(st.timer); st.timer = 0; vs.forEach((v) => v.pause()); };
    vs.forEach((v) => ['ended', 'error'].forEach((k) => v.addEventListener(k, () => { if (done()) st.resume(); })));
    new IntersectionObserver((es) => { st.seen = es[es.length - 1].isIntersecting; if (st.seen) st.resume(); else st.stop(); }, { rootMargin: '100px 0px' }).observe(g);
    return st;
  });
  document.addEventListener('motion', (e) => { halted = !e.detail; groups.forEach((g) => (halted ? g.stop() : g.resume())); });

  const copy = document.getElementById('copy'), pre = document.querySelector('pre');
  copy.addEventListener('click', () => {
    const select = () => { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
    if (!navigator.clipboard) { select(); return; }
    navigator.clipboard.writeText(pre.textContent.trim()).then(() => { copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy'; }, 1600); }).catch(select);
  });
})();
