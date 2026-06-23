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

const WS_TYPES = {
  1: { icon: '👤', key: 'personal' },
  2: { icon: '👨‍👩‍👧', key: 'family' },
  3: { icon: '🏢', key: 'business' },
  4: { icon: '👥', key: 'team' },
};

const ACTIVITY_ICONS = {
  workspace_created:    { icon: 'bi-grid-1x2-fill',      cls: 'ws-activity-created' },
  workspace_updated:    { icon: 'bi-pencil-fill',         cls: 'ws-activity-updated' },
  member_invited:       { icon: 'bi-person-plus-fill',    cls: 'ws-activity-invited' },
  member_joined:        { icon: 'bi-person-check-fill',   cls: 'ws-activity-joined' },
  member_removed:       { icon: 'bi-person-x-fill',       cls: 'ws-activity-removed' },
  member_left:          { icon: 'bi-box-arrow-right',     cls: 'ws-activity-left' },
  member_role_changed:  { icon: 'bi-shield-fill',         cls: 'ws-activity-role' },
  member_suspended:     { icon: 'bi-pause-circle-fill',   cls: 'ws-activity-suspended' },
  invitation_cancelled: { icon: 'bi-x-circle-fill',       cls: 'ws-activity-cancelled' },
};

const WS_COLORS = ['#2563eb','#7c3aed','#059669','#d97706','#dc2626','#0891b2','#6366f1','#db2777'];

/* --------------------------------------------------------------------------
   DOM refs
   -------------------------------------------------------------------------- */
const personalModeBanner = document.getElementById('personalModeBanner');
const wsListSection      = document.getElementById('wsListSection');
const wsListSkeleton     = document.getElementById('wsListSkeleton');
const wsCards            = document.getElementById('wsCards');
const wsEmpty            = document.getElementById('wsEmpty');
const wsActiveSection    = document.getElementById('wsActiveSection');
const wsLogo             = document.getElementById('wsLogo');
const wsActiveTitle      = document.getElementById('wsActiveTitle');
const wsActiveSubtitle   = document.getElementById('wsActiveSubtitle');
const kpiMembers         = document.getElementById('kpiMembers');
const kpiPendingInv      = document.getElementById('kpiPendingInv');
const kpiRole            = document.getElementById('kpiRole');
const kpiType            = document.getElementById('kpiType');
const activitySkeleton   = document.getElementById('activitySkeleton');
const activityList       = document.getElementById('activityList');
const activityEmpty      = document.getElementById('activityEmpty');
const membersSkeleton    = document.getElementById('membersSkeleton');
const membersQuickList   = document.getElementById('membersQuickList');
const createWsBtn        = document.getElementById('createWsBtn');
const wsEmptyCta         = document.getElementById('wsEmptyCta');

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

function _wsLogoHtml(name, color, size = 48, fontSize = '1rem') {
  return `<div class="ws-page-logo" style="width:${size}px;height:${size}px;font-size:${fontSize};background:${_esc(color)}">${_wsInitials(name)}</div>`;
}

function _roleBadge(roleId) {
  const r = ROLES[roleId] || ROLES[5];
  return `<span class="ws-role-badge ${r.cls}">${t(`workspace.role_${r.key}`)}</span>`;
}

function _fmtDate(utcStr) {
  if (!utcStr) return '—';
  const lang = getLanguage();
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(new Date(utcStr));
}

function _timeAgo(utcStr) {
  if (!utcStr) return '';
  const isAr   = getLanguage() === 'ar';
  const diffMs = Date.now() - new Date(utcStr).getTime();
  const mins   = Math.floor(diffMs / 60000);
  const hrs    = Math.floor(mins / 60);
  const days   = Math.floor(hrs / 24);
  if (mins < 1)  return isAr ? 'الآن' : 'just now';
  if (mins < 60) return isAr ? `منذ ${mins} دقيقة` : `${mins}m ago`;
  if (hrs < 24)  return isAr ? `منذ ${hrs} ساعة` : `${hrs}h ago`;
  return isAr ? `منذ ${days} يوم` : `${days}d ago`;
}

/* --------------------------------------------------------------------------
   Workspace list (personal mode)
   -------------------------------------------------------------------------- */
async function loadWorkspaceList() {
  wsListSkeleton.classList.remove('d-none');
  wsCards.classList.add('d-none');
  wsEmpty.classList.add('d-none');

  try {
    const list = await WorkspaceService.getList();
    wsListSkeleton.classList.add('d-none');

    if (!list || list.length === 0) {
      wsEmpty.classList.remove('d-none');
      return;
    }

    wsCards.innerHTML = list.map(ws => _buildWsCard(ws)).join('');
    wsCards.classList.remove('d-none');

    wsCards.querySelectorAll('[data-switch-ws]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const wsId   = +btn.dataset.switchWs;
        const manage = btn.dataset.manage === 'true';
        try {
          await WorkspaceService.switchWorkspace(wsId);
          window.dispatchEvent(new CustomEvent('mm-workspace-change', { detail: { workspaceId: wsId } }));
          window.location.href = manage
            ? '/pages/workspaces/settings.html'
            : window.location.pathname;
        } catch (e) {
          showError(t('workspace.error_switch'));
        }
      });
    });
  } catch {
    wsListSkeleton.classList.add('d-none');
    wsEmpty.classList.remove('d-none');
    showError(t('workspace.error_load'));
  }
}

