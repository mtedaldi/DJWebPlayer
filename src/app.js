import { t } from './i18n.js';
import {
  addTrack, listTracks, getTrackBlob,
  deleteTracks, clearLibrary, resetDatabase,
  getSetting, setSetting,
} from './storage.js';
import { Deck } from './deck.js';
import { Playlist } from './playlist.js';

// ---- Constants ----

const APP_VERSION = '0.3.0';

// ---- Audio context + decks ----
// AudioContext is created lazily on first user gesture to comply with
// browser autoplay policy.

let audioCtx = null;
let deckA = null;
let deckB = null;
let masterGain = null;

function ensureAudioContext() {
  if (audioCtx) return;
  audioCtx = new AudioContext();
  masterGain = audioCtx.createGain();
  masterGain.connect(audioCtx.destination);

  deckA = new Deck(audioCtx, {
    onEnded:      () => handleTrackEnded('a'),
    onTimeUpdate: () => { updateDeckUI('a'); checkAutoFadeTrigger('a'); },
    onLoaded:     () => updateDeckUI('a'),
  });
  deckB = new Deck(audioCtx, {
    onEnded:      () => handleTrackEnded('b'),
    onTimeUpdate: () => { updateDeckUI('b'); checkAutoFadeTrigger('b'); },
    onLoaded:     () => updateDeckUI('b'),
  });

  deckA.gainNode.connect(masterGain);
  deckB.gainNode.connect(masterGain);

  // Apply current crossfader position to initial gains
  applyCrossfader(parseFloat(el.crossfader.value));
}

// ---- State ----

const playlist = new Playlist();
let library        = [];
let librarySearchTerm = '';
let librarySortKey    = 'addedAt';
let librarySortAsc    = true;
const selectedLibraryIds = new Set();
let loopEnabled    = false;
let autoFadeEnabled = false;
let fadeDuration   = 10;    // seconds
let _fadeTriggered = {};    // { 'a': bool, 'b': bool } — prevent double-trigger per track

// Which deck is "free" (not currently playing)?
// Used by double-click to load onto the non-playing deck.
function freeDeckId() {
  if (!deckA || !deckB) return 'b';
  if (!deckA.isPlaying) return 'a';
  if (!deckB.isPlaying) return 'b';
  return 'b'; // both playing: default to B
}

// ---- DOM refs ----

