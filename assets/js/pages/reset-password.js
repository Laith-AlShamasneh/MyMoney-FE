/**
 * pages/reset-password.js — MyMoney
 *
 * Flow:
 *  1. On load: read ?token= from URL.
 *  2. If no token → immediately show invalid view.
 *  3. If token present → call validateResetToken; show invalid/expired view on failure.
 *  4. On valid token → show form.
 *  5. On form submit → call resetPassword; show success or display error.
 */

import { initI18n, t }   from '../core/i18n.js';
import { initTheme, initLangSwitcher } from '../components/layout.js';
import { guardAnonymous } from '../core/auth.js';
import { AuthService }   from '../services/auth-service.js';
import { ApiError }      from '../core/api.js';
import { Config }        from '../core/config.js';
import { Loading }       from '../components/loading.js';

/* --------------------------------------------------------------------------
   DOM refs
   -------------------------------------------------------------------------- */
const formView          = document.getElementById('resetFormView');
const invalidView       = document.getElementById('resetInvalidView');
const successView       = document.getElementById('resetSuccessView');
const form              = document.getElementById('resetForm');
const newPwdInput       = document.getElementById('newPassword');
const confirmPwdInput   = document.getElementById('confirmNewPassword');
const submitBtn         = document.getElementById('resetBtn');
const errorSummary      = document.getElementById('formErrorSummary');
const errorList         = document.getElementById('formErrorList');
const invalidMessage    = document.getElementById('resetInvalidMessage');

/* Password strength hint elements */
const hintLength  = document.getElementById('hintLength');
const hintUpper   = document.getElementById('hintUpper');
const hintLower   = document.getElementById('hintLower');
const hintDigit   = document.getElementById('hintDigit');
const hintSpecial = document.getElementById('hintSpecial');

const SPECIAL_RE  = /[!@#$%^&*(),.?"':{}|<>]/;

let _token = null;

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */
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

function showView(view) {
  [formView, invalidView, successView].forEach(v => v?.classList.add('d-none'));
  view?.classList.remove('d-none');
}

/* --------------------------------------------------------------------------
   Password strength
   -------------------------------------------------------------------------- */
function _checkStrength(pwd) {
  return {
    length:  pwd.length >= 8,
    upper:   /[A-Z]/.test(pwd),
    lower:   /[a-z]/.test(pwd),
    digit:   /\d/.test(pwd),
    special: SPECIAL_RE.test(pwd),
  };
}

function _applyHint(el, met) {
  if (!el) return;
  el.classList.toggle('text-success', met);
  el.classList.toggle('text-muted',   !met);
  const icon = el.querySelector('.hint-icon');
  if (icon) icon.className = `hint-icon bi ${met ? 'bi-check-circle-fill' : 'bi-circle'}`;
}

function updateStrengthHints(pwd) {
  const s = _checkStrength(pwd);
  _applyHint(hintLength,  s.length);
  _applyHint(hintUpper,   s.upper);
  _applyHint(hintLower,   s.lower);
  _applyHint(hintDigit,   s.digit);
  _applyHint(hintSpecial, s.special);
  return s.length && s.upper && s.lower && s.digit && s.special;
}

function _validateConfirmPassword() {
  const match = confirmPwdInput.value === newPwdInput.value;
  confirmPwdInput.setCustomValidity(match ? '' : t('auth.reset.confirm_password_error'));
  return match;
}

if (newPwdInput) {
  newPwdInput.addEventListener('input', () => {
    updateStrengthHints(newPwdInput.value);
    if (confirmPwdInput.value) _validateConfirmPassword();
  });
}
if (confirmPwdInput) {
  confirmPwdInput.addEventListener('input', _validateConfirmPassword);
}

/* --------------------------------------------------------------------------
   Token validation on page load
   -------------------------------------------------------------------------- */
async function validateToken(token) {
  /* Show validating state — form stays hidden until token is confirmed valid */
  try {
    await AuthService.validateResetToken(token);
    showView(formView);
  } catch (err) {
    /* Show inline expired/invalid message */
    let msg = t('auth.reset.invalid_token');
    if (err instanceof ApiError && err.message) {
      msg = err.message;
    }
    if (invalidMessage) invalidMessage.textContent = msg;
    showView(invalidView);
  }
}

/* --------------------------------------------------------------------------
   Form submit
   -------------------------------------------------------------------------- */
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideErrors();
    _validateConfirmPassword();

    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      return;
    }

    const pwd = newPwdInput.value;
    if (!updateStrengthHints(pwd)) {
      showErrors([t('auth.reset.password_error')]);
      newPwdInput.focus();
      return;
    }

    form.classList.remove('was-validated');
    Loading.button(submitBtn);

    try {
      await AuthService.resetPassword(_token, pwd, confirmPwdInput.value);
      showView(successView);
    } catch (err) {
      if (err instanceof ApiError) {
        /* Expired or already-used token — send user to invalid view */
        if (err.message?.toLowerCase().includes('expir') ||
            err.message?.includes('انتهت')) {
          if (invalidMessage) invalidMessage.textContent = t('auth.reset.expired_token');
          showView(invalidView);
        } else {
          showErrors([err.message || t('errors.unknown')]);
        }
      }
    } finally {
      Loading.restore(submitBtn);
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
  await guardAnonymous();

  const params = new URLSearchParams(window.location.search);
  _token = params.get('token');

  if (!_token) {
    showView(invalidView);
    return;
  }

  await validateToken(_token);
}

init();
