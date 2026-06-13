/**
 * services/profile-service.js — MyMoney
 * All profile API calls go through this module (ADR-004).
 */

import { post, uploadPost } from '../core/api.js';
import { Config } from '../core/config.js';

const A = Config.API.PROFILE;

export const ProfileService = Object.freeze({

  /** POST /api/profile/get — returns GetProfileResponse */
  async getProfile() {
    return post(A.GET);
  },

  /** POST /api/profile/update — returns UpdateProfileResponse */
  async updateProfile({ firstNameEn, lastNameEn, displayNameEn, firstNameAr, lastNameAr, displayNameAr, dateOfBirth, genderId }) {
    return post(A.UPDATE, {
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

  /** POST /api/profile/picture/update — multipart form upload */
  async updateProfilePicture(imageFile) {
    const fd = new FormData();
    fd.append('ProfileImage', imageFile);
    return uploadPost(A.UPDATE_PICTURE, fd);
  },

  /** POST /api/profile/picture/remove */
  async removeProfilePicture() {
    return post(A.REMOVE_PICTURE);
  },

  /**
   * POST /api/profile/sessions/list
   * Pass the current refresh token to identify the active session in the list.
   * Sent via X-Refresh-Token header (not in body) to avoid request logging.
   * @param {string|null} currentRefreshToken
   */
  async getSessions(currentRefreshToken) {
    const extraHeaders = currentRefreshToken
      ? { 'X-Refresh-Token': currentRefreshToken }
      : {};
    return post(A.SESSIONS, null, { _extraHeaders: extraHeaders });
  },

  /** POST /api/profile/sessions/revoke — sends { sessionId } in body */
  async revokeSession(sessionId) {
    return post(A.REVOKE_SESSION, { sessionId });
  },

  /**
   * POST /api/profile/sessions/revoke-others
   * Sends the current refresh token via X-Refresh-Token header.
   */
  async revokeAllOtherSessions(currentRefreshToken) {
    return post(A.REVOKE_OTHERS, null, { _extraHeaders: { 'X-Refresh-Token': currentRefreshToken } });
  },

  /** POST /api/profile/email-change/request */
  async requestEmailChange({ newEmail, currentPassword }) {
    return post(A.REQUEST_EMAIL_CHANGE, { newEmail, currentPassword });
  },

  /** POST /api/profile/email-change/cancel — cancel pending request */
  async cancelEmailChange() {
    return post(A.CANCEL_EMAIL_CHANGE);
  },

  /**
   * POST /api/profile/email-change/confirm
   * Public endpoint — no Authorization required. User arrives here from email link.
   * The HTML page reads ?token= from URL and POSTs it here.
   */
  async confirmEmailChange(token) {
    return post(A.CONFIRM_EMAIL_CHANGE, { token });
  },
});
