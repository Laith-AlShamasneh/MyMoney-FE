# MyMoney Frontend — Enterprise Frontend Audit

**Date:** 2026-06-28
**Reviewed against:** `ARCHITECTURE_DECISIONS.md`, `DEVELOPMENT_GUIDE.md` (treated as source of truth).
**Scope:** Entire frontend — `MyMoney-FE` (32 HTML pages, 13 CSS files ≈10.7k lines, 59 JS modules ≈19.6k lines, AR/EN locales ≈1,800 keys each).
**Backend + DB:** already audited and remediated (separate reports). This is the final layer before production.
**Stance:** Full architecture / UX / performance / accessibility / localization / RTL / production-readiness review. **No code was changed.**

> **Coverage note (honesty):** I read the full architectural spine end-to-end (`core/config|api|auth|i18n|currency`, `components/layout|toast|notifications`, the design-token `app.css`) and the inline `<head>` boot script. Pages, page-CSS, and locales were **sampled deeply and scanned programmatically** (escape-helper coverage, `innerHTML` density, locale key parity, physical-vs-logical CSS, dark-mode override density, currency-switch handlers, charts, landmarks) rather than every line of all 32 pages read. Findings about pervasive patterns are backed by counts; page-specific claims name the file I verified.

---

## Executive Summary

This is a **well-built, disciplined vanilla-JS frontend** with a genuinely strong foundation: a clean layered module architecture (core → components → services → pages), a centralized API layer with shared-promise 401 refresh serialization, a comprehensive CSS **design-token system** (spacing/radius/typography/elevation/finance-semantic colors, dark-mode via variables, reduced-motion), cache-first i18n, and — importantly — **most pages already escape user data** via a local `_esc()` helper. The team clearly knows what it's doing.

It is **not yet world-class enterprise-grade**, and the gaps cluster in five areas:

