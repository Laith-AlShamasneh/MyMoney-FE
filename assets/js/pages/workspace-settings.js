import { initI18n, t, getLanguage } from '../core/i18n.js';
import { initLayout }               from '../components/layout.js';
import { guardPage }                from '../core/auth.js';
import { WorkspaceService }         from '../services/workspace-service.js';
import { showError, showSuccess }   from '../components/toast.js';
import { Config }                   from '../core/config.js';

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */
const ROLES = {
  1: { key: 'owner',      cls: 'ws-role-owner' },
  2: { key: 'admin',      cls: 'ws-role-admin' },
  3: { key: 'manager',    cls: 'ws-role-manager' },
  4: { key: 'accountant', cls: 'ws-role-accountant' },
  5: { key: 'viewer',     cls: 'ws-role-viewer' },
  6: { key: 'auditor',    cls: 'ws-role-auditor' },
  7: { key: 'guest',      cls: 'ws-role-guest' },
};

const WS_TYPES = {
  1: { icon: '👤', key: 'personal' },
  2: { icon: '👨‍👩‍👧', key: 'family' },
  3: { icon: '🏢', key: 'business' },
  4: { icon: '👥', key: 'team' },
};

const WS_COLORS = ['#2563eb','#7c3aed','#059669','#d97706','#dc2626','#0891b2','#6366f1','#db2777'];

/* --------------------------------------------------------------------------
   Page state
   -------------------------------------------------------------------------- */
let _wsId          = null;
let _wsData        = null;
let _myRoleId      = null;
let _canEdit       = false;
let _selectedTypeId  = 1;
let _selectedColor   = WS_COLORS[0];
let _originalName    = '';

/* --------------------------------------------------------------------------
   DOM refs
   -------------------------------------------------------------------------- */
const skeleton       = document.getElementById('settingsSkeleton');
const form           = document.getElementById('settingsForm');
const nameInput      = document.getElementById('settingNameInput');
const descInput      = document.getElementById('settingDescInput');
const typeGrid       = document.getElementById('settingTypeGrid');
const colorSwatches  = document.getElementById('settingColorSwatches');
const colorStripe    = document.getElementById('wsSettingsStripe');
const saveBtn        = document.getElementById('saveSettingsBtn');
const cancelBtn      = document.getElementById('cancelSettingsBtn');
const wsIdentityLogo = document.getElementById('wsIdentityLogo');
const wsIdentityName = document.getElementById('wsIdentityName');
const wsIdentityType = document.getElementById('wsIdentityType');
const wsIdentityRole = document.getElementById('wsIdentityRole');
const dangerZoneCard = document.getElementById('dangerZoneCard');
const leaveWsCard    = document.getElementById('leaveWsCard');
const leaveWsBtn     = document.getElementById('leaveWsBtn');
const deleteWsBtn    = document.getElementById('deleteWsBtn');
const noEditPermAlert = document.getElementById('noEditPermAlert');

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */
function _wsInitials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

function _roleBadge(roleId) {
  const r = ROLES[roleId] || ROLES[5];
  return `<span class="ws-role-badge ${r.cls}">${t(`workspace.role_${r.key}`)}</span>`;
}

/* --------------------------------------------------------------------------
   Load workspace data + populate form
   -------------------------------------------------------------------------- */
async function loadSettings() {
  try {
    const ws = await WorkspaceService.getById(_wsId);
    _wsData = ws;
    _originalName    = ws.name;
    _selectedTypeId  = ws.typeId || 1;
    _selectedColor   = ws.color || WS_COLORS[0];

    // Sidebar identity card
    const type = WS_TYPES[ws.typeId] || WS_TYPES[1];
    wsIdentityLogo.innerHTML = _wsInitials(ws.name);
    wsIdentityLogo.style.background = _selectedColor;
    wsIdentityName.textContent = ws.name;
    wsIdentityType.textContent = `${type.icon} ${t(`workspace.type_${type.key}`)}`;
    wsIdentityRole.innerHTML   = _roleBadge(_myRoleId);

    // Color stripe
    if (colorStripe) colorStripe.style.background = _selectedColor;

    if (_canEdit) {
      // Populate form
      if (nameInput) nameInput.value = ws.name;
      if (descInput) descInput.value = ws.description || '';

      // Type grid — type is immutable after creation, show as read-only
      typeGrid?.querySelectorAll('.ws-type-option').forEach(btn => {
        btn.classList.toggle('selected', +btn.dataset.typeId === _selectedTypeId);
        btn.setAttribute('disabled', '');
        btn.setAttribute('title', t('workspace.type_immutable_hint'));
      });

      // Color swatches
      colorSwatches?.querySelectorAll('.ws-color-swatch').forEach(sw => {
        sw.classList.toggle('selected', sw.dataset.color === _selectedColor);
      });

      skeleton?.classList.add('d-none');
      form?.classList.remove('d-none');
    } else {
      skeleton?.classList.add('d-none');
      // Render read-only view
      if (form) {
        form.classList.remove('d-none');
        form.querySelectorAll('input, textarea, button, select').forEach(el => el.setAttribute('disabled', ''));
      }
      noEditPermAlert?.classList.remove('d-none');
    }

    // Show danger zone for owner only
    if (_myRoleId === 1) {
      dangerZoneCard?.classList.remove('d-none');
    }

    // Hide leave for owner (can't leave own workspace)
    if (_myRoleId === 1 && leaveWsCard) {
      leaveWsCard.classList.add('d-none');
    }
  } catch {
    showError(t('workspace.error_load'));
  }
}