const el = {
  // Library drawer
  burgerBtn:       document.getElementById('burger-btn'),
  drawerOverlay:   document.getElementById('drawer-overlay'),
  libraryDrawer:   document.getElementById('library-drawer'),
  drawerClose:     document.getElementById('drawer-close'),
  libraryImportFolder: document.getElementById('library-import-folder'),
  libraryImportFiles:  document.getElementById('library-import-files'),
  folderInput:     document.getElementById('folder-input'),
  fileInput:       document.getElementById('file-input'),
  librarySearch:   document.getElementById('library-search'),
  librarySelectAll:     document.getElementById('library-select-all'),
  libraryRemoveSelected: document.getElementById('library-remove-selected'),
  libraryClear:    document.getElementById('library-clear'),
  libraryTbody:    document.getElementById('library-tbody'),
  libraryCheckAll: document.getElementById('library-check-all'),
  thName:          document.getElementById('th-name'),
  thDuration:      document.getElementById('th-duration'),
  libraryEmpty:    document.getElementById('library-empty'),
  libraryNoResults: document.getElementById('library-no-results'),

  // Deck A
  deckALabel:    document.getElementById('deck-a-label'),
  deckATrack:    document.getElementById('deck-a-track'),
  deckAProgress: document.getElementById('deck-a-progress'),
  deckAFill:     document.getElementById('deck-a-fill'),
  deckACurrent:  document.getElementById('deck-a-current'),
  deckADuration: document.getElementById('deck-a-duration'),
  deckAPlay:     document.getElementById('deck-a-play'),
  deckAStop:     document.getElementById('deck-a-stop'),
  deckASkip:     document.getElementById('deck-a-skip'),
  deckAVolume:   document.getElementById('deck-a-volume'),

  // Deck B
  deckBLabel:    document.getElementById('deck-b-label'),
  deckBTrack:    document.getElementById('deck-b-track'),
  deckBProgress: document.getElementById('deck-b-progress'),
  deckBFill:     document.getElementById('deck-b-fill'),
  deckBCurrent:  document.getElementById('deck-b-current'),
  deckBDuration: document.getElementById('deck-b-duration'),
  deckBPlay:     document.getElementById('deck-b-play'),
  deckBStop:     document.getElementById('deck-b-stop'),
  deckBSkip:     document.getElementById('deck-b-skip'),
  deckBVolume:   document.getElementById('deck-b-volume'),

  // Crossfader + controls
  crossfader:    document.getElementById('crossfader'),
  xfLabelA:      document.getElementById('xf-label-a'),
  xfLabelCenter: document.getElementById('xf-label-center'),
  xfLabelB:      document.getElementById('xf-label-b'),
  xfCenterBtn:   document.getElementById('xf-center-btn'),
  loopBtn:       document.getElementById('loop-btn'),
  autoFadeBtn:   document.getElementById('auto-fade-btn'),
  fadeDurationSlider: document.getElementById('fade-duration'),
  fadeDurationValue:  document.getElementById('fade-duration-value'),
  fadeDurationLabel:  document.getElementById('fade-duration-label'),

  // Playlist
  playlistTitle:  document.getElementById('playlist-title'),
  playlistClear:  document.getElementById('playlist-clear'),
  playlistEmpty:  document.getElementById('playlist-empty'),
  playlistList:   document.getElementById('playlist-list'),

  // Danger
  dangerReset:   document.getElementById('danger-reset'),

  // Overlays
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

function formatTime(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function displayName(track) {
  return track.name.replace(/\.[^/.]+$/, '');
}

function getDeck(id) { return id === 'a' ? deckA : deckB; }

function freeDeck() { return activeDeck === 'a' ? 'b' : 'a'; }

// ---- Crossfader (equal-power) ----

function applyCrossfader(value) {
  // value: 0 = full A, 0.5 = equal, 1 = full B
  if (!deckA || !deckB) return;
  const angle = value * Math.PI / 2;        // 0 .. π/2
  deckA.gainNode.gain.value = Math.cos(angle);
  deckB.gainNode.gain.value = Math.sin(angle);
}

el.crossfader.addEventListener('input', (e) => {
  ensureAudioContext();
  applyCrossfader(parseFloat(e.target.value));
});

el.xfCenterBtn.addEventListener('click', () => {
  el.crossfader.value = '0.5';
  applyCrossfader(0.5);
});

// ---- Drawer ----

function openDrawer() {
  el.libraryDrawer.classList.add('is-open');
  el.drawerOverlay.hidden = false;
  el.libraryDrawer.setAttribute('aria-hidden', 'false');
  el.drawerClose.focus();
}
function closeDrawer() {
  el.libraryDrawer.classList.remove('is-open');
  el.drawerOverlay.hidden = true;
  el.libraryDrawer.setAttribute('aria-hidden', 'true');
  el.burgerBtn.focus();
}
el.burgerBtn.addEventListener('click', openDrawer);
el.drawerClose.addEventListener('click', closeDrawer);
el.drawerOverlay.addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && el.libraryDrawer.classList.contains('is-open')) closeDrawer();
});

// ---- Confirm dialog ----

