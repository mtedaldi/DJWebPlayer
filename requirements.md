# DJWebPlayer — Requirements Specification (Lastenheft)

**Version:** 0.1
**Status:** Draft
**Last updated:** 2026-06-20

## 1. Purpose

DJWebPlayer is a browser-based media player for locally stored music, designed
to run on tablets as a portable playback/mixing rig. It is built as a
single-page web application (PWA), installable and usable fully offline,
without requiring a native app store or platform-specific build.

The primary use case is a tablet acting as a self-contained audio source for
events (e.g. parish hall, community events), with simple DJ-style mixing
features — not a full professional DJ tool (see Mixxx for that), but enough
to run a playlist with smooth transitions, manual mixing between two sources,
and a soundboard for sound effects.

## 2. Scope

### 2.1 In scope

- Local audio file playback (user's own files, no streaming/online library)
- Cross-platform via standard web browser (tablet, desktop, phone)
- Fully offline-capable after first load (PWA)
- Two independent playback decks with manual and automatic crossfade
- Playlist mode with automatic deck handoff and crossfade at track boundaries
- Speed and pitch control, both coupled (vinyl-style) and decoupled
  (time-stretch / pitch-shift independent of tempo)
- Soundboard with user-configurable one-shot sound effect buttons
- Optional secondary "monitor" audio output (best-effort, browser-dependent)
- Internationalized UI text architecture from the start (English first,
  German planned)

### 2.2 Out of scope (for now, see roadmap)

- Drag & drop playlist reordering (planned for a later version)
- BPM detection / automatic beatmatching
- MIDI controller support
- Microphone input / live broadcast / streaming
- Multi-device sync (each device runs independently on its own local files)
- Cloud storage integration

## 3. Functional requirements

### 3.1 Music library

- FR-1.1: User can import local audio files via folder selection
  (File System Access API where available, fallback to `<input type="file">`)
- FR-1.2: Imported files are cached locally (IndexedDB) for offline use across
  sessions
- FR-1.3: Supported formats: at minimum MP3, WAV, OGG, FLAC, AAC/M4A
  (subject to browser codec support)
- FR-1.4: Library view lists track title, filename, duration

### 3.2 Playlist

- FR-2.1: User can build a playlist from imported tracks
- FR-2.2: User can reorder playlist items via up/down controls
  (drag & drop is a future enhancement, see roadmap)
- FR-2.3: User can remove tracks from the playlist
- FR-2.4: Playlist playback automatically advances to the next track
- FR-2.5: Transition between playlist tracks uses the configured automatic
  crossfade duration

### 3.3 Decks

- FR-3.1: Two independent decks (Deck A, Deck B), each can load and play any
  track independently
- FR-3.2: Manual crossfade control (slider) between Deck A and Deck B
- FR-3.3: Automatic crossfade: configurable duration, triggered near the end
  of the currently playing track
- FR-3.4: Each deck has independent play/pause/stop/seek controls
- FR-3.5: Each deck has independent gain control
- FR-3.6: User can manually skip to the next playlist track at any time,
  independent of automatic advance-on-end

### 3.4 Speed and pitch

- FR-4.1: Coupled speed/pitch mode (native `playbackRate`): changing speed
  changes pitch proportionally (vinyl/tape-style)
- FR-4.2: Decoupled mode: speed and pitch can be changed independently
  (time-stretching via phase vocoder, e.g. SoundTouchJS)
- FR-4.3: User can switch between coupled and decoupled mode per deck
- FR-4.4: Reasonable adjustment range (e.g. speed: 50–150%, pitch: ±6
  semitones), exact bounds to be refined during implementation

### 3.5 Soundboard

- FR-5.1: User-configurable buttons that trigger one-shot sound playback
  (e.g. applause, horn, cheering)
- FR-5.2: User can upload/assign their own audio files to soundboard buttons
- FR-5.3: User can label/rename buttons
- FR-5.4: Soundboard sounds are stored locally (IndexedDB) for offline reuse
- FR-5.5: Soundboard playback has independent volume control, separate from
  deck output
- FR-5.6: Multiple soundboard sounds can overlap (polyphonic playback)

### 3.6 Audio output

- FR-6.1: Primary output via default system audio device
- FR-6.2: Optional monitor output: route a secondary signal (e.g. pre-fade or
  deck-only) to a second audio device, where the browser supports
  `setSinkId()` (best-effort; not available in all browsers — see
  architecture doc for current support status)
- FR-6.3: Graceful degradation: if monitor output isn't supported, the
  feature is hidden/disabled with an explanatory note, rest of app remains
  fully functional

### 3.7 Offline / PWA

- FR-7.1: App is installable as a PWA (manifest + service worker)
- FR-7.2: After first load, app shell and previously imported
  tracks/soundboard sounds are available fully offline
- FR-7.3: No functionality requires a network connection during normal
  operation

### 3.8 Internationalization

- FR-8.1: All UI strings are sourced from a central lookup structure, not
  hardcoded inline
- FR-8.2: English is the initial and default language
- FR-8.3: Architecture allows adding further languages (e.g. German) without
  structural changes

## 4. Non-functional requirements

- NFR-1: Runs in modern evergreen browsers (Chrome/Edge primary target;
  Firefox/Safari supported with graceful degradation for unsupported APIs)
- NFR-2: Touch-friendly UI suitable for tablet use (adequate target sizes,
  no hover-dependent controls)
- NFR-3: No data leaves the device; no backend/server component required.
  No runtime dependency on external resources (CDN fonts, CDN-hosted
  libraries, etc.) for core functionality — dependencies are vendored
  locally, or degrade gracefully if unavailable offline.
- NFR-4: Source code and documentation in English
- NFR-5: MIT license
- NFR-6: Project hosted at `github.com/mtedaldi/DJWebPlayer`

## 5. Open questions / future considerations

- Exact UX for automatic crossfade trigger point (fixed time before track
  end vs. user-markable cue point)
- Whether visual waveform display is worth the added complexity (not
  currently in scope)
- Long-term: drag & drop playlist reordering
- Long-term: possible BPM-aware crossfade timing

## 6. References

- Mixxx (github.com/mixxxdj/mixxx) — feature inspiration, native desktop DJ
  software; not a dependency or basis for this project
- SoundTouchJS — candidate library for decoupled pitch/speed shifting
