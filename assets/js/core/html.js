/**
 * core/html.js — MyMoney
 *
 * Output-encoding helpers for safely building HTML strings from dynamic data.
 *
 * Rule: call escapeHtml() on EVERY interpolated value — text OR attribute — that
 * is not a trusted constant or a translation-file string. Unlike a
 * textContent→innerHTML round-trip, escapeHtml() also encodes quotes, so it is
 * safe inside double/single-quoted attributes (e.g. data-*, title, style).
 */

const _ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapes HTML-special characters so a value can be safely interpolated into
 * an HTML string in either text or quoted-attribute context.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => _ENTITIES[ch]);
}

/**
 * Tagged-template helper that auto-escapes every interpolated value.
 * Use for building HTML fragments from mixed trusted/untrusted parts:
 *   el.innerHTML = html`<span>${userName}</span>`;
 * To intentionally inject already-trusted HTML, pass it through trustedHtml().
 */
const _TRUSTED = Symbol('trustedHtml');

export function trustedHtml(str) {
  return { [_TRUSTED]: true, value: String(str ?? '') };
}

export function html(strings, ...values) {
  return strings.reduce((out, chunk, i) => {
    if (i === 0) return chunk;
    const v = values[i - 1];
    const rendered = v && typeof v === 'object' && v[_TRUSTED] ? v.value : escapeHtml(v);
    return out + rendered + chunk;
  }, '');
}
