/**
 * core/auth.js — MyMoney
 *
 * Authentication state management.
 *
 * - Access token stored in memory (never persisted — cleared on page refresh).
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
);

/* --------------------------------------------------------------------------
   Token persistence helpers
   -------------------------------------------------------------------------- */
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

function _clearStoredTokens() {
  try {
    localStorage.removeItem(Config.STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(Config.STORAGE_KEYS.REFRESH_TOKEN_EXPIRY);
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
 * @param {{ accessToken, refreshToken, refreshTokenExpiresAt, email, displayName, roles }} result
 */
function _applySession(result) {
  _accessToken = result.accessToken;

  const payload = _decodeJwt(result.accessToken);
  _currentUser = {
    userId:      payload?.nameid   || '',
    email:       result.email      || payload?.email || '',
    displayName: result.displayName || '',
    roles:       Array.isArray(result.roles) ? result.roles : [],
    profileImageUrl: result.profileImageUrl || null,
  };

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

/* --------------------------------------------------------------------------
   Route guards
   -------------------------------------------------------------------------- */

/**
 * Call at the top of every protected (dashboard) page script.
 * If no valid session can be restored, redirects to login.
 *
 * Flow:
 *  1. Access token already in memory  → OK
 *  2. No access token but stored refresh token → attempt silent refresh
 *  3. Refresh fails or no stored token → redirect to login
 */
export async function guardPage() {
  if (_accessToken && !_isAccessTokenExpired(_accessToken)) {
    return;
  }

  const refreshed = await _tryRefreshToken();
  if (!refreshed) {
    window.location.href = Config.ROUTES.LOGIN;
    /* Throw so the page script does not continue executing */
    throw new Error('Not authenticated.');
  }
}

/**
 * Call at the top of anonymous-only pages (login, register, etc.).
 * If the user has a valid session, redirects them to the dashboard.
 */
export async function guardAnonymous() {
  if (_accessToken && !_isAccessTokenExpired(_accessToken)) {
    window.location.href = Config.ROUTES.DASHBOARD;
    throw new Error('Already authenticated.');
  }

  /* Try to restore from refresh token */
  const refreshed = await _tryRefreshToken();
  if (refreshed) {
    window.location.href = Config.ROUTES.DASHBOARD;
    throw new Error('Already authenticated.');
  }
}

/**
 * Logs the user out: clears session and redirects to login.
 */
export function logout() {
  clearSession();
  window.location.href = Config.ROUTES.LOGIN;
}

/**
 * Checks whether the current user has a specific role.
 * @param {string} role
 */
export function hasRole(role) {
  return _currentUser?.roles?.includes(role) ?? false;
}
