/**
 * app.js — application entry point.
 *
 * Responsibilities: initialise modules, wire up event listeners,
 * coordinate between audio.js, ui.js, storage.js, and playlist.js.
 * No rendering logic and no audio DSP lives here.
 */

import { t } from './i18n.js';
import {
  addTrack, listTracks, getTrackBlob,
  deleteTracks, clearLibrary, resetDatabase,
  getSetting, setSetting,
} from './storage.js';
import { Playlist } from './playlist.js';
import {
  FadeState, deckFadeState, resetFadeState, isFadeActive,
  ensureAudioContext, getDeck, otherDeckId,
  applyCrossfader, performCrossfade,
  audioCtx, deckA, deckB,
} from './audio.js';
import {
  init as initUI, formatTime, displayName,
  updateDeckUI, renderLibrary, renderPlaylist,
  openDrawer, closeDrawer, confirmAction, applyStaticStrings,
} from './ui.js';

// ---- Constants ----

const APP_VERSION = '0.3.1';

// ---- State ----

const playlist            = new Playlist();
let library               = [];
let librarySearchTerm     = '';
let librarySortKey        = 'addedAt';
let librarySortAsc        = true;
const selectedLibraryIds  = new Set();
let loopEnabled           = false;
let autoFadeEnabled       = false;
let fadeDuration          = 10;

// ---- DOM refs ----

const el = {
  burgerBtn:       document.getElementById('burger-btn'),
  drawerOverlay:   document.getElementById('drawer-overlay'),
  libraryDrawer:   document.getElementById('library-drawer'),
  drawerClose:     document.getElementById('drawer-close'),
  libraryImportFolder:  document.getElementById('library-import-folder'),
  libraryImportFiles:   document.getElementById('library-import-files'),
  folderInput:     document.getElementById('folder-input'),
  fileInput:       document.getElementById('file-input'),
  librarySearch:   document.getElementById('library-search'),
  librarySelectAll:      document.getElementById('library-select-all'),
  libraryRemoveSelected: document.getElementById('library-remove-selected'),
  libraryClear:    document.getElementById('library-clear'),
  libraryTbody:    document.getElementById('library-tbody'),
  libraryCheckAll: document.getElementById('library-check-all'),
  thName:          document.getElementById('th-name'),
  thDuration:      document.getElementById('th-duration'),
  libraryEmpty:    document.getElementById('library-empty'),
  libraryNoResults: document.getElementById('library-no-results'),

  deckALabel:    document.getElementById('deck-a-label'),
  deckATrack:    document.getElementById('deck-a-track'),
  deckAProgress: document.getElementById('deck-a-progress'),
  deckAFill:     document.getElementById('deck-a-fill'),
  deckAMarker:   document.getElementById('deck-a-marker'),
  deckACurrent:  document.getElementById('deck-a-current'),
  deckADuration: document.getElementById('deck-a-duration'),
  deckAPlay:     document.getElementById('deck-a-play'),
  deckAStop:     document.getElementById('deck-a-stop'),
  deckASkip:     document.getElementById('deck-a-skip'),
  deckAVolume:   document.getElementById('deck-a-volume'),

  deckBLabel:    document.getElementById('deck-b-label'),
  deckBTrack:    document.getElementById('deck-b-track'),
  deckBProgress: document.getElementById('deck-b-progress'),
  deckBFill:     document.getElementById('deck-b-fill'),
  deckBMarker:   document.getElementById('deck-b-marker'),
  deckBCurrent:  document.getElementById('deck-b-current'),
  deckBDuration: document.getElementById('deck-b-duration'),
  deckBPlay:     document.getElementById('deck-b-play'),
  deckBStop:     document.getElementById('deck-b-stop'),
  deckBSkip:     document.getElementById('deck-b-skip'),
  deckBVolume:   document.getElementById('deck-b-volume'),

  crossfader:         document.getElementById('crossfader'),
  xfLabelA:           document.getElementById('xf-label-a'),
  xfLabelCenter:      document.getElementById('xf-label-center'),
  xfLabelB:           document.getElementById('xf-label-b'),
  xfCenterBtn:        document.getElementById('xf-center-btn'),
  loopBtn:            document.getElementById('loop-btn'),
  autoFadeBtn:        document.getElementById('auto-fade-btn'),
  fadeDurationSlider: document.getElementById('fade-duration'),
  fadeDurationValue:  document.getElementById('fade-duration-value'),
  fadeDurationLabel:  document.getElementById('fade-duration-label'),

  playlistClear:   document.getElementById('playlist-clear'),
  playlistEmpty:   document.getElementById('playlist-empty'),
  playlistList:    document.getElementById('playlist-list'),

  dangerReset:     document.getElementById('danger-reset'),
  infoBtn:         document.getElementById('info-btn'),
  aboutOverlay:    document.getElementById('about-overlay'),
  aboutTitle:      document.getElementById('about-title'),
  aboutVersionLine: document.getElementById('about-version-line'),
  aboutRepoLink:   document.getElementById('about-repo-link'),
  aboutClose:      document.getElementById('about-close'),
  confirmOverlay:  document.getElementById('confirm-overlay'),
  confirmMessage:  document.getElementById('confirm-message'),
  confirmCancel:   document.getElementById('confirm-cancel'),
  confirmOk:       document.getElementById('confirm-ok'),
};

