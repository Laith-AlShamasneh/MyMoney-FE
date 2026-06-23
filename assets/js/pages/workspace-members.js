import { initI18n, t, getLanguage } from '../core/i18n.js';
import { initLayout }               from '../components/layout.js';
import { guardPage }                from '../core/auth.js';
import { WorkspaceService }         from '../services/workspace-service.js';
import { showError, showSuccess }   from '../components/toast.js';

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

const STATUSES = {
  1: { cls: 'ws-status-active',    key: 'active' },
  2: { cls: 'ws-status-suspended', key: 'suspended' },
  3: { cls: 'ws-status-removed',   key: 'removed' },
  4: { cls: 'ws-status-left',      key: 'left' },
};

// Permissions per role for invite preview (aligned with backend SP logic)
const ROLE_PERMS = {
  2: ['view_workspace','manage_workspace','view_members','invite_members','manage_members','remove_members','view_invitations','send_invitations','cancel_invitations','view_transactions','create_transaction','edit_transaction','delete_transaction','export_transactions','view_goals','create_goal','edit_goal','delete_goal','view_budgets','create_budget','edit_budget','delete_budget','view_cashflow','manage_cashflow','view_reports','export_reports','view_receipts','upload_receipt','edit_receipt','delete_receipt','view_calendar','manage_calendar','view_insights','view_notifications','view_activity'],
  3: ['view_workspace','view_members','invite_members','view_invitations','send_invitations','view_transactions','create_transaction','edit_transaction','view_goals','create_goal','edit_goal','view_budgets','create_budget','edit_budget','view_cashflow','view_reports','view_receipts','upload_receipt','edit_receipt','view_calendar','manage_calendar','view_insights','view_notifications','view_activity'],
  4: ['view_workspace','view_members','view_invitations','view_transactions','create_transaction','edit_transaction','export_transactions','view_goals','view_budgets','create_budget','edit_budget','view_cashflow','view_reports','export_reports','view_receipts','upload_receipt','edit_receipt','view_calendar','view_insights','view_notifications','view_activity'],
  5: ['view_workspace','view_members','view_invitations','view_transactions','view_goals','view_budgets','view_cashflow','view_reports','view_receipts','view_calendar','view_insights','view_notifications','view_activity'],
  6: ['view_workspace','view_members','view_invitations','view_transactions','export_transactions','view_goals','view_budgets','view_reports','export_reports','view_receipts','view_calendar','view_insights','view_notifications','view_activity'],
  7: ['view_workspace','view_members','view_transactions','view_goals','view_notifications'],
};

const PERM_GROUPS = [
  { key: 'workspace',     label: 'workspace.perm_group_workspace',     perms: ['view_workspace','manage_workspace','delete_workspace'] },
  { key: 'members',       label: 'workspace.perm_group_members',       perms: ['view_members','invite_members','manage_members','remove_members'] },
  { key: 'transactions',  label: 'workspace.perm_group_transactions',  perms: ['view_transactions','create_transaction','edit_transaction','delete_transaction','export_transactions'] },
  { key: 'goals',         label: 'workspace.perm_group_goals',         perms: ['view_goals','create_goal','edit_goal','delete_goal'] },
  { key: 'budgets',       label: 'workspace.perm_group_budgets',       perms: ['view_budgets','create_budget','edit_budget','delete_budget'] },
  { key: 'reports',       label: 'workspace.perm_group_reports',       perms: ['view_reports','export_reports'] },
];

/* --------------------------------------------------------------------------
   Page state
   -------------------------------------------------------------------------- */
let _wsId         = null;
let _myRoleId     = null;
let _currentPage  = 1;
let _totalPages   = 1;
let _pageSize     = 15;
let _statusFilter = null;
let _roleFilter   = null;
let _searchTerm   = '';
let _debounceTimer = null;
let _selectedRoleId = 3;
let _pendingAction  = null; // { type, targetUserId, name }

/* --------------------------------------------------------------------------
   DOM refs
   -------------------------------------------------------------------------- */
