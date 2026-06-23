/**
 * core/currency.js — MyMoney
 * Central currency module. Provides amount formatting, display-currency
 * state, currency list cache, and the mm-currency-change event system.
 *
 * Usage:
 *   import { formatAmount, getDisplayCurrency, initCurrency } from '../core/currency.js';
 *   await initCurrency();
 *   el.textContent = formatAmount(tx.amount, tx.currencyCode);
 */

import { Config } from './config.js';
import { getLanguage } from './i18n.js';

const SK = Config.STORAGE_KEYS;

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */
const DEFAULT_CURRENCY = 'USD';
const CACHE_TTL_MS     = 60 * 60 * 1000; // 1 hour

/**
 * Arabic locale override per currency ISO code.
 * Maps to the most natural regional Arabic locale for display.
 */
const AR_LOCALE = {
  SAR: 'ar-SA', AED: 'ar-AE', KWD: 'ar-KW', QAR: 'ar-QA',
  BHD: 'ar-BH', OMR: 'ar-OM', JOD: 'ar-JO', EGP: 'ar-EG',
  MAD: 'ar-MA', TND: 'ar-TN', IQD: 'ar-IQ', LBP: 'ar-LB',
  DZD: 'ar-DZ', YER: 'ar-YE', LYD: 'ar-LY', SDG: 'ar-SD',
};

/**
 * Country code for flag emoji generation (ISO 3166-1 alpha-2).
 * Used to render currency flag emoji in the switcher dropdown.
 */
const CURRENCY_COUNTRY = {
  USD:'US', EUR:'EU', GBP:'GB', JPY:'JP', CNY:'CN', AUD:'AU', CAD:'CA',
  CHF:'CH', HKD:'HK', SGD:'SG', NZD:'NZ', SEK:'SE', NOK:'NO', DKK:'DK',
  SAR:'SA', AED:'AE', KWD:'KW', QAR:'QA', BHD:'BH', OMR:'OM', JOD:'JO',
  EGP:'EG', MAD:'MA', TND:'TN', IQD:'IQ', LBP:'LB', DZD:'DZ', YER:'YE',
  LYD:'LY', SDG:'SD', INR:'IN', PKR:'PK', BDT:'BD', LKR:'LK', MYR:'MY',
  IDR:'ID', THB:'TH', PHP:'PH', KRW:'KR', TWD:'TW', VND:'VN', MXN:'MX',
  BRL:'BR', ARS:'AR', CLP:'CL', ZAR:'ZA', NGN:'NG', KES:'KE', GHS:'GH',
  TRY:'TR', RUB:'RU', PLN:'PL', CZK:'CZ', HUF:'HU', RON:'RO',
};

/* --------------------------------------------------------------------------
   Module state
   -------------------------------------------------------------------------- */
let _displayCurrency  = null;   // active display currency code
let _currencyList     = [];     // cached list of CurrencyDto objects
let _initPromise      = null;   // singleton init promise

/* --------------------------------------------------------------------------
   Flag emoji helper
   -------------------------------------------------------------------------- */
/**
 * Returns a flag emoji string for a currency code, e.g. 'USD' → '🇺🇸'.
 * Falls back to a generic globe if no mapping exists.
 */
export function currencyFlag(code) {
  const cc = CURRENCY_COUNTRY[code?.toUpperCase()];
  if (!cc) return '🌐';
  // Regional indicator letters: A=0x1F1E6 … Z=0x1F1FF
  return String.fromCodePoint(
    0x1F1E6 + cc.charCodeAt(0) - 65,
    0x1F1E6 + cc.charCodeAt(1) - 65,
  );
}

/* --------------------------------------------------------------------------
   Storage helpers
   -------------------------------------------------------------------------- */
