/**
 * deck.js — a single playback deck, built on Web Audio API.
 *
 * Each deck has its own GainNode so the crossfader (or any other
 * external volume control) can adjust it independently. The deck
 * connects to a shared AudioContext passed in at construction time.
 *
 * Deck state machine:
 *   idle → loading → ready → playing → ready (pause/stop)
 *                                    → ended (natural end, fires onEnded)
 *
 * The _playing flag is the authoritative source; onended is always
 * cleared before calling source.stop() to prevent spurious callbacks.
 */

/** @enum {string} */
const DeckState = Object.freeze({
  IDLE:    'idle',    // no track loaded
  LOADING: 'loading', // decoding audio
  READY:   'ready',   // loaded, not playing
  PLAYING: 'playing', // playing normally
});

class Deck {
  constructor(audioContext, callbacks = {}) {
    this.ctx       = audioContext;
    this.callbacks = callbacks;
    this.state     = DeckState.IDLE;

    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = 1.0;

    this._source      = null;
    this._buffer      = null;
    this._startTime   = 0;
    this._pauseOffset = 0;
    this._tickInterval = null;

    this.currentTrackId = null;
    this.trackName      = '';
  }

  async load(trackId, blob, name = '') {
    this.stop();
    this.state          = DeckState.LOADING;
    this._buffer        = null;
    this._pauseOffset   = 0;
    this.currentTrackId = trackId;
    this.trackName      = name;

    const arrayBuffer = await blob.arrayBuffer();
    this._buffer = await this.ctx.decodeAudioData(arrayBuffer);
    this.state   = DeckState.READY;

    if (this.callbacks.onLoaded) this.callbacks.onLoaded(this);
  }

  play() {
    if (this.state !== DeckState.READY) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    this._source        = this.ctx.createBufferSource();
    this._source.buffer = this._buffer;
    this._source.connect(this.gainNode);

    this._source.onended = () => {
      // Only treat as natural end; stop() clears onended before firing.
      this.state        = DeckState.READY;
      this._pauseOffset = 0;
      this._stopTick();
      if (this.callbacks.onEnded) this.callbacks.onEnded(this);
    };

    this._source.start(0, this._pauseOffset);
    this._startTime = this.ctx.currentTime - this._pauseOffset;
    this.state      = DeckState.PLAYING;
    this._startTick();
  }

  pause() {
    if (this.state !== DeckState.PLAYING) return;
    this._pauseOffset      = this.currentTime;
    this._source.onended   = null;
    this._source.stop();
    this._source = null;
    this.state   = DeckState.READY;
    this._stopTick();
    if (this.callbacks.onTimeUpdate) this.callbacks.onTimeUpdate(this);
  }

  stop() {
    if (this._source) {
      this._source.onended = null;
      try { this._source.stop(); } catch (_) {}
      this._source = null;
    }
    this._pauseOffset = 0;
    this.state        = this._buffer ? DeckState.READY : DeckState.IDLE;
    this._stopTick();
    if (this.callbacks.onTimeUpdate) this.callbacks.onTimeUpdate(this);
  }

  seek(seconds) {
    const wasPlaying = this.state === DeckState.PLAYING;
    if (wasPlaying) {
      this._source.onended = null;
      this._source.stop();
      this._source = null;
      this.state   = DeckState.READY;
    }
    this._pauseOffset = Math.max(0, Math.min(seconds, this.duration));
    if (wasPlaying) this.play();
    else if (this.callbacks.onTimeUpdate) this.callbacks.onTimeUpdate(this);
  }

  setVolume(value) {
    this.gainNode.gain.value = Math.max(0, Math.min(1, value));
  }

  get isPlaying()   { return this.state === DeckState.PLAYING; }
  get isLoaded()    { return this.state !== DeckState.IDLE && this.state !== DeckState.LOADING; }
  get duration()    { return this._buffer ? this._buffer.duration : 0; }
  get currentTime() {
    if (!this._buffer) return 0;
    if (this.state === DeckState.PLAYING)
      return Math.min(this.ctx.currentTime - this._startTime, this._buffer.duration);
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
