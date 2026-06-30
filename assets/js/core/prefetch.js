/* ==========================================================================
   core/prefetch.js — FH7 (pragmatic MPA navigation speedup)

   This stays a multi-page app (full reloads, no bundler). To take the sting
   out of per-navigation re-init, we speculatively prefetch the *next* page
   document on user intent (hover / focus / touch start) so the browser serves
   it warm when the click actually lands.

   Why it's safe:
   - Only same-origin page documents (*.html) are prefetched — never assets,
     never API/data endpoints.
   - Our HTML pages are static shells; all user/financial data is fetched via
     the API *after* the page boots, so a prefetched shell carries no PII.
   - rel="prefetch" as="document" fetches just the HTML; the shared CSS/JS are
     already in the HTTP cache from the current page, so cost is minimal.
   - Honors Save-Data and 2g connections, and no-ops where unsupported (Safari).
   ========================================================================== */

const _prefetched = new Set();

/* Respect the user's data/connection constraints. */
function _eligible() {
  const c = navigator.connection;
  if (c) {
    if (c.saveData) return false;
    if (/(^|-)2g$/.test(c.effectiveType || '')) return false;
  }
  // Feature-detect: Safari's relList does not support 'prefetch'.
  try {
    return document.createElement('link').relList.supports('prefetch');
  } catch {
    return false;
  }
}

function _doPrefetch(href) {
  if (_prefetched.has(href)) return;
  _prefetched.add(href);
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.as = 'document';
  link.href = href;
  document.head.appendChild(link);
}

/* Resolve an <a> to a prefetchable same-origin page document, or null. */
function _resolveLink(a) {
  if (!a) return null;
  const href = a.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return null;
  if (a.hasAttribute('download') || a.target === '_blank' || a.dataset.noPrefetch != null) return null;

  let url;
  try { url = new URL(href, location.href); } catch { return null; }
  if (url.origin !== location.origin) return null;          // same-origin only
  if (!/\.html?$/.test(url.pathname)) return null;          // page documents only
  if (url.pathname === location.pathname) return null;      // not the current page
  return url.href;
}

function _onIntent(e) {
  const a = e.target.closest && e.target.closest('a[href]');
  const href = _resolveLink(a);
  if (!href) return;

  if (e.type === 'pointerover') {
    /* Small delay so a cursor merely flying over a link doesn't trigger a
       fetch; a deliberate hover (~65ms) does. */
    const id = setTimeout(() => _doPrefetch(href), 65);
    a.addEventListener('pointerout', () => clearTimeout(id), { once: true });
  } else {
    _doPrefetch(href);
  }
}

/**
 * Wire intent-based page prefetching. Idempotent; call once per page from
 * the shared layout init. No-ops on Save-Data, slow links, or unsupported
 * browsers.
 */
export function initPrefetch() {
  if (!_eligible()) return;
  const opts = { capture: true, passive: true };
  document.addEventListener('pointerover', _onIntent, opts);
  document.addEventListener('focusin', _onIntent, opts);
  document.addEventListener('touchstart', _onIntent, opts);
}
