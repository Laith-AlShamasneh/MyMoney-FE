/**
 * pages/confirm-email.js — MyMoney
 *
 * Flow:
 *  1. On load: read ?token= from URL.
 *  2. If no token → show error view immediately.
 *  3. If token → POST to confirm-email; show success or error view.
 *  4. Error view has a resend form: user enters email, calls resend-confirmation-email.
 */

import { initI18n, t }   from '../core/i18n.js';
import { initTheme, initLangSwitcher } from '../components/layout.js';
import { AuthService }   from '../services/auth-service.js';
import { ApiError }      from '../core/api.js';
import { Loading }       from '../components/loading.js';

/* --------------------------------------------------------------------------
   DOM refs
   -------------------------------------------------------------------------- */
const verifyingView  = document.getElementById('confirmVerifyingView');
const successView    = document.getElementById('confirmSuccessView');
const errorView      = document.getElementById('confirmErrorView');
const errorMessage   = document.getElementById('confirmErrorMessage');

/* Resend form (inside error view) */
const resendForm     = document.getElementById('resendForm');
const resendEmail    = document.getElementById('resendEmail');
const resendBtn      = document.getElementById('resendBtn');
const resendSuccess  = document.getElementById('resendSuccessView');

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */
function showView(view) {
  [verifyingView, successView, errorView].forEach(v => v?.classList.add('d-none'));
  view?.classList.remove('d-none');
}

/* --------------------------------------------------------------------------
   Token confirmation
   -------------------------------------------------------------------------- */
async function confirmToken(token) {
  try {
    await AuthService.confirmEmail(token);
    showView(successView);
  } catch (err) {
    let msg = t('auth.confirm_email.error_message');
    if (err instanceof ApiError && err.message) {
      msg = err.message;
    }
    if (errorMessage) errorMessage.textContent = msg;
    showView(errorView);
  }
}

/* --------------------------------------------------------------------------
   Resend confirmation
   -------------------------------------------------------------------------- */
if (resendForm) {
  resendForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!resendForm.checkValidity()) {
      resendForm.classList.add('was-validated');
      return;
    }
    resendForm.classList.remove('was-validated');

    Loading.button(resendBtn);
    try {
      await AuthService.resendConfirmationEmail(resendEmail.value);
      /* Always show success — backend gives no enumeration */
      resendForm.classList.add('d-none');
      resendSuccess?.classList.remove('d-none');
    } catch {
      /* Show success anyway to avoid enumeration */
      resendForm.classList.add('d-none');
      resendSuccess?.classList.remove('d-none');
    } finally {
      Loading.restore(resendBtn);
    }
  });
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
    if (errorMessage) errorMessage.textContent = t('auth.confirm_email.invalid_token');
    showView(errorView);
    return;
  }

  await confirmToken(token);
}

init();
