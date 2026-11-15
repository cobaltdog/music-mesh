# Mesh — Second Release (v2.0)
### Design change plan

| | |
|---|---|
| **Status** | Built (branch `v2-second-release`) — see “Decisions at build time” below |
| **Date** | 15 Nov 2026 |
| **Repo** | `cobaltdog/music-mesh` (private) |
| **Builds on** | Mesh v1.0 (git tag `v1.0`) |
| **Absorbs** | Music Manager (`music-manager/`) and Key Wheel (`keywheel/`) |

### Decisions at build time (15 Nov 2026)
These override the sections they mention.
- **Verdict dropped** (§5.1, §7.4, §7.6, §11, §12 Phase 4). Transitions keep notes only; no `verdict` field is written. Unknown fields, including any `verdict` added by hand, are still kept.
- **Visual design** (§10): Apple-style redesign instead of v1's aurora/neumorphic look. System type with size-specific tracking, translucent materials for chrome, artwork-led colour (blurred artwork glow, artwork accent via `Accent`), critically damped spring motion. Monochrome primary buttons replace lime. Tier colours and key hues keep their reserved meanings. Extras (filters, sort, Suggest, tag preview) sit behind one tap to keep screens quiet.
- **Hosting** (§4.2): static config for Cloudflare Pages (`_headers`), Netlify (`netlify.toml`) and Vercel (`vercel.json`), plus a web-app manifest and service worker. Connect the repo to one host to get a live URL and Install.
- **Repo visibility:** the plan says private; GitHub lists `cobaltdog/music-mesh` as public. The repo holds only app code.
- **Song comment read fallback:** if `COMMENT` is empty, the free text of `DESCRIPTION` is shown, since Serato has been seen using either field. Writing is as §6.2.

---

## 1. Summary

Mesh v2 turns three separate tools into one app that covers the whole DJ workflow:

- **Prepare:** rate songs (from Music Manager).
- **Connect:** record transitions (Mesh v1).
- **Perform:** play a set with key guidance (from Key Wheel).

| Area | v1.0 | v2.0 |
|---|---|---|
| Modes | Home, Add music, DJ | Home, **Rate**, Add music, DJ |
| Song info | Title, artist, BPM, key, artwork | + Singalong, Energy, Groove, Iconic, Role, Language, comment |
| Writes to FLAC files | Never | Ratings and comment (Rate mode only) |
| Key guidance | One compatibility chip | Key Wheel's 12 named moves, mixing advice, mini wheel in DJ mode |
| Finding new mixes | Manual search | **Suggest**: unlinked songs that fit the key and BPM |
| Filtering | None | Move type, Role, Energy, Language |
| Transition record | Notes | Notes + **verdict** (Works / Practise / Avoid) |
| Themes | Dark only | Dark and light |
| Runs on | HTML file in Chrome / Edge / Arc | Web app: Chrome / Edge / Arc, installable in its own window |
| `.mesh` format | v1 | v2 (adds optional fields only, auto-migrates with backup) |

---

## 2. Goals and non-goals

**Goals**
1. One app, one folder scan, one player for rating, linking and playing.
2. Every fact has exactly one home (see §4.1).
3. Ratings stay visible in Serato, exactly as Music Manager writes them today.
4. Any v1 `.mesh` file opens in v2 with nothing lost.
5. No regressions in anything v1, Music Manager or Key Wheel already does.

**Not in this release**
- Writing tags to MP3s. MP3s are read-only, as Music Manager is FLAC-only today.
- Beatmatching, automatic mixing or audio analysis. BPM and key still come from Serato's tags.
- Online metadata or streaming services.
- Folder access on iPhone. The Key Wheel stays a separate phone page (§9).

---

## 3. Design principles

1. **One home per fact.** Ratings live in the FLAC tags, transitions in the `.mesh` file, and key rules in one shared code block. Nothing is copied between them, except the small snapshot `.mesh` keeps so songs still display when a file is missing.
2. **Never lose data.** Every file write is verified, the `.mesh` file is backed up before migration, and files changed by another device are detected before saving.
3. **Reuse, don't rewrite.** Music Manager's FLAC writer and rating scheme, and Key Wheel's key rules, are carried over unchanged in behaviour.
4. **Meaning is never colour-only.** Every coloured state also has a word or symbol.

