'use strict';
/* Mesh v2 — views and interaction.
   Views: Open, Home, Rate, Add music, DJ, Search sheet, Settings. One shared <audio> player across all of them. */
(() => {
  const player = $('#player');
  const A = {
    view: 'open',
    now: null,                                  // path loaded in the shared player
    rate: { filter: Prefs.get('rateFilter'), q: '', drafts: new Map(), busy: false },
    add: null,
    dj: { wheelKey: null, fitsOpen: false, fitsMore: false },
    notice: null,
    ratingsBlocked: false,
  };
  const filters = () => ({ tiers: Prefs.get('tiers'), roles: Prefs.get('roles'), minEnergy: Prefs.get('minEnergy'), langs: Prefs.get('langs') });
  const isFiltered = () => { const f = filters(); return f.tiers.length < 3 || f.roles.length || f.minEnergy || f.langs.length; };
  const filterCount = () => { const f = filters(); return (f.tiers.length < 3 ? 1 : 0) + (f.roles.length ? 1 : 0) + (f.minEnergy ? 1 : 0) + (f.langs.length ? 1 : 0); };
  const readOnlyMesh = () => MeshStore.newer;

  /* =================================================================== song info + small renderers */
  function info(path) {
    const e = Library.get(path), s = MeshStore.byPath.get(path);
    let o;
    if (e) o = { title: e.title, artist: e.artist, album: e.album, bpm: e.bpm, k: e.k, keyRaw: e.keyRaw, rating: e.rating, comment: e.comment, flac: e.flac, duration: e.duration };
    else if (s) o = { title: s.title, artist: s.artist, album: '', bpm: s.bpm ?? null, k: KeyRules.parse(s.key), keyRaw: s.key || '', rating: Scheme.empty(), comment: '', flac: false };
    else o = { title: path.split('/').pop(), artist: '', album: '', bpm: null, k: null, keyRaw: '', rating: Scheme.empty(), comment: '', flac: false };
    o.path = path; o.title = o.title || path.split('/').pop(); o.artist = o.artist || 'Unknown artist';
    o.song = s || null; o.out = s ? s.transitions.length : 0; o.entry = e || null;
    o.missing = !e && Library.scan.state === 'done';
    const d = A.rate.drafts.get(path);
    if (d) { o.rating = d.rating; o.comment = d.comment; o.draft = true; }
    return o;
  }
  const notation = () => Prefs.get('notation');
  function keyText(k) { if (!k) return null; return notation() === 'names' ? { main: k.name, alt: k.cam } : { main: k.cam, alt: k.name }; }
  function keyChip(i, { na = '—' } = {}) {
    if (i.k) { const t = keyText(i.k); return `<span class="chip key" style="--kc:${KeyRules.fill(i.k.n, i.k.m)}" title="${esc(i.k.full)}"><span class="dot"></span>${esc(t.main)}<small>${esc(t.alt)}</small></span>`; }
    if (i.keyRaw) return `<span class="chip">${esc(i.keyRaw)}<small>key</small></span>`;
    return `<span class="chip na">${na}<small>key</small></span>`;
  }
  const bpmChip = (i, na = '—') => i.bpm ? `<span class="chip">${fmtBpm(i.bpm)}<small>BPM</small></span>` : `<span class="chip na">${na}<small>BPM</small></span>`;
  /* Two rating tags shown on songs (chosen in Settings; Singalong + Energy by default). Numbers run blue (1) → red (5). */
  const RATING_LABEL = { SINGALONG: 'Singalong', ENERGY: 'Energy', GROOVE: 'Groove', ICONIC: 'Iconic' };
  function shownTags() {
    const t = Prefs.get('shownTags');
    const ok = Array.isArray(t) ? t.filter(k => k in RATING_LABEL).slice(0, 2) : [];
    return ok.length ? ok : ['SINGALONG', 'ENERGY'];
  }
  function ratingChips(i) {
    if (!i.flac && !Scheme.RATINGS.some(d => i.rating?.[d.key])) return '';
    return shownTags().map(k => {
      const n = i.rating?.[k] || 0, L = RATING_LABEL[k];
      return n ? `<span class="chip rt" title="${L} ${n} of 5"><small>${L}</small><b class="r${n}">${n}</b></span>`
        : `<span class="chip rt na" title="${L} not rated"><small>${L}</small>–</span>`;
    }).join('');
  }
  /* S-Tier: every star rating (Singalong, Energy, Groove, Iconic) is 4 or more. */
  const isSTier = r => !!r && Scheme.RATINGS.every(d => (r[d.key] || 0) >= 4);
  const sTierTag = i => isSTier(i.rating) ? '<span class="stier" title="S-Tier: every rating is 4 stars or more">S-Tier</span>' : '';
  function roleLangChips(i) {
    const r = i.rating || {};
    return [...(r.ROLE || []).map(x => `<span class="tag">${esc(Scheme.ROLES.find(o => o.id === x)?.label || x)}</span>`),
      ...(r.LANGUAGE || []).map(x => `<span class="tag">${esc(Scheme.LANGUAGES.find(o => o.id === x)?.label || x)}</span>`)].join('');
  }
  function pips(r, dirty) {
    const names = ['Singalong', 'Energy', 'Groove', 'Iconic', 'Role', 'Language'];
    const vals = [r.SINGALONG, r.ENERGY, r.GROOVE, r.ICONIC, r.ROLE?.length, r.LANGUAGE?.length];
    const set = vals.filter(Boolean).length;
    return `<span class="pips" title="${set} of 6 set${dirty ? ' · unsaved' : ''}">${vals.map(v => `<i class="${v ? (dirty ? 'edit' : 'on') : ''}"></i>`).join('')}<span class="sr-only">${set} of 6 ratings set${dirty ? ', unsaved' : ''}</span></span>`;
  }
  function moveOf(a, b) { return KeyRules.classify(a.k, b.k); }
  function moveBadge(a, b, { sm = false, keys = true } = {}) {
    const mv = moveOf(a, b);
    const ka = keyText(a.k), kb = keyText(b.k);
    const k = keys && ka && kb ? `<span class="keys">${esc(ka.main)} → ${esc(kb.main)}</span>` : '';
    return `<span class="move ${mv.tier}${sm ? ' sm' : ''}" title="${esc(mv.desc)}"><span class="sym" aria-hidden="true">${mv.dir}</span>${esc(mv.word)}${k}</span>`;
  }
  function bpmDiff(a, b) {
    const r = KeyRules.bpm(a.bpm, b.bpm); if (!r) return '';
    const label = r.level === 'good' ? 'close' : r.level === 'ok' ? 'stretch' : 'far';
    return `<span class="chip ${r.level}" title="BPM difference: ${label}"><span class="dot"></span>${r.pct >= 0 ? '+' : '−'}${r.abs.toFixed(1)}%<small>${r.mode ? r.mode + ' ' : ''}BPM</small></span>`;
  }
  function artHTML(path, cls = '') {
    return `<div class="art ${cls}" data-art="${esc(path)}" style="--h:${hashHue(path)}"><span class="ph">${ICON.music}</span></div>`;
  }
  const artIO = new IntersectionObserver(ents => {
    for (const en of ents) if (en.isIntersecting) { artIO.unobserve(en.target); fillArt(en.target); }
  }, { rootMargin: '300px' });
  function fillArt(el) {
    Library.art(el.dataset.art).then(u => {
      if (!u || !el.isConnected || el.querySelector('img')) return;
      const img = new Image(); img.alt = ''; img.decoding = 'async';
      img.onload = () => el.classList.add('loaded'); img.src = u; el.appendChild(img);
    });
  }
  function hydrate(root = document) { $$('[data-art]:not([data-h])', root).forEach(el => { el.dataset.h = 1; artIO.observe(el); }); }

  /* =================================================================== hover card: all star ratings at a glance */
  const HC = (() => {
    const el = document.createElement('div');
    el.className = 'hovercard'; el.setAttribute('role', 'tooltip'); el.id = 'hovercard'; el.hidden = true;
    document.body.appendChild(el);
    let t = 0, target = null;
    const fill = (n) => Array.from({ length: 5 }, (_, k) => `<i class="${k < n ? 'on r' + n : ''}"></i>`).join('');
    function html(p) {
      const i = info(p), r = i.rating || Scheme.empty();
      const roles = (r.ROLE || []).map(x => Scheme.ROLES.find(o => o.id === x)?.label || x);
      const langs = (r.LANGUAGE || []).map(x => Scheme.LANGUAGES.find(o => o.id === x)?.label || x);
      return `<div class="hc-h"><b>${esc(i.title)}</b>${sTierTag(i)}</div>
        ${Scheme.RATINGS.map(d => `<div class="hc-r"><span>${d.label}</span><span class="hc-stars" aria-label="${r[d.key] || 0} of 5">${fill(r[d.key] || 0)}</span><b class="${r[d.key] ? 'r' + r[d.key] : 'na'}">${r[d.key] || '–'}</b></div>`).join('')}
        <div class="hc-f">${[roles.join(' · '), langs.join(' · ')].filter(Boolean).map(esc).join('<span> | </span>') || '<span class="na">No role or language yet</span>'}</div>
        ${!i.flac && !Scheme.RATINGS.some(d => r[d.key]) ? '<div class="hc-f na">Not rated (ratings are FLAC only)</div>' : ''}`;
    }
    function place(x, y) {
      const w = el.offsetWidth, h = el.offsetHeight;
      let left = x + 16, top = y + 14;
      if (left + w > innerWidth - 10) left = x - w - 16;
      if (top + h > innerHeight - 10) top = y - h - 14;
      el.style.left = Math.max(10, left) + 'px'; el.style.top = Math.max(10, top) + 'px';
    }
    function show(node, x, y) {
      el.innerHTML = html(node.dataset.hc); el.hidden = false; place(x, y);
      requestAnimationFrame(() => el.classList.add('on'));
      node.setAttribute('aria-describedby', 'hovercard');
    }
    function hide() { clearTimeout(t); el.classList.remove('on'); el.hidden = true; target?.removeAttribute('aria-describedby'); target = null; }
    document.addEventListener('pointerover', e => {
      if (e.pointerType === 'touch') return;
      const n = e.target.closest('[data-hc]');
      if (n === target) return;
      hide(); if (!n) return;
      target = n; const { clientX: x, clientY: y } = e;
      t = setTimeout(() => { if (target === n && n.isConnected) show(n, x, y); }, 140);
    });
    document.addEventListener('pointermove', e => { if (!el.hidden && target) place(e.clientX, e.clientY); }, { passive: true });
    document.addEventListener('focusin', e => {
      const n = e.target.closest?.('[data-hc]'); hide(); if (!n || !n.matches(':focus-visible')) return;
      target = n; const r = n.getBoundingClientRect(); show(n, r.left + 40, r.bottom - 10);
    });
    ['scroll', 'pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, hide, { capture: true, passive: true }));
    return { hide };
  })();

  /* =================================================================== toast / dialog / popover */
  let toastT;
  function toast(msg, { bad = false, action, ms = 3200 } = {}) {
    const t = $('#toast');
    $('#toast-msg').textContent = msg;
    t.classList.toggle('bad', bad);
    $('.btn', t)?.remove();
    if (action) { const b = document.createElement('button'); b.className = 'btn sm'; b.textContent = action.label; b.onclick = () => { t.classList.remove('on'); action.run(); }; t.appendChild(b); }
    t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), action ? 6000 : ms);
  }
  const scrim = $('#scrim');
  let scrimUsers = 0;
  function scrimOn(on) {
    scrimUsers = Math.max(0, scrimUsers + (on ? 1 : -1));
    if (scrimUsers) { scrim.hidden = false; requestAnimationFrame(() => scrim.classList.add('on')); }
    else { scrim.classList.remove('on'); setTimeout(() => { if (!scrimUsers) scrim.hidden = true; }, 260); }
  }
  function ask({ title, text = '', actions, list }) {
    return new Promise(resolve => {
      const d = $('#dialog'), prev = document.activeElement;
      d.innerHTML = `<h3 class="title-3">${esc(title)}</h3>${text ? `<p>${text}</p>` : ''}${list ? `<ul>${list.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}<div class="acts">${actions.map((a, i) => `<button class="btn ${a.kind || ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div>`;
      d.hidden = false; scrimOn(true); requestAnimationFrame(() => d.classList.add('on'));
      const done = v => { d.classList.remove('on'); scrimOn(false); setTimeout(() => { d.hidden = true; }, 220); document.removeEventListener('keydown', key, true); prev?.focus?.(); resolve(v); };
      const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(actions.find(a => a.cancel)?.value ?? null); } };
      document.addEventListener('keydown', key, true);
      $$('button', d).forEach(b => b.onclick = () => done(actions[+b.dataset.i].value));
      setTimeout(() => $('button', d)?.focus(), 30);
    });
  }
  const Pop = {
    el: $('#popover'), anchor: null, onClose: null,
    open(anchor, html, mount, { width = 300, onClose } = {}) {
      if (this.anchor === anchor) { this.close(); return; }
      this.close(true);
      const el = this.el; el.innerHTML = html; el.style.width = width + 'px'; el.hidden = false;
      this.anchor = anchor; this.onClose = onClose;
      const r = anchor.getBoundingClientRect(), h = el.offsetHeight;
      let left = Math.min(Math.max(12, r.left), innerWidth - width - 12);
      let top = r.bottom + 8; if (top + h > innerHeight - 12) top = Math.max(12, r.top - h - 8);
      if (innerWidth <= 760) { left = (innerWidth - width) / 2; }
      el.style.left = left + 'px'; el.style.top = top + 'px';
      el.style.transformOrigin = `${r.left + r.width / 2 - left}px ${top > r.top ? 0 : h}px`;
      requestAnimationFrame(() => el.classList.add('on'));
      mount?.(el);
      setTimeout(() => $('button, input', el)?.focus(), 30);
    },
    close(quick) {
      if (!this.anchor) return;
      const el = this.el, a = this.anchor, cb = this.onClose; this.anchor = null; this.onClose = null;
      el.classList.remove('on');
      if (quick) el.hidden = true; else setTimeout(() => { if (!this.anchor) el.hidden = true; }, 200);
      cb?.(); if (!quick) a?.focus?.();
    },
    get isOpen() { return !!this.anchor; },
  };
  document.addEventListener('pointerdown', e => { if (Pop.isOpen && !Pop.el.contains(e.target) && !Pop.anchor.contains(e.target)) Pop.close(true); }, true);

  /* segmented control: sliding thumb that springs between options */
  function seg(name, options, value, cls = '') {
    return `<div class="seg ${cls}" role="group" data-seg="${name}"><span class="thumb" aria-hidden="true"></span>${options.map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${String(v) === String(value)}">${l}</button>`).join('')}</div>`;
  }
  function placeThumbs(root = document) {
    $$('.seg', root).forEach(s => {
      const on = $('button[aria-pressed="true"]', s), th = $('.thumb', s);
      if (!th) return;
      if (!on) { th.style.opacity = 0; return; }
      th.style.opacity = 1; th.style.left = on.offsetLeft + 'px'; th.style.width = on.offsetWidth + 'px';
    });
  }
  function bindSeg(root, name, cb) {
    const s = $(`[data-seg="${name}"]`, root); if (!s) return;
    s.addEventListener('click', e => {
      const b = e.target.closest('button[data-v]'); if (!b) return;
      $$('button', s).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      placeThumbs(s.parentElement); cb(b.dataset.v);
    });
  }

  /* =================================================================== shared player */
  let curURL = null, loadToken = 0;
  const Player = {
    async load(path, { autoplay = !player.paused, at = 0 } = {}) {
      const tok = ++loadToken;
      player.pause();
      if (curURL) { URL.revokeObjectURL(curURL); curURL = null; }
      A.now = path;
      setAmbient(path);
      renderMini();
      const e = Library.get(path);
      if (!e) { player.removeAttribute('src'); player.load(); syncTransport(); if (Library.scan.state === 'done') toast('That file is no longer in the folder.', { bad: true }); return; }
      try {
        const f = await e.handle.getFile();
        if (tok !== loadToken) return;
        curURL = URL.createObjectURL(f);
        player.src = curURL;
        if (at) player.addEventListener('loadedmetadata', () => { player.currentTime = Math.min(at, player.duration || at); }, { once: true });
        if (autoplay) await player.play().catch(() => {});
      } catch (err) { toast('Could not load audio: ' + err.message, { bad: true }); }
      syncTransport();
    },
    toggle() { if (!player.src) return; player.paused ? player.play().catch(() => {}) : player.pause(); },
    skip(s) { if (!player.src) return; player.currentTime = Math.max(0, Math.min(player.duration || 0, player.currentTime + s)); },
    /* Release the file before it is rewritten; returns a function that reloads it at the same spot. */
    release() {
      const path = A.now, wasPlaying = !player.paused, at = player.currentTime;
      player.pause(); player.removeAttribute('src'); player.load();
      if (curURL) { URL.revokeObjectURL(curURL); curURL = null; }
      return () => Player.load(path, { autoplay: wasPlaying, at });
    },
  };
  function transportHTML({ prevNext = false } = {}) {
    return `<div class="transport">
      ${prevNext ? `<button class="icon-btn js-prev" aria-label="Previous track" title="Previous ( [ )">${ICON.prev}</button>` : ''}
      <button class="icon-btn sk js-back" aria-label="Back 10 seconds" title="Back 10 s (←)">${ICON.back10}</button>
      <button class="playbtn js-play" aria-label="Play" title="Play / pause (space)">${ICON.play}</button>
      <button class="icon-btn sk js-fwd" aria-label="Forward 10 seconds" title="Forward 10 s (→)">${ICON.fwd10}</button>
      ${prevNext ? `<button class="icon-btn js-next" aria-label="Next track" title="Next ( ] )">${ICON.next}</button>` : ''}
    </div>
    <div class="seek"><span class="js-cur">0:00</span><input type="range" class="scrub js-seek" min="0" max="1000" step="1" value="0" aria-label="Seek"><span class="js-rem">−0:00</span></div>`;
  }
  function bindTransport(root) {
    $$('.js-play', root).forEach(b => b.onclick = () => Player.toggle());
    $$('.js-back', root).forEach(b => b.onclick = () => Player.skip(-10));
    $$('.js-fwd', root).forEach(b => b.onclick = () => Player.skip(10));
    $$('.js-seek', root).forEach(s => s.oninput = () => { if (player.duration) player.currentTime = s.value / 1000 * player.duration; syncSeek(); });
    syncTransport();
  }
  function syncSeek() {
    const d = player.duration || 0, c = player.currentTime || 0, p = d ? c / d * 100 : 0;
    $$('.js-seek').forEach(s => { if (document.activeElement !== s) s.value = d ? Math.round(c / d * 1000) : 0; s.style.setProperty('--p', p + '%'); });
    $$('.js-cur').forEach(x => x.textContent = fmtT(c));
    $$('.js-rem').forEach(x => x.textContent = '−' + fmtT(d - c));
    $('#mini-bar').style.setProperty('--p', p + '%');
  }
  function syncTransport() {
    const on = !player.paused;
    $$('.js-play').forEach(b => { b.innerHTML = on ? ICON.pause : ICON.play; b.setAttribute('aria-label', on ? 'Pause' : 'Play'); b.disabled = !player.src; });
    const m = $('#mini-play'); m.innerHTML = on ? ICON.pause : ICON.play; m.setAttribute('aria-label', on ? 'Pause' : 'Play');
    syncSeek();
  }
  ['play', 'pause', 'ended', 'loadedmetadata', 'emptied'].forEach(ev => player.addEventListener(ev, syncTransport));
  player.addEventListener('timeupdate', syncSeek);
  player.addEventListener('error', () => { if (player.getAttribute('src')) toast('This browser cannot play that file format.', { bad: true }); });

  /* mini player */
  function renderMini() {
    const show = !!A.now && A.view !== 'dj' && A.view !== 'rate' && A.view !== 'open';
    const m = $('#mini');
    if (A.now) {
      const i = info(A.now);
      if (m.dataset.path !== A.now) {
        m.dataset.path = A.now;
        $('#mini-art').innerHTML = artHTML(A.now); hydrate(m);
      }
      $('#mini-t').textContent = i.title; $('#mini-a').textContent = i.artist;
    }
    m.classList.toggle('on', show);
    m.setAttribute('aria-hidden', String(!show));
    m.inert = !show;
  }
  $('#mini-play').onclick = () => Player.toggle();
  $('#mini-open').onclick = () => go('dj');

  /* ambient artwork glow + artwork accent */
  let ambientIdx = 0, accentTok = 0;
  async function setAmbient(path) {
    const tok = ++accentTok;
    const u = path ? await Library.art(path) : null;
    if (tok !== accentTok) return;
    const amb = $('#ambient'), layers = $$('.layer', amb);
    const next = layers[ambientIdx = 1 - ambientIdx], prev = layers[1 - ambientIdx];
    if (u) { next.style.backgroundImage = `url("${u}")`; next.classList.add('show'); }
    else next.classList.remove('show');
    prev.classList.remove('show');
    amb.classList.toggle('on', !!u && A.view !== 'open');
    if (!u) { Accent.apply(null); return; }
    const img = new Image();
    img.onload = () => {
      if (tok !== accentTok) return;
      try {
        const c = document.createElement('canvas'); c.width = c.height = 28;
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, 28, 28);
        const d = g.getImageData(0, 0, 28, 28).data, buckets = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2;
          if (l < 0.1 || l > 0.94) continue;
          const s = mx === mn ? 0 : (l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn));
          let h = 0; if (mx !== mn) h = mx === r ? ((gg - b) / (mx - mn) + 6) % 6 : mx === gg ? (b - r) / (mx - mn) + 2 : (r - gg) / (mx - mn) + 4;
          const k = Math.floor(h * 2) % 12, w = s * s + 0.02, bk = buckets[k];
          bk.w += w; bk.r += d[i] * w; bk.g += d[i + 1] * w; bk.b += d[i + 2] * w;
        }
        const ranked = buckets.filter(b => b.w > 0.4).sort((a, b) => b.w - a.w).map(b => [b.r / b.w, b.g / b.w, b.b / b.w].map(Math.round));
        Accent.apply(ranked[0] || null);
      } catch { Accent.apply(null); }
    };
    img.src = u;
  }

  /* =================================================================== navigation */
  const NAV = [
    { id: 'home', label: 'Home', icon: ICON.home },
    { id: 'rate', label: 'Rate', icon: ICON.star },
    { id: 'add', label: 'Add music', short: 'Add', icon: ICON.link },
    { id: 'dj', label: 'DJ', icon: ICON.disc },
  ];
  function renderNav() {
    const c = Library.counts();
    $('#nav').innerHTML = NAV.map(n => `<button role="listitem" data-go="${n.id}" ${A.view === n.id ? 'aria-current="page"' : ''} title="${n.label}">${n.icon}<span>${n.label}</span>${n.id === 'rate' && c.toRate ? `<span class="badge">${fmtN(c.toRate)}</span>` : ''}</button>`).join('');
    $('#tabbar').innerHTML = NAV.map(n => `<button data-go="${n.id}" ${A.view === n.id ? 'aria-current="page"' : ''}>${n.icon}<span>${n.short || n.label}</span></button>`).join('')
      + `<button data-search>${ICON.search}<span>Search</span></button>`;
  }
  $('#nav').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go); });
  $('#tabbar').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go); else if (e.target.closest('[data-search]')) openSearch(); });
  $('#side-search').onclick = () => openSearch();

  async function go(view, opts = {}) {
    if (A.view === 'rate' && view !== 'rate' && A.rate.drafts.size && !opts.force) {
      const v = await ask({ title: 'Save your ratings?', text: `${A.rate.drafts.size === 1 ? 'One song has' : A.rate.drafts.size + ' songs have'} unsaved ratings.`, actions: [{ label: 'Save', value: 'save', kind: 'primary' }, { label: 'Discard', value: 'discard', kind: 'danger' }, { label: 'Stay', value: 'stay', cancel: true }] });
      if (v === 'stay' || v == null) return false;
      if (v === 'save') { const ok = await saveAllDrafts(); if (!ok) return false; }
      else A.rate.drafts.clear();
    }
    if (view === 'add' && !opts.keepAdd) startAdd(opts.prefill || null, opts.returnTo || A.view, opts.b);
    if (view === 'add' && readOnlyMesh()) { toast('This mesh was made by a newer Mesh — update to edit.', { bad: true }); return false; }
    Pop.close(true);
    const prev = A.view; A.view = view;
    for (const id of ['home', 'rate', 'add', 'dj']) {
      const v = $('#v-' + id), on = id === view;
      v.hidden = !on;
      if (on && prev !== view) { v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter'); v.scrollTop = 0; }
    }
    if (window.innerWidth <= 760 && prev !== view) window.scrollTo(0, 0);
    renderNav(); render(); renderMini();
    $('#ambient').classList.toggle('on', !!A.now && Library.artCache.has(A.now));
    if (view === 'dj' && !A.now) openJump();
    return true;
  }
  function render() {
    if (A.view === 'home') renderHome();
    else if (A.view === 'rate') renderRate();
    else if (A.view === 'add') renderAdd();
    else if (A.view === 'dj') renderDJ();
  }
  let rafR = 0;
  function renderSoon() { if (!rafR) rafR = requestAnimationFrame(() => { rafR = 0; render(); renderNav(); if (Sheet.isOpen) Sheet.render(); }); }

  /* =================================================================== OPEN */
  const openPanel = $('#open-panel');
  async function verifyPermission(h) {
    const o = { mode: 'readwrite' };
    try { if ((await h.queryPermission(o)) === 'granted') return true; return (await h.requestPermission(o)) === 'granted'; }
    catch { return true; }
  }
  async function pickFolder() {
    try { const h = await window.showDirectoryPicker({ id: 'mesh-music', mode: 'readwrite' }); await openRoot(h); }
    catch (e) { if (e.name !== 'AbortError') toast(e.message, { bad: true }); }
  }
  async function openRoot(h) {
    if (!(await verifyPermission(h))) { toast('Mesh needs read & write access to that folder.', { bad: true }); return; }
    try { await idb.set('lastRoot', h); } catch {}
    const meshes = [];
    for await (const e of h.values()) if (e.kind === 'file' && /\.mesh$/i.test(e.name) && !/\.v\d+-backup\.mesh$/i.test(e.name)) meshes.push(e);
    meshes.sort((a, b) => a.name.localeCompare(b.name));
    if (meshes.length === 1) return openMesh(meshes[0], h);
    openPanel.hidden = false;
    if (meshes.length > 1) {
      openPanel.innerHTML = `<p class="sub">${esc(h.name)}</p><h3 class="title-3">Choose a mesh</h3><div class="mesh-pick">${meshes.map((m, i) => `<button data-i="${i}">${ICON.link}${esc(m.name)}</button>`).join('')}</div>`;
      $$('.mesh-pick button', openPanel).forEach(b => b.onclick = () => openMesh(meshes[+b.dataset.i], h));
      $('.mesh-pick button', openPanel).focus();
      return;
    }
    openPanel.innerHTML = `<p class="sub">${esc(h.name)}</p><h3 class="title-3">Start a new mesh</h3>
      <p class="sub" style="margin:6px 0 0">It's saved in the root of this folder. Song paths are relative, so the folder stays portable.</p>
      <form class="create-row" id="create-form"><label class="field"><input id="create-name" aria-label="Mesh name" maxlength="80" value="${esc(h.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'library')}"><span class="suffix">.mesh</span></label><button class="btn primary" type="submit">Create</button></form>`;
    const inp = $('#create-name'); inp.focus(); inp.select();
    $('#create-form').onsubmit = async ev => {
      ev.preventDefault();
      const name = inp.value.replace(/[\\/:*?"<>|]/g, '').trim().replace(/\.mesh$/i, '');
      if (!name) return inp.focus();
      try { await openMesh(await MeshStore.create(h, name), h); }
      catch (e) { toast(e.message.startsWith('That') ? e.message : 'Could not create the file: ' + e.message, { bad: true }); }
    };
  }
  async function openMesh(fh, dir) {
    let r;
    try { r = await MeshStore.load(fh, dir); }
    catch (e) { toast(`${fh.name}: ${e.message}`, { bad: true }); return; }
    A.notice = r.newer ? 'newer' : r.migrated ? 'migrated' : null;
    A.now = null; A.rate.drafts.clear(); A.add = null;
    Library.artCache.clear();
    $('#v-open').hidden = true; $('#app').hidden = false;
    $('#side-file').textContent = fh.name;
    openPanel.hidden = true;
    await go('home', { force: true });
    Library.onProgress = scanProgress;
    Library.onDone = afterScan;
    Library.scan(dir).catch(e => toast('Could not read the folder: ' + e.message, { bad: true }));
  }
  function backToOpen() {
    Library.cancel(); player.pause(); A.now = null; A.view = 'open'; renderMini();
    $('#app').hidden = true; $('#v-open').hidden = false; $('#ambient').classList.remove('on');
  }

  /* After the folder walk: keep the mesh's song snapshots in step with the file tags (v1 behaviour). */
  async function afterScan() {
    if (!MeshStore.newer) {
      let changed = false;
      for (const s of MeshStore.mesh.songs) {
        const e = Library.get(s.path); if (!e) continue;
        const snap = { title: e.title, artist: e.artist, bpm: e.bpm, key: e.k ? e.k.cam : (e.keyRaw || null) };
        for (const k in snap) if ((s[k] ?? null) !== (snap[k] ?? null)) { s[k] = snap[k]; changed = true; }
      }
      if (changed || MeshStore.needsBackup) { MeshStore.ver++; await persist(); }
    }
    renderSoon();
  }
  let scanRaf = 0;
  function scanProgress() { if (!scanRaf) scanRaf = requestAnimationFrame(() => { scanRaf = 0; if (A.view === 'home') renderScan(); if (Library.scan.done % 200 === 0 || Library.scan.state === 'done') renderSoon(); }); }

  /* Save the mesh, and tell the person once about the v1 → v2 upgrade. */
  async function persist() {
    let r;
    try { r = await MeshStore.save(); } catch (e) { toast('Could not write the .mesh file: ' + e.message, { bad: true }); return false; }
    if (r === 'saved' && A.notice === 'migrated' && MeshStore.backupName) {
      A.notice = null;
      toast(`Upgraded to the v2 format. The original is backed up as ${MeshStore.backupName}.`, { ms: 7000 });
    }
    if (r === 'memory') renderSoon();
    return r === 'saved' || r === 'reloaded';
  }
  MeshStore.onStatus = (text, cls) => { const el = $('#save-status'); el.textContent = text === 'saved' ? 'Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : text[0].toUpperCase() + text.slice(1); el.className = 'save-status ' + (text === 'saving…' ? 'busy' : cls); };
  MeshStore.onReload = () => { renderSoon(); };
  MeshStore.onConflict = async n => ask({
    title: 'This mesh changed on another device',
    text: `${n === 1 ? 'One transition was' : n + ' transitions were'} changed on both devices, so they can't be combined automatically.`,
    actions: [{ label: 'Keep this device’s version', value: 'mine', kind: 'primary' }, { label: 'Use the other device’s version', value: 'theirs' }, { label: 'Cancel', value: 'cancel', cancel: true }],
  });
  addEventListener('focus', async () => { if (A.view !== 'open' && await MeshStore.checkDisk()) { toast('Updated with changes from another device.'); renderSoon(); } });


  /* =================================================================== banners shared by views */
  function bannersHTML() {
    let h = '';
    if (MeshStore.newer) h += `<div class="banner warn"><span class="ic"></span><p><b>Made by a newer Mesh — update to edit.</b> You can browse and play, but changes can't be saved.</p></div>`;
    if (MeshStore.memoryOnly) h += `<div class="banner warn"><span class="ic"></span><p><b>This browser blocked saving.</b> Your transition edits are kept for this session only.</p><button class="btn sm" data-act="download">${ICON.download} Download .mesh</button></div>`;
    if (A.ratingsBlocked) h += `<div class="banner warn"><span class="ic"></span><p><b>Ratings can't be written to the files here.</b> They're kept in this browser.</p><button class="btn sm" data-act="copy-ratings">Copy ratings</button></div>`;
    return h;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'download') MeshStore.download();
    if (b.dataset.act === 'copy-ratings') copyRatings();
  });
  function copyRatings() {
    let saved = {}; try { saved = JSON.parse(localStorage.getItem('mesh2.pendingRatings') || '{}'); } catch {}
    navigator.clipboard.writeText(JSON.stringify(saved, null, 2)).then(() => toast('Ratings copied as JSON.'), () => toast('Could not copy.', { bad: true }));
  }

  /* =================================================================== HOME */
  function renderHome() {
    const v = $('#v-home'); if (!MeshStore.mesh) return;
    const st = MeshStore.stats(), c = Library.counts();
    const name = MeshStore.mesh.name || MeshStore.handle.name.replace(/\.mesh$/i, '');
    const edges = [];
    for (const s of MeshStore.mesh.songs) for (const t of s.transitions) { const d = MeshStore.byId.get(t.to); if (d) edges.push({ s, d, t }); }
    edges.sort((a, b) => (b.t.modified || '').localeCompare(a.t.modified || ''));
    const toRate = Library.sorted.filter(p => Library.isToRate(Library.get(p))).slice(0, 3);
    const fan = (toRate.length ? toRate : Library.sorted.slice(0, 3));
    const latest = edges[0];
    const chain = st.chain.slice(0, 14);
    v.innerHTML = `<div class="page">${bannersHTML()}<div class="home">
      <div>
        <header class="home-head">
          <p class="sub">${ICON.folder}${esc(MeshStore.dir?.name || '')}</p>
          <h1 class="large-title">${esc(name)}</h1>
        </header>
        <div class="stats">
          <div class="stat"><b>${fmtN(st.songs)}</b><span>Songs</span></div>
          <div class="stat"><b>${fmtN(st.edges)}</b><span>Transitions</span></div>
          <div class="stat"><b>${st.approx ? '≥' : ''}${fmtN(st.longest)}</b><span>Longest path</span></div>
        </div>
        <div class="stat-row"><span><b>${fmtN(c.rated)}</b> rated</span><span><b>${fmtN(c.toRate)}</b> to rate</span>${c.unreadable ? `<button id="btn-unreadable">${fmtN(c.unreadable)} unreadable ${c.unreadable === 1 ? 'file' : 'files'}</button>` : '<span><b>0</b> unreadable</span>'}<span><b>${fmtN(c.total)}</b> in folder</span></div>
        <section class="chain">
          <div class="section-h"><h2>Longest path</h2><span class="sub">${st.longest > 1 ? `${st.longest} songs${st.cyclic ? ' · has loops' : ''}` : ''}</span></div>
          ${st.longest > 1 ? `<div class="chain-strip">${chain.map((s, i) => `${i ? `<span class="ar">${ICON.chevR}</span>` : ''}<button data-dj="${esc(s.path)}" title="${esc(info(s.path).title)}">${artHTML(s.path)}<span class="t">${esc(info(s.path).title)}</span></button>`).join('')}${st.chain.length > 14 ? '<span class="ar">…</span>' : ''}</div>`
            : `<div class="card chain-empty">Add your first transition to start the mesh.</div>`}
        </section>
        <button class="field home-search" id="home-search">${ICON.search}<span>Search songs, artists, comments</span><kbd class="kbd">/</kbd></button>
        <div class="home-cta"><button class="btn primary lg" id="btn-dj">${ICON.disc} Start DJ mode</button></div>
        <div class="scanline" id="scanline"><div class="progress"><i id="scan-fill"></i></div><span class="foot" id="scan-text"></span></div>
      </div>
      <div>
        <div class="tiles">
          <button class="tile" id="tile-add">
            <div class="tile-vis"><div class="pair">${latest ? artHTML(latest.s.path) : `<span class="slotph">${ICON.plus}</span>`}<span class="link"></span>${latest ? artHTML(latest.d.path) : `<span class="slotph">${ICON.plus}</span>`}</div></div>
            <span class="tile-k">Add music</span><span class="tile-s">Record a transition you know</span>
          </button>
          <button class="tile" id="tile-rate">
            <div class="tile-vis"><div class="fan">${fan.map(p => artHTML(p)).join('')}</div></div>
            <span class="tile-k">Rate songs</span><span class="tile-s tile-count">${Library.scan.state === 'done' ? (c.toRate ? `${fmtN(c.toRate)} to rate` : 'Everything is rated') : 'Reading tags…'}</span>
          </button>
        </div>
        <section class="recent">
          <div class="section-h"><h2>Latest transitions</h2><span class="sub">${edges.length ? fmtN(edges.length) + ' total' : ''}</span></div>
          <ul class="list">${edges.length ? edges.slice(0, 6).map(({ s, d }) => {
            const a = info(s.path), b = info(d.path);
            return `<li><button class="row" data-dj="${esc(s.path)}"><span class="duo">${artHTML(s.path)}${artHTML(d.path)}</span>
              <span class="meta"><span class="t">${esc(a.title)} <span class="muted">→</span> ${esc(b.title)}</span><span class="a">${esc(a.artist)} · ${esc(b.artist)}</span></span>
              <span class="right">${moveBadge(a, b, { sm: true, keys: false })}</span></button></li>`;
          }).join('') : '<li class="list-empty">Nothing yet. Your newest mixes appear here.</li>'}</ul>
        </section>
      </div>
    </div></div>`;
    renderScan();
    hydrate(v);
    v.onclick = e => {
      const dj = e.target.closest('[data-dj]'); if (dj) { djGo(dj.dataset.dj); go('dj'); return; }
      if (e.target.closest('#tile-add')) go('add', { returnTo: 'home' });
      else if (e.target.closest('#tile-rate')) go('rate');
      else if (e.target.closest('#btn-dj')) go('dj');
      else if (e.target.closest('#home-search')) openSearch();
      else if (e.target.closest('#btn-unreadable')) ask({ title: 'Unreadable files', text: 'These files could not be read. They may be damaged or still downloading.', list: Library.unreadable.map(u => `${u.path} — ${u.error}`), actions: [{ label: 'OK', value: 1, kind: 'primary', cancel: true }] });
    };
  }
  function renderScan() {
    const el = $('#scanline'); if (!el) return;
    const { state, done, total } = Library.scan;
    el.hidden = state === 'done' || state === 'idle';
    $('#scan-fill').style.setProperty('--p', state === 'done' ? '100%' : total ? (done / total * 100).toFixed(1) + '%' : '6%');
    $('#scan-text').textContent = state === 'walking' ? 'Indexing folder…' : state === 'reading' ? `Reading tags · ${fmtN(done)} of ${fmtN(total)}` : '';
  }

  /* =================================================================== SEARCH SHEET */
  const Sheet = {
    el: $('#sheet'), input: $('#sheet-q'), list: $('#sheet-list'),
    opts: null, items: [], sel: 0, scope: 'all', f: { roles: [], minEnergy: 0, langs: [] }, showF: false, prev: null, t: 0,
    open(opts) {
      Pop.close(true);
      this.opts = opts; this.scope = opts.scope || 'all';
      this.f = { roles: [], minEnergy: 0, langs: [] }; this.showF = false;
      $('#sheet-title').textContent = opts.title || 'Search';
      this.input.value = ''; this.prev = document.activeElement;
      this.el.hidden = false; scrimOn(true); requestAnimationFrame(() => this.el.classList.add('on'));
      this.renderFilters(); this.render();
      setTimeout(() => this.input.focus(), 20);
    },
    close() {
      if (this.el.hidden) return;
      this.el.classList.remove('on'); scrimOn(false);
      setTimeout(() => { this.el.hidden = true; }, 240);
      this.prev?.focus?.();
    },
    get isOpen() { return !this.el.hidden; },
    renderFilters() {
      const f = this.f, n = (f.roles.length ? 1 : 0) + (f.minEnergy ? 1 : 0) + (f.langs.length ? 1 : 0);
      $('#sheet-filters').innerHTML = `${seg('scope', [['all', 'Whole folder'], ['mesh', 'In mesh'], ['torate', 'To rate']], this.scope)}<span class="gap"></span>
        <button class="pill" id="sf-toggle" aria-expanded="${this.showF}" aria-pressed="${!!n}">${ICON.filter.replace('<svg', '<svg width="14" height="14"')} Filters${n ? ` · ${n}` : ''}</button>
        ${this.showF ? `<div style="flex-basis:100%;display:flex;flex-direction:column;gap:8px;padding-top:4px">
          <div class="pills">${Scheme.ROLES.map(r => `<button class="pill" data-role="${r.id}" aria-pressed="${f.roles.includes(r.id)}">${r.label}</button>`).join('')}
            <span style="width:8px"></span>${seg('energy', [['0', 'Any energy'], ['2', '2+'], ['3', '3+'], ['4', '4+'], ['5', '5']], f.minEnergy)}</div>
          <div class="pills">${Scheme.LANGUAGES.map(l => `<button class="pill" data-lang="${l.id}" aria-pressed="${f.langs.includes(l.id)}">${l.label}</button>`).join('')}</div></div>` : ''}`;
      const box = $('#sheet-filters');
      bindSeg(box, 'scope', v => { this.scope = v; this.render(); this.input.focus(); });
      bindSeg(box, 'energy', v => { f.minEnergy = +v; this.renderFilters(); this.render(); });
      $('#sf-toggle').onclick = () => { this.showF = !this.showF; this.renderFilters(); };
      $$('[data-role]', box).forEach(b => b.onclick = () => { toggleIn(f.roles, b.dataset.role); this.renderFilters(); this.render(); });
      $$('[data-lang]', box).forEach(b => b.onclick = () => { toggleIn(f.langs, b.dataset.lang); this.renderFilters(); this.render(); });
      requestAnimationFrame(() => placeThumbs(box));
    },
    render() {
      this.items = search(this.input.value, { scope: this.scope, filters: this.f });
      this.sel = 0;
      const ctx = this.opts.context ? info(this.opts.context) : null;
      const badge = this.opts.badge || defaultBadge;
      this.list.innerHTML = this.items.length
        ? this.items.map((p, i) => {
          const it = info(p);
          return `<li role="option" id="so-${i}" aria-selected="${i === 0}"><button class="row ${i === 0 ? 'sel' : ''} ${isSTier(it.rating) ? 's-tier' : ''}" data-hc="${esc(p)}" data-i="${i}" tabindex="-1">${artHTML(p)}
            <span class="meta"><span class="t">${esc(it.title)}</span><span class="a">${esc(it.artist)}${it.comment ? ` · <i>${esc(it.comment)}</i>` : ''}</span></span>
            <span class="right">${ctx && ctx.path !== p ? moveBadge(ctx, it, { sm: true, keys: false }) : ''}${sTierTag(it)}${ratingChips(it)}${bpmChip(it)}${keyChip(it)}${badge(p)}</span></button></li>`;
        }).join('')
        : `<li class="list-empty">${Library.scan.state !== 'done' ? 'Still reading the folder — results appear as tracks are read.' : 'No songs match.'}</li>`;
      $('#sheet-n').textContent = this.items.length ? fmtN(this.items.length) + (this.items.length >= 150 ? '+' : '') + ' songs' : '';
      if (this.items.length) this.input.setAttribute('aria-activedescendant', 'so-0');
      hydrate(this.list);
    },
    move(d) {
      if (!this.items.length) return;
      const rows = $$('.row', this.list);
      rows[this.sel]?.classList.remove('sel'); rows[this.sel]?.parentElement.setAttribute('aria-selected', 'false');
      this.sel = (this.sel + d + this.items.length) % this.items.length;
      const r = rows[this.sel]; r.classList.add('sel'); r.parentElement.setAttribute('aria-selected', 'true');
      r.scrollIntoView({ block: 'nearest' }); this.input.setAttribute('aria-activedescendant', r.parentElement.id);
    },
    pick(i) { const p = this.items[i]; if (p === undefined) return; const cb = this.opts.onPick; this.close(); cb(p); },
  };
  function toggleIn(arr, v) { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }
  function defaultBadge(p) { const s = MeshStore.byPath.get(p); return s ? `<span class="tag" title="In mesh · ${s.transitions.length} transitions out">${s.transitions.length} →</span>` : ''; }
  Sheet.input.addEventListener('input', () => { clearTimeout(Sheet.t); Sheet.t = setTimeout(() => { Sheet.t = 0; Sheet.render(); }, 40); });
  Sheet.input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); Sheet.move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); Sheet.move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (Sheet.t) { clearTimeout(Sheet.t); Sheet.t = 0; Sheet.render(); } Sheet.pick(Sheet.sel); }
  });
  Sheet.list.addEventListener('click', e => { const r = e.target.closest('[data-i]'); if (r) Sheet.pick(+r.dataset.i); });
  scrim.addEventListener('click', () => { if (Sheet.isOpen) Sheet.close(); });

  function search(q, { scope = 'all', limit = 150, filters: f } = {}) {
    const toks = normTxt(q).split(/\s+/).filter(Boolean);
    const meshPaths = MeshStore.mesh.songs.map(s => s.path);
    let pool;
    if (scope === 'mesh') pool = meshPaths;
    else if (scope === 'torate') pool = Library.sorted.filter(p => Library.isToRate(Library.get(p)));
    else pool = [...new Set([...meshPaths.slice().reverse(), ...Library.sorted])];
    const fl = f && (f.roles.length || f.minEnergy || f.langs.length) ? f : null;
    const scored = [];
    for (const p of pool) {
      const e = Library.get(p);
      if (fl && !(e && Suggest.passes(e, fl))) continue;
      if (!toks.length) { scored.push([0, p]); if (scored.length >= limit) break; continue; }
      let hay = e ? e.hay : null;
      if (!hay) { const s = MeshStore.byPath.get(p); hay = normTxt(`${s?.title} ${s?.artist} ${p}`); }
      if (!toks.every(x => hay.includes(x))) continue;
      const t = normTxt(e ? e.title : MeshStore.byPath.get(p)?.title), ar = normTxt(e ? e.artist : MeshStore.byPath.get(p)?.artist);
      let sc = 0;
      if (t.startsWith(toks[0])) sc += 30; else if (t.includes(toks[0])) sc += 12;
      if (ar.startsWith(toks[0])) sc += 14; else if (ar.includes(toks[0])) sc += 6;
      const s = MeshStore.byPath.get(p); if (s) sc += 8 + Math.min(6, s.transitions.length);
      scored.push([sc, p]);
    }
    if (toks.length) scored.sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1]));
    return scored.slice(0, limit).map(x => x[1]);
  }
  function openSearch() {
    const ctx = A.view === 'dj' ? A.now : A.view === 'add' ? (A.add?.a || null) : null;
    if (A.view === 'rate') return Sheet.open({ title: 'Jump to a song to rate', scope: 'all', onPick: p => { rateSelect(p); } });
    if (A.view === 'add') return pickSlot(A.add?.a ? 'B' : 'A');
    Sheet.open({ title: A.view === 'dj' ? 'Jump to' : 'Search', context: ctx, onPick: p => { djGo(p); go('dj'); } });
  }
  function openJump() { Sheet.open({ title: 'Jump to', context: A.now, onPick: p => djGo(p) }); }

  /* the rest of the views are in part 2 below */
  window.MeshApp = { HC, A, info, keyChip, bpmChip, ratingChips, isSTier, sTierTag, shownTags, RATING_LABEL, roleLangChips, pips, moveBadge, moveOf, bpmDiff, artHTML, hydrate, toast, ask, Pop, seg, placeThumbs, bindSeg,
    Player, transportHTML, bindTransport, syncTransport, go, render, renderSoon, persist, bannersHTML, Sheet, search, openSearch, openJump, filters, isFiltered, filterCount,
    readOnlyMesh, keyText, toggleIn, defaultBadge, renderNav, renderMini, pickFolder, openRoot, backToOpen, setAmbient };
  // forward declarations used above; defined in part 2
  function startAdd(...a) { return window.MeshApp.startAdd(...a); }
  function renderRate() { return window.MeshApp.renderRate(); }
  function renderAdd() { return window.MeshApp.renderAdd(); }
  function renderDJ() { return window.MeshApp.renderDJ(); }
  function djGo(...a) { return window.MeshApp.djGo(...a); }
  function rateSelect(...a) { return window.MeshApp.rateSelect(...a); }
  function pickSlot(...a) { return window.MeshApp.pickSlot(...a); }
  function saveAllDrafts() { return window.MeshApp.saveAllDrafts(); }
})();
