/**
 * playlist.js — in-memory playlist ordering and navigation.
 *
 * Holds an ordered list of track ids (referencing tracks in storage.js).
 * Playlist state is persisted to IndexedDB via storage.getSetting/setSetting
 * (implemented in app.js since v0.1.3).
 */

class Playlist {
  constructor() {
    this.items        = []; // array of track ids
    this.currentIndex = -1;
  }

  add(trackId) {
    this.items.push(trackId);
  }

  clear() {
    this.items        = [];
    this.currentIndex = -1;
  }

  removeAt(index) {
    if (index < 0 || index >= this.items.length) return;
    this.items.splice(index, 1);
    if (this.currentIndex > index)       this.currentIndex -= 1;
    else if (this.currentIndex === index) this.currentIndex = -1;
  }

  /**
   * Remove every playlist entry whose track id is in the given set.
   * Used when tracks are deleted from the library so the playlist
   * doesn't keep dangling references.
   */
  removeByTrackIds(trackIds) {
    const idSet          = new Set(trackIds);
    const currentTrackId = this.currentTrackId;
    this.items           = this.items.filter((id) => !idSet.has(id));
    this.currentIndex    = currentTrackId ? this.items.indexOf(currentTrackId) : -1;
  }

  moveUp(index) {
    if (index <= 0 || index >= this.items.length) return;
    this._swap(index, index - 1);
    if      (this.currentIndex === index)     this.currentIndex -= 1;
    else if (this.currentIndex === index - 1) this.currentIndex += 1;
  }

  moveDown(index) {
    if (index < 0 || index >= this.items.length - 1) return;
    this._swap(index, index + 1);
    if      (this.currentIndex === index)     this.currentIndex += 1;
    else if (this.currentIndex === index + 1) this.currentIndex -= 1;
  }

  _swap(i, j) {
    [this.items[i], this.items[j]] = [this.items[j], this.items[i]];
  }

  get currentTrackId() {
    if (this.currentIndex < 0 || this.currentIndex >= this.items.length) return null;
    return this.items[this.currentIndex];
  }

  hasNext() {
    return this.currentIndex + 1 < this.items.length;
  }

  advance() {
    if (this.hasNext()) {
      this.currentIndex += 1;
      return this.currentTrackId;
    }
    return null;
  }

  setCurrentIndex(index) {
    if (index >= 0 && index < this.items.length) this.currentIndex = index;
  }

  /** Peek at the next track id without advancing the index. */
  peekNext() {
    const next = this.currentIndex + 1;
    return next < this.items.length ? this.items[next] : null;
  }
}

export { Playlist };
