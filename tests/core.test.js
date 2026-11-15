/* Core checks for Mesh v2 (run: node tests/core.test.js [path/to/test.flac]).
   - KeyRules.classify vs Key Wheel's own lists for all 24 × 24 key pairs (§12 Phase 3)
   - Key Wheel carries the same KeyRules block (drift check)
   - Scheme comment read/write keeps tokens; ratings unchanged from Music Manager
   - FlacTags re-tag keeps every non-comment block and the audio bytes (§12 Phase 2)
   - MeshStore v1 → v2 interpretation and three-way merge (§5) */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const root = path.join(__dirname, '..');
global.normTxt = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
global.nowISO = () => new Date().toISOString();
global.APP_VERSION = '2.0.0';
const KeyRules = global.KeyRules = require(root + '/js/keyrules.js');
const Scheme = require(root + '/js/scheme.js');
const FlacTags = require(root + '/js/flactags.js');
const MeshStore = require(root + '/js/meshstore.js');
const Suggest = require(root + '/js/suggest.js');
let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

/* ---------- KeyRules vs Key Wheel (original v1 transitions(), from git tag/main) ---------- */
function keyWheelTransitions(html) {
  const src = html.match(/const w = n =>[\s\S]*?\n  function transitions\(n, m\) \{[\s\S]*?\n    return T;\n  \}/);
  if (!src) return null;
  return vm.runInNewContext(src[0] + '; transitions');
}
const kwOrig = process.env.KW_ORIG ? fs.readFileSync(process.env.KW_ORIG, 'utf8') : null;
ok('classify matches Key Wheel for all 24 × 24 pairs', () => {
  const tr = kwOrig ? keyWheelTransitions(kwOrig) : (n, m) => KeyRules.moves(n, m);
  assert(tr, 'could not extract Key Wheel transitions()');
  let pairs = 0, onWheel = 0;
  for (let n = 1; n <= 12; n++) for (const m of ['A', 'B']) {
    const list = tr(n, m), targets = new Map(list.map(t => [t.n + t.m, t]));
    assert.strictEqual(targets.size, 9, `${n}${m} should have 9 distinct targets`);
    for (let n2 = 1; n2 <= 12; n2++) for (const m2 of ['A', 'B']) {
      const r = KeyRules.classify(KeyRules.key(n, m), KeyRules.key(n2, m2)), kw = targets.get(n2 + m2);
      if (kw) { assert.strictEqual(r.word, kw.word, `${n}${m}→${n2}${m2}`); assert.strictEqual(r.tier, kw.tier); onWheel++; }
      else assert.strictEqual(r.tier, 'off', `${n}${m}→${n2}${m2} should be off-wheel`);
      pairs++;
    }
  }
  assert.strictEqual(pairs, 576); assert.strictEqual(onWheel, 24 * 9);
});
ok('classify: spot checks from the design plan', () => {
  const k = KeyRules.parse;
  assert.strictEqual(KeyRules.classify(k('8A'), k('11B')).word, 'Parallel Major');
  assert.strictEqual(KeyRules.classify(k('8B'), k('5A')).word, 'Parallel Minor');
  assert.strictEqual(KeyRules.classify(k('8A'), k('3A')).word, 'Semitone Lift');
  assert.strictEqual(KeyRules.classify(k('12A'), k('1A')).word, 'Energy Up');
  assert.strictEqual(KeyRules.classify(null, k('1A')).tier, 'unknown');
});
ok('key parser accepts v1 formats and uses Key Wheel names', () => {
  for (const [raw, cam] of [['8A', '8A'], ['08A', '8A'], ['Am', '8A'], ['A minor', '8A'], ['A#m', '3A'], ['B♭', '6B'], ['1m', '8A'], ['1d', '8B'], ['Abm', '1A']]) assert.strictEqual(KeyRules.parse(raw).cam, cam, raw);
  assert.strictEqual(KeyRules.parse('1A').name, 'G♯m'); assert.strictEqual(KeyRules.parse('3B').name, 'D♭');
});
ok('Key Wheel carries the same KeyRules v1 block', () => {
  const kw = fs.readFileSync(root + '/keywheel/index.html', 'utf8');
  const lib = fs.readFileSync(root + '/js/keyrules.js', 'utf8');
  const body = s => { const m = s.match(/const KeyRules = \(\(\) => \{[\s\S]*?\n\}\)\(\);/); return m && m[0]; };
  assert(body(kw), 'Key Wheel has no KeyRules block'); assert.strictEqual(body(kw), body(lib));
  assert(/KeyRules v1/.test(kw));
});
ok('BPM rule: ±3 good, ±6 ok, half/double time', () => {
  assert.strictEqual(KeyRules.bpm(125, 127).level, 'good');
  assert.strictEqual(KeyRules.bpm(125, 131).level, 'ok');
  assert.strictEqual(KeyRules.bpm(125, 140).level, 'bad');
  assert.strictEqual(KeyRules.bpm(70, 140).mode, '½×');
});

