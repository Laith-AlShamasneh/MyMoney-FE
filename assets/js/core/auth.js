/**
 * core/auth.js — MyMoney
 *
 * Authentication state management.
 *
 * - Access token stored in memory AND localStorage for cross-navigation persistence.
 * - Refresh token stored in localStorage (key: mm.refreshToken).
 * - Wires itself into api.js on import via setAuthInterceptors().
 * - Provides guardPage() for protecting dashboard pages.
 * - Provides guardAnonymous() for redirecting authenticated users away from auth pages.
 */

import { Config } from './config.js';
import { setAuthInterceptors } from './api.js';

/* --------------------------------------------------------------------------
   In-memory access token (intentionally not persisted)
   -------------------------------------------------------------------------- */
let _accessToken = null;

/** @type {{ userId: string, email: string, displayName: string, roles: string[] }|null} */
let _currentUser = null;

/* --------------------------------------------------------------------------
   Wire up api.js auth interceptors as soon as this module is imported
   -------------------------------------------------------------------------- */
setAuthInterceptors(
  () => _accessToken,
  _tryRefreshToken,
  _handleSessionExpired,
  _loadRefreshToken,  // 4th arg: provides current refresh token for X-Refresh-Token header refresh
);

/* --------------------------------------------------------------------------
   Token persistence helpers
   -------------------------------------------------------------------------- */
function _saveAccessToken(token, expiresAt) {
  try {
    localStorage.setItem(Config.STORAGE_KEYS.ACCESS_TOKEN, token);
    if (expiresAt) localStorage.setItem(Config.STORAGE_KEYS.ACCESS_TOKEN_EXPIRY, expiresAt);
  } catch {
    /* localStorage unavailable */
  }
}

function _loadAccessToken() {
  try {
    return localStorage.getItem(Config.STORAGE_KEYS.ACCESS_TOKEN);
  } catch {
    return null;
  }
}

function _saveRefreshToken(token, expiresAt) {
  try {
    localStorage.setItem(Config.STORAGE_KEYS.REFRESH_TOKEN, token);
    localStorage.setItem(Config.STORAGE_KEYS.REFRESH_TOKEN_EXPIRY, expiresAt);
  } catch {
    /* localStorage unavailable — continue without persistence */
  }
}

function _loadRefreshToken() {
  try {
    return localStorage.getItem(Config.STORAGE_KEYS.REFRESH_TOKEN);
  } catch {
    return null;
  }
}

function _saveUser(user) {
  try {
    localStorage.setItem(Config.STORAGE_KEYS.USER, JSON.stringify(user));
  } catch {
    /* ignore */
  }
}

