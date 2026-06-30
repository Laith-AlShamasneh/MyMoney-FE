/**
 * components/toast.js — MyMoney
 *
 * Lightweight toast notification system.
 * Renders Bootstrap 5 toasts in a fixed container at the top-right (LTR)
 * or top-left (RTL) of the screen. Toasts stack vertically and auto-dismiss.
 *
 * Usage:
 *   import { showToast } from '../components/toast.js';
 *   showToast('تم الحفظ بنجاح.', 'success');
 */

import { t } from '../core/i18n.js';

/* --------------------------------------------------------------------------
   Container — created once and reused
   -------------------------------------------------------------------------- */
const CONTAINER_ID = 'mm-toast-container';

function _getContainer() {
  let container = document.getElementById(CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = CONTAINER_ID;
    container.className = 'mm-toast-container toast-container position-fixed top-0 end-0 p-3';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    document.body.appendChild(container);
  }
  return container;
}

/* --------------------------------------------------------------------------
   Icon and colour mapping
   -------------------------------------------------------------------------- */
const TOAST_CONFIG = {
  success: { icon: 'check-circle-fill', textClass: 'text-success' },
  error:   { icon: 'x-circle-fill',     textClass: 'text-danger'  },
  warning: { icon: 'exclamation-triangle-fill', textClass: 'text-warning' },
  info:    { icon: 'info-circle-fill',   textClass: 'text-primary' },
};

/* --------------------------------------------------------------------------
   Public API
   -------------------------------------------------------------------------- */

/**
 * Shows a toast notification.
 *
 * @param {string} message    - The message to display.
 * @param {'success'|'error'|'warning'|'info'} [type='info'] - Visual style.
 * @param {number} [duration=5000] - Auto-dismiss delay in milliseconds.
 */
export function showToast(message, type = 'info', duration = 5000) {
  const config  = TOAST_CONFIG[type] || TOAST_CONFIG.info;
  const id      = `mm-toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const container = _getContainer();

  const toastEl = document.createElement('div');
  toastEl.id = id;
  toastEl.className = 'toast align-items-center border-0 shadow';
  toastEl.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toastEl.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  toastEl.setAttribute('aria-atomic', 'true');

  toastEl.innerHTML = `
    <div class="d-flex align-items-center gap-2 p-3">
      <i class="bi bi-${config.icon} ${config.textClass} flex-shrink-0" aria-hidden="true" style="font-size:1.1rem"></i>
      <span class="flex-grow-1">${_escapeHtml(message)}</span>
      <button type="button" class="btn-close ms-2" data-bs-dismiss="toast" aria-label="${_escapeHtml(t('common.close'))}"></button>
    </div>`;

  container.appendChild(toastEl);

  /* Bootstrap 5 Toast initialisation */
  if (window.bootstrap?.Toast) {
    const bsToast = new window.bootstrap.Toast(toastEl, {
      autohide: true,
      delay: duration,
    });
    bsToast.show();
    toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
  } else {
    /* Fallback if Bootstrap JS is not loaded */
    toastEl.style.display = 'block';
    setTimeout(() => toastEl.remove(), duration);
  }
}

/** Convenience wrappers */
export const showSuccess = (msg, duration) => showToast(msg, 'success', duration);
export const showError   = (msg, duration) => showToast(msg, 'error',   duration);
export const showWarning = (msg, duration) => showToast(msg, 'warning', duration);
export const showInfo    = (msg, duration) => showToast(msg, 'info',    duration);

/* --------------------------------------------------------------------------
   Internal helpers
   -------------------------------------------------------------------------- */
function _escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
