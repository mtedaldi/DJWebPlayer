# DJWebPlayer

A browser-based media player for locally stored music, built for tablets
acting as a portable playback/mixing rig. Runs as an installable, fully
offline-capable Progressive Web App — no native app, no app store, no
server required.

## Status

🚧 Early development. See [Roadmap](docs/roadmap.md) for current and
planned features. Not yet usable — v0.1 (single deck playback) is the
first milestone in progress.

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

No build step required for the core app — it's a static PWA. Details on
running locally will be added once the initial scaffold exists.

## License

MIT — see [LICENSE](LICENSE).

## AI assistance disclosure

This project is being developed with assistance from Claude (Anthropic).
Architecture decisions, requirements, and review remain with the project
author; AI assistance is used for code generation, drafting documentation,
and technical research.
