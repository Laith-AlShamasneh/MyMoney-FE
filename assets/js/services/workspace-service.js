/**
 * services/workspace-service.js — MyMoney
 * All Shared Accounts & Workspace Collaboration API calls go through this module.
 */

import { post } from '../core/api.js';
import { Config } from '../core/config.js';

const W = Config.API.WORKSPACE;

/* --------------------------------------------------------------------------
   Local context cache — avoids redundant /context calls within a page load
   -------------------------------------------------------------------------- */
let _contextCache = null;

function _loadContextFromStorage() {
  try {
    const raw = localStorage.getItem(Config.STORAGE_KEYS.WORKSPACE_CONTEXT);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function _saveContextToStorage(ctx) {
  try {
    localStorage.setItem(Config.STORAGE_KEYS.WORKSPACE_CONTEXT, JSON.stringify(ctx));
  } catch { /* ignore */ }
}

function _clearContextStorage() {
  try {
    localStorage.removeItem(Config.STORAGE_KEYS.WORKSPACE_CONTEXT);
    localStorage.removeItem(Config.STORAGE_KEYS.WORKSPACE_PERMS);
  } catch { /* ignore */ }
}

export const WorkspaceService = Object.freeze({

  /* ── Workspace management ─────────────────────────────────────────────── */

  /** POST /api/workspaces/create */
  async create(data) {
    const result = await post(W.CREATE, data);
    _contextCache = null;
    return result;
  },

  /** POST /api/workspaces/update */
  async update(data) {
    const result = await post(W.UPDATE, data);
    _contextCache = null;
    _clearContextStorage();
    return result;
  },

  /** POST /api/workspaces/get */
  async getById(workspaceId) {
    return post(W.GET, { workspaceId });
  },

  /** POST /api/workspaces/list */
  async getList() {
    return post(W.LIST);
  },

  /** POST /api/workspaces/delete */
  async remove(workspaceId) {
    const result = await post(W.DELETE, { workspaceId });
    _contextCache = null;
    _clearContextStorage();
    return result;
  },

  /** POST /api/workspaces/switch — workspaceId null = personal mode */
  async switchWorkspace(workspaceId) {
    const result = await post(W.SWITCH, { workspaceId });
    _contextCache = null;
    _clearContextStorage();
    return result;
  },

  /**
   * POST /api/workspaces/context
   * Returns the caller's current workspace context (role, permissions summary, etc.)
   * Caches in memory for the page lifecycle; use forceRefresh to bypass.
   */
  async getContext(forceRefresh = false) {
    if (!forceRefresh && _contextCache) return _contextCache;
    if (!forceRefresh) {
      const stored = _loadContextFromStorage();
      if (stored) { _contextCache = stored; return stored; }
    }
    const result = await post(W.CONTEXT);
    _contextCache = result;
    _saveContextToStorage(result);
    return result;
  },

  /** Invalidate the in-memory context cache (call after switch / update). */
  invalidateContext() {
    _contextCache = null;
    _clearContextStorage();
  },

  /* ── Members ──────────────────────────────────────────────────────────── */

  /** POST /api/workspaces/members/list */
  async getMembers({ workspaceId, statusId = null, pageNumber = 1, pageSize = 20 } = {}) {
    return post(W.MEMBERS_LIST, { workspaceId, statusId, pageNumber, pageSize });
  },

  /** POST /api/workspaces/members/update-role */
  async updateMemberRole({ workspaceId, targetUserId, newRoleId }) {
    return post(W.MEMBERS_UPDATE_ROLE, { workspaceId, targetUserId, newRoleId });
  },

  /** POST /api/workspaces/members/suspend */
  async suspendMember({ workspaceId, targetUserId }) {
    return post(W.MEMBERS_SUSPEND, { workspaceId, targetUserId });
  },

  /** POST /api/workspaces/members/reinstate */
  async reinstateMember({ workspaceId, targetUserId }) {
    return post(W.MEMBERS_REINSTATE, { workspaceId, targetUserId });
  },

  /** POST /api/workspaces/members/remove */
  async removeMember({ workspaceId, targetUserId }) {
    return post(W.MEMBERS_REMOVE, { workspaceId, targetUserId });
  },

  /** POST /api/workspaces/members/leave */
  async leaveWorkspace(workspaceId) {
    const result = await post(W.MEMBERS_LEAVE, { workspaceId });
    _contextCache = null;
    _clearContextStorage();
    return result;
  },

  /* ── Invitations ──────────────────────────────────────────────────────── */

  /** POST /api/workspaces/invitations/send */
  async sendInvitation({ workspaceId, email, roleId }) {
    return post(W.INVITATIONS_SEND, { workspaceId, email, roleId });
  },

  /** POST /api/workspaces/invitations/cancel */
  async cancelInvitation({ workspaceId, invitationId }) {
    return post(W.INVITATIONS_CANCEL, { workspaceId, invitationId });
  },

  /** POST /api/workspaces/invitations/preview — by token (public, before accept) */
  async previewInvitation(token) {
    return post(W.INVITATIONS_PREVIEW, { token });
  },

  /** POST /api/workspaces/invitations/accept — requires auth */
  async acceptInvitation(token) {
    const result = await post(W.INVITATIONS_ACCEPT, { token });
    _contextCache = null;
    _clearContextStorage();
    return result;
  },

  /** POST /api/workspaces/invitations/reject — requires auth */
  async rejectInvitation(token) {
    return post(W.INVITATIONS_REJECT, { token });
  },

  /** POST /api/workspaces/invitations/list */
  async getInvitations({ workspaceId, statusId = null, pageNumber = 1, pageSize = 20 } = {}) {
    return post(W.INVITATIONS_LIST, { workspaceId, statusId, pageNumber, pageSize });
  },

  /* ── Permissions ──────────────────────────────────────────────────────── */

  /** POST /api/workspaces/permissions/my */
  async getMyPermissions(workspaceId) {
    return post(W.PERMISSIONS_MY, { workspaceId });
  },

  /* ── Activity ─────────────────────────────────────────────────────────── */

  /** POST /api/workspaces/activity/list */
  async getActivity({ workspaceId, pageNumber = 1, pageSize = 20 } = {}) {
    return post(W.ACTIVITY_LIST, { workspaceId, pageNumber, pageSize });
  },

});
