/**
 * storage.js — IndexedDB persistence for the local music library.
 *
 * Tracks are stored as { id, name, type, size, blob, addedAt }.
 * The blob is the raw audio file data, kept locally so the library
 * survives reloads and works fully offline.
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
 * Store a File object as a track. Returns the stored track record
 * (without the blob, to keep callers lightweight).
 */
async function addTrack(file) {
  const db = await openDb();
  const track = {
    id: generateId(),
    name: file.name,
    type: file.type,
    size: file.size,
    blob: file,
    addedAt: Date.now(),
  };

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRACKS, 'readwrite');
    tx.objectStore(STORE_TRACKS).put(track);
    tx.oncomplete = resolve;
    tx.onerror = (event) => reject(event.target.error);
  });

  const { blob, ...meta } = track;
  return meta;
}

/**
 * List all tracks (metadata only, no blob) ordered by import time.
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

export { addTrack, listTracks, getTrackBlob, deleteTrack };
