/**
 * pages/profile.js — MyMoney
 * Profile page: avatar, personal info edit.
 */

import { initI18n, t, getLanguage }        from '../core/i18n.js';
import { initLayout, updateLayoutUser }    from '../components/layout.js';
import { guardPage, updateCurrentUser }    from '../core/auth.js';
import { initOnboarding }                 from '../components/onboarding.js';
import { ProfileService }                  from '../services/profile-service.js';
import { ApiError }                        from '../core/api.js';
import { Config }                          from '../core/config.js';
import { Loader }                          from '../components/loading.js';
import { showSuccess, showError }          from '../components/toast.js';

/* --------------------------------------------------------------------------
   State
   -------------------------------------------------------------------------- */
let _profile             = null;
let _selectedFile        = null;
let _blobUrl             = null;
let _scale               = 1;
let _tx                  = 0;
let _ty                  = 0;
let _isPanning           = false;
let _panStartX           = 0;
let _panStartY           = 0;
let _panStartTx          = 0;
let _panStartTy          = 0;
let _pinchStartDist      = 0;
let _pinchStartScale     = 0;
let _removeConfirmActive = false;
let _removeConfirmTimer  = null;

const ZOOM_MIN  = 0.5;
const ZOOM_MAX  = 4.0;
const ZOOM_STEP = 1.3;

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

/* DOM refs — avatar upload modal (drop zone) */
const avatarUploadModalEl = document.getElementById('avatarUploadModal');
const avatarDropZone      = document.getElementById('avatarDropZone');
const avatarFileInput     = document.getElementById('avatarFileInput');
const avatarBrowseBtn     = document.getElementById('avatarBrowseBtn');

/* DOM refs — avatar inspect modal */
const avatarInspectModalEl   = document.getElementById('avatarInspectModal');
const avatarInspectCanvas    = document.getElementById('avatarInspectCanvas');
const avatarInspectImg       = document.getElementById('avatarInspectImg');
const avatarCirclePreviewImg = document.getElementById('avatarCirclePreviewImg');
const avatarZoomOutBtn       = document.getElementById('avatarZoomOutBtn');
const avatarZoomInBtn        = document.getElementById('avatarZoomInBtn');
const avatarZoomResetBtn     = document.getElementById('avatarZoomResetBtn');
const avatarZoomLevelLabel   = document.getElementById('avatarZoomLevelLabel');
const avatarMetaFileSize     = document.getElementById('avatarMetaFileSize');
const avatarMetaDimensions   = document.getElementById('avatarMetaDimensions');
const avatarInspectActions   = document.getElementById('avatarInspectActions');
const saveAvatarBtn          = document.getElementById('saveAvatarBtn');
const chooseAnotherBtn       = document.getElementById('chooseAnotherBtn');

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

function _formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function _getTouchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
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
  } else {
    avatarImg.style.display = 'none';
    avatarImg.src = '';
    avatarInitials.style.display = '';
    avatarInitials.textContent = _initials(displayName);
    avatarCircle.style.cursor = 'default';
    avatarCircle.title = '';
    removeAvatarBtn.classList.add('d-none');
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
   Avatar — click circle to view current photo
   -------------------------------------------------------------------------- */
avatarCircle.addEventListener('click', () => {
  if (!_profile?.profileImageUrl) return;
  _openInspectModalViewMode();
});

/* --------------------------------------------------------------------------
   Zoom / pan — inspect modal
   -------------------------------------------------------------------------- */
function _applyTransform(animated) {
  if (animated) {
    avatarInspectImg.classList.add('zoom-animated');
    setTimeout(() => avatarInspectImg.classList.remove('zoom-animated'), 180);
  }
  avatarInspectImg.style.transform = `translate(${_tx}px, ${_ty}px) scale(${_scale})`;
  avatarZoomLevelLabel.textContent  = `${Math.round(_scale * 100)}%`;
  avatarZoomOutBtn.disabled = _scale <= ZOOM_MIN;
  avatarZoomInBtn.disabled  = _scale >= ZOOM_MAX;
}

function _zoomTo(newScale, animated = true) {
  _scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, newScale));
  if (_scale <= 1) { _tx = 0; _ty = 0; }
  _applyTransform(animated);
}

function _resetView(animated = true) {
  _scale = 1; _tx = 0; _ty = 0;
  _applyTransform(animated);
}

/* Mouse wheel zoom */
avatarInspectCanvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  _zoomTo(_scale * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP));
}, { passive: false });

/* Mouse drag pan */
avatarInspectCanvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  _isPanning  = true;
  _panStartX  = e.clientX; _panStartY  = e.clientY;
  _panStartTx = _tx;       _panStartTy = _ty;
  avatarInspectCanvas.classList.add('is-panning');
});

