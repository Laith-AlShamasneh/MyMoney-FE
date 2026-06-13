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
 */

import { Config } from './config.js';

const RTL_LANGUAGES = ['ar'];
const CSS_RTL_ID    = 'mm-rtl-stylesheet';

let _translations = {};
let _currentLang  = Config.DEFAULT_LANGUAGE;

/* --------------------------------------------------------------------------
   Initialise i18n — call once per page before touching any t() calls.
   -------------------------------------------------------------------------- */

/**
 * Loads the locale file and applies all translations to the DOM.
 * Returns a Promise so callers can await it.
 *
 * @param {string} [lang] - Explicit language code. Falls back to stored or default.
 */
export async function initI18n(lang) {
  const stored = _getStoredLanguage();
  _currentLang = lang || stored || Config.DEFAULT_LANGUAGE;

  await _loadTranslations(_currentLang);
  _setDocumentDirection(_currentLang);
  _applyTranslations();
  _persistLanguage(_currentLang);
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
 *
 * @param {string} key  - e.g. 'auth.login.title'
 * @param {Record<string, string>} [params] - Optional substitution tokens: t('hello', { name: 'Ali' })
 * @returns {string}
 */
export function t(key, params) {
  const value = key.split('.').reduce((obj, k) => (obj && typeof obj === 'object' ? obj[k] : undefined), _translations);
  let result = (typeof value === 'string') ? value : key;

  if (params) {
    result = result.replace(/\{(\w+)\}/g, (_, token) => (params[token] !== undefined ? params[token] : `{${token}}`));
  }

  return result;
}

/* --------------------------------------------------------------------------
   DOM translation
   -------------------------------------------------------------------------- */

/**
 * Applies translations to all elements in the document that carry data-i18n
 * attributes. Called automatically by initI18n() and setLanguage().
 *
 * Supported attributes:
 *   data-i18n="key"                    → sets element.textContent
 *   data-i18n-placeholder="key"        → sets element.placeholder
 *   data-i18n-aria-label="key"         → sets element.ariaLabel
 *   data-i18n-title="key"              → sets element.title
 *   data-i18n-html="key"               → sets element.innerHTML (use sparingly)
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

  /* Update the document <title> */
  const titleEl = document.querySelector('title[data-i18n-page-title]');
  if (titleEl) {
    titleEl.textContent = `${t(titleEl.dataset.i18nPageTitle)} | ${Config.APP_NAME}`;
  }
}

/* --------------------------------------------------------------------------
   Internal helpers
   -------------------------------------------------------------------------- */

async function _loadTranslations(lang) {
  try {
    const response = await fetch(`/assets/locales/${lang}.json`);
    if (!response.ok) throw new Error(`Locale file not found: ${lang}.json`);
    _translations = await response.json();
  } catch (err) {
    console.warn(`[i18n] Failed to load locale "${lang}":`, err);
    _translations = {};
  }
}

function _setDocumentDirection(lang) {
  const isRtlLang = RTL_LANGUAGES.includes(lang);
  document.documentElement.setAttribute('lang', lang);
  document.documentElement.setAttribute('dir', isRtlLang ? 'rtl' : 'ltr');
  _toggleRtlStylesheet(isRtlLang);
}

function _toggleRtlStylesheet(enable) {
  let link = document.getElementById(CSS_RTL_ID);

  if (enable) {
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
