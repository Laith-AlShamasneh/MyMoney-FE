/**
 * services/budget-service.js — MyMoney
 * All Budget API calls go through this module.
 */

import { post } from '../core/api.js';
import { Config } from '../core/config.js';

const A = Config.API.BUDGETS;

export const BudgetService = Object.freeze({

  /** POST /api/budgets/dashboard */
  async getDashboard() {
    return post(A.DASHBOARD);
  },

  /** POST /api/budgets/list */
  async getList(statusId = null) {
    return post(A.LIST, { statusId });
  },

  /** POST /api/budgets/get */
  async getById(budgetId) {
    return post(A.GET, { id: budgetId });
  },

  /** POST /api/budgets/create */
  async create(data) {
    return post(A.CREATE, data);
  },

  /** POST /api/budgets/update */
  async update(data) {
    return post(A.UPDATE, data);
  },

  /** POST /api/budgets/delete */
  async deleteBudget(budgetId) {
    return post(A.DELETE, { id: budgetId });
  },

  /** POST /api/budgets/pause */
  async pause(budgetId) {
    return post(A.PAUSE, { id: budgetId });
  },

  /** POST /api/budgets/resume */
  async resume(budgetId) {
    return post(A.RESUME, { id: budgetId });
  },

  /** POST /api/budgets/periods */
  async getPeriods(budgetId, pageNumber = 1, pageSize = 10) {
    return post(A.PERIODS, { id: budgetId, pageNumber, pageSize });
  },

  /** POST /api/budgets/analytics */
  async getAnalytics(budgetId = null, months = 6) {
    return post(A.ANALYTICS, { budgetId, months });
  },

});
