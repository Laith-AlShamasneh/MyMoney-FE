/**
 * services/financial-intelligence-service.js — MyMoney
 * All Financial Intelligence Layer API calls go through this module.
 */

import { get, post } from '../core/api.js';
import { Config } from '../core/config.js';

const A = Config.API.FIL;

export const FinancialIntelligenceService = Object.freeze({

  /** GET /api/financial-intelligence/dashboard */
  async getDashboard() {
    return post(A.DASHBOARD);
  },

  /** POST /api/financial-intelligence/insights */
  async getInsights({ pageNumber = 1, pageSize = 20, isRead = null } = {}) {
    const body = { pageNumber, pageSize };
    if (isRead !== null) body.isRead = isRead;
    return post(A.INSIGHTS, body);
  },

  /** POST /api/financial-intelligence/insights/mark-read */
  async markInsightRead(insightId) {
    return post(A.INSIGHTS_MARK_READ, { insightId });
  },

  /** POST /api/financial-intelligence/insights/mark-all-read */
  async markAllInsightsRead() {
    return post(A.INSIGHTS_MARK_ALL_READ);
  },

  /** POST /api/financial-intelligence/patterns */
  async getPatterns() {
    return post(A.PATTERNS);
  },

  /** POST /api/financial-intelligence/recommendations */
  async getRecommendations({ pageNumber = 1, pageSize = 10 } = {}) {
    return post(A.RECOMMENDATIONS, { pageNumber, pageSize });
  },

  /** POST /api/financial-intelligence/recommendations/apply */
  async applyRecommendation(recommendationId) {
    return post(A.RECOMMENDATIONS_APPLY, { recommendationId });
  },

  /** POST /api/financial-intelligence/recommendations/dismiss */
  async dismissRecommendation(recommendationId) {
    return post(A.RECOMMENDATIONS_DISMISS, { recommendationId });
  },

});