function confirmAction(message) {
  return new Promise((resolve) => {
    el.confirmMessage.textContent = message;
    el.confirmOverlay.hidden = false;
    const cleanup = (result) => {
      el.confirmOverlay.hidden = true;
      el.confirmOk.removeEventListener('click', onOk);
      el.confirmCancel.removeEventListener('click', onCancel);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    el.confirmOk.addEventListener('click', onOk);
    el.confirmCancel.addEventListener('click', onCancel);
  });
}

// ---- About ----

el.infoBtn.addEventListener('click', () => {
  el.aboutOverlay.hidden = false;
  el.aboutClose.focus();
});
el.aboutClose.addEventListener('click', () => {
  el.aboutOverlay.hidden = true;
  el.infoBtn.focus();
});
el.aboutOverlay.addEventListener('click', (e) => {
  if (e.target === el.aboutOverlay) {
    el.aboutOverlay.hidden = true;
    el.infoBtn.focus();
  }
});

// ---- Loop ----

function updateLoopButton() {
  el.loopBtn.classList.toggle('is-active', loopEnabled);
}
el.loopBtn.addEventListener('click', async () => {
  loopEnabled = !loopEnabled;
  updateLoopButton();
  await setSetting('loop', loopEnabled);
});

// ---- Auto-Crossfade ----

function updateAutoFadeButton() {
  el.autoFadeBtn.classList.toggle('is-active', autoFadeEnabled);
}

el.autoFadeBtn.addEventListener('click', async () => {
  autoFadeEnabled = !autoFadeEnabled;
  updateAutoFadeButton();
  await setSetting('autoFade', autoFadeEnabled);
});

el.fadeDurationSlider.addEventListener('input', async (e) => {
  fadeDuration = parseFloat(e.target.value);
  el.fadeDurationValue.textContent = `${fadeDuration}s`;
  await setSetting('fadeDuration', fadeDuration);
});

/**
 * Perform a smooth crossfade from one deck to another over fadeDuration
 * seconds using Web Audio API gain ramps (frame-accurate, no setInterval).
 * The UI slider is updated via requestAnimationFrame.
 *
 * @param {string} fromId  'a' | 'b'  — deck currently playing
 * @param {string} toId    'a' | 'b'  — deck to fade into
 */
function performCrossfade(fromId, toId, onComplete) {
  if (!audioCtx || !deckA || !deckB) return;

  const fromDeck = getDeck(fromId);
  const toDeck   = getDeck(toId);
  const now      = audioCtx.currentTime;

  // Special case: zero fade = instant cut
  if (fadeDuration === 0) {
    fromDeck.gainNode.gain.setValueAtTime(0, now);
    toDeck.gainNode.gain.setValueAtTime(1, now);
    el.crossfader.value = toId === 'b' ? '1' : '0';
    if (onComplete) onComplete();
    return;
  }

  const xfCurrent = parseFloat(el.crossfader.value);
  const targetXf  = toId === 'b' ? 1.0 : 0.0;

  // Schedule gain ramps via equal-power steps
  fromDeck.gainNode.gain.cancelScheduledValues(now);
  toDeck.gainNode.gain.cancelScheduledValues(now);

  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const t     = now + (fadeDuration * i / steps);
    const xf    = xfCurrent + (targetXf - xfCurrent) * (i / steps);
    const angle = xf * Math.PI / 2;
    fromDeck.gainNode.gain.setValueAtTime(toId === 'b' ? Math.cos(angle) : Math.sin(angle), t);
    toDeck.gainNode.gain.setValueAtTime(toId === 'b' ? Math.sin(angle) : Math.cos(angle), t);
  }

  // Mirror crossfader UI and call onComplete when done
  const startTime = performance.now();
  function animateSlider() {
    const elapsed  = (performance.now() - startTime) / 1000;
    const progress = Math.min(elapsed / fadeDuration, 1);
    el.crossfader.value = String(xfCurrent + (targetXf - xfCurrent) * progress);
    if (progress < 1) {
      requestAnimationFrame(animateSlider);
    } else {
      if (onComplete) onComplete();
    }
  }
  requestAnimationFrame(animateSlider);
}

/**
 * Called on every onTimeUpdate tick. Checks whether we should trigger
 * the auto-crossfade for the given deck.
 *
 * Only triggers if this deck is "dominant" (crossfader position gives it
 * gain > 0.5). The free deck starts silently (gain 0), the fade brings
 * it up while fading out the dominant deck. After the fade, the old deck
 * stops automatically.
 */
async function checkAutoFadeTrigger(deckId) {
  if (!autoFadeEnabled) return;
  const deck = getDeck(deckId);
  if (!deck.isPlaying || !deck.duration) return;

  // Only the dominant deck (higher gain = crossfader pointing at it) triggers
  const xf = parseFloat(el.crossfader.value);
  const isDominant = deckId === 'a' ? xf <= 0.5 : xf > 0.5;
  if (!isDominant) return;

  const remaining = deck.duration - deck.currentTime;
  const threshold = Math.max(fadeDuration, 1);
  if (remaining > threshold) return;
  if (_fadeTriggered[deckId]) return;
  _fadeTriggered[deckId] = true;

  const otherId   = deckId === 'a' ? 'b' : 'a';
  const otherDeck = getDeck(otherId);

  // Determine next track
  const nextIndex = playlist.currentIndex + 1;
  const trackToLoad = nextIndex < playlist.items.length
    ? playlist.items[nextIndex]
    : (loopEnabled ? playlist.items[0] : null);
  if (!trackToLoad) return;

  // Load next track onto free deck if not already there
  if (otherDeck.currentTrackId !== trackToLoad) {
    await loadTrackOnDeck(otherId, trackToLoad);
  }

  // Start free deck silently (gain = 0), then crossfade
  otherDeck.gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
  otherDeck.play();

  // Crossfade, then stop the old deck after fade completes
  performCrossfade(deckId, otherId, () => {
    deck.stop();
    updateDeckUI(deckId);
  });

  // Advance playlist index
  if (nextIndex < playlist.items.length) {
    playlist.advance();
  } else if (loopEnabled) {
    playlist.setCurrentIndex(0);
  }
  await savePlaylistState();
  renderPlaylist(false);
}

