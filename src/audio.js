/**
 * audio.js — AudioContext, deck management, crossfader, auto-fade engine.
 *
 * Fade logic overview:
 *
 *   FadeState per deck:
 *     IDLE        — no fade activity, deck available
 *     FADING_OUT  — this deck is the outgoing deck in an active fade
 *     FADING_IN   — this deck is the incoming deck in an active fade
 *     DONE        — fade finished; handleTrackEnded must skip advance
 *
 *   Responsibilities:
 *     checkAutoFadeTrigger  — detect trigger point, start fade
 *     performCrossfade      — animate gains + slider; onComplete:
 *                               1. advance playlist (once, here only)
 *                               2. stop outgoing deck
 *                               3. post-load next track onto outgoing deck
 *     handleTrackEnded      — only acts when FadeState is IDLE
 */

import { Deck } from './deck.js';

// ---- Fade state ----

/** @enum {string} */
export const FadeState = Object.freeze({
  IDLE:       'idle',
  FADING_OUT: 'fading-out',
  FADING_IN:  'fading-in',
  DONE:       'done',
});

export const deckFadeState = { a: FadeState.IDLE, b: FadeState.IDLE };

export function resetFadeState(id) {
  deckFadeState[id] = FadeState.IDLE;
}

// ---- Audio context + decks ----

let _audioCtx   = null;
let _deckA      = null;
let _deckB      = null;
let _masterGain = null;

/** Returns the shared AudioContext, or null if not yet initialised. */
export function getAudioCtx() { return _audioCtx; }

/**
 * Initialise AudioContext and both decks. Safe to call multiple times —
 * subsequent calls are no-ops. Must be triggered by a user gesture
 * (browser autoplay policy).
 */
export function ensureAudioContext(callbacks = {}) {
  if (_audioCtx) return;

  _audioCtx   = new AudioContext();
  _masterGain = _audioCtx.createGain();
  _masterGain.connect(_audioCtx.destination);

  _deckA = new Deck(_audioCtx, {
    onEnded:      callbacks.onEndedA,
    onTimeUpdate: callbacks.onTimeUpdateA,
    onLoaded:     callbacks.onLoadedA,
  });
  _deckB = new Deck(_audioCtx, {
    onEnded:      callbacks.onEndedB,
    onTimeUpdate: callbacks.onTimeUpdateB,
    onLoaded:     callbacks.onLoadedB,
  });

  _deckA.gainNode.connect(_masterGain);
  _deckB.gainNode.connect(_masterGain);
}

export function getDeck(id) { return id === 'a' ? _deckA : _deckB; }

export function otherDeckId(id) { return id === 'a' ? 'b' : 'a'; }

// ---- Crossfader (equal-power) ----

export function applyCrossfader(value) {
  if (!_deckA || !_deckB) return;
  const angle = value * Math.PI / 2;
  _deckA.gainNode.gain.value = Math.cos(angle);
  _deckB.gainNode.gain.value = Math.sin(angle);
}

// ---- Crossfade engine ----

/**
 * Smoothly crossfade from `fromId` to `toId`.
 *
 * @param {string}   fromId
 * @param {string}   toId
 * @param {number}   fadeDuration   seconds
 * @param {string}   xfValue        current crossfader value (string)
 * @param {function} setXfValue     (v: string) => void — updates slider UI
 * @param {function} onComplete     called when fade finishes
 */
export function performCrossfade(fromId, toId, fadeDuration, xfValue, setXfValue, onComplete) {
  if (!_audioCtx || !_deckA || !_deckB) return;

  const fromDeck  = getDeck(fromId);
  const toDeck    = getDeck(toId);
  const now       = _audioCtx.currentTime;
  const xfCurrent = parseFloat(xfValue);
  const targetXf  = toId === 'b' ? 1.0 : 0.0;

  if (fadeDuration === 0) {
    fromDeck.gainNode.gain.setValueAtTime(0, now);
    toDeck.gainNode.gain.setValueAtTime(1, now);
    setXfValue(String(targetXf));
    if (onComplete) onComplete();
    return;
  }

  fromDeck.gainNode.gain.cancelScheduledValues(now);
  toDeck.gainNode.gain.cancelScheduledValues(now);

  // Schedule 60 equal-power gain steps
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const t     = now + (fadeDuration * i / steps);
    const xf    = xfCurrent + (targetXf - xfCurrent) * (i / steps);
    const angle = xf * Math.PI / 2;
    fromDeck.gainNode.gain.setValueAtTime(
      toId === 'b' ? Math.cos(angle) : Math.sin(angle), t);
    toDeck.gainNode.gain.setValueAtTime(
      toId === 'b' ? Math.sin(angle) : Math.cos(angle), t);
  }

  // Animate slider and call onComplete when done
  const startTime = performance.now();
  function tick() {
    const elapsed  = (performance.now() - startTime) / 1000;
    const progress = Math.min(elapsed / fadeDuration, 1);
    setXfValue(String(xfCurrent + (targetXf - xfCurrent) * progress));
    if (progress < 1) requestAnimationFrame(tick);
    else if (onComplete) onComplete();
  }
  requestAnimationFrame(tick);
}