---

## 4. Architecture

### 4.1 Data ownership

| Fact | Stored in | Written by | Read by |
|---|---|---|---|
| Title, artist, album, artwork | FLAC / MP3 tags | Serato, other taggers | Mesh |
| BPM, key | FLAC / MP3 tags (Serato analysis) | Serato | Mesh |
| Singalong, Energy, Groove, Iconic | FLAC tags: `GROUPING` codes + custom fields | Mesh Rate mode | Mesh, Serato |
| Role, Language | FLAC tags: `#`/`@` tokens in `COMMENT`/`DESCRIPTION` + `ROLE`/`LANGUAGE` | Mesh Rate mode | Mesh, Serato |
| Song comment ("skip the long intro") | FLAC `COMMENT` (free-text part) | Mesh Rate mode | Mesh, Serato |
| Songs, ids, transitions, notes, verdicts | `.mesh` file | Mesh Add and DJ modes | Mesh |
| Key-move rules | `KeyRules` code block | — | Mesh, Key Wheel |
| Notation, theme, filters, set path, tag cache, last folder | Browser / app storage on this device | Mesh | Mesh |

**Song comment vs transition notes:** a comment is about one song and shows in Serato. A note is about one pair of songs and lives only in Mesh.

### 4.2 Delivery

**Decision: a web app, no Windows desktop app.**

- **Code** lives in the private repo `cobaltdog/music-mesh`. Each release is a git tag (`v1.0`, `v2.0`).
- **Runs in** Chrome, Edge or Arc on a computer. It reads and writes the local music folder directly, as v1 does. Music, `.mesh` files and ratings never leave the computer and never go in the repo.
- **Two ways to open it:**
  - **Local:** open `index.html` from a clone of the repo. Works today with no setup.
  - **Hosted (optional):** connect the repo to a free host that deploys from private repos (Cloudflare Pages, Netlify or Vercel). Every push then updates the live site. The site address is public, but it only contains the app code, never your data.
- **Install as an app (hosted only):** add a web-app manifest so Chrome and Edge can install Mesh in its own window with a taskbar icon. This replaces what the desktop app was for:
  - **Safe saves:** Chrome and Edge already write to a temporary file and swap it in when the save finishes.
  - **No prompt every session:** recent versions can remember folder access ("Allow on every visit").
  - **Reopening the last folder:** v1 already does this.
- **Read-only mode** (inherited from Music Manager) when the browser blocks file writing:
  - Ratings are kept in the browser and can be copied out as JSON.
  - Transition edits are held in memory, with a "Download .mesh" button.

### 4.3 Code modules

| Module | Source | Change in v2 |
|---|---|---|
| `FlacTags`: FLAC read, re-tag and verify | Music Manager | None. It already rewrites only the Vorbis comment block and verifies the result before writing. |
| `Id3Read`: MP3 tag and artwork reading | Mesh v1 | None |
| `Scheme`: rating read and apply | Music Manager | + free-text comment read/write (§6.2) |
| `KeyRules`: 24 keys, names, colours, the 12 moves | Key Wheel's `transitions()` + Mesh v1's key parser | + `classify(from, to)` (§8.2) |
| `MeshStore`: load, migrate, save, backup | Mesh v1 | + v2 migration, backup, on-disk change check |
| `Library`: one folder walk, tag cache, unreadable-file report | Mesh v1 + Music Manager | Merged. Skips `.` files and `_Serato_`; caches ratings too. |
| `Player`: one shared `<audio>` across modes | Both | The current track stays loaded when switching modes |
| `Accent`: artwork-derived accent colour | Music Manager | Used for the deck glow in Rate and DJ modes |
| `Suggest`: candidate next songs | New | §7.5 |
| Views: Open, Home, Rate, Add, DJ, Search, Settings | Mesh v1 + Music Manager | §7 |

---

## 5. The `.mesh` file, v2

### 5.1 What changes
Only optional fields are added. Nothing is renamed or removed.

