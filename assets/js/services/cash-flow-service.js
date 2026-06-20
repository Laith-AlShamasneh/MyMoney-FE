/**
 * services/cash-flow-service.js — MyMoney
 * All Cash Flow Forecasting API calls go through this module.
 */

import { post } from '../core/api.js';
import { Config } from '../core/config.js';

const A = Config.API.CASH_FLOW;

export const CashFlowService = Object.freeze({

  /** POST /api/cash-flow/forecast */
  async getForecast(horizonMonths = 12) {
    return post(A.FORECAST, { horizonMonths });
  },

  /** POST /api/cash-flow/dashboard */
  async getDashboard() {
    return post(A.DASHBOARD);
  },

});
