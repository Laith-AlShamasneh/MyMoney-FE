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

## Post-audit fixes (reported issues)

### Workspace switcher unstyled on non-workspace pages
**Symptom:** the workspace switcher in the top navbar rendered unstyled (a raw `<select>`-looking box
and an unstyled dropdown list) on every page **except** the `/pages/workspaces/*` pages.

**Cause:** the switcher is global navbar chrome (built by `layout.js` on every page), but its CSS lived in
`workspace.css`, which is only linked on the 6 workspace pages.

**Fix:** moved the entire "Workspace Switcher (in navbar)" section — all 24 rules
(`.ws-switcher-wrap/btn`, `.ws-dot`, `.ws-switcher-name/caret`, `.ws-dropdown` + header/list/actions/action,
`.ws-item` + dot/body/name/meta/check) plus its 2 responsive rules — from `workspace.css` into
`layout.css`, which every dashboard page loads. Workspace pages also load `layout.css`, so they keep the
styling with no duplication. Verified: both files brace-balanced, switcher rules now absent from
`workspace.css` and present in `layout.css`, all files serve 200.

### Owner (and all roles) wrongly "Access Restricted" in shared workspaces
**Symptom:** in a shared workspace, every gated page showed "Access Restricted — You don't have
permission to view this content," even for the workspace **Owner**.

**Cause:** the permission gate (`services/workspace-context.js`) built its permission set from the
live API as `p.permissionName || p.name` — but the backend returns permissions as
`{ code, resource, action }` (no such fields), so every permission collapsed to `''`. Compounding it,
the backend's permission codes use a different vocabulary (`Calendar.View`) than the FE gates
(`view_calendar`, plus FE-only gates like `view_insights`/`view_activity`/`manage_cashflow` that have no
backend code), so the live list can't drive the FE gates at all.

**Fix:** the gate now derives permissions from the caller's role via the FE's `_STATIC_ROLE_PERMS` map
keyed by `roleId` (returned by the context endpoint). That map is complete and matches the FE gate
vocabulary, so Owner (`roleId 1`) gets the full set and is never wrongly restricted. Frontend-only
change; no backend rebuild. *Note:* gating is now role-based — custom per-role permissions editing would
require aligning the FE and backend permission vocabularies (separate, larger task).

### Roles & Permissions page — permission display
`workspace-roles.js` read the same non-existent `permissionName` field; updated it to read the backend's
`code`/`resource`/`action` shape so the page lists permissions correctly.

### Create-Budget wizard: invisible step circles / faint connectors (undefined CSS tokens)
**Symptom:** in the Create Budget wizard, completed steps lost their numbered circle (appeared blank),
connector lines were faint, and the active state wasn't brand-colored.

**Cause:** `budgets.css` was authored against design tokens that **don't exist** in the app's token set —
`--mm-brand-primary`, `--mm-text-muted`, `--mm-surface-alt`, `--mm-shadow-md`. An undefined `var()`
makes the declaration invalid, so a *completed* step dot fell back to a white surface background while
still setting white text → a white number on a white circle (invisible), and `.completed/.active`
connectors fell back to the faint default border color.

**Fix:** mapped the non-existent tokens to the real ones throughout `budgets.css`
(`--mm-brand-primary`→`--mm-primary`, `--mm-text-muted`→`--mm-muted`,
`--mm-surface-alt`→`--mm-surface-soft`, `--mm-shadow-md`→`--mm-shadow`; 67 replacements). The same
undefined tokens were found and fixed in `goals.css` (11× `--mm-text-muted`) and `workspace.css`
(1× `--mm-shadow-md`). An app-wide sweep now reports no undefined `--mm-*` tokens except 3 pre-existing
`--mm-sidebar-*` references in `layout.css` (sidebar renders correctly; left as a separate minor item).

### Cash Flow: new-user "no forecast" state showed as an error
**Symptom:** on a brand-new account (no transactions yet), the Cash Flow page showed a red error toast
("CashFlow.ForecastNotAvailable") instead of a helpful empty state.

**Cause:** the backend correctly returns `NOT_FOUND` (code 8) when no forecast has been computed yet —
this is expected for a new user, not a real error. `cash-flow.js`'s catch block treated every `ApiError`
the same way (error toast), including this expected case. The page already had a well-built empty state
(`cfNoData`, with "Add transaction" / "Set up recurring" CTAs) that was simply never being shown.

