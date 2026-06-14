/**
 * services/report-service.js — MyMoney
 * Report generation, listing, downloading, and deletion.
 */

import { get, post, del, downloadBlob } from '../core/api.js';
import { Config } from '../core/config.js';

export const ReportService = Object.freeze({
  /** Returns all available report types. */
  getTypes() {
    return get(Config.API.REPORTS.TYPES);
  },

  /**
   * Enqueues a report generation job.
   * @param {{ reportTypeId: number, language: string, dateFrom: string, dateTo: string }} req
   */
  generate(req) {
    return post(Config.API.REPORTS.GENERATE, req);
  },

  /** Returns the current user's report history. */
  getList() {
    return get(Config.API.REPORTS.LIST);
  },

  /**
   * Downloads a completed report as a Blob.
   * @param {number} reportId
   * @returns {Promise<{ blob: Blob, filename: string }>}
   */
  download(reportId) {
    return downloadBlob(`${Config.API.REPORTS.DOWNLOAD}/${reportId}`);
  },

  /**
   * Deletes a report.
   * @param {number} reportId
   */
  deleteReport(reportId) {
    return del(`${Config.API.REPORTS.DELETE}/${reportId}`);
  },
});
