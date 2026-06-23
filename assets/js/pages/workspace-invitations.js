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

const INV_STATUSES = {
  1: { cls: 'ws-inv-pending',   key: 'pending' },
  2: { cls: 'ws-inv-accepted',  key: 'accepted' },
  3: { cls: 'ws-inv-rejected',  key: 'rejected' },
  4: { cls: 'ws-inv-expired',   key: 'expired' },
  5: { cls: 'ws-inv-cancelled', key: 'cancelled' },
};

const ROLE_PERMS = {
  2: ['view_workspace','manage_workspace','view_members','invite_members','manage_members','remove_members','view_invitations','send_invitations','cancel_invitations','view_transactions','create_transaction','edit_transaction','delete_transaction','export_transactions','view_goals','create_goal','edit_goal','delete_goal','view_budgets','create_budget','edit_budget','delete_budget','view_cashflow','manage_cashflow','view_reports','export_reports','view_receipts','upload_receipt','edit_receipt','delete_receipt','view_calendar','manage_calendar','view_insights','view_notifications','view_activity'],
  3: ['view_workspace','view_members','invite_members','view_invitations','send_invitations','view_transactions','create_transaction','edit_transaction','view_goals','create_goal','edit_goal','view_budgets','create_budget','edit_budget','view_cashflow','view_reports','view_receipts','upload_receipt','edit_receipt','view_calendar','manage_calendar','view_insights','view_notifications','view_activity'],
  4: ['view_workspace','view_members','view_invitations','view_transactions','create_transaction','edit_transaction','export_transactions','view_goals','view_budgets','create_budget','edit_budget','view_cashflow','view_reports','export_reports','view_receipts','upload_receipt','edit_receipt','view_calendar','view_insights','view_notifications','view_activity'],
  5: ['view_workspace','view_members','view_invitations','view_transactions','view_goals','view_budgets','view_cashflow','view_reports','view_receipts','view_calendar','view_insights','view_notifications','view_activity'],
  6: ['view_workspace','view_members','view_invitations','view_transactions','export_transactions','view_goals','view_budgets','view_reports','export_reports','view_receipts','view_calendar','view_insights','view_notifications','view_activity'],
  7: ['view_workspace','view_members','view_transactions','view_goals','view_notifications'],
};

const PERM_GROUPS = [
  { key: 'workspace',    label: 'workspace.perm_group_workspace',    perms: ['view_workspace','manage_workspace'] },
  { key: 'members',     label: 'workspace.perm_group_members',      perms: ['view_members','invite_members','manage_members','remove_members'] },
  { key: 'transactions',label: 'workspace.perm_group_transactions', perms: ['view_transactions','create_transaction','edit_transaction','export_transactions'] },
  { key: 'reports',     label: 'workspace.perm_group_reports',      perms: ['view_reports','export_reports'] },
];

/* --------------------------------------------------------------------------
   Page state
   -------------------------------------------------------------------------- */
let _wsId            = null;
let _myRoleId        = null;
let _allInvitations  = [];
let _currentPage     = 1;
let _totalPages      = 1;
let _pageSize        = 20;
let _activeStatusId  = null; // null = all tabs combined
let _pendingCancelId = null;
let _selectedRoleId  = 3;

/* --------------------------------------------------------------------------
   DOM refs
   -------------------------------------------------------------------------- */
const invTableBody  = document.getElementById('invTableBody');
const invTableCard  = document.getElementById('invTableCard');
const invEmpty      = document.getElementById('invEmpty');
const invPagination = document.getElementById('invPagination');
const invPageInfo   = document.getElementById('invPageInfo');
const invPrevBtn    = document.getElementById('invPrevBtn');
const invNextBtn    = document.getElementById('invNextBtn');

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */
function _esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function _roleBadge(roleId) {
  const r = ROLES[roleId] || ROLES[5];
  return `<span class="ws-role-badge ${r.cls}">${t(`workspace.role_${r.key}`)}</span>`;
}

function _invStatusBadge(statusId) {
  const s = INV_STATUSES[statusId] || INV_STATUSES[1];
  return `<span class="ws-inv-badge ${s.cls}">${t(`workspace.inv_status_${s.key}`)}</span>`;
}

function _fmtDate(utcStr) {
  if (!utcStr) return '—';
  const lang = getLanguage();
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(new Date(utcStr));
}