const membersTableBody = document.getElementById('membersTableBody');
const membersEmpty     = document.getElementById('membersEmpty');
const membersPagination = document.getElementById('membersPagination');
const membersPageInfo  = document.getElementById('membersPageInfo');
const membersPrevBtn   = document.getElementById('membersPrevBtn');
const membersNextBtn   = document.getElementById('membersNextBtn');
const memberCountLabel = document.getElementById('memberCountLabel');
const memberSearch     = document.getElementById('memberSearch');
const memberStatusFilter = document.getElementById('memberStatusFilter');
const memberRoleFilter = document.getElementById('memberRoleFilter');

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */
function _esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function _wsInitials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

function _roleBadge(roleId) {
  const r = ROLES[roleId] || ROLES[5];
  return `<span class="ws-role-badge ${r.cls}">${t(`workspace.role_${r.key}`)}</span>`;
}

function _statusBadge(statusId) {
  const s = STATUSES[statusId] || STATUSES[1];
  return `<span class="ws-status-badge ${s.cls}">${t(`workspace.status_${s.key}`)}</span>`;
}

function _fmtDate(utcStr) {
  if (!utcStr) return '—';
  const lang = getLanguage();
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(new Date(utcStr));
}

function _canManage(targetRoleId) {
  if (!_myRoleId) return false;
  if (_myRoleId === 1 || _myRoleId === 2) return targetRoleId !== 1;
  if (_myRoleId === 3) return targetRoleId > 3;
  return false;
}

/* --------------------------------------------------------------------------
   Members table
   -------------------------------------------------------------------------- */
async function loadMembers() {
  membersTableBody.querySelectorAll(':not(.ws-skeleton-row)').forEach(r => r.remove());
  membersTableBody.querySelectorAll('.ws-skeleton-row').forEach(r => r.classList.remove('d-none'));
  membersEmpty.classList.add('d-none');
  membersPagination.classList.add('d-none');

  try {
    const data = await WorkspaceService.getMembers({
      workspaceId: _wsId,
      statusId:    _statusFilter || null,
      pageNumber:  _currentPage,
      pageSize:    _pageSize,
    });

    membersTableBody.querySelectorAll('.ws-skeleton-row').forEach(r => r.remove());

    const items = data?.items ?? data ?? [];
    const total = data?.totalCount ?? items.length;
    _totalPages = (data?.totalPages ?? Math.ceil(total / _pageSize)) || 1;

    // Client-side filter by role and search (backend may not support all filters)
    const filtered = items.filter(m => {
      if (_roleFilter && m.roleId !== +_roleFilter) return false;
      if (_searchTerm) {
        const q = _searchTerm.toLowerCase();
        return (m.displayName || '').toLowerCase().includes(q) ||
               (m.email || '').toLowerCase().includes(q);
      }
      return true;
    });

    memberCountLabel.textContent = total ? t('workspace.members_count').replace('{n}', total) : '';

    if (!filtered.length) {
      membersEmpty.classList.remove('d-none');
      return;
    }

    membersTableBody.innerHTML = filtered.map(m => _buildMemberRow(m)).join('');
    _wireRowActions();

    if (_totalPages > 1) {
      membersPagination.classList.remove('d-none');
      membersPageInfo.textContent = `${_currentPage} / ${_totalPages}`;
      membersPrevBtn.disabled = _currentPage <= 1;
      membersNextBtn.disabled = _currentPage >= _totalPages;
    }
  } catch {
    membersTableBody.querySelectorAll('.ws-skeleton-row').forEach(r => r.remove());
    membersEmpty.classList.remove('d-none');
    showError(t('workspace.error_load'));
  }
}

