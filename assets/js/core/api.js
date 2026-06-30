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

/* Default client-side timeout for JSON API calls. A hung request (server stall,
   lost connection mid-flight) aborts instead of spinning forever. File up/downloads
   use the dedicated blob helpers and are intentionally not capped here. */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Builds an AbortSignal that fires on either a caller-supplied signal or a timeout.
 * Returns the combined signal, a cleanup() to stop the timer, and didTimeout().
 */
function _withTimeout(callerSignal, ms) {
  const controller = new AbortController();
  let timedOut = false;

  if (callerSignal) {
    if (callerSignal.aborted) controller.abort(callerSignal.reason);
    else callerSignal.addEventListener('abort', () => controller.abort(callerSignal.reason), { once: true });
  }

  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, ms);

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
    didTimeout: () => timedOut,
  };
}

/* --------------------------------------------------------------------------
   Auth interceptors (set by auth.js at import time)
   -------------------------------------------------------------------------- */
let _getAccessToken    = () => null;
let _getRefreshToken   = () => null;
let _refreshAccessToken = async () => false;
let _onSessionExpired  = () => {
  window.location.href = Config.ROUTES.LOGIN;
};

/* Shared refresh promise — prevents multiple concurrent 401 responses from
   each spawning their own refresh call. All concurrent waiters share one
   in-flight refresh and retry with the same new token once it resolves.  */
let _pendingRefresh = null;

function _ensureRefreshed() {
  if (!_pendingRefresh) {
    _pendingRefresh = _refreshAccessToken().finally(() => {
      _pendingRefresh = null;
    });
  }
  return _pendingRefresh;
}

/**
 * Called by auth.js to wire up token management without creating a circular
 * dependency between api.js and auth.js.
 * @param {()=>string|null}          getToken         - Returns current access token
 * @param {()=>Promise<boolean>}     refreshToken     - Attempts silent refresh; resolves true on success
 * @param {()=>void}                 onSessionExpired - Called when refresh fails
 * @param {()=>string|null}          [getRefreshToken] - Returns current refresh token from storage
 */
