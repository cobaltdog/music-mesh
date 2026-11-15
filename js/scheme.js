'use strict';
/* Rating scheme: 4 star ratings + Role + Language, written two ways:
   Serato-readable  GROUPING "SNG4 NRG3 GRV4 ICN5"  and  COMMENT "#peak @en @hi"
   App-readable     SINGALONG=4 ENERGY=3 GROOVE=4 ICONIC=5 ROLE=peak LANGUAGE=en;hi */
const Scheme = (() => {
  const RATINGS = [
    { key: 'SINGALONG', code: 'SNG', label: 'Singalong', low: 'Nobody knows the words', high: 'Whole room sings' },
    { key: 'ENERGY', code: 'NRG', label: 'Energy', low: 'Background', high: 'Peak-time banger' },
    { key: 'GROOVE', code: 'GRV', label: 'Groove', low: 'Hard to dance to', high: 'Impossible not to move' },
    { key: 'ICONIC', code: 'ICN', label: 'Iconic', low: 'Unknown', high: 'Everyone knows it' },
  ];
  const ROLES = [{ id: 'chill', label: 'Chill' }, { id: 'peak', label: 'Peak' }];
  const LANGUAGES = [
    { id: 'en', label: 'English' }, { id: 'hi', label: 'Hindi' }, { id: 'pa', label: 'Punjabi' },
    { id: 'es', label: 'Spanish' }, { id: 'pt', label: 'Portuguese' }, { id: 'fr', label: 'French' },
    { id: 'ar', label: 'Arabic' }, { id: 'ta', label: 'Tamil' }, { id: 'ko', label: 'Korean' },
    { id: 'af', label: 'Afrikaans' }, { id: 'inst', label: 'Instrumental' },
  ];
  const CUSTOM = new Set([...RATINGS.map(r => r.key), 'ROLE', 'LANGUAGE']);
  const CODE_RE = /(^|\s)(SNG|NRG|GRV|ICN)[0-5](?=\s|$)/g;
  const TOKEN_RE = /(^|\s)[#@][a-z]{2,8}(?=\s|$)/gi;

  const empty = () => ({ SINGALONG: 0, ENERGY: 0, GROOVE: 0, ICONIC: 0, ROLE: [], LANGUAGE: [] });
  const splitList = v => (v || '').split(/[;,/]/).map(s => s.trim().toLowerCase()).filter(Boolean);

  function read(tags) {
    const r = empty();
    for (const def of RATINGS) {
      const n = parseInt((tags[def.key] || [])[0], 10);
      if (n >= 1 && n <= 5) r[def.key] = n;
    }
    r.ROLE = splitList((tags.ROLE || [])[0]).filter(x => ROLES.some(o => o.id === x));
    r.LANGUAGE = splitList((tags.LANGUAGE || [])[0]);
    // Fallback: codes typed into Serato's Grouping / Comment columns by hand.
    const grouping = (tags.GROUPING || []).join(' ');
    for (const def of RATINGS) {
      if (r[def.key]) continue;
      const m = grouping.match(new RegExp('(?:^|\\s)' + def.code + '([1-5])(?=\\s|$)'));
      if (m) r[def.key] = +m[1];
    }
    const comment = [...(tags.COMMENT || []), ...(tags.DESCRIPTION || [])].join(' ');
    if (!r.ROLE.length) r.ROLE = [...comment.matchAll(/(?:^|\s)#(chill|peak)(?=\s|$)/gi)].map(m => m[1].toLowerCase());
    if (!r.LANGUAGE.length) r.LANGUAGE = [...comment.matchAll(/(?:^|\s)@([a-z]{2,8})(?=\s|$)/gi)].map(m => m[1].toLowerCase());
    r.ROLE = [...new Set(r.ROLE)]; r.LANGUAGE = [...new Set(r.LANGUAGE)];
    return r;
  }

  function missing(r) {
    const out = RATINGS.filter(d => !r[d.key]).map(d => d.label);
    if (!r.ROLE.length) out.push('Role');
    if (!r.LANGUAGE.length) out.push('Language');
    return out;
  }

  const clean = (s, re) => s.replace(re, ' ').replace(/\s+/g, ' ').trim();

  function rewriteField(entries, field, re, tokens, baseOverride) {
    const idx = entries.findIndex(e => e.slice(0, field.length + 1).toUpperCase() === field + '=');
    const base = baseOverride !== undefined ? clean(baseOverride, re)
      : idx >= 0 ? clean(entries[idx].slice(field.length + 1), re) : '';
    const value = [base, tokens.join(' ')].filter(Boolean).join(' ');
    if (idx >= 0) {
      const key = entries[idx].slice(0, field.length);
      if (value) entries[idx] = key + '=' + value; else entries.splice(idx, 1);
    } else if (value) entries.push(field + '=' + value);
  }

  /** Returns a new entries array with the rating applied; all other tags are kept as-is.
      Mesh v2: pass `comment` (a string) to replace the free-text part of COMMENT. The #/@ tokens
      are always kept and written at the end. Omit it and COMMENT's free text is kept unchanged. */
  function apply(entries, r, comment) {
    const out = entries.filter(e => {
      const i = e.indexOf('=');
      return i <= 0 || !CUSTOM.has(e.slice(0, i).toUpperCase());
    });
    const codes = RATINGS.filter(d => r[d.key]).map(d => d.code + r[d.key]);
    rewriteField(out, 'GROUPING', CODE_RE, codes);
    const tokens = [...r.ROLE.map(x => '#' + x), ...r.LANGUAGE.map(x => '@' + x)];
    // Serato's FLAC comment column has been seen reading either field, so both carry the tokens.
    rewriteField(out, 'COMMENT', TOKEN_RE, tokens, typeof comment === 'string' ? comment.replace(/[\r\n]+/g, ' ') : undefined);
    rewriteField(out, 'DESCRIPTION', TOKEN_RE, tokens);
    for (const d of RATINGS) if (r[d.key]) out.push(d.key + '=' + r[d.key]);
    if (r.ROLE.length) out.push('ROLE=' + r.ROLE.join(';'));
    if (r.LANGUAGE.length) out.push('LANGUAGE=' + r.LANGUAGE.join(';'));
    return out;
  }

  /** Mesh v2: the free-text part of COMMENT (tokens removed), e.g. "skip the long intro".
      Falls back to DESCRIPTION's free text, since Serato has been seen using either field. */
  function commentText(tags) {
    return clean(((tags.COMMENT || [])[0] || ''), TOKEN_RE) || clean(((tags.DESCRIPTION || [])[0] || ''), TOKEN_RE);
  }

  return { RATINGS, ROLES, LANGUAGES, empty, read, apply, missing, commentText };
})();

if (typeof module !== 'undefined') module.exports = Scheme;