**Fix:** the catch now checks `err.code === Config.RESPONSE_CODES.NOT_FOUND` and shows the existing empty
state instead of an error toast. Added the missing `Config` import. A forecast is computed by a background
job once the user has transactions (ideally recurring ones); no forecast on day one is expected behavior,
not a bug.

---

## Design upgrade (visual modernization pass)

A broad, token-driven visual upgrade requested by the user ("make it more powerful, modern, attractive,
animated"). Rather than hand-editing 30+ pages independently, the approach was to elevate the **shared
design system** so improvements cascade, then push further on high-traffic pages.

### `enhance.css` — global upgrade layer
New file, linked **last** on all 33 pages (reversible — removing the `<link>` fully reverts it). Adds on
top of the existing token system without modifying it:
- **Depth/color:** richer layered shadows across the elevation scale, new gradient tokens
  (`--mm-gradient-primary`, `--mm-gradient-text`, etc.), a new general-purpose `--mm-accent` (purple) token
  for "misc/count"-style metrics, refined focus rings, slim custom scrollbars.
- **Motion:** entrance animation for panels/cards (`mmx-rise`), staggered grid entrance, hover-lift on
  stat/KPI/budget/goal/receipt/rate cards, a gradient **primary button** with lift + sweep-sheen on hover,
  a glowing gradient sidebar active-item, glass-blur navbar.
- **Accessibility:** fully respects `prefers-reduced-motion` (kills animations/transforms).

### KPI card accent system (`--kpi-accent`)
A reusable mechanism: any card sets `--kpi-accent:var(--mm-income)` (etc.) inline; one shared rule set in
`enhance.css` drives that card's icon tint, glow, and a slim gradient top-bar — no per-metric CSS classes,
no hardcoded hex, automatic dark-mode correctness via the token system. Rolled out to:
- **Dashboard** — 4 KPI cards (income/expenses/net/count), plus a new personalized time-of-day greeting
  ("Good morning, {name}" — real clock + logged-in display name, hidden gracefully if no name), a gradient
  hero page-icon, and icon badges on the 3 chart-panel headers (`panel-title-icon` system, see below).
  **Bug fix bundled in:** the Net KPI's color was hardcoded hex (`#dc3545`/`#198754`) in `dashboard.js`,
  which didn't adapt to dark mode's income/expense palette — now `var(--mm-expense)`/`var(--mm-income)`.
- **Transactions** — 4 summary-strip cards converted the same way; added a panel-title icon to "Analytics".
- **Budgets** — 4 KPI cards. Found a real bug while converting: `budgets.js` hardcoded **8 hex values**
  (light+dark pairs, `isDark ? '#..' : '#..'` branching) for icon colors, while `budgets.css` had **unused**
  `.icon-primary/-success/-warning/-danger` classes that looked intended for this but were never wired up.
  Extended `--kpi-accent` to also cover `.budget-kpi-icon`, rewrote `_renderKpis()` to pass token
  references instead of hex (removes the `isDark` branch entirely), removed the now-confirmed-dead
  `.icon-*` CSS rules.
- **Goals** — 6 KPI cards. Found a **worse** version of the same bug: `goals.js` hardcoded fixed
  light-mode-only icon *text* color with **no dark-mode override at all** (only the background swapped),
  risking low-contrast text in dark mode. Same fix pattern applied.
- **Cash Flow** — 5 hero KPI cards, already token-correct but not using the shared mechanism; converted
  for consistency, fixed one raw hex (`#7c3aed` → `var(--mm-accent)`).
- **Receipts** — checked; its `.receipt-kpi` cards already use the identical `--rk-color` pattern (the
  precedent that inspired `--kpi-accent`). Already correct, left unchanged.

### `panel-title-icon` system
Small colored icon badge before a panel's `<h2>`/`<h5>` (5 color variants: default/danger/accent/warning/
info, `enhance.css`). Applied to Dashboard (3), Transactions (1), Budgets (2), Cash Flow (6), and Goal
Detail (4) panel/section headers.