```json
{
  "format": "mesh",
  "version": 2,
  "writtenBy": "Mesh 2.0.0",
  "name": "My Sets", "created": "…", "modified": "…",
  "songCount": 8,
  "songs": [
    { "id": 1, "path": "House/Kairo - Glass Hours.flac",
      "title": "Glass Hours", "artist": "Kairo", "bpm": 125, "key": "9A", "added": "…",
      "transitions": [
        { "to": 2, "notes": "bass swap on the 2nd drop",
          "verdict": "works",
          "created": "…", "modified": "…" }
      ] }
  ]
}
```

| Field | Where | Values | Notes |
|---|---|---|---|
| `version` | top | `2` | Was `1` |
| `writtenBy` | top | `"Mesh 2.0.0"` | Records which app version last saved the file |
| `verdict` | transition | `"works"`, `"practise"`, `"avoid"`, or absent | Absent = not judged yet |

The key-move type (e.g. "Energy Up") is **not stored**. It is worked out from the two keys every time, so it stays correct if Serato re-analyses a track.

### 5.2 Opening files
| File version | What v2 does |
|---|---|
| 1 | Opens normally and upgrades in memory. On the first save, copies the original to `<name>.v1-backup.mesh` (never overwriting an existing backup), then saves as version 2. Shows a one-time notice. |
| 2 | Opens normally. |
| 3 or higher | Opens **read-only** with a banner: "Made by a newer Mesh — update to edit." |
| Not valid JSON or not a mesh | Refuses to open; the file is untouched. |

Unknown fields at any level are kept and written back unchanged.

### 5.3 Safer saving (new)
If the music folder syncs through OneDrive or similar, the same `.mesh` can be changed from another device. v1 doesn't check for this.

- Before each save, v2 compares the file's last-modified time with the one it loaded.
- **If only the other device changed it:** reload silently.
- **If both changed it:** merge automatically when the edits don't overlap. New songs get new ids from the higher `songCount`. Transitions are combined, and for the same pair the newer `modified` wins.
- **If the merge isn't clean:** stop and ask before overwriting.

---

## 6. FLAC tags

### 6.1 Unchanged from Music Manager
- `GROUPING` = `SNG4 NRG3 GRV4 ICN5`. Other text in Grouping is kept.
- `COMMENT` and `DESCRIPTION` carry the `#chill #peak` and `@en @hi …` tokens. Other text in these fields is kept.
- Custom fields: `SINGALONG`, `ENERGY`, `GROOVE`, `ICONIC`, `ROLE` (`;`-separated), `LANGUAGE` (`;`-separated).
- Every other tag, picture block, Serato block and the audio is copied byte-for-byte. The new header is parsed back and checked before anything is written.
- Reading falls back to hand-typed codes in Serato's Grouping and Comment columns.

### 6.2 New: song comment
Music Manager has no comment box yet (confirmed), even though its feature list includes one. v2 builds it:

- `COMMENT` = `<free text> <tokens>`, e.g. `skip the long intro #peak @en`.
- The comment box edits only the free text. The tokens are always kept and written at the end.
- `DESCRIPTION` keeps only its tokens, as Music Manager does today.
- Search matches comment text.

### 6.3 New safety checks
- **Changed-on-disk check:** store each file's size and last-modified time at load. If either differs at save, stop with "Changed since loaded — reload?". The current HTML re-reads the file but doesn't stop.
- **Locked files:** keep Music Manager's message ("Close it in Serato and try again").
- **MP3s:** the rating board is shown greyed out, with "Ratings can be saved to FLAC only."

---

## 7. Screens

### 7.1 Open
- Unchanged from v1: pick folder, then pick, create or open the `.mesh`.
- New: the migration notice (v1 → v2), the read-only banner for newer files, and the read-only mode banner when writing is blocked.

### 7.2 Home
Layout stays as you specified: library on the left, actions on the right.

