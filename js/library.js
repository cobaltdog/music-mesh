'use strict';
/* Library — one folder walk for the whole app (merged from Mesh v1 and Music Manager).
   FLAC tags, ratings and comments come from FlacTags + Scheme; MP3/WAV/AIFF tags from Id3Read.
   Skips dot-files and _Serato_ folders, caches tags (incl. ratings) per file size + mtime, counts unreadable files. */

/* Id3Read — MP3 tag and artwork reading (Mesh v1, unchanged). */
const Id3Read = (() => {
  const UTF8 = new TextDecoder('utf-8'), LATIN1 = new TextDecoder('latin1');
  const ascii = b => String.fromCharCode(...b);
  class Reader {
    constructor(file) { this.file = file; this.buf = null; this.off = 0; }
    async bytes(off, len) {
      if (!(this.buf && off >= this.off && off + len <= this.off + this.buf.length)) {
        const end = Math.min(this.file.size, off + Math.max(len, 32768));
        this.buf = new Uint8Array(await this.file.slice(off, end).arrayBuffer()); this.off = off;
      }
      const s = off - this.off; return this.buf.subarray(s, s + len);
    }
  }
  const syncsafe = (b, i) => (b[i] << 21) | (b[i + 1] << 14) | (b[i + 2] << 7) | b[i + 3];
  const be32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  function id3Text(enc, b) {
    let s;
    if (enc === 0) s = LATIN1.decode(b);
    else if (enc === 3) s = UTF8.decode(b);
    else if (enc === 2) s = new TextDecoder('utf-16be').decode(b);
    else { const le = !(b[0] === 0xfe && b[1] === 0xff); s = new TextDecoder(le ? 'utf-16le' : 'utf-16be').decode(b.subarray(2)); }
    return s.replace(/\0+$/, '').replace(/^﻿/, '');
  }
  function skipTerminated(b, p, enc) {
    if (enc === 1 || enc === 2) { while (p + 1 < b.length && !(b[p] === 0 && b[p + 1] === 0)) p += 2; return p + 2; }
    while (p < b.length && b[p] !== 0) p++; return p + 1;
  }
  async function parse(file) {
    const R = new Reader(file);
    const h = await R.bytes(0, 10);
    if (ascii(h.subarray(0, 3)) !== 'ID3') return null;
    const ver = h[3], flags = h[5], end = 10 + syncsafe(h, 6);
    let pos = 10;
    if (flags & 0x40) { const e = await R.bytes(pos, 4); pos += ver === 4 ? syncsafe(e, 0) : be32(e, 0) + 4; }
    const t = {}; let pic = null;
    while (pos + 10 <= end) {
      const fh = await R.bytes(pos, 10);
      const id = ascii(fh.subarray(0, 4));
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const fs = ver === 4 ? syncsafe(fh, 4) : be32(fh, 4);
      const body = pos + 10;
      if (fs <= 0 || body + fs > end + 10) break;
      if (id[0] === 'T' && fs < 8192) {
        const b = await R.bytes(body, fs);
        if (id === 'TXXX') { const p = skipTerminated(b, 1, b[0]); const desc = id3Text(b[0], b.subarray(1, p)).replace(/\0.*/, '').toUpperCase(); t['TXXX:' + desc] = id3Text(b[0], b.subarray(p)); }
        else t[id] = id3Text(b[0], b.subarray(1)).split('\0').filter(Boolean).join(', ');
      } else if (id === 'COMM' && fs < 8192 && !t.COMM) {
        const b = await R.bytes(body, fs); const p = skipTerminated(b, 4, b[0]); t.COMM = id3Text(b[0], b.subarray(p));
      } else if (id === 'APIC' && (!pic || pic.type !== 3)) {
        const b = await R.bytes(body, Math.min(fs, 2048));
        const enc = b[0]; let p = 1; const z = b.indexOf(0, p);
        let mime = LATIN1.decode(b.subarray(p, z)).toLowerCase(); p = z + 1;
        const ptype = b[p++]; p = skipTerminated(b, p, enc);
        if (!mime.includes('/')) mime = 'image/' + (mime === 'png' ? 'png' : 'jpeg');
        pic = { type: ptype, mime, offset: body + p, length: fs - p };
      }
      pos = body + fs;
    }
    return {
      title: t.TIT2, artist: t.TPE1 || t.TPE2, album: t.TALB,
      bpm: t.TBPM || t['TXXX:BPM'], key: t.TKEY || t['TXXX:INITIALKEY'] || t['TXXX:KEY'],
      comment: t.COMM, grouping: t.TIT1 || t.GRP1, pic, duration: null,
    };
  }
  return { parse };
})();

