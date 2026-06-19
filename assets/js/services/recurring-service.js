/**
 * services/recurring-service.js — MyMoney
 * All Recurring Transactions & Subscriptions API calls go through this module.
 */

import { post } from '../core/api.js';
import { Config } from '../core/config.js';

const R = Config.API.RECURRING;
const S = Config.API.SUBSCRIPTION;

export const RecurringService = Object.freeze({

  /* ── Recurring Transactions ─────────────────────────────────────────────── */

  /** POST /api/recurring-transactions/dashboard */
  async getDashboard() {
    return post(R.DASHBOARD);
  },

  /** POST /api/recurring-transactions/list */
  async getList({ statusId = null, transactionTypeId = null, pageNumber = 1, pageSize = 20 } = {}) {
    return post(R.LIST, { statusId, transactionTypeId, pageNumber, pageSize });
  },

  /** POST /api/recurring-transactions/create */
  async create(data) {
    return post(R.CREATE, data);
  },

  /** POST /api/recurring-transactions/get */
  async getById(id) {
    return post(R.GET, { id });
  },

  /** POST /api/recurring-transactions/update */
  async update(data) {
    return post(R.UPDATE, data);
  },

  /** POST /api/recurring-transactions/delete */
  async remove(id) {
    return post(R.DELETE, { id });
  },

  /** POST /api/recurring-transactions/pause */
  async pause(id) {
    return post(R.PAUSE, { id });
  },

  /** POST /api/recurring-transactions/resume */
  async resume(id) {
    return post(R.RESUME, { id });
  },

  /* ── Subscriptions ──────────────────────────────────────────────────────── */

  /** POST /api/subscriptions/list */
  async getSubscriptions({ statusId = null, pageNumber = 1, pageSize = 20 } = {}) {
    return post(S.LIST, { statusId, pageNumber, pageSize });
  },

  /** POST /api/subscriptions/create */
  async createSubscription(data) {
    return post(S.CREATE, data);
  },

  /** POST /api/subscriptions/update */
  async updateSubscription(data) {
    return post(S.UPDATE, data);
  },

  /** POST /api/subscriptions/pause */
  async pauseSubscription(id) {
    return post(S.PAUSE, { id });
  },

  /** POST /api/subscriptions/delete */
  async removeSubscription(id) {
    return post(S.DELETE, { id });
  },

});
