/**
 * ui.js — all DOM rendering and UI update functions.
 *
 * Receives state by reference (library, playlist, deck instances) via
 * the `init()` call from app.js. No audio logic lives here.
 */

import { t } from './i18n.js';

// State references set by init()
let _library    = null;
let _playlist   = null;
let _getDeck    = null;
let _el         = null;
let _getState   = null; // () => { autoFadeEnabled, fadeDuration, loopEnabled }
let _onAction   = null; // { onLibraryAction, onPlaylistAction, onDeckAction }

export function init(refs) {
  _library   = refs.library;
  _playlist  = refs.playlist;
  _getDeck   = refs.getDeck;
  _el        = refs.el;
  _getState  = refs.getState;
  _onAction  = refs.onAction;
}

// ---- Helpers ----

export function formatTime(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export function displayName(track) {
  return track.name.replace(/\.[^/.]+$/, '');
}

function findTrackMeta(trackId) {
  return _library.find((tr) => tr.id === trackId);
}

// ---- Deck UI ----

export function deckEls(id) {
  return id === 'a'
    ? { track: _el.deckATrack, fill: _el.deckAFill, current: _el.deckACurrent,
        duration: _el.deckADuration, play: _el.deckAPlay, marker: _el.deckAMarker }
    : { track: _el.deckBTrack, fill: _el.deckBFill, current: _el.deckBCurrent,
        duration: _el.deckBDuration, play: _el.deckBPlay, marker: _el.deckBMarker };
}

export function updateDeckUI(id) {
  const deck = _getDeck(id);
  const e    = deckEls(id);
  if (!deck) return;

  const { autoFadeEnabled, fadeDuration } = _getState();
  const dur = deck.duration;
  const cur = deck.currentTime;  // Buffer-seconds = timecode
  const pct = dur > 0 ? (cur / dur) * 100 : 0;

  e.fill.style.width     = `${pct}%`;
  e.current.textContent  = formatTime(cur);
  e.duration.textContent = formatTime(dur);
  e.play.textContent     = deck.isPlaying ? t('deck.pause') : t('deck.play');

  // Fade marker in timecode-seconds: fadeDuration timecode-seconds before end.
  // At 1.2× this means the fade starts slightly earlier in real time, which
  // is acceptable (Option A: consistent timecode throughout).
  if (autoFadeEnabled && dur > 0 && fadeDuration > 0) {
    const markerPct     = (Math.max(0, dur - fadeDuration) / dur) * 100;
    e.marker.style.left = `${markerPct}%`;
    e.marker.hidden     = false;
  } else {
    e.marker.hidden = true;
  }

  if (deck.currentTrackId) {
    const meta = findTrackMeta(deck.currentTrackId);
    e.track.textContent = meta ? displayName(meta) : deck.trackName || '—';
    e.track.classList.remove('is-empty');
  } else {
    e.track.textContent = t('deck.noTrack');
    e.track.classList.add('is-empty');
  }
}

// ---- Library ----

export function updateSortHeaders(sortKey, sortAsc) {
  const arrow = sortAsc ? ' ▲' : ' ▼';
  _el.thName.textContent     = t('library.colName')     + (sortKey === 'name'     ? arrow : '');
  _el.thDuration.textContent = t('library.colDuration') + (sortKey === 'duration' ? arrow : '');
  _el.thName.classList.toggle('is-sorted', sortKey === 'name');
  _el.thDuration.classList.toggle('is-sorted', sortKey === 'duration');
}

export function updateBulkBar(selectedIds, visibleTracks) {
  _el.libraryRemoveSelected.disabled = selectedIds.size === 0;
  const allSelected = visibleTracks.length > 0 &&
    visibleTracks.every((tr) => selectedIds.has(tr.id));
  _el.librarySelectAll.textContent = allSelected
    ? t('library.deselectAll') : t('library.selectAll');
  if (_el.libraryCheckAll) _el.libraryCheckAll.checked = allSelected;
}

export function renderLibrary(visibleTracks, selectedIds, sortKey, sortAsc) {
  _el.libraryTbody.innerHTML    = '';
  _el.libraryEmpty.hidden       = _library.length > 0;
  _el.libraryNoResults.hidden   = !(_library.length > 0 && visibleTracks.length === 0);
  updateSortHeaders(sortKey, sortAsc);

  for (const track of visibleTracks) {
    const tr = document.createElement('tr');
    if (selectedIds.has(track.id)) tr.classList.add('is-selected');

    const tdCheck = document.createElement('td');
    tdCheck.className = 'col-check';
    const cb = document.createElement('input');
    cb.type    = 'checkbox';
    cb.checked = selectedIds.has(track.id);
    cb.addEventListener('change', () => _onAction.onLibraryCheckbox(track.id, cb.checked));
    tdCheck.appendChild(cb);
    tr.appendChild(tdCheck);

    const tdName = document.createElement('td');
    tdName.className = 'col-name';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = displayName(track);
    tdName.appendChild(nameSpan);
    tr.appendChild(tdName);

    const tdDur = document.createElement('td');
    tdDur.className   = 'col-duration';
    tdDur.textContent = track.duration ? formatTime(track.duration) : '—';
    tr.appendChild(tdDur);

    const tdBtn = document.createElement('td');
    tdBtn.className = 'col-actions';
    const addBtn = document.createElement('button');
    addBtn.textContent = '+';
    addBtn.title = t('library.addToPlaylist');
    addBtn.addEventListener('click', () => _onAction.onAddToPlaylist(track.id));
    tdBtn.appendChild(addBtn);
    tr.appendChild(tdBtn);

    _el.libraryTbody.appendChild(tr);
  }
  updateBulkBar(selectedIds, visibleTracks);
}

// ---- Playlist ----

export function renderPlaylist(playlist, deckA, deckB, save = true) {
  _el.playlistList.innerHTML  = '';
  _el.playlistEmpty.hidden    = playlist.items.length > 0;

  playlist.items.forEach((trackId, index) => {
    const meta = findTrackMeta(trackId);
    const onA  = deckA && deckA.currentTrackId === trackId;
    const onB  = deckB && deckB.currentTrackId === trackId;

    const li = document.createElement('li');
    li.className = 'item-row' +
      (onA ? ' is-current-a' : '') +
      (onB ? ' is-current-b' : '');

    const name = document.createElement('span');
    name.className   = 'item-name';
    name.textContent = meta ? displayName(meta) : trackId;
    li.appendChild(name);

    const loadA = document.createElement('button');
    loadA.textContent = t('playlist.loadOnA');
    loadA.title       = t('playlist.loadOnA.title');
    loadA.className   = 'load-deck-a';
    loadA.addEventListener('click', () => _onAction.onLoadOnDeck('a', trackId, index));
    li.appendChild(loadA);

    const loadB = document.createElement('button');
    loadB.textContent = t('playlist.loadOnB');
    loadB.title       = t('playlist.loadOnB.title');
    loadB.className   = 'load-deck-b';
    loadB.addEventListener('click', () => _onAction.onLoadOnDeck('b', trackId, index));
    li.appendChild(loadB);

    const upBtn = document.createElement('button');
    upBtn.textContent = '↑'; upBtn.title = t('playlist.moveUp');
    upBtn.addEventListener('click', () => _onAction.onPlaylistMove(index, -1));
    li.appendChild(upBtn);

    const downBtn = document.createElement('button');
    downBtn.textContent = '↓'; downBtn.title = t('playlist.moveDown');
    downBtn.addEventListener('click', () => _onAction.onPlaylistMove(index, 1));
    li.appendChild(downBtn);

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✕'; removeBtn.title = t('playlist.remove');
    removeBtn.addEventListener('click', () => _onAction.onPlaylistRemove(index));
    li.appendChild(removeBtn);

    li.addEventListener('dblclick', () => _onAction.onPlaylistDblClick(trackId, index));
    _el.playlistList.appendChild(li);
  });

  if (save) _onAction.onSavePlaylist();
}

// ---- Drawer ----

export function openDrawer(el) {
  el.libraryDrawer.classList.add('is-open');
  el.drawerOverlay.hidden = false;
  el.libraryDrawer.setAttribute('aria-hidden', 'false');
  el.drawerClose.focus();
}

export function closeDrawer(el) {
  el.libraryDrawer.classList.remove('is-open');
  el.drawerOverlay.hidden = true;
  el.libraryDrawer.setAttribute('aria-hidden', 'true');
  el.burgerBtn.focus();
}

// ---- Confirm dialog ----

export function confirmAction(el, message) {
  return new Promise((resolve) => {
    el.confirmMessage.textContent = message;
    el.confirmOverlay.hidden      = false;
    const cleanup = (result) => {
      el.confirmOverlay.hidden = true;
      el.confirmOk.removeEventListener('click', onOk);
      el.confirmCancel.removeEventListener('click', onCancel);
      resolve(result);
    };
    const onOk     = () => cleanup(true);
    const onCancel = () => cleanup(false);
    el.confirmOk.addEventListener('click', onOk);
    el.confirmCancel.addEventListener('click', onCancel);
  });
}

// ---- Static strings ----

export function applyStaticStrings(APP_VERSION, el) {
  document.title = t('app.title');
  document.getElementById('library-title').textContent  = t('library.title');
  document.getElementById('playlist-title').textContent = t('playlist.title');
  document.getElementById('danger-title').textContent   = t('danger.title');

  el.infoBtn.textContent          = `ℹ v${APP_VERSION}`;
  el.aboutTitle.textContent       = t('about.title');
  el.aboutVersionLine.textContent = `${t('about.version')}: ${APP_VERSION}`;
  el.aboutRepoLink.textContent    = t('about.repo');
  document.getElementById('about-privacy').textContent = t('about.privacy');
  document.getElementById('about-storage').textContent = t('about.storage');
  el.aboutClose.textContent       = t('about.close');

  el.libraryImportFolder.textContent   = t('library.import');
  el.libraryImportFiles.textContent    = t('library.importFiles');
  el.libraryEmpty.textContent          = t('library.empty');
  el.libraryNoResults.textContent      = t('library.noResults');
  el.librarySearch.placeholder         = t('library.search');
  el.librarySelectAll.textContent      = t('library.selectAll');
  el.libraryRemoveSelected.textContent = t('library.removeSelected');
  el.libraryClear.textContent          = t('library.clear');

  el.playlistEmpty.textContent = t('playlist.empty');
  el.playlistClear.textContent = t('playlist.clear');

  el.deckALabel.textContent = t('deck.a');
  el.deckBLabel.textContent = t('deck.b');
  el.deckAPlay.textContent  = t('deck.play');
  el.deckAStop.textContent  = t('deck.stop');
  el.deckASkip.textContent  = t('deck.skip');
  el.deckBPlay.textContent  = t('deck.play');
  el.deckBStop.textContent  = t('deck.stop');
  el.deckBSkip.textContent  = t('deck.skip');

  // Rate labels — set via app.js refs since ui.js doesn't hold them
  const rateLabel = t('deck.rate');
  const rateResetTitle = t('deck.rateReset');
  for (const id of ['a', 'b']) {
    const labelEl = document.getElementById(`deck-${id}-rate-label`);
    const resetEl = document.getElementById(`deck-${id}-rate-reset`);
    if (labelEl) labelEl.textContent = rateLabel;
    if (resetEl) resetEl.title = rateResetTitle;
  }

  el.loopBtn.textContent         = `🔁 ${t('deck.loop')}`;
  el.autoFadeBtn.textContent     = `⇌ ${t('crossfader.autoFade')}`;
  el.xfCenterBtn.textContent     = t('crossfader.center');
  el.fadeDurationLabel.textContent = t('crossfader.fadeDuration');
  el.xfLabelA.textContent        = t('crossfader.toA');
  el.xfLabelCenter.textContent   = t('crossfader.label');
  el.xfLabelB.textContent        = t('crossfader.toB');

  el.dangerReset.textContent   = t('danger.reset');
  el.confirmCancel.textContent = t('common.cancel');
  el.confirmOk.textContent     = t('common.confirm');
}
