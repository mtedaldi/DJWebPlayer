# DJWebPlayer

[![Deploy to GitHub Pages](https://github.com/mtedaldi/DJWebPlayer/actions/workflows/deploy.yml/badge.svg)](https://github.com/mtedaldi/DJWebPlayer/actions/workflows/deploy.yml)

**Live:** https://mtedaldi.github.io/DJWebPlayer/

A browser-based media player for locally stored music, built for tablets
acting as a portable playback/mixing rig. Runs as an installable, fully
offline-capable Progressive Web App — no native app, no app store, no
server required.

## Status

🚧 Early development — v0.1.3 is the current release (single deck,
playlist with persistence, loop mode, library management). See
[Roadmap](docs/roadmap.md) for what's next.

## Features (planned, see roadmap for version breakdown)

- Local music playback (your own files, nothing leaves the device)
- Playlist mode with automatic crossfade between tracks
- Two independent decks with manual crossfade
- Speed and pitch control — both coupled (vinyl-style) and decoupled
  (independent time-stretch / pitch-shift)
- Configurable soundboard for sound effects (applause, horn, etc.)
- Optional secondary "monitor" audio output (where browser-supported)
- Fully offline after first load, installable as a PWA

## Non-goals

This is not a replacement for full DJ software like
[Mixxx](https://mixxx.org/). No BPM detection/beatmatching, no MIDI
controllers, no microphone/streaming support. The goal is a simple,
tablet-friendly playback tool with just enough mixing features for live
event use.

## Inspiration

This project doesn't aim to replace [Mixxx](https://mixxx.org/) — it's a
significant inspiration and reference point for the feature set (decks,
crossfade, pitch shifting), just reimagined as a lightweight, tablet-first
browser app rather than full native DJ software.

## Documentation

- [Requirements specification (Lastenheft)](docs/requirements.md)
- [Feature planning & roadmap](docs/roadmap.md)
- [Changelog](CHANGELOG.md)

## Browser support

Primary target: Chromium-based browsers (Chrome, Edge) on tablets and
desktop. Some features (e.g. monitor output via `setSinkId()`) depend on
browser API support and degrade gracefully where unavailable. See the
architecture doc (once available) for details.

## Development

No build step required — it's a static PWA. To run locally:

```bash
cd src
python3 -m http.server
```

Then open `http://localhost:8000` in Chrome or Firefox. ES modules and
the Service Worker require `http://`, not `file://`.

Deployments to GitHub Pages happen automatically on every push to `main`
via `.github/workflows/deploy.yml`.

## License

MIT — see [LICENSE](LICENSE).

## AI assistance disclosure

This project is being developed with assistance from Claude (Anthropic).
Architecture decisions, requirements, and review remain with the project
author; AI assistance is used for code generation, drafting documentation,
and technical research.