**Left panel**
- Mesh name and folder.
- Stats: **Songs · Transitions · Longest path** (as v1), plus a second row: **Rated · To rate · Unreadable files** (from Music Manager's progress).
- The longest chain, as v1.
- Search: now matches comments, with filter chips (§7.7).
- **Start DJ mode.**
- Folder scan progress.

**Right panel**
- **Add music** tile (as v1).
- **Rate songs** tile (new), showing "142 to rate".
- Latest transitions (as v1), now showing verdict badges.

### 7.3 Rate mode (new — Music Manager inside Mesh)
- **Left rail:**
  - Track list with To rate / Rated / All filters and search (title, artist, filename, comment).
  - Six-dot completeness pips per track, and a dot on tracks with unsaved changes.
- **Deck:** artwork, title, artist, BPM and key readouts (with "not analysed" when missing), the shared player (play/pause, seek, ±10 s, previous/next, elapsed/total time).
- **Rating board:**
  - Four 1–5 star rows (Singalong, Energy, Groove, Iconic). Clicking the selected star again clears it.
  - Role multi-select (Chill, Peak) and Language multi-select (11 options).
  - **Comment** box (new).
  - Preview of the exact tags to be written.
  - **Save** and **Save & next**.
- **Mesh link (new):** a line under the deck, e.g. "In mesh · id 4 · 3 transitions out", or "Not in mesh". A button starts a transition from this song in Add mode.
- **Leaving with unsaved ratings:** "Save / Discard / Stay". The same prompt appears when closing the app.

### 7.4 Add music mode
Everything from v1 stays, including the slot order, arrow fill, notes appearing only after both songs, the existing-transitions list with Edit and Delete, staged deletes, the tick and Back. Changes:

- **Song slots** also show Energy as a number, rating pips, and Role/Language chips.
- **Under the arrow,** the v1 key chip is replaced by the Key Wheel move:
  - Keyword and symbol, coloured by tier, e.g. `Energy Up ↑  9A → 10A`.
  - The mixing advice line, e.g. "+1 on the wheel. Gentle, natural lift."
  - The BPM chip as in v1.
  - Off-wheel pairs show grey: "No harmonic link — mix on a cut or echo-out."
- **Verdict selector (new):** Works / Practise / Avoid, as three segmented buttons beside the notes box. It can be left unset.
- **Suggest panel (new):** appears once only the starting song is chosen, under the empty destination slot. It lists folder songs that fit (§7.5), grouped Harmonic → Energy → Creative. Clicking one fills the destination slot.
- **Existing-transitions rows** gain the move keyword and verdict badge.

### 7.5 Suggest (new, used in Add and DJ modes)
**A song qualifies when all of these hold:**
- Its key is one of the current song's Key Wheel moves, and that move's tier is switched on.
- Its BPM is within the tolerance (default **±6%**, confirmed; half/double-time allowed; adjustable in Settings).
- It is not already a destination of the current song.
- It passes the active filters (Role, Energy, Language).

**Ranking:**
1. Tier: Harmonic, then Energy, then Creative.
2. Closest BPM.
3. Highest Energy rating, then Iconic.

Songs with no key or BPM never qualify. At most 12 are shown, with "Show more".

### 7.6 DJ mode
**Deck (left)**, as v1, plus:
- Rating pips and the comment under the title.
- **Mini Key Wheel** under the transport controls:
  - The current key is in the centre, with Key Wheel colours, ring layout and tier outlines on target keys.
  - A dot marks each key you already have a mesh transition into.
  - Tapping a segment filters Suggest to that key.
- **Set path:** the v1 trail now shows each song's key, e.g. `Glass Hours 9A → Midnight Circuit 8A → …`, with **Undo** (go back one) and **Clear**. The last 40 songs are kept on this device.

**Branches (right)**, as v1 (arrow, editable notes, destination card, `1`–`9`), plus:
- A tier-coloured left edge and the move keyword with its symbol on each arrow.
- A one-line mixing advice tip.
- Verdict badge. "Avoid" branches sink to the bottom and are dimmed.
- Energy, Role and Language chips on each destination card.
- **Sort:** Move type (default) / Energy / Closest BPM.

**Below the branches:**
- **"Fits, not yet tried":** the Suggest list for the current song. A **+** on each opens Add mode prefilled with both songs.
- **Add a transition from this song** (as v1).

**Filter bar** at the top of the right column: Harmonic / Energy / Creative toggles, Role (Chill / Peak), minimum Energy (1–5), Language. With everything filtered out, it says "All branches are filtered out" and offers to reset.

### 7.7 Search panel
- Scope: **Whole folder / In mesh / To rate** (new).
- Filter chips: Role, minimum Energy, Language.
- Each result shows artwork, title, artist, BPM, key, Energy and the mesh badge.
- In Add and DJ modes, results also show the Key Wheel move relative to the current song.

### 7.8 Settings (new, small panel from the top bar)
- Key notation: **Camelot (8A) / Key names (Am)**. Applies everywhere, and the other notation is always shown alongside, as in Key Wheel.
- Theme: Dark / Light / Match system.
- BPM tolerance for Suggest: ±3 / ±6 / ±8%.
- Reset this device's stored settings.

---

## 8. Key logic (shared `KeyRules` block)

### 8.1 Keys
- 24 keys: 1A–12A minor, 1B–12B major. Numbers wrap 12 ↔ 1.
- **Names follow Key Wheel:** `G♯m, E♭m, B♭m, Fm, Cm, Gm, Dm, Am, Em, Bm, F♯m, C♯m` and `B, F♯, D♭, A♭, E♭, B♭, F, C, G, D, A, E`. This replaces v1's `Abm/Ebm/Dbm` spelling.
- **Key colours follow Key Wheel:** hue = `((n−1)·30 + 340) mod 360`, and major keys are lighter. This replaces v1's key-chip colours.
- **Accepted tag formats** (v1 parser, unchanged): `8A`, `08A`, `Am`, `A minor`, `A#m`, `B♭`, Open Key `1m/1d`.

### 8.2 The 12 moves
| Tier | Keyword | Symbol | From minor (e.g. 8A) | From major (e.g. 8B) | Advice |
|---|---|---|---|---|---|
| Harmonic | Perfect Match | = | 8A | 8B | Same key. Blend as long as you like. |
| Harmonic | Energy Up | ↑ | 9A | 9B | +1 (up a fifth). Gentle, natural lift. |
| Harmonic | Energy Down | ↓ | 7A | 7B | −1 (down a fifth). Eases the room down. |
| Harmonic | Brighten | ☀ | 8B | — | Relative major. Same notes, happier feel. |
| Harmonic | Darken | ☾ | — | 8A | Relative minor. Same notes, moodier feel. |
| Energy | Power Boost | ⇈ | 10A | 10B | +2 (up a whole tone). Keep the blend short. |
| Energy | Semitone Lift | ⇈ | 3A | 3B | +7 (up a half-step). Mix on a cut or drop. |
| Energy | Cool Down | ⇊ | 6A | 6B | −2 (down a whole tone). Cut, don't blend. |
| Creative | Diagonal Lift | ↗ | 9B | — | Up one and over to major. |
| Creative | Diagonal Drop | ↙ | — | 7A | Down one and over to minor. |
| Creative | Parallel Major | ⇄ | 11B | — | Same root, flips to major. Use a drop or breakdown. |
| Creative | Parallel Minor | ⇄ | — | 5A | Same root, flips to minor. Use a drop or breakdown. |

Each key has 9 targets, and they never overlap, so `classify(from, to)` always returns exactly one move. Two extra results:
- **Off-wheel** (grey): any other pair.
- **Key unknown** (grey): either song has no key.

### 8.3 BPM rule (unchanged from v1)
- Within ±3% → green; within ±6% → amber; beyond → red.
- A ratio above 1.75 or below 0.57 is treated as half- or double-time.

### 8.4 Tier colours
These are reserved for key-move meaning only: Harmonic `#3ddc97`, Energy `#ffb547`, Creative `#b48cff` (from Key Wheel).

---

## 9. The other two apps after v2

| App | Plan |
|---|---|
| **Music Manager** | Kept and usable until Rate mode passes every check in §12, Phase 2. Then retired; it stays in `music-manager/` for reference. |
| **Key Wheel** | Stays as the standalone iPhone page, because an iPhone browser can't open your music folder. Its `transitions()` code is replaced by the same `KeyRules` block as Mesh v2. Both files carry a `KeyRules v1` comment so any drift is easy to spot. No other changes. |

---

## 10. Visual design

- **Base:** keep Mesh v1's look in dark mode. That means frosted glass panels over the aurora and drifting mesh background, neumorphic controls, Clash Display, Satoshi and JetBrains Mono fonts, a violet base and the lime accent for primary actions.
- **Light theme (new):** use Music Manager's cool-grey neumorphic base (`#e2e5ed`) with the same glass panels and type.
- **Artwork accent:** in Rate and DJ modes the deck glow takes its colour from the artwork, using Music Manager's `Accent` module, which keeps the contrast readable.
- **Colour roles:**

| Colour | Means |
|---|---|
| Lime | Primary actions |
| Green / amber / violet | Key-move tiers only |
| Key hue | Key chips and wheel segments only |
| Red | Errors, key clashes and the "Avoid" verdict |

- Every tier, verdict and clash also has a word or symbol, so meaning never depends on colour alone.
- **Layout and accessibility:** phone widths stack vertically as in v1 (verified at 390 px). Reduced-motion is respected, focus is visible, and contrast meets WCAG AA in both themes.

---

## 11. Keyboard shortcuts

| Key | Where | Action |
|---|---|---|
| `/` | Home, DJ, Rate | Search / Jump to |
| `Space` | Rate, DJ | Play / pause |
| `←` `→` | Rate, DJ | Back / forward 10 s |
| `Esc` | Everywhere | Close panel, or go back |
| `[` `]` | Rate | Previous / next track |
| `C` `P` | Rate | Toggle Chill / Peak |
| `Enter`, `Ctrl+Enter` | Rate | Save & next |
| `1`–`9` | DJ | Take that branch |
| `+` | DJ, Rate | Add a transition from this song |
| `Backspace` | DJ | Undo: back one song in the set path |
| `Ctrl+Enter` | Add | Confirm (tick) |
| `Alt+1` `Alt+2` `Alt+3` | Add, after both songs are picked | Verdict: Works / Practise / Avoid (works while typing notes) |

---

## 12. Build phases and checks

All testing uses a generated test library plus **copies** of a few Serato-analysed FLACs. Original files are never used for testing.

**Phase 1 — Shared core**
- Build: merged folder scan, `FlacTags` and `Scheme` reading, `KeyRules`, `.mesh` v2 migration and backup, the on-disk change check.
- Checks:
  - A v1 mesh opens with every id, transition and note intact.
  - The backup file is created once.
  - Ratings written by Music Manager show on Home and in search.
  - `_Serato_` is skipped and unreadable files are counted.

**Phase 2 — Rate mode**
- Build: everything in §7.3, including comments.
- Checks:
  - Ratings saved in Mesh read back identically in Music Manager.
  - Every non-comment block and the audio bytes are unchanged.
  - Serato shows Grouping and Comment after **Rescan ID3 Tags**.
  - A file locked by Serato gives the right message.
  - A file changed after loading is refused.

**Phase 3 — Key Wheel integration**
- Build: move labels and advice in Add and DJ, the mini wheel, the notation setting, Key Wheel names and colours.
- Checks: `classify` returns the right move for all 24 × 24 key pairs, compared against Key Wheel's own lists.

**Phase 4 — Suggest, filters, verdicts**
- Build: §7.4–§7.7.
- Checks:
  - Suggest never lists a song already linked.
  - Filters hide branches and suggestions consistently.
  - Verdicts save to `.mesh` and survive a reopen.

**Phase 5 — Finish**
- Build: light theme, artwork accent, Settings, web-app manifest and icon, README and version history update, Key Wheel `KeyRules` swap.
- Checks: screenshot review of every screen in both themes at desktop and phone widths, and a full keyboard-only pass.

**Workflow:** each phase is built on its own branch and merged through a pull request, so every change can be reviewed before it lands.

**Release:** merge to `main`, tag `v2.0`, and update the README version table.

---

## 13. Open questions

**Resolved (15 Nov 2026)**
- **Verdict:** dropped; notes only.
- **Hosting:** config for Cloudflare Pages, Netlify and Vercel is in the repo; connect one to deploy.
- **Delivery:** web app in a private GitHub repo. No Windows desktop app (§4.2).
- **Song comments:** Music Manager has none; v2 builds the comment box (§6.2).
- **Suggest tolerance:** ±6% BPM is the default (§7.5).

---

## Appendix — repo layout

```
music-mesh/
├── index.html                  Mesh (v1.0 now; v2 is built here)
├── keywheel/index.html         Key Wheel (iPhone)
├── music-manager/index.html    Music Manager (retired after v2 Phase 2)
├── docs/design-plan-v2.md      this document
├── README.md                   overview of all three apps + version history
└── .gitignore                  keeps .mesh, audio and artwork out of the repo
```

Older versions are git tags, not copied files: `git checkout v1.0` restores Mesh v1.0 exactly.