// ---- Helpers ----

function getVisibleTracks() {
  const term = librarySearchTerm.trim().toLowerCase();
  let tracks = term
    ? library.filter((tr) => displayName(tr).toLowerCase().includes(term))
    : library;
  const sorted = [...tracks];
  const dir    = librarySortAsc ? 1 : -1;
  switch (librarySortKey) {
    case 'name':     sorted.sort((a, b) => dir * displayName(a).localeCompare(displayName(b))); break;
    case 'duration': sorted.sort((a, b) => dir * ((a.duration || 0) - (b.duration || 0))); break;
    default:         sorted.sort((a, b) => dir * (a.addedAt - b.addedAt)); break;
  }
  return sorted;
}

function getState() {
  return { autoFadeEnabled, fadeDuration, loopEnabled };
}

function refreshRenderLibrary() {
  renderLibrary(getVisibleTracks(), selectedLibraryIds, librarySortKey, librarySortAsc);
}

function refreshRenderPlaylist(save = true) {
  // Import deck instances via getter since they're set lazily
  renderPlaylist(playlist, getDeck('a'), getDeck('b'), save);
}

// ---- Initialise UI module ----

initUI({
  library,
  playlist,
  getDeck,
  el,
  getState,
  onAction: {
    onLibraryCheckbox: (trackId, checked) => {
      if (checked) selectedLibraryIds.add(trackId);
      else selectedLibraryIds.delete(trackId);
      refreshRenderLibrary();
    },
    onAddToPlaylist: (trackId) => {
      const wasEmpty = playlist.items.length === 0;
      playlist.add(trackId);
      refreshRenderPlaylist();
      if (wasEmpty || playlist.items.length === 2) initPlaylistDecks();
    },
    onLoadOnDeck: (deckId, trackId, index) => {
      _ensureAudio();
      playlist.setCurrentIndex(index);
      loadTrackOnDeck(deckId, trackId).then(() => refreshRenderPlaylist());
    },
    onPlaylistMove: (index, dir) => {
      if (dir < 0) playlist.moveUp(index);
      else playlist.moveDown(index);
      refreshRenderPlaylist();
    },
    onPlaylistRemove: (index) => {
      playlist.removeAt(index);
      refreshRenderPlaylist();
    },
    onPlaylistDblClick: (trackId, index) => {
      _ensureAudio();
      const dA     = getDeck('a');
      const dB     = getDeck('b');
      const target = (dA && !dA.isPlaying) ? 'a' : 'b';
      playlist.setCurrentIndex(index);
      loadTrackOnDeck(target, trackId).then(() => refreshRenderPlaylist());
    },
    onSavePlaylist: () => savePlaylistState(),
  },
});