function _loadUser() {
  try {
    const json = localStorage.getItem(Config.STORAGE_KEYS.USER);
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

function _clearStoredTokens() {
  try {
    localStorage.removeItem(Config.STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(Config.STORAGE_KEYS.ACCESS_TOKEN_EXPIRY);
    localStorage.removeItem(Config.STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(Config.STORAGE_KEYS.REFRESH_TOKEN_EXPIRY);
    localStorage.removeItem(Config.STORAGE_KEYS.USER);
  } catch {
    /* ignore */
  }
}

function _isRefreshTokenExpired() {
  try {
    const expiry = localStorage.getItem(Config.STORAGE_KEYS.REFRESH_TOKEN_EXPIRY);
    if (!expiry) return true;
    return new Date(expiry) <= new Date();
  } catch {
    return true;
  }
}

/* --------------------------------------------------------------------------
   JWT decode (no signature verification — server is authoritative)
   -------------------------------------------------------------------------- */
function _decodeJwt(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded;
  } catch {
    return null;
  }
}

function _isAccessTokenExpired(token) {
  const payload = _decodeJwt(token);
  if (!payload || !payload.exp) return true;
  /* exp is in seconds — compare with current time in seconds */
  return payload.exp * 1000 < Date.now();
}

/* --------------------------------------------------------------------------
   Silent token refresh (called by api.js interceptor on 401)
   -------------------------------------------------------------------------- */
async function _tryRefreshToken() {
  const refreshToken = _loadRefreshToken();
  if (!refreshToken || _isRefreshTokenExpired()) {
    return false;
  }

  try {
    /* Use fetch directly to avoid a circular api.js → auth.js dependency */
    const response = await fetch(Config.API_BASE_URL + Config.API.AUTH.REFRESH_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) return false;

    const envelope = await response.json();
    if (!envelope.success || !envelope.result) return false;

    _applySession(envelope.result);
    return true;
  } catch {
    return false;
  }
}

function _handleSessionExpired() {
  clearSession();
  window.location.href = Config.ROUTES.LOGIN;
}

/* --------------------------------------------------------------------------
   Session lifecycle
   -------------------------------------------------------------------------- */

/**
 * Applies a login/refresh response to in-memory state + localStorage.
 * @param {{ accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt, email, displayName, roles }} result
 */
function _applySession(result) {
  _accessToken = result.accessToken;

  const payload = _decodeJwt(result.accessToken);
  _currentUser = {
    userId:                 payload?.nameid    || '',
    email:                  result.email       || payload?.email || '',
    displayName:            result.displayName || '',
    roles:                  Array.isArray(result.roles) ? result.roles : [],
    profileImageUrl:        result.profileImageUrl || null,
    hasCompletedOnboarding: result.hasCompletedOnboarding
      ?? _currentUser?.hasCompletedOnboarding
      ?? false,
  };

  /* Persist access token so it survives page navigation.
     Also persist display data for layout rendering before the first API call. */
  _saveAccessToken(result.accessToken, result.accessTokenExpiresAt);
  _saveUser(_currentUser);

  if (result.refreshToken) {
    _saveRefreshToken(result.refreshToken, result.refreshTokenExpiresAt);
  }
}

/**
 * Called after a successful login or registration response.
 * Stores the session and redirects to the dashboard.
 * @param {object} result - The `result` field from the API envelope.
 */
export function setSession(result) {
  _applySession(result);
  window.location.href = Config.ROUTES.DASHBOARD;
}

/**
 * Clears all auth state (in-memory and persisted).
 */
export function clearSession() {
  _accessToken = null;
  _currentUser = null;
  _clearStoredTokens();
}

/**
 * Returns the decoded current user or null if not authenticated.
 * @returns {{ userId: string, email: string, displayName: string, roles: string[], profileImageUrl: string|null }|null}
 */
export function getCurrentUser() {
  return _currentUser;
}

/**
 * Returns the raw access token string (may be null).
 */
export function getAccessToken() {
  return _accessToken;
}

/**
 * Updates specific fields in the current user object (in-memory and localStorage).
 * Used by pages that change profile data (avatar, display name) without a full refresh.
 * @param {Partial<{displayName:string, profileImageUrl:string|null}>} partial
 */
export function updateCurrentUser(partial) {
  if (!_currentUser) return;
  _currentUser = { ..._currentUser, ...partial };
  _saveUser(_currentUser);
}

/* --------------------------------------------------------------------------
   Route guards
   -------------------------------------------------------------------------- */

/**
 * Call at the top of every protected (dashboard) page script.
 * Performs a client-side-only session check — no server call.
 *
 * Flow:
 *  1. Access token in memory and valid → OK
 *  2. No in-memory token but stored refresh token (not locally expired) → OK
 *     The actual server refresh is deferred to the first 401 response via api.js.
 *  3. No stored refresh token or locally expired → redirect to login immediately.
 *
 * This reactive approach means refresh is only called when the server signals
 * expiry (401), never pre-emptively on every page load.
 */
export async function guardPage() {
  /* Restore access token from localStorage if not already in memory */
  if (!_accessToken) {
    const stored = _loadAccessToken();
    if (stored && !_isAccessTokenExpired(stored)) {
      _accessToken = stored;
    }
  }

  if (_accessToken && !_isAccessTokenExpired(_accessToken)) {
    /* Restore display data if not yet loaded into memory */
    if (!_currentUser) _currentUser = _loadUser();
    return;
  }

  if (!_loadRefreshToken() || _isRefreshTokenExpired()) {
    clearSession();
    window.location.href = Config.ROUTES.LOGIN;
    throw new Error('Not authenticated.');
  }

  /* Restore display data from localStorage so the layout renders with the
     real user name and avatar before the first API call triggers a refresh. */
  if (!_currentUser) {
    _currentUser = _loadUser();
  }
}

/**
 * Call at the top of anonymous-only pages (login, register, etc.).
 * If the user appears to have a valid session, redirects to the dashboard.
 *
 * Client-side check only — no server call.
 * If the stored refresh token turns out to be revoked, api.js will catch
 * the subsequent 401 on the dashboard and redirect back to login.
 */
export async function guardAnonymous() {
  if (_accessToken && !_isAccessTokenExpired(_accessToken)) {
    window.location.href = Config.ROUTES.DASHBOARD;
    throw new Error('Already authenticated.');
  }

  if (_loadRefreshToken() && !_isRefreshTokenExpired()) {
    window.location.href = Config.ROUTES.DASHBOARD;
    throw new Error('Already authenticated.');
  }
}

/**
 * Logs the user out: revokes the refresh token on the server,
 * clears all client-side auth state, and redirects to login.
 * Uses fetch directly (not api.js) to avoid 401-retry interference.
 */
export async function logout() {
  const refreshToken = _loadRefreshToken();
  const accessToken  = _accessToken;

  clearSession();

  if (refreshToken) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
      await fetch(Config.API_BASE_URL + Config.API.AUTH.LOGOUT, {
        method:  'POST',
        headers,
        body:    JSON.stringify({ refreshToken }),
      });
    } catch { /* network error — client logout proceeds regardless */ }
  }

  window.location.href = Config.ROUTES.LOGIN;
}

/**
 * Checks whether the current user has a specific role.
 * @param {string} role
 */
export function hasRole(role) {
  return _currentUser?.roles?.includes(role) ?? false;
}