// ---- Library ----

async function refreshLibrary() {
  library = await listTracks();
  renderLibrary();
}

function getVisibleTracks() {
  const term = librarySearchTerm.trim().toLowerCase();
  let tracks = term
    ? library.filter((tr) => displayName(tr).toLowerCase().includes(term))
    : library;
  const sorted = [...tracks];
  const dir = librarySortAsc ? 1 : -1;
  switch (librarySortKey) {
    case 'name':     sorted.sort((a, b) => dir * displayName(a).localeCompare(displayName(b))); break;
    case 'duration': sorted.sort((a, b) => dir * ((a.duration || 0) - (b.duration || 0))); break;
    default:         sorted.sort((a, b) => dir * (a.addedAt - b.addedAt)); break;
  }
  return sorted;
}

function updateSortHeaders() {
  const arrow = librarySortAsc ? ' ▲' : ' ▼';
  el.thName.textContent     = t('library.colName')     + (librarySortKey === 'name'     ? arrow : '');
  el.thDuration.textContent = t('library.colDuration') + (librarySortKey === 'duration' ? arrow : '');
  el.thName.classList.toggle('is-sorted', librarySortKey === 'name');
  el.thDuration.classList.toggle('is-sorted', librarySortKey === 'duration');
}

function updateBulkBar() {
  el.libraryRemoveSelected.disabled = selectedLibraryIds.size === 0;
  const visible = getVisibleTracks();
  const allSelected = visible.length > 0 && visible.every((tr) => selectedLibraryIds.has(tr.id));
  el.librarySelectAll.textContent = allSelected ? t('library.deselectAll') : t('library.selectAll');
  if (el.libraryCheckAll) el.libraryCheckAll.checked = allSelected;
}

function renderLibrary() {
  const visible = getVisibleTracks();
  el.libraryTbody.innerHTML = '';
  el.libraryEmpty.hidden    = library.length > 0;
  el.libraryNoResults.hidden = !(library.length > 0 && visible.length === 0);
  updateSortHeaders();

  for (const track of visible) {
    const tr = document.createElement('tr');
    if (selectedLibraryIds.has(track.id)) tr.classList.add('is-selected');

    const tdCheck = document.createElement('td');
    tdCheck.className = 'col-check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selectedLibraryIds.has(track.id);
    cb.addEventListener('change', () => {
      if (cb.checked) selectedLibraryIds.add(track.id);
      else selectedLibraryIds.delete(track.id);
      renderLibrary();
    });
    tdCheck.appendChild(cb);
    tr.appendChild(tdCheck);

    const tdName = document.createElement('td');
    tdName.className = 'col-name';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = displayName(track);
    tdName.appendChild(nameSpan);
    tr.appendChild(tdName);

    const tdDur = document.createElement('td');
    tdDur.className = 'col-duration';
    tdDur.textContent = track.duration ? formatTime(track.duration) : '—';
    tr.appendChild(tdDur);

    const tdBtn = document.createElement('td');
    tdBtn.className = 'col-actions';
    const addBtn = document.createElement('button');
    addBtn.textContent = '+';
    addBtn.title = t('library.addToPlaylist');
    addBtn.addEventListener('click', () => {
      playlist.add(track.id);
      renderPlaylist();
    });
    tdBtn.appendChild(addBtn);
    tr.appendChild(tdBtn);

    el.libraryTbody.appendChild(tr);
  }
  updateBulkBar();
}

const AUDIO_EXTENSIONS = ['.mp3','.wav','.ogg','.oga','.flac','.m4a','.aac','.weba','.opus'];
function looksLikeAudio(file) {
  if (file.type && file.type.startsWith('audio/')) return true;
  const ln = file.name.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => ln.endsWith(ext));
}

