/**
 * deck.js — a single playback deck.
 *
 * Wraps an HTMLAudioElement with a small controlled API. Kept
 * deliberately simple for v0.1 (no crossfade, no pitch/speed yet —
 * see roadmap.md). Designed so a second instance can be created
 * independently once Deck B is introduced in v0.2.
 */

class Deck {
  /**
   * @param {Object} callbacks
   * @param {(deck: Deck) => void} [callbacks.onEnded]
   * @param {(deck: Deck) => void} [callbacks.onTimeUpdate]
   * @param {(deck: Deck) => void} [callbacks.onLoaded]
   */
  constructor(callbacks = {}) {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.currentTrackId = null;
    this.callbacks = callbacks;

    this.audio.addEventListener('ended', () => {
      if (this.callbacks.onEnded) this.callbacks.onEnded(this);
    });
    this.audio.addEventListener('timeupdate', () => {
      if (this.callbacks.onTimeUpdate) this.callbacks.onTimeUpdate(this);
    });
    this.audio.addEventListener('loadedmetadata', () => {
      if (this.callbacks.onLoaded) this.callbacks.onLoaded(this);
    });
  }

  /**
   * Load a track from a Blob/File. Revokes any previous object URL
   * to avoid leaking memory across track changes.
   */
  load(trackId, blob) {
    if (this._objectUrl) {
      URL.revokeObjectURL(this._objectUrl);
    }
    this._objectUrl = URL.createObjectURL(blob);
    this.currentTrackId = trackId;
    this.audio.src = this._objectUrl;
  }

  play() {
    return this.audio.play();
  }

  pause() {
    this.audio.pause();
  }

  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  seek(seconds) {
    this.audio.currentTime = seconds;
  }

  setVolume(value) {
    this.audio.volume = Math.min(1, Math.max(0, value));
  }

  get isPlaying() {
    return !this.audio.paused && !this.audio.ended;
  }

  get duration() {
    return this.audio.duration || 0;
  }

  get currentTime() {
    return this.audio.currentTime || 0;
  }
}

export { Deck };