// ---- Audio init (lazy) ----

function _ensureAudio() {
  ensureAudioContext({
    onEndedA:      () => handleTrackEnded('a'),
    onEndedB:      () => handleTrackEnded('b'),
    onTimeUpdateA: () => { updateDeckUI('a'); checkAutoFadeTrigger('a').catch(console.error); },
    onTimeUpdateB: () => { updateDeckUI('b'); checkAutoFadeTrigger('b').catch(console.error); },
    onLoadedA:     () => updateDeckUI('a'),
    onLoadedB:     () => updateDeckUI('b'),
  });
  applyCrossfader(parseFloat(el.crossfader.value));
}

// ---- Library ----

async function refreshLibrary() {
  library.length = 0;
  (await listTracks()).forEach((tr) => library.push(tr));
  refreshRenderLibrary();
}

const AUDIO_EXTENSIONS = ['.mp3','.wav','.ogg','.oga','.flac','.m4a','.aac','.weba','.opus'];
function looksLikeAudio(f) {
  if (f.type && f.type.startsWith('audio/')) return true;
  const ln = f.name.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => ln.endsWith(ext));
}

async function importFiles(fileList) {
  const files = Array.from(fileList).filter(looksLikeAudio);
  if (!files.length) return;
  const existing = await listTracks();
  let skipped = 0;
  for (const file of files) {
    const { skipped: s } = await addTrack(file, existing);
    if (s) skipped++;
    else existing.push({ name: file.name, size: file.size });
  }
  await refreshLibrary();
  if (skipped > 0) console.info(t('library.importSkippedDuplicates', { count: skipped }));
}

// ---- Playlist persistence ----

async function savePlaylistState() {
  await setSetting('playlist', { items: playlist.items, currentIndex: playlist.currentIndex });
}

async function loadPlaylistState() {
  const saved = await getSetting('playlist');
  if (!saved) return;
  const ids = new Set(library.map((tr) => tr.id));
  playlist.items        = (saved.items || []).filter((id) => ids.has(id));
  const idx             = saved.currentIndex ?? -1;
  playlist.currentIndex = idx < playlist.items.length ? idx : -1;
}

// ---- Deck loading ----

async function loadTrackOnDeck(deckId, trackId) {
  _ensureAudio();
  const blob = await getTrackBlob(trackId);
  if (!blob) return;
  const meta = library.find((tr) => tr.id === trackId);
  await getDeck(deckId).load(trackId, blob, meta ? displayName(meta) : '');
  resetFadeState(deckId);
  updateDeckUI(deckId);
  refreshRenderPlaylist(false);
}

// ---- Track ended ----

// ---- Track ended ----

async function handleTrackEnded(deckId) {
  // If a fade was active for this deck, it already handled everything
  // in onComplete (advance, stop, post-load). Nothing to do here.
  if (deckFadeState[deckId] !== FadeState.IDLE) {
    updateDeckUI(deckId);
    return;
  }

  // Normal end (no fade): advance playlist and play next on same deck.
  const nextId = playlist.advance();
  if (nextId) {
    await loadTrackOnDeck(deckId, nextId);
    getDeck(deckId).play();
  } else if (loopEnabled && playlist.items.length > 0) {
    playlist.setCurrentIndex(0);
    await loadTrackOnDeck(deckId, playlist.currentTrackId);
    getDeck(deckId).play();
  } else {
    updateDeckUI(deckId);
  }
  await savePlaylistState();
}

// ---- Auto-crossfade ----