window.addEventListener('mousemove', (e) => {
  if (!_isPanning) return;
  _tx = _panStartTx + (e.clientX - _panStartX);
  _ty = _panStartTy + (e.clientY - _panStartY);
  _applyTransform(false);
});

window.addEventListener('mouseup', () => {
  if (!_isPanning) return;
  _isPanning = false;
  avatarInspectCanvas.classList.remove('is-panning');
});

/* Touch pinch + pan */
avatarInspectCanvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    _isPanning  = true;
    _panStartX  = e.touches[0].clientX; _panStartY  = e.touches[0].clientY;
    _panStartTx = _tx;                  _panStartTy = _ty;
  } else if (e.touches.length === 2) {
    _isPanning       = false;
    _pinchStartDist  = _getTouchDist(e.touches);
    _pinchStartScale = _scale;
  }
}, { passive: true });

avatarInspectCanvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (e.touches.length === 1 && _isPanning) {
    _tx = _panStartTx + (e.touches[0].clientX - _panStartX);
    _ty = _panStartTy + (e.touches[0].clientY - _panStartY);
    _applyTransform(false);
  } else if (e.touches.length === 2) {
    _zoomTo(_pinchStartScale * (_getTouchDist(e.touches) / _pinchStartDist), false);
  }
}, { passive: false });

avatarInspectCanvas.addEventListener('touchend', () => { _isPanning = false; });

/* Zoom buttons */
avatarZoomOutBtn.addEventListener('click',   () => _zoomTo(_scale / ZOOM_STEP));
avatarZoomInBtn.addEventListener('click',    () => _zoomTo(_scale * ZOOM_STEP));
avatarZoomResetBtn.addEventListener('click', () => _resetView());

/* --------------------------------------------------------------------------
   Avatar inspect modal — open / close / upload
   -------------------------------------------------------------------------- */
function _revokeBlobUrl() {
  if (_blobUrl) { URL.revokeObjectURL(_blobUrl); _blobUrl = null; }
}

function _loadFileMetadata(file, url) {
  avatarMetaFileSize.textContent   = _formatFileSize(file.size);
  avatarMetaDimensions.textContent = '—';
  const img = new Image();
  img.onload = () => { avatarMetaDimensions.textContent = `${img.naturalWidth} × ${img.naturalHeight}`; };
  img.src = url;
}

function _openInspectModal() {
  if (!_blobUrl) return;
  avatarInspectModalEl.dataset.mode = 'upload';
  avatarInspectImg.src              = _blobUrl;
  avatarCirclePreviewImg.src        = _blobUrl;
  avatarInspectActions.classList.remove('d-none');
  _loadFileMetadata(_selectedFile, _blobUrl);
  _resetView(false);
  bootstrap.Modal.getOrCreateInstance(avatarInspectModalEl).show();
}

function _openInspectModalViewMode() {
  const url = _buildImageUrl(_profile.profileImageUrl);
  avatarInspectModalEl.dataset.mode = 'view';
  avatarInspectImg.src              = url;
  avatarCirclePreviewImg.src        = url;
  avatarInspectActions.classList.add('d-none');
  avatarMetaFileSize.textContent    = '—';
  avatarMetaDimensions.textContent  = '—';
  _resetView(false);
  bootstrap.Modal.getOrCreateInstance(avatarInspectModalEl).show();
}

/* Cleanup on close */
avatarInspectModalEl.addEventListener('hidden.bs.modal', () => {
  _isPanning = false;
  avatarInspectCanvas.classList.remove('is-panning');
  _revokeBlobUrl();
  _selectedFile                     = null;
  avatarInspectImg.src              = '';
  avatarCirclePreviewImg.src        = '';
  avatarFileInput.value             = '';
  avatarInspectModalEl.dataset.mode = '';
  _resetView(false);
});

/* Save photo */
saveAvatarBtn.addEventListener('click', async () => {
  if (!_selectedFile) return;
  Loader.setButtonLoading(saveAvatarBtn);
  try {
    const newImageUrl = await ProfileService.updateProfilePicture(_selectedFile);
    _profile.profileImageUrl = newImageUrl;
    bootstrap.Modal.getOrCreateInstance(avatarInspectModalEl).hide();
    _renderHero(_profile);
    const fullUrl = _buildImageUrl(newImageUrl);
    updateLayoutUser({ profileImageUrl: fullUrl });
    updateCurrentUser({ profileImageUrl: fullUrl });
    _playAvatarUpdateAnimation();
    showSuccess(t('profile.avatar_upload_success'));
  } catch (err) {
    showError(err instanceof ApiError ? err.message : t('errors.unknown'));
  } finally {
    Loader.clearButtonLoading(saveAvatarBtn);
  }
});

