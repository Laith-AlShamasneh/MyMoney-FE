/**
 * services/dashboard-service.js — MyMoney
 * All dashboard API calls go through this module (ADR-004).
 */

import { post } from '../core/api.js';
import { Config } from '../core/config.js';

const A = Config.API.DASHBOARD;

export const DashboardService = Object.freeze({

  /** POST /api/dashboard/summary — returns DashboardSummaryResponse */
  async getSummary() {
    return post(A.SUMMARY);
  },

});
