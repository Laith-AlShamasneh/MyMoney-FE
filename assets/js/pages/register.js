/**
 * pages/register.js — MyMoney
 * Registration form: field validation, password strength, profile image
 * preview, FormData submission, session init on success.
 */

import { initI18n, t }   from '../core/i18n.js';
import { initTheme, initLangSwitcher } from '../components/layout.js';
import { guardAnonymous, setSession } from '../core/auth.js';
import { AuthService }   from '../services/auth-service.js';
import { ApiError }      from '../core/api.js';
import { Config }        from '../core/config.js';
import { Loading }       from '../components/loading.js';

/* --------------------------------------------------------------------------
   DOM refs
   -------------------------------------------------------------------------- */
const form              = document.getElementById('registerForm');
const firstNameInput    = document.getElementById('firstNameEn');
const lastNameInput     = document.getElementById('lastNameEn');
const emailInput        = document.getElementById('registerEmail');
const passwordInput     = document.getElementById('registerPassword');
const confirmPwdInput   = document.getElementById('confirmPassword');
const imageInput        = document.getElementById('profileImage');
const imagePreview      = document.getElementById('imagePreview');
const imagePreviewWrap  = document.getElementById('imagePreviewWrap');
const removeImageBtn    = document.getElementById('removeImageBtn');
const submitBtn         = document.getElementById('registerBtn');
const errorSummary      = document.getElementById('formErrorSummary');
const errorList         = document.getElementById('formErrorList');

/* Password strength hint elements */
const hintLength    = document.getElementById('hintLength');
const hintUpper     = document.getElementById('hintUpper');
const hintLower     = document.getElementById('hintLower');
const hintDigit     = document.getElementById('hintDigit');
const hintSpecial   = document.getElementById('hintSpecial');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES   = ['image/jpeg', 'image/png'];

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
   Password strength indicator
   -------------------------------------------------------------------------- */
const SPECIAL_RE = /[!@#$%^&*(),.?"':{}|<>]/;

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

if (passwordInput) {
  passwordInput.addEventListener('input', () => {
    updateStrengthHints(passwordInput.value);
    /* Re-check confirm field if already touched */
    if (confirmPwdInput.value) {
      _validateConfirmPassword();
    }
  });
}

/* --------------------------------------------------------------------------
   Confirm password client-side check
   -------------------------------------------------------------------------- */
function _validateConfirmPassword() {
  const match = confirmPwdInput.value === passwordInput.value;
  confirmPwdInput.setCustomValidity(match ? '' : t('auth.register.confirm_password_error'));
  return match;
}

if (confirmPwdInput) {
  confirmPwdInput.addEventListener('input', _validateConfirmPassword);
}

/* --------------------------------------------------------------------------
   Profile image handling
   -------------------------------------------------------------------------- */
let _selectedImage = null;

function _clearImage() {
  _selectedImage = null;
  imageInput.value = '';
  if (imagePreviewWrap) imagePreviewWrap.classList.add('d-none');
  if (imagePreview)     imagePreview.src = '';
}

if (imageInput) {
  imageInput.addEventListener('change', () => {
    const file = imageInput.files?.[0];
    if (!file) { _clearImage(); return; }

    if (!ALLOWED_TYPES.includes(file.type)) {
      showErrors([t('auth.register.profile_image_error_type')]);
      _clearImage();
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showErrors([t('auth.register.profile_image_error_size')]);
      _clearImage();
      return;
    }

    _selectedImage = file;
    const reader  = new FileReader();
    reader.onload = (ev) => {
      if (imagePreview)    imagePreview.src = ev.target.result;
      if (imagePreviewWrap) imagePreviewWrap.classList.remove('d-none');
    };
    reader.readAsDataURL(file);
  });
}

if (removeImageBtn) {
  removeImageBtn.addEventListener('click', () => {
    _clearImage();
    hideErrors();
  });
}

/* --------------------------------------------------------------------------
   Form submit
   -------------------------------------------------------------------------- */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideErrors();

  /* Trigger confirm-password custom validity before Bootstrap validation */
  _validateConfirmPassword();

  if (!form.checkValidity()) {
    form.classList.add('was-validated');
    return;
  }

  const pwd = passwordInput.value;
  if (!updateStrengthHints(pwd)) {
    showErrors([t('auth.register.password_error')]);
    passwordInput.focus();
    return;
  }

  form.classList.remove('was-validated');
  Loading.button(submitBtn);

  try {
    const displayNameEn = `${firstNameInput.value.trim()} ${lastNameInput.value.trim()}`;
    const result = await AuthService.register({
      firstNameEn:  firstNameInput.value,
      lastNameEn:   lastNameInput.value,
      displayNameEn,
      email:        emailInput.value,
      password:     pwd,
      profileImage: _selectedImage,
    });

    setSession(result); /* stores tokens + redirects to dashboard */
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.errors?.length) {
        showErrors(err.errors);
      } else {
        const msg = err.message || t('errors.unknown');
        /* Highlight conflict (email already in use) */
        if (err.code === Config.RESPONSE_CODES.CONFLICT) {
          showErrors([t('auth.register.email_taken')]);
          emailInput.classList.add('is-invalid');
        } else {
          showErrors([msg]);
        }
      }
    }
  } finally {
    Loading.restore(submitBtn);
  }
});

/* Clear errors / invalid state on input */
[firstNameInput, lastNameInput, emailInput].forEach(el => {
  el?.addEventListener('input', () => {
    hideErrors();
    el.classList.remove('is-invalid');
  });
});

/* --------------------------------------------------------------------------
   Init
   -------------------------------------------------------------------------- */
async function init() {
  await initI18n();
  initTheme();
  initLangSwitcher();
  await guardAnonymous();
}

init();
