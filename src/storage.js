/**
 * storage.js — IndexedDB persistence for the local music library.
 *
 * Tracks are stored as { id, name, type, size, duration, addedAt, blob }.
 * The blob is the raw audio file data, kept locally so the library
 * survives reloads and works fully offline.
 *
 * Duplicate detection (FR-1.9) uses filename + size as a fast heuristic,
 * not a content hash. Matching files are silently skipped on import.
 */

const DB_NAME = 'djwebplayer';
const DB_VERSION = 1;
const STORE_TRACKS = 'tracks';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_TRACKS)) {
        const store = db.createObjectStore(STORE_TRACKS, { keyPath: 'id' });
        store.createIndex('addedAt', 'addedAt', { unique: false });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });

  return dbPromise;
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Read the duration (in seconds) of an audio Blob by loading it into a
 * detached <audio> element. Resolves to 0 if duration can't be read
 * (e.g. corrupt file) rather than rejecting, so import never blocks on
 * a single bad file.
 */
function readDuration(blob) {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(blob);
    const cleanup = () => URL.revokeObjectURL(url);

    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', () => {
      const duration = isFinite(audio.duration) ? audio.duration : 0;
      cleanup();
      resolve(duration);
    });
    audio.addEventListener('error', () => {
      cleanup();
      resolve(0);
    });
    audio.src = url;
  });
}

/**
 * Check whether a track matching this filename + size already exists.
 * Fast heuristic per FR-1.9 — not a content hash.
 */
async function findDuplicate(file) {
  const existing = await listTracks();
  return existing.find((t) => t.name === file.name && t.size === file.size) || null;
}

/**
 * Store a File object as a track, unless a duplicate (by name + size)
 * already exists, in which case it's silently skipped.
 *
 * Returns { track, skipped } where track is the stored metadata (or the
 * existing duplicate's metadata if skipped).
 */
async function addTrack(file) {
  const duplicate = await findDuplicate(file);
  if (duplicate) {
    return { track: duplicate, skipped: true };
  }

  const duration = await readDuration(file);
  const db = await openDb();
  const track = {
    id: generateId(),
    name: file.name,
    type: file.type,
    size: file.size,
    duration,
    addedAt: Date.now(),
    blob: file,
  };

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRACKS, 'readwrite');
    tx.objectStore(STORE_TRACKS).put(track);
    tx.oncomplete = resolve;
    tx.onerror = (event) => reject(event.target.error);
  });

  const { blob, ...meta } = track;
  return { track: meta, skipped: false };
}

/**
 * List all tracks (metadata only, no blob) ordered by import time.
 * Use sortTracks() to apply a different order for display.
 */
async function listTracks() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRACKS, 'readonly');
    const store = tx.objectStore(STORE_TRACKS);
    const request = store.getAll();
    request.onsuccess = () => {
      const tracks = request.result
        .sort((a, b) => a.addedAt - b.addedAt)
        .map(({ blob, ...meta }) => meta);
      resolve(tracks);
    };
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Get the playable Blob for a track by id.
 */
async function getTrackBlob(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRACKS, 'readonly');
    const request = tx.objectStore(STORE_TRACKS).get(id);
    request.onsuccess = () => resolve(request.result ? request.result.blob : null);
    request.onerror = (event) => reject(event.target.error);
  });
}

async function deleteTrack(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRACKS, 'readwrite');
    tx.objectStore(STORE_TRACKS).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Delete multiple tracks at once (FR-1.7), in a single transaction.
 */
async function deleteTracks(ids) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRACKS, 'readwrite');
    const store = tx.objectStore(STORE_TRACKS);
    for (const id of ids) {
      store.delete(id);
    }
    tx.oncomplete = resolve;
    tx.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Clear the entire library (FR-1.8). Caller is responsible for
 * confirming with the user first.
 */
async function clearLibrary() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRACKS, 'readwrite');
    tx.objectStore(STORE_TRACKS).clear();
    tx.oncomplete = resolve;
    tx.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Full app reset (FR-9.1): deletes the entire IndexedDB database.
 * Caller is responsible for confirming with the user first, and for
 * reloading/reinitializing the app afterwards.
 */
async function resetDatabase() {
  // Close the cached connection first, otherwise deleteDatabase blocks.
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.error);
    request.onblocked = () => resolve(); // best effort; will retry on next open
  });
}

export {
  addTrack,
  listTracks,
  getTrackBlob,
  deleteTrack,
  deleteTracks,
  clearLibrary,
  resetDatabase,
};