async function checkAutoFadeTrigger(deckId) {
  if (!autoFadeEnabled) return;
  const deck = getDeck(deckId);
  if (!deck || !deck.isPlaying || !deck.duration) return;

  // Only the dominant deck (crossfader pointing at it) triggers.
  const xf         = parseFloat(el.crossfader.value);
  const isDominant = deckId === 'a' ? xf <= 0.5 : xf > 0.5;
  if (!isDominant) return;

  // Only trigger once per track.
  if (deckFadeState[deckId] !== FadeState.IDLE) return;

  const remaining = deck.duration - deck.currentTime;
  if (remaining > Math.max(fadeDuration, 1)) return;

  // Determine the next track (peek — no advance yet).
  const trackToLoad = playlist.peekNext() ??
    (loopEnabled ? playlist.items[0] : null);
  if (!trackToLoad) return;

  // Mark both decks as fading.
  const otherId   = otherDeckId(deckId);
  const otherDeck = getDeck(otherId);
  deckFadeState[deckId]  = FadeState.FADING_OUT;
  deckFadeState[otherId] = FadeState.FADING_IN;

  // Load next track onto free deck only if not already there
  // (e.g. post-loaded from the previous fade's onComplete).
  if (otherDeck.currentTrackId !== trackToLoad) {
    await loadTrackOnDeck(otherId, trackToLoad);
  }

  // Start incoming deck silently.
  otherDeck.gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
  otherDeck.play();

  performCrossfade(deckId, otherId, fadeDuration, el.crossfader.value,
    (v) => { el.crossfader.value = v; },
    async () => {
      // 1. Advance playlist — exactly once, exactly here.
      if (playlist.peekNext()) {
        playlist.advance();
      } else if (loopEnabled) {
        playlist.setCurrentIndex(0);
      }

      // 2. Stop outgoing deck and mark as DONE so handleTrackEnded
      //    (which fires when the source node ends) does nothing.
      deckFadeState[deckId]  = FadeState.DONE;
      deckFadeState[otherId] = FadeState.IDLE;
      deck.stop();
      updateDeckUI(deckId);

      // 3. Post-load: silently load the *next* upcoming track onto the
      //    now-free outgoing deck, ready for the next fade.
      //    This happens once here — nowhere else.
      const nextUp = playlist.peekNext() ??
        (loopEnabled ? playlist.items[0] : null);
      if (nextUp) {
        await loadTrackOnDeck(deckId, nextUp);
        // loadTrackOnDeck calls resetFadeState → IDLE, deck is ready.
      } else {
        resetFadeState(deckId);
      }

      await savePlaylistState();
      refreshRenderPlaylist(false);
    }
  );
}

// ---- Playlist deck initialisation ----

/**
 * When the playlist first gets tracks (or on reload), ensure both decks
 * are pre-loaded so auto-fade always has something to fade into.
 *
 * Deck A: playlist item at currentIndex (or 0)
 * Deck B: next item (silently, no autoplay)
 *
 * Only runs if decks are empty — never overwrites a playing deck.
 */
async function initPlaylistDecks() {
  if (!playlist.items.length) return;
  _ensureAudio();

  const dA = getDeck('a');
  const dB = getDeck('b');

  // Don't touch playing decks.
  if (dA && dA.isPlaying) return;
  if (dB && dB.isPlaying) return;

  if (playlist.currentIndex < 0) playlist.setCurrentIndex(0);

  const trackA = playlist.currentTrackId;
  const trackB = playlist.peekNext();

  if (trackA && dA && !dA.currentTrackId) {
    await loadTrackOnDeck('a', trackA);
  }
  if (trackB && dB && !dB.currentTrackId) {
    await loadTrackOnDeck('b', trackB);
  }
}

// ---- Event listeners: crossfader ----

el.crossfader.addEventListener('input', (e) => {
  _ensureAudio();
  applyCrossfader(parseFloat(e.target.value));
});

el.xfCenterBtn.addEventListener('click', () => {
  el.crossfader.value = '0.5';
  applyCrossfader(0.5);
});

// ---- Event listeners: drawer ----

el.burgerBtn.addEventListener('click',   () => openDrawer(el));
el.drawerClose.addEventListener('click', () => closeDrawer(el));
el.drawerOverlay.addEventListener('click', () => closeDrawer(el));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && el.libraryDrawer.classList.contains('is-open')) closeDrawer(el);
});

// ---- Event listeners: about ----

