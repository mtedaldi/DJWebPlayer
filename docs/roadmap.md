# DJWebPlayer — Feature Planning & Version Roadmap

**Status:** Draft
**Last updated:** 2026-06-20

This document breaks the requirements (see `requirements.md`) into
incremental, shippable versions. Each version should be fully usable on its
own, even if minimal. Scope per version may shift as implementation reveals
constraints — see "Open questions" in the requirements doc.

Versioning follows [Semantic Versioning](https://semver.org/):
`MAJOR.MINOR.PATCH`. Pre-1.0 releases are considered unstable/evolving.

---

## v0.1 — Single deck playback (MVP)

The smallest usable thing: import music, build a playlist, play it back.

- Project scaffold: PWA shell (manifest, service worker, installable),
  i18n string architecture (English only for now)
- Local file import (folder picker + fallback file input)
- IndexedDB storage for imported tracks (persists offline)
- Library view: list of imported tracks (title, duration)
- Playlist: add tracks, remove tracks, reorder via up/down buttons
- Single deck: play, pause, stop, seek, volume
- Playlist auto-advance to next track on end (hard cut, no crossfade yet)

**Goal:** Marco can load his music, build a playlist, and have it play
through unattended on a tablet, fully offline.

---

## v0.1.1 — Bugfix patch (post-test fixes)

Issues found during first real-world test on Firefox/tablet:

- Fix folder import: don't rely solely on `file.type` (often empty for
  `.m4a`/`.flac` in some browsers) — also accept by file extension, so
  recursive folder imports (e.g. importing a whole artist folder with
  multiple album subfolders) pick up all audio files
- Add explicit "Skip to next" control — there was no way to manually
  advance to the next playlist track; this was the root cause behind
  "playback feels stuck": Play only ever resumed/loaded the *first*
  track, with no path to deliberately move on to another one
- Clarify deck-vs-playlist-selection interaction: selecting/reordering/
  removing playlist entries doesn't yet affect a currently loaded track on
  the deck, by design for v0.1 — make this discoverable via the new Skip
  control rather than leaving the user stuck

**Goal:** Core single-deck flow is reliable and unblocked before moving on
to two-deck mixing.

---

## v0.1.2 — Library management at scale

As the imported library grows, a flat unsorted list stops scaling. This
version is independent of deck/mixing work and can be picked up in any
order relative to v0.2+.

- Sorting (e.g. by name, date added, duration)
- Filtering / search-as-you-type over the library
- Whether a flat list or a hierarchical view (e.g. by folder/artist) works
  better is still open — to be decided based on how Marco's real library
  is structured once tested
- Multi-select removal of tracks from the library (not just one at a
  time)
- Duplicate detection on import: skip files matching an existing library
  entry by filename + file size (fast heuristic, not a content hash);
  skipped duplicates are silently ignored
- "Clear library" action (with confirmation prompt)
- "Clear playlist" action (with confirmation prompt)
- "Reset app" action: wipes all local storage (library, playlist,
  settings) and reinitializes — useful both during development and for
  resetting a tablet between events; confirmation prompt required, kept
  visually separate from regular actions ("danger zone")

**Goal:** A library of real-world size (hundreds of tracks) stays usable.

---

## v0.2 — Second deck and manual crossfade

- Second, fully independent deck (Deck B)
- Manual crossfade slider between Deck A and Deck B
- Independent load/play/pause/stop/seek/volume per deck
- UI: clear two-deck layout suitable for touch use

**Goal:** Two tracks can be manually blended live.

---

## v0.3 — Automatic crossfade for playlist mode ✓

- Auto-crossfade toggle (⇌) with configurable fade duration (0–15s slider,
  default 10s), persisted across reloads
- Equal-power gain ramps via Web Audio API (frame-accurate); UI crossfader
  slider animated in real time via requestAnimationFrame
- Fade triggers on dominant deck (crossfader position) only, at
  (duration − fadeDuration) seconds before track end
- Next track post-loaded silently onto free deck after each fade completes,
  ready for next transition without loading delay
- Visual fade-trigger marker on progress bar (coloured line + triangle)
- Both decks pre-loaded on playlist init/restore
- FadeState machine (idle/fading-out/fading-in/done) ensures playlist
  advance happens exactly once per fade, in onComplete
- Manual crossfade always available; manuelly loaded tracks on free deck
  are respected (not overwritten by auto-fade)

**Known issue (v0.3.1):** If a track is manually loaded onto the free deck
before a fade, the playlist index can drift — the post-fade pre-load may
land on the wrong track. Root cause: manual load doesn't update
`playlist.currentIndex`. Planned fix: deck ownership model (auto vs manual)
in a future version.

**Goal:** Playlist mode runs unattended with smooth transitions. ✓

---

## v0.3.x — Deck ownership model (planned bugfix)

- Introduce `auto` / `manual` ownership per deck
- Manual load sets ownership=manual; auto-fade skips advance for manual decks
- Fixes post-fade pre-load landing on wrong track after manual intervention

