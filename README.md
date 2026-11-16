# music-mesh

Manage, edit and practice your music.

Three personal tools for preparing and playing DJ sets from a local FLAC library:

| App | What it answers | Runs on | Data lives in |
|---|---|---|---|
| **Mesh** — [`index.html`](index.html) | "What do I know how to mix this song into?" | Chrome / Edge / Arc (desktop) | `.mesh` file in the music folder root |
| **Music Manager** — [`music-manager/`](music-manager/index.html) | "What kind of song is this?" | Windows 11 desktop app, or HTML in Chrome/Edge | Tags inside each `.flac` file (Serato-visible) |
| **Key Wheel** — [`keywheel/`](keywheel/index.html) | "Which keys can I move to from here?" | iPhone web page (home-screen app) | Browser storage only — no files |

---

## 1. Mesh

One app for the whole DJ workflow, reading and writing your local music folder in Chrome, Edge or Arc:

- **Rate** (prepare) — Music Manager inside Mesh: Singalong, Energy, Groove, Iconic, Role, Language and a song comment, written into the FLAC tags so Serato shows them.
- **Add music** (connect) — record a transition between two songs, with notes, the Key Wheel move and BPM difference, and suggestions of unlinked songs that fit.
- **DJ** (perform) — play from a song, see every branch you know with its move and mixing advice, a mini Key Wheel, “Fits, not yet tried”, filters, and sort by move, BPM or any rating tag. S-Tier songs (every star rating 4+) get a gold border; hover a song for all its ratings.

### Running
- **Local:** open `index.html` from a clone (Chrome / Edge / Arc).
- **Hosted:** connect the repo to Cloudflare Pages, Netlify or Vercel (static site, no build step, publish the repo root; config files included). The hosted site can be installed as an app from the address bar. It only contains the app code; your music, ratings and `.mesh` never leave your computer.

### What lives where
| Fact | Stored in |
|---|---|
| Title, artist, artwork, BPM, key | File tags (Serato) |
| Ratings, role, language, song comment | FLAC tags: `GROUPING` codes, `COMMENT`/`DESCRIPTION` tokens, custom fields |
| Songs, transitions, notes | `.mesh` file in the folder root |
| Key-move rules | `js/keyrules.js` (`KeyRules v1`, shared with Key Wheel) |
| Notation, theme, filters, sort, rating tags shown | This browser |

### The `.mesh` file (format v2)
v2 adds only optional fields (`writtenBy`). v1 files open normally and are upgraded on the first save, after the original is copied to `<name>.v1-backup.mesh` (never overwritten). Files from a newer Mesh open read-only. Unknown fields are kept. Before each save Mesh checks whether another device changed the file: if only the other device did, it reloads; if both did, it merges non-overlapping edits (newer `modified` wins for the same pair) and asks when it can't.

### Write safety (ratings)
Only the Vorbis comment block is rewritten; STREAMINFO, pictures, Serato blocks and audio are copied byte-for-byte, and the new header is parsed back before writing. Saving is refused if the file changed since it was read, and a file locked by Serato gets “Close it in Serato and try again”. MP3s are read-only.

### Shortcuts
`/` search · `Space` play/pause · `←` `→` 10 s · `Esc` close/back · Rate: `[` `]` prev/next, `C` `P` Chill/Peak, `Enter` save & next · DJ: `1`–`9` take branch, `+` add transition · Add: `Ctrl+Enter` done.

### Code
| File | Module |
|---|---|
| `js/flactags.js` | FlacTags (from Music Manager, unchanged) |
| `js/scheme.js` | Scheme (from Music Manager) + song comment |
| `js/accent.js` | Accent (from Music Manager) |
| `js/keyrules.js` | KeyRules v1 — keys, names, colours, 12 moves, `classify`, BPM rule |
| `js/library.js` | Id3Read + one folder walk, tag/rating cache, artwork |
| `js/meshstore.js` | Load, migrate, back up, safe save, merge, longest path |
| `js/suggest.js` | Suggest + shared filters |
| `js/app.js`, `js/views.js` | Views, shared player, search, settings, keyboard |

### Tests
- `node tests/core.test.js [file.flac]` — `classify` against Key Wheel for all 24 × 24 pairs, Key Wheel/KeyRules drift, Scheme comment, FLAC byte-for-byte re-tag, `.mesh` migration and merge, Suggest.
- `python3 tests/make_library.py SITE/testlib` then `python3 tests/e2e.py` — the whole app in Chrome against a generated library (fake folder API), both themes, phone width.

### Version history
| Version | Date | Changes |
|---|---|---|
| **v2.1** | 16 Nov 2026 | Two rating tags on every song, chosen in Settings (Singalong + Energy by default), with numbers coloured blue (1) → red (5); DJ sort by any rating tag, applied to branches and “Fits, not yet tried”; S-Tier gold border when every star rating is 4 or more; hover card with all star ratings; larger mini Key Wheel with its legend behind an ⓘ button; set path removed. |
| **v2.0** “Second Release” | 15 Nov 2026 | Rate mode (Music Manager merged in, plus song comments and a changed-on-disk check); Key Wheel moves, advice and a mini wheel in Add and DJ; Suggest; filters and sort; set path with Undo; `.mesh` v2 with backup, read-only for newer files and multi-device merge; Apple-style redesign in dark and light; installable web app; `_Serato_` skipped; unreadable files reported. Verdicts considered and dropped. Spec: [`docs/design-plan-v2.md`](docs/design-plan-v2.md). |
| v1.0 | 31 Oct 2026 | First release: `.mesh` v1, Open/Home/Add/DJ, FLAC/MP3 tags, Camelot keys, BPM/key chips, longest path. Git tag `v1.0`. |

