import { t } from './i18n.js';
import { addTrack, listTracks, getTrackBlob } from './storage.js';
import { Deck } from './deck.js';
import { Playlist } from './playlist.js';

const playlist = new Playlist();
let library = []; // cached track metadata list

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
  libraryList: document.getElementById('library-list'),
  libraryEmpty: document.getElementById('library-empty'),

  playlistList: document.getElementById('playlist-list'),
  playlistEmpty: document.getElementById('playlist-empty'),

  deckTrackName: document.getElementById('deck-track-name'),
  deckProgress: document.getElementById('deck-progress'),
  deckProgressFill: document.getElementById('deck-progress-fill'),
  deckCurrentTime: document.getElementById('deck-current-time'),
  deckDuration: document.getElementById('deck-duration'),
  playBtn: document.getElementById('deck-play'),
  stopBtn: document.getElementById('deck-stop'),
  volumeSlider: document.getElementById('deck-volume-slider'),
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

// ---- Library ----

async function refreshLibrary() {
  library = await listTracks();
  renderLibrary();
}

function renderLibrary() {
  el.libraryList.innerHTML = '';
  el.libraryEmpty.hidden = library.length > 0;

  for (const track of library) {
    const li = document.createElement('li');
    li.className = 'item-row';

    const name = document.createElement('span');
    name.className = 'item-name';
    name.textContent = displayName(track);
    li.appendChild(name);

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
}

async function importFiles(fileList) {
  const files = Array.from(fileList).filter((f) => f.type.startsWith('audio/'));
  for (const file of files) {
    await addTrack(file);
  }
  await refreshLibrary();
}

el.libraryImportFolder.addEventListener('click', () => el.folderInput.click());
el.libraryImportFiles.addEventListener('click', () => el.fileInput.click());
el.folderInput.addEventListener('change', (e) => importFiles(e.target.files));
el.fileInput.addEventListener('change', (e) => importFiles(e.target.files));

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

el.playBtn.addEventListener('click', async () => {
  if (!deck.currentTrackId) {
    if (!playlist.currentTrackId) {
      playlist.setCurrentIndex(0);
    }
    await loadCurrentTrack();
  }
  if (deck.isPlaying) {
    deck.pause();
  } else {
    deck.play();
  }
  updateDeckProgress();
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

// ---- Init ----

function applyStaticStrings() {
  document.title = t('app.title');
  document.getElementById('library-title').textContent = t('library.title');
  document.getElementById('playlist-title').textContent = t('playlist.title');
  el.libraryImportFolder.textContent = t('library.import');
  el.libraryImportFiles.textContent = t('library.importFiles');
  el.libraryEmpty.textContent = t('library.empty');
  el.playlistEmpty.textContent = t('playlist.empty');
  el.deckTrackName.textContent = t('deck.noTrack');
  el.playBtn.textContent = t('deck.play');
  el.stopBtn.textContent = t('deck.stop');
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