function _isExpiredSoon(utcStr) {
  if (!utcStr) return false;
  const diffMs = new Date(utcStr).getTime() - Date.now();
  return diffMs > 0 && diffMs < 24 * 60 * 60 * 1000;
}

/* --------------------------------------------------------------------------
   Load + render
   -------------------------------------------------------------------------- */
async function loadInvitations() {
  showTableSkeleton();
  try {
    const data = await WorkspaceService.getInvitations({
      workspaceId: _wsId,
      statusId:    _activeStatusId,
      pageNumber:  _currentPage,
      pageSize:    _pageSize,
    });

    const items = data?.items ?? data ?? [];
    const total = data?.totalCount ?? items.length;
    _totalPages = (data?.totalPages ?? Math.ceil(total / _pageSize)) || 1;
    _allInvitations = items;

    updateTabCounts(items, total);
    renderTable(items);

    if (_totalPages > 1) {
      invPagination.classList.remove('d-none');
      invPageInfo.textContent = `${_currentPage} / ${_totalPages}`;
      invPrevBtn.disabled = _currentPage <= 1;
      invNextBtn.disabled = _currentPage >= _totalPages;
    } else {
      invPagination.classList.add('d-none');
    }
  } catch {
    hideTableSkeleton();
    showError(t('workspace.error_load'));
  }
}

function showTableSkeleton() {
  invTableCard.classList.remove('d-none');
  invTableBody.querySelectorAll(':not(.ws-skeleton-row)').forEach(r => r.remove());
  invTableBody.querySelectorAll('.ws-skeleton-row').forEach(r => r.classList.remove('d-none'));
  invEmpty.classList.add('d-none');
  invPagination.classList.add('d-none');
}

function hideTableSkeleton() {
  invTableBody.querySelectorAll('.ws-skeleton-row').forEach(r => r.remove());
}

function renderTable(items) {
  hideTableSkeleton();
  if (!items.length) {
    invEmpty.classList.remove('d-none');
    return;
  }
  invEmpty.classList.add('d-none');
  invTableBody.innerHTML = items.map(inv => _buildRow(inv)).join('');
  _wireRowActions();
}

function _buildRow(inv) {
  const canCancel = (inv.statusId === 1) && (_myRoleId <= 3);
  const expirySoon = _isExpiredSoon(inv.expiresAtUtc);
  return `
    <tr>
      <td class="px-4 py-3">
        <div class="fw-semibold small">${_esc(inv.email)}</div>
        ${inv.inviterName ? `<div class="text-muted" style="font-size:.76rem">${t('workspace.col_sent_by')}: ${_esc(inv.inviterName)}</div>` : ''}
      </td>
      <td class="px-3 py-3">${_roleBadge(inv.roleId)}</td>
      <td class="px-3 py-3">${_invStatusBadge(inv.statusId)}</td>
      <td class="px-3 py-3 text-muted small">${_fmtDate(inv.sentAtUtc)}</td>
      <td class="px-3 py-3 small ${expirySoon ? 'text-warning fw-semibold' : 'text-muted'}">${_fmtDate(inv.expiresAtUtc)}</td>
      <td class="px-3 py-3 text-center">
        ${canCancel ? `<button class="btn btn-sm btn-outline-danger" data-action="cancel" data-inv-id="${inv.invitationId}" data-email="${_esc(inv.email)}" title="${t('workspace.cancel_inv_title')}"><i class="bi bi-x-circle" aria-hidden="true"></i></button>` : '<span class="text-muted">—</span>'}
      </td>
    </tr>`;
}

function _wireRowActions() {
  invTableBody.querySelectorAll('[data-action="cancel"]').forEach(btn => {
    btn.addEventListener('click', () => {
      _pendingCancelId = +btn.dataset.invId;
      document.getElementById('cancelInvBody').textContent =
        t('workspace.cancel_inv_body').replace('{email}', btn.dataset.email);
      bootstrap.Modal.getOrCreateInstance(document.getElementById('cancelInvModal')).show();
    });
  });
}

/* --------------------------------------------------------------------------
   Tab counts
   -------------------------------------------------------------------------- */
function updateTabCounts(items, total) {
  const countAll      = document.getElementById('invCountAll');
  const countPending  = document.getElementById('invCountPending');
  const countAccepted = document.getElementById('invCountAccepted');
  const countRejected = document.getElementById('invCountRejected');
  const countExpired  = document.getElementById('invCountExpired');

  if (!_activeStatusId) {
    // We fetched all — count from items
    if (countAll)      countAll.textContent      = total;
    if (countPending)  countPending.textContent  = items.filter(i => i.statusId === 1).length;
    if (countAccepted) countAccepted.textContent = items.filter(i => i.statusId === 2).length;
    if (countRejected) countRejected.textContent = items.filter(i => i.statusId === 3).length;
    if (countExpired)  countExpired.textContent  = items.filter(i => i.statusId === 4).length;
  }
}