/* Choose another photo */
chooseAnotherBtn.addEventListener('click', () => {
  avatarInspectModalEl.addEventListener('hidden.bs.modal', () => {
    bootstrap.Modal.getOrCreateInstance(avatarUploadModalEl).show();
  }, { once: true });
  bootstrap.Modal.getOrCreateInstance(avatarInspectModalEl).hide();
});

/* Avatar pop animation */
function _playAvatarUpdateAnimation() {
  avatarCircle.classList.remove('avatar-pop');
  void avatarCircle.offsetWidth;
  avatarCircle.classList.add('avatar-pop');
  avatarCircle.addEventListener('animationend', () => {
    avatarCircle.classList.remove('avatar-pop');
  }, { once: true });
}

/* --------------------------------------------------------------------------
   Avatar upload modal — drop zone
   -------------------------------------------------------------------------- */
function _handleFileSelected(file) {
  if (!file) return;

  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  const maxSize = 5 * 1024 * 1024;

  if (!allowed.includes(file.type)) {
    showError(t('auth.register.profile_image_error_type'));
    avatarFileInput.value = '';
    return;
  }
  if (file.size > maxSize) {
    showError(t('auth.register.profile_image_error_size'));
    avatarFileInput.value = '';
    return;
  }

  _selectedFile = file;
  _revokeBlobUrl();
  _blobUrl = URL.createObjectURL(file);

  avatarUploadModalEl.addEventListener('hidden.bs.modal', _openInspectModal, { once: true });
  bootstrap.Modal.getOrCreateInstance(avatarUploadModalEl).hide();
}

/* Open upload modal */
uploadAvatarBtn.addEventListener('click', () => {
  bootstrap.Modal.getOrCreateInstance(avatarUploadModalEl).show();
});

/* Drop zone — click + keyboard */
avatarDropZone.addEventListener('click',   () => avatarFileInput.click());
avatarDropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); avatarFileInput.click(); }
});

/* Browse button */
avatarBrowseBtn.addEventListener('click', () => avatarFileInput.click());

/* Drop zone — drag/drop */
avatarDropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  avatarDropZone.classList.add('drop-active');
});
avatarDropZone.addEventListener('dragleave', () => {
  avatarDropZone.classList.remove('drop-active');
});
avatarDropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  avatarDropZone.classList.remove('drop-active');
  _handleFileSelected(e.dataTransfer.files?.[0]);
});

/* File input */
avatarFileInput.addEventListener('change', () => {
  _handleFileSelected(avatarFileInput.files?.[0]);
  avatarFileInput.value = '';
});

/* --------------------------------------------------------------------------
   Remove avatar — two-step confirmation
   -------------------------------------------------------------------------- */
function _resetRemoveBtn() {
  _removeConfirmActive = false;
  clearTimeout(_removeConfirmTimer);
  _removeConfirmTimer = null;
  removeAvatarBtn.innerHTML = `<i class="bi bi-trash3 me-1" aria-hidden="true"></i><span>${t('profile.avatar_remove')}</span>`;
  removeAvatarBtn.classList.remove('btn-danger');
  removeAvatarBtn.classList.add('btn-outline-danger');
}

removeAvatarBtn.addEventListener('click', async () => {
  if (!_removeConfirmActive) {
    _removeConfirmActive = true;
    removeAvatarBtn.innerHTML = `<i class="bi bi-exclamation-triangle me-1" aria-hidden="true"></i><span>${t('profile.avatar_remove_confirm_btn')}</span>`;
    removeAvatarBtn.classList.remove('btn-outline-danger');
    removeAvatarBtn.classList.add('btn-danger');
    _removeConfirmTimer = setTimeout(_resetRemoveBtn, 3000);
    return;
  }

  clearTimeout(_removeConfirmTimer);
  _removeConfirmActive = false;
  Loader.setButtonLoading(removeAvatarBtn);
  try {
    await ProfileService.removeProfilePicture();
    _profile.profileImageUrl = null;
    _renderHero(_profile);
    updateLayoutUser({ profileImageUrl: '/assets/images/avatar/avatar.jpg' });
    updateCurrentUser({ profileImageUrl: null });
    showSuccess(t('profile.avatar_remove_success'));
  } catch (err) {
    showError(err instanceof ApiError ? err.message : t('errors.unknown'));
  } finally {
    Loader.clearButtonLoading(removeAvatarBtn);
    _resetRemoveBtn();
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
  initOnboarding();
}

init();
