'use strict';
/* KeyRules v1 — shared key logic for Mesh v2 and Key Wheel.
   Any change here must be copied into keywheel/index.html (tests/keyrules.test.js checks they match).
   24 keys: 1A–12A minor, 1B–12B major, numbers wrap 12 ↔ 1. Each key has 9 move targets that never
   overlap, so classify(from, to) always returns exactly one move, or Off-wheel / Key unknown. */
const KeyRules = (() => {
  const MINOR = ['', 'G♯m', 'E♭m', 'B♭m', 'Fm', 'Cm', 'Gm', 'Dm', 'Am', 'Em', 'Bm', 'F♯m', 'C♯m'];
  const MAJOR = ['', 'B', 'F♯', 'D♭', 'A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E'];
  const TIERS = {
    harmonic: { label: 'Harmonic', sub: 'safe, seamless blends', hex: '#3ddc97' },
    energy:   { label: 'Energy',   sub: 'key-change lifts & drops', hex: '#ffb547' },
    creative: { label: 'Creative', sub: 'mood flips & diagonals', hex: '#b48cff' },
  };
  const ORDER = ['harmonic', 'energy', 'creative'];
  const w = n => ((n - 1) % 12 + 12) % 12 + 1;
  const shortName = (n, m) => m === 'A' ? MINOR[n] : MAJOR[n];
  const fullName = (n, m) => m === 'A' ? MINOR[n].slice(0, -1) + ' minor' : MAJOR[n] + ' major';
  const hue = n => ((n - 1) * 30 + 340) % 360;
  const fill = (n, m) => `hsl(${hue(n)} ${m === 'B' ? 72 : 62}% ${m === 'B' ? 64 : 52}%)`;

  /** The 12 moves out of a key (9 distinct targets for any one key), as in Key Wheel. */
  function moves(n, m) {
    const o = m === 'A' ? 'B' : 'A';
    return [
      { n, m, tier: 'harmonic', word: 'Perfect Match', dir: '=', desc: 'Same key. Blend as long as you like.' },
      { n: w(n + 1), m, tier: 'harmonic', word: 'Energy Up', dir: '↑', desc: '+1 on the wheel (up a fifth). Gentle, natural lift.' },
      { n: w(n - 1), m, tier: 'harmonic', word: 'Energy Down', dir: '↓', desc: '−1 on the wheel (down a fifth). Eases the room down.' },
      m === 'A'
        ? { n, m: o, tier: 'harmonic', word: 'Brighten', dir: '☀', desc: 'Relative major — same notes, happier feel.' }
        : { n, m: o, tier: 'harmonic', word: 'Darken', dir: '☾', desc: 'Relative minor — same notes, moodier feel.' },
      { n: w(n + 2), m, tier: 'energy', word: 'Power Boost', dir: '⇈', desc: '+2 (up a whole tone). Big lift — keep the blend short.' },
      { n: w(n + 7), m, tier: 'energy', word: 'Semitone Lift', dir: '⇈', desc: '+7 (up a half-step). The classic key-change pump; mix on a cut or drop.' },
      { n: w(n - 2), m, tier: 'energy', word: 'Cool Down', dir: '⇊', desc: '−2 (down a whole tone). Deliberate energy drop — cut, don’t blend.' },
      m === 'A'
        ? { n: w(n + 1), m: 'B', tier: 'creative', word: 'Diagonal Lift', dir: '↗', desc: 'Up one and over to major. Smooth lift with a brighter colour.' }
        : { n: w(n - 1), m: 'A', tier: 'creative', word: 'Diagonal Drop', dir: '↙', desc: 'Down one and over to minor. Smooth slide into darker territory.' },
      m === 'A'
        ? { n: w(n + 3), m: 'B', tier: 'creative', word: 'Parallel Major', dir: '⇄', desc: 'Same root note, flips to major. Dramatic mood lift — use a drop or breakdown.' }
        : { n: w(n - 3), m: 'A', tier: 'creative', word: 'Parallel Minor', dir: '⇄', desc: 'Same root note, flips to minor. Dramatic mood darkening — use a drop or breakdown.' },
    ];
  }

  /* ---- key objects and tag parsing (Mesh v1 parser, unchanged formats) ---- */
  const MAJ = { B: 1, Cb: 1, 'F#': 2, Gb: 2, Db: 3, 'C#': 3, Ab: 4, 'G#': 4, Eb: 5, 'D#': 5, Bb: 6, 'A#': 6, F: 7, 'E#': 7, C: 8, 'B#': 8, G: 9, D: 10, A: 11, E: 12, Fb: 12 };
  const MIN = { 'G#': 1, Ab: 1, 'D#': 2, Eb: 2, 'A#': 3, Bb: 3, F: 4, 'E#': 4, C: 5, 'B#': 5, G: 6, D: 7, A: 8, E: 9, Fb: 9, B: 10, Cb: 10, 'F#': 11, Gb: 11, 'C#': 12, Db: 12 };
  const key = (n, m) => ({ n, l: m, m, cam: n + m, name: shortName(n, m), full: fullName(n, m) });
  function parse(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    let x = s.match(/^0?(1[0-2]|[1-9])\s*([AB])\b/i);
    if (x) return key(+x[1], x[2].toUpperCase());
    x = s.match(/^(1[0-2]|[1-9])\s*([dm])$/i);                       // Open Key notation
    if (x) return key(((+x[1] + 6) % 12) + 1, x[2].toLowerCase() === 'm' ? 'A' : 'B');
    x = s.match(/^([A-Ga-g])\s*([#♯b♭]?)\s*(.*)$/);
    if (!x) return null;
    const acc = x[2] === '♯' ? '#' : x[2] === '♭' ? 'b' : x[2];
    const note = x[1].toUpperCase() + acc;
    const restRaw = x[3].trim(), rest = restRaw.toLowerCase().replace(/[\s.]/g, '');
    let minor;
    if (restRaw === 'M' || /^(maj|major|ma)$/.test(rest) || rest === '') minor = false;
    else if (/^(m|min|minor|mi|-)$/.test(rest) || rest.startsWith('min')) minor = true;
    else return null;
    const n = (minor ? MIN : MAJ)[note];
    return n ? key(n, minor ? 'A' : 'B') : null;
  }

  const OFF = { tier: 'off', word: 'Off-wheel', dir: '×', desc: 'No harmonic link — mix on a cut or echo-out.' };
  const UNKNOWN = { tier: 'unknown', word: 'Key unknown', dir: '?', desc: 'One of these songs has no key. Analyse it in Serato.' };
  /** The move that takes key `a` to key `b` (key objects from parse/key). */
  function classify(a, b) {
    if (!a || !b) return UNKNOWN;
    return moves(a.n, a.m || a.l).find(t => t.n === b.n && t.m === (b.m || b.l)) || OFF;
  }

  /** BPM rule (v1): ±3% good, ±6% ok, beyond bad; ratio > 1.75 or < 0.57 is half/double time. */
  function bpm(a, b) {
    if (!a || !b) return null;
    let r = b / a, mode = '';
    if (r > 1.75) { r /= 2; mode = '½×'; } else if (r < 0.57) { r *= 2; mode = '2×'; }
    const pct = (r - 1) * 100, abs = Math.abs(pct);
    return { pct, abs, mode, level: abs <= 3 ? 'good' : abs <= 6 ? 'ok' : 'bad' };
  }

  return { MINOR, MAJOR, TIERS, ORDER, moves, key, parse, classify, bpm, hue, fill, shortName, fullName, wrap: w };
})();
if (typeof module !== 'undefined') module.exports = KeyRules;
