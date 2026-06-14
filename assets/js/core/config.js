/**
 * core/config.js — MyMoney
 * Centralised application configuration. No hardcoded values in other modules.
 */

export const Config = Object.freeze({
  /** Backend API base URL. Override via window.MM_API_BASE_URL for environment switching. */
  API_BASE_URL: (typeof window !== 'undefined' && window.MM_API_BASE_URL)
    ? window.MM_API_BASE_URL
    : 'https://localhost:44320',

  /** Application name used in page titles and UI. */
  APP_NAME: 'My Money',

  /** Default language loaded on first visit. */
  DEFAULT_LANGUAGE: 'ar',

  /** localStorage keys — all prefixed mm. to avoid collisions. */
  STORAGE_KEYS: Object.freeze({
    LANGUAGE:              'mm.lang',
    THEME:                 'mm.theme',
    SIDEBAR_MINI:          'mm.sidebarMini',
    ACCESS_TOKEN:          'mm.accessToken',
    ACCESS_TOKEN_EXPIRY:   'mm.accessTokenExpiry',
    REFRESH_TOKEN:         'mm.refreshToken',
    REFRESH_TOKEN_EXPIRY:  'mm.refreshTokenExpiry',
    USER:                  'mm.user',
  }),

  /** Application routes. */
  ROUTES: Object.freeze({
    HOME:            '/index.html',
    LOGIN:           '/pages/auth/login.html',
    REGISTER:        '/pages/auth/register.html',
    FORGOT:          '/pages/auth/forgot-password.html',
    RESET:           '/pages/auth/reset-password.html',
    CONFIRM_EMAIL:   '/pages/auth/confirm-email.html',
    DASHBOARD:       '/pages/dashboard/index.html',
    TRANSACTIONS:    '/pages/transactions/index.html',
    PROFILE:         '/pages/dashboard/profile.html',
    SETTINGS:        '/pages/dashboard/settings.html',
    CHANGE_PASSWORD: '/pages/dashboard/change-password.html',
    ERROR_404:       '/pages/errors/404.html',
    ERROR_500:       '/pages/errors/500.html',
  }),

  /** Backend API endpoint paths (relative to API_BASE_URL). */
  API: Object.freeze({
    AUTH: Object.freeze({
      REGISTER:                  '/api/authentication/register',
      LOGIN:                     '/api/authentication/login',
      LOGOUT:                    '/api/authentication/logout',
      CONFIRM_EMAIL:             '/api/authentication/confirm-email',
      RESEND_CONFIRMATION_EMAIL: '/api/authentication/resend-confirmation-email',
      FORGOT_PASSWORD:           '/api/authentication/forgot-password',
      VALIDATE_RESET_TOKEN:      '/api/authentication/validate-reset-password-token',
      RESET_PASSWORD:            '/api/authentication/reset-password',
      CHANGE_PASSWORD:           '/api/authentication/change-password',
      REFRESH_TOKEN:             '/api/authentication/refresh-token',
      REQUEST_EMAIL_CHANGE:      '/api/authentication/email-change/request',
      CONFIRM_EMAIL_CHANGE:      '/api/authentication/email-change/confirm',
      CANCEL_EMAIL_CHANGE:       '/api/authentication/email-change/cancel',
    }),
    PROFILE: Object.freeze({
      GET:            '/api/profile/get',
      UPDATE:         '/api/profile/update',
      UPDATE_PICTURE: '/api/profile/picture/update',
      REMOVE_PICTURE: '/api/profile/picture/remove',
      SESSIONS:       '/api/profile/sessions/list',
      REVOKE_SESSION: '/api/profile/sessions/revoke',
      REVOKE_OTHERS:  '/api/profile/sessions/revoke-others',
    }),
    DASHBOARD: Object.freeze({
      SUMMARY: '/api/dashboard/summary',
    }),
    TRANSACTION: Object.freeze({
      SEARCH:    '/api/transactions/search',
      ANALYTICS: '/api/transactions/analytics',
      GET:       '/api/transactions/get',
      CREATE:    '/api/transactions/create',
      UPDATE:    '/api/transactions/update',
      DELETE:    '/api/transactions/delete',
    }),
    CATEGORY: Object.freeze({
      LIST: '/api/categories/get/list',
    }),
  }),

  /**
   * Internal response codes from the backend.
   * Mirrors the InternalResponseCodes enum on the server.
   */
  RESPONSE_CODES: Object.freeze({
    OK:                   1,
    CREATED:              2,
    ACCEPTED:             3,
    FOUND:                4,
    BAD_REQUEST:          5,
    UNAUTHORIZED:         6,
    FORBIDDEN:            7,
    NOT_FOUND:            8,
    CONFLICT:             9,
    INTERNAL_SERVER_ERROR: 10,
    REQUEST_TIMEOUT:      11,
  }),
});
