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

A transition library. Every song you can mix points to the songs it mixes into, with notes for each transition.

### The `.mesh` file (format v1)
- Plain UTF-8 JSON, saved as `<name>.mesh` in the **root of the music folder**.
- Song paths are relative to that folder, so the folder can be moved as a whole.
- `songCount` is a running counter: each new song gets the next id (1, 2, 3 …). When a transition is added, the starting song is given its id before the destination.
- Each song stores **only its outgoing transitions**. The destination song has no knowledge of the transition.
- Title, artist, BPM and key are also stored per song, and re-synced from the file tags every time the mesh is opened.

```json
{
  "format": "mesh", "version": 1, "name": "My Sets",
  "created": "…", "modified": "…",
  "songCount": 2,
  "songs": [
    { "id": 1, "path": "House/Kairo - Glass Hours.flac",
      "title": "Glass Hours", "artist": "Kairo", "bpm": 125, "key": "9A", "added": "…",
      "transitions": [ { "to": 2, "notes": "bass swap on the 2nd drop", "created": "…", "modified": "…" } ] },
    { "id": 2, "path": "House/Nova Lane - Midnight Circuit.flac", "…": "…", "transitions": [] }
  ]
}
```

### Screens
- **Open:** pick the music folder. If it holds one `.mesh`, it opens; if several, you choose; if none, you name and create one. The last folder is offered again on the next visit.
- **Home (left):** mesh name, number of songs, number of transitions, longest path (in songs, with the chain shown), search, and Start DJ mode. A progress bar shows the folder being indexed.
- **Home (right):** Add music mode and the five latest transitions.
- **Add music mode:** empty starting slot → greyed arrow → empty destination slot, each slot with a + in the middle.
  - The destination can only be picked after the starting song.
  - Choosing a song opens a search panel in front; the slot then shows artwork, title, artist, BPM and key.
  - The arrow fills halfway after the first song and fully after the second.
  - The notes box appears only once both songs are chosen.
  - If the starting song already has transitions, they are listed at the bottom with Edit and Delete. Edit loads that transition into the slots. Picking a destination that is already in the list also opens it for editing.
  - Deletes are staged (crossed out, with undo) until the tick is pressed. Back discards all changes.
  - A song cannot transition into itself.
- **DJ mode:** player on the left (artwork, title, artist, BPM, key, play/pause, ±10 s, seek, trail of the songs played). On the right, an arrow per transition with an editable notes box leading to each destination card; clicking a card loads that song. A + adds a new transition from the current song. "Jump to" searches and loads any song.

### Other behaviour
- Reads title, artist, album, BPM, key and embedded artwork from FLAC (Vorbis comments) and MP3 (ID3) tags. Falls back to `cover.jpg` / `folder.jpg` for artwork and to "Artist - Title" filenames for missing tags.
- Keys are normalised to Camelot (accepts `Am`, `8A`, `A minor`, Open Key).
- Each transition shows a BPM difference (with half/double-time detection) and a key-compatibility chip.
- Search covers the whole folder including subfolders, with an "In mesh" filter.
- Tags are cached in the browser so reopening a large folder is quick.
- Shortcuts: `space` play/pause, `/` jump/search, `1`–`9` take that branch, `+` add a transition, `←`/`→` skip 10 s, `Ctrl/⌘+Enter` confirm, `Esc` back.
- Plays whatever Chrome can decode natively: FLAC, MP3, WAV, AAC/M4A.

### Version history
| Version | Date | Changes |
|---|---|---|
| **v1.0** | 31 Oct 2026 | First release. `.mesh` format v1; Open, Home, Add music and DJ screens; FLAC/MP3 tag and artwork reading; Camelot key normalisation; BPM and key compatibility chips; longest-path calculation (exact without loops, bounded search with loops); glass + neumorphic design; phone-width layout. Pre-release fixes: Enter in search no longer picks a stale result; on phones the add screen stacks vertically with the notes below the destination song. Git tag `v1.0`. |
| v2.0 "Second Release" | Planned | Merge Music Manager (Rate mode) and Key Wheel (key guidance in Add and DJ modes) into Mesh. Full spec: [`docs/design-plan-v2.md`](docs/design-plan-v2.md). |

### Known limits in v1.0
- Does not skip the `_Serato_` folder.
- Does not read Music Manager ratings (GROUPING / custom fields) or role/language tokens.
- Key compatibility covers same key, relative, ±1, +2 and +7 only — no diagonal or parallel moves.
- Browser-only: needs a folder permission prompt each session.

---

## 2. Music Manager

File: `music-manager/index.html`

Rates songs directly in the existing FLAC library. Ratings are written into the files themselves, so they show up in Serato.

> This HTML build does not include the free-text comment box or the changed-on-disk check listed below. Both are specified for Mesh v2.

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

---

## How the three fit together

```
Music Manager  ──writes──▶  FLAC tags (ratings, role, language, comment)  ◀──reads──  Mesh
Mesh           ──writes──▶  .mesh file (songs + transitions + notes)
Key Wheel      ──rules──▶   which key moves are safe / energetic / creative  ──▶  Mesh DJ mode (planned)
```

Each fact has exactly one home: **ratings in the files, transitions in the `.mesh` file, key theory in the Key Wheel rules.**

---

## Repo layout

```
music-mesh/
├── index.html                  Mesh
├── keywheel/index.html         Key Wheel (iPhone)
├── music-manager/index.html    Music Manager
├── docs/design-plan-v2.md      Mesh v2 "Second Release" design plan
└── .gitignore                  keeps .mesh, audio and artwork out of the repo
```

## Running

Open `index.html` in Chrome, Edge or Arc and choose your music folder. Nothing is uploaded: the apps read and write files on your computer only.

Older versions are git tags: `git checkout v1.0` restores Mesh v1.0 exactly.
