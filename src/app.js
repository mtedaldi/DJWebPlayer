import { t } from './i18n.js';
import {
  addTrack,
  listTracks,
  getTrackBlob,
  deleteTracks,
  clearLibrary,
  resetDatabase,
} from './storage.js';
import { Deck } from './deck.js';
import { Playlist } from './playlist.js';

const playlist = new Playlist();
let library = []; // cached track metadata list, unsorted/unfiltered (source of truth)
let librarySearchTerm = '';
let librarySortKey = 'addedAt';
const selectedLibraryIds = new Set();

const deck = new Deck({
  onEnded: handleTrackEnded,
  onTimeUpdate: updateDeckProgress,
  onLoaded: updateDeckProgress,
});

// ---- DOM refs ----

const el = {
  libraryImportFolder: document.getElementById('library-import-folder'),
  libraryImportFiles: document.getElementById('library-import-files'),
  folderInput: document.getElementById('folder-input'),
  fileInput: document.getElementById('file-input'),
  librarySearch: document.getElementById('library-search'),
  librarySort: document.getElementById('library-sort'),
  librarySelectAll: document.getElementById('library-select-all'),
  libraryRemoveSelected: document.getElementById('library-remove-selected'),
  libraryClear: document.getElementById('library-clear'),
  libraryList: document.getElementById('library-list'),
  libraryEmpty: document.getElementById('library-empty'),
  libraryNoResults: document.getElementById('library-no-results'),

  playlistClear: document.getElementById('playlist-clear'),
  playlistList: document.getElementById('playlist-list'),
  playlistEmpty: document.getElementById('playlist-empty'),

  deckTrackName: document.getElementById('deck-track-name'),
  deckProgress: document.getElementById('deck-progress'),
  deckProgressFill: document.getElementById('deck-progress-fill'),
  deckCurrentTime: document.getElementById('deck-current-time'),
  deckDuration: document.getElementById('deck-duration'),
  playBtn: document.getElementById('deck-play'),
  stopBtn: document.getElementById('deck-stop'),
  skipBtn: document.getElementById('deck-skip'),
  volumeSlider: document.getElementById('deck-volume-slider'),

  dangerReset: document.getElementById('danger-reset'),

  confirmOverlay: document.getElementById('confirm-overlay'),
  confirmMessage: document.getElementById('confirm-message'),
  confirmCancel: document.getElementById('confirm-cancel'),
  confirmOk: document.getElementById('confirm-ok'),
};

// ---- Formatting helpers ----

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function displayName(track) {
  return track.name.replace(/\.[^/.]+$/, '');
}

// ---- Confirmation dialog ----
// A themed in-app overlay instead of window.confirm(), so it matches the
// dark UI and works well on tablets.

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

// ---- Library ----

async function refreshLibrary() {
  library = await listTracks();
  renderLibrary();
}

function getVisibleTracks() {
  const term = librarySearchTerm.trim().toLowerCase();
  let tracks = library;

  if (term) {
    tracks = tracks.filter((track) => displayName(track).toLowerCase().includes(term));
  }

  const sorted = [...tracks];
  switch (librarySortKey) {
    case 'name':
      sorted.sort((a, b) => displayName(a).localeCompare(displayName(b)));
      break;
    case 'duration':
      sorted.sort((a, b) => (a.duration || 0) - (b.duration || 0));
      break;
    case 'addedAt':
    default:
      sorted.sort((a, b) => a.addedAt - b.addedAt);
      break;
  }
  return sorted;
}

function updateBulkBar() {
  el.libraryRemoveSelected.disabled = selectedLibraryIds.size === 0;
  el.librarySelectAll.textContent =
    selectedLibraryIds.size > 0 && selectedLibraryIds.size === getVisibleTracks().length
      ? t('library.deselectAll')
      : t('library.selectAll');
}

function renderLibrary() {
  const visible = getVisibleTracks();

  el.libraryList.innerHTML = '';
  el.libraryEmpty.hidden = library.length > 0;
  el.libraryNoResults.hidden = !(library.length > 0 && visible.length === 0);

  for (const track of visible) {
    const li = document.createElement('li');
    li.className = 'item-row' + (selectedLibraryIds.has(track.id) ? ' is-selected' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedLibraryIds.has(track.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedLibraryIds.add(track.id);
      } else {
        selectedLibraryIds.delete(track.id);
      }
      renderLibrary();
    });
    li.appendChild(checkbox);

    const name = document.createElement('span');
    name.className = 'item-name';
    name.textContent = displayName(track);
    li.appendChild(name);

    if (track.duration) {
      const duration = document.createElement('span');
      duration.className = 'item-duration';
      duration.textContent = formatTime(track.duration);
      li.appendChild(duration);
    }

    const addBtn = document.createElement('button');
    addBtn.textContent = '+';
    addBtn.title = t('library.addToPlaylist');
    addBtn.addEventListener('click', () => {
      playlist.add(track.id);
      renderPlaylist();
    });
    li.appendChild(addBtn);

    el.libraryList.appendChild(li);
  }

  updateBulkBar();
}

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.oga', '.flac', '.m4a', '.aac', '.weba', '.opus'];