/* ---------- Scheme ---------- */
ok('Scheme: comment free text is replaced, tokens kept at the end', () => {
  const e = ['TITLE=x', 'COMMENT=old words #peak @en', 'DESCRIPTION=#peak @en', 'GROUPING=SNG4 NRG3 my notes'];
  const r = Scheme.read(FlacTags.tagMap(e));
  assert.deepStrictEqual(r.ROLE, ['peak']); assert.strictEqual(r.ENERGY, 3);
  assert.strictEqual(Scheme.commentText(FlacTags.tagMap(e)), 'old words');
  const out = Scheme.apply(e, r, 'skip the long intro');
  assert(out.includes('COMMENT=skip the long intro #peak @en'), out.join('|'));
  assert(out.includes('DESCRIPTION=#peak @en'));
  assert(out.includes('GROUPING=my notes SNG4 NRG3'));
});
ok('Scheme: without a comment argument behaves exactly like Music Manager', () => {
  const e = ['COMMENT=keep this #chill', 'GROUPING=SNG2'];
  const r = { ...Scheme.empty(), ENERGY: 5, ROLE: ['peak'], LANGUAGE: ['hi'] };
  const out = Scheme.apply(e, r);
  assert(out.includes('COMMENT=keep this #peak @hi')); assert(out.includes('GROUPING=NRG5'));
  assert(out.includes('ENERGY=5') && out.includes('ROLE=peak') && out.includes('LANGUAGE=hi'));
});
ok('Scheme: empty comment with no tokens removes COMMENT', () => {
  const out = Scheme.apply(['COMMENT=bye'], Scheme.empty(), '');
  assert(!out.some(x => x.startsWith('COMMENT=')));
});

/* ---------- FlacTags ---------- */
const flacPath = process.argv[2];
if (flacPath && fs.existsSync(flacPath)) {
  const buf = fs.readFileSync(flacPath);
  const blob = new Blob([buf]);
  (async () => {
    const parsed = await FlacTags.parse(blob);
    const r = Scheme.read(parsed.tags);
    r.ICONIC = 5; r.LANGUAGE = ['en', 'hi'];
    const out = await FlacTags.retag(blob, parsed, Scheme.apply(parsed.entries, r, 'new comment'));
    const nb = new Uint8Array(await out.arrayBuffer());
    const re = await FlacTags.parse(new Blob([nb]));
    assert.strictEqual(re.tags.COMMENT[0], 'new comment #peak @en @hi');
    assert.strictEqual(re.tags.CUSTOMTAG[0], 'keepme');
    assert.strictEqual(re.tags.ICONIC[0], '5');
    // every non-comment, non-padding block identical, and the audio frames identical
    const blk = (b, p) => Buffer.from(b.subarray(p.offset, p.offset + p.length));
    for (const t of [0, 6]) {
      const a = parsed.blocks.filter(b => b.type === t), b = re.blocks.filter(b => b.type === t);
      assert.strictEqual(a.length, b.length);
      a.forEach((x, i) => assert(blk(buf, x).equals(blk(nb, b[i])), 'block type ' + t + ' changed'));
    }
    assert(Buffer.from(buf.subarray(parsed.audioOffset)).equals(Buffer.from(nb.subarray(re.audioOffset))), 'audio changed');
    fs.writeFileSync(flacPath.replace(/\.flac$/, '.retagged.flac'), nb);
    passed++; console.log('  ✓ FlacTags re-tag keeps blocks + audio byte-for-byte');
    meshTests();
  })().catch(e => { console.error(e); process.exit(1); });
} else { console.log('  (skipping FLAC round-trip: no test file given)'); meshTests(); }

