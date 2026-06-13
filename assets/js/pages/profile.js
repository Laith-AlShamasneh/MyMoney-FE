/**
 * pages/profile.js — MyMoney
 * Profile page: avatar, personal info edit, email change.
 */

import { initI18n, t, getLanguage }        from '../core/i18n.js';
import { initLayout, updateLayoutUser }    from '../components/layout.js';
import { guardPage }                       from '../core/auth.js';
import { ProfileService }                  from '../services/profile-service.js';
import { ApiError }                        from '../core/api.js';
import { Config }                          from '../core/config.js';
import { Loader }                          from '../components/loading.js';
import { showSuccess, showError }          from '../components/toast.js';

/* --------------------------------------------------------------------------
   State
   -------------------------------------------------------------------------- */
let _profile = null; // GetProfileResponse

/* --------------------------------------------------------------------------
   DOM refs — avatar hero
   -------------------------------------------------------------------------- */
const heroSkeleton    = document.getElementById('heroSkeleton');
const heroContent     = document.getElementById('heroContent');
const avatarCircle    = document.getElementById('avatarCircle');
const avatarImg       = document.getElementById('avatarImg');
const avatarInitials  = document.getElementById('avatarInitials');
const heroDisplayName = document.getElementById('heroDisplayName');
const heroEmail       = document.getElementById('heroEmail');
const avatarFileInput = document.getElementById('avatarFileInput');
const uploadAvatarBtn = document.getElementById('uploadAvatarBtn');
const removeAvatarBtn = document.getElementById('removeAvatarBtn');
const previewAvatarBtn= document.getElementById('previewAvatarBtn');
const avatarPreviewImg= document.getElementById('avatarPreviewImg');

/* DOM refs — personal info */
const infoSkeleton   = document.getElementById('infoSkeleton');
const infoContent    = document.getElementById('infoContent');
const editInfoBtn    = document.getElementById('editInfoBtn');
const infoView       = document.getElementById('infoView');
const infoForm       = document.getElementById('infoForm');
const infoFormError  = document.getElementById('infoFormError');
const infoFormErrList= document.getElementById('infoFormErrorList');
const saveInfoBtn    = document.getElementById('saveInfoBtn');
const cancelInfoBtn  = document.getElementById('cancelInfoBtn');

/* View-mode display fields */
const vFirstNameEn   = document.getElementById('vFirstNameEn');
const vLastNameEn    = document.getElementById('vLastNameEn');
const vDisplayNameEn = document.getElementById('vDisplayNameEn');
const vFirstNameAr   = document.getElementById('vFirstNameAr');
const vLastNameAr    = document.getElementById('vLastNameAr');
const vDisplayNameAr = document.getElementById('vDisplayNameAr');
const vDateOfBirth   = document.getElementById('vDateOfBirth');
const vGender        = document.getElementById('vGender');

/* Edit-form inputs */
const fFirstNameEn   = document.getElementById('fFirstNameEn');
const fLastNameEn    = document.getElementById('fLastNameEn');
const fDisplayNameEn = document.getElementById('fDisplayNameEn');
const fFirstNameAr   = document.getElementById('fFirstNameAr');
const fLastNameAr    = document.getElementById('fLastNameAr');
const fDisplayNameAr = document.getElementById('fDisplayNameAr');
const fDateOfBirth   = document.getElementById('fDateOfBirth');
const fGender        = document.getElementById('fGender');

/* DOM refs — email section */
const emailSkeleton        = document.getElementById('emailSkeleton');
const emailContent         = document.getElementById('emailContent');
const emailDisplay         = document.getElementById('emailDisplay');
const emailVerifiedBadge   = document.getElementById('emailVerifiedBadge');
const emailUnverifiedBadge = document.getElementById('emailUnverifiedBadge');
const pendingEmailSection  = document.getElementById('pendingEmailSection');
const pendingEmailAddress  = document.getElementById('pendingEmailAddress');
const cancelEmailChangeBtn = document.getElementById('cancelEmailChangeBtn');
const changeEmailFormWrap  = document.getElementById('changeEmailFormWrap');
const changeEmailBtnWrap   = document.getElementById('changeEmailBtnWrap');
const showChangeEmailFormBtn = document.getElementById('showChangeEmailFormBtn');
const changeEmailForm      = document.getElementById('changeEmailForm');
const newEmailInput        = document.getElementById('newEmailInput');
const emailChangePwdInput  = document.getElementById('emailChangePwdInput');
const submitEmailChangeBtn = document.getElementById('submitEmailChangeBtn');
const cancelEmailFormBtn   = document.getElementById('cancelEmailFormBtn');
const emailFormError       = document.getElementById('emailFormError');
const emailFormErrList     = document.getElementById('emailFormErrorList');

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */
function _esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function _buildImageUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return Config.API_BASE_URL + path;
}

