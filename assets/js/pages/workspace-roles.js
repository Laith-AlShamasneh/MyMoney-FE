import { initI18n, t, getLanguage } from '../core/i18n.js';
import { initLayout }               from '../components/layout.js';
import { guardPage }                from '../core/auth.js';
import { WorkspaceService }         from '../services/workspace-service.js';
import { showError }                from '../components/toast.js';

/* --------------------------------------------------------------------------
   Permission matrix — 35 permissions across 12 resource groups
   Mirrors the backend SP permission configuration exactly.
   -------------------------------------------------------------------------- */
const PERM_GROUPS = [
  {
    label: 'workspace.perm_group_workspace',
    perms: [
      { id: 'view_workspace',     label: 'workspace.perm_view_workspace' },
      { id: 'manage_workspace',   label: 'workspace.perm_manage_workspace' },
      { id: 'delete_workspace',   label: 'workspace.perm_delete_workspace' },
    ],
  },
  {
    label: 'workspace.perm_group_members',
    perms: [
      { id: 'view_members',       label: 'workspace.perm_view_members' },
      { id: 'invite_members',     label: 'workspace.perm_invite_members' },
      { id: 'manage_members',     label: 'workspace.perm_manage_members' },
      { id: 'remove_members',     label: 'workspace.perm_remove_members' },
    ],
  },
  {
    label: 'workspace.perm_group_invitations',
    perms: [
      { id: 'view_invitations',   label: 'workspace.perm_view_invitations' },
      { id: 'send_invitations',   label: 'workspace.perm_send_invitations' },
      { id: 'cancel_invitations', label: 'workspace.perm_cancel_invitations' },
    ],
  },
  {
    label: 'workspace.perm_group_transactions',
    perms: [
      { id: 'view_transactions',  label: 'workspace.perm_view_transactions' },
      { id: 'create_transaction', label: 'workspace.perm_create_transaction' },
      { id: 'edit_transaction',   label: 'workspace.perm_edit_transaction' },
      { id: 'delete_transaction', label: 'workspace.perm_delete_transaction' },
      { id: 'export_transactions',label: 'workspace.perm_export_transactions' },
    ],
  },
  {
    label: 'workspace.perm_group_goals',
    perms: [
      { id: 'view_goals',         label: 'workspace.perm_view_goals' },
      { id: 'create_goal',        label: 'workspace.perm_create_goal' },
      { id: 'edit_goal',          label: 'workspace.perm_edit_goal' },
      { id: 'delete_goal',        label: 'workspace.perm_delete_goal' },
    ],
  },
  {
    label: 'workspace.perm_group_budgets',
    perms: [
      { id: 'view_budgets',       label: 'workspace.perm_view_budgets' },
      { id: 'create_budget',      label: 'workspace.perm_create_budget' },
      { id: 'edit_budget',        label: 'workspace.perm_edit_budget' },
      { id: 'delete_budget',      label: 'workspace.perm_delete_budget' },
    ],
  },
  {
    label: 'workspace.perm_group_cashflow',
    perms: [
      { id: 'view_cashflow',      label: 'workspace.perm_view_cashflow' },
      { id: 'manage_cashflow',    label: 'workspace.perm_manage_cashflow' },
    ],
  },
  {
    label: 'workspace.perm_group_reports',
    perms: [
      { id: 'view_reports',       label: 'workspace.perm_view_reports' },
      { id: 'export_reports',     label: 'workspace.perm_export_reports' },
    ],
  },
  {
    label: 'workspace.perm_group_receipts',
    perms: [
      { id: 'view_receipts',      label: 'workspace.perm_view_receipts' },
      { id: 'upload_receipt',     label: 'workspace.perm_upload_receipt' },
      { id: 'edit_receipt',       label: 'workspace.perm_edit_receipt' },
      { id: 'delete_receipt',     label: 'workspace.perm_delete_receipt' },
    ],
  },
  {
    label: 'workspace.perm_group_calendar',
    perms: [
      { id: 'view_calendar',      label: 'workspace.perm_view_calendar' },
      { id: 'manage_calendar',    label: 'workspace.perm_manage_calendar' },
    ],
  },
  {
    label: 'workspace.perm_group_insights',
    perms: [
      { id: 'view_insights',      label: 'workspace.perm_view_insights' },
    ],
  },
  {
    label: 'workspace.perm_group_activity',
    perms: [
      { id: 'view_notifications', label: 'workspace.perm_view_notifications' },
      { id: 'view_activity',      label: 'workspace.perm_view_activity' },
    ],
  },
];

// Which roles have which permissions (by permission ID)
const ROLE_PERMS = {
  1: new Set(['view_workspace','manage_workspace','delete_workspace','view_members','invite_members','manage_members','remove_members','view_invitations','send_invitations','cancel_invitations','view_transactions','create_transaction','edit_transaction','delete_transaction','export_transactions','view_goals','create_goal','edit_goal','delete_goal','view_budgets','create_budget','edit_budget','delete_budget','view_cashflow','manage_cashflow','view_reports','export_reports','view_receipts','upload_receipt','edit_receipt','delete_receipt','view_calendar','manage_calendar','view_insights','view_notifications','view_activity']),
  2: new Set(['view_workspace','manage_workspace','view_members','invite_members','manage_members','remove_members','view_invitations','send_invitations','cancel_invitations','view_transactions','create_transaction','edit_transaction','delete_transaction','export_transactions','view_goals','create_goal','edit_goal','delete_goal','view_budgets','create_budget','edit_budget','delete_budget','view_cashflow','manage_cashflow','view_reports','export_reports','view_receipts','upload_receipt','edit_receipt','delete_receipt','view_calendar','manage_calendar','view_insights','view_notifications','view_activity']),
  3: new Set(['view_workspace','view_members','invite_members','view_invitations','send_invitations','view_transactions','create_transaction','edit_transaction','view_goals','create_goal','edit_goal','view_budgets','create_budget','edit_budget','view_cashflow','view_reports','view_receipts','upload_receipt','edit_receipt','view_calendar','manage_calendar','view_insights','view_notifications','view_activity']),
  4: new Set(['view_workspace','view_members','view_invitations','view_transactions','create_transaction','edit_transaction','export_transactions','view_goals','view_budgets','create_budget','edit_budget','view_cashflow','view_reports','export_reports','view_receipts','upload_receipt','edit_receipt','view_calendar','view_insights','view_notifications','view_activity']),
  5: new Set(['view_workspace','view_members','view_invitations','view_transactions','view_goals','view_budgets','view_cashflow','view_reports','view_receipts','view_calendar','view_insights','view_notifications','view_activity']),
  6: new Set(['view_workspace','view_members','view_invitations','view_transactions','export_transactions','view_goals','view_budgets','view_reports','export_reports','view_receipts','view_calendar','view_insights','view_notifications','view_activity']),
  7: new Set(['view_workspace','view_members','view_transactions','view_goals','view_notifications']),
};