el.infoBtn.addEventListener('click', () => {
  el.aboutOverlay.hidden = false; el.aboutClose.focus();
});
el.aboutClose.addEventListener('click', () => {
  el.aboutOverlay.hidden = true; el.infoBtn.focus();
});
el.aboutOverlay.addEventListener('click', (e) => {
  if (e.target === el.aboutOverlay) { el.aboutOverlay.hidden = true; el.infoBtn.focus(); }
});

// ---- Event listeners: loop + auto-fade ----

function updateLoopButton()     { el.loopBtn.classList.toggle('is-active', loopEnabled); }
function updateAutoFadeButton() { el.autoFadeBtn.classList.toggle('is-active', autoFadeEnabled); }

el.loopBtn.addEventListener('click', async () => {
  loopEnabled = !loopEnabled;
  updateLoopButton();
  await setSetting('loop', loopEnabled);
});

el.autoFadeBtn.addEventListener('click', async () => {
  autoFadeEnabled = !autoFadeEnabled;
  updateAutoFadeButton();
  updateDeckUI('a'); updateDeckUI('b');
  await setSetting('autoFade', autoFadeEnabled);
});

el.fadeDurationSlider.addEventListener('input', async (e) => {
  fadeDuration = parseFloat(e.target.value);
  el.fadeDurationValue.textContent = `${fadeDuration}s`;
  updateDeckUI('a'); updateDeckUI('b');
  await setSetting('fadeDuration', fadeDuration);
});

// ---- Event listeners: library ----

el.libraryImportFolder.addEventListener('click', () => el.folderInput.click());
el.libraryImportFiles.addEventListener('click',  () => el.fileInput.click());
el.folderInput.addEventListener('change', (e) => importFiles(e.target.files));
el.fileInput.addEventListener('change',   (e) => importFiles(e.target.files));

el.librarySearch.addEventListener('input', (e) => {
  librarySearchTerm = e.target.value;
  refreshRenderLibrary();
});

document.querySelectorAll('.library-table th.sortable').forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (librarySortKey === key) librarySortAsc = !librarySortAsc;
    else { librarySortKey = key; librarySortAsc = true; }
    refreshRenderLibrary();
  });
});

if (el.libraryCheckAll) {
  el.libraryCheckAll.addEventListener('change', () => {
    const ids = getVisibleTracks().map((tr) => tr.id);
    if (el.libraryCheckAll.checked) ids.forEach((id) => selectedLibraryIds.add(id));
    else ids.forEach((id) => selectedLibraryIds.delete(id));
    refreshRenderLibrary();
  });
}

el.librarySelectAll.addEventListener('click', () => {
  const ids = getVisibleTracks().map((tr) => tr.id);
  const all = ids.length > 0 && ids.every((id) => selectedLibraryIds.has(id));
  if (all) ids.forEach((id) => selectedLibraryIds.delete(id));
  else     ids.forEach((id) => selectedLibraryIds.add(id));
  refreshRenderLibrary();
});

el.libraryRemoveSelected.addEventListener('click', async () => {
  if (!selectedLibraryIds.size) return;
  const ids = Array.from(selectedLibraryIds);
  await deleteTracks(ids);
  playlist.removeByTrackIds(ids);
  selectedLibraryIds.clear();
  await refreshLibrary();
  refreshRenderPlaylist();
});

el.libraryClear.addEventListener('click', async () => {
  if (!library.length) return;
  const ok = await confirmAction(el, t('library.clearConfirm'));
  if (!ok) return;
  await clearLibrary();
  playlist.removeByTrackIds(library.map((tr) => tr.id));
  selectedLibraryIds.clear();
  await refreshLibrary();
  refreshRenderPlaylist();
});

// ---- Event listeners: playlist ----

el.playlistClear.addEventListener('click', async () => {
  if (!playlist.items.length) return;
  const ok = await confirmAction(el, t('playlist.clearConfirm'));
  if (!ok) return;
  const a = getDeck('a'); const b = getDeck('b');
  if (a) a.stop(); if (b) b.stop();
  playlist.clear();
  updateDeckUI('a'); updateDeckUI('b');
  refreshRenderPlaylist();
});

