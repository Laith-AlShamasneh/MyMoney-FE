/**
 * services/receipt-service.js — MyMoney
 * All receipt API calls go through this module (ADR-004).
 */

import { post, upload, downloadBlobPost } from '../core/api.js';
import { Config } from '../core/config.js';

const A = Config.API.RECEIPTS;

export const ReceiptService = Object.freeze({

  /**
   * POST /api/receipts/dashboard — summary stats + recent receipts.
   * @returns {Promise<{ summary: ReceiptDashboardSummary, recent: ReceiptSummary[] }>}
   */
  getDashboard() {
    return post(A.DASHBOARD);
  },

  /**
   * POST /api/receipts/search — paginated search with filters.
   * @param {{ keyword, statusId, dateFrom, dateTo, amountMin, amountMax, tagId, pageNumber, pageSize }} params
   */
  search(params) {
    return post(A.SEARCH, params);
  },

  /**
   * POST /api/receipts/get — full receipt detail + tags.
   * @param {number} receiptId
   */
  getById(receiptId) {
    return post(A.GET, { receiptId });
  },

  /**
   * POST /api/receipts/upload — multipart form data upload.
   * @param {FormData} formData
   */
  upload(formData) {
    return upload(A.UPLOAD, formData);
  },

  /**
   * POST /api/receipts/update — update receipt metadata + tags.
   * @param {{ receiptId, title, description, receiptDate, merchantName, amount, currencyCode, notes, tagIds }} data
   */
  update(data) {
    return post(A.UPDATE, data);
  },

  /**
   * POST /api/receipts/delete — soft-delete a receipt.
   * @param {number} receiptId
   */
  remove(receiptId) {
    return post(A.DELETE, { receiptId });
  },

  /**
   * POST /api/receipts/archive — move receipt to archive.
   * @param {number} receiptId
   */
  archive(receiptId) {
    return post(A.ARCHIVE, { receiptId });
  },

  /**
   * POST /api/receipts/restore — restore archived receipt.
   * @param {number} receiptId
   */
  restore(receiptId) {
    return post(A.RESTORE, { receiptId });
  },

  /**
   * POST /api/receipts/download — download receipt file as blob.
   * @param {number} receiptId
   * @returns {Promise<{ blob: Blob, filename: string, contentType: string }>}
   */
  download(receiptId) {
    return downloadBlobPost(A.DOWNLOAD, { receiptId });
  },

  /**
   * POST /api/receipts/assign-transaction — link or unlink a transaction.
   * Pass null transactionId to unlink.
   * @param {number} receiptId
   * @param {number|null} transactionId
   */
  assignTransaction(receiptId, transactionId) {
    return post(A.ASSIGN_TRANSACTION, { receiptId, transactionId: transactionId ?? null });
  },

  // ── Tags ──────────────────────────────────────────────────────────────────

  /** POST /api/receipts/tags/list — all tags for current user. */
  getTags() {
    return post(A.TAGS_LIST);
  },

  /**
   * POST /api/receipts/tags/create — create a new tag.
   * @param {string} name
   * @param {string|null} colorHex
   */
  createTag(name, colorHex = null) {
    return post(A.TAGS_CREATE, { name, colorHex });
  },

  /**
   * POST /api/receipts/tags/delete — delete a tag.
   * @param {number} tagId
   */
  deleteTag(tagId) {
    return post(A.TAGS_DELETE, { tagId });
  },

  /**
   * POST /api/receipts/tags/set — atomically replace all tags on a receipt.
   * @param {number} receiptId
   * @param {number[]} tagIds
   */
  setTags(receiptId, tagIds) {
    return post(A.TAGS_SET, { receiptId, tagIds: JSON.stringify(tagIds) });
  },

});
