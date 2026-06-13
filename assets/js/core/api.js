/**
 * core/api.js — MyMoney
 *
 * Generic HTTP layer. ALL fetch calls in the application must go through here.
 * Never use fetch() or XMLHttpRequest directly in page scripts or components.
 *
 * Features:
 *  - Standardised request/response handling
 *  - Automatic Authorization header injection
 *  - Silent token refresh on 401 (one retry)
 *  - Centralised error handling (forbidden, server, network, timeout)
 *  - Loading state integration via components/loading.js
 *  - Toast notifications for non-business errors
 *
 * Auth integration (no circular dependency):
 *  auth.js calls setAuthInterceptors() at module init to provide token callbacks.
 */

import { Config } from './config.js';

/* --------------------------------------------------------------------------
   Auth interceptors (set by auth.js at import time)
   -------------------------------------------------------------------------- */
let _getAccessToken = () => null;
let _refreshAccessToken = async () => false;
let _onSessionExpired = () => {
  window.location.href = Config.ROUTES.LOGIN;
};

/**
 * Called by auth.js to wire up token management without creating a circular
 * dependency between api.js and auth.js.
 */
export function setAuthInterceptors(getToken, refreshToken, onSessionExpired) {
  if (getToken)       _getAccessToken    = getToken;
  if (refreshToken)   _refreshAccessToken = refreshToken;
  if (onSessionExpired) _onSessionExpired = onSessionExpired;
}

/* --------------------------------------------------------------------------
   Typed error class
   -------------------------------------------------------------------------- */
export class ApiError extends Error {
  /**
   * @param {string}   message  - Human-readable message from the backend.
   * @param {string[]} errors   - Field/business validation error strings.
   * @param {number}   code     - InternalResponseCode from the backend.
   */
  constructor(message, errors = [], code = 0) {
    super(message);
    this.name = 'ApiError';
    this.isApiError = true;
    this.errors = errors;
    this.code = code;
  }
}

/* --------------------------------------------------------------------------
   Toast helper (lazy import to avoid a hard dependency)
   -------------------------------------------------------------------------- */
async function _showErrorToast(messageKey) {
  try {
    const { showToast } = await import('../components/toast.js');
    const { t } = await import('./i18n.js');
    showToast(t(messageKey), 'error');
  } catch {
    /* toast not available — silently ignore */
  }
}

/* --------------------------------------------------------------------------
   Core request function
   -------------------------------------------------------------------------- */

/**
 * @param {'GET'|'POST'|'PUT'|'DELETE'|'PATCH'} method
 * @param {string} endpoint  - Path relative to API_BASE_URL, e.g. '/api/auth/login'
 * @param {object|FormData|null} body
 * @param {{ signal?: AbortSignal, _isRetry?: boolean }} [options]
 * @returns {Promise<any>} Resolves to response.result on success.
 * @throws {ApiError} On business validation errors.
 * @throws {Error}    On unrecoverable errors (after toast/redirect handling).
 */
async function request(method, endpoint, body = null, options = {}) {
  const url = Config.API_BASE_URL + endpoint;
  const isFormData = body instanceof FormData;

  const headers = { Accept: 'application/json' };

  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  /* Send language preference so backend localises its messages */
  try {
    const lang = localStorage.getItem('mm.lang') || 'ar';
    headers['Accept-Language'] = lang === 'en' ? 'en' : 'ar';
  } catch { /* ignore if localStorage unavailable */ }

  const token = _getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const fetchOptions = {
    method,
    headers,
    signal: options.signal,
  };

  if (body !== null && method !== 'GET') {
    fetchOptions.body = isFormData ? body : JSON.stringify(body);
  }

  let response;

  try {
    response = await fetch(url, fetchOptions);
  } catch (networkError) {
    /* Network failure — offline, DNS, CORS pre-flight, etc. */
    if (networkError.name === 'AbortError') {
      throw networkError;
    }
    await _showErrorToast('errors.network');
    throw networkError;
  }

  /* --- Handle 401 Unauthorized: attempt silent token refresh once --- */
  if (response.status === 401 && !options._isRetry) {
    const refreshed = await _refreshAccessToken();
    if (refreshed) {
      return request(method, endpoint, body, { ...options, _isRetry: true });
    }
    /* Refresh failed — session is gone */
    _onSessionExpired();
    throw new ApiError('Session expired.', [], Config.RESPONSE_CODES.UNAUTHORIZED);
  }

  /* --- Handle 403 Forbidden --- */
  if (response.status === 403) {
    window.location.href = Config.ROUTES.ERROR_404;
    throw new ApiError('Forbidden.', [], Config.RESPONSE_CODES.FORBIDDEN);
  }

  /* --- Handle 5xx Server Errors --- */
  if (response.status >= 500) {
    await _showErrorToast('errors.server');
    throw new ApiError('Server error.', [], Config.RESPONSE_CODES.INTERNAL_SERVER_ERROR);
  }

  /* --- Parse JSON envelope --- */
  let envelope;
  try {
    envelope = await response.json();
  } catch {
    await _showErrorToast('errors.server');
    throw new Error('Invalid server response (non-JSON).');
  }

  /* --- Handle timeout code from backend --- */
  if (envelope.code === Config.RESPONSE_CODES.REQUEST_TIMEOUT) {
    await _showErrorToast('errors.timeout');
    throw new ApiError(envelope.message, [], envelope.code);
  }

  /* --- Handle business success --- */
  if (envelope.success === true) {
    return envelope.result;
  }

  /* --- Handle business validation / error --- */
  throw new ApiError(
    envelope.message || 'Request failed.',
    envelope.errors || [],
    envelope.code   || 0,
  );
}

/* --------------------------------------------------------------------------
   Public interface
   -------------------------------------------------------------------------- */

/** GET request. Returns result payload. */
export function get(endpoint, options) {
  return request('GET', endpoint, null, options);
}

/** POST request with JSON body. Returns result payload. */
export function post(endpoint, body, options) {
  return request('POST', endpoint, body, options);
}

/** PUT request with JSON body. Returns result payload. */
export function put(endpoint, body, options) {
  return request('PUT', endpoint, body, options);
}

/** DELETE request. Returns result payload. */
export function del(endpoint, options) {
  return request('DELETE', endpoint, null, options);
}

/** POST request with FormData (file uploads). Returns result payload. */
export function upload(endpoint, formData, options) {
  if (!(formData instanceof FormData)) {
    throw new TypeError('upload() requires a FormData instance.');
  }
  return request('POST', endpoint, formData, options);
}
