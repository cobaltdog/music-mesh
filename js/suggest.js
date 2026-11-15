'use strict';
/* Suggest — folder songs that fit as the next song (design plan §7.5).
   A song qualifies when its key is one of the current song's Key Wheel moves with that tier switched on,
   its BPM is within tolerance (half/double time allowed), it is not already a destination, and it passes the filters.
   Ranked by tier, then closest BPM, then highest Energy, then Iconic. */
const Suggest = (() => {
  const TIER_RANK = { harmonic: 0, energy: 1, creative: 2 };

  /** Filters shared by DJ branches and Suggest. f = { tiers:[...], roles:[...], minEnergy, langs:[...] } */
  function passes(e, f) {
    if (!f) return true;
    const r = e.rating || {};
    if (f.roles?.length && !f.roles.some(x => (r.ROLE || []).includes(x))) return false;
    if (f.minEnergy && (r.ENERGY || 0) < f.minEnergy) return false;
    if (f.langs?.length && !f.langs.some(x => (r.LANGUAGE || []).includes(x))) return false;
    return true;
  }

  /**
   * @param cur      library entry of the current song ({ path, k, bpm })
   * @param pool     iterable of library entries
   * @param linked   Set of paths that are already destinations of the current song
   * @param opts     { tolerance (percent), filters, onlyKey: 'cam' }
   */
  function candidates(cur, pool, linked, opts = {}) {
    if (!cur || !cur.k || !cur.bpm) return [];
    const tol = opts.tolerance ?? 6, f = opts.filters || {}, tiers = new Set(f.tiers || KeyRules.ORDER);
    const out = [];
    for (const e of pool) {
      if (e.path === cur.path || !e.k || !e.bpm || linked.has(e.path)) continue;
      if (opts.onlyKey && e.k.cam !== opts.onlyKey) continue;
      const mv = KeyRules.classify(cur.k, e.k);
      if (!(mv.tier in TIER_RANK) || !tiers.has(mv.tier)) continue;
      const b = KeyRules.bpm(cur.bpm, e.bpm);
      if (!b || b.abs > tol) continue;
      if (!passes(e, f)) continue;
      out.push({ e, mv, b });
    }
    out.sort((x, y) => TIER_RANK[x.mv.tier] - TIER_RANK[y.mv.tier] || x.b.abs - y.b.abs
      || (y.e.rating?.ENERGY || 0) - (x.e.rating?.ENERGY || 0) || (y.e.rating?.ICONIC || 0) - (x.e.rating?.ICONIC || 0)
      || x.e.title.localeCompare(y.e.title));
    return out;
  }

  return { candidates, passes, TIER_RANK };
})();
if (typeof module !== 'undefined') module.exports = Suggest;