function _buildWsCard(ws) {
  const type = WS_TYPES[ws.typeId] || WS_TYPES[1];
  const role = ROLES[ws.roleId] || ROLES[5];
  const color = ws.color || '#2563eb';
  return `
    <div class="col-12 col-sm-6 col-lg-4">
      <div class="card border-0 shadow-sm h-100 ws-card" style="border-top:3px solid ${_esc(color)} !important">
        <div class="card-body d-flex flex-column gap-2 p-3">
          <div class="d-flex align-items-center gap-2 mb-1">
            ${_wsLogoHtml(ws.name, color, 40, '.85rem')}
            <div class="flex-grow-1 min-w-0">
              <div class="fw-semibold text-truncate">${_esc(ws.name)}</div>
              <div class="text-muted small">${type.icon} ${t(`workspace.type_${type.key}`)}</div>
            </div>
          </div>
          ${ws.description ? `<p class="text-muted small mb-0 text-truncate">${_esc(ws.description)}</p>` : ''}
          <div class="d-flex align-items-center justify-content-between mt-auto pt-1">
            ${_roleBadge(ws.roleId)}
            <div class="d-flex gap-1">
              <button class="btn btn-sm btn-outline-secondary" data-switch-ws="${ws.workspaceId}" data-manage="true"
                      title="${t('workspace.manage_btn')}">
                <i class="bi bi-gear" aria-hidden="true"></i>
              </button>
              <button class="btn btn-sm btn-outline-primary" data-switch-ws="${ws.workspaceId}">
                <span>${t('workspace.switcher_switch')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

/* --------------------------------------------------------------------------
   Active workspace
   -------------------------------------------------------------------------- */
async function loadActiveWorkspace(ctx) {
  const workspaceId = ctx.currentWorkspaceId;
  const { workspaceName, color: colorRaw, workspaceTypeId, roleId } = ctx;
  const color = colorRaw || '#2563eb';
  const type  = WS_TYPES[workspaceTypeId] || WS_TYPES[1];

  wsLogo.innerHTML = _wsLogoHtml(workspaceName, color, 52, '1.1rem');
  wsActiveTitle.textContent = workspaceName;
  wsActiveSubtitle.innerHTML = `${type.icon} ${t(`workspace.type_${type.key}`)} &nbsp;·&nbsp; ${_roleBadge(roleId)}`;

  kpiRole.innerHTML = _roleBadge(roleId);
  kpiType.textContent = `${type.icon} ${t(`workspace.type_${type.key}`)}`;

  await Promise.allSettled([
    loadMembersKpi(workspaceId),
    loadActivity(workspaceId),
    loadMembersPreview(workspaceId),
  ]);
}

async function loadMembersKpi(workspaceId) {
  try {
    const [members, invitations] = await Promise.all([
      WorkspaceService.getMembers({ workspaceId, statusId: 1, pageNumber: 1, pageSize: 1 }),
      WorkspaceService.getInvitations({ workspaceId, statusId: 1, pageNumber: 1, pageSize: 1 }),
    ]);
    kpiMembers.textContent     = members?.totalCount ?? members?.length ?? '—';
    kpiPendingInv.textContent  = invitations?.totalCount ?? invitations?.length ?? '0';
  } catch {
    kpiMembers.textContent = '—';
    kpiPendingInv.textContent = '—';
  }
}

async function loadActivity(workspaceId) {
  try {
    const data = await WorkspaceService.getActivity({ workspaceId, pageNumber: 1, pageSize: 8 });
    activitySkeleton.classList.add('d-none');

    const items = data?.items ?? data ?? [];
    if (!items.length) {
      activityEmpty.classList.remove('d-none');
      return;
    }

    activityList.innerHTML = items.map(a => _buildActivityItem(a)).join('');
    activityList.classList.remove('d-none');
  } catch {
    activitySkeleton.classList.add('d-none');
    activityEmpty.classList.remove('d-none');
  }
}

function _buildActivityItem(a) {
  const evType  = (a.eventType || '').toLowerCase();
  const ai      = ACTIVITY_ICONS[evType] || { icon: 'bi-circle-fill', cls: '' };
  const timeStr = _timeAgo(a.occurredAtUtc);

  return `
    <li class="ws-activity-item">
      <div class="ws-activity-icon ${ai.cls}"><i class="bi ${ai.icon}" aria-hidden="true"></i></div>
      <div class="ws-activity-content">
        <div class="ws-activity-desc">${_esc(a.description || a.eventType)}</div>
        <div class="ws-activity-meta">
          <span>${_esc(a.actorName || '')}</span>
          ${timeStr ? `<span class="ws-activity-time">${timeStr}</span>` : ''}
        </div>
      </div>
    </li>`;
}

async function loadMembersPreview(workspaceId) {
  try {
    const data = await WorkspaceService.getMembers({ workspaceId, statusId: 1, pageNumber: 1, pageSize: 5 });
    membersSkeleton.classList.add('d-none');

    const items = data?.items ?? data ?? [];
    if (!items.length) {
      membersQuickList.innerHTML = `<p class="text-muted small">${t('workspace.members_empty_title')}</p>`;
      membersQuickList.classList.remove('d-none');
      return;
    }

    membersQuickList.innerHTML = items.map(m => `
      <div class="d-flex align-items-center gap-2 mb-2">
        <div class="ws-member-avatar-initials flex-shrink-0" style="background:${ROLES[m.roleId]?.cls ? 'var(--ws-role-' + (ROLES[m.roleId]?.key) + ')' : '#6366f1'};opacity:.85">${_wsInitials(m.displayName || m.email)}</div>
        <div class="flex-grow-1 min-w-0">
          <div class="fw-semibold small text-truncate">${_esc(m.displayName || m.email)}</div>
          <div class="text-muted" style="font-size:.76rem">${_esc(m.email)}</div>
        </div>
        ${_roleBadge(m.roleId)}
      </div>`).join('');
    membersQuickList.classList.remove('d-none');
  } catch {
    membersSkeleton.classList.add('d-none');
  }
}

/* --------------------------------------------------------------------------
   Create Workspace modal
   -------------------------------------------------------------------------- */
let _selectedColor   = WS_COLORS[0];
let _selectedTypeId  = 1;

function initCreateModal() {
  const modal       = document.getElementById('createWsModal');
  const nameInput   = document.getElementById('wsNameInput');
  const colorStripe = document.getElementById('wsColorStripe');
  const typeGrid    = document.getElementById('wsTypeGrid');
  const colorGrid   = document.getElementById('wsColorSwatches');
  const submitBtn   = document.getElementById('createWsSubmitBtn');

  if (!modal) return;

  // Type selection
  typeGrid?.querySelectorAll('.ws-type-option').forEach(btn => {
    btn.addEventListener('click', () => {
      typeGrid.querySelectorAll('.ws-type-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      _selectedTypeId = +btn.dataset.typeId;
    });
  });

  // Color swatches
  colorGrid?.querySelectorAll('.ws-color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      colorGrid.querySelectorAll('.ws-color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      _selectedColor = sw.dataset.color;
      if (colorStripe) colorStripe.style.background = _selectedColor;
    });
  });

  submitBtn?.addEventListener('click', handleCreate);

  // Reset on open
  modal.addEventListener('show.bs.modal', () => {
    document.getElementById('createWsForm')?.reset();
    _selectedColor  = WS_COLORS[0];
    _selectedTypeId = 1;
    typeGrid?.querySelectorAll('.ws-type-option').forEach((b, i) => b.classList.toggle('selected', i === 0));
    colorGrid?.querySelectorAll('.ws-color-swatch').forEach((s, i) => s.classList.toggle('selected', i === 0));
    if (colorStripe) colorStripe.style.background = WS_COLORS[0];
  });
}

async function handleCreate() {
  const name = document.getElementById('wsNameInput')?.value.trim();
  const desc = document.getElementById('wsDescInput')?.value.trim();

  if (!name) {
    document.getElementById('wsNameInput')?.classList.add('is-invalid');
    return;
  }
  document.getElementById('wsNameInput')?.classList.remove('is-invalid');

  const btn = document.getElementById('createWsSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  try {
    await WorkspaceService.create({
      name,
      description: desc || null,
      typeId:      _selectedTypeId,
      color:       _selectedColor,
    });

    bootstrap.Modal.getInstance(document.getElementById('createWsModal'))?.hide();
    showSuccess(t('workspace.create_success'));
    location.reload();
  } catch (e) {
    showError(e?.message || t('workspace.error_create'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = t('workspace.create_submit'); }
  }
}

/* --------------------------------------------------------------------------
   Init
   -------------------------------------------------------------------------- */
async function init() {
  await initI18n();
  await guardPage();
  initLayout();

  // Wire CTA buttons
  createWsBtn?.addEventListener('click', () =>
    bootstrap.Modal.getOrCreateInstance(document.getElementById('createWsModal')).show()
  );
  wsEmptyCta?.addEventListener('click', () =>
    bootstrap.Modal.getOrCreateInstance(document.getElementById('createWsModal')).show()
  );

  let ctx;
  try {
    ctx = await WorkspaceService.getContext();
  } catch {
    showError(t('workspace.error_load'));
    return;
  }

  if (!ctx || !ctx.currentWorkspaceId) {
    // Personal mode
    personalModeBanner.classList.remove('d-none');
    await loadWorkspaceList();
  } else {
    // Active workspace dashboard
    wsListSection.classList.add('d-none');
    wsActiveSection.classList.remove('d-none');
    personalModeBanner.classList.add('d-none');
    await loadActiveWorkspace(ctx);
  }

  initCreateModal();

  window.addEventListener('mm-workspace-change', () => location.reload());
}

init();