---

## 2. Music Manager

File: `music-manager/index.html`

Rates songs directly in the existing FLAC library. Ratings are written into the files themselves, so they show up in Serato.

> Retired once Mesh v2's Rate mode is confirmed on your library; kept here for reference. The comment box and changed-on-disk check exist in Mesh v2's Rate mode, not in this file.

- **Library:** choose a folder; scans subfolders for FLAC, skips `_Serato_` and hidden files, reads existing tags, reports unreadable files, remembers the last folder (desktop app).
- **Track list:** all tracks; filters To rate / Rated / All; search by title, artist, filename or comment; shows how many of the 6 fields are set; marks unsaved changes; progress (rated / left).
- **Track info:** title, artist, embedded artwork, BPM and key from Serato's analysis (says when missing).
- **Playback:** play/pause, seek, ±10 s, previous/next, elapsed and total time.
- **Rating:**
  - 1–5 for Singalong, Energy, Groove and Iconic. Clicking the selected rating again clears it.
  - Role (multi-select): Chill, Peak.
  - Language (multi-select): English, Hindi, Punjabi, Spanish, Portuguese, French, Arabic, Tamil, Korean, Afrikaans, Instrumental.
  - Preview of the tags to be written; loads existing ratings from the file.
- **Comments:** free-text comment saved to the COMMENT tag (visible in Serato's Comment column). Keeps the `#role` / `@language` tokens in that field intact.
- **What it writes:**
  - `GROUPING` = `SNG4 NRG3 GRV4 ICN5`
  - `COMMENT` / `DESCRIPTION` = `#peak @en @hi`
  - Custom fields: `SINGALONG`, `ENERGY`, `GROOVE`, `ICONIC`, `ROLE`, `LANGUAGE`
- **Write safety:** all other tags, Serato cues/beatgrids, artwork and audio are left unchanged; new tags are verified before writing (abort on failure); refuses to save if the file changed on disk; reports files locked by Serato; writes to a temp file then replaces the original (desktop app); warns before closing with unsaved ratings.
- **Modes:** example tracks before a folder is chosen; write mode (desktop or HTML in Chrome/Edge); read-only mode keeps ratings in the browser with JSON export.
- **Shortcuts:** `space` play/pause, `←`/`→` seek 10 s, `[`/`]` previous/next, `C`/`P` toggle Chill/Peak, `Enter` or `Ctrl+Enter` save & next.
- **Settings:** light/dark mode, remembered.
- **Platforms:** Windows 11 installer, standalone HTML (Chrome/Edge), read-only web page.

---

## 3. Key Wheel

File: `keywheel/index.html`

A harmonic-mixing guide on the Camelot wheel. Needs no music files.

- **Keys:** all 24 (1A–12A minor, 1B–12B major), each mapped to its musical key (8A = A minor, 8B = C major); wraps 12 ↔ 1. Defaults to 8A.
- **Transition options** for the current key, each with a keyword, direction, short explanation and mixing advice (blend freely / keep short / change on a cut or drop). All are highlighted on the wheel.

| Group | Keyword | Move |
|---|---|---|
| Harmonic | Perfect Match | same key |
| | Energy Up | +1 |
| | Energy Down | −1 |
| | Brighten | minor → relative major (A → B) |
| | Darken | major → relative minor (B → A) |
| Energy | Power Boost | +2 (up a whole tone) |
| | Semitone Lift | +7 (up a half-step) |
| | Cool Down | −2 (down a whole tone) |
| Creative | Diagonal Lift | minor: +1 and to major (8A → 9B) |
| | Diagonal Drop | major: −1 and to minor (8B → 7A) |
| | Parallel Major | minor: +3 and to major (8A → 11B) |
| | Parallel Minor | major: −3 and to minor (8B → 5A) |

- **Following a set:** picking an option makes it the current key and recalculates the options. Every key is recorded as a set path (last 10 shown), with Undo and Clear.
- **Filters:** Harmonic / Energy / Creative on or off, hidden from both the list and the wheel; says when everything is filtered out.
- **Notation:** switch labels between Camelot (8A) and key names (Am); the other notation is always shown alongside.
- **Remembered** on the same device: notation, current key, set path (last 40) and filters.
- **Platform:** iPhone-sized web page, can be added to the home screen; no account, no files, no outside data.
- **Key rules:** carries the same `KeyRules v1` block as Mesh (`js/keyrules.js`); `tests/core.test.js` fails if they drift.

---

## How the three fit together

```
Music Manager  ──writes──▶  FLAC tags (ratings, role, language, comment)  ◀──reads──  Mesh
Mesh           ──writes──▶  .mesh file (songs + transitions + notes)
Key Wheel      ──rules──▶   KeyRules v1 (shared)  ──▶  Mesh Add + DJ modes
```

Each fact has exactly one home: **ratings in the files, transitions in the `.mesh` file, key theory in the Key Wheel rules.**

---

## Repo layout

```
music-mesh/
├── index.html, css/, js/, icons/   Mesh v2
├── manifest.webmanifest, sw.js     install + offline shell
├── _headers, netlify.toml, vercel.json   hosting config
├── keywheel/index.html             Key Wheel (iPhone)
├── music-manager/index.html        Music Manager (reference)
├── docs/design-plan-v2.md          v2 design plan
└── tests/                          core + browser tests, test-library generator
```

## Running

Open `index.html` (or the hosted site) in Chrome, Edge or Arc and choose your music folder. Nothing is uploaded: the apps read and write files on your computer only.

Older versions are git tags: `git checkout v1.0` restores Mesh v1.0 exactly.
