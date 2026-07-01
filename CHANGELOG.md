# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- v0.1.2: Library management at scale —
  - Search/filter library by name (live, case-insensitive)
  - Sort library by date added, name, or duration
  - Track duration is now read and stored on import, shown in the
    library list
  - Multi-select removal of tracks from the library (checkboxes,
    select-all/deselect-all)
  - "Clear library" and "Clear playlist" actions, both with a themed
    confirmation dialog
  - "Reset app" (danger zone): wipes the entire local database and
    reloads, for development and for resetting a tablet between events
  - Duplicate detection on import (filename + size heuristic): matching
    files are silently skipped, logged with a count
  - Removing/clearing library tracks now also cleans up any dangling
    references in the playlist
- Service worker cache bumped to v3.

### Fixed
- Folder/file import no longer relies solely on `file.type` (often empty
  for `.m4a`/`.flac` in Firefox), so recursive folder imports (e.g. a
  whole artist folder with album subfolders) now correctly pick up all
  audio files. Also widened the file picker's `accept` attribute.
- Playback could appear "stuck" after the first track: Play only ever
  resumed/reloaded the very first loaded track, with no way to move on to
  another one. Added a "Skip to next" control, and Play now reloads the
  deck if the playlist selection has moved past what's currently loaded.
- Service worker cache bumped to v2 so the fixes above reach
  already-installed PWA instances.

### Added
- v0.1: Single-deck playback MVP — local file import (folder/file picker),
  IndexedDB-backed library, playlist with add/remove/reorder, single deck
  with play/pause/stop/seek/volume, auto-advance on track end (hard cut,
  no crossfade yet).
- PWA shell: manifest, service worker for offline app-shell caching,
  installable icons.
- i18n string lookup module (English only for now, structured for future
  languages).

[Unreleased]: https://github.com/mtedaldi/DJWebPlayer/compare/main...HEAD
