/* In-memory File System Access API for browser tests (injected before the app loads).
   showDirectoryPicker() resolves to a folder built from /testlib (listed in /testlib-files.json).
   Writes stay in memory; window.__fs exposes them so tests can check the bytes. */
(() => {
  let tick = 1_800_000_000_000;
  const mk = (name, kind) => ({ name, kind, children: kind === 'directory' ? new Map() : null, blob: null, mtime: tick++, locked: false });
  class FH {
    constructor(node) { this.node = node; this.kind = 'file'; this.name = node.name; }
    async getFile() { return new File([this.node.blob], this.node.name, { lastModified: this.node.mtime }); }
    async createWritable() {
      const node = this.node; if (node.locked) throw new DOMException('locked', 'NoModificationAllowedError');
      const parts = [];
      return { write: async d => { parts.push(d); }, close: async () => { node.blob = new Blob(parts); node.mtime = (tick += 1000); }, abort: async () => {} };
    }
    async queryPermission() { return 'granted'; } async requestPermission() { return 'granted'; }
    isSameEntry(o) { return o.node === this.node; }
  }
  class DH {
    constructor(node) { this.node = node; this.kind = 'directory'; this.name = node.name; }
    async *values() { for (const c of this.node.children.values()) yield c.kind === 'directory' ? new DH(c) : new FH(c); }
    async *entries() { for (const c of this.node.children.values()) yield [c.name, c.kind === 'directory' ? new DH(c) : new FH(c)]; }
    async getFileHandle(name, o = {}) {
      let c = this.node.children.get(name);
      if (!c) { if (!o.create) throw new DOMException('not found', 'NotFoundError'); c = mk(name, 'file'); c.blob = new Blob([]); this.node.children.set(name, c); }
      return new FH(c);
    }
    async getDirectoryHandle(name) { const c = this.node.children.get(name); if (!c) throw new DOMException('not found', 'NotFoundError'); return new DH(c); }
    async queryPermission() { return 'granted'; } async requestPermission() { return 'granted'; }
  }
  let rootNode = null;
  async function build() {
    const list = await (await fetch('/testlib-files.json')).json();
    rootNode = mk('Music', 'directory');
    await Promise.all(list.map(async p => {
      const parts = p.split('/'); let n = rootNode;
      for (const d of parts.slice(0, -1)) { if (!n.children.has(d)) n.children.set(d, mk(d, 'directory')); n = n.children.get(d); }
      const f = mk(parts.at(-1), 'file'); f.blob = await (await fetch('/testlib/' + p.split('/').map(encodeURIComponent).join('/'))).blob(); n.children.set(f.name, f);
    }));
    return new DH(rootNode);
  }
  let rootP = null;
  window.showDirectoryPicker = async () => (rootP ||= build());
  const node = p => { let n = rootNode; for (const d of p.split('/')) { n = n?.children.get(d); } return n; };
  window.__fs = {
    ready: () => (rootP ||= build()),
    async text(p) { return node(p).blob.text(); },
    async bytes(p) { return new Uint8Array(await node(p).blob.arrayBuffer()); },
    async b64(p) { const b = await this.bytes(p); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); },
    exists(p) { return !!node(p); },
    list(dir = '') { const n = dir ? node(dir) : rootNode; return [...n.children.keys()]; },
    async write(p, text) { const n = node(p); n.blob = new Blob([text]); n.mtime = (tick += 1000); },
    touch(p) { node(p).mtime = (tick += 1000); },
    lock(p, v = true) { node(p).locked = v; },
  };
})();