function _buildMemberRow(m) {
  const initials = _wsInitials(m.displayName || m.email);
  const canManage = _canManage(m.roleId);

  const actions = canManage ? `
    <div class="d-flex justify-content-center gap-1">
      ${m.statusId !== 1 ? '' : `<button class="btn btn-sm btn-outline-secondary" data-action="edit-role" data-uid="${m.userId}" data-role="${m.roleId}" data-name="${_esc(m.displayName || m.email)}" title="${t('workspace.change_role_title')}"><i class="bi bi-shield" aria-hidden="true"></i></button>`}
      ${m.statusId === 1 ? `<button class="btn btn-sm btn-outline-warning" data-action="suspend" data-uid="${m.userId}" data-name="${_esc(m.displayName || m.email)}" title="${t('workspace.suspend_btn')}"><i class="bi bi-pause-circle" aria-hidden="true"></i></button>` : ''}
      ${m.statusId === 2 ? `<button class="btn btn-sm btn-outline-success" data-action="reinstate" data-uid="${m.userId}" data-name="${_esc(m.displayName || m.email)}" title="${t('workspace.reinstate_btn')}"><i class="bi bi-play-circle" aria-hidden="true"></i></button>` : ''}
      <button class="btn btn-sm btn-outline-danger" data-action="remove" data-uid="${m.userId}" data-name="${_esc(m.displayName || m.email)}" title="${t('workspace.remove_btn')}"><i class="bi bi-person-x" aria-hidden="true"></i></button>
    </div>` : '<span class="text-muted small">—</span>';

  return `
    <tr>
      <td class="px-4 py-3">
        <div class="d-flex align-items-center gap-3">
          <div class="ws-member-avatar-initials flex-shrink-0">${initials}</div>
          <div>
            <div class="fw-semibold small">${_esc(m.displayName || m.email)}</div>
            <div class="text-muted" style="font-size:.76rem">${_esc(m.email)}</div>
          </div>
        </div>
      </td>
      <td class="px-3 py-3">${_roleBadge(m.roleId)}</td>
      <td class="px-3 py-3">${_statusBadge(m.statusId)}</td>
      <td class="px-3 py-3 text-muted small">${_fmtDate(m.joinedAtUtc)}</td>
      <td class="px-3 py-3">${actions}</td>
    </tr>`;
}

function _wireRowActions() {
  membersTableBody.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const uid    = +btn.dataset.uid;
      const name   = btn.dataset.name;
      const roleId = +btn.dataset.role;

      if (action === 'edit-role') {
        openEditRoleModal(uid, name, roleId);
      } else {
        openConfirmModal(action, uid, name);
      }
    });
  });
}

/* --------------------------------------------------------------------------
   Edit role modal
   -------------------------------------------------------------------------- */
function openEditRoleModal(targetUserId, name, currentRoleId) {
  _pendingAction = { type: 'edit-role', targetUserId };
  document.getElementById('editRoleMemberName').textContent = name;
  const sel = document.getElementById('editRoleSelect');
  if (sel) sel.value = currentRoleId;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('editRoleModal')).show();
}

document.getElementById('editRoleSubmitBtn')?.addEventListener('click', async () => {
  if (!_pendingAction) return;
  const newRoleId = +document.getElementById('editRoleSelect').value;
  const btn = document.getElementById('editRoleSubmitBtn');
  btn.disabled = true;
  try {
    await WorkspaceService.updateMemberRole({ workspaceId: _wsId, targetUserId: _pendingAction.targetUserId, newRoleId });
    bootstrap.Modal.getInstance(document.getElementById('editRoleModal')).hide();
    showSuccess(t('workspace.role_updated'));
    await loadMembers();
  } catch (e) {
    showError(e?.message || t('workspace.error_save'));
  } finally {
    btn.disabled = false;
    _pendingAction = null;
  }
});

/* --------------------------------------------------------------------------
   Confirm action modal (suspend / reinstate / remove)
   -------------------------------------------------------------------------- */
function openConfirmModal(type, targetUserId, name) {
  _pendingAction = { type, targetUserId };
  const titleMap = {
    suspend:   t('workspace.suspend_btn'),
    reinstate: t('workspace.reinstate_btn'),
    remove:    t('workspace.remove_btn'),
  };
  const bodyMap = {
    suspend:   t('workspace.suspend_confirm_body').replace('{name}', name),
    reinstate: t('workspace.reinstate_confirm_body').replace('{name}', name),
    remove:    t('workspace.remove_confirm_body').replace('{name}', name),
  };
  document.getElementById('confirmActionModalLabel').textContent = titleMap[type] || type;
  document.getElementById('confirmActionBody').textContent       = bodyMap[type] || '';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('confirmActionModal')).show();
}

document.getElementById('confirmActionBtn')?.addEventListener('click', async () => {
  if (!_pendingAction) return;
  const { type, targetUserId } = _pendingAction;
  const btn = document.getElementById('confirmActionBtn');
  btn.disabled = true;
  try {
    if (type === 'suspend')   await WorkspaceService.suspendMember({ workspaceId: _wsId, targetUserId });
    if (type === 'reinstate') await WorkspaceService.reinstateMember({ workspaceId: _wsId, targetUserId });
    if (type === 'remove')    await WorkspaceService.removeMember({ workspaceId: _wsId, targetUserId });

    bootstrap.Modal.getInstance(document.getElementById('confirmActionModal')).hide();
    showSuccess(t('workspace.action_success'));
    await loadMembers();
  } catch (e) {
    showError(e?.message || t('workspace.error_save'));
  } finally {
    btn.disabled = false;
    _pendingAction = null;
  }
});

