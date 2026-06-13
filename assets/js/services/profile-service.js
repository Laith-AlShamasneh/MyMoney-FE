/**
 * services/profile-service.js — MyMoney
 * All profile API calls go through this module (ADR-004).
 */

import { get, post, put, del, getWithHeaders, deleteWithHeaders, uploadPatch } from '../core/api.js';
import { Config } from '../core/config.js';

const A = Config.API.PROFILE;

export const ProfileService = Object.freeze({

  /** GET /api/profile — returns GetProfileResponse */
  async getProfile() {
    return get(A.GET);
  },

  /** PUT /api/profile — returns UpdateProfileResponse */
  async updateProfile({ firstNameEn, lastNameEn, displayNameEn, firstNameAr, lastNameAr, displayNameAr, dateOfBirth, genderId }) {
    return put(A.UPDATE, {
      firstNameEn,
      lastNameEn,
      displayNameEn,
      firstNameAr:   firstNameAr   || null,
      lastNameAr:    lastNameAr    || null,
      displayNameAr: displayNameAr || null,
      dateOfBirth:   dateOfBirth   || null,
      genderId:      genderId != null ? Number(genderId) : null,
    });
  },

  /** PATCH /api/profile/picture — multipart form upload */
  async updateProfilePicture(imageFile) {
    const fd = new FormData();
    fd.append('ProfileImage', imageFile);
    return uploadPatch(A.UPDATE_PICTURE, fd);
  },

  /** DELETE /api/profile/picture */
  async removeProfilePicture() {
    return del(A.REMOVE_PICTURE);
  },

  /**
   * GET /api/profile/sessions
   * Pass the current refresh token to identify the active session in the list.
   * Sent via X-Refresh-Token header (not a query param) to avoid logging.
   * @param {string|null} currentRefreshToken
   */
  async getSessions(currentRefreshToken) {
    const extraHeaders = currentRefreshToken
      ? { 'X-Refresh-Token': currentRefreshToken }
      : {};
    return getWithHeaders(A.SESSIONS, extraHeaders);
  },

  /** DELETE /api/profile/sessions/{id} */
  async revokeSession(sessionId) {
    return del(A.SESSION_BY_ID(sessionId));
  },

  /**
   * DELETE /api/profile/sessions/others
   * Sends the current refresh token via X-Refresh-Token header to identify
   * which session to keep while revoking all others.
   */
  async revokeAllOtherSessions(currentRefreshToken) {
    return deleteWithHeaders(A.REVOKE_OTHERS, { 'X-Refresh-Token': currentRefreshToken });
  },

  /** POST /api/profile/email-change/request */
  async requestEmailChange({ newEmail, currentPassword }) {
    return post(A.REQUEST_EMAIL_CHANGE, { newEmail, currentPassword });
  },

  /** DELETE /api/profile/email-change — cancel pending request */
  async cancelEmailChange() {
    return del(A.CANCEL_EMAIL_CHANGE);
  },

  /**
   * GET /api/profile/email-change/confirm?token=...
   * Public endpoint — no Authorization required. User arrives here from email link.
   */
  async confirmEmailChange(token) {
    return get(`${A.CONFIRM_EMAIL_CHANGE}?token=${encodeURIComponent(token)}`);
  },
});