function _initials(displayName) {
  if (!displayName) return '?';
  const parts = displayName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function _genderLabel(id) {
  const map = { 1: 'profile.gender_male', 2: 'profile.gender_female', 3: 'profile.gender_prefer_not_to_say' };
  return id && map[id] ? t(map[id]) : t('profile.field_not_set');
}

function _formatDate(isoString) {
  if (!isoString) return t('profile.field_not_set');
  try {
    const lang = getLanguage() === 'ar' ? 'ar-SA' : 'en-US';
    return new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'long', day: 'numeric' })
      .format(new Date(isoString));
  } catch {
    return isoString.split('T')[0];
  }
}

function _showInfoErrors(messages) {
  infoFormErrList.innerHTML = messages.map(m => `<li>${_esc(m)}</li>`).join('');
  infoFormError.classList.remove('d-none');
}

function _hideInfoErrors() {
  infoFormError.classList.add('d-none');
  infoFormErrList.innerHTML = '';
}

function _showEmailErrors(messages) {
  emailFormErrList.innerHTML = messages.map(m => `<li>${_esc(m)}</li>`).join('');
  emailFormError.classList.remove('d-none');
}

function _hideEmailErrors() {
  emailFormError.classList.add('d-none');
  emailFormErrList.innerHTML = '';
}

/* --------------------------------------------------------------------------
   Avatar rendering
   -------------------------------------------------------------------------- */
function _renderAvatar(profileImageUrl, displayName) {
  const url = _buildImageUrl(profileImageUrl);
  if (url) {
    avatarImg.src = url;
    avatarImg.style.display = 'block';
    avatarInitials.style.display = 'none';
    avatarCircle.style.cursor = 'pointer';
    removeAvatarBtn.classList.remove('d-none');
    previewAvatarBtn.classList.remove('d-none');
    avatarPreviewImg.src = url;
  } else {
    avatarImg.style.display = 'none';
    avatarImg.src = '';
    avatarInitials.style.display = '';
    avatarInitials.textContent = _initials(displayName);
    avatarCircle.style.cursor = 'default';
    removeAvatarBtn.classList.add('d-none');
    previewAvatarBtn.classList.add('d-none');
    avatarPreviewImg.src = '';
  }
}

/* --------------------------------------------------------------------------
   Info view rendering
   -------------------------------------------------------------------------- */
function _renderInfoView(p) {
  const na = t('profile.field_not_set');
  vFirstNameEn.textContent   = p.firstNameEn   || na;
  vLastNameEn.textContent    = p.lastNameEn    || na;
  vDisplayNameEn.textContent = p.displayNameEn || na;
  vFirstNameAr.textContent   = p.firstNameAr   || na;
  vLastNameAr.textContent    = p.lastNameAr    || na;
  vDisplayNameAr.textContent = p.displayNameAr || na;
  vDateOfBirth.textContent   = p.dateOfBirth ? _formatDate(p.dateOfBirth) : na;
  vGender.textContent        = _genderLabel(p.genderId);
}

/* --------------------------------------------------------------------------
   Email section rendering
   -------------------------------------------------------------------------- */
function _renderEmailSection(p) {
  emailDisplay.textContent = p.email || '';

  if (p.isEmailConfirmed) {
    emailVerifiedBadge.classList.remove('d-none');
    emailUnverifiedBadge.classList.add('d-none');
  } else {
    emailVerifiedBadge.classList.add('d-none');
    emailUnverifiedBadge.classList.remove('d-none');
  }

  if (p.hasPendingEmailChange && p.pendingEmail) {
    pendingEmailAddress.textContent = p.pendingEmail;
    pendingEmailSection.classList.remove('d-none');
    changeEmailBtnWrap.classList.add('d-none');
    changeEmailFormWrap.classList.add('d-none');
  } else {
    pendingEmailSection.classList.add('d-none');
    changeEmailBtnWrap.classList.remove('d-none');
  }
}

/* --------------------------------------------------------------------------
   Hero rendering
   -------------------------------------------------------------------------- */