async function importFiles(fileList) {
  const files = Array.from(fileList).filter(looksLikeAudio);
  let skipped = 0;
  for (const file of files) {
    const { skipped: s } = await addTrack(file);
    if (s) skipped++;
  }
  await refreshLibrary();
  if (skipped > 0) console.info(t('library.importSkippedDuplicates', { count: skipped }));
}

el.libraryImportFolder.addEventListener('click', () => el.folderInput.click());
el.libraryImportFiles.addEventListener('click',  () => el.fileInput.click());
el.folderInput.addEventListener('change', (e) => importFiles(e.target.files));
el.fileInput.addEventListener('change',   (e) => importFiles(e.target.files));

el.librarySearch.addEventListener('input', (e) => {
  librarySearchTerm = e.target.value;
  renderLibrary();
});

document.querySelectorAll('.library-table th.sortable').forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (librarySortKey === key) librarySortAsc = !librarySortAsc;
    else { librarySortKey = key; librarySortAsc = true; }
    renderLibrary();
  });
});

if (el.libraryCheckAll) {
  el.libraryCheckAll.addEventListener('change', () => {
    const visibleIds = getVisibleTracks().map((tr) => tr.id);
    if (el.libraryCheckAll.checked) visibleIds.forEach((id) => selectedLibraryIds.add(id));
    else visibleIds.forEach((id) => selectedLibraryIds.delete(id));
    renderLibrary();
  });
}

el.librarySelectAll.addEventListener('click', () => {
  const visibleIds = getVisibleTracks().map((tr) => tr.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedLibraryIds.has(id));
  if (allSelected) visibleIds.forEach((id) => selectedLibraryIds.delete(id));
  else visibleIds.forEach((id) => selectedLibraryIds.add(id));
  renderLibrary();
});

el.libraryRemoveSelected.addEventListener('click', async () => {
  if (selectedLibraryIds.size === 0) return;
  const ids = Array.from(selectedLibraryIds);
  await deleteTracks(ids);
  playlist.removeByTrackIds(ids);
  selectedLibraryIds.clear();
  await refreshLibrary();
  renderPlaylist();
});

el.libraryClear.addEventListener('click', async () => {
  if (library.length === 0) return;
  const ok = await confirmAction(t('library.clearConfirm'));
  if (!ok) return;
  await clearLibrary();
  playlist.removeByTrackIds(library.map((tr) => tr.id));
  selectedLibraryIds.clear();
  await refreshLibrary();
  renderPlaylist();
});

// ---- Playlist persistence ----

async function savePlaylistState() {
  await setSetting('playlist', {
    items: playlist.items,
    currentIndex: playlist.currentIndex,
  });
}

async function loadPlaylistState() {
  const saved = await getSetting('playlist');
  if (!saved) return;
  const libraryIds = new Set(library.map((tr) => tr.id));
  playlist.items = (saved.items || []).filter((id) => libraryIds.has(id));
  const idx = saved.currentIndex ?? -1;
  playlist.currentIndex = idx < playlist.items.length ? idx : -1;
}

// ---- Playlist rendering ----

function findTrackMeta(trackId) {
  return library.find((tr) => tr.id === trackId);
}

function renderPlaylist(save = true) {
  el.playlistList.innerHTML = '';
  el.playlistEmpty.hidden = playlist.items.length > 0;

  playlist.items.forEach((trackId, index) => {
    const meta = findTrackMeta(trackId);
    const li = document.createElement('li');

    // Highlight the row if it's loaded on either deck
    const onA = deckA && deckA.currentTrackId === trackId;
    const onB = deckB && deckB.currentTrackId === trackId;
    li.className = 'item-row' +
      (onA ? ' is-current-a' : '') +
      (onB ? ' is-current-b' : '');

    const name = document.createElement('span');
    name.className = 'item-name';
    name.textContent = meta ? displayName(meta) : trackId;
    li.appendChild(name);

    const loadABtn = document.createElement('button');
    loadABtn.textContent = t('playlist.loadOnA');
    loadABtn.title = t('playlist.loadOnA.title');
    loadABtn.className = 'load-deck-a';
    loadABtn.addEventListener('click', () => {
      ensureAudioContext();
      playlist.setCurrentIndex(index);
      loadTrackOnDeck('a', trackId).then(() => renderPlaylist());
    });
    li.appendChild(loadABtn);

    const loadBBtn = document.createElement('button');
    loadBBtn.textContent = t('playlist.loadOnB');
    loadBBtn.title = t('playlist.loadOnB.title');
    loadBBtn.className = 'load-deck-b';
    loadBBtn.addEventListener('click', () => {
      ensureAudioContext();
      playlist.setCurrentIndex(index);
      loadTrackOnDeck('b', trackId).then(() => renderPlaylist());
    });
    li.appendChild(loadBBtn);

    const upBtn = document.createElement('button');
    upBtn.textContent = '↑'; upBtn.title = t('playlist.moveUp');
    upBtn.addEventListener('click', () => { playlist.moveUp(index); renderPlaylist(); });
    li.appendChild(upBtn);

    const downBtn = document.createElement('button');
    downBtn.textContent = '↓'; downBtn.title = t('playlist.moveDown');
    downBtn.addEventListener('click', () => { playlist.moveDown(index); renderPlaylist(); });
    li.appendChild(downBtn);

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✕'; removeBtn.title = t('playlist.remove');
    removeBtn.addEventListener('click', () => { playlist.removeAt(index); renderPlaylist(); });
    li.appendChild(removeBtn);

    // Double-click: load onto the free (non-playing) deck
    li.addEventListener('dblclick', () => {
      ensureAudioContext();
      const target = freeDeckId();
      playlist.setCurrentIndex(index);
      loadTrackOnDeck(target, trackId).then(() => renderPlaylist());
    });

    el.playlistList.appendChild(li);
  });

  if (save) savePlaylistState();
}