---

## v0.4 — Speed and pitch control ✓

### v0.4.0 — Coupled speed/pitch ✓
- Speed slider per deck (±20%, 0.8×–1.2×), always visible
- Native `AudioBufferSourceNode.playbackRate` — changes speed and pitch
  together (vinyl-style)
- Live percentage display in deck accent colour; reset button (↺)
- Rate resets to 1.0× on every track load (no accidental carry-over)

### v0.4.1 — Decoupled pitch/speed ✓
- @soundtouchjs/audio-worklet v2.1.0 vendored locally in `src/vendor/`
  (no CDN, fully offline)
- Per-deck Decouple toggle; pitch slider (±6 semitones) appears only
  when decouple is active
- Speed changes tempo only; pitch slider controls tonality independently
- Pitch can be changed live; speed change restarts source at current
  timecode position (AudioBufferSourceNode constraint)
- Time model: timecode throughout (buffer-seconds); fade trigger and
  progress bar use timecode regardless of playback rate (Option A)

**Note — time model (Option A):** All timing uses buffer-seconds
(timecode). At ±20% rate the fade trigger fires up to ±2 timecode-
seconds off the configured fade duration. A future correction
(`fadeDuration × rate`) is trivial but not yet implemented.

**Goal:** Tempo/pitch adjustable per deck, with a real choice between
"vinyl-style" and independent pitch shifting. ✓

---

## v0.5 — Soundboard

Design decisions:
- 2×3 grid (6 buttons), fixed for now, expandable later
- Collapsible panel (toggle button in header)
- Built-in default sounds + user-uploadable sounds
- Sound-library picker for assignment (similar to music library)
- Optional music ducking (off by default)
- Attribution for CC-BY sounds in About dialog and docs/sound-credits.md

Implementation plan:
- `src/sounds/` — 6 bundled default sounds (see docs/sound-credits.md)
- New `soundboard.js` module: GainNode, one-shot playback, ducking logic
- New IndexedDB store `sounds` for user-uploaded sounds
- UI: collapsible panel below crossfader; sound-library picker modal
- Each button: label (editable), assigned sound, trigger animation

Milestones:
- v0.5.0: Panel, 6 buttons, built-in sounds, volume, polyphonic playback
- v0.5.1: User sound upload + library picker, label editing, ducking

**Goal:** Live sound effects available alongside music playback.

---

## v0.6 — Monitor output (best-effort)

- Feature-detect `setSinkId()` support
- UI to select a secondary output device where supported
- Graceful hide/disable with explanatory note where unsupported
- Decide and implement what signal feeds the monitor output (e.g. master,
  or deck pre-fade — to be defined during implementation)

**Goal:** Optional second audio output for monitoring, on browsers that
support it (primarily Chromium-based).

---

## v0.7 — Polish pass

- Import progress feedback: show a spinner or "Importing… (n/m)" counter
  during folder import, since duration-reading per track takes noticeable
  time on large collections and the UI currently appears frozen
- Service worker update cycle: prompt client reload after `clients.claim()`
  so a normal reload always delivers the latest version without requiring
  Shift+Reload
- Touch UI refinement based on real tablet usage
- Performance check (especially decoupled pitch-shift CPU load on tablets)
- Error handling / edge cases (corrupt files, unsupported formats, storage
  quota limits)
- Accessibility pass (labels, contrast, focus states)

---

## v1.0 — Stable release

- All v0.1–v0.7 features stable and tested in real usage
- Documentation complete (README, architecture doc, changelog up to date)
- Tagged release

---

## Backlog (post-1.0, unscheduled)

- Drag & drop playlist reordering
- German UI translation (i18n structure already supports this)
- BPM detection / beatmatching assistance
- Waveform display
- Cue points / hot cues
- MIDI controller support
- **Themes** — Dark (default) and Light at minimum, switchable in settings;
  CSS Custom Properties are already used throughout so this is mostly
  a second `:root` block + a toggle. Architecture note: no structural
  JS changes needed, only CSS + a persisted setting.
- **Favicon** — inline SVG or base64 in `index.html` (no separate file),
  recognisable in browser tabs; should match the current theme accent
  colour (amber disc motif already exists as icon-192/512).
  The existing PWA icons (icon-192.png, icon-512.png) can serve as
  the basis.

---

## Cross-cutting: offline robustness

Applies to every version, not just one milestone — re-check whenever a
new dependency is introduced (e.g. SoundTouchJS in v0.4):

- No runtime dependency on external sources (CDN fonts, CDN libraries) for
  core functionality — vendor anything required locally into the repo, or
  provide a graceful fallback if an external resource is unavailable
  offline
- Before adding any `<link>`/`<script src="https://...">` to the app
  shell, check it against FR-7.3 (no functionality requires a network
  connection during normal operation)

---

## Notes

- Each version should get a corresponding `CHANGELOG.md` entry on release.
- Internal/development snapshots between versions can use suffixes like
  `0.1.0-dev` as needed; tagged releases use clean version numbers.
