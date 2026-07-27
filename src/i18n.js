/**
 * i18n.js — minimal string lookup module.
 *
 * Usage: t('deck.play') returns the localized string for the current
 * language. Adding a new language means adding a new key to STRINGS
 * and implementing language detection/selection — no structural changes
 * to the rest of the app are needed.
 *
 * setLanguage() and getLanguage() are intentionally kept but not yet
 * wired to any UI — they are the foundation for future language
 * switching (e.g. German). See roadmap backlog.
 */

const STRINGS = {
  en: {
    'app.title': 'DJWebPlayer',

    'library.title': 'Library',
    'library.import': 'Import folder',
    'library.importFiles': 'Import files',
    'library.empty': 'No tracks imported yet.',
    'library.addToPlaylist': 'Add to playlist',
    'library.search': 'Search library…',
    'library.colName': 'Title',
    'library.colDuration': 'Duration',
    'library.selectAll': 'Select all',
    'library.deselectAll': 'Deselect all',
    'library.removeSelected': 'Remove selected',
    'library.clear': 'Clear library',
    'library.clearConfirm': 'Remove all tracks from the library? This cannot be undone.',
    'library.noResults': 'No tracks match your search.',
    'library.importSkippedDuplicates': 'Skipped {count} duplicate(s) already in the library.',

    'playlist.title': 'Playlist',
    'playlist.loadOnA': 'A',
    'playlist.loadOnB': 'B',
    'playlist.loadOnA.title': 'Load on Deck A',
    'playlist.loadOnB.title': 'Load on Deck B',
    'playlist.empty': 'Playlist is empty. Add tracks from your library.',
    'playlist.remove': 'Remove',
    'playlist.moveUp': 'Move up',
    'playlist.moveDown': 'Move down',
    'playlist.nowPlaying': 'Now playing', // reserved for future status display
    'playlist.clear': 'Clear playlist',
    'playlist.clearConfirm': 'Remove all tracks from the playlist? This cannot be undone.',

    'deck.a': 'Deck A',
    'deck.b': 'Deck B',
    'deck.play': 'Play',
    'deck.pause': 'Pause',
    'deck.stop': 'Stop',
    'deck.skip': 'Skip',
    'deck.loop': 'Loop',
    'deck.noTrack': 'No track loaded',
    'deck.rate': 'Speed',
    'deck.rateReset': 'Reset speed',
    'deck.decouple': 'Decouple',
    'deck.pitch': 'Pitch',
    'deck.pitchReset': 'Reset pitch',

    'crossfader.label': 'Crossfader',
    'crossfader.toA': '← A',
    'crossfader.toB': 'B →',
    'crossfader.center': 'Center',
    'crossfader.autoFade': 'Auto-fade',
    'crossfader.fadeDuration': 'Fade',

    'about.title': 'About',
    'about.version': 'Version',
    'about.repo': 'Source code on GitHub',
    'about.privacy': 'Privacy: all data stays on this device. Nothing is sent to any server.',
    'about.storage': 'Local storage: imported music, playlist, and settings (IndexedDB).',
    'about.close': 'Close',

    'danger.title': 'Danger zone',
    'danger.reset': 'Reset app',
    'danger.resetConfirm': 'This will permanently delete your entire library, playlist, and all app data, then reload the app. This cannot be undone. Continue?',
    'danger.resetting': 'Resetting…',

    'common.loading': 'Loading…', // reserved for future import progress display
    'common.error': 'Something went wrong',
    'common.cancel': 'Cancel',
    'common.confirm': 'Confirm',
  },
};

let currentLang = 'en';

/**
 * Translate a key for the current language, falling back to English,
 * then to the key itself if nothing is found. Optional params object
 * substitutes {placeholder} tokens in the string, e.g.
 * t('library.importSkippedDuplicates', { count: 3 }).
 */
function t(key, params) {
  const table = STRINGS[currentLang] || STRINGS.en;
  let str = table[key] !== undefined ? table[key] : STRINGS.en[key];
  if (str === undefined) return key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(`{${k}}`, v);
    }
  }
  return str;
}

/**
 * Switch the active language. No-op if the language has no entry in
 * STRINGS. Wire this to a settings UI when adding language support.
 */
function setLanguage(lang) {
  if (STRINGS[lang]) currentLang = lang;
}

/** Returns the currently active language code (e.g. 'en'). */
function getLanguage() {
  return currentLang;
}

export { t, setLanguage, getLanguage };
