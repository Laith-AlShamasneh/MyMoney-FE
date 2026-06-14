/**
 * services/transaction-service.js — MyMoney
 * All transaction API calls go through this module (ADR-004).
 */

import { post, get, put, del } from '../core/api.js';
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

  /** GET /api/transactions/get/{id} — single transaction detail */
  async getById(id) {
    return get(`${A.GET}/${id}`);
  },

  /** POST /api/transactions/create */
  async create(data) {
    return post(A.CREATE, data);
  },

  /** PUT /api/transactions/update/{id} */
  async update(id, data) {
    return put(`${A.UPDATE}/${id}`, data);
  },

  /** DELETE /api/transactions/delete/{id} */
  async remove(id) {
    return del(`${A.DELETE}/${id}`);
  },

});
