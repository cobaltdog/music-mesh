'use strict';
/* Small shared helpers. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = n => Number(n || 0).toLocaleString('en');
const nowISO = () => new Date().toISOString();
const normTxt = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const hashHue = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 16777619); return (h >>> 0) % 360; };
const fmtT = s => { if (!isFinite(s) || s < 0) s = 0; const m = Math.floor(s / 60), x = Math.floor(s % 60); return m + ':' + String(x).padStart(2, '0'); };
const fmtBpm = b => b == null ? '—' : (b % 1 ? b.toFixed(1) : String(b));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const APP_VERSION = '2.0.0';

/* IndexedDB key/value store: folder handles, tag cache. Same database as Mesh v1, so the last folder carries over. */
const idb = (() => {
  let p;
  const db = () => p ||= new Promise((res, rej) => {
    const r = indexedDB.open('mesh-app', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return {
    async get(k) { const d = await db(); return new Promise((res, rej) => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
    async set(k, v) { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
    async del(k) { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  };
})();

/* Settings on this device. */
const Prefs = (() => {
  const P = 'mesh2.';
  const DEF = { notation: 'camelot', theme: 'system', tolerance: 6, tiers: ['harmonic', 'energy', 'creative'], roles: [], minEnergy: 0, langs: [], sort: 'move', setPath: [], rateFilter: 'todo' };
  const get = k => { try { const v = localStorage.getItem(P + k); return v == null ? structuredClone(DEF[k]) : JSON.parse(v); } catch { return structuredClone(DEF[k]); } };
  const set = (k, v) => { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch {} };
  const reset = () => { try { Object.keys(localStorage).filter(k => k.startsWith(P)).forEach(k => localStorage.removeItem(k)); } catch {} };
  return { get, set, reset, DEF };
})();

const ICON = (() => {
  const s = (d, o = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${o}>${d}</svg>`;
  return {
    home: s('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>'),
    star: s('<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>'),
    starFill: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/></svg>',
    link: s('<circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="6" r="2.6"/><circle cx="18" cy="18" r="2.6"/><path d="M8.4 10.8 15.6 7.2M8.4 13.2l7.2 3.6"/>'),
    disc: s('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3a9 9 0 0 1 9 9"/>'),
    search: s('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
    gear: s('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    plus: s('<path d="M12 5v14M5 12h14"/>', 'stroke-width="2.4"'),
    x: s('<path d="M6 6l12 12M18 6 6 18"/>', 'stroke-width="2.2"'),
    check: s('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 'stroke-width="2.4"'),
    chevL: s('<path d="m15 18-6-6 6-6"/>', 'stroke-width="2.2"'),
    chevR: s('<path d="m9 18 6-6-6-6"/>', 'stroke-width="2.2"'),
    chevD: s('<path d="m6 9 6 6 6-6"/>', 'stroke-width="2.2"'),
    arrowR: s('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    edit: s('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
    trash: s('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    undo: s('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7.5 4.8v14.4c0 .8.9 1.3 1.6.9l11.3-7.2a1 1 0 0 0 0-1.8L9.1 3.9c-.7-.4-1.6.1-1.6.9z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect fill="currentColor" x="6" y="4.5" width="4.2" height="15" rx="1.2"/><rect fill="currentColor" x="13.8" y="4.5" width="4.2" height="15" rx="1.2"/></svg>',
    back10: s('<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/><text x="12" y="15.6" font-size="7" font-weight="700" fill="currentColor" stroke="none" text-anchor="middle" font-family="system-ui">10</text>'),
    fwd10: s('<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1l2.6 2.6"/><path d="M20.5 3.5v5h-5"/><text x="12" y="15.6" font-size="7" font-weight="700" fill="currentColor" stroke="none" text-anchor="middle" font-family="system-ui">10</text>'),
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 5h2v14H6zM20 6.2v11.6c0 .8-.9 1.3-1.5.8L10 12.8a1 1 0 0 1 0-1.6l8.5-5.8c.6-.5 1.5 0 1.5.8z"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16 5h2v14h-2zM4 6.2v11.6c0 .8.9 1.3 1.5.8l8.5-5.8a1 1 0 0 0 0-1.6L5.5 5.4C4.9 4.9 4 5.4 4 6.2z"/></svg>',
    folder: s('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    filter: s('<path d="M4 6h16M7 12h10M10 18h4"/>'),
    sort: s('<path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5"/>'),
    music: s('<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>'),
    download: s('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  };
})();

if (typeof module !== 'undefined') module.exports = { normTxt, hashHue, fmtT };