export function setAuthInterceptors(getToken, refreshToken, onSessionExpired, getRefreshToken) {
  if (getToken)         _getAccessToken    = getToken;
  if (refreshToken)     _refreshAccessToken = refreshToken;
  if (onSessionExpired) _onSessionExpired  = onSessionExpired;
  if (getRefreshToken)  _getRefreshToken   = getRefreshToken;
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

  // Merge any extra headers provided by the caller (e.g. X-Refresh-Token)
  if (options._extraHeaders) {
    Object.assign(headers, options._extraHeaders);
  }

  const timeout = _withTimeout(options.signal, options.timeout ?? DEFAULT_TIMEOUT_MS);

  const fetchOptions = {
    method,
    headers,
    signal: timeout.signal,
  };

  if (body != null && method !== 'GET') {
    fetchOptions.body = isFormData ? body : JSON.stringify(body);
  }

  let response;

  try {
    response = await fetch(url, fetchOptions);
  } catch (networkError) {
    if (timeout.didTimeout()) {
      /* Our timeout fired — surface it as a timeout, not a silent abort. */
      await _showErrorToast('errors.timeout');
      throw new ApiError('Request timed out.', [], Config.RESPONSE_CODES.REQUEST_TIMEOUT);
    }
    /* Caller-initiated cancellation — propagate quietly. */
    if (networkError.name === 'AbortError') {
      throw networkError;
    }
    /* Network failure — offline, DNS, CORS pre-flight, etc. */
    await _showErrorToast('errors.network');
    throw networkError;
  } finally {
    timeout.cleanup();
  }

  /* --- Handle 401 Unauthorized: attempt silent token refresh once --- */
  if (response.status === 401 && !options._isRetry) {
    /* _ensureRefreshed() serialises concurrent 401s behind one refresh call.
       If 5 requests all hit 401 simultaneously, only 1 refresh is made;
       all 5 retries proceed together once the refresh resolves.           */
    const refreshed = await _ensureRefreshed();
    if (refreshed) {
      /* After token rotation the refresh token in storage has changed.
         Replace X-Refresh-Token in extraHeaders so the retry uses the NEW token,
         not the now-revoked one that was captured before this request started.  */
      const retryOptions = { ...options, _isRetry: true };
      if (retryOptions._extraHeaders?.['X-Refresh-Token']) {
        const freshRefreshToken = _getRefreshToken();
        if (freshRefreshToken) {
          retryOptions._extraHeaders = {
            ...retryOptions._extraHeaders,
            'X-Refresh-Token': freshRefreshToken,
          };
        }
      }
      return request(method, endpoint, body, retryOptions);
    }
    /* Refresh failed — session is gone */
    _onSessionExpired();
    throw new ApiError('Session expired.', [], Config.RESPONSE_CODES.UNAUTHORIZED);
  }

  /* --- Handle 403 Forbidden --- */
  if (response.status === 403) {
    window.location.href = Config.ROUTES.ERROR_403;
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

/** PATCH request with FormData (file uploads). Returns result payload. */
export function patch(endpoint, body, options) {
  return request('PATCH', endpoint, body, options);
}

/** POST request with FormData (file uploads). Returns result payload. */
export function upload(endpoint, formData, options) {
  if (!(formData instanceof FormData)) {
    throw new TypeError('upload() requires a FormData instance.');
  }
  return request('POST', endpoint, formData, options);
}

/** Alias for upload() — POST with FormData. Preferred name for clarity. */
export function uploadPost(endpoint, formData, options) {
  if (!(formData instanceof FormData)) {
    throw new TypeError('uploadPost() requires a FormData instance.');
  }
  return request('POST', endpoint, formData, options);
}

/** PATCH request with FormData (file uploads). Returns result payload. */
export function uploadPatch(endpoint, formData, options) {
  if (!(formData instanceof FormData)) {
    throw new TypeError('uploadPatch() requires a FormData instance.');
  }
  return request('PATCH', endpoint, formData, options);
}

/**
 * GET request with extra custom headers (e.g. X-Refresh-Token for sessions).
 * Merges the provided headers with the standard auth/language headers.
 */
export function getWithHeaders(endpoint, extraHeaders = {}, options = {}) {
  return request('GET', endpoint, null, { ...options, _extraHeaders: extraHeaders });
}

/**
 * DELETE request with extra custom headers (e.g. X-Refresh-Token).
 */
export function deleteWithHeaders(endpoint, extraHeaders = {}, options = {}) {
  return request('DELETE', endpoint, null, { ...options, _extraHeaders: extraHeaders });
}

/**
 * POST request that returns binary content (Blob) rather than parsing JSON.
 * Used for file downloads where the endpoint requires a POST body (e.g. receipts).
 *
 * @param {string} endpoint - Path relative to API_BASE_URL
 * @param {object} body - JSON body for the POST request
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ blob: Blob, filename: string, contentType: string }>}
 */
export async function downloadBlobPost(endpoint, body = {}, options = {}) {
  return _downloadBlob({
    method: 'POST',
    endpoint,
    body,
    accept: 'application/octet-stream, application/json, */*',
    defaultFilename: 'receipt',
    signal: options.signal,
  });
}

/**
 * FM9: shared core for binary downloads. Builds auth headers, fetches with a
 * silent 401-refresh retry, maps 403 / 5xx / JSON-error-envelope to ApiError,
 * and extracts the filename from Content-Disposition. downloadBlob (GET) and
 * downloadBlobPost (POST) both delegate here instead of duplicating it.
 *
 * @returns {Promise<{ blob: Blob, filename: string, contentType: string }>}
 */
async function _downloadBlob({ method, endpoint, body, accept, defaultFilename, signal }) {
  const url    = Config.API_BASE_URL + endpoint;
  const isPost = method === 'POST';

  const buildHeaders = () => {
    const h = { Accept: accept };
    if (isPost) h['Content-Type'] = 'application/json';
    try {
      const lang = localStorage.getItem('mm.lang') || 'ar';
      h['Accept-Language'] = lang === 'en' ? 'en' : 'ar';
    } catch { /* ignore */ }
    const token = _getAccessToken();
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  };

  const doFetch = (headers) =>
    fetch(url, { method, headers, signal, ...(isPost ? { body: JSON.stringify(body) } : {}) });

  let response;
  try {
    response = await doFetch(buildHeaders());
  } catch (err) {
    if (err.name !== 'AbortError') await _showErrorToast('errors.network');
    throw err;
  }

  /* Silent token refresh on 401 */
  if (response.status === 401) {
    const refreshed = await _ensureRefreshed();
    if (refreshed) {
      try { response = await doFetch(buildHeaders()); } catch (err) {
        if (err.name !== 'AbortError') await _showErrorToast('errors.network');
        throw err;
      }
    } else {
      _onSessionExpired();
      throw new ApiError('Session expired.', [], Config.RESPONSE_CODES.UNAUTHORIZED);
    }
  }

  if (response.status === 403) {
    window.location.href = Config.ROUTES.ERROR_403;
    throw new ApiError('Forbidden.', [], Config.RESPONSE_CODES.FORBIDDEN);
  }

  if (response.status >= 500) {
    await _showErrorToast('errors.server');
    throw new ApiError('Server error.', [], Config.RESPONSE_CODES.INTERNAL_SERVER_ERROR);
  }

  /* A JSON response here means an error envelope was returned, not the file */
  const ct = response.headers.get('Content-Type') || '';
  if (!response.ok || ct.includes('application/json')) {
    let envelope;
    try { envelope = await response.json(); } catch { envelope = {}; }
    throw new ApiError(
      envelope.message || 'Download failed.',
      envelope.errors  || [],
      envelope.code    || 0,
    );
  }

  const disposition = response.headers.get('Content-Disposition') || '';
  const match       = disposition.match(/filename[^;=\n]*=['"]?([^'";\n]+)['"]?/i);
  const filename    = match ? decodeURIComponent(match[1].trim()) : defaultFilename;

  const blob = await response.blob();
  return { blob, filename, contentType: ct };
}

/**
 * GET request that returns binary content (Blob) rather than parsing JSON.
 * Used for file downloads (e.g. Excel reports).
 *
 * @param {string} endpoint - Path relative to API_BASE_URL
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<{ blob: Blob, filename: string }>}
 * @throws {ApiError} On auth/business errors.
 * @throws {Error}    On network/server errors.
 */
export async function downloadBlob(endpoint, options = {}) {
  const { blob, filename } = await _downloadBlob({
    method: 'GET',
    endpoint,
    accept: 'application/octet-stream, */*',
    defaultFilename: 'report.xlsx',
    signal: options.signal,
  });
  return { blob, filename };
}