/* ---------- MeshStore ---------- */
function meshTests() {
  ok('v1 file is upgraded in memory; v3 opens read-only; junk refused', () => {
    const v1 = JSON.stringify({ format: 'mesh', version: 1, name: 'x', songCount: 1, extra: { keep: 1 }, songs: [{ id: 1, path: 'a.flac', transitions: [], mine: 'x' }] });
    const r = MeshStore.interpret(v1);
    assert.strictEqual(r.version, 1); assert.strictEqual(r.newer, false); assert.deepStrictEqual(r.mesh.extra, { keep: 1 }); assert.strictEqual(r.mesh.songs[0].mine, 'x');
    assert.strictEqual(MeshStore.interpret(JSON.stringify({ format: 'mesh', version: 3, songs: [] })).newer, true);
    assert.throws(() => MeshStore.interpret('{nope'));
    assert.throws(() => MeshStore.interpret('{"format":"other","songs":[]}'));
  });
  const song = (id, p, tr = []) => ({ id, path: p, transitions: tr });
  const t = (to, notes, mod) => ({ to, notes, created: '2026-01-01', modified: mod });
  const base = { format: 'mesh', version: 2, songCount: 3, songs: [song(1, 'a', [t(2, 'ab', '1'), t(3, 'ac', '1')]), song(2, 'b'), song(3, 'c')] };
  ok('merge: disjoint edits combine, new songs get fresh ids', () => {
    const mine = structuredClone(base); mine.songs.push(song(4, 'd')); mine.songCount = 4; mine.songs[1].transitions.push(t(4, 'bd', '2'));
    const disk = structuredClone(base); disk.songs.push(song(4, 'e')); disk.songCount = 4; disk.songs[2].transitions.push(t(4, 'ce', '2'));
    const r = MeshStore.merge(base, mine, disk);
    assert(r.clean);
    const by = new Map(r.mesh.songs.map(s => [s.path, s]));
    assert.strictEqual(by.get('e').id, 4); assert.strictEqual(by.get('d').id, 5);
    assert.deepStrictEqual(by.get('b').transitions.map(x => x.to), [5]);
    assert.deepStrictEqual(by.get('c').transitions.map(x => x.to), [4]);
  });
  ok('merge: same pair → newer modified wins; delete here + untouched there → deleted', () => {
    const mine = structuredClone(base); mine.songs[0].transitions = [t(2, 'mine', '3')];
    const disk = structuredClone(base); disk.songs[0].transitions[0] = t(2, 'theirs', '2');
    const r = MeshStore.merge(base, mine, disk);
    assert(r.clean);
    assert.deepStrictEqual(r.mesh.songs[0].transitions.map(x => x.notes), ['mine']);
  });
  ok('merge: deleted here but edited there is not clean', () => {
    const mine = structuredClone(base); mine.songs[0].transitions = [t(2, 'ab', '1')];
    const disk = structuredClone(base); disk.songs[0].transitions[1] = t(3, 'edited', '5');
    assert(!MeshStore.merge(base, mine, disk).clean);
  });

  /* ---------- Suggest ---------- */
  ok('Suggest: never lists a linked song; tiers, tolerance and filters apply', () => {
    const E = (p, k, bpm, nrg = 0, role = []) => ({ path: p, title: p, k: KeyRules.parse(k), bpm, rating: { ...Scheme.empty(), ENERGY: nrg, ROLE: role } });
    const cur = E('cur', '8A', 125);
    const pool = [cur, E('same', '8A', 126, 2), E('up', '9A', 124, 5), E('linked', '9A', 125), E('far', '9A', 140), E('clash', '2B', 125), E('creative', '11B', 125, 1, ['peak']), E('half', '7A', 62.5)];
    const r = Suggest.candidates(cur, pool, new Set(['linked']), { tolerance: 6 });
    assert.deepStrictEqual(r.map(x => x.e.path), ['half', 'up', 'same', 'creative']);
    const f = Suggest.candidates(cur, pool, new Set(['linked']), { tolerance: 6, filters: { tiers: ['creative'], roles: ['peak'] } });
    assert.deepStrictEqual(f.map(x => x.e.path), ['creative']);
    assert.deepStrictEqual(Suggest.candidates(cur, pool, new Set(), { filters: { minEnergy: 5 } }).map(x => x.e.path), ['up']);
  });
  console.log(`\n${passed} checks passed`);
}
