'use strict';
/* MeshStore — the .mesh file: load, migrate (v1 → v2), back up, save safely, merge edits from another device.
   Format v2 only adds optional fields (writtenBy). Unknown fields at any level are kept and written back. */
const MeshStore = (() => {
  const FORMAT_VERSION = 2;
  const M = {
    handle: null, dir: null, mesh: null, byPath: new Map(), byId: new Map(), ver: 0,
    base: '', loadedMod: 0, origText: '', fromVersion: FORMAT_VERSION,
    newer: false,        // made by a newer Mesh → read-only
    memoryOnly: false,   // browser blocks writing → edits held in memory
    needsBackup: false, status: '', onStatus: () => {}, onConflict: async () => 'cancel', onReload: () => {},
  };

  function normalize(m) {
    if (!m || typeof m !== 'object' || m.format !== 'mesh' || !Array.isArray(m.songs)) throw new Error('Not a valid .mesh file');
    for (const s of m.songs) s.transitions = Array.isArray(s.transitions) ? s.transitions : [];
    m.songCount = Math.max(m.songCount || 0, ...m.songs.map(s => s.id || 0), 0);
    return m;
  }
  function index() {
    M.byPath = new Map(M.mesh.songs.map(s => [s.path, s]));
    M.byId = new Map(M.mesh.songs.map(s => [s.id, s]));
    M.ver++;
  }
  function blank(name) {
    const t = nowISO();
    return { format: 'mesh', version: FORMAT_VERSION, writtenBy: 'Mesh ' + APP_VERSION, name, created: t, modified: t, songCount: 0, songs: [] };
  }
  const setStatus = (text, cls = '') => { M.status = text; M.onStatus(text, cls); };

  /* Parse text into a mesh and decide how it may be used. Throws on invalid files (the file is untouched). */
  function interpret(text) {
    let m;
    try { m = JSON.parse(text || ''); } catch { throw new Error('Not valid JSON — the file was left untouched'); }
    normalize(m);
    const v = Number(m.version) || 1;
    return { mesh: m, version: v, newer: v > FORMAT_VERSION };
  }

  async function load(fh, dir) {
    const file = await fh.getFile();
    const text = await file.text();
    const { mesh, version, newer } = interpret(text);
    Object.assign(M, { handle: fh, dir, mesh, origText: text, fromVersion: version, newer, needsBackup: version < FORMAT_VERSION, memoryOnly: false, loadedMod: file.lastModified });
    if (version < FORMAT_VERSION) mesh.version = FORMAT_VERSION;      // upgrade in memory; written on first save
    M.base = JSON.stringify(mesh);
    index();
    setStatus(newer ? 'read-only' : 'opened');
    return { migrated: version < FORMAT_VERSION, newer, version };
  }

  async function create(dir, name) {
    let exists = true; try { await dir.getFileHandle(name + '.mesh'); } catch { exists = false; }
    if (exists) throw new Error('That file already exists.');
    const fh = await dir.getFileHandle(name + '.mesh', { create: true });
    const w = await fh.createWritable(); await w.write(JSON.stringify(blank(name), null, 2) + '\n'); await w.close();
    return fh;
  }

  const dirty = () => JSON.stringify(M.mesh) !== M.base;

  function ensureSong(path, snap) {
    let s = M.byPath.get(path);
    if (s) return s;
    M.mesh.songCount += 1;
    s = { id: M.mesh.songCount, path, title: snap.title, artist: snap.artist, bpm: snap.bpm, key: snap.key, added: nowISO(), transitions: [] };
    M.mesh.songs.push(s); index();
    return s;
  }

  /* ---- three-way merge (base / this device / disk) ---- */
  function pairs(m) {
    const byId = new Map(m.songs.map(s => [s.id, s])), out = new Map();
    for (const s of m.songs) for (const t of s.transitions) { const d = byId.get(t.to); if (d) out.set(s.path + '\u0000' + d.path, t); }
    return out;
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function merge(base, mine, disk) {
    const out = structuredClone(disk);
    out.songCount = Math.max(disk.songCount || 0, mine.songCount || 0, ...disk.songs.map(s => s.id));
    const byPath = new Map(out.songs.map(s => [s.path, s]));
    for (const s of mine.songs) if (!byPath.has(s.path)) {                // songs only this device added
      const c = { ...structuredClone(s), id: ++out.songCount, transitions: [] };
      out.songs.push(c); byPath.set(c.path, c);
    }
    const B = pairs(base), A = pairs(mine), D = pairs(disk);
    let conflicts = 0;
    const put = (key, t) => {
      const [fp, tp] = key.split('\u0000'), from = byPath.get(fp), to = byPath.get(tp);
      const ex = from.transitions.findIndex(x => x.to === to.id);
      const c = { ...structuredClone(t), to: to.id };
      if (ex >= 0) from.transitions[ex] = c; else from.transitions.push(c);
    };
    const drop = key => {
      const [fp, tp] = key.split('\u0000'), from = byPath.get(fp), to = byPath.get(tp);
      from.transitions = from.transitions.filter(x => x.to !== to.id);
    };
    for (const key of new Set([...A.keys(), ...D.keys(), ...B.keys()])) {
      const a = A.get(key), d = D.get(key), b = B.get(key);
      if (a && d) { if (!same(a, d)) put(key, (a.modified || '') > (d.modified || '') ? a : d); }
      else if (a && !d) {
        if (!b) put(key, a);                                               // added here
        else if (!same(a, b)) conflicts++;                                 // edited here, deleted there
      } else if (d && !a) {
        if (b && !same(d, b)) conflicts++;                                 // deleted here, edited there
        else if (b) drop(key);                                             // deleted here
      }
    }
    return { mesh: out, clean: conflicts === 0, conflicts };
  }

  /* ---- saving ---- */
  let chain = Promise.resolve();
  function save() { chain = chain.then(doSave, doSave); return chain; }
  async function doSave() {
    if (!M.mesh) return 'none';
    if (M.newer) { setStatus('read-only', 'warn'); return 'readonly'; }
    if (M.memoryOnly) { setStatus('not saved · download to keep', 'warn'); return 'memory'; }
    try {
      setStatus('saving…');
      const file = await M.handle.getFile();
      if (file.lastModified !== M.loadedMod) {
        const disk = interpret(await file.text());
        if (disk.newer) { M.newer = true; setStatus('read-only', 'warn'); return 'readonly'; }
        if (!dirty()) { adopt(disk.mesh, file.lastModified); setStatus('reloaded'); M.onReload(); return 'reloaded'; }
        const base = JSON.parse(M.base);
        const r = merge(base, M.mesh, disk.mesh);
        if (!r.clean) {
          const choice = await M.onConflict(r.conflicts);
          if (choice === 'theirs') { adopt(disk.mesh, file.lastModified); M.onReload(); setStatus('reloaded'); return 'reloaded'; }
          if (choice !== 'mine') { setStatus('not saved', 'err'); return 'cancelled'; }
        } else { M.mesh = r.mesh; index(); M.onReload(); }
      }
      if (M.needsBackup) await backup();
      M.mesh.version = FORMAT_VERSION;
      M.mesh.writtenBy = 'Mesh ' + APP_VERSION;
      M.mesh.modified = nowISO();
      const w = await M.handle.createWritable();
      await w.write(JSON.stringify(M.mesh, null, 2) + '\n');
      await w.close();
      M.loadedMod = (await M.handle.getFile()).lastModified;
      M.base = JSON.stringify(M.mesh);
      setStatus('saved', 'ok');
      return 'saved';
    } catch (e) {
      console.error(e);
      if (e.name === 'NotAllowedError' || e.name === 'SecurityError' || e.name === 'NoModificationAllowedError' || e.name === 'TypeError') {
        M.memoryOnly = true; setStatus('not saved · download to keep', 'warn'); return 'memory';
      }
      setStatus('save failed', 'err');
      throw e;
    }
  }
  function adopt(mesh, mod) { M.mesh = mesh; mesh.version = FORMAT_VERSION; M.loadedMod = mod; M.base = JSON.stringify(mesh); index(); }

  /* Copy the original v1 file to <name>.v1-backup.mesh, never overwriting an existing backup. */
  async function backup() {
    const name = M.handle.name.replace(/\.mesh$/i, '') + `.v${M.fromVersion}-backup.mesh`;
    let exists = true; try { await M.dir.getFileHandle(name); } catch { exists = false; }
    if (!exists) {
      const fh = await M.dir.getFileHandle(name, { create: true });
      const w = await fh.createWritable(); await w.write(M.origText); await w.close();
    }
    M.needsBackup = false;
    M.backupName = name;
  }

  /* Pick up edits made on another device while nothing is pending here. */
  async function checkDisk() {
    if (!M.handle || M.newer) return false;
    try {
      const file = await M.handle.getFile();
      if (file.lastModified === M.loadedMod) return false;
      const disk = interpret(await file.text());
      if (dirty()) return save().then(() => true);
      if (disk.newer) { M.newer = true; setStatus('read-only', 'warn'); return true; }
      adopt(disk.mesh, file.lastModified); M.onReload(); setStatus('reloaded');
      return true;
    } catch { return false; }
  }

  function download() {
    const blob = new Blob([JSON.stringify({ ...M.mesh, version: FORMAT_VERSION, writtenBy: 'Mesh ' + APP_VERSION, modified: nowISO() }, null, 2) + '\n'], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = M.handle?.name || 'library.mesh'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* ---- graph statistics: longest simple path in songs (v1) ---- */
  let memo = { ver: -1 };
  function stats() {
    if (memo.ver === M.ver && memo.mesh === M.mesh) return memo;
    const songs = M.mesh.songs, n = songs.length;
    const ix = new Map(songs.map((s, i) => [s.id, i]));
    const adj = songs.map(s => s.transitions.map(t => ix.get(t.to)).filter(v => v !== undefined));
    const edges = adj.reduce((a, l) => a + l.length, 0);
    let best = n ? [0] : [], approx = false, cyclic = false;
    const indeg = new Array(n).fill(0); adj.forEach(l => l.forEach(v => indeg[v]++));
    const order = [], q = []; indeg.forEach((d, i) => { if (!d) q.push(i); });
    const deg = indeg.slice();
    while (q.length) { const u = q.pop(); order.push(u); for (const v of adj[u]) if (--deg[v] === 0) q.push(v); }
    if (order.length === n) {
      const len = new Array(n).fill(1), nxt = new Array(n).fill(-1);
      for (let k = n - 1; k >= 0; k--) { const u = order[k]; for (const v of adj[u]) if (len[v] + 1 > len[u]) { len[u] = len[v] + 1; nxt[u] = v; } }
      let s = 0; for (let i = 1; i < n; i++) if (len[i] > len[s]) s = i;
      best = []; for (let u = s; u !== -1 && n; u = nxt[u]) best.push(u);
    } else {
      cyclic = true;
      let budget = 3e6; const on = new Uint8Array(n), path = [];
      const starts = [...indeg.keys()].sort((a, b) => indeg[a] - indeg[b]);
      const dfs = u => {
        if (--budget < 0) return;
        on[u] = 1; path.push(u);
        if (path.length > best.length) best = path.slice();
        for (const v of adj[u]) { if (!on[v]) dfs(v); if (budget < 0 || best.length === n) break; }
        on[u] = 0; path.pop();
      };
      for (const s of starts) { if (budget < 0 || best.length === n) break; if (adj[s].length) dfs(s); }
      approx = budget < 0;
    }
    memo = { ver: M.ver, mesh: M.mesh, songs: n, edges, longest: best.length, chain: best.map(i => songs[i]), approx, cyclic };
    return memo;
  }

  return Object.assign(M, { load, create, save, ensureSong, index, merge, interpret, checkDisk, download, stats, dirty, blank, FORMAT_VERSION });
})();
if (typeof module !== 'undefined') module.exports = MeshStore;
