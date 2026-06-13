/**
 * components/loading.js — MyMoney
 *
 * Centralised loading infrastructure. Single source of truth for all loading
 * states across the application. Do NOT roll custom spinners or disabled
 * states in page code — always use this module.
 *
 * API:
 *   Loader.show()                   — full-screen overlay (ref-counted)
 *   Loader.hide()                   — release one ref; hides when depth reaches 0
 *   Loader.showOverlay(el)          — inject loading overlay inside a DOM element
 *   Loader.hideOverlay(el)          — remove that overlay
 *   Loader.setButtonLoading(btn)    — disable button and show inline spinner
 *   Loader.clearButtonLoading(btn)  — restore button to original state
 *   Loader.isButtonLoading(btn)     — true while button is in loading state
 */

/* --------------------------------------------------------------------------
   Full-screen loader — one element injected lazily into <body>
   -------------------------------------------------------------------------- */
let _loaderEl    = null;
let _loaderDepth = 0;

function _ensureLoaderEl() {
  if (_loaderEl) return _loaderEl;
  _loaderEl = document.createElement('div');
  _loaderEl.id = 'mm-loader';
  _loaderEl.setAttribute('aria-hidden', 'true');
  _loaderEl.innerHTML = `
    <div class="mm-loader-inner">
      <div class="mm-loader-spinner" role="status"></div>
    </div>`;
  document.body.appendChild(_loaderEl);
  return _loaderEl;
}

/* --------------------------------------------------------------------------
   Element overlay — one overlay per target element
   -------------------------------------------------------------------------- */
const _overlayMap = new WeakMap();

/* --------------------------------------------------------------------------
   Button state — original HTML and disabled flag stored per element
   -------------------------------------------------------------------------- */
const _stateMap = new WeakMap();

/* --------------------------------------------------------------------------
   Public API
   -------------------------------------------------------------------------- */
export const Loader = Object.freeze({

  /**
   * Show the full-screen loading overlay.
   * Ref-counted: each call to show() must be paired with hide().
   */
  show() {
    _loaderDepth++;
    _ensureLoaderEl().classList.add('active');
  },

  /**
   * Release one ref on the full-screen overlay.
   * The overlay hides only when the ref count reaches zero.
   */
  hide() {
    if (_loaderDepth > 0) _loaderDepth--;
    if (_loaderDepth === 0) {
      _loaderEl?.classList.remove('active');
    }
  },

  /**
   * Inject a loading overlay inside a specific DOM element.
   * If the element has `position: static` it is changed to `relative`.
   * Idempotent — calling twice on the same element is safe.
   * @param {HTMLElement} el
   */
  showOverlay(el) {
    if (!el || _overlayMap.has(el)) return;
    if (getComputedStyle(el).position === 'static') {
      el.style.position = 'relative';
    }
    const overlay = document.createElement('div');
    overlay.className = 'mm-overlay-loader';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `<div class="mm-loader-spinner mm-loader-spinner--sm" role="status"></div>`;
    el.appendChild(overlay);
    _overlayMap.set(el, overlay);
  },

  /**
   * Remove the overlay injected by showOverlay().
   * @param {HTMLElement} el
   */
  hideOverlay(el) {
    if (!el || !_overlayMap.has(el)) return;
    _overlayMap.get(el).remove();
    _overlayMap.delete(el);
  },

  /**
   * Disable a button and replace its content with a spinner.
   * The button's original width is preserved to prevent layout shift.
   * Idempotent — safe to call while already loading.
   * @param {HTMLButtonElement} btn
   */
  setButtonLoading(btn) {
    if (!btn || _stateMap.has(btn)) return;
    _stateMap.set(btn, {
      html:     btn.innerHTML,
      disabled: btn.disabled,
    });
    btn.style.minWidth = `${btn.offsetWidth}px`;
    btn.disabled = true;
    btn.innerHTML = `
      <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
      <span class="visually-hidden">Loading...</span>`;
  },

  /**
   * Restore a button to its state before setButtonLoading() was called.
   * @param {HTMLButtonElement} btn
   */
  clearButtonLoading(btn) {
    if (!btn || !_stateMap.has(btn)) return;
    const state = _stateMap.get(btn);
    _stateMap.delete(btn);
    btn.innerHTML      = state.html;
    btn.disabled       = state.disabled;
    btn.style.minWidth = '';
  },

  /**
   * Returns true while the button is in a loading state.
   * @param {HTMLButtonElement} btn
   */
  isButtonLoading(btn) {
    return _stateMap.has(btn);
  },
});
