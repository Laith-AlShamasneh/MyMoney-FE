# Frontend Audit — Remediation Summary

Companion to [`ENTERPRISE_FRONTEND_AUDIT.md`](./ENTERPRISE_FRONTEND_AUDIT.md). That document is the
read-only audit (findings, impact, recommendations); **this** document records what was actually
**changed** in response, phase by phase, plus what was intentionally deferred and why.

- **Scope:** `MyMoney-FE` (vanilla-JS multi-page app, no build step, Bootstrap 5.3.8).
- **Date:** June 2026.
- **Constraints honored throughout:** no build step / no bundler introduced; backward compatibility
  preserved; `ARCHITECTURE_DECISIONS.md` + `DEVELOPMENT_GUIDE.md` treated as source of truth.
- **Verification basis:** all changes were verified **structurally** (served locally, HTTP 200, delimiter
  balance, grep/`@font-face`/CSP-hash checks, locale parity). Items needing a real browser
  (visual RTL, dark-mode, keyboard nav, prefetch/bfcache, CSS coverage) are flagged under
  [Outstanding verification](#outstanding-verification).

---

## Status at a glance

| Phase | Done | Deferred |
|-------|------|----------|
| Critical | FC1, FC2, FC3 | — |
| High | FH1, FH2, FH3, FH4, FH5, FH6, FH7, FH8 | — |
| Medium | FM1, FM3\*, FM5, FM8, FM9, FM10, FM11 | FM2, FM4, FM6, FM7 |
| Low | FL1, FL3, FL4, FL5, FL7, FL8 | FL2, FL6 |

\* FM3 = the safe dead-CSS subset only (see below).

---

## Critical

### FC1 — Stored-XSS in global layout + Content-Security-Policy
- Created `assets/js/core/html.js` — quote-safe `escapeHtml()` (escapes `& < > " '`), an `html`
  tagged-template, and `trustedHtml()`.
- Escaped all 11 dynamic sinks in `components/layout.js` (navbar name/avatar, workspace switcher,
  currency items, workspace items), plus `currency.js` and `workspace-settings.js`.
- Added a **hash-locked CSP** `<meta http-equiv>` to all 33 HTML pages. No `'unsafe-inline'` for
  scripts (the inline boot script is whitelisted by `sha256` hash), which neutralizes injected
  scripts/handlers app-wide — including the page-level `_esc` helpers that only escape text, not
  attributes.

### FC2 — Access token moved to memory-only
- `core/auth.js`: access token is no longer persisted to `localStorage`. `_applySession` keeps only the
  refresh token; `_clearStoredTokens` still purges the legacy `mm.accessToken` key.
- `guardPage()` proactively refreshes from the refresh token when there is no in-memory access token.
- Aligns the **code** with ADR-005, which always specified memory-only.

### FC3 — Blank-page-on-JS-error safety net
- The inline boot script on every page now guarantees the body is revealed even if app JS fails:
  `setTimeout(mmReveal, 4000)` + `error` / `unhandledrejection` listeners that remove the `mm-init`
  visibility lock.

---

## High

### FH1 — Chart accessibility (partial)
Added `role="img"` + `dir="ltr"` + `aria-label` to the unlabeled `<canvas>` charts.
*Follow-up:* a screen-reader data-table alternative per chart.

### FH2 — Currency switch re-fetches converted amounts
`dashboard.js` and 6 other pages now **re-fetch** on `mm-currency-change` instead of relabeling
cached, un-converted numbers (which displayed wrong values).

### FH3 — CDN hardening + self-host scaffold
- **Chart.js** (`4.4.3`, in 5 pages): kept on jsdelivr but pinned with a real
  `integrity="sha384-…"` + `crossorigin="anonymous"`.
- **Google Fonts (Inter):** SRI cannot apply to a CSS `@import`, so a full **self-host scaffold** was
  generated — `assets/css/fonts/inter.css` (all gstatic URLs rewritten to local), `download-inter.sh`,
  and a README. Same for Chart.js at `assets/vendors/chart.js/`.
- See [Production follow-ups](#production-follow-ups) to complete the self-host.

### FH4 — RTL: physical → logical CSS properties
Converted app-owned physical-direction CSS to logical properties (`margin/padding/border-inline-*`,
`inset-inline-*`, `text-align: start/end`) in `currency.css`, `calendar.css`, `layout.css`,
`pages/receipts.css`, and **removed the now-redundant `[dir="rtl"]` manual-flip blocks**. Preserved the
RTL overrides that have no logical equivalent (`transform`, `box-shadow`, `transform-origin`,
`flex-direction: row-reverse`, `direction`). `rtl.css` was left untouched — it only overrides
Bootstrap's physical props, which is correct.

### FH5 — Dropdown keyboard accessibility
- Currency switcher → WAI-ARIA **combobox** (`aria-activedescendant`, option ids `cs-opt-<code>`,
  Arrow/Home/End/Enter/Tab).
- Workspace switcher → **listbox** with roving focus.
- Supporting styles: `.cs-item.cs-active`, `.ws-item:focus-visible`.
- *Smaller follow-up:* focus-trap for the notification `role="dialog"` dropdown.

### FH6 — Real 403 page
Created `pages/errors/403.html` (previously 403s redirected to the 404 page), added
`Config.ROUTES.ERROR_403`, pointed the `api.js` 403 handler at it, added `errors_page.403_*` i18n keys.

### FH7 — MPA navigation/perf (pragmatic, no SPA rewrite)
- `assets/js/core/prefetch.js` — intent-based (`pointerover`/`focusin`/`touchstart`) prefetch of the
  next `.html` page; safe (same-origin pages only, Save-Data/2g aware, Safari no-op).
- Resource hints in all 33 heads: `preconnect` to API + Google Fonts, `dns-prefetch` to jsdelivr.
- bfcache fix: `notifications.js` `beforeunload` → `pagehide`.

### FH8 — Client request timeout
`api.js` `request()` now has a 30s `AbortController` timeout (`errors.timeout` surfaced). Blob
up/downloads are intentionally uncapped.

---

## Medium

### FM1 — Locale parity + pluralization
- Reconciled AR/EN locale files to **1801 leaf keys each, 0 orphans** (added `nav_recurring` to EN,
  5 `reports.status_badge_*` to AR).
- Replaced hardcoded Arabic plural strings in `notifications.js` with `Intl.RelativeTimeFormat`
  (correct dual/few/many — the old code was wrong for "2").

### FM3 — Dead-CSS prune (safe subset only)
Removed **17 dead rule blocks (~94 lines)** — a mockup chart system (`chart-bars`, `chart-column`,
`donut-chart`, `bar-NN`) and mockup empty-state classes — from `components.css`, `currency.css`,
`receipts.css`, using a conservative detector (removes a rule only if **every** selector subject is a
confirmed-dead class; keeps anything sharing a prefix with a live class or built dynamically).
The `components.css` split and the broader dead-CSS pool were **not** done — see
[Outstanding verification](#outstanding-verification).

### FM5 — Landmarks
Added `<main>` to the 3 pages that lacked it (`confirm-email-change`, `change-password`, `accept`).

### FM8 — Notification polling gated on visibility
Polling now pauses when `document.hidden` and resumes (with an immediate refresh) on
`visibilitychange` — no wasted battery/network on backgrounded tabs.

### FM9 — api.js de-duplication
`downloadBlob` (GET) and `downloadBlobPost` (POST) were ~95% identical; factored a shared
`_downloadBlob()` core (auth headers, 401-refresh retry, 403/5xx/JSON-envelope → `ApiError`,
Content-Disposition filename). Public signatures unchanged.

### FM10 — Environment config footgun
`config.js` `API_BASE_URL` now resolves via `resolveApiBase()`: `window.MM_API_BASE_URL` override →
`localhost`-only dev fallback → otherwise a loud `console.error` + empty base (fails **visibly**
instead of silently calling a dev URL in production). Added `assets/js/core/env.example.js` documenting
the per-environment classic-script injection pattern.

### FM11 — Removed dead `innerHTML` sink
`data-i18n-html` had **zero usages** anywhere; removed the handler from `i18n.js` entirely, eliminating
the XSS sink with no behavioral change.

---

## Low

### FL1 — Documentation reconciliation
`ARCHITECTURE_DECISIONS.md`: updated the ADR-005 trade-off note (CSP now implemented; Chart.js is the
one third-party script, SRI-pinned); added Chart.js + Inter rows to the Dependency Audit; rewrote the
now-false "No third-party CDN links / all vendor files locally hosted" security assessment to the
accurate post-remediation state.

### FL3 — Toast `aria-label`
`aria-label="Close"` → `t('common.close')` in `toast.js`.

### FL4 — Removed dead/buggy `formatAmountHtml`
Deleted from `currency.js` — zero usages, and it never actually converted (formatted the same raw
amount in two currencies).

### FL5 — Gated console output
The lone `console.warn` (i18n locale-load failure) is now behind `Config.DEBUG` (default off; enable via
`window.MM_DEBUG = true`). The FM10 misconfig `console.error` is intentionally **not** gated.

### FL7 — Color-injection hardening
Added `_safeColor()` (strict hex or `var(--mm-primary)` fallback) on both workspace-dot
`style="background:…"` sinks in `layout.js` — `escapeHtml` guards HTML attributes, not CSS.

### FL8 — Broken-avatar fallback
A capture-phase `error` listener (inline `onerror` is CSP-blocked) swaps any failed `.avatar-img` to the
default avatar once.

---

## Deferred items (and why)

| ID | Item | Why deferred |
|----|------|--------------|
| FM2 | Dark-mode override sprawl | Broad; needs per-page **browser** QA in dark mode |
| FM4 | Standardize empty/loading/skeleton states | ~17 pages; design-driven, broad |
| FM6 | Build/minify pipeline | Contradicts the no-build constraint; would be an *optional* esbuild prod step |
| FM7 | PWA / offline | A whole feature (manifest + service worker) |
| FL2 | Image WebP/AVIF conversion | Needs image tooling + visual QA |
| FL6 | Audit the 43 `!important` | Specificity/cascade rework; needs in-browser verification |

Plus the broader **dead-CSS removal** (the ~170 candidates that share a prefix with a live class or are
built dynamically): safe removal needs a **Chrome DevTools Coverage** pass, not static analysis.

---

## Outstanding verification

All changes are verified structurally only. The following need a real browser (e.g. via the Chrome
extension):

- **CSP / console** — load each page, confirm zero CSP violations in the console.
- **Keyboard nav (FH5)** — Arrow/Home/End/Enter/Tab on the currency + workspace switchers.
- **RTL / Arabic visual pass (FH4)** — especially the two slide-in drawers (calendar detail, receipt
  preview), currency dropdown anchoring, calendar grid borders, sidebar subnav indent.
- **Prefetch + bfcache (FH7)** — confirm `<link rel="prefetch">` fires on hover and the page is
  bfcache-eligible.
- **DevTools Coverage** — to safely unlock the broader dead-CSS and `!important` cleanups.

---

## Production follow-ups

1. **CSP origins** — the CSP `connect-src`/`img-src` and the `preconnect` hint currently point at the dev
   API origin `https://localhost:44320`. Point these at the real API host for production, and also send
   the CSP as a **server response header** (not only the `<meta>`).
2. **API base URL** — set `window.MM_API_BASE_URL` per environment via `env.js` (see
   `assets/js/core/env.example.js`); keep `env.js` out of version control.
3. **Complete the self-host (optional, removes both CDNs):**
   - `bash assets/vendors/chart.js/download-chart.sh`, then point the 5 Chart.js tags at the local file
     and drop `cdn.jsdelivr.net` from `script-src`.
   - `bash assets/css/fonts/download-inter.sh`, then switch `app.css` to `@import './fonts/inter.css'`
     and drop the Google Fonts origins from `style-src`/`font-src`.
