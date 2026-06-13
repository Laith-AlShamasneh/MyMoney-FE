/**
 * pages/profile.js — MyMoney
 * Profile page: avatar, personal info edit.
 */

import { initI18n, t, getLanguage }        from '../core/i18n.js';
import { initLayout, updateLayoutUser }    from '../components/layout.js';
import { guardPage, updateCurrentUser }    from '../core/auth.js';
import { ProfileService }                  from '../services/profile-service.js';
import { ApiError }                        from '../core/api.js';
import { Config }                          from '../core/config.js';
import { Loader }                          from '../components/loading.js';
import { showSuccess, showError }          from '../components/toast.js';

/* --------------------------------------------------------------------------
   State
   -------------------------------------------------------------------------- */
let _profile      = null;
let _selectedFile = null;

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
const uploadAvatarBtn = document.getElementById('uploadAvatarBtn');
const removeAvatarBtn = document.getElementById('removeAvatarBtn');

/* DOM refs — avatar upload modal */
const avatarUploadModalEl    = document.getElementById('avatarUploadModal');
const avatarDropZone         = document.getElementById('avatarDropZone');
const avatarFileInput        = document.getElementById('avatarFileInput');
const avatarUploadPreview    = document.getElementById('avatarUploadPreview');
const avatarUploadPreviewImg = document.getElementById('avatarUploadPreviewImg');
const avatarUploadFileName   = document.getElementById('avatarUploadFileName');
const clearUploadBtn         = document.getElementById('clearUploadBtn');
const confirmUploadBtn       = document.getElementById('confirmUploadBtn');

/* DOM refs — avatar preview modal */
const avatarPreviewImg = document.getElementById('avatarPreviewImg');

/* DOM refs — personal info */
const infoSkeleton    = document.getElementById('infoSkeleton');
const infoContent     = document.getElementById('infoContent');
const editInfoBtn     = document.getElementById('editInfoBtn');
const infoView        = document.getElementById('infoView');
const infoForm        = document.getElementById('infoForm');
const infoFormError   = document.getElementById('infoFormError');
const infoFormErrList = document.getElementById('infoFormErrorList');
const saveInfoBtn     = document.getElementById('saveInfoBtn');
const cancelInfoBtn   = document.getElementById('cancelInfoBtn');

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
    avatarCircle.title = t('profile.avatar_preview');
    removeAvatarBtn.classList.remove('d-none');
    avatarPreviewImg.src = url;
  } else {
    avatarImg.style.display = 'none';
    avatarImg.src = '';
    avatarInitials.style.display = '';
    avatarInitials.textContent = _initials(displayName);
    avatarCircle.style.cursor = 'default';
    avatarCircle.title = '';
    removeAvatarBtn.classList.add('d-none');
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

  heroSkeleton.classList.add('d-none');
  heroContent.classList.remove('d-none');
  _renderHero(_profile);

  infoSkeleton.classList.add('d-none');
  infoContent.classList.remove('d-none');
  _renderInfoView(_profile);
}

/* --------------------------------------------------------------------------
   Avatar — click circle to preview
   -------------------------------------------------------------------------- */
avatarCircle.addEventListener('click', () => {
  if (!_profile?.profileImageUrl) return;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('avatarPreviewModal')).show();
});

/* --------------------------------------------------------------------------
   Avatar upload modal
   -------------------------------------------------------------------------- */
function _resetUploadModal() {
  _selectedFile = null;
  avatarFileInput.value = '';
  if (avatarUploadPreviewImg.src.startsWith('blob:')) {
    URL.revokeObjectURL(avatarUploadPreviewImg.src);
  }
  avatarUploadPreviewImg.src = '';
  avatarUploadFileName.textContent = '';
  avatarUploadPreview.classList.add('d-none');
  confirmUploadBtn.classList.add('d-none');
  avatarDropZone.style.borderColor = '';
  avatarDropZone.style.backgroundColor = '';
}

