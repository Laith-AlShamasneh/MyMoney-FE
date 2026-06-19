/**
 * services/goal-service.js — MyMoney
 * All Goals & Savings API calls go through this module.
 */

import { post } from '../core/api.js';
import { Config } from '../core/config.js';

const G = Config.API.GOALS;

export const GoalService = Object.freeze({

  /** POST /api/goals/dashboard */
  async getDashboard() {
    return post(G.DASHBOARD);
  },

  /** POST /api/goals/list */
  async getList({ statusId = null, goalTypeId = null, priority = null, pageNumber = 1, pageSize = 12 } = {}) {
    return post(G.LIST, { statusId, goalTypeId, priority, pageNumber, pageSize });
  },

  /** POST /api/goals/get */
  async getById(id) {
    return post(G.GET, { id });
  },

  /** POST /api/goals/create */
  async create(data) {
    return post(G.CREATE, data);
  },

  /** POST /api/goals/update */
  async update(data) {
    return post(G.UPDATE, data);
  },

  /** POST /api/goals/delete */
  async remove(id) {
    return post(G.DELETE, { id });
  },

  /** POST /api/goals/pause */
  async pause(id) {
    return post(G.PAUSE, { id });
  },

  /** POST /api/goals/resume */
  async resume(id) {
    return post(G.RESUME, { id });
  },

  /** POST /api/goals/contribute */
  async contribute({ goalId, amount, notes = null, contributionDate }) {
    return post(G.CONTRIBUTE, { goalId, amount, notes, contributionDate });
  },

  /** POST /api/goals/withdraw */
  async withdraw({ goalId, amount, notes = null, contributionDate }) {
    return post(G.WITHDRAW, { goalId, amount, notes, contributionDate });
  },

  /** POST /api/goals/adjust */
  async adjust({ goalId, newAmount, notes = null, adjustmentDate }) {
    return post(G.ADJUST, { goalId, newAmount, notes, adjustmentDate });
  },

  /** POST /api/goals/contributions */
  async getContributions({ goalId, pageNumber = 1, pageSize = 20 }) {
    return post(G.CONTRIBUTIONS, { goalId, pageNumber, pageSize });
  },

  /** POST /api/goals/link-recurring */
  async linkRecurring(goalId, recurringDefinitionId) {
    return post(G.LINK_RECURRING, { goalId, recurringDefinitionId });
  },

  /** POST /api/goals/unlink-recurring */
  async unlinkRecurring(goalId, recurringDefinitionId) {
    return post(G.UNLINK_RECURRING, { goalId, recurringDefinitionId });
  },

});
