import { initI18n, t, getLanguage } from '../core/i18n.js';
import { WorkspaceService }         from '../services/workspace-service.js';
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

const ROLE_PERMS = {
  2: ['view_workspace','manage_workspace','view_members','invite_members','manage_members','remove_members','view_invitations','send_invitations','cancel_invitations','view_transactions','create_transaction','edit_transaction','delete_transaction','export_transactions','view_goals','view_budgets','view_cashflow','view_reports','export_reports','view_receipts','view_calendar','view_insights','view_notifications','view_activity'],
  3: ['view_workspace','view_members','invite_members','view_invitations','view_transactions','create_transaction','edit_transaction','view_goals','create_goal','edit_goal','view_budgets','create_budget','edit_budget','view_cashflow','view_reports','view_receipts','upload_receipt','view_calendar','view_insights','view_notifications','view_activity'],
  4: ['view_workspace','view_members','view_transactions','create_transaction','edit_transaction','export_transactions','view_goals','view_budgets','create_budget','view_cashflow','view_reports','export_reports','view_receipts','upload_receipt','view_calendar','view_insights','view_notifications','view_activity'],
  5: ['view_workspace','view_members','view_transactions','view_goals','view_budgets','view_cashflow','view_reports','view_receipts','view_calendar','view_insights','view_notifications','view_activity'],
  6: ['view_workspace','view_members','view_transactions','export_transactions','view_goals','view_budgets','view_reports','export_reports','view_receipts','view_calendar','view_insights','view_notifications','view_activity'],
  7: ['view_workspace','view_members','view_transactions','view_goals','view_notifications'],
};

const PERM_GROUPS = [
  { label: 'workspace.perm_group_workspace',    perms: ['view_workspace','manage_workspace'] },
  { label: 'workspace.perm_group_transactions', perms: ['view_transactions','create_transaction','edit_transaction','export_transactions'] },
  { label: 'workspace.perm_group_reports',      perms: ['view_reports','export_reports'] },
  { label: 'workspace.perm_group_members',      perms: ['view_members','invite_members','manage_members','remove_members'] },
];

/* --------------------------------------------------------------------------
   State
   -------------------------------------------------------------------------- */
let _token = null;
let _previewData = null;

/* --------------------------------------------------------------------------
   DOM refs
   -------------------------------------------------------------------------- */
const states = {
  loading:  document.getElementById('acceptLoading'),
  valid:    document.getElementById('acceptValid'),
  success:  document.getElementById('acceptSuccess'),
  rejected: document.getElementById('acceptRejected'),
  expired:  document.getElementById('acceptExpired'),
  invalid:  document.getElementById('acceptInvalid'),
};

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */
function _esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function _showState(name) {
  Object.entries(states).forEach(([key, el]) => {
    if (!el) return;
    el.classList.toggle('d-none', key !== name);
  });
}

function _wsInitials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

function _fmtDate(utcStr) {
  if (!utcStr) return '—';
  const lang = getLanguage();
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  }).format(new Date(utcStr));
}

/* --------------------------------------------------------------------------
   Render valid invitation
   -------------------------------------------------------------------------- */