const Library = (() => {
  const AUDIO_RE = /\.(flac|mp3|m4a|aac|alac|wav|aiff?|ogg|oga|opus)$/i;
  const COVER_RE = /^(cover|folder|front|album|artwork)\.(jpe?g|png|webp)$/i;
  const CACHE_V = 2;

  const L = {
    root: null, entries: new Map(), covers: new Map(), sorted: [], unreadable: [],
    scan: { state: 'idle', done: 0, total: 0 }, token: null,
    onProgress: () => {}, onDone: () => {},
  };

  async function walk(dir, prefix, files, covers) {
    for await (const h of dir.values()) {
      if (h.name.startsWith('.') || h.name.startsWith('_Serato_')) continue;
      if (h.kind === 'directory') await walk(h, prefix + h.name + '/', files, covers);
      else if (AUDIO_RE.test(h.name)) files.push({ path: prefix + h.name, handle: h, dir: prefix });
      else if (COVER_RE.test(h.name) && !covers.has(prefix)) covers.set(prefix, h);
    }
  }

  /* Locate a FLAC picture's image bytes inside the file, without reading the picture. */
  async function flacPic(file, parsed) {
    let chosen = null;
    for (const b of parsed.pictures) {
      const d = new Uint8Array(await file.slice(b.offset, b.offset + Math.min(b.length, 8192)).arrayBuffer());
      const dv = new DataView(d.buffer);
      let p = 0; const type = dv.getUint32(p); p += 4;
      const ml = dv.getUint32(p); p += 4; const mime = new TextDecoder().decode(d.subarray(p, p + ml)); p += ml;
      const dl = dv.getUint32(p); p += 4 + dl + 16;
      const len = dv.getUint32(p); p += 4;
      if (len > 0 && b.offset + p + len <= b.offset + b.length) {
        const pic = { type, mime: mime || 'image/jpeg', offset: b.offset + p, length: len };
        if (!chosen || type === 3) chosen = pic;
        if (type === 3) break;
      }
    }
    return chosen;
  }

  /* Read one file into a plain, cacheable record. Throws for files that cannot be read. */
  async function readFile(file, path) {
    const ext = path.split('.').pop().toLowerCase();
    if (ext === 'flac') {
      const parsed = await FlacTags.parse(file);
      const t = parsed.tags, one = k => (t[k] || [])[0];
      return {
        flac: true,
        title: one('TITLE'), artist: (t.ARTIST || []).join(', ') || one('ALBUMARTIST'), album: one('ALBUM'),
        bpm: one('BPM') || one('TEMPO') || one('TBPM'), key: one('INITIALKEY') || one('KEY') || one('INITIAL_KEY') || one('TKEY'),
        rawComment: one('COMMENT') || one('DESCRIPTION'),
        comment: Scheme.commentText(t), rating: Scheme.read(t),
        pic: await flacPic(file, parsed), duration: parsed.info.duration || null,
      };
    }
    if (ext === 'mp3' || ext === 'wav' || ext === 'aif' || ext === 'aiff') {
      const r = (await Id3Read.parse(file)) || {};
      const tags = { GROUPING: r.grouping ? [r.grouping] : [], COMMENT: r.comment ? [r.comment] : [] };
      return { flac: false, ...r, rawComment: r.comment, comment: r.comment ? Scheme.commentText(tags) : '', rating: Scheme.read(tags) };
    }
    return { flac: false, rating: Scheme.empty(), comment: '' };
  }

  /* Normalise a record: filename fallback for title/artist, BPM range, key parse. */
  function shape(path, raw) {
    const file = path.split('/').pop().replace(/\.[^.]+$/, '');
    let title = (raw.title || '').trim(), artist = (raw.artist || '').trim();
    if (!title) {
      const m = file.match(/^(?:\d+[\s.\-_]+)?(.+?)\s+[-–]\s+(.+)$/);
      if (m) { artist = artist || m[1]; title = m[2]; } else title = file;
    }
    let bpm = parseFloat(String(raw.bpm || '').replace(',', '.'));
    bpm = bpm > 20 && bpm < 400 ? Math.round(bpm * 10) / 10 : null;
    let keyRaw = (raw.key || '').trim();
    let k = KeyRules.parse(keyRaw);
    if (!k && raw.rawComment) { const m = String(raw.rawComment).match(/^\s*(1[0-2]|0?[1-9][AB])\b/i); if (m) { k = KeyRules.parse(m[1]); keyRaw = keyRaw || m[1]; } }
    return {
      flac: !!raw.flac, title, artist, album: (raw.album || '').trim(), bpm, keyRaw, k,
      comment: raw.comment || '', rating: raw.rating || Scheme.empty(),
      pic: raw.pic || null, duration: raw.duration || null,
    };
  }

  function add(f, shaped, file) {
    const e = { ...shaped, path: f.path, handle: f.handle, dir: f.dir, size: file ? file.size : 0, mtime: file ? file.lastModified : 0 };
    reindex(e);
    L.entries.set(f.path, e);
    return e;
  }
  function reindex(e) {
    const lang = (e.rating?.LANGUAGE || []).join(' ');
    e.hay = normTxt(`${e.title} ${e.artist} ${e.album} ${e.path} ${e.comment} ${lang}`);
  }
  const cacheable = ({ k, ...rest }) => rest;

  async function scan(root) {
    const token = Symbol(); L.token = token; L.root = root;
    L.entries = new Map(); L.covers = new Map(); L.sorted = []; L.unreadable = [];
    L.scan = { state: 'walking', done: 0, total: 0 }; L.onProgress();
    const files = [];
    try { await walk(root, '', files, L.covers); }
    catch (e) { console.error(e); throw e; }
    if (L.token !== token) return false;
    L.scan.total = files.length; L.scan.state = 'reading'; L.onProgress();
    const cacheKey = 'tags2:' + root.name;
    let cache = {}; try { const c = await idb.get(cacheKey); if (c && c.v === CACHE_V) cache = c.files; } catch {}
    const fresh = {}; let i = 0;
    async function worker() {
      while (i < files.length) {
        const f = files[i++];
        let file = null;
        try {
          file = await f.handle.getFile();
          const c = cache[f.path];
          let shaped;
          if (c && c.s === file.size && c.m === file.lastModified) shaped = { ...c.e, k: KeyRules.parse(c.e.keyRaw) };
          else shaped = shape(f.path, await readFile(file, f.path));
          fresh[f.path] = { s: file.size, m: file.lastModified, e: cacheable(shaped) };
          add(f, shaped, file);
        } catch (e) {
          L.unreadable.push({ path: f.path, error: e.message || String(e) });
          add(f, { ...shape(f.path, {}), unreadable: true }, file);
        }
        L.scan.done++; L.onProgress();
        if (L.token !== token) return;
      }
    }
    await Promise.all(Array.from({ length: 6 }, worker));
    if (L.token !== token) return false;
    try { await idb.set(cacheKey, { v: CACHE_V, files: fresh }); } catch {}
    sort();
    L.scan.state = 'done'; L.onProgress(); L.onDone();
    return true;
  }
  function sort() {
    L.sorted = [...L.entries.values()].sort((a, b) => (a.artist || '').localeCompare(b.artist || '') || a.title.localeCompare(b.title)).map(e => e.path);
  }
  function cancel() { L.token = null; }

  /* Re-read one file after a write (or on "reload"), updating the entry and the cache. */
  async function refresh(path) {
    const e = L.entries.get(path); if (!e) return null;
    const file = await e.handle.getFile();
    const shaped = shape(path, await readFile(file, path));
    Object.assign(e, shaped, { size: file.size, mtime: file.lastModified, unreadable: false });
    L.unreadable = L.unreadable.filter(u => u.path !== path);
    reindex(e);
    artCache.delete(path);
    try {
      const key = 'tags2:' + L.root.name, c = (await idb.get(key)) || { v: CACHE_V, files: {} };
      c.files[path] = { s: file.size, m: file.lastModified, e: cacheable(shaped) };
      await idb.set(key, c);
    } catch {}
    return e;
  }

  /* ---- artwork ---- */
  const artCache = new Map();
  function art(path) {
    if (!L.entries.has(path)) return Promise.resolve(null);          // not read yet: don't cache a miss
    if (!artCache.has(path)) artCache.set(path, loadArt(path));
    return artCache.get(path);
  }
  async function loadArt(path) {
    const e = L.entries.get(path); if (!e) return null;
    try {
      if (e.pic) { const f = await e.handle.getFile(); return URL.createObjectURL(f.slice(e.pic.offset, e.pic.offset + e.pic.length, e.pic.mime)); }
      const c = L.covers.get(e.dir); if (c) return URL.createObjectURL(await c.getFile());
    } catch (err) { console.warn('art', path, err); }
    return null;
  }

  const isRated = e => e.flac && Scheme.missing(e.rating).length === 0;
  const isToRate = e => e.flac && !e.unreadable && Scheme.missing(e.rating).length > 0;
  function counts() {
    let flac = 0, rated = 0, toRate = 0;
    for (const e of L.entries.values()) { if (e.flac) flac++; if (isRated(e)) rated++; else if (isToRate(e)) toRate++; }
    return { total: L.entries.size, flac, rated, toRate, unreadable: L.unreadable.length };
  }

  return Object.assign(L, { scan, cancel, refresh, art, artCache, get: p => L.entries.get(p), counts, isRated, isToRate, shape, readFile, reindex, sort });
})();
