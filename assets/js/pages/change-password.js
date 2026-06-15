/**
 * pages/change-password.js — MyMoney
 * Authenticated page: change password form with strength indicator.
 */

import { initI18n, t }     from '../core/i18n.js';
import { initLayout }      from '../components/layout.js';
import { guardPage }       from '../core/auth.js';
import { initOnboarding }  from '../components/onboarding.js';
import { AuthService }   from '../services/auth-service.js';
import { ApiError }      from '../core/api.js';
import { Config }        from '../core/config.js';
import { Loader }        from '../components/loading.js';
import { showSuccess, showError } from '../components/toast.js';

/* --------------------------------------------------------------------------
   DOM refs
   -------------------------------------------------------------------------- */
const form            = document.getElementById('changePasswordForm');
const currentPwdInput = document.getElementById('currentPassword');
const newPwdInput     = document.getElementById('newPassword');
const confirmPwdInput = document.getElementById('confirmPassword');
const submitBtn       = document.getElementById('changePasswordBtn');
const errorSummary    = document.getElementById('formErrorSummary');
const errorList       = document.getElementById('formErrorList');

/* Password strength hint elements */
const hintLength  = document.getElementById('hintLength');
const hintUpper   = document.getElementById('hintUpper');
const hintLower   = document.getElementById('hintLower');
const hintDigit   = document.getElementById('hintDigit');
const hintSpecial = document.getElementById('hintSpecial');

const SPECIAL_RE = /[!@#$%^&*(),.?"':{}|<>]/;

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
  errorSummary.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideErrors() {
  errorSummary.classList.add('d-none');
  errorList.innerHTML = '';
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
  confirmPwdInput.setCustomValidity(match ? '' : t('auth.change_password.confirm_password_error'));
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
   Show / hide password toggles
   -------------------------------------------------------------------------- */
document.querySelectorAll('[data-password-toggle]').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.passwordToggle;
    const input    = document.getElementById(targetId);
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type       = isPassword ? 'text' : 'password';
    const icon = btn.querySelector('i');
    if (icon) {
      icon.className = isPassword ? 'bi bi-eye-slash' : 'bi bi-eye';
    }
    btn.setAttribute(
      'aria-label',
      t(isPassword ? 'auth.change_password.hide_password' : 'auth.change_password.show_password'),
    );
  });
});

/* --------------------------------------------------------------------------
   Form submit
   -------------------------------------------------------------------------- */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideErrors();
  _validateConfirmPassword();

  if (!form.checkValidity()) {
    form.classList.add('was-validated');
    return;
  }

  const newPwd = newPwdInput.value;
  if (!updateStrengthHints(newPwd)) {
    showErrors([t('auth.change_password.new_password_error')]);
    newPwdInput.focus();
    return;
  }

  form.classList.remove('was-validated');
  Loader.setButtonLoading(submitBtn);

  /* Read the current refresh token so the backend can keep this session alive */
  let currentRefreshToken = null;
  try { currentRefreshToken = localStorage.getItem(Config.STORAGE_KEYS.REFRESH_TOKEN); } catch { /* ignore */ }

  try {
    await AuthService.changePassword(
      currentPwdInput.value,
      newPwd,
      confirmPwdInput.value,
      currentRefreshToken,
    );

    showSuccess(t('auth.change_password.success_message'));
    form.reset();
    /* Reset strength hints back to neutral */
    [hintLength, hintUpper, hintLower, hintDigit, hintSpecial].forEach(el => {
      if (!el) return;
      el.classList.remove('text-success');
      el.classList.add('text-muted');
      const icon = el.querySelector('.hint-icon');
      if (icon) icon.className = 'hint-icon bi bi-circle';
    });
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.errors?.length) {
        showErrors(err.errors);
      } else {
        const msg = err.message || t('errors.unknown');
        /* Highlight current-password field for wrong-password error */
        const isWrongPwd = msg.toLowerCase().includes('current') ||
          msg.includes('الحالية') || msg.toLowerCase().includes('incorrect');
        if (isWrongPwd) {
          currentPwdInput.classList.add('is-invalid');
        }
        showErrors([msg]);
      }
    }
  } finally {
    Loader.clearButtonLoading(submitBtn);
  }
});

currentPwdInput?.addEventListener('input', () => {
  hideErrors();
  currentPwdInput.classList.remove('is-invalid');
});

/* --------------------------------------------------------------------------
   Init
   -------------------------------------------------------------------------- */
async function init() {
  await initI18n();
  await guardPage();
  initLayout();
  initOnboarding();
}

init();
