/*
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
 */
/* Profectium motion layer: reveal on scroll, count-up, scramble, parallax, spotlight, tilt,
   ambient loops, FLIP reorders, cross-page view transitions, toasts and Ctrl/Cmd+K palette.
   Everything is attribute-driven so DC templates stay plain markup. */
(function () {
  if (window.FX) return;
  const RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const EASE = 'cubic-bezier(.2,.8,.2,1)';

  function pageIn() {
    if (RM || !document.body) return;
    document.body.animate([{ opacity: 0, translate: '0 12px' }, { opacity: 1, translate: '0 0' }], { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  if (document.body) pageIn(); else document.addEventListener('DOMContentLoaded', pageIn, { once: true });
  addEventListener('pageshow', e => { if (e.persisted && document.body) { document.body.getAnimations().forEach(a => a.cancel()); pageIn(); } });
  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    const href = a.getAttribute('href');
    if (!href || href[0] === '#' || !/\.dc\.html(\?|#|$)/.test(href)) return;
    const url = new URL(href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
    e.preventDefault();
    if (RM) { location.href = url.href; return; }
    const out = document.body.animate([{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 -6px' }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
    out.onfinish = () => { location.href = url.href; };
  });

  const K = {
    up: [{ opacity: 0, translate: '0 28px' }, { opacity: 1, translate: '0 0' }],
    down: [{ opacity: 0, translate: '0 -16px' }, { opacity: 1, translate: '0 0' }],
    left: [{ opacity: 0, translate: '-32px 0' }, { opacity: 1, translate: '0 0' }],
    right: [{ opacity: 0, translate: '32px 0' }, { opacity: 1, translate: '0 0' }],
    fade: [{ opacity: 0 }, { opacity: 1 }],
    scale: [{ opacity: 0, scale: '0.94' }, { opacity: 1, scale: '1' }],
    pop: [{ opacity: 0, scale: '0.3' }, { opacity: 1, scale: '1.12', offset: 0.7 }, { opacity: 1, scale: '1' }],
    blur: [{ opacity: 0, filter: 'blur(16px)', translate: '0 20px' }, { opacity: 1, filter: 'blur(0px)', translate: '0 0' }],
    'draw-x': [{ scale: '0 1' }, { scale: '1 1' }],
    'draw-y': [{ scale: '1 0' }, { scale: '1 1' }],
    wipe: [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }],
    rise: [{ clipPath: 'inset(100% 0 0 0)', translate: '0 40px' }, { clipPath: 'inset(0% 0 0 0)', translate: '0 0' }]
  };
  const LOOPS = {
    scan: [[{ top: '4%', opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.88 }, { top: '94%', opacity: 0 }], { duration: 3800, iterations: Infinity, easing: 'ease-in-out' }],
    sweep: [[{ translate: '-120% 0' }, { translate: '420% 0' }], { duration: 1300, iterations: Infinity, easing: 'ease-in-out' }],
    pulse: [[{ scale: '1', opacity: 0.75 }, { scale: '2.8', opacity: 0 }], { duration: 2200, iterations: Infinity, easing: 'ease-out' }],
    float: [[{ translate: '0 0' }, { translate: '0 -10px' }], { duration: 3200, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }],
    blink: [[{ opacity: 1 }, { opacity: 0 }], { duration: 560, iterations: Infinity, direction: 'alternate', easing: 'steps(1,end)' }],
    breathe: [[{ opacity: 0.35 }, { opacity: 0.8 }], { duration: 2600, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }],
    spin: [[{ rotate: '0deg' }, { rotate: '360deg' }], { duration: 900, iterations: Infinity, easing: 'linear' }]
  };

  const pending = new Map();
  let batch = 0, batchT = 0;
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); fire(e.target); } }), { rootMargin: '0px 0px -6% 0px', threshold: 0.01 });
  function prime(el, kindOverride) {
    if (el.__fxSeen) return;
    el.__fxSeen = true;
    let kind = kindOverride || el.getAttribute('data-reveal') || 'up';
    // Horizontal reveal offsets must not widen a narrow page before it is scrolled into view.
    if (innerWidth <= 700 && (kind === 'left' || kind === 'right')) kind = 'up';
    if (kind === 'draw-x' && !el.style.transformOrigin) el.style.transformOrigin = 'left center';
    if (kind === 'draw-y' && !el.style.transformOrigin) el.style.transformOrigin = 'center top';
    if (RM) return;
    const dur = +el.getAttribute('data-dur') || (kind.indexOf('draw') === 0 ? 1200 : kind === 'rise' || kind === 'wipe' ? 1100 : 760);
    const a = el.animate(K[kind] || K.up, { duration: dur, easing: EASE, fill: 'backwards' });
    a.pause();
    pending.set(el, a);
    el.__fxPending = true;
    io.observe(el);
  }
  let sweepT = 0;
  function sweep() {
    sweepT = 0;
    const h = innerHeight;
    pending.forEach((a, el) => {
      if (!el.isConnected) { pending.delete(el); return; }
      const r = el.getBoundingClientRect();
      if (r.bottom > 0 && r.top < h && (r.width || r.height)) { io.unobserve(el); fire(el); }
    });
  }
  const queueSweep = () => { if (!sweepT) sweepT = setTimeout(sweep, 140); };
  addEventListener('scroll', queueSweep, { passive: true, capture: true });
  addEventListener('resize', queueSweep, { passive: true });
  setInterval(() => { if (pending.size) sweep(); }, 1500);
  function fire(el) {
    const a = pending.get(el);
    if (!a) return;
    pending.delete(el);
    const order = batch++;
    clearTimeout(batchT); batchT = setTimeout(() => { batch = 0; }, 80);
    a.effect.updateTiming({ delay: (+el.getAttribute('data-delay') || 0) + Math.min(order, 10) * 70 });
    a.onfinish = () => { el.__fxPending = false; a.cancel(); };
    a.play();
  }

  const selfWrite = new WeakSet();
  function textNodes(el) {
    const out = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) if (n.nodeValue.trim()) out.push(n);
    return out;
  }
  function countUp(el) {
    if (el.__fxCount || RM) return;
    el.__fxCount = true;
    const node = textNodes(el).find(n => /\d/.test(n.nodeValue));
    if (!node) return;
    const full = node.nodeValue, m = full.match(/^(\D*?)(\d[\d\u00a0 ]*)([\s\S]*)$/);
    if (!m) return;
    const digits = m[2].replace(/\D/g, ''), target = parseInt(digits, 10);
    if (!target) return;
    const pad = digits.length > 1 && digits[0] === '0' ? digits.length : 0;
    const fmt = v => { let s = String(v); if (pad) s = s.padStart(pad, '0'); else if (digits.length > 3) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0'); return m[1] + s + m[3]; };
    const dur = +el.getAttribute('data-count') || 1200, t0 = performance.now();
    let last = fmt(0);
    selfWrite.add(node); node.nodeValue = last;
    (function step(t) {
      if (node.nodeValue !== last) { selfWrite.delete(node); return; }
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4);
      last = p < 1 ? fmt(Math.round(target * e)) : full;
      node.nodeValue = last;
      if (p < 1) requestAnimationFrame(step); else setTimeout(() => selfWrite.delete(node), 0);
    })(t0);
  }
  const GL = '01<>/{}[]=+*#$%ФСП';
  function scramble(el) {
    if (el.__fxScr || RM) return;
    el.__fxScr = true;
    const nodes = textNodes(el).map(n => ({ n, o: n.nodeValue, last: n.nodeValue }));
    const dur = +el.getAttribute('data-scramble') || 800, t0 = performance.now();
    nodes.forEach(x => selfWrite.add(x.n));
    (function step(t) {
      const p = Math.min(1, (t - t0) / dur);
      let alive = false;
      nodes.forEach(x => {
        if (x.n.nodeValue !== x.last) return;
        alive = true;
        const r = Math.floor(x.o.length * p);
        let s = x.o.slice(0, r);
        for (let k = r; k < x.o.length; k++) s += /\s/.test(x.o[k]) ? x.o[k] : GL[(Math.random() * GL.length) | 0];
        x.last = p >= 1 ? x.o : s;
        x.n.nodeValue = x.last;
      });
      if (p < 1 && alive) requestAnimationFrame(step);
      else setTimeout(() => nodes.forEach(x => selfWrite.delete(x.n)), 0);
    })(t0);
  }
  const cio = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    cio.unobserve(e.target);
    const d = +e.target.getAttribute('data-delay') || 0;
    setTimeout(() => { if (e.target.hasAttribute('data-count')) countUp(e.target); if (e.target.hasAttribute('data-scramble')) scramble(e.target); }, d + 120);
  }), { threshold: 0.2 });

  function loop(el) {
    if (el.__fxLoop || RM) return;
    const L = LOOPS[el.getAttribute('data-fx')];
    if (!L) return;
    el.__fxLoop = el.animate(L[0], Object.assign({}, L[1], { delay: +el.getAttribute('data-fx-delay') || 0 }));
  }

  let px = 0.5, py = 0.5, cx = 0, cy = 0, raf = 0;
  addEventListener('pointermove', e => { px = e.clientX / innerWidth; py = e.clientY / innerHeight; cx = e.clientX; cy = e.clientY; if (!raf) raf = requestAnimationFrame(applyPointer); }, { passive: true });
  function applyPointer() {
    raf = 0;
    if (RM) return;
    document.querySelectorAll('[data-parallax]').forEach(el => {
      const v = +el.getAttribute('data-parallax') || 12;
      if (!el.style.transition) el.style.transition = 'translate .8s cubic-bezier(.2,.8,.2,1)';
      el.style.translate = ((px - 0.5) * v).toFixed(1) + 'px ' + ((py - 0.5) * v).toFixed(1) + 'px';
    });
    document.querySelectorAll('[data-spotlight]').forEach(el => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (cx - r.left) + 'px');
      el.style.setProperty('--my', (cy - r.top) + 'px');
    });
    document.querySelectorAll('[data-tilt]').forEach(el => {
      const r = el.getBoundingClientRect(), inside = cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
      const v = +el.getAttribute('data-tilt') || 6;
      if (!el.style.transition) el.style.transition = 'transform .5s cubic-bezier(.2,.8,.2,1)';
      el.style.transform = inside ? 'perspective(900px) rotateX(' + (((cy - r.top) / r.height - 0.5) * -v).toFixed(2) + 'deg) rotateY(' + (((cx - r.left) / r.width - 0.5) * v).toFixed(2) + 'deg)' : '';
    });
  }

  function flash(el) {
    if (RM || el.__fxFlashing) return;
    el.__fxFlashing = true;
    const a = el.animate([{ opacity: 0.2, translate: '0 8px', filter: 'blur(4px)' }, { opacity: 1, translate: '0 0', filter: 'blur(0px)' }], { duration: 420, easing: EASE });
    a.onfinish = () => { el.__fxFlashing = false; };
  }

  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    const all = [root].concat(Array.from(root.querySelectorAll('*')));
    for (const el of all) {
      if (el.hasAttribute('data-reveal')) prime(el);
      const p = el.parentElement;
      if (p && p.hasAttribute('data-stagger')) prime(el, p.getAttribute('data-stagger') || 'up');
      if (el.hasAttribute('data-count') || el.hasAttribute('data-scramble')) cio.observe(el);
      if (el.hasAttribute('data-fx')) loop(el);
    }
  }
  new MutationObserver(ms => {
    for (const m of ms) {
      if (m.type === 'childList') {
        m.addedNodes.forEach(scan);
        const host = m.target.nodeType === 1 && m.target.closest && m.target.closest('[data-flash]');
        if (host && m.addedNodes.length && !host.__fxNew) flash(host);
      } else if (m.type === 'characterData' && !selfWrite.has(m.target)) {
        const host = m.target.parentElement && m.target.parentElement.closest('[data-flash]');
        if (host) flash(host);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  if (document.body) scan(document.body);
  document.addEventListener('DOMContentLoaded', () => scan(document.body));

  function snap(root) {
    const m = new Map();
    (root || document).querySelectorAll('[data-flip]').forEach(el => m.set(el.getAttribute('data-flip'), el.getBoundingClientRect().top));
    return m;
  }
  function play(s, root) {
    if (!s || RM) return;
    (root || document).querySelectorAll('[data-flip]').forEach(el => {
      if (el.__fxPending) return;
      const id = el.getAttribute('data-flip'), top = el.getBoundingClientRect().top;
      if (!s.has(id)) { el.animate(K.scale, { duration: 420, easing: EASE }); return; }
      const dy = s.get(id) - top;
      if (Math.abs(dy) > 1) el.animate([{ translate: '0 ' + dy + 'px' }, { translate: '0 0' }], { duration: 620, easing: EASE });
    });
  }
  function type(text, onUpdate, onDone, cps) {
    if (RM) { onUpdate(text); onDone && onDone(); return () => {}; }
    let i = 0, stop = false;
    const step = Math.max(1, Math.round((cps || 90) / 30));
    (function tick() {
      if (stop) return;
      i = Math.min(text.length, i + step);
      onUpdate(text.slice(0, i));
      if (i < text.length) setTimeout(tick, 33); else onDone && onDone();
    })();
    return () => { stop = true; };
  }

  let tHost = null;
  function toast(text, opt) {
    opt = opt || {};
    if (!tHost) {
      tHost = document.createElement('div');
      tHost.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:9999;display:flex;flex-direction:column;gap:10px;align-items:flex-end;pointer-events:none';
      document.body.appendChild(tHost);
    }
    const t = document.createElement('div');
    const dot = opt.tone === 'red' ? '#EC1D35' : opt.tone === 'blue' ? '#402FFF' : '#9A92FF';
    t.style.cssText = 'pointer-events:auto;position:relative;overflow:hidden;min-width:280px;max-width:420px;background:#1B1C21;color:#EDEDED;border-radius:8px;padding:14px 16px 16px;display:flex;gap:12px;align-items:flex-start;font:14px/1.45 "Golos Text",system-ui,sans-serif;box-shadow:0 24px 48px -16px rgba(0,0,0,.55),0 0 0 1px #2A2B31';
    t.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;margin-top:6px;flex-shrink:0;background:' + dot + '"></span><span style="display:flex;flex-direction:column;gap:6px;flex:1"><span></span></span><span style="position:absolute;left:0;bottom:0;height:2px;width:100%;background:' + dot + ';transform-origin:left"></span>';
    t.children[1].children[0].textContent = text;
    if (opt.action) {
      const a = document.createElement('a');
      a.href = opt.href || '#'; a.textContent = opt.action;
      a.style.cssText = 'color:#9A92FF;font:600 11px/1 "JetBrains Mono",monospace;letter-spacing:.08em;text-transform:uppercase;text-decoration:none';
      t.children[1].appendChild(a);
    }
    tHost.appendChild(t);
    const life = opt.ms || 4600;
    t.animate([{ opacity: 0, translate: '40px 0', scale: '.96' }, { opacity: 1, translate: '0 0', scale: '1' }], { duration: 420, easing: EASE });
    t.lastChild.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: life, easing: 'linear', fill: 'forwards' });
    setTimeout(() => { const a = t.animate([{ opacity: 1 }, { opacity: 0, translate: '0 10px' }], { duration: 260, easing: 'ease-in', fill: 'forwards' }); a.onfinish = () => t.remove(); }, life);
  }

  const PAGES = [
    ['Рабочий пульт', 'Пульт.dc.html', 'Работодатель'],
    ['Каталог специалистов', 'Каталог.dc.html', 'Работодатель'],
    ['Интеграции: помощник и API', 'Интеграции.dc.html', 'Работодатель'],
    ['Кабинет кандидата · категория и грейд', 'Кабинет-кандидата.dc.html', 'Кандидат'],
    ['Тестирование', 'Тестирование.dc.html', 'Кандидат'],
    ['Приглашения кандидата', 'Приглашения.dc.html', 'Кандидат'],
    ['Главная страница', 'Лендинг.dc.html', 'Сайт']
  ];
  const ACTIONS = [
    ['Настроить поиск и шаблоны', 'Интеграции.dc.html?tab=helper', 'Действие'],
    ['Инструменты и ключи доступа', 'Интеграции.dc.html?tab=tools', 'Действие'],
    ['Настроить вебхуки и API', 'Интеграции.dc.html?tab=api', 'Действие'],
    ['Пройти тест на Senior', 'Тестирование.dc.html?grade=Senior', 'Действие']
  ];
  let pal = null;
  function ensureData(cb) {
    if (window.FSP) return cb();
    if (!document.querySelector('script[data-fsp-auto]')) {
      const s = document.createElement('script'); s.src = 'data.js'; s.setAttribute('data-fsp-auto', '1'); document.head.appendChild(s);
    }
    addEventListener('fsp-data', cb, { once: true });
  }
  function openPalette(initial) {
    if (pal) return;
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;z-index:10000';
    const sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML = '<style>' +
      '*{box-sizing:border-box}.bd{position:absolute;inset:0;background:rgba(19,20,24,.6);backdrop-filter:blur(6px)}' +
      '.p{position:absolute;left:50%;top:12vh;width:min(680px,calc(100% - 32px));translate:-50% 0;background:#1B1C21;color:#EDEDED;border-radius:10px;overflow:hidden;box-shadow:0 40px 80px -20px rgba(0,0,0,.7),0 0 0 1px #33343A;font-family:"Golos Text",system-ui,sans-serif}' +
      '.in{display:flex;align-items:center;gap:12px;padding:0 18px;border-bottom:1px solid #2A2B31}' +
      '.in span{font:600 11px/1 "JetBrains Mono",monospace;letter-spacing:.1em;color:#9A92FF}' +
      'input{flex:1;height:60px;background:none;border:0;outline:0;color:#FFF;font:500 18px "JetBrains Mono",monospace;letter-spacing:-.01em}input::placeholder{color:#6E7078}' +
      '.l{max-height:52vh;overflow:auto;padding:8px}.g{font:600 10px/1 "JetBrains Mono",monospace;letter-spacing:.12em;text-transform:uppercase;color:#6E7078;padding:12px 12px 6px}' +
      '.it{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:11px 12px;border-radius:6px;cursor:pointer;font-size:15px;color:#EDEDED}' +
      '.it small{font:12px "JetBrains Mono",monospace;color:#8B8D94}.it.on{background:#402FFF;color:#FFF}.it.on small{color:#D9D5FF}' +
      '.query{color:#FFF}.query b{font-weight:600}.f{display:flex;gap:18px;padding:10px 18px;border-top:1px solid #2A2B31;font:11px "JetBrains Mono",monospace;color:#6E7078}' +
      'kbd{font:inherit;color:#C8C9CA;background:#26272D;border-radius:3px;padding:1px 5px;margin-right:4px}</style>' +
      '<div class="bd"></div><div class="p"><div class="in"><span>⌘K</span><input placeholder="Страница, кандидат, категория или поисковый запрос"></div><div class="l"></div>' +
      '<div class="f"><span><kbd>↑</kbd><kbd>↓</kbd>выбрать</span><span><kbd>Enter</kbd>открыть</span><span><kbd>Esc</kbd>закрыть</span></div></div>';
    document.body.appendChild(host);
    pal = host;
    const input = sr.querySelector('input'), list = sr.querySelector('.l');
    let items = [], idx = 0;
    function build() {
      const q = input.value.trim().toLowerCase();
      const F = window.FSP;
      const groups = [];
      const match = s => !q || s.toLowerCase().indexOf(q) >= 0;
      if (q) groups.push(['Поиск по запросу', [[ '<span class="query">Найти по запросу: <b></b></span>', 'Каталог.dc.html?q=' + encodeURIComponent(input.value.trim()), 'каталог', input.value.trim()]]]);
      const pg = PAGES.filter(p => match(p[0])).map(p => [p[0], p[1], p[2]]);
      if (pg.length) groups.push(['Страницы', pg]);
      if (F) {
        const cands = F.base.filter(c => match(c.name) || (q.length > 2 && match(c.role))).slice(0, 6).map(c => [c.name, 'Профиль-кандидата.dc.html?id=' + c.id, c.role + ' · ' + c.grade]);
        if (cands.length) groups.push(['Кандидаты', cands]);
        const cats = [];
        F.roles.forEach(r => F.grades.forEach((g, j) => { const t = r + ' · ' + g; if (match(t)) cats.push([t, 'Каталог.dc.html?role=' + encodeURIComponent(r) + '&grade=' + g, F.counts[r][j] + ' в категории']); }));
        if (cats.length) groups.push(['Категории', q ? cats.slice(0, 6) : cats.slice(0, 4)]);
      }
      const ac = ACTIONS.filter(a => match(a[0]));
      if (ac.length) groups.push(['Действия', ac]);
      items = []; list.innerHTML = '';
      groups.forEach(([g, arr]) => {
        const h = document.createElement('div'); h.className = 'g'; h.textContent = g; list.appendChild(h);
        arr.forEach(a => {
          const el = document.createElement('div'); el.className = 'it';
          el.innerHTML = '<span></span><small></small>';
          if (a[3] !== undefined) { el.firstChild.innerHTML = a[0]; el.firstChild.querySelector('b').textContent = '«' + a[3] + '»'; } else el.firstChild.textContent = a[0];
          el.lastChild.textContent = a[2];
          const i = items.length;
          el.onmouseenter = () => { idx = i; mark(); };
          el.onclick = () => go(i);
          list.appendChild(el); items.push([el, a[1]]);
        });
      });
      if (!items.length) { const e = document.createElement('div'); e.className = 'g'; e.textContent = 'Ничего не найдено'; list.appendChild(e); }
      idx = 0; mark();
    }
    function mark() { items.forEach(([el], i) => el.classList.toggle('on', i === idx)); const it = items[idx]; if (it) { const el = it[0], r = el.getBoundingClientRect(), lr = list.getBoundingClientRect(); if (r.bottom > lr.bottom) list.scrollTop += r.bottom - lr.bottom; if (r.top < lr.top) list.scrollTop -= lr.top - r.top; } }
    function go(i) { const it = items[i]; if (it) { close(); location.href = it[1]; } }
    function close() { if (!pal) return; const p = sr.querySelector('.p'); const a = p.animate([{ opacity: 1 }, { opacity: 0, scale: '.98' }], { duration: 140, fill: 'forwards' }); sr.querySelector('.bd').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' }); a.onfinish = () => host.remove(); pal = null; removeEventListener('keydown', onKey, true); }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(items.length - 1, idx + 1); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); mark(); }
      else if (e.key === 'Enter') { e.preventDefault(); go(idx); }
    }
    addEventListener('keydown', onKey, true);
    sr.querySelector('.bd').onclick = close;
    input.oninput = build;
    if (initial) input.value = initial;
    build(); ensureData(build);
    sr.querySelector('.p').animate([{ opacity: 0, scale: '.96', translate: '-50% 12px' }, { opacity: 1, scale: '1', translate: '-50% 0' }], { duration: 260, easing: EASE });
    sr.querySelector('.bd').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    setTimeout(() => input.focus(), 10);
  }
  addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л')) { e.preventDefault(); pal ? null : openPalette(); } });
  document.addEventListener('click', e => { const t = e.target.closest && e.target.closest('[data-palette]'); if (t) { e.preventDefault(); openPalette(); } });

  window.FX = { snap, play, type, toast, palette: openPalette, flash, reduced: RM };
})();