### Real bug found: three page headers were completely unstyled
While extending the upgrade to Budgets, Goals, and Calendar, discovered that `.mm-page-header`,
`.mm-page-title`, `.mm-eyebrow`, `.mm-heading`, `.mm-subheading` are **undefined anywhere in the entire
CSS codebase**. All three pages' headers (skeleton, empty-state, and content-state variants — 8 instances
total) were built against these non-existent classes, meaning they rendered as unstyled browser-default
text with **no page icon**, unlike Dashboard/Transactions/Cash-Flow which all correctly use `.page-heading`
+ `.page-icon` + `.eyebrow`. Fixed all 8 instances to use the real, working classes, and added matching
page-icon badges using each page's actual sidebar-nav icon (`wallet2` Budgets, `piggy-bank` Goals,
`calendar3` Calendar) for full consistency with the rest of the app.

**Bonus i18n fix found along the way:** Goal Detail's "Milestones" section header had a hardcoded Arabic
string with no `data-i18n` attribute — English users were seeing Arabic text leak through. Added the
missing `goals.milestones_section_title` key to both locales (parity: AR=EN=1805, 0 orphans, verified
after every locale edit in this pass).

### Continuation — Reports, Recurring, Financial Intelligence, Workspace pages
- **Reports** — added `panel-title-icon` to the two panel headers (Generate Report, Report History);
  removed a now-redundant bare decorative icon that duplicated the new badge.
- **Recurring** — converted all 6 static KPI cards (already token-correct) to the shared
  `kpi-card-accent` mechanism for visual consistency with the rest of the app.
- **Financial Intelligence** — added `panel-title-icon` to all 3 panel headers (Financial Health,
  Category Trends, Behavior Patterns).
- **Receipts** — checked; gallery-grid layout with no panel headers, KPI cards already correct
  (`--rk-color` pattern). No changes needed.
- **Workspace pages (dashboard/members/invitations/roles/settings)** — confirmed none use the broken
  `mm-page-*` classes (all correctly use `.page-heading`/`.page-icon`/`.eyebrow` already). Added
  `panel-title-icon` to 4 section headers (Recent Activity, Members quick-view, Permission Matrix, My
  Permissions). Members and Invitations checked — single-table pages with no additional panel headers
  beyond the page heading and modal titles; nothing further needed.

**Two more real bugs found during this pass:**
1. **`enhance.css`'s own hover-lift selector list had 3 typo'd/invented class names** —
   `.ws-kpi` (real class is `.ws-kpi-card`), `.cf-kpi` (never existed; Cash Flow actually uses `.kpi-card`,
   already covered), and `.mm-stat` (matches nothing anywhere in the app). These were introduced during
   the original broad `enhance.css` pass without verifying against real markup. Fixed: swapped `.ws-kpi`
   → `.ws-kpi-card`, removed the two phantom classes — so the Workspace Dashboard's KPI cards actually
   get the intended hover-lift now (they never did before this fix).
2. **Workspace type-selector icons used literal emoji** (👤👨‍👩‍👧🏢👥) instead of the Bootstrap Icons font
   used everywhere else in the app (which explicitly avoids emoji) — in both the Create Workspace modal
   (`workspaces/dashboard.html`) and the Settings page's type picker (`workspaces/settings.html`), 4
   instances each. Emoji rendering is inconsistent across OS/browser/font and breaks the app's icon-color
   theming. Replaced all 8 with matching `bi-*` glyphs (`person-fill`/`house-heart-fill`/`building-fill`/
   `people-fill`) and added a `.selected` icon-tint rule (`color: var(--mm-primary)`) — icon-font glyphs
   inherit `color`, unlike emoji, so selection state now visually highlights the chosen type's icon too
   (matching the existing `budget-type-icon` precedent elsewhere in the app).

### Verification
Every touched HTML file re-checked for tag balance (div/h1/h2/h5/span/p/i) after each edit; every touched
CSS file brace-balanced; every touched JS file brace/paren-balanced; locale parity re-verified after each
i18n addition; everything re-served and HTTP-200-checked. As with the rest of this document, verification
is **structural only** — the actual visual result (does it look "modern/attractive," does the motion feel
right, does dark mode read well, do the new icon glyphs render at the right size) needs a real browser
pass — see [Outstanding verification](#outstanding-verification).

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
