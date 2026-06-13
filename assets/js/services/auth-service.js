/**
 * services/auth-service.js — MyMoney
 *
 * All authentication API calls in one place.
 * Every method maps 1:1 to a backend endpoint under /api/authentication/.
 * Methods throw ApiError on business errors; callers handle UI.
 */

import { post, upload } from '../core/api.js';
import { Config }       from '../core/config.js';

const A = Config.API.AUTH;

export const AuthService = Object.freeze({

  /**
   * Register a new user account.
   * Uses FormData because of the optional profile image upload.
   *
   * @param {{
   *   firstNameEn:    string,
   *   lastNameEn:     string,
   *   displayNameEn:  string,
   *   firstNameAr?:   string|null,
   *   lastNameAr?:    string|null,
   *   displayNameAr?: string|null,
   *   dateOfBirth?:   string|null,   // ISO date string "YYYY-MM-DD"
   *   genderId?:      number|null,   // 1=Male 2=Female 3=PreferNotToSay
   *   email:          string,
   *   password:       string,
   *   profileImage?:  File|null,
   * }} fields
   * @returns {Promise<RegisterResponse>}
   */
  async register({
    firstNameEn,
    lastNameEn,
    displayNameEn,
    firstNameAr   = null,
    lastNameAr    = null,
    displayNameAr = null,
    dateOfBirth   = null,
    genderId      = null,
    email,
    password,
    profileImage  = null,
  }) {
    const fd = new FormData();
    fd.append('FirstNameEn',   firstNameEn.trim());
    fd.append('LastNameEn',    lastNameEn.trim());
    fd.append('DisplayNameEn', displayNameEn.trim());
    fd.append('Email',         email.trim());
    fd.append('Password',      password);

    if (firstNameAr?.trim())   fd.append('FirstNameAr',   firstNameAr.trim());
    if (lastNameAr?.trim())    fd.append('LastNameAr',    lastNameAr.trim());
    if (displayNameAr?.trim()) fd.append('DisplayNameAr', displayNameAr.trim());
    if (dateOfBirth)           fd.append('DateOfBirth',   dateOfBirth);
    if (genderId != null)      fd.append('GenderId',      String(genderId));
    if (profileImage)          fd.append('ProfileImage',  profileImage);

    return upload(A.REGISTER, fd);
  },

  /**
   * Authenticate an existing user.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<LoginResponse>}
   */
  async login(email, password) {
    return post(A.LOGIN, { email: email.trim(), password });
  },

  /**
   * Confirm email address using token from confirmation link.
   * @param {string} token - Raw token from URL query param.
   * @returns {Promise<boolean>}
   */
  async confirmEmail(token) {
    return post(A.CONFIRM_EMAIL, { token });
  },

  /**
   * Resend email confirmation link to an address.
   * Always returns success regardless of whether the address is registered (no enumeration).
   * @param {string} email
   * @returns {Promise<boolean>}
   */
  async resendConfirmationEmail(email) {
    return post(A.RESEND_CONFIRMATION_EMAIL, { email: email.trim() });
  },

  /**
   * Request a password reset email.
   * Always returns success regardless of whether the email is registered (no enumeration).
   * @param {string} email
   * @returns {Promise<boolean>}
   */
  async forgotPassword(email) {
    return post(A.FORGOT_PASSWORD, { email: email.trim() });
  },

  /**
   * Validate a password reset token before showing the reset form.
   * Use this on page load of reset-password.html.
   * @param {string} token - Raw token from URL query param.
   * @returns {Promise<boolean>} Resolves to true if valid; throws ApiError if expired/invalid.
   */
  async validateResetToken(token) {
    return post(A.VALIDATE_RESET_TOKEN, { token });
  },

  /**
   * Submit a new password using a valid reset token.
   * @param {string} token
   * @param {string} newPassword
   * @param {string} confirmPassword
   * @returns {Promise<boolean>}
   */
  async resetPassword(token, newPassword, confirmPassword) {
    return post(A.RESET_PASSWORD, { token, newPassword, confirmPassword });
  },

  /**
   * Change the authenticated user's password.
   * Pass currentRefreshToken to keep the current session active (all other sessions are revoked).
   * Requires a valid session (Authorization header injected by api.js).
   * @param {string}      currentPassword
   * @param {string}      newPassword
   * @param {string}      confirmPassword
   * @param {string|null} [currentRefreshToken] - If provided, this session is preserved.
   * @returns {Promise<boolean>}
   */
  async changePassword(currentPassword, newPassword, confirmPassword, currentRefreshToken = null) {
    return post(A.CHANGE_PASSWORD, {
      currentPassword,
      newPassword,
      confirmPassword,
      ...(currentRefreshToken ? { currentRefreshToken } : {}),
    });
  },

  /**
   * Request an email change. Sends a confirmation link to the new address.
   * Requires current password to verify identity.
   * @param {string} newEmail
   * @param {string} currentPassword
   * @returns {Promise<boolean>}
   */
  async requestEmailChange(newEmail, currentPassword) {
    return post(A.REQUEST_EMAIL_CHANGE, { newEmail, currentPassword });
  },

  /**
   * Confirm an email change using the token from the confirmation link.
   * Public endpoint — no Authorization required.
   * @param {string} token - Raw token from URL query param.
   * @returns {Promise<boolean>}
   */
  async confirmEmailChange(token) {
    return post(A.CONFIRM_EMAIL_CHANGE, { token });
  },

  /**
   * Cancel a pending email change request.
   * Requires a valid session (Authorization header injected by api.js).
   * @returns {Promise<boolean>}
   */
  async cancelEmailChange() {
    return post(A.CANCEL_EMAIL_CHANGE);
  },
});