/* --------------------------------------------------------------------------
   Tab switching
   -------------------------------------------------------------------------- */
function initTabs() {
  const tabMap = { tabAll: null, tabPending: 1, tabAccepted: 2, tabRejected: 3, tabExpired: 4 };

  document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
    tab.addEventListener('shown.bs.tab', () => {
      const target = tab.getAttribute('data-bs-target')?.replace('#', '');
      _activeStatusId = tabMap[target] ?? null;
      _currentPage    = 1;
      loadInvitations();
    });
  });
}

/* --------------------------------------------------------------------------
   Cancel invitation
   -------------------------------------------------------------------------- */
document.getElementById('cancelInvConfirmBtn')?.addEventListener('click', async () => {
  if (!_pendingCancelId) return;
  const btn = document.getElementById('cancelInvConfirmBtn');
  btn.disabled = true;
  try {
    await WorkspaceService.cancelInvitation({ workspaceId: _wsId, invitationId: _pendingCancelId });
    bootstrap.Modal.getInstance(document.getElementById('cancelInvModal'))?.hide();
    showSuccess(t('workspace.inv_cancelled'));
    _pendingCancelId = null;
    await loadInvitations();
  } catch (e) {
    showError(e?.message || t('workspace.error_save'));
  } finally {
    btn.disabled = false;
  }
});

/* --------------------------------------------------------------------------
   Invite modal (send new invitation)
   -------------------------------------------------------------------------- */
function initInviteModal() {
  const roleGrid   = document.getElementById('inviteRoleGrid');
  const permGrid   = document.getElementById('invitePermGrid');
  const submitBtn  = document.getElementById('inviteSubmitBtn');
  const emailInput = document.getElementById('inviteEmail');
  const modal      = document.getElementById('inviteModal');
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
    if (emailInput) emailInput.value = '';
    emailInput?.classList.remove('is-invalid');
  });

  submitBtn?.addEventListener('click', async () => {
    const email = emailInput?.value.trim();
    if (!email || !email.includes('@')) { emailInput?.classList.add('is-invalid'); return; }
    emailInput?.classList.remove('is-invalid');
    submitBtn.disabled = true;
    try {
      await WorkspaceService.sendInvitation({ workspaceId: _wsId, email, roleId: _selectedRoleId });
      bootstrap.Modal.getInstance(modal)?.hide();
      showSuccess(t('workspace.invite_sent'));
      _currentPage = 1;
      await loadInvitations();
    } catch (e) {
      showError(e?.message || t('workspace.error_invite'));
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function _renderPermPreview(roleId, container) {
  if (!container) return;
  const perms = new Set(ROLE_PERMS[roleId] || []);
  container.innerHTML = PERM_GROUPS.map(g => {
    const allowed = g.perms.filter(p => perms.has(p));
    if (!allowed.length) return '';
    return `<div class="col-12 col-sm-6">
      <div class="fw-semibold mb-1" style="font-size:.78rem">${t(g.label)}</div>
      ${allowed.map(p => `<div class="text-success small"><i class="bi bi-check2 me-1"></i>${t('workspace.perm_' + p)}</div>`).join('')}
    </div>`;
  }).join('');
}

/* --------------------------------------------------------------------------
   Pagination
   -------------------------------------------------------------------------- */
invPrevBtn?.addEventListener('click', () => { if (_currentPage > 1) { _currentPage--; loadInvitations(); } });
invNextBtn?.addEventListener('click', () => { if (_currentPage < _totalPages) { _currentPage++; loadInvitations(); } });

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

  // Hide invite button for viewers/auditors/guests
  if (_myRoleId > 3) {
    document.querySelectorAll('[data-bs-target="#inviteModal"]').forEach(b => b.classList.add('d-none'));
  }

  // Move table card into first tab pane
  const firstPane = document.getElementById('invListAll');
  if (firstPane && invTableCard) firstPane.appendChild(invTableCard);
  invTableCard.classList.remove('d-none');

  initTabs();
  initInviteModal();
  await loadInvitations();

  window.addEventListener('mm-workspace-change', () => location.reload());
}

init();
