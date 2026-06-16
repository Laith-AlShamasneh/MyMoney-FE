/**
 * services/notification-service.js — MyMoney
 * In-app notification management: listing, actions, and user preferences.
 */

import { post } from '../core/api.js';
import { Config } from '../core/config.js';

const N = Config.API.NOTIFICATIONS;

export const NotificationService = Object.freeze({

  /**
   * @param {{ status?: number, category?: number, pageNumber?: number, pageSize?: number }} [opts]
   */
  getList({ status, category, pageNumber = 1, pageSize = 20 } = {}) {
    return post(N.LIST, {
      status:     status   ?? null,
      category:   category ?? null,
      pageNumber,
      pageSize,
    });
  },

  getUnreadCount() {
    return post(N.UNREAD_COUNT);
  },

  /** @param {number} notificationId */
  markRead(notificationId) {
    return post(N.MARK_READ, { notificationId });
  },

  markAllRead() {
    return post(N.MARK_ALL_READ);
  },

  /** @param {number} notificationId */
  archive(notificationId) {
    return post(N.ARCHIVE, { notificationId });
  },

  /** @param {number} notificationId */
  dismiss(notificationId) {
    return post(N.DISMISS, { notificationId });
  },

  /** @param {number} notificationId */
  deleteNotification(notificationId) {
    return post(N.DELETE, { notificationId });
  },

  getPreferences() {
    return post(N.PREFERENCES);
  },

  /**
   * @param {{ securityEnabled: boolean, financialEnabled: boolean,
   *           systemEnabled: boolean, reportsEnabled: boolean, profileEnabled: boolean }} prefs
   */
  updatePreferences(prefs) {
    return post(N.PREFERENCES_UPDATE, prefs);
  },
});
