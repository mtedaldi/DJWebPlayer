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

## v0.2 — Second deck and manual crossfade

- Second, fully independent deck (Deck B)
- Manual crossfade slider between Deck A and Deck B
- Independent load/play/pause/stop/seek/volume per deck
- UI: clear two-deck layout suitable for touch use

**Goal:** Two tracks can be manually blended live.

---

## v0.3 — Automatic crossfade for playlist mode

- Configurable automatic crossfade duration
- Playlist mode now alternates the *next* track into the free deck and
  crossfades automatically near the end of the current track, instead of a
  hard cut
- Manual crossfade override remains available at any time

**Goal:** Playlist mode runs unattended with smooth transitions.

---

## v0.4 — Speed and pitch control

- Coupled speed/pitch (native `playbackRate`) per deck
- Decoupled speed/pitch (time-stretch via SoundTouchJS or equivalent) per
  deck, toggle between modes
- Sensible default ranges, exposed as sliders

**Goal:** Tempo/pitch adjustable per deck, with a real choice between
"vinyl-style" and independent pitch shifting.

---

## v0.5 — Soundboard

- Configurable sound effect buttons (applause, horn, cheering, etc.)
- User can upload/assign/rename/delete custom sounds
- Independent volume control for soundboard output
- Polyphonic playback (multiple effects can overlap)
- Sounds persisted in IndexedDB for offline use

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
- Generate a favicon and embed it directly in `index.html` (e.g. inline
  base64/SVG) rather than as a separate file

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