el.playlistClear.addEventListener('click', async () => {
  if (playlist.items.length === 0) return;
  const ok = await confirmAction(t('playlist.clearConfirm'));
  if (!ok) return;
  if (deckA) deckA.stop();
  if (deckB) deckB.stop();
  playlist.clear();
  updateDeckUI('a');
  updateDeckUI('b');
  renderPlaylist();
});

// ---- Deck UI helpers ----

function deckEls(id) {
  return id === 'a'
    ? { track: el.deckATrack, fill: el.deckAFill, current: el.deckACurrent,
        duration: el.deckADuration, play: el.deckAPlay }
    : { track: el.deckBTrack, fill: el.deckBFill, current: el.deckBCurrent,
        duration: el.deckBDuration, play: el.deckBPlay };
}

function updateDeckUI(id) {
  const deck = getDeck(id);
  const e    = deckEls(id);
  if (!deck) return;

  const dur  = deck.duration;
  const cur  = deck.currentTime;
  const pct  = dur > 0 ? (cur / dur) * 100 : 0;
  e.fill.style.width    = `${pct}%`;
  e.current.textContent = formatTime(cur);
  e.duration.textContent = formatTime(dur);
  e.play.textContent = deck.isPlaying ? t('deck.pause') : t('deck.play');

  if (deck.currentTrackId) {
    const meta = findTrackMeta(deck.currentTrackId);
    e.track.textContent = meta ? displayName(meta) : deck.trackName || '—';
    e.track.classList.remove('is-empty');
  } else {
    e.track.textContent = t('deck.noTrack');
    e.track.classList.add('is-empty');
  }
}

// ---- Load track onto a specific deck ----

async function loadTrackOnDeck(deckId, trackId) {
  ensureAudioContext();
  const blob = await getTrackBlob(trackId);
  if (!blob) return;
  const meta = findTrackMeta(trackId);
  await getDeck(deckId).load(trackId, blob, meta ? displayName(meta) : '');
  _fadeTriggered[deckId] = false; // reset for new track
  updateDeckUI(deckId);
  renderPlaylist(false);
}

// ---- Track ended handler ----

