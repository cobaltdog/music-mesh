'use strict';
/* Accent — turns an artwork colour into a readable accent for each theme.
   Keeps the artwork's hue, clamps saturation, then solves lightness for a fixed luminance so that:
   light theme: accent vs page >= 3:1 and dark text on accent >= 4.5:1
   dark theme:  accent vs page >= 3:1 and dark text on accent >= 4.5:1 */
const Accent = (() => {
  const BASE_LIGHT = [245, 245, 247], BASE_DARK = [16, 16, 20]; // Mesh v2 page colours
  const lum = ([r, g, b]) => {
    const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  function hsl2rgb(h, s, l) {
    const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [f(0), f(8), f(4)].map(v => Math.round(v * 255));
  }
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function atLum(h, s, target) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 26; i++) { const mid = (lo + hi) / 2; if (lum(hsl2rgb(h, s, mid)) < target) lo = mid; else hi = mid; }
    return hsl2rgb(h, s, (lo + hi) / 2);
  }
  const css = ([r, g, b]) => `rgb(${r} ${g} ${b})`;

  /** rgb -> { light: {accent, accent2, ink}, dark: {...} } or null when the colour is too grey to use. */
  function derive(rgb) {
    let [h, s] = rgb2hsl(...rgb);
    if (s < 0.22) return null;
    s = Math.min(0.9, Math.max(0.6, s));
    // Yellows turn muddy olive when darkened for a light page, so shift them to amber / green there.
    let hl = h;
    if (h >= 45 && h < 80) hl = 38; else if (h >= 80 && h < 95) hl = 110;
    const light = { accent: atLum(hl, s, 0.215), accent2: atLum(hl, s, 0.45), ink: hsl2rgb(hl, 0.45, 0.045) };
    const dark = { accent: atLum(h, s, 0.34), accent2: atLum(h, s, 0.56), ink: hsl2rgb(h, 0.45, 0.045) };
    const ok = ratio(light.accent, BASE_LIGHT) >= 3 && ratio(light.accent, light.ink) >= 4.5
      && ratio(dark.accent, BASE_DARK) >= 3 && ratio(dark.accent, dark.ink) >= 4.5;
    return ok ? { h, light, dark } : null;
  }

  const KEYS = ['--art-l', '--art-l2', '--art-ink-l', '--art-d', '--art-d2', '--art-ink-d'];
  function apply(rgb) {
    const st = document.documentElement.style;
    const d = rgb && derive(rgb);
    if (!d) { KEYS.forEach(k => st.removeProperty(k)); return false; }
    const vals = [d.light.accent, d.light.accent2, d.light.ink, d.dark.accent, d.dark.accent2, d.dark.ink];
    KEYS.forEach((k, i) => st.setProperty(k, css(vals[i])));
    return true;
  }
  return { derive, apply, ratio };
})();

if (typeof module !== 'undefined') module.exports = Accent;
