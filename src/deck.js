/**
 * deck.js — a single playback deck, built on Web Audio API.
 *
 * Modes:
 *   coupled   (default): native AudioBufferSourceNode.playbackRate
 *             changes speed and pitch together (vinyl-style)
 *   decoupled: SoundTouchNode inserted between source and gainNode;
 *             speed and pitch are controlled independently
 *
 * Time model: all positions and durations are in buffer-seconds
 * (= timecode at rate 1.0). The display shows timecode so DJs can
 * navigate by track position regardless of playback rate.
 *
 * Deck state machine:
 *   IDLE → LOADING → READY → PLAYING → READY (pause/stop)
 *                                     → READY (natural end, fires onEnded)
 */

/** @enum {string} */
const DeckState = Object.freeze({
  IDLE:    'idle',
  LOADING: 'loading',
  READY:   'ready',
  PLAYING: 'playing',
});

// SoundTouchNode is imported lazily when decouple mode is first enabled,
// so it doesn't block startup if the vendor file has any issue.
// The processor is registered on the AudioContext object itself
// (ctx.__stRegistered) so it's scoped to the context, not globally.
let _SoundTouchNode = null;

async function ensureSoundTouch(audioCtx) {
  if (_SoundTouchNode) return _SoundTouchNode;
  const mod = await import('./vendor/SoundTouchNode.js');
  _SoundTouchNode = mod.SoundTouchNode;
  if (!audioCtx.__stRegistered) {
    await _SoundTouchNode.register(audioCtx, './vendor/soundtouch-processor.js');
    audioCtx.__stRegistered = true;
  }
  return _SoundTouchNode;
}

class Deck {
  constructor(audioContext, callbacks = {}) {
    this.ctx       = audioContext;
    this.callbacks = callbacks;
    this.state     = DeckState.IDLE;

    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = 1.0;

    this._source      = null;
    this._stNode      = null;   // SoundTouchNode (decoupled mode only)
    this._buffer      = null;
    this._startTime   = 0;
    this._pauseOffset = 0;
    this._rate        = 1.0;
    this._pitch       = 0;     // semitones (decoupled mode only)
    this._decoupled   = false;
    this._tickInterval = null;

    this.currentTrackId = null;
    this.trackName      = '';
  }

  async load(trackId, blob, name = '') {
    this.stop();
    this.state          = DeckState.LOADING;
    this._buffer        = null;
    this._pauseOffset   = 0;
    this._rate          = 1.0;   // reset rate on every new track load
    this._pitch         = 0;
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
    this._startSource(this._pauseOffset);
  }

  _startSource(offset) {
    // Disconnect any previous stNode
    if (this._stNode) {
      try { this._stNode.disconnect(); } catch (_) {}
      this._stNode = null;
    }

    this._source        = this.ctx.createBufferSource();
    this._source.buffer = this._buffer;
    this._source.playbackRate.value = this._rate;

    if (this._decoupled && _SoundTouchNode) {
      this._stNode = new _SoundTouchNode({ context: this.ctx });
      this._stNode.playbackRate.value  = this._rate;
      this._stNode.pitchSemitones.value = this._pitch;
      this._source.connect(this._stNode);
      this._stNode.connect(this.gainNode);
    } else {
      this._source.connect(this.gainNode);
    }

    this._source.onended = () => {
      this.state        = DeckState.READY;
      this._pauseOffset = 0;
      this._stopTick();
      if (this._stNode) {
        try { this._stNode.disconnect(); } catch (_) {}
        this._stNode = null;
      }
      if (this.callbacks.onEnded) this.callbacks.onEnded(this);
    };

    this._source.start(0, offset);
    this._startTime = this.ctx.currentTime - offset;
    this.state      = DeckState.PLAYING;
    this._startTick();
  }

  pause() {
    if (this.state !== DeckState.PLAYING) return;
    this._pauseOffset    = this.currentTime;
    this._source.onended = null;
    this._source.stop();
    this._source = null;
    if (this._stNode) {
      try { this._stNode.disconnect(); } catch (_) {}
      this._stNode = null;
    }
    this.state = DeckState.READY;
    this._stopTick();
    if (this.callbacks.onTimeUpdate) this.callbacks.onTimeUpdate(this);
  }

  stop() {
    if (this._source) {
      this._source.onended = null;
      try { this._source.stop(); } catch (_) {}
      this._source = null;
    }
    if (this._stNode) {
      try { this._stNode.disconnect(); } catch (_) {}
      this._stNode = null;
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
    if (wasPlaying) this._startSource(this._pauseOffset);
    else if (this.callbacks.onTimeUpdate) this.callbacks.onTimeUpdate(this);
  }

  setVolume(value) {
    this.gainNode.gain.value = Math.max(0, Math.min(1, value));
  }

  /** Set playback rate (coupled: speed+pitch together; decoupled: speed only). */
  setRate(value) {
    this._rate = Math.max(0.5, Math.min(2.0, value));
    if (this.state === DeckState.PLAYING) {
      // AudioBufferSourceNode can't change rate cleanly while playing —
      // restart from current position with new rate.
      const pos = this.currentTime;
      this._source.onended = null;
      this._source.stop();
      this._source = null;
      this.state   = DeckState.READY;
      this._pauseOffset = pos;
      this._startSource(pos);
    }
  }

  /** Set pitch in semitones (decoupled mode only). Can be changed live. */
  setPitch(semitones) {
    this._pitch = Math.max(-12, Math.min(12, semitones));
    if (this._stNode) {
      this._stNode.pitchSemitones.value = this._pitch;
    }
  }

  /**
   * Enable or disable decoupled pitch/speed mode.
   * Switching restarts playback if currently playing.
   */
  async setDecoupled(enabled) {
    if (enabled === this._decoupled) return;
    if (enabled) {
      await ensureSoundTouch(this.ctx);
    }
    this._decoupled = enabled;
    this._pitch     = 0;  // reset pitch when toggling

    if (this.state === DeckState.PLAYING) {
      const pos = this.currentTime;
      this._source.onended = null;
      this._source.stop();
      this._source = null;
      this.state   = DeckState.READY;
      this._pauseOffset = pos;
      this._startSource(pos);
    }
  }

  get isPlaying()    { return this.state === DeckState.PLAYING; }
  get isLoaded()     { return this.state !== DeckState.IDLE && this.state !== DeckState.LOADING; }
  get isDecoupled()  { return this._decoupled; }
  get rate()         { return this._rate; }
  get pitch()        { return this._pitch; }
  get duration()     { return this._buffer ? this._buffer.duration : 0; }
  get currentTime()  {
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
