# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
