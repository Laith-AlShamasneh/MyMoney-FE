/**
 * pages/register.js — MyMoney
 * Registration form: all backend fields, validation, password strength,
 * profile image preview, FormData submission, session init on success.
 */

import { initI18n, t }   from '../core/i18n.js';
import { initTheme, initLangSwitcher } from '../components/layout.js';
import { guardAnonymous, setSession } from '../core/auth.js';
import { AuthService }   from '../services/auth-service.js';
import { ApiError }      from '../core/api.js';
import { Config }        from '../core/config.js';
import { Loader }        from '../components/loading.js';

/* --------------------------------------------------------------------------
   DOM refs
   -------------------------------------------------------------------------- */
const form              = document.getElementById('registerForm');
const firstNameEnInput  = document.getElementById('firstNameEn');
const lastNameEnInput   = document.getElementById('lastNameEn');
const displayNameEnInput = document.getElementById('displayNameEn');
const firstNameArInput  = document.getElementById('firstNameAr');
const lastNameArInput   = document.getElementById('lastNameAr');
const displayNameArInput = document.getElementById('displayNameAr');
const dateOfBirthInput  = document.getElementById('dateOfBirth');
const genderIdSelect    = document.getElementById('genderId');
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
const SPECIAL_RE      = /[!@#$%^&*(),.?"':{}|<>]/;

/* Track whether the user has manually edited the display name fields */
let _displayNameEnEdited = false;
let _displayNameArEdited = false;

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
   Display name auto-fill from first + last name
   -------------------------------------------------------------------------- */
function _autoFillDisplayNameEn() {
  if (_displayNameEnEdited) return;
  const first = firstNameEnInput?.value.trim() || '';
  const last  = lastNameEnInput?.value.trim()  || '';
  if (displayNameEnInput) {
    displayNameEnInput.value = [first, last].filter(Boolean).join(' ');
  }
}

function _autoFillDisplayNameAr() {
  if (_displayNameArEdited) return;
  const first = firstNameArInput?.value.trim() || '';
  const last  = lastNameArInput?.value.trim()  || '';
  if (displayNameArInput) {
    displayNameArInput.value = [first, last].filter(Boolean).join(' ');
  }
}

firstNameEnInput?.addEventListener('input', _autoFillDisplayNameEn);
lastNameEnInput?.addEventListener('input',  _autoFillDisplayNameEn);
firstNameArInput?.addEventListener('input', _autoFillDisplayNameAr);
lastNameArInput?.addEventListener('input',  _autoFillDisplayNameAr);

/* Mark display name as manually edited when the user types in it directly */
displayNameEnInput?.addEventListener('input', () => { _displayNameEnEdited = true; });
displayNameArInput?.addEventListener('input', () => { _displayNameArEdited = true; });

/* --------------------------------------------------------------------------
   Password strength indicator
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

passwordInput?.addEventListener('input', () => {
  updateStrengthHints(passwordInput.value);
  if (confirmPwdInput.value) _validateConfirmPassword();
});

/* --------------------------------------------------------------------------
   Confirm password client-side check
   -------------------------------------------------------------------------- */
function _validateConfirmPassword() {
  const match = confirmPwdInput.value === passwordInput.value;
  confirmPwdInput.setCustomValidity(match ? '' : t('auth.register.confirm_password_error'));
  return match;
}

confirmPwdInput?.addEventListener('input', _validateConfirmPassword);

/* --------------------------------------------------------------------------
   Date of birth — must not be in the future
   -------------------------------------------------------------------------- */
function _validateDateOfBirth() {
  const val = dateOfBirthInput?.value;
  if (!val) {
    dateOfBirthInput?.setCustomValidity('');
    return true;
  }
  const dob    = new Date(val);
  const today  = new Date();
  today.setHours(0, 0, 0, 0);
  const valid  = dob <= today;
  dateOfBirthInput?.setCustomValidity(valid ? '' : t('auth.register.date_of_birth_error'));
  return valid;
}

dateOfBirthInput?.addEventListener('change', _validateDateOfBirth);

/* --------------------------------------------------------------------------
   Profile image handling
   -------------------------------------------------------------------------- */
let _selectedImage = null;

function _clearImage() {
  _selectedImage = null;
  if (imageInput) imageInput.value = '';
  imagePreviewWrap?.classList.add('d-none');
  if (imagePreview) imagePreview.src = '';
}

imageInput?.addEventListener('change', () => {
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
    imagePreviewWrap?.classList.remove('d-none');
  };
  reader.readAsDataURL(file);
});

removeImageBtn?.addEventListener('click', () => {
  _clearImage();
  hideErrors();
});

/* --------------------------------------------------------------------------
   Form submit
   -------------------------------------------------------------------------- */
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideErrors();

  _validateConfirmPassword();
  _validateDateOfBirth();

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
  Loader.setButtonLoading(submitBtn);

  try {
    const result = await AuthService.register({
      firstNameEn:    firstNameEnInput.value,
      lastNameEn:     lastNameEnInput.value,
      displayNameEn:  displayNameEnInput.value,
      firstNameAr:    firstNameArInput?.value  || null,
      lastNameAr:     lastNameArInput?.value   || null,
      displayNameAr:  displayNameArInput?.value || null,
      dateOfBirth:    dateOfBirthInput?.value  || null,
      genderId:       genderIdSelect?.value ? Number(genderIdSelect.value) : null,
      email:          emailInput.value,
      password:       pwd,
      profileImage:   _selectedImage,
    });

    setSession(result);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.errors?.length) {
        showErrors(err.errors);
      } else {
        if (err.code === Config.RESPONSE_CODES.CONFLICT) {
          showErrors([t('auth.register.email_taken')]);
          emailInput.classList.add('is-invalid');
        } else {
          showErrors([err.message || t('errors.unknown')]);
        }
      }
    }
  } finally {
    Loader.clearButtonLoading(submitBtn);
  }
});

/* Clear errors / invalid highlight on input */
[firstNameEnInput, lastNameEnInput, displayNameEnInput, emailInput].forEach(el => {
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

  /* Set date of birth max to today to prevent future selection via browser UI */
  if (dateOfBirthInput) {
    const today = new Date();
    const yyyy  = today.getFullYear();
    const mm    = String(today.getMonth() + 1).padStart(2, '0');
    const dd    = String(today.getDate()).padStart(2, '0');
    dateOfBirthInput.max = `${yyyy}-${mm}-${dd}`;
  }
}

init();