function _readStorage(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function _writeStorage(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

/* --------------------------------------------------------------------------
   Display currency
   -------------------------------------------------------------------------- */
/**
 * Returns the current display currency code (e.g. 'USD', 'JOD').
 * Reads from in-memory cache → localStorage → falls back to 'USD'.
 */
export function getDisplayCurrency() {
  if (_displayCurrency) return _displayCurrency;
  _displayCurrency = _readStorage(SK.DISPLAY_CURRENCY) || DEFAULT_CURRENCY;
  return _displayCurrency;
}

/**
 * Sets the display currency, persists to localStorage, and fires the
 * global 'mm-currency-change' event so every page can react.
 */
export function setDisplayCurrency(code, { silent = false } = {}) {
  const upper = code.toUpperCase();
  _displayCurrency = upper;
  _writeStorage(SK.DISPLAY_CURRENCY, upper);
  if (!silent) {
    document.dispatchEvent(new CustomEvent('mm-currency-change', {
      detail: { code: upper },
      bubbles: false,
    }));
  }
}

/* --------------------------------------------------------------------------
   Formatting
   -------------------------------------------------------------------------- */
/**
 * Formats a numeric value as a localized currency string.
 *
 * @param {number|null|undefined} value        - Numeric amount.
 * @param {string|null}           currencyCode - ISO 4217 code. Defaults to
 *                                               the user's display currency.
 * @returns {string} Formatted string, e.g. "JOD 37.900" / "٣٧٫٩٠٠ د.أ."
 */
export function formatAmount(value, currencyCode = null) {
  const code   = (currencyCode ?? getDisplayCurrency()).toUpperCase();
  const lang   = getLanguage();
  const locale = lang === 'ar' ? (AR_LOCALE[code] || 'ar-SA') : 'en-US';
  const num    = typeof value === 'number' ? value : (parseFloat(value) || 0);

  try {
    return new Intl.NumberFormat(locale, {
      style:    'currency',
      currency: code,
    }).format(num);
  } catch {
    // Fallback for unrecognised codes
    const fixed = num.toFixed(2);
    return `${code} ${fixed}`;
  }
}

/**
 * Formats an amount and, if the original currency differs from the display
 * currency, appends a small parenthetical showing the original value.
 *
 * Returns either a plain string (same currency) or an object
 * { display: string, original: string } for callers that want to render
 * the two values separately (e.g. in a tooltip or secondary line).
 *
 * @param {number}      convertedAmount   - Amount already in display currency.
 * @param {string}      displayCurrency   - The display currency code.
 * @param {number}      originalAmount    - The raw amount in the original currency.
 * @param {string|null} originalCurrency  - The original currency code.
 */
export function formatAmountWithOriginal(convertedAmount, displayCurrency, originalAmount, originalCurrency) {
  const display = formatAmount(convertedAmount, displayCurrency);
  if (!originalCurrency || originalCurrency.toUpperCase() === displayCurrency.toUpperCase()) {
    return display;
  }
  const original = formatAmount(originalAmount, originalCurrency);
  return { display, original };
}

/**
 * Returns an HTML snippet showing the amount, optionally with a small badge
 * indicating the original currency when it differs from the display currency.
 */
export function formatAmountHtml(amount, currencyCode = null, opts = {}) {
  const displayCurrency = getDisplayCurrency();
  const usedCode        = (currencyCode ?? displayCurrency).toUpperCase();
  const isConverted     = usedCode !== displayCurrency;

  const formatted = formatAmount(amount, usedCode);
  if (!isConverted || opts.noOriginal) return formatted;

  const originalFormatted = formatAmount(amount, usedCode);
  return `<span class="mm-amt-converted" title="${originalFormatted}">${formatAmount(amount, displayCurrency)}<span class="mm-amt-badge">${usedCode}</span></span>`;
}

/* --------------------------------------------------------------------------
   Currency list cache
   -------------------------------------------------------------------------- */
/**
 * Replaces the in-memory currency list and persists it to localStorage
 * with a timestamp for cache invalidation.
 */
export function setCurrencyList(list) {
  if (!Array.isArray(list)) return;
  _currencyList = list;
  try {
    _writeStorage(SK.CURRENCY_LIST, JSON.stringify(list));
    _writeStorage(SK.CURRENCY_LIST_TS, String(Date.now()));
  } catch { /* ignore */ }
}

/** Returns the in-memory currency list (may be empty before init). */
export function getCurrencyList() {
  return _currencyList;
}

/** Looks up a single CurrencyDto by ISO code. */
export function getCurrencyByCode(code) {
  if (!code) return null;
  return _currencyList.find(c => c.code === code.toUpperCase()) ?? null;
}

/** Tries to load the currency list from localStorage cache. */
function _loadCurrencyListFromCache() {
  try {
    const ts   = parseInt(_readStorage(SK.CURRENCY_LIST_TS) || '0', 10);
    const aged = Date.now() - ts;
    if (aged > CACHE_TTL_MS) return false;

    const raw = _readStorage(SK.CURRENCY_LIST);
    if (!raw) return false;

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      _currencyList = parsed;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/* --------------------------------------------------------------------------
   Backend preference sync
   -------------------------------------------------------------------------- */
async function _syncFromBackend() {
  try {
    // Lazy import to avoid circular deps with currency-service
    const { CurrencyService } = await import('../services/currency-service.js');

    const [prefsResult, listResult] = await Promise.allSettled([
      CurrencyService.getUserPreferences(),
      CurrencyService.getCurrencies(),
    ]);

    if (listResult.status === 'fulfilled' && Array.isArray(listResult.value)) {
      setCurrencyList(listResult.value);
    }

    if (prefsResult.status === 'fulfilled' && prefsResult.value?.displayCurrencyCode) {
      const backendCode = prefsResult.value.displayCurrencyCode;
      if (backendCode !== getDisplayCurrency()) {
        setDisplayCurrency(backendCode); // dispatches mm-currency-change
      }
    }
  } catch {
    // Non-fatal: use stored / default currency
  }
}

/* --------------------------------------------------------------------------
   Public init
   -------------------------------------------------------------------------- */
/**
 * Initialises the currency module. Safe to call multiple times — returns
 * the same promise. Synchronously loads the stored currency code, then
 * asynchronously syncs preferences and the currency list from the backend.
 */
export function initCurrency() {
  // Synchronous part: load from storage immediately
  getDisplayCurrency();
  _loadCurrencyListFromCache();

  // Async part: singleton so parallel calls share one request
  if (!_initPromise) {
    _initPromise = _syncFromBackend();
  }
  return _initPromise;
}
