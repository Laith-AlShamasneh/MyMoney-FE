/**
 * services/workspace-context.js — MyMoney
 * Shared workspace context utility used by every page.
 *
 * Usage:
 *   import { initWorkspaceContext, hasPermission } from '../services/workspace-context.js';
 *
 *   // In your init():
 *   await initWorkspaceContext({
 *     viewPerm:  'view_transactions',   // if user lacks this, content is replaced
 *     contentId: 'tablePanel',          // element to replace on permission denial
 *     gates: [
 *       { id: 'btnAddTransaction', perm: 'create_transaction' },
 *     ],
 *   });
 */

import { WorkspaceService } from './workspace-service.js';
import { t, getLanguage }   from '../core/i18n.js';

/* --------------------------------------------------------------------------
   Static role → permission map (mirrors backend SP)
   -------------------------------------------------------------------------- */
const _STATIC_ROLE_PERMS = {
  1: new Set(['view_workspace','manage_workspace','delete_workspace','view_members','invite_members','manage_members','remove_members','view_invitations','send_invitations','cancel_invitations','view_transactions','create_transaction','edit_transaction','delete_transaction','export_transactions','view_goals','create_goal','edit_goal','delete_goal','view_budgets','create_budget','edit_budget','delete_budget','view_cashflow','manage_cashflow','view_reports','export_reports','view_receipts','upload_receipt','edit_receipt','delete_receipt','view_calendar','manage_calendar','view_insights','view_notifications','view_activity']),
  2: new Set(['view_workspace','manage_workspace','view_members','invite_members','manage_members','remove_members','view_invitations','send_invitations','cancel_invitations','view_transactions','create_transaction','edit_transaction','delete_transaction','export_transactions','view_goals','create_goal','edit_goal','delete_goal','view_budgets','create_budget','edit_budget','delete_budget','view_cashflow','manage_cashflow','view_reports','export_reports','view_receipts','upload_receipt','edit_receipt','delete_receipt','view_calendar','manage_calendar','view_insights','view_notifications','view_activity']),
  3: new Set(['view_workspace','view_members','invite_members','view_invitations','send_invitations','view_transactions','create_transaction','edit_transaction','view_goals','create_goal','edit_goal','view_budgets','create_budget','edit_budget','view_cashflow','view_reports','view_receipts','upload_receipt','edit_receipt','view_calendar','manage_calendar','view_insights','view_notifications','view_activity']),
  4: new Set(['view_workspace','view_members','view_invitations','view_transactions','create_transaction','edit_transaction','export_transactions','view_goals','view_budgets','create_budget','edit_budget','view_cashflow','view_reports','export_reports','view_receipts','upload_receipt','edit_receipt','view_calendar','view_insights','view_notifications','view_activity']),
  5: new Set(['view_workspace','view_members','view_invitations','view_transactions','view_goals','view_budgets','view_cashflow','view_reports','view_receipts','view_calendar','view_insights','view_notifications','view_activity']),
  6: new Set(['view_workspace','view_members','view_invitations','view_transactions','export_transactions','view_goals','view_budgets','view_reports','export_reports','view_receipts','view_calendar','view_insights','view_notifications','view_activity']),
  7: new Set(['view_workspace','view_members','view_transactions','view_goals','view_notifications']),
};

const ROLES = {
  1: { key: 'owner',      cls: 'ws-role-owner' },
  2: { key: 'admin',      cls: 'ws-role-admin' },
  3: { key: 'manager',    cls: 'ws-role-manager' },
  4: { key: 'accountant', cls: 'ws-role-accountant' },
  5: { key: 'viewer',     cls: 'ws-role-viewer' },
  6: { key: 'auditor',    cls: 'ws-role-auditor' },
  7: { key: 'guest',      cls: 'ws-role-guest' },
};

/* --------------------------------------------------------------------------
   Module-level cache (page lifecycle)
   -------------------------------------------------------------------------- */
let _ctx   = null;
let _perms = new Set();

/* --------------------------------------------------------------------------
   Public API
   -------------------------------------------------------------------------- */

/** Returns true if the current user has the given permission in the active workspace. */
export function hasPermission(perm) {
  return _perms.has(perm);
}