1. **Security** — the global layout (`layout.js`) renders **workspace names, user names, and currency names into `innerHTML` without escaping**, and workspace names are **cross-user in shared workspaces** → stored XSS in the chrome of *every* page. This is compounded by the **access token being persisted to `localStorage`** (contradicting ADR-005's "memory only"), which turns any XSS into full account takeover.
2. **Resilience** — the page is **hidden (`visibility:hidden`) until JS runs and reveals it**; any uncaught error in a page module (or a failed module fetch) leaves a **permanently blank page** with no fallback.
3. **Accessibility** — financial **charts are Chart.js canvas with no text/table alternative or keyboard access** (WCAG fail); custom dropdowns (currency/workspace) lack arrow-key navigation; some pages miss landmarks.
4. **RTL** (the stated top priority) — **~686 physical direction properties** (`left/right/margin-left…`) live outside `rtl.css` despite the logical-property mandate, so RTL correctness rests on a 133-line override file that cannot cover them all.
5. **Architecture ceiling** — it's a **multi-page app with full reloads** and **no build step**; every navigation re-fetches and re-initializes the entire module chain, caps the UX ceiling (FOUC, no view transitions), and complicates the stated "future React/Vue migration."

**Verdict:** Excellent bones and unusual discipline for vanilla JS. With the Critical security + resilience items fixed and the High accessibility/RTL/financial-consistency items addressed, this becomes a credible international SaaS frontend.

### Findings by severity

| Severity | Count | Theme |
|---|---|---|
| **Critical** | 3 | Stored XSS in global layout, token in localStorage (compounds XSS), blank-page-on-JS-error |
| **High** | 8 | Canvas charts inaccessible, dashboard currency-switch shows un-converted amounts, Google Fonts CDN (privacy/perf), 403→404, RTL physical-property risk, custom-dropdown keyboard a11y, MPA reload ceiling, no client request timeout |
| **Medium** | 11 | Locale parity gaps + no pluralization, dark-mode per-page override gaps, CSS architecture drift, empty/loading-state inconsistency, landmarks/heading audit, no PWA, env config, notification polling, api.js duplication, etc. |
| **Low** | 8 | Doc drift, image optimization, hardcoded plural/aria strings, dead `formatAmountHtml`, console noise, !important |

---

## CRITICAL

### FC1 — Stored XSS in the global layout (workspace / user / currency names)
- **Problem:** `components/layout.js` builds the sidebar, navbar, workspace switcher, and currency switcher with template literals assigned via `innerHTML`/`outerHTML`, interpolating dynamic strings **without escaping**: `_buildNavbar` → `alt="${userName}"`, `${userName}`; `_buildWsItems` → `data-ws-name="${ws.name}"` and `<span class="ws-item-name">${ws.name}</span>`; currency names likewise. Unlike the page modules (which use a local `_esc()`), `layout.js` has no escaping. Three page files also build `innerHTML` with no escape helper: `currency.js`, `workspace-roles.js`, `workspace-settings.js`.
- **Root cause:** Output-encoding is applied *per page by convention* (a local `_esc()` helper) rather than centrally; the shared layout was written without it.
- **Business impact:** **Workspace names are authored by users and shared across all members.** A malicious member can set a workspace name like `"><img src=x onerror="…">` and execute script in **every other member's browser, on every page** (the switcher is global chrome). For a financial app this is account/data theft.
- **Technical impact:** Stored XSS with the widest possible reach (global layout). Combined with FC2, it yields token exfiltration → full takeover.
- **Recommended solution:** Add one shared `escapeHtml()` in `core/` and use it for **every** interpolated dynamic value in `layout.js` and the 3 unescaped page files; better, introduce a tiny safe-DOM/`html` tagged-template helper that auto-escapes, and adopt it project-wide. Add a CSP header at the server as defense-in-depth.
- **Complexity:** Low–Medium. **Breaking:** Non-breaking.

### FC2 — Access token persisted to `localStorage` (contradicts ADR-005; compounds XSS)
- **Problem:** `core/auth.js` writes the JWT access token to `localStorage` (`mm.accessToken`) via `_saveAccessToken`, and `guardPage()` restores it from there. ADR-005 explicitly decided **"Access token → stored in memory only. Never written to localStorage or sessionStorage."** Both tokens now live in `localStorage`.
- **Root cause:** Pragmatic workaround for the multi-page architecture (in-memory token is lost on every full-page navigation), implemented by persisting the token rather than relying on silent refresh.
- **Business impact:** Any XSS (see FC1) can read both tokens and fully impersonate the user; the backend's 15-minute access-token lifetime is the only mitigation left.
- **Technical impact:** Removes the single biggest XSS mitigation the architecture was designed around.
- **Recommended solution:** Either (a) revert to memory-only access token and accept the one silent-refresh round trip per navigation (cleanest, matches ADR-005), or (b) if persistence is required for UX, move to a same-site, secure, HttpOnly refresh-cookie model server-side. At minimum, fix FC1 + add CSP so localStorage isn't reachable by injected script. Update ADR-005 to reflect the real decision.
- **Complexity:** Medium. **Breaking:** Non-breaking (internal).

### FC3 — Blank page on any JS error (hide-until-JS with no fallback)
- **Problem:** The inline `<head>` script adds `html.mm-init`, and `app.css` sets `html.mm-init body { visibility: hidden }`. The body is revealed only when `i18n.js` calls `_revealPage()` (removes `mm-init`). If the page's single ES-module script throws **before** that point — a syntax error, a failed `import` (network/404), an exception in `guardPage`/`initLayout`, or a thrown "Not authenticated" — the body stays `visibility:hidden` forever: a **blank white screen with no message and no content**.
- **Root cause:** FOUC prevention coupled to successful JS execution, with no `<noscript>` / timeout / error fallback to reveal the page.
- **Business impact:** A single bad deploy, a transient CDN/module 404, or one uncaught exception on a page = total outage of that page for users, with zero diagnostic to them. Very poor production resilience for a SaaS.
- **Technical impact:** No graceful degradation; the failure mode is invisible (looks like a hang).
- **Recommended solution:** Add a safety net: a `<noscript>` style block and a short timeout (e.g., 4s) in the inline head script that force-removes `mm-init` if JS hasn't revealed the page; wrap each page's boot in `try/catch` that reveals the page and shows an error state; add a global `window.onerror`/`unhandledrejection` handler that reveals the body and surfaces a toast. Consider a client error-logging hook.
- **Complexity:** Low. **Breaking:** Non-breaking.

---

## HIGH

### FH1 — Financial charts (Chart.js canvas) are inaccessible
8 `<canvas>` charts (dashboard, budgets, cash-flow, transactions) via Chart.js. Canvas has **no text alternative, no keyboard access, no screen-reader output, and doesn't scale with browser zoom or high-contrast**. WCAG 1.1.1/1.4.x fail. **Solution:** add `role="img"` + `aria-label` summaries, a visually-hidden data `<table>` alternative per chart, and ensure tooltips/legends are reachable; verify dark-mode + RTL axis mirroring. *Non-breaking.*

### FH2 — Dashboard currency switch shows un-converted amounts
On `mm-currency-change`, `transactions.js` correctly **re-fetches** (`_loadData()`), but `dashboard.js` **re-renders cached `_lastData`** (`_renderKpi(_lastData.kpi)`) — relabeling the *same numbers* with the new currency without re-fetching converted values. Switching from USD to JOD shows "1000 JOD" where it should show the converted amount. **Inconsistent financial correctness.** **Solution:** make currency-switch handlers re-fetch (or convert client-side via the rates module) uniformly; audit all 13 listeners for the same pattern. *Non-breaking.*

### FH3 — Google Fonts loaded from external CDN via CSS `@import`
`app.css` line 7: `@import url('https://fonts.googleapis.com/css2?family=Inter…')`. This contradicts the documented "no third-party CDN, all vendor files local." Impacts: **privacy/GDPR** (Google Fonts leaks every user's IP to Google — a known EU compliance issue for international/enterprise customers), **performance** (`@import` is render-blocking and serializes after the CSS loads; extra DNS/connection), and **availability** (offline/air-gapped enterprise networks). **Solution:** self-host Inter (woff2) under `assets/fonts/` with `font-display: swap`; remove the `@import`. *Non-breaking.*

### FH4 — RTL relies on overrides despite heavy physical-direction CSS
~686 physical direction declarations (`left/right/margin-left/padding-left/text-align:left|right`) exist **outside** `rtl.css`, against the logical-property mandate (`margin-inline`, `inset-inline-start`). `rtl.css` is only 133 lines and cannot correct all of them. Given Arabic is the **primary** language and RTL is the stated top priority, this is a real correctness risk: components that don't mirror, mis-aligned icons/spacing, wrong-side shadows. **Solution:** migrate physical → logical properties incrementally (start with layout/components/per-page CSS), then RTL-QA every page in Arabic. *Non-breaking, but broad.*

### FH5 — Custom dropdowns not fully keyboard-accessible
The currency switcher, workspace switcher, and notification dropdown use `role="listbox"/"option"` but implement only click + Escape — **no arrow-key roving focus, no Home/End, no type-ahead, no focus trap/return** per the WAI-ARIA combobox/listbox pattern. Keyboard and screen-reader users can't operate them. **Solution:** implement the listbox keyboard pattern (or use a vetted accessible component). *Non-breaking.*

### FH6 — 403 Forbidden redirects to the 404 page
`api.js` handles HTTP 403 with `window.location.href = Config.ROUTES.ERROR_404` (twice, plus in the blob helpers). There is no `403.html` (ADR-009 specifies one). Users denied by workspace permissions land on "Not Found," which is confusing and wrong. **Solution:** add a `403.html` and route 403 there; show an actionable "no permission" message. *Non-breaking.*

### FH7 — Multi-page full-reload architecture caps UX/performance
Every navigation is a full HTML load that re-runs `initI18n → guardPage → initLayout`, re-injects the sidebar/navbar, re-instantiates the notification poller and currency/workspace switchers, and re-imports the module chain. Result: FOUC on every page, no view transitions, redundant re-initialization, and a hard ceiling on the "Stripe/Linear-class" feel the goal targets — plus it complicates the stated future framework migration. **Solution (phased):** short term, keep MPA but add view-transition CSS, a persistent layout cache, and prefetch; long term, evaluate a lightweight client router or the planned framework migration. *Non-breaking short-term.*

### FH8 — No client-side request timeout / cancellation discipline
`api.js` relies on the backend `code=11` for timeouts; there is **no `AbortController` timeout**, so a genuinely hung request never aborts (spinner forever). Cancellation (`signal`) is supported but pages rarely cancel in-flight requests on navigation/filter-change → races and duplicate renders. **Solution:** add a default per-request timeout via `AbortController`; adopt per-view abort on re-fetch. *Non-breaking.*

---

## MEDIUM

- **FM1 — Locale parity gaps + no pluralization.** AR has 1,793 leaf keys, EN 1,797: `nav_recurring` missing in EN; 5 `reports.status_badge_*` missing in AR (these render the raw key). ~30 keys share identical AR/EN values (some intentional like brand, some untranslated). `t()` supports `{param}` interpolation only — **no pluralization**; `notifications.js` hardcodes Arabic plurals inline (`دقيقة/دقائق`). **Fix:** reconcile keys (CI check for parity), add an ICU-style plural helper.
- **FM2 — Dark mode: per-page override sprawl.** Beyond the token system, there are 79 explicit `data-theme="dark"` overrides in `components.css`, 34 in `receipts.css`, etc. — indicating many hardcoded colors needing manual dark patches → maintenance burden and likely gaps. **Fix:** push more colors through tokens; QA every page in dark mode.
- **FM3 — CSS architecture drift.** `components.css` is 3,118 lines; per-page CSS proliferated (`receipts.css` 1,382, `budgets.css` 1,121, `goals.css` 823, `workspace.css` 820, `calendar.css` 894) vs the lean split the ADR intended. Risk of duplication/dead CSS; no documented token usage audit. **Fix:** split `components.css`, dedupe, prune dead rules.
- **FM4 — Inconsistent empty / loading / skeleton states.** Only ~14 of 31 page modules reference empty/skeleton/loading patterns. Enterprise UX needs consistent empty states, skeletons, and error states everywhere. **Fix:** standardize a shared empty/skeleton component set.
- **FM5 — Landmarks / heading hierarchy.** 3 pages lack `<main>` (`confirm-email-change`, `change-password`, `accept`); heading order and ARIA on custom widgets need a per-page WCAG pass.
- **FM6 — No build/bundle/minify; long module chains.** 59 unminified ES modules; first load of a page serially imports config→api→auth→i18n→layout→notifications→currency→workspace-service. HTTP/2 mitigates but payload + parse cost is unoptimized. **Fix:** add an optional bundling/minify build for production (esbuild) without changing the dev model.
- **FM7 — No PWA / offline.** No manifest or service worker → "future PWA" and offline resilience unmet; financial users on flaky mobile networks get nothing cached beyond locale.
- **FM8 — Notification polling is unconditional.** 30s `setInterval` + immediate unread poll on **every** page, with no `document.hidden`/online gating → wasted battery/network on backgrounded tabs. **Fix:** pause polling when hidden; use `visibilitychange`.
- **FM9 — api.js duplication.** `downloadBlob` and `downloadBlobPost` re-implement the 401/403/500 handling of `request()`. **Fix:** factor a shared response-handler.
- **FM10 — Environment config.** `API_BASE_URL` defaults to `https://localhost:44320` with only a `window.MM_API_BASE_URL` override; no documented per-environment strategy (a committed `config.js` default that ships to prod is a footgun). **Fix:** an `env.js`/inline bootstrap injected per environment.
- **FM11 — `data-i18n-html` uses `innerHTML`.** Low risk today (static translations), but it's an XSS sink if any translated string ever includes interpolated user data. Keep translations static; prefer `textContent`.

---

## LOW

- **FL1 — Documentation drift.** Reconcile `ARCHITECTURE_DECISIONS.md`/`DEVELOPMENT_GUIDE.md` with reality: token is in localStorage (ADR-005), Google Fonts CDN exists ("no CDN"), the CSS file list and page set have grown well beyond the doc, charting (Chart.js) was added despite "no charting library yet." Treat the docs as the constitution — update them.
- **FL2 — Image optimization.** 24 PNG + 2 JPG; no WebP/AVIF. Optimize/convert non-icon raster assets.
- **FL3 — Hardcoded strings.** Toast `aria-label="Close"`, inline Arabic plurals, and some inline style strings bypass i18n/tokens.
- **FL4 — Dead/buggy `formatAmountHtml`.** In `currency.js` it formats the same amount in two currencies without converting (lines ~175–176); appears unused — remove or fix.
- **FL5 — `console.warn` left in `i18n.js`** (and likely elsewhere) — gate behind a debug flag.
- **FL6 — 43 `!important`** across app CSS — audit for ones removable via specificity.
- **FL7 — Inline styles in JS** (e.g., `style="background:${color}"`, padding strings in `layout.js`) — move to classes/tokens; also note `style="background:${color}"` with `ws.color` is another unescaped-attribute sink (low, hex-validated upstream but not guaranteed).
- **FL8 — Avatar/asset fallbacks.** `avatar.jpg` hardcoded default; ensure broken-image `onerror` fallback everywhere avatars render.

---

## Cross-cutting answers to the phase questions

- **Architecture:** Clean layered vanilla-JS modules, good separation, sensible services layer. Ceiling set by MPA + no build (FH7, FM6). Framework-migration-readiness is *moderate* — the service/api separation helps, but page modules mix data + DOM-string rendering.
- **UI/UX & Design System:** The token system (`app.css`) is genuinely strong and Stripe/Linear-adjacent in intent; consistency is good. The reload FOUC and missing micro-interactions/empty-states keep it from feeling "premium" end-to-end.
- **Security:** The headline risk is FC1+FC2 (XSS in global chrome + token in localStorage). Most pages escape correctly — fix the layout and add CSP and it's solid.
- **Accessibility:** Forms/labels/`data-i18n-aria` are conscientious, but charts (FH1), custom dropdowns (FH5), landmarks (FM5), and focus management need work for WCAG AA.
- **RTL/Localization:** Infrastructure is good (cache-first, dir switching, AR-primary), but physical-property CSS (FH4) and locale gaps (FM1) need a dedicated pass — this is the user's stated top priority.
- **Performance:** Cache-first i18n and currency caching are smart; held back by no bundling, MPA re-init, unconditional polling, render-blocking font `@import`, and canvas charts.
- **Enterprise readiness:** Not yet — blocked by FC1–FC3 (security/resilience), FH1/FH4/FH5 (a11y/RTL), and the MPA/PWA/build gaps. All are well-scoped.

---

## Recommended remediation order (after your approval)

1. **Critical:** FC1 (escape layout + add CSP) → FC2 (token storage) → FC3 (reveal-on-error safety net).
2. **High:** FH6 (403 page, quick) → FH2 (currency consistency) → FH3 (self-host fonts) → FH1 (chart a11y) → FH5 (dropdown keyboard) → FH8 (timeouts) → FH4 (RTL logical-property migration, broad) → FH7 (MPA polish).
3. **Medium:** FM1 locale/plural → FM4 empty/loading → FM2 dark-mode QA → FM5 landmarks → FM6 build → FM3 CSS cleanup → FM7–FM11.
4. **Low:** docs reconciliation + polish.

Every phase can preserve backward compatibility. The only intentionally larger efforts are FH4 (RTL) and FH7/FM6 (architecture/build), which are incremental.

*No frontend code has been modified. Awaiting approval to begin Phase 1 (Critical).*
