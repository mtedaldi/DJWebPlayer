/**
 * playlist.js — in-memory playlist ordering and navigation.
 *
 * Holds an ordered list of track ids (referencing tracks in storage.js).
 * Persistence of the playlist itself across reloads is not in scope for
 * v0.1 — only the imported library persists. See roadmap.md.
 */

class Playlist {
  constructor() {
    this.items = []; // array of track ids
    this.currentIndex = -1;
  }

  add(trackId) {
    this.items.push(trackId);
  }

  removeAt(index) {
    if (index < 0 || index >= this.items.length) return;
    this.items.splice(index, 1);
    if (this.currentIndex > index) {
      this.currentIndex -= 1;
    } else if (this.currentIndex === index) {
      this.currentIndex = -1;
    }
  }

  moveUp(index) {
    if (index <= 0 || index >= this.items.length) return;
    this._swap(index, index - 1);
    if (this.currentIndex === index) this.currentIndex -= 1;
    else if (this.currentIndex === index - 1) this.currentIndex += 1;
  }

  moveDown(index) {
    if (index < 0 || index >= this.items.length - 1) return;
    this._swap(index, index + 1);
    if (this.currentIndex === index) this.currentIndex += 1;
    else if (this.currentIndex === index + 1) this.currentIndex -= 1;
  }

  _swap(i, j) {
    [this.items[i], this.items[j]] = [this.items[j], this.items[i]];
  }

  get currentTrackId() {
    if (this.currentIndex < 0 || this.currentIndex >= this.items.length) {
      return null;
    }
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

  /**
   * Set the current index directly, e.g. when the user picks a track.
   */
  setCurrentIndex(index) {
    if (index >= 0 && index < this.items.length) {
      this.currentIndex = index;
    }
  }
}

export { Playlist };
