/**
 * pages/index.js — MyMoney
 * Root entry point. Redirects authenticated users to the dashboard,
 * unauthenticated users to the login page.
 */

import { initI18n } from '../core/i18n.js';
import { Config }   from '../core/config.js';

// Inline token check without triggering the full auth module
// so the redirect happens as fast as possible.
async function boot() {
  await initI18n();

  const refreshToken = (() => {
    try { return localStorage.getItem(Config.STORAGE_KEYS.REFRESH_TOKEN); } catch { return null; }
  })();

  const expiry = (() => {
    try { return localStorage.getItem(Config.STORAGE_KEYS.REFRESH_TOKEN_EXPIRY); } catch { return null; }
  })();

  const hasValidSession = refreshToken && expiry && new Date(expiry) > new Date();

  window.location.replace(
    hasValidSession ? Config.ROUTES.DASHBOARD : Config.ROUTES.LOGIN,
  );
}

boot();
