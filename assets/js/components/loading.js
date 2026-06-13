/**
 * components/loading.js — MyMoney
 *
 * Button loading state management.
 * Disables the submit button and shows a spinner while an API call is in
 * progress, then restores the original state when done.
 *
 * Usage:
 *   import { Loading } from '../components/loading.js';
 *
 *   const btn = e.submitter;
 *   Loading.button(btn);
 *   try {
 *     await post('/api/auth/login', payload);
 *   } finally {
 *     Loading.restore(btn);
 *   }
 */

/* Store original button state keyed by element */
const _stateMap = new WeakMap();

export const Loading = Object.freeze({
  /**
   * Disables a button and replaces its content with a spinner.
   * @param {HTMLButtonElement} btn
   */
  button(btn) {
    if (!btn || _stateMap.has(btn)) return;

    _stateMap.set(btn, {
      html:     btn.innerHTML,
      disabled: btn.disabled,
      width:    btn.offsetWidth,
    });

    /* Fix width to prevent layout jump */
    btn.style.minWidth = `${btn.offsetWidth}px`;
    btn.disabled = true;
    btn.innerHTML = `
      <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
      <span class="visually-hidden">Loading...</span>`;
  },

  /**
   * Restores a button to its original state.
   * @param {HTMLButtonElement} btn
   */
  restore(btn) {
    if (!btn || !_stateMap.has(btn)) return;

    const state = _stateMap.get(btn);
    _stateMap.delete(btn);

    btn.innerHTML = state.html;
    btn.disabled  = state.disabled;
    btn.style.minWidth = '';
  },

  /**
   * Returns true if the button is currently in a loading state.
   * @param {HTMLButtonElement} btn
   */
  isLoading(btn) {
    return _stateMap.has(btn);
  },
});
