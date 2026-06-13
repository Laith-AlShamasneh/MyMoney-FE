/**
 * pages/confirm-email-change.js — MyMoney
 *
 * Public page: user lands here from the email change confirmation link.
 * Reads ?token= from the URL, calls the confirm endpoint, shows result.
 * On success, all refresh tokens are revoked → user must sign in again.
 */

import { initI18n, t }                    from '../core/i18n.js';
import { initTheme, initLangSwitcher }    from '../components/layout.js';
import { ProfileService }                 from '../services/profile-service.js';
import { ApiError }                       from '../core/api.js';

/* --------------------------------------------------------------------------
   DOM refs
   -------------------------------------------------------------------------- */
const stateVerifying = document.getElementById('stateVerifying');
const stateSuccess   = document.getElementById('stateSuccess');
const stateError     = document.getElementById('stateError');

/* --------------------------------------------------------------------------
   State transitions
   -------------------------------------------------------------------------- */
function _show(el) {
  [stateVerifying, stateSuccess, stateError].forEach(v => v?.classList.add('d-none'));
  el?.classList.remove('d-none');
}

/* --------------------------------------------------------------------------
   Confirm token
   -------------------------------------------------------------------------- */
async function confirmToken(token) {
  try {
    await ProfileService.confirmEmailChange(token);
    /* Email changed — all sessions except the one that requested it are revoked.
       Clear local auth state so the user is prompted to sign in with new email. */
    try {
      localStorage.removeItem('mm.refreshToken');
      localStorage.removeItem('mm.refreshTokenExpiry');
      localStorage.removeItem('mm.user');
    } catch { /* ignore */ }
    _show(stateSuccess);
  } catch {
    _show(stateError);
  }
}

/* --------------------------------------------------------------------------
   Init
   -------------------------------------------------------------------------- */
async function init() {
  await initI18n();
  initTheme();
  initLangSwitcher();

  const params = new URLSearchParams(window.location.search);
  const token  = params.get('token');

  if (!token) {
    _show(stateError);
    return;
  }

  await confirmToken(token);
}

init();