function renderInvitation(data) {
  const color  = data.workspaceColorHex || '#2563eb';
  const type   = WS_TYPES[data.workspaceTypeId] || WS_TYPES[1];
  const role   = ROLES[data.roleId] || ROLES[5];

  // Color stripe
  const stripe = document.getElementById('acceptColorStripe');
  if (stripe) stripe.style.background = color;

  // Workspace logo
  const logo = document.getElementById('acceptWsLogo');
  if (logo) {
    logo.textContent   = _wsInitials(data.workspaceName);
    logo.style.background = color;
  }

  const wsName = document.getElementById('acceptWsName');
  if (wsName) wsName.textContent = data.workspaceName || '—';

  const wsType = document.getElementById('acceptWsType');
  if (wsType) wsType.textContent = `${type.icon} ${t(`workspace.type_${type.key}`)}`;

  // Inviter info
  const inviterInitials = document.getElementById('acceptInviterInitials');
  const inviterName     = document.getElementById('acceptInviterName');
  const inviterEmail    = document.getElementById('acceptInviterEmail');
  if (inviterInitials) {
    inviterInitials.textContent   = _wsInitials(data.inviterName || data.inviterEmail || '?');
    inviterInitials.style.background = color;
  }
  if (inviterName)  inviterName.textContent  = data.inviterName  || '—';
  if (inviterEmail) inviterEmail.textContent = data.inviterEmail || '—';

  // Role badge
  const roleBadge = document.getElementById('acceptRoleBadge');
  if (roleBadge) {
    roleBadge.className   = `ws-role-badge ${role.cls}`;
    roleBadge.textContent = t(`workspace.role_${role.key}`);
  }

  // Expiry
  const expiry = document.getElementById('acceptExpiry');
  if (expiry) expiry.textContent = _fmtDate(data.expiresAtUtc);

  // Permission preview
  const permGrid = document.getElementById('acceptPermGrid');
  if (permGrid) {
    const perms = new Set(ROLE_PERMS[data.roleId] || []);
    permGrid.innerHTML = PERM_GROUPS.map(g => {
      const allowed = g.perms.filter(p => perms.has(p));
      if (!allowed.length) return '';
      return `<div class="col-12 col-sm-6">
        <div class="fw-semibold mb-1" style="font-size:.78rem">${t(g.label)}</div>
        ${allowed.map(p => `<div class="text-success small"><i class="bi bi-check2 me-1"></i>${t('workspace.perm_' + p)}</div>`).join('')}
      </div>`;
    }).join('');
  }

  _showState('valid');
}

/* --------------------------------------------------------------------------
   Accept / Reject actions
   -------------------------------------------------------------------------- */
document.getElementById('acceptBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('acceptBtn');
  btn.disabled = true;
  try {
    await WorkspaceService.acceptInvitation(_token);
    _showState('success');
  } catch (e) {
    const code = e?.status || e?.errorCode;
    if (code === -4 || (e?.message || '').toLowerCase().includes('expired')) {
      _showState('expired');
    } else {
      _showState('invalid');
    }
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('rejectBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('rejectBtn');
  btn.disabled = true;
  try {
    await WorkspaceService.rejectInvitation(_token);
    _showState('rejected');
  } catch {
    _showState('rejected'); // show rejected state regardless
  } finally {
    btn.disabled = false;
  }
});

/* --------------------------------------------------------------------------
   Init — does NOT require auth for the preview step
   -------------------------------------------------------------------------- */
async function init() {
  await initI18n();

  // Extract token from URL
  const params = new URLSearchParams(window.location.search);
  _token = params.get('token');

  if (!_token) {
    _showState('invalid');
    return;
  }

  _showState('loading');

  try {
    _previewData = await WorkspaceService.previewInvitation(_token);

    if (!_previewData) {
      _showState('invalid');
      return;
    }

    // Check invitation status from preview
    const statusId = _previewData.statusId;
    if (statusId === 4) { _showState('expired');  return; }
    if (statusId === 2) { _showState('success');   return; }
    if (statusId === 3) { _showState('rejected');  return; }
    if (statusId === 5) { _showState('invalid');   return; }

    // Check if user is authenticated — if not, redirect to login with return URL
    const authToken = localStorage.getItem(Config.STORAGE_KEYS?.AUTH_TOKEN || 'mm.token');
    if (!authToken) {
      const returnUrl = encodeURIComponent(window.location.href);
      const loginUrl  = (Config.ROUTES?.LOGIN || '/pages/auth/login.html') + '?returnUrl=' + returnUrl;
      window.location.href = loginUrl;
      return;
    }

    renderInvitation(_previewData);
  } catch (e) {
    const msg = (e?.message || '').toLowerCase();
    if (msg.includes('expired') || msg.includes('انتهت')) {
      _showState('expired');
    } else {
      _showState('invalid');
    }
  }
}

init();