function _handleFileSelected(file) {
  if (!file) return;

  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  const maxSize = 5 * 1024 * 1024;

  if (!allowed.includes(file.type)) {
    showError(t('auth.register.profile_image_error_type'));
    return;
  }
  if (file.size > maxSize) {
    showError(t('auth.register.profile_image_error_size'));
    return;
  }

  _selectedFile = file;
  avatarUploadPreviewImg.src = URL.createObjectURL(file);
  avatarUploadFileName.textContent = file.name;
  avatarUploadPreview.classList.remove('d-none');
  confirmUploadBtn.classList.remove('d-none');
}

/* Open upload modal */
uploadAvatarBtn.addEventListener('click', () => {
  _resetUploadModal();
  bootstrap.Modal.getOrCreateInstance(avatarUploadModalEl).show();
});

/* Reset on modal close */
avatarUploadModalEl.addEventListener('hidden.bs.modal', _resetUploadModal);

/* Drop zone — click */
avatarDropZone.addEventListener('click', () => avatarFileInput.click());
avatarDropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    avatarFileInput.click();
  }
});

/* Drop zone — drag/drop */
avatarDropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  avatarDropZone.style.borderColor = 'var(--mm-primary, #0d6efd)';
  avatarDropZone.style.backgroundColor = 'rgba(13,110,253,0.04)';
});

avatarDropZone.addEventListener('dragleave', () => {
  avatarDropZone.style.borderColor = '';
  avatarDropZone.style.backgroundColor = '';
});

avatarDropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  avatarDropZone.style.borderColor = '';
  avatarDropZone.style.backgroundColor = '';
  _handleFileSelected(e.dataTransfer.files?.[0]);
});

/* File input change */
avatarFileInput.addEventListener('change', () => {
  _handleFileSelected(avatarFileInput.files?.[0]);
});

/* Clear selected file */
clearUploadBtn.addEventListener('click', () => {
  _resetUploadModal();
});

/* Confirm upload */
confirmUploadBtn.addEventListener('click', async () => {
  if (!_selectedFile) return;
  Loader.setButtonLoading(confirmUploadBtn);
  try {
    const result = await ProfileService.updateProfilePicture(_selectedFile);
    _profile.profileImageUrl = result.profileImageUrl;
    _renderAvatar(result.profileImageUrl, result.displayNameEn);
    const fullUrl = _buildImageUrl(result.profileImageUrl);
    updateLayoutUser({ profileImageUrl: fullUrl });
    updateCurrentUser({ profileImageUrl: result.profileImageUrl });
    bootstrap.Modal.getOrCreateInstance(avatarUploadModalEl).hide();
    showSuccess(t('profile.avatar_upload_success'));
  } catch (err) {
    showError(err instanceof ApiError ? err.message : t('errors.unknown'));
  } finally {
    Loader.clearButtonLoading(confirmUploadBtn);
  }
});

/* --------------------------------------------------------------------------
   Remove avatar
   -------------------------------------------------------------------------- */
removeAvatarBtn.addEventListener('click', async () => {
  if (!window.confirm(t('profile.avatar_remove_confirm'))) return;
  Loader.setButtonLoading(removeAvatarBtn);
  try {
    await ProfileService.removeProfilePicture();
    _profile.profileImageUrl = null;
    _renderAvatar(null, _profile.displayNameEn);
    _renderHero(_profile);
    updateLayoutUser({ profileImageUrl: '/assets/images/avatar/avatar.jpg' });
    updateCurrentUser({ profileImageUrl: null });
    showSuccess(t('profile.avatar_remove_success'));
  } catch (err) {
    showError(err instanceof ApiError ? err.message : t('errors.unknown'));
  } finally {
    Loader.clearButtonLoading(removeAvatarBtn);
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

    _profile.displayNameEn = result.displayNameEn;
    _profile.displayNameAr = result.displayNameAr;
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
   Init
   -------------------------------------------------------------------------- */
async function init() {
  await initI18n();
  await guardPage();
  initLayout();
  await loadProfile();
}

init();