function _renderHero(p) {
  const lang = getLanguage();
  const displayName = (lang === 'ar' && p.displayNameAr) ? p.displayNameAr : p.displayNameEn;
  heroDisplayName.textContent = displayName || p.displayNameEn;
  heroEmail.textContent = p.email || '';
  _renderAvatar(p.profileImageUrl, displayName || p.displayNameEn);
}

/* --------------------------------------------------------------------------
   Load profile
   -------------------------------------------------------------------------- */
async function loadProfile() {
  try {
    _profile = await ProfileService.getProfile();
  } catch (err) {
    showError(err instanceof ApiError ? err.message : t('errors.unknown'));
    return;
  }

  /* Reveal hero */
  heroSkeleton.classList.add('d-none');
  heroContent.classList.remove('d-none');
  _renderHero(_profile);

  /* Reveal info section */
  infoSkeleton.classList.add('d-none');
  infoContent.classList.remove('d-none');
  _renderInfoView(_profile);

  /* Reveal email section */
  emailSkeleton.classList.add('d-none');
  emailContent.classList.remove('d-none');
  _renderEmailSection(_profile);
}

/* --------------------------------------------------------------------------
   Avatar upload / remove
   -------------------------------------------------------------------------- */
uploadAvatarBtn.addEventListener('click', () => avatarFileInput.click());

avatarFileInput.addEventListener('change', async () => {
  const file = avatarFileInput.files?.[0];
  if (!file) return;
  avatarFileInput.value = ''; // reset so same file can be re-selected

  Loader.setButtonLoading(uploadAvatarBtn);
  try {
    const result = await ProfileService.updateProfilePicture(file);
    /* result is UpdateProfileResponse: { displayNameEn, displayNameAr, profileImageUrl } */
    _profile.profileImageUrl = result.profileImageUrl;
    _renderAvatar(result.profileImageUrl, result.displayNameEn);
    /* Sync layout navbar/sidebar avatar */
    updateLayoutUser({ profileImageUrl: _buildImageUrl(result.profileImageUrl) });
    showSuccess(t('profile.avatar_upload_success'));
  } catch (err) {
    showError(err instanceof ApiError ? err.message : t('errors.unknown'));
  } finally {
    Loader.clearButtonLoading(uploadAvatarBtn);
  }
});

removeAvatarBtn.addEventListener('click', async () => {
  if (!window.confirm(t('profile.avatar_remove_confirm'))) return;
  Loader.setButtonLoading(removeAvatarBtn);
  try {
    await ProfileService.removeProfilePicture();
    _profile.profileImageUrl = null;
    _renderAvatar(null, _profile.displayNameEn);
    _renderHero(_profile);
    updateLayoutUser({ profileImageUrl: '/assets/images/avatar/avatar.jpg' });
    showSuccess(t('profile.avatar_remove_success'));
  } catch (err) {
    showError(err instanceof ApiError ? err.message : t('errors.unknown'));
  } finally {
    Loader.clearButtonLoading(removeAvatarBtn);
  }
});

/* Open avatar preview modal on circle click (only when image exists) */
avatarCircle.addEventListener('click', () => {
  if (_profile?.profileImageUrl) {
    previewAvatarBtn.click();
  }
});

/* --------------------------------------------------------------------------
   Personal info edit / save
   -------------------------------------------------------------------------- */
function _populateEditForm(p) {
  fFirstNameEn.value   = p.firstNameEn   || '';
  fLastNameEn.value    = p.lastNameEn    || '';
  fDisplayNameEn.value = p.displayNameEn || '';
  fFirstNameAr.value   = p.firstNameAr   || '';
  fLastNameAr.value    = p.lastNameAr    || '';
  fDisplayNameAr.value = p.displayNameAr || '';
  fDateOfBirth.value   = p.dateOfBirth ? p.dateOfBirth.split('T')[0] : '';
  fGender.value        = p.genderId ? String(p.genderId) : '';
}

function _showEditForm() {
  _populateEditForm(_profile);
  _hideInfoErrors();
  infoForm.classList.remove('was-validated');
  infoView.classList.add('d-none');
  infoForm.classList.remove('d-none');
  editInfoBtn.classList.add('d-none');
  fFirstNameEn.focus();
}

function _showInfoView() {
  infoForm.classList.add('d-none');
  infoView.classList.remove('d-none');
  editInfoBtn.classList.remove('d-none');
}

editInfoBtn.addEventListener('click', _showEditForm);
cancelInfoBtn.addEventListener('click', _showInfoView);

infoForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  _hideInfoErrors();

  if (!infoForm.checkValidity()) {
    infoForm.classList.add('was-validated');
    return;
  }
  infoForm.classList.remove('was-validated');

  Loader.setButtonLoading(saveInfoBtn);
  try {
    const result = await ProfileService.updateProfile({
      firstNameEn:   fFirstNameEn.value.trim(),
      lastNameEn:    fLastNameEn.value.trim(),
      displayNameEn: fDisplayNameEn.value.trim(),
      firstNameAr:   fFirstNameAr.value.trim()   || null,
      lastNameAr:    fLastNameAr.value.trim()    || null,
      displayNameAr: fDisplayNameAr.value.trim() || null,
      dateOfBirth:   fDateOfBirth.value          || null,
      genderId:      fGender.value ? Number(fGender.value) : null,
    });

    /* Merge result back into cached profile */
    _profile.displayNameEn = result.displayNameEn;
    _profile.displayNameAr = result.displayNameAr;
    /* Re-read the other fields from the form (server echoes them back or we trust what we sent) */
    _profile.firstNameEn   = fFirstNameEn.value.trim();
    _profile.lastNameEn    = fLastNameEn.value.trim();
    _profile.firstNameAr   = fFirstNameAr.value.trim()   || null;
    _profile.lastNameAr    = fLastNameAr.value.trim()    || null;
    _profile.dateOfBirth   = fDateOfBirth.value           || null;
    _profile.genderId      = fGender.value ? Number(fGender.value) : null;

    _renderInfoView(_profile);
    _renderHero(_profile);
    updateLayoutUser({ displayName: result.displayNameEn });
    _showInfoView();
    showSuccess(t('profile.info_save_success'));
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.errors?.length) _showInfoErrors(err.errors);
      else _showInfoErrors([err.message || t('errors.unknown')]);
    }
  } finally {
    Loader.clearButtonLoading(saveInfoBtn);
  }
});

/* --------------------------------------------------------------------------
   Email change flow
   -------------------------------------------------------------------------- */
showChangeEmailFormBtn.addEventListener('click', () => {
  changeEmailBtnWrap.classList.add('d-none');
  changeEmailFormWrap.classList.remove('d-none');
  _hideEmailErrors();
  changeEmailForm.classList.remove('was-validated');
  newEmailInput.value = '';
  emailChangePwdInput.value = '';
  newEmailInput.focus();
});

cancelEmailFormBtn.addEventListener('click', () => {
  changeEmailFormWrap.classList.add('d-none');
  changeEmailBtnWrap.classList.remove('d-none');
  _hideEmailErrors();
});

changeEmailForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  _hideEmailErrors();

  if (!changeEmailForm.checkValidity()) {
    changeEmailForm.classList.add('was-validated');
    return;
  }
  changeEmailForm.classList.remove('was-validated');

  Loader.setButtonLoading(submitEmailChangeBtn);
  try {
    await ProfileService.requestEmailChange({
      newEmail:        newEmailInput.value.trim(),
      currentPassword: emailChangePwdInput.value,
    });

    /* Update cached profile state */
    _profile.hasPendingEmailChange = true;
    _profile.pendingEmail = newEmailInput.value.trim();

    changeEmailFormWrap.classList.add('d-none');
    _renderEmailSection(_profile);
    showSuccess(t('profile.email_change_success'));
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.errors?.length) _showEmailErrors(err.errors);
      else _showEmailErrors([err.message || t('errors.unknown')]);
    }
  } finally {
    Loader.clearButtonLoading(submitEmailChangeBtn);
  }
});

cancelEmailChangeBtn.addEventListener('click', async () => {
  if (!window.confirm(t('profile.email_pending_cancel_confirm'))) return;
  Loader.setButtonLoading(cancelEmailChangeBtn);
  try {
    await ProfileService.cancelEmailChange();
    _profile.hasPendingEmailChange = false;
    _profile.pendingEmail = null;
    _renderEmailSection(_profile);
    showSuccess(t('profile.email_pending_cancel_success'));
  } catch (err) {
    showError(err instanceof ApiError ? err.message : t('errors.unknown'));
  } finally {
    Loader.clearButtonLoading(cancelEmailChangeBtn);
  }
});

/* --------------------------------------------------------------------------
   Init
   -------------------------------------------------------------------------- */
async function init() {
  await initI18n();
  await guardPage();
  initLayout();
  await loadProfile();
}

init();