async function handleTrackEnded(deckId) {
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

// ---- Deck controls ----

function wireDeckControls(id) {
  const skipBtn  = id === 'a' ? el.deckASkip  : el.deckBSkip;
  const stopBtn  = id === 'a' ? el.deckAStop  : el.deckBStop;
  const playBtn  = id === 'a' ? el.deckAPlay  : el.deckBPlay;
  const volSlider = id === 'a' ? el.deckAVolume : el.deckBVolume;
  const progressEl = id === 'a' ? el.deckAProgress : el.deckBProgress;

  playBtn.addEventListener('click', async () => {
    ensureAudioContext();
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
    if (!deckA) return;
    getDeck(id).stop();
    updateDeckUI(id);
  });

  skipBtn.addEventListener('click', async () => {
    ensureAudioContext();
    const nextId = playlist.advance();
    if (nextId) {
      const wasPlaying = getDeck(id).isPlaying;
      await loadTrackOnDeck(id, nextId);
      if (wasPlaying) getDeck(id).play();
      await savePlaylistState();
    }
  });

  volSlider.addEventListener('input', (e) => {
    ensureAudioContext();
    getDeck(id).setVolume(parseFloat(e.target.value));
  });

  progressEl.addEventListener('click', (e) => {
    if (!deckA) return;
    const deck = getDeck(id);
    if (!deck.duration) return;
    const rect  = progressEl.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    deck.seek(ratio * deck.duration);
  });
}

wireDeckControls('a');
wireDeckControls('b');

// ---- Danger zone: reset ----

el.dangerReset.addEventListener('click', async () => {
  const ok = await confirmAction(t('danger.resetConfirm'));
  if (!ok) return;
  el.dangerReset.disabled = true;
  el.dangerReset.textContent = t('danger.resetting');
  if (deckA) deckA.stop();
  if (deckB) deckB.stop();
  try {
    await resetDatabase();
    window.location.reload();
  } catch (err) {
    console.error('Reset failed:', err);
    el.dangerReset.disabled = false;
    el.dangerReset.textContent = t('danger.reset');
    alert(t('common.error'));
  }
});

// ---- Static strings ----

function applyStaticStrings() {
  document.title = t('app.title');
  document.getElementById('library-title').textContent  = t('library.title');
  document.getElementById('playlist-title').textContent = t('playlist.title');
  document.getElementById('danger-title').textContent   = t('danger.title');

  el.infoBtn.textContent = `ℹ v${APP_VERSION}`;
  el.aboutTitle.textContent       = t('about.title');
  el.aboutVersionLine.textContent = `${t('about.version')}: ${APP_VERSION}`;
  el.aboutRepoLink.textContent    = t('about.repo');
  el.aboutClose.textContent       = t('about.close');

  el.libraryImportFolder.textContent  = t('library.import');
  el.libraryImportFiles.textContent   = t('library.importFiles');
  el.libraryEmpty.textContent         = t('library.empty');
  el.libraryNoResults.textContent     = t('library.noResults');
  el.librarySearch.placeholder        = t('library.search');
  el.librarySelectAll.textContent     = t('library.selectAll');
  el.libraryRemoveSelected.textContent = t('library.removeSelected');
  el.libraryClear.textContent         = t('library.clear');

  el.playlistEmpty.textContent  = t('playlist.empty');
  el.playlistClear.textContent  = t('playlist.clear');

  el.deckALabel.textContent = t('deck.a');
  el.deckBLabel.textContent = t('deck.b');

  el.deckAPlay.textContent = t('deck.play');
  el.deckAStop.textContent = t('deck.stop');
  el.deckASkip.textContent = t('deck.skip');
  el.deckBPlay.textContent = t('deck.play');
  el.deckBStop.textContent = t('deck.stop');
  el.deckBSkip.textContent = t('deck.skip');

  el.loopBtn.textContent     = `🔁 ${t('deck.loop')}`;
  el.autoFadeBtn.textContent = `⇌ ${t('crossfader.autoFade')}`;
  el.xfCenterBtn.textContent = t('crossfader.center');
  el.fadeDurationLabel.textContent = t('crossfader.fadeDuration');
  el.xfLabelA.textContent    = t('crossfader.toA');
  el.xfLabelCenter.textContent = t('crossfader.label');
  el.xfLabelB.textContent    = t('crossfader.toB');

  el.dangerReset.textContent  = t('danger.reset');
  el.confirmCancel.textContent = t('common.cancel');
  el.confirmOk.textContent     = t('common.confirm');
}

// ---- Init ----

applyStaticStrings();

(async () => {
  await refreshLibrary();

  const savedLoop = await getSetting('loop');
  if (savedLoop === true) { loopEnabled = true; updateLoopButton(); }

  const savedAutoFade = await getSetting('autoFade');
  if (savedAutoFade === true) { autoFadeEnabled = true; updateAutoFadeButton(); }

  const savedFadeDuration = await getSetting('fadeDuration');
  if (savedFadeDuration !== null) {
    fadeDuration = savedFadeDuration;
    el.fadeDurationSlider.value = String(fadeDuration);
    el.fadeDurationValue.textContent = `${fadeDuration}s`;
  }

  await loadPlaylistState();
  renderPlaylist(false);
})();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.error('SW registration failed:', err);
    });
  });
}