/** Returns the current workspace context object (or null in personal mode). */
export function getWorkspaceContext() {
  return _ctx;
}

/**
 * Initialize workspace context for the current page.
 *
 * @param {object} [options]
 * @param {string}   [options.viewPerm]  - Permission required to VIEW the page content.
 * @param {string}   [options.contentId] - ID of the main content element (hidden on denial).
 * @param {Array}    [options.gates]     - [{ id, perm }] — elements to disable/hide.
 */
export async function initWorkspaceContext({ viewPerm, contentId, gates = [] } = {}) {
  try {
    _ctx = await WorkspaceService.getContext();
  } catch {
    return; // workspace API unavailable — continue as personal
  }

  if (!_ctx?.workspaceId) return; // personal mode, no restrictions

  // Load live permissions; fall back to static role map
  try {
    const livePerms = await WorkspaceService.getMyPermissions(_ctx.workspaceId);
    _perms = new Set(livePerms.map(p => (p.permissionName || p.name || '').toLowerCase()));
  } catch {
    _perms = _STATIC_ROLE_PERMS[_ctx.roleId] ?? new Set();
  }

  // Render workspace banner in page
  _renderBanner(_ctx);

  // Check view-level permission
  if (viewPerm && !_perms.has(viewPerm)) {
    _renderPermDenied(contentId);
    return; // don't apply gates — content is already replaced
  }

  // Apply element-level permission gates
  for (const { id, perm } of gates) {
    if (!id || _perms.has(perm)) continue;
    const el = document.getElementById(id);
    if (el) {
      el.setAttribute('disabled', '');
      el.setAttribute('aria-disabled', 'true');
      el.classList.add('d-none');
    }
  }

  // Reload page when workspace is switched
  window.addEventListener('mm-workspace-change', () => location.reload());
}

/* --------------------------------------------------------------------------
   Banner rendering
   -------------------------------------------------------------------------- */
function _renderBanner(ctx) {
  if (document.getElementById('wsContextBanner')) return; // already rendered

  const role  = ROLES[ctx.roleId] || ROLES[5];
  const color = ctx.colorHex || ctx.color || '#2563eb';
  const name  = ctx.workspaceName || ctx.name || '';

  const banner = document.createElement('div');
  banner.id = 'wsContextBanner';
  banner.className = 'ws-context-banner';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-label', t('workspace.context_banner_aria'));
  banner.innerHTML = `
    <div class="ws-context-dot" style="background:${_esc(color)}" aria-hidden="true"></div>
    <span class="ws-context-name">${_esc(name)}</span>
    <span class="ws-role-badge ${role.cls} ms-2" style="font-size:.7rem">
      ${t(`workspace.role_${role.key}`)}
    </span>
    <a class="ws-context-link ms-auto" href="/pages/workspaces/dashboard.html" aria-label="${t('workspace.switcher_label')}">
      <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>
    </a>`;

  // Insert after the page heading, or at the top of dashboard-content
  const heading = document.querySelector('.page-heading');
  if (heading) {
    heading.insertAdjacentElement('afterend', banner);
  } else {
    const main = document.querySelector('.dashboard-content .container-fluid');
    if (main) main.prepend(banner);
  }
}

/* --------------------------------------------------------------------------
   Permission denied rendering
   -------------------------------------------------------------------------- */
function _renderPermDenied(contentId) {
  const target = contentId ? document.getElementById(contentId) : null;
  const html = `
    <div class="ws-perm-denied text-center py-5">
      <div class="ws-empty-icon mb-3"><i class="bi bi-shield-lock" aria-hidden="true"></i></div>
      <h5 class="fw-bold mb-2">${t('workspace.perm_denied_title')}</h5>
      <p class="text-muted mb-3">${t('workspace.perm_denied_body')}</p>
      <a class="btn btn-outline-secondary btn-sm" href="/pages/workspaces/roles.html">
        ${t('workspace.perm_denied_link')}
      </a>
    </div>`;
  if (target) {
    target.innerHTML = html;
  } else {
    // Append after banner
    const banner = document.getElementById('wsContextBanner');
    if (banner) {
      const div = document.createElement('div');
      div.innerHTML = html;
      banner.insertAdjacentElement('afterend', div.firstElementChild);
    }
  }
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */
function _esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}