// ---- Event listeners: deck controls ----

function wireDeckControls(id) {
  const playBtn   = id === 'a' ? el.deckAPlay   : el.deckBPlay;
  const stopBtn   = id === 'a' ? el.deckAStop   : el.deckBStop;
  const skipBtn   = id === 'a' ? el.deckASkip   : el.deckBSkip;
  const volSlider = id === 'a' ? el.deckAVolume : el.deckBVolume;
  const progressEl = id === 'a' ? el.deckAProgress : el.deckBProgress;

  playBtn.addEventListener('click', async () => {
    _ensureAudio();
    const deck = getDeck(id);
    if (!deck.currentTrackId) {
      if (!playlist.currentTrackId) playlist.setCurrentIndex(0);
      if (!playlist.currentTrackId) return;
      await loadTrackOnDeck(id, playlist.currentTrackId);
      deck.play();
    } else if (deck.isPlaying) {
      deck.pause();
    } else {
      deck.play();
    }
    updateDeckUI(id);
  });

  stopBtn.addEventListener('click', () => {
    const deck = getDeck(id);
    if (deck) { deck.stop(); updateDeckUI(id); }
  });

  skipBtn.addEventListener('click', async () => {
    _ensureAudio();
    const nextId = playlist.advance();
    if (nextId) {
      const wasPlaying = getDeck(id).isPlaying;
      await loadTrackOnDeck(id, nextId);
      if (wasPlaying) getDeck(id).play();
      await savePlaylistState();
    }
  });

  volSlider.addEventListener('input', (e) => {
    _ensureAudio();
    getDeck(id).setVolume(parseFloat(e.target.value));
  });

  progressEl.addEventListener('click', (e) => {
    const deck = getDeck(id);
    if (!deck || !deck.duration) return;
    const rect  = progressEl.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    deck.seek(ratio * deck.duration);
  });
}

wireDeckControls('a');
wireDeckControls('b');

// ---- Event listeners: danger zone ----

el.dangerReset.addEventListener('click', async () => {
  const ok = await confirmAction(el, t('danger.resetConfirm'));
  if (!ok) return;
  el.dangerReset.disabled    = true;
  el.dangerReset.textContent = t('danger.resetting');
  const a = getDeck('a'); const b = getDeck('b');
  if (a) a.stop(); if (b) b.stop();
  try {
    await resetDatabase();
    window.location.reload();
  } catch (err) {
    console.error('Reset failed:', err);
    el.dangerReset.disabled    = false;
    el.dangerReset.textContent = t('danger.reset');
    alert(t('common.error'));
  }
});

// ---- Init ----

applyStaticStrings(APP_VERSION, el);

(async () => {
  await refreshLibrary();

  const [savedLoop, savedAutoFade, savedFadeDuration, savedPlaylist] = await Promise.all([
    getSetting('loop'),
    getSetting('autoFade'),
    getSetting('fadeDuration'),
    getSetting('playlist'),
  ]);

  if (savedLoop       === true)   { loopEnabled = true;          updateLoopButton(); }
  if (savedAutoFade   === true)   { autoFadeEnabled = true;       updateAutoFadeButton(); }
  if (savedFadeDuration !== null) {
    fadeDuration = savedFadeDuration;
    el.fadeDurationSlider.value      = String(fadeDuration);
    el.fadeDurationValue.textContent = `${fadeDuration}s`;
  }

  if (savedPlaylist) {
    const ids = new Set(library.map((tr) => tr.id));
    playlist.items        = (savedPlaylist.items || []).filter((id) => ids.has(id));
    const idx             = savedPlaylist.currentIndex ?? -1;
    playlist.currentIndex = idx < playlist.items.length ? idx : -1;
  }

  refreshRenderPlaylist(false);

  // Pre-load first two tracks into decks if playlist was restored.
  if (playlist.items.length > 0) await initPlaylistDecks();
})();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(console.error);
  });
}
