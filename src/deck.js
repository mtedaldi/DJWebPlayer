/**
 * deck.js — a single playback deck, built on Web Audio API.
 *
 * Each deck has its own GainNode so the crossfader (or any other
 * external volume control) can adjust it independently. The deck
 * connects to a shared AudioContext passed in at construction time.
 *
 * v0.2: replaces the HTMLAudioElement approach from v0.1. Using
 * AudioContext allows precise gain control for crossfading.
 */

class Deck {
  constructor(audioContext, callbacks = {}) {
    this.ctx = audioContext;
    this.callbacks = callbacks;

    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = 1.0;

    this._source       = null;
    this._buffer       = null;
    this._startTime    = 0;
    this._pauseOffset  = 0;
    this._playing      = false;
    this._tickInterval = null;

    this.currentTrackId = null;
    this.trackName      = '';
  }

  async load(trackId, blob, name = '') {
    this.stop();
    this._buffer       = null;
    this._pauseOffset  = 0;
    this.currentTrackId = trackId;
    this.trackName      = name;

    const arrayBuffer = await blob.arrayBuffer();
    this._buffer = await this.ctx.decodeAudioData(arrayBuffer);

    if (this.callbacks.onLoaded) this.callbacks.onLoaded(this);
  }

  play() {
    if (!this._buffer || this._playing) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    this._source = this.ctx.createBufferSource();
    this._source.buffer = this._buffer;
    this._source.connect(this.gainNode);

    this._source.onended = () => {
      if (this._playing) {
        this._playing = false;
        this._pauseOffset = 0;
        this._stopTick();
        if (this.callbacks.onEnded) this.callbacks.onEnded(this);
      }
    };

    this._source.start(0, this._pauseOffset);
    this._startTime = this.ctx.currentTime - this._pauseOffset;
    this._playing = true;
    this._startTick();
  }

  pause() {
    if (!this._playing) return;
    this._pauseOffset = this.currentTime;
    this._playing = false;
    this._source.onended = null;
    this._source.stop();
    this._source = null;
    this._stopTick();
    if (this.callbacks.onTimeUpdate) this.callbacks.onTimeUpdate(this);
  }

  stop() {
    if (this._source) {
      this._source.onended = null;
      try { this._source.stop(); } catch (_) {}
      this._source = null;
    }
    this._playing = false;
    this._pauseOffset = 0;
    this._stopTick();
    if (this.callbacks.onTimeUpdate) this.callbacks.onTimeUpdate(this);
  }

  seek(seconds) {
    const wasPlaying = this._playing;
    if (wasPlaying) {
      this._source.onended = null;
      this._source.stop();
      this._source = null;
      this._playing = false;
    }
    this._pauseOffset = Math.max(0, Math.min(seconds, this.duration));
    if (wasPlaying) this.play();
    else if (this.callbacks.onTimeUpdate) this.callbacks.onTimeUpdate(this);
  }

  setVolume(value) {
    this.gainNode.gain.value = Math.max(0, Math.min(1, value));
  }

  get isPlaying()   { return this._playing; }
  get duration()    { return this._buffer ? this._buffer.duration : 0; }
  get currentTime() {
    if (!this._buffer) return 0;
    if (this._playing) return Math.min(this.ctx.currentTime - this._startTime, this._buffer.duration);
    return this._pauseOffset;
  }

  _startTick() {
    this._stopTick();
    this._tickInterval = setInterval(() => {
      if (this.callbacks.onTimeUpdate) this.callbacks.onTimeUpdate(this);
    }, 250);
  }

  _stopTick() {
    if (this._tickInterval) { clearInterval(this._tickInterval); this._tickInterval = null; }
  }
}

export { Deck };
