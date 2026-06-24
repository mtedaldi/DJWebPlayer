/**
 * i18n.js — minimal string lookup module.
 *
 * Usage: t('deck.play') returns the localized string for the current
 * language. Adding a new language means adding a new key to STRINGS
 * and implementing language detection/selection — no structural changes
 * to the rest of the app are needed.
 */

const STRINGS = {
  en: {
    'app.title': 'DJWebPlayer',

    'library.title': 'Library',
    'library.import': 'Import folder',
    'library.importFiles': 'Import files',
    'library.empty': 'No tracks imported yet.',
    'library.addToPlaylist': 'Add to playlist',

    'playlist.title': 'Playlist',
    'playlist.empty': 'Playlist is empty. Add tracks from your library.',
    'playlist.remove': 'Remove',
    'playlist.moveUp': 'Move up',
    'playlist.moveDown': 'Move down',
    'playlist.nowPlaying': 'Now playing',

    'deck.play': 'Play',
    'deck.pause': 'Pause',
    'deck.stop': 'Stop',
    'deck.noTrack': 'No track loaded',
    'deck.volume': 'Volume',

    'common.loading': 'Loading…',
    'common.error': 'Something went wrong',
  },
};

let currentLang = 'en';

/**
 * Translate a key for the current language, falling back to English,
 * then to the key itself if nothing is found.
 */
function t(key) {
  const table = STRINGS[currentLang] || STRINGS.en;
  if (table[key] !== undefined) return table[key];
  if (STRINGS.en[key] !== undefined) return STRINGS.en[key];
  return key;
}

function setLanguage(lang) {
  if (STRINGS[lang]) {
    currentLang = lang;
  }
}

function getLanguage() {
  return currentLang;
}

export { t, setLanguage, getLanguage };