const ROLES = [
  { id: 1, key: 'owner',      cls: 'ws-role-owner' },
  { id: 2, key: 'admin',      cls: 'ws-role-admin' },
  { id: 3, key: 'manager',    cls: 'ws-role-manager' },
  { id: 4, key: 'accountant', cls: 'ws-role-accountant' },
  { id: 5, key: 'viewer',     cls: 'ws-role-viewer' },
  { id: 6, key: 'auditor',    cls: 'ws-role-auditor' },
  { id: 7, key: 'guest',      cls: 'ws-role-guest' },
];

/* --------------------------------------------------------------------------
   Matrix rendering
   -------------------------------------------------------------------------- */
function renderMatrix(myRoleId) {
  const headerRow = document.getElementById('matrixHeaderRow');
  const matrixBody = document.getElementById('matrixBody');
  const matrixWrap = document.getElementById('matrixWrap');
  const skeleton   = document.getElementById('matrixSkeleton');

  if (!matrixBody) return;

  // Header: permission column + one column per role
  headerRow.innerHTML = `<th class="px-4 py-3" style="min-width:220px">${t('workspace.col_permission')}</th>` +
    ROLES.map(r => `<th class="px-3 py-3 text-center ${r.id === myRoleId ? 'table-active' : ''}">
      <span class="ws-role-badge ${r.cls}">${t(`workspace.role_${r.key}`)}</span>
    </th>`).join('');

  // Body: section headers + permission rows
  matrixBody.innerHTML = PERM_GROUPS.map(g => {
    const sectionRow = `
      <tr class="ws-matrix-section">
        <td colspan="${ROLES.length + 1}" class="px-4 py-2 fw-semibold small text-muted" style="background:var(--mm-surface-2)">
          ${t(g.label)}
        </td>
      </tr>`;

    const permRows = g.perms.map(p => `
      <tr>
        <td class="px-4 py-2 small">${t(p.label)}</td>
        ${ROLES.map(r => {
          const has = ROLE_PERMS[r.id]?.has(p.id);
          const isMe = r.id === myRoleId;
          return `<td class="px-3 py-2 text-center ${isMe ? 'table-active' : ''}">
            ${has
              ? `<i class="bi bi-check-circle-fill text-success" aria-label="${t('workspace.perm_allowed')}" aria-hidden="true"></i>`
              : `<i class="bi bi-x-circle-fill text-danger opacity-25" aria-label="${t('workspace.perm_denied')}" aria-hidden="true"></i>`
            }
          </td>`;
        }).join('')}
      </tr>`).join('');

    return sectionRow + permRows;
  }).join('');

  skeleton.classList.add('d-none');
  matrixWrap.classList.remove('d-none');
}

/* --------------------------------------------------------------------------
   My permissions card
   -------------------------------------------------------------------------- */
function renderMyPerms(myRoleId, livePerms) {
  const card      = document.getElementById('myPermsCard');
  const badge     = document.getElementById('myRoleBadge');
  const grid      = document.getElementById('myPermsGrid');
  if (!card) return;

  const role = ROLES.find(r => r.id === myRoleId);
  if (role) {
    badge.className = `ws-role-badge ${role.cls}`;
    badge.textContent = t(`workspace.role_${role.key}`);
  }

  // Use live perms from API if available, else fall back to static matrix
  const mySet = livePerms
    ? new Set(livePerms.map(p => (p.permissionName || p.name || '').toLowerCase()))
    : (ROLE_PERMS[myRoleId] || new Set());

  grid.innerHTML = PERM_GROUPS.map(g => {
    const allowed = g.perms.filter(p => mySet.has(p.id));
    if (!allowed.length) return '';
    return `
      <div class="col-12 col-sm-6 col-lg-4">
        <div class="fw-semibold small mb-1">${t(g.label)}</div>
        ${allowed.map(p => `<div class="text-success small"><i class="bi bi-check2 me-1" aria-hidden="true"></i>${t(p.label)}</div>`).join('')}
      </div>`;
  }).join('');

  card.classList.remove('d-none');
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

  const myRoleId = ctx.roleId || 5;

  // Render the static matrix immediately
  renderMatrix(myRoleId);

  // Then fetch live permissions for "my permissions" card
  try {
    const livePerms = await WorkspaceService.getMyPermissions(ctx.currentWorkspaceId);
    renderMyPerms(myRoleId, livePerms);
  } catch {
    // Fall back to static matrix for my perms
    renderMyPerms(myRoleId, null);
  }

  window.addEventListener('mm-workspace-change', () => location.reload());
}

init();
