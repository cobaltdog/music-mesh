'use strict';
/* FlacTags — minimal FLAC metadata reader/writer (STREAMINFO, VORBIS_COMMENT, PICTURE).
   Rewrites only the Vorbis comment block; every other block and the audio frames are copied byte-for-byte. */
const FlacTags = (() => {
  const td = new TextDecoder('utf-8');
  const te = new TextEncoder();
  const T_STREAMINFO = 0, T_PADDING = 1, T_VORBIS = 4, T_PICTURE = 6;

  function makeReader(file) {
    let cache = null, cacheStart = 0;
    return async function read(start, end) {
      if (cache && start >= cacheStart && end <= cacheStart + cache.length) {
        return cache.subarray(start - cacheStart, end - cacheStart);
      }
      const want = Math.max(end - start, 131072);
      const buf = new Uint8Array(await file.slice(start, start + want).arrayBuffer());
      cache = buf; cacheStart = start;
      return buf.subarray(0, Math.min(end - start, buf.length));
    };
  }

  const u32le = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  const u32be = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

  function parseVorbis(data) {
    let p = 0;
    const vlen = u32le(data, p); p += 4;
    const vendor = td.decode(data.subarray(p, p + vlen)); p += vlen;
    const count = u32le(data, p); p += 4;
    const entries = [];
    for (let i = 0; i < count && p + 4 <= data.length; i++) {
      const len = u32le(data, p); p += 4;
      if (p + len > data.length) throw new Error('Corrupt Vorbis comment');
      entries.push(td.decode(data.subarray(p, p + len))); p += len;
    }
    return { vendor, entries };
  }

  function buildVorbis(vendor, entries) {
    const parts = [];
    const v = te.encode(vendor);
    const head = new Uint8Array(4 + v.length + 4);
    const dv = new DataView(head.buffer);
    dv.setUint32(0, v.length, true); head.set(v, 4); dv.setUint32(4 + v.length, entries.length, true);
    parts.push(head);
    for (const e of entries) {
      const b = te.encode(e);
      const h = new Uint8Array(4); new DataView(h.buffer).setUint32(0, b.length, true);
      parts.push(h, b);
    }
    return concat(parts);
  }

  function concat(parts) {
    const len = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(len); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  function parseStreamInfo(d) {
    const sampleRate = (d[10] << 12) | (d[11] << 4) | (d[12] >> 4);
    const channels = ((d[12] >> 1) & 0x07) + 1;
    const bitsPerSample = (((d[12] & 0x01) << 4) | (d[13] >> 4)) + 1;
    const totalSamples = (d[13] & 0x0f) * 2 ** 32 + u32be(d, 14);
    return { sampleRate, channels, bitsPerSample, totalSamples, duration: sampleRate ? totalSamples / sampleRate : 0 };
  }

  /** Map of UPPERCASE key -> array of values */
  function tagMap(entries) {
    const m = {};
    for (const e of entries) {
      const i = e.indexOf('=');
      if (i <= 0) continue;
      const k = e.slice(0, i).toUpperCase();
      (m[k] = m[k] || []).push(e.slice(i + 1));
    }
    return m;
  }

  async function parse(file) {
    const read = makeReader(file);
    let prefixLen = 0;
    const head = await read(0, 10);
    if (head.length >= 10 && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
      const size = ((head[6] & 0x7f) << 21) | ((head[7] & 0x7f) << 14) | ((head[8] & 0x7f) << 7) | (head[9] & 0x7f);
      prefixLen = 10 + size + ((head[5] & 0x10) ? 10 : 0);
    }
    const magic = await read(prefixLen, prefixLen + 4);
    if (td.decode(magic) !== 'fLaC') throw new Error('Not a FLAC file');
    let off = prefixLen + 4, last = false;
    const blocks = [];
    while (!last) {
      const h = await read(off, off + 4);
      if (h.length < 4) throw new Error('Truncated metadata');
      last = !!(h[0] & 0x80);
      const type = h[0] & 0x7f;
      const length = (h[1] << 16) | (h[2] << 8) | h[3];
      blocks.push({ type, offset: off + 4, length });
      off += 4 + length;
      if (blocks.length > 512 || off > file.size) throw new Error('Corrupt metadata');
    }
    const audioOffset = off;
    const si = blocks.find(b => b.type === T_STREAMINFO);
    if (!si || blocks[0].type !== T_STREAMINFO) throw new Error('Missing STREAMINFO');
    const info = parseStreamInfo(await read(si.offset, si.offset + si.length));
    const vb = blocks.find(b => b.type === T_VORBIS);
    let vendor = 'Crate Rater', entries = [];
    if (vb) ({ vendor, entries } = parseVorbis((await read(vb.offset, vb.offset + vb.length)).slice()));
    const pics = blocks.filter(b => b.type === T_PICTURE);
    return { prefixLen, blocks, audioOffset, info, vendor, entries, tags: tagMap(entries), pictures: pics, size: file.size };
  }

  function parsePictureData(d) {
    let p = 0;
    const type = u32be(d, p); p += 4;
    const ml = u32be(d, p); p += 4;
    const mime = td.decode(d.subarray(p, p + ml)); p += ml;
    const dl = u32be(d, p); p += 4 + dl;
    p += 16;
    const len = u32be(d, p); p += 4;
    return { type, mime: mime || 'image/jpeg', data: d.slice(p, p + len) };
  }

  /** Returns {mime, data} for the front cover (or first picture), or null. */
  async function readPicture(file, parsed) {
    let chosen = null;
    for (const b of parsed.pictures) {
      const d = new Uint8Array(await file.slice(b.offset, b.offset + b.length).arrayBuffer());
      const pic = parsePictureData(d);
      if (!chosen || pic.type === 3) chosen = pic;
      if (pic.type === 3) break;
    }
    if (!chosen && parsed.tags.METADATA_BLOCK_PICTURE) {
      try {
        const bin = Uint8Array.from(atob(parsed.tags.METADATA_BLOCK_PICTURE[0]), c => c.charCodeAt(0));
        chosen = parsePictureData(bin);
      } catch (e) { /* ignore malformed */ }
    }
    return chosen && chosen.data.length ? chosen : null;
  }

  function blockHeader(type, length, isLast) {
    if (length > 0xffffff) throw new Error('Metadata block too large');
    return new Uint8Array([(isLast ? 0x80 : 0) | type, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff]);
  }

  /** Builds the new metadata header (prefix + fLaC + blocks) with the given Vorbis entries. */
  async function buildHeader(file, parsed, entries) {
    const meta = new Uint8Array(await file.slice(0, parsed.audioOffset).arrayBuffer());
    const vorbis = buildVorbis(parsed.vendor, entries);
    const oldTotal = parsed.blocks.reduce((s, b) => s + 4 + b.length, 0);
    const list = parsed.blocks.map(b => ({ type: b.type, data: meta.subarray(b.offset, b.offset + b.length) }));
    const vi = list.findIndex(b => b.type === T_VORBIS);
    if (vi >= 0) list[vi] = { type: T_VORBIS, data: vorbis };
    else list.splice(1, 0, { type: T_VORBIS, data: vorbis });
    // Keep total metadata size stable by resizing an existing PADDING block when possible.
    const pi = list.findIndex(b => b.type === T_PADDING);
    let newTotal = list.reduce((s, b) => s + 4 + b.data.length, 0);
    if (pi >= 0) {
      const target = list[pi].data.length - (newTotal - oldTotal);
      if (target >= 0) list[pi] = { type: T_PADDING, data: new Uint8Array(target) };
    }
    const parts = [meta.subarray(0, parsed.prefixLen), te.encode('fLaC')];
    list.forEach((b, i) => parts.push(blockHeader(b.type, b.data.length, i === list.length - 1), b.data));
    return concat(parts);
  }

  /** Returns a Blob of the full re-tagged file after verifying the new header parses back correctly. */
  async function retag(file, parsed, entries) {
    const header = await buildHeader(file, parsed, entries);
    const check = await parse(new Blob([header]));
    const oldSI = new Uint8Array(await file.slice(parsed.blocks[0].offset, parsed.blocks[0].offset + parsed.blocks[0].length).arrayBuffer());
    const newSI = header.subarray(check.blocks[0].offset, check.blocks[0].offset + check.blocks[0].length);
    if (oldSI.length !== newSI.length || oldSI.some((v, i) => v !== newSI[i])) throw new Error('Verification failed: STREAMINFO changed');
    if (check.entries.length !== entries.length || check.entries.some((e, i) => e !== entries[i])) throw new Error('Verification failed: tags did not round-trip');
    if (check.audioOffset !== header.length) throw new Error('Verification failed: header length');
    return new Blob([header, file.slice(parsed.audioOffset)], { type: 'audio/flac' });
  }

  return { parse, readPicture, retag, tagMap };
})();

if (typeof module !== 'undefined') module.exports = FlacTags;