/* --------------------------------------------------------------------------
   Invite modal — role picker + permission preview
   -------------------------------------------------------------------------- */
function initInviteModal() {
  const roleGrid    = document.getElementById('inviteRoleGrid');
  const permGrid    = document.getElementById('invitePermGrid');
  const submitBtn   = document.getElementById('inviteSubmitBtn');
  const emailInput  = document.getElementById('inviteEmail');
  const modal       = document.getElementById('inviteModal');

  if (!modal) return;

  roleGrid?.querySelectorAll('.ws-role-option').forEach(btn => {
    btn.addEventListener('click', () => {
      roleGrid.querySelectorAll('.ws-role-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      _selectedRoleId = +btn.dataset.roleId;
      _renderPermPreview(_selectedRoleId, permGrid);
    });
  });

  _renderPermPreview(_selectedRoleId, permGrid);

  modal.addEventListener('show.bs.modal', () => {
    emailInput.value = '';
    emailInput.classList.remove('is-invalid');
    _selectedRoleId = 3;
    roleGrid?.querySelectorAll('.ws-role-option').forEach(btn => {
      btn.classList.toggle('selected', +btn.dataset.roleId === 3);
    });
    _renderPermPreview(3, permGrid);
  });

  submitBtn?.addEventListener('click', handleInvite);
}

function _renderPermPreview(roleId, container) {
  if (!container) return;
  const perms = new Set(ROLE_PERMS[roleId] || []);
  container.innerHTML = PERM_GROUPS.map(g => {
    const allowed = g.perms.filter(p => perms.has(p));
    if (!allowed.length) return '';
    return `
      <div class="col-12 col-sm-6">
        <div class="fw-semibold mb-1" style="font-size:.78rem">${t(g.label)}</div>
        ${allowed.map(p => `<div class="text-success small"><i class="bi bi-check2 me-1" aria-hidden="true"></i>${t('workspace.perm_' + p)}</div>`).join('')}
      </div>`;
  }).join('');
}

async function handleInvite() {
  const emailInput = document.getElementById('inviteEmail');
  const email = emailInput?.value.trim();
  if (!email || !email.includes('@')) {
    emailInput?.classList.add('is-invalid');
    return;
  }
  emailInput?.classList.remove('is-invalid');

  const btn = document.getElementById('inviteSubmitBtn');
  if (btn) btn.disabled = true;
  try {
    await WorkspaceService.sendInvitation({ workspaceId: _wsId, email, roleId: _selectedRoleId });
    bootstrap.Modal.getInstance(document.getElementById('inviteModal'))?.hide();
    showSuccess(t('workspace.invite_sent'));
  } catch (e) {
    showError(e?.message || t('workspace.error_invite'));
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* --------------------------------------------------------------------------
   Filters + pagination
   -------------------------------------------------------------------------- */
function initFilters() {
  memberSearch?.addEventListener('input', () => {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
      _searchTerm  = memberSearch.value.trim();
      _currentPage = 1;
      loadMembers();
    }, 300);
  });

  memberStatusFilter?.addEventListener('change', () => {
    _statusFilter = memberStatusFilter.value ? +memberStatusFilter.value : null;
    _currentPage  = 1;
    loadMembers();
  });

  memberRoleFilter?.addEventListener('change', () => {
    _roleFilter  = memberRoleFilter.value ? +memberRoleFilter.value : null;
    _currentPage = 1;
    loadMembers();
  });

  membersPrevBtn?.addEventListener('click', () => { if (_currentPage > 1) { _currentPage--; loadMembers(); } });
  membersNextBtn?.addEventListener('click', () => { if (_currentPage < _totalPages) { _currentPage++; loadMembers(); } });
}

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

  // Hide invite button if no permission
  if (_myRoleId > 3) {
    document.getElementById('inviteMemberBtn')?.classList.add('d-none');
  }

  initFilters();
  initInviteModal();
  await loadMembers();

  window.addEventListener('mm-workspace-change', () => location.reload());
}

init();
