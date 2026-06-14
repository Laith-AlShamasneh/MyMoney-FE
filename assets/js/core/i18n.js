/**
 * core/i18n.js — MyMoney
 *
 * Localization engine.
 *
 * - Loads JSON translation files from /assets/locales/{lang}.json
 * - Provides t(key) for use in JavaScript
 * - Applies translations to DOM elements via data-i18n attributes
 * - Manages document direction (dir="rtl" / dir="ltr")
 * - Persists language choice to localStorage
 * - Loads rtl.css dynamically for Arabic
 * - Caches locale files in localStorage so subsequent page loads apply
 *   translations synchronously (zero-latency, no network round-trip needed)
 * - Reveals page content only after the correct translations are in place
 *   (the inline <head> script hides the body via html.mm-init; we remove it)
 */

import { Config } from './config.js';

const RTL_LANGUAGES    = ['ar'];
const CSS_RTL_ID       = 'mm-rtl-stylesheet';
const LOCALE_CACHE_PRE = 'mm.locale.';
const LOCALE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

let _translations = {};
let _currentLang  = Config.DEFAULT_LANGUAGE;

/* --------------------------------------------------------------------------
   Public API
   -------------------------------------------------------------------------- */

/**
 * Initialise i18n — call once per page before touching any t() calls.
 * Uses cached translations when available so the page can be revealed
 * without waiting for a network round-trip.
 * @param {string} [lang] - Explicit language code. Falls back to stored or default.
 */
export async function initI18n(lang) {
  const stored = _getStoredLanguage();
  _currentLang  = lang || stored || Config.DEFAULT_LANGUAGE;

  await _loadTranslations(_currentLang);
  _setDocumentDirection(_currentLang);
  _applyTranslations();
  _persistLanguage(_currentLang);
  _revealPage(); // remove html.mm-init — content is now in the correct language
}

/**
 * Switch to a different language at runtime (no page reload needed).
 * @param {string} lang - Language code ('ar' or 'en').
 */
export async function setLanguage(lang) {
  if (lang === _currentLang) return;
  _currentLang = lang;
  await _loadTranslations(lang);
  _setDocumentDirection(lang);
  _applyTranslations();
  _persistLanguage(lang);
}

/** Returns the currently active language code. */
export function getLanguage() {
  return _currentLang;
}

/** Returns true when the current language reads right-to-left. */
export function isRtl() {
  return RTL_LANGUAGES.includes(_currentLang);
}

/* --------------------------------------------------------------------------
   Translation lookup
   -------------------------------------------------------------------------- */

/**
 * Returns the translated string for a dot-notation key.
 * Falls back to the key itself if not found (never crashes).
 * @param {string} key  - e.g. 'auth.login.title'
 * @param {Record<string, string>} [params] - Optional substitution tokens.
 * @returns {string}
 */
export function t(key, params) {
  const value = key.split('.').reduce(
    (obj, k) => (obj && typeof obj === 'object' ? obj[k] : undefined),
    _translations,
  );
  let result = typeof value === 'string' ? value : key;

  if (params) {
    result = result.replace(
      /\{(\w+)\}/g,
      (_, token) => (params[token] !== undefined ? params[token] : `{${token}}`),
    );
  }

  return result;
}

/* --------------------------------------------------------------------------
   DOM translation (also exported so layout.js can call after inject)
   -------------------------------------------------------------------------- */

/**
 * Applies translations to all elements in the document that carry data-i18n
 * attributes. Called automatically by initI18n() and setLanguage().
 */
export function applyTranslations() {
  _applyTranslations();
}

function _applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });

  const titleEl = document.querySelector('title[data-i18n-page-title]');
  if (titleEl) {
    titleEl.textContent = `${t(titleEl.dataset.i18nPageTitle)} | ${Config.APP_NAME}`;
  }
}

/* --------------------------------------------------------------------------
   Translation loading — cache-first strategy
   -------------------------------------------------------------------------- */

async function _loadTranslations(lang) {
  // Cache hit → apply immediately, refresh silently in the background.
  const cached = _getCachedTranslations(lang);
  if (cached) {
    _translations = cached;
    _scheduleBackgroundCacheRefresh(lang);
    return;
  }

  // Cache miss (first visit or stale) → fetch from network.
  try {
    const response = await fetch(`/assets/locales/${lang}.json`);
    if (!response.ok) throw new Error(`Locale file not found: ${lang}.json`);
    _translations = await response.json();
    _setCachedTranslations(lang, _translations);
  } catch (err) {
    console.warn(`[i18n] Failed to load locale "${lang}":`, err);
    _translations = {};
  }
}

/* --------------------------------------------------------------------------
   Locale cache helpers (localStorage)
   -------------------------------------------------------------------------- */

function _getCachedTranslations(lang) {
  try {
    const raw = localStorage.getItem(`${LOCALE_CACHE_PRE}${lang}`);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > LOCALE_CACHE_TTL) return null; // stale
    return data;
  } catch {
    return null;
  }
}

function _setCachedTranslations(lang, data) {
  try {
    localStorage.setItem(
      `${LOCALE_CACHE_PRE}${lang}`,
      JSON.stringify({ ts: Date.now(), data }),
    );
  } catch {
    /* Storage quota exceeded — silently skip caching. */
  }
}

function _scheduleBackgroundCacheRefresh(lang) {
  const refresh = async () => {
    try {
      const response = await fetch(`/assets/locales/${lang}.json`);
      if (response.ok) _setCachedTranslations(lang, await response.json());
    } catch {
      /* Ignore — stale cache is fine; it will refresh on next visit. */
    }
  };

  // Run during browser idle time so it doesn't compete with page rendering.
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(refresh, { timeout: 5000 });
  } else {
    setTimeout(refresh, 3000);
  }
}

/* --------------------------------------------------------------------------
   Direction + RTL stylesheet
   -------------------------------------------------------------------------- */

function _setDocumentDirection(lang) {
  const isRtlLang = RTL_LANGUAGES.includes(lang);
  document.documentElement.setAttribute('lang', lang);
  document.documentElement.setAttribute('dir', isRtlLang ? 'rtl' : 'ltr');
  _toggleRtlStylesheet(isRtlLang);
}

function _toggleRtlStylesheet(enable) {
  let link = document.getElementById(CSS_RTL_ID);

  if (enable) {
    // The <head> inline script may have already injected this.
    if (!link) {
      link = document.createElement('link');
      link.id   = CSS_RTL_ID;
      link.rel  = 'stylesheet';
      link.href = '/assets/css/rtl.css';
      document.head.appendChild(link);
    }
  } else {
    if (link) link.remove();
  }
}

/* --------------------------------------------------------------------------
   Page reveal
   -------------------------------------------------------------------------- */

/**
 * Removes the mm-init class that the inline <head> script added.
 * This makes the body visible — called only after translations are applied.
 */
function _revealPage() {
  document.documentElement.classList.remove('mm-init');
}

/* --------------------------------------------------------------------------
   Storage helpers
   -------------------------------------------------------------------------- */

function _getStoredLanguage() {
  try {
    return localStorage.getItem(Config.STORAGE_KEYS.LANGUAGE) || null;
  } catch {
    return null;
  }
}

function _persistLanguage(lang) {
  try {
    localStorage.setItem(Config.STORAGE_KEYS.LANGUAGE, lang);
  } catch {
    /* ignore */
  }
}
