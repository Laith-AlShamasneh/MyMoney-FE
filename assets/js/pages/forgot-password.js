/**
 * pages/forgot-password.js — MyMoney
 * Forgot password form: submits email, shows success view.
 * Backend is intentionally opaque (no enumeration) — always shows success.
 */

import { initI18n, t }   from '../core/i18n.js';
import { initTheme, initLangSwitcher } from '../components/layout.js';
import { guardAnonymous } from '../core/auth.js';
import { AuthService }   from '../services/auth-service.js';
import { Loader }        from '../components/loading.js';

const form          = document.getElementById('forgotForm');
const emailInput    = document.getElementById('forgotEmail');
const submitBtn     = document.getElementById('forgotBtn');
const errorSummary  = document.getElementById('formErrorSummary');
const errorList     = document.getElementById('formErrorList');
const formView      = document.getElementById('forgotFormView');
const successView   = document.getElementById('forgotSuccessView');

function _esc(str) {
  return String(str).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function showErrors(messages) {
  errorList.innerHTML = messages.map(m => `<li>${_esc(m)}</li>`).join('');
  errorSummary.classList.remove('d-none');
}

function hideErrors() {
  errorSummary.classList.add('d-none');
  errorList.innerHTML = '';
}

function showSuccess() {
  formView.classList.add('d-none');
  successView.classList.remove('d-none');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideErrors();

  if (!form.checkValidity()) {
    form.classList.add('was-validated');
    return;
  }
  form.classList.remove('was-validated');

  Loader.setButtonLoading(submitBtn);
  try {
    await AuthService.forgotPassword(emailInput.value);
    /* Always show success — backend gives no enumeration */
    showSuccess();
  } catch {
    /* Even on unexpected errors show success to avoid enumeration leaks */
    showSuccess();
  } finally {
    Loader.clearButtonLoading(submitBtn);
  }
});

emailInput.addEventListener('input', hideErrors);

async function init() {
  await initI18n();
  initTheme();
  initLangSwitcher();
  await guardAnonymous();
}

init();
