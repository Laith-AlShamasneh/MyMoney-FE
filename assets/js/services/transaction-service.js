/**
 * services/transaction-service.js — MyMoney
 * All transaction API calls go through this module (ADR-004).
 */

import { post } from '../core/api.js';
import { Config } from '../core/config.js';

const A = Config.API.TRANSACTION;

export const TransactionService = Object.freeze({

  /** POST /api/transactions/search — paginated + filtered list with summary */
  async search(params) {
    return post(A.SEARCH, params);
  },

  /** POST /api/transactions/analytics — category breakdown + 12-month trend */
  async getAnalytics(params) {
    return post(A.ANALYTICS, params);
  },

  /** POST /api/transactions/get — single transaction detail */
  async getById(id) {
    return post(A.GET, { id });
  },

  /** POST /api/transactions/create */
  async create(data) {
    return post(A.CREATE, data);
  },

  /** POST /api/transactions/update */
  async update(id, data) {
    return post(A.UPDATE, { id, ...data });
  },

  /** POST /api/transactions/delete */
  async remove(id) {
    return post(A.DELETE, { id });
  },

});