/* --------------------------------------------------------------------------
   Type + color pickers
   -------------------------------------------------------------------------- */
function initPickers() {
  typeGrid?.querySelectorAll('.ws-type-option').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!_canEdit) return;
      typeGrid.querySelectorAll('.ws-type-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      _selectedTypeId = +btn.dataset.typeId;
    });
  });

  colorSwatches?.querySelectorAll('.ws-color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      if (!_canEdit) return;
      colorSwatches.querySelectorAll('.ws-color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      _selectedColor = sw.dataset.color;
      if (colorStripe) colorStripe.style.background = _selectedColor;
      // Update identity logo color live
      if (wsIdentityLogo) wsIdentityLogo.style.background = _selectedColor;
    });
  });
}

/* --------------------------------------------------------------------------
   Save
   -------------------------------------------------------------------------- */
saveBtn?.addEventListener('click', async () => {
  const name = nameInput?.value.trim();
  if (!name) { nameInput?.classList.add('is-invalid'); return; }
  nameInput?.classList.remove('is-invalid');

  saveBtn.disabled = true;
  try {
    await WorkspaceService.update({
      workspaceId:  _wsId,
      name,
      description:  descInput?.value.trim() || null,
      color:        _selectedColor,
    });
    WorkspaceService.invalidateContext();
    window.dispatchEvent(new CustomEvent('mm-workspace-change', { detail: { workspaceId: _wsId } }));
    showSuccess(t('workspace.settings_saved'));

    // Refresh identity card
    wsIdentityName.textContent = name;
    const type = WS_TYPES[_selectedTypeId] || WS_TYPES[1];
    wsIdentityType.textContent = `${type.icon} ${t(`workspace.type_${type.key}`)}`;
    _originalName = name;
  } catch (e) {
    showError(e?.message || t('workspace.error_save'));
  } finally {
    saveBtn.disabled = false;
  }
});

cancelBtn?.addEventListener('click', () => {
  if (nameInput) nameInput.value = _wsData?.name || '';
  if (descInput) descInput.value = _wsData?.description || '';
  _selectedTypeId = _wsData?.typeId || 1;
  _selectedColor  = _wsData?.color || WS_COLORS[0];
  typeGrid?.querySelectorAll('.ws-type-option').forEach(btn =>
    btn.classList.toggle('selected', +btn.dataset.typeId === _selectedTypeId)
  );
  colorSwatches?.querySelectorAll('.ws-color-swatch').forEach(sw =>
    sw.classList.toggle('selected', sw.dataset.color === _selectedColor)
  );
  if (colorStripe) colorStripe.style.background = _selectedColor;
});

/* --------------------------------------------------------------------------
   Leave workspace
   -------------------------------------------------------------------------- */
leaveWsBtn?.addEventListener('click', () => {
  bootstrap.Modal.getOrCreateInstance(document.getElementById('leaveModal')).show();
});

document.getElementById('leaveConfirmBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('leaveConfirmBtn');
  btn.disabled = true;
  try {
    await WorkspaceService.leaveWorkspace(_wsId);
    bootstrap.Modal.getInstance(document.getElementById('leaveModal'))?.hide();
    showSuccess(t('workspace.left_workspace'));
    // Switch to personal mode and redirect
    await WorkspaceService.switchWorkspace(null);
    window.location.href = Config.ROUTES.WORKSPACE_DASHBOARD;
  } catch (e) {
    showError(e?.message || t('workspace.error_save'));
    btn.disabled = false;
  }
});

/* --------------------------------------------------------------------------
   Delete workspace (owner only)
   -------------------------------------------------------------------------- */
deleteWsBtn?.addEventListener('click', () => {
  const input = document.getElementById('deleteConfirmInput');
  if (input) input.value = '';
  document.getElementById('deleteConfirmBtn').disabled = true;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('deleteModal')).show();
});

document.getElementById('deleteConfirmInput')?.addEventListener('input', function () {
  const match = this.value.trim() === _originalName;
  document.getElementById('deleteConfirmBtn').disabled = !match;
});

document.getElementById('deleteConfirmBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('deleteConfirmBtn');
  btn.disabled = true;
  try {
    await WorkspaceService.remove(_wsId);
    bootstrap.Modal.getInstance(document.getElementById('deleteModal'))?.hide();
    showSuccess(t('workspace.workspace_deleted'));
    window.location.href = Config.ROUTES.WORKSPACE_DASHBOARD;
  } catch (e) {
    showError(e?.message || t('workspace.error_delete'));
    btn.disabled = false;
  }
});

/* --------------------------------------------------------------------------
   Init
   -------------------------------------------------------------------------- */
async function init() {
  await initI18n();
  await guardPage();
  initLayout();

  let ctx;
  try {
    ctx = await WorkspaceService.getContext();
  } catch {
    showError(t('workspace.error_load'));
    return;
  }

  if (!ctx?.currentWorkspaceId) {
    window.location.href = '/pages/workspaces/dashboard.html';
    return;
  }

  _wsId     = ctx.currentWorkspaceId;
  _myRoleId = ctx.roleId;
  _canEdit  = _myRoleId <= 2; // Owner or Admin can edit

  initPickers();
  await loadSettings();

  window.addEventListener('mm-workspace-change', () => {/* already saved, no reload needed */});
}

init();
