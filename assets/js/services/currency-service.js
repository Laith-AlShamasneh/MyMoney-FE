/**
 * services/currency-service.js — MyMoney
 * API service layer for all /api/currency/* endpoints.
 */

import { post } from '../core/api.js';
import { Config } from '../core/config.js';

const A = Config.API.CURRENCY;

export const CurrencyService = Object.freeze({

  // ── Currencies ─────────────────────────────────────────────────────────────

  /** Returns the list of supported ISO 4217 currencies. */
  async getCurrencies(includeInactive = false) {
    const data = await post(A.LIST, { includeInactive });
    return data ?? [];
  },

  /** Returns a single currency by ISO code. */
  async getCurrency(code) {
    return post(A.GET, { fromCurrency: code, toCurrency: code });
  },

  // ── User Preferences ────────────────────────────────────────────────────────

  /** Returns the current user's currency preferences. */
  async getUserPreferences() {
    return post(A.PREFERENCES_GET, {});
  },

  /**
   * Creates or updates the current user's currency preferences.
   * @param {{ baseCurrencyCode, displayCurrencyCode, numberFormatId,
   *           symbolStyleId, negativeFormatId, currencyPositionId }} prefs
   */
  async updateUserPreferences(prefs) {
    return post(A.PREFERENCES_UPDATE, prefs);
  },

  // ── Exchange Rates ──────────────────────────────────────────────────────────

  /** Returns the current rate for a currency pair. */
  async getCurrentRate(fromCurrency, toCurrency) {
    return post(A.RATES_CURRENT, { fromCurrency, toCurrency });
  },

  /** Returns the rate effective on a specific date. */
  async getHistoricalRate(fromCurrency, toCurrency, asOfDate) {
    return post(A.RATES_HISTORICAL, { fromCurrency, toCurrency, asOfDate });
  },

  /** Returns paginated exchange rate history with optional filters. */
  async getRateHistory({ fromCurrency, toCurrency, dateFrom, dateTo, pageNumber = 1, pageSize = 50 } = {}) {
    return post(A.RATES_HISTORY, { fromCurrency, toCurrency, dateFrom, dateTo, pageNumber, pageSize });
  },

  /**
   * Sets a manual exchange rate.
   * @param {{ fromCurrency, toCurrency, rate, effectiveDate }} params
   */
  async setManualRate(params) {
    return post(A.RATES_SET, params);
  },

  /** Returns exchange rate system statistics. */
  async getStatistics() {
    return post(A.RATES_STATISTICS, {});
  },

  /** Triggers an immediate exchange rate sync job. */
  async syncRates() {
    return post(A.RATES_SYNC, {});
  },

  // ── Conversion ──────────────────────────────────────────────────────────────

  /**
   * Converts an amount between currencies.
   * @param {{ amount, fromCurrency, toCurrency, asOfDate? }} params
   */
  async convert(params) {
    return post(A.CONVERT, params);
  },

  // ── Dashboard ───────────────────────────────────────────────────────────────

  /**
   * Returns a currency-aware financial summary.
   * @param {{ displayCurrencyCode?, dateFrom?, dateTo? }} params
   */
  async getDashboard(params = {}) {
    return post(A.DASHBOARD, params);
  },
});