function looksLikeAudio(file) {
  if (file.type && file.type.startsWith('audio/')) return true;
  const lowerName = file.name.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

async function importFiles(fileList) {
  const files = Array.from(fileList).filter(looksLikeAudio);
  let skippedCount = 0;

  for (const file of files) {
    const { skipped } = await addTrack(file);
    if (skipped) skippedCount += 1;
  }

  await refreshLibrary();

  if (skippedCount > 0) {
    // Lightweight, non-blocking notice; doesn't interrupt the import flow.
    console.info(t('library.importSkippedDuplicates', { count: skippedCount }));
  }
}

el.libraryImportFolder.addEventListener('click', () => el.folderInput.click());
el.libraryImportFiles.addEventListener('click', () => el.fileInput.click());
el.folderInput.addEventListener('change', (e) => importFiles(e.target.files));
el.fileInput.addEventListener('change', (e) => importFiles(e.target.files));

el.librarySearch.addEventListener('input', (e) => {
  librarySearchTerm = e.target.value;
  renderLibrary();
});

el.librarySort.addEventListener('change', (e) => {
  librarySortKey = e.target.value;
  renderLibrary();
});

el.librarySelectAll.addEventListener('click', () => {
  const visibleIds = getVisibleTracks().map((t2) => t2.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedLibraryIds.has(id));
  if (allSelected) {
    for (const id of visibleIds) selectedLibraryIds.delete(id);
  } else {
    for (const id of visibleIds) selectedLibraryIds.add(id);
  }
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
  playlist.removeByTrackIds(library.map((t2) => t2.id));
  selectedLibraryIds.clear();
  await refreshLibrary();
  renderPlaylist();
});

// ---- Playlist ----

function findTrackMeta(trackId) {
  return library.find((t2) => t2.id === trackId);
}

function renderPlaylist() {
  el.playlistList.innerHTML = '';
  el.playlistEmpty.hidden = playlist.items.length > 0;

  playlist.items.forEach((trackId, index) => {
    const meta = findTrackMeta(trackId);
    const li = document.createElement('li');
    li.className = 'item-row' + (index === playlist.currentIndex ? ' is-current' : '');

    const name = document.createElement('span');
    name.className = 'item-name';
    name.textContent = meta ? displayName(meta) : trackId;
    li.appendChild(name);

    const upBtn = document.createElement('button');
    upBtn.textContent = '↑';
    upBtn.title = t('playlist.moveUp');
    upBtn.addEventListener('click', () => {
      playlist.moveUp(index);
      renderPlaylist();
    });
    li.appendChild(upBtn);

    const downBtn = document.createElement('button');
    downBtn.textContent = '↓';
    downBtn.title = t('playlist.moveDown');
    downBtn.addEventListener('click', () => {
      playlist.moveDown(index);
      renderPlaylist();
    });
    li.appendChild(downBtn);

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✕';
    removeBtn.title = t('playlist.remove');
    removeBtn.addEventListener('click', () => {
      playlist.removeAt(index);
      renderPlaylist();
    });
    li.appendChild(removeBtn);

    li.addEventListener('dblclick', () => {
      playlist.setCurrentIndex(index);
      loadCurrentTrack().then(() => deck.play());
    });

    el.playlistList.appendChild(li);
  });
}

el.playlistClear.addEventListener('click', async () => {
  if (playlist.items.length === 0) return;
  const ok = await confirmAction(t('playlist.clearConfirm'));
  if (!ok) return;
  deck.stop();
  playlist.clear();
  el.deckTrackName.textContent = t('deck.noTrack');
  el.deckTrackName.classList.add('is-empty');
  updateDeckProgress();
  renderPlaylist();
});

// ---- Deck ----

async function loadCurrentTrack() {
  const trackId = playlist.currentTrackId;
  if (!trackId) return;
  const blob = await getTrackBlob(trackId);
  if (!blob) return;
  deck.load(trackId, blob);
  const meta = findTrackMeta(trackId);
  el.deckTrackName.textContent = meta ? displayName(meta) : t('deck.noTrack');
  el.deckTrackName.classList.remove('is-empty');
  renderPlaylist();
}

function updateDeckProgress() {
  const duration = deck.duration;
  const current = deck.currentTime;
  const pct = duration > 0 ? (current / duration) * 100 : 0;
  el.deckProgressFill.style.width = `${pct}%`;
  el.deckCurrentTime.textContent = formatTime(current);
  el.deckDuration.textContent = formatTime(duration);
  el.playBtn.textContent = deck.isPlaying ? t('deck.pause') : t('deck.play');
}

async function handleTrackEnded() {
  const nextId = playlist.advance();
  if (nextId) {
    await loadCurrentTrack();
    deck.play();
  } else {
    updateDeckProgress();
  }
}

async function skipToNext() {
  const nextId = playlist.advance();
  if (nextId) {
    const wasPlaying = deck.isPlaying;
    await loadCurrentTrack();
    if (wasPlaying) deck.play();
    updateDeckProgress();
  }
}

el.playBtn.addEventListener('click', async () => {
  // Load a track if none is loaded yet, or if the playlist's current
  // selection has moved on (e.g. via double-click or skip) without the
  // deck following it.
  if (!deck.currentTrackId || deck.currentTrackId !== playlist.currentTrackId) {
    if (!playlist.currentTrackId) {
      playlist.setCurrentIndex(0);
    }
    await loadCurrentTrack();
    deck.play();
    updateDeckProgress();
    return;
  }
  if (deck.isPlaying) {
    deck.pause();
  } else {
    deck.play();
  }
  updateDeckProgress();
});

el.skipBtn.addEventListener('click', () => {
  skipToNext();
});

el.stopBtn.addEventListener('click', () => {
  deck.stop();
  updateDeckProgress();
});

el.deckProgress.addEventListener('click', (e) => {
  if (!deck.duration) return;
  const rect = el.deckProgress.getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  deck.seek(ratio * deck.duration);
});

el.volumeSlider.addEventListener('input', (e) => {
  deck.setVolume(parseFloat(e.target.value));
});

// ---- Danger zone: full app reset ----

el.dangerReset.addEventListener('click', async () => {
  const ok = await confirmAction(t('danger.resetConfirm'));
  if (!ok) return;
  el.dangerReset.disabled = true;
  el.dangerReset.textContent = t('danger.resetting');
  deck.stop();
  try {
    await resetDatabase();
    // A full reload re-initializes everything cleanly, including any
    // service-worker-cached shell, rather than trying to reset in-memory
    // state piecemeal.
    window.location.reload();
  } catch (err) {
    console.error('Reset failed:', err);
    el.dangerReset.disabled = false;
    el.dangerReset.textContent = t('danger.reset');
    alert(t('common.error'));
  }
});

// ---- Init ----

function applyStaticStrings() {
  document.title = t('app.title');
  document.getElementById('library-title').textContent = t('library.title');
  document.getElementById('playlist-title').textContent = t('playlist.title');
  document.getElementById('danger-title').textContent = t('danger.title');

  el.libraryImportFolder.textContent = t('library.import');
  el.libraryImportFiles.textContent = t('library.importFiles');
  el.libraryEmpty.textContent = t('library.empty');
  el.libraryNoResults.textContent = t('library.noResults');
  el.librarySearch.placeholder = t('library.search');
  el.librarySelectAll.textContent = t('library.selectAll');
  el.libraryRemoveSelected.textContent = t('library.removeSelected');
  el.libraryClear.textContent = t('library.clear');

  for (const option of el.librarySort.options) {
    if (option.value === 'addedAt') option.textContent = t('library.sortDate');
    else if (option.value === 'name') option.textContent = t('library.sortName');
    else if (option.value === 'duration') option.textContent = t('library.sortDuration');
  }

  el.playlistEmpty.textContent = t('playlist.empty');
  el.playlistClear.textContent = t('playlist.clear');

  el.deckTrackName.textContent = t('deck.noTrack');
  el.playBtn.textContent = t('deck.play');
  el.stopBtn.textContent = t('deck.stop');
  el.skipBtn.textContent = t('deck.skip');

  el.dangerReset.textContent = t('danger.reset');
  el.confirmCancel.textContent = t('common.cancel');
  el.confirmOk.textContent = t('common.confirm');
}

applyStaticStrings();
refreshLibrary();
deck.setVolume(parseFloat(el.volumeSlider.value));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  });
}
