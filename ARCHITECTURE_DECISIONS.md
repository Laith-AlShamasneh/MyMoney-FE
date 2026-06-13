# MyMoney Frontend — Architecture Decisions

> This document records every significant architectural decision made for the MyMoney frontend application.
> Each decision is explained with its context, the choice made, the rationale, and the trade-offs accepted.
> Decisions are numbered for reference from code and PR descriptions.

---

## Template Review Summary

The project starts from the **adminHMD** admin dashboard template (Bootstrap 5.3.8, Bootstrap Icons 1.13.1,
Vanilla JS). The template is a strong visual and structural foundation, but it is not ready for production
use as-is. It requires the following categories of work before any feature implementation begins:

| Category | Status |
|---|---|
| Visual design & responsive layout | Excellent — keep with minor branding changes |
| CSS architecture | Split single file; add RTL; add logical properties |
| JavaScript architecture | Rebuild from scratch; add modules, API layer, auth, i18n |
| Localization (AR/EN) | Zero support — build from scratch |
| API integration | Zero — build from scratch |
| Authentication state | Zero — build from scratch |
| Component duplication (sidebar/navbar) | Present in every HTML file — resolve via JS injection |
| Library versions | Bootstrap 5.3.8 ✅ · Bootstrap Icons 1.13.1 ✅ · no upgrades needed |
| Unused assets | Remove ecommerce images, excess avatars, template demo pages |

---

## ADR-001 · Technology Stack

**Context:** The frontend must integrate with a .NET 10 backend API, support Arabic/English, and remain
maintainable without introducing framework complexity.

**Decision:** Vanilla JavaScript (ES Modules), HTML5, CSS3, Bootstrap 5.3.8, Bootstrap Icons 1.13.1.
No React, Angular, Vue, or build toolchain (Webpack, Vite, etc.).

**Rationale:**
- The codebase is small enough that framework overhead adds no value at this stage.
- Vanilla JS + ES Modules provide clean separation of concerns without a build step.
- Bootstrap 5.3.8 is the latest stable release; no upgrade is required.
- Bootstrap Icons 1.13.1 is the latest stable release; no upgrade is required.
- Removing the build step keeps the project runnable directly with any static file server.

**Consequences:**
- No hot-module reload in development (acceptable — use Live Server or similar).
- ES Modules require a local web server (`http://`), not bare file:// protocol.
- All JS must be authored with modern browser targets in mind (no transpilation fallback).

---

## ADR-002 · Folder Structure

**Context:** The template places all HTML files in a flat `html/` directory. All JS is in one `main.js`
file. All CSS is in one `style.css` file. This is unscalable for a production application.

**Decision:** Reorganise the project into the following structure:

```
MyMoney-FE/
├── index.html                     ← entry point (auth guard redirect)
├── pages/
│   ├── auth/
│   │   ├── login.html
│   │   ├── register.html
│   │   ├── forgot-password.html
│   │   ├── reset-password.html
│   │   └── confirm-email.html
│   ├── dashboard/
│   │   └── index.html
│   └── errors/
│       ├── 404.html
│       └── 500.html
├── assets/
│   ├── css/
│   │   ├── vendor/
│   │   │   └── bootstrap.min.css
│   │   ├── app.css                ← root variables, reset, base body
│   │   ├── layout.css             ← sidebar, navbar, footer, shell
│   │   ├── auth.css               ← auth card, auth page, auth brand
│   │   ├── components.css         ← metric cards, panels, tables, badges, forms
│   │   └── rtl.css                ← RTL overrides for Arabic
│   ├── js/
│   │   ├── vendor/
│   │   │   └── bootstrap.bundle.min.js
│   │   ├── core/
│   │   │   ├── config.js          ← API base URL, app constants
│   │   │   ├── api.js             ← generic AJAX layer
│   │   │   ├── auth.js            ← token store, guard, refresh logic
│   │   │   └── i18n.js            ← localization engine
│   │   ├── components/
│   │   │   ├── layout.js          ← sidebar toggle, theme, responsive init
│   │   │   ├── toast.js           ← toast notification system
│   │   │   └── loading.js         ← full-page / button loading state
│   │   ├── pages/
│   │   │   ├── login.js
│   │   │   ├── register.js
│   │   │   ├── forgot-password.js
│   │   │   ├── reset-password.js
│   │   │   └── confirm-email.js
│   │   └── app.js                 ← boot sequence, shared page init
│   ├── images/
│   │   ├── brand/
│   │   │   ├── logo.svg
│   │   │   └── logo-icon.svg
│   │   ├── avatar/
│   │   │   └── avatar-fallback.svg
│   │   └── illustrations/
│   │       ├── 404.svg
│   │       └── 500.svg
│   ├── locales/
│   │   ├── en.json
│   │   └── ar.json
│   └── vendors/
│       └── bootstrap-icons/
│           ├── bootstrap-icons.css
│           └── fonts/
├── ARCHITECTURE_DECISIONS.md
└── DEVELOPMENT_GUIDE.md
```

**Rationale:**
- Pages are grouped by domain concern (auth, dashboard, errors), not alphabetically.
- JS is split by responsibility layer: core infrastructure → components → pages.
- CSS is split by scope: vendor → base → layout → feature → RTL override.
- Locales are a first-class asset folder, not an afterthought.
- `index.html` at root serves as the application entry point (auth guard redirect).

**Consequences:**
- CSS `<link>` and JS `<script>` paths in each HTML file need consistent relative paths.
- ES Module imports use relative paths (`../core/api.js`).

---

## ADR-003 · JavaScript Module Architecture

**Context:** The template's `main.js` is a 240-line IIFE handling all concerns in one file. This is
unextendable without conflict. API calls, auth state, localization, and UI logic must all be separated.

**Decision:** Use native **ES Modules** (`<script type="module">`). Each JS file is a module with named
exports. No global namespace pattern.

Module responsibilities:

| File | Responsibility |
|---|---|
| `core/config.js` | API base URL, app name, route constants |
| `core/api.js` | All HTTP communication — one place for every fetch call |
| `core/auth.js` | Token read/write, session guard, logout |
| `core/i18n.js` | Language load, `t()` translation function, `dir` switching |
| `components/layout.js` | Sidebar, theme toggle, responsive breakpoint logic |
| `components/toast.js` | Show/hide toast notifications |
| `components/loading.js` | Button loading state, full-page overlay |
| `pages/login.js` | Login form submit, response handling |
| `pages/register.js` | Register form submit |
| `pages/forgot-password.js` | Forgot password submit |
| `pages/reset-password.js` | Reset password submit (reads token from URL) |
| `pages/confirm-email.js` | Email confirmation (reads token from URL) |
| `app.js` | Boot: init i18n, init layout, init theme — imported by every page |

**Rationale:**
- ES Modules are natively supported in all modern browsers (Chrome 61+, Firefox 60+, Safari 10.1+).
- Each module is independently testable.
- No accidental global variable collisions.
- Tree-shakeable if a build step is added later.

**Consequences:**
- Requires serving via HTTP (not file://). Use VS Code Live Server, Python `http.server`, or IIS.
- Module scripts are deferred by default — no need for `DOMContentLoaded` wrappers.

---

## ADR-004 · API Integration Layer

**Context:** The backend returns a standardised envelope:
```json
{ "success": true, "code": 1, "message": "...", "result": {...} }
{ "success": false, "code": 5, "message": "...", "result": null, "errors": ["..."] }
```
Internal response codes map to:
```
1=OK, 2=Created, 3=Accepted, 4=Found
5=BadRequest, 6=Unauthorized, 7=Forbidden, 8=NotFound, 9=Conflict
10=InternalServerError, 11=RequestTimeout
```

**Decision:** All HTTP communication flows through `core/api.js`. No fetch/XMLHttpRequest calls are
permitted anywhere else in the codebase. The module exports a single `request()` function and convenience
wrappers (`get`, `post`, `put`, `del`, `upload`).

**Behaviour contract:**

```
api.post(endpoint, body)
  → shows loading state
  → attaches Authorization header from auth store
  → on HTTP 200 with success=true  → returns result value
  → on HTTP 200 with success=false → throws ApiError with message + errors[]
  → on HTTP 401 (code=6)           → attempts token refresh once, then redirects to login
  → on HTTP 403 (code=7)           → redirects to 403/forbidden page
  → on HTTP 500 (code=10)          → shows server error toast
  → on network failure             → shows network error toast
  → hides loading state (always)
```

**Rationale:**
- One place to change auth headers, error handling, logging, and base URL.
- Pages never handle HTTP errors — they only handle business logic after a successful call.
- The refresh token flow is invisible to page code.

**Consequences:**
- All API errors surface as thrown exceptions. Page code uses try/catch.
- Business validation errors (`success=false`) are thrown as a typed `ApiError` with an `errors` array,
  so the form layer can display field-level messages.

---

## ADR-005 · Authentication & Token Strategy

**Context:** The backend issues a short-lived access token (JWT) and a longer-lived refresh token.
The frontend must store these, guard protected pages, and silently refresh the access token when it expires.

**Decision:**

- **Access token** → stored in memory only (`auth.js` module variable). Never written to
  localStorage or sessionStorage. Cleared on page refresh (triggers silent re-auth from refresh token).
- **Refresh token** → stored in `localStorage` under key `mm.refreshToken`.
  Accepted trade-off: localStorage is accessible to JS, but the app has no third-party scripts and CSP
  headers should be set at the server to mitigate XSS risk.
- **Auth guard** → `auth.js` exports `guardPage()`. Every protected HTML page calls it in its module
  script. If no valid session can be restored, redirects to `/pages/auth/login.html`.
- **Silent refresh** → `api.js` intercepts a 401 response, calls the refresh endpoint, updates the
  in-memory access token, and retries the original request once. If refresh fails, the user is logged out.
- **Token data** → decoded and stored in memory. `auth.getCurrentUser()` returns `{ userId, email,
  displayName, roles }` without hitting the server.

**Token storage keys:**
```
mm.refreshToken          → refresh token string
mm.refreshTokenExpiry    → ISO expiry date string
```

**Rationale:**
- Access token in memory is the safest against XSS (a compromised script cannot read it after page close).
- Refresh token in localStorage is a pragmatic choice for a SPA-like experience without a server-side
  session cookie infrastructure.

**Consequences:**
- Access token is lost on hard refresh. The app silently re-acquires it via the refresh token — this adds
  one extra round trip on each new tab/refresh, which is acceptable.
- If localStorage is cleared, the user must log in again (expected behaviour).

---

## ADR-006 · Localization Architecture

**Context:** The application must support Arabic and English, with RTL layout for Arabic. Zero i18n
infrastructure exists in the template.

**Decision:**

**Translation files** — JSON dictionaries at `assets/locales/{lang}.json`. Keys follow dot-notation
namespaced by page/section:
```json
{
  "common": { "app_name": "MyMoney", "loading": "جاري التحميل..." },
  "auth": {
    "login": {
      "title": "تسجيل الدخول",
      "email_label": "البريد الإلكتروني",
      "submit": "دخول"
    }
  },
  "errors": { "network": "لا يوجد اتصال بالإنترنت." }
}
```

**HTML markup** — translatable elements carry a `data-i18n` attribute. The i18n engine applies all
translations on load and on language switch:
```html
<label data-i18n="auth.login.email_label"></label>
<button data-i18n="auth.login.submit"></button>
```

**Language persistence** — current language stored in `localStorage` under key `mm.lang`.
Default: `'ar'` (Arabic is the primary language for this application).

**RTL support** — `i18n.js` sets `document.documentElement.dir` and `document.documentElement.lang`.
A dedicated `rtl.css` file provides RTL-specific overrides for layout, icon mirroring, and text alignment.
The base CSS uses CSS logical properties (`margin-inline`, `padding-inline`, `inset-inline`) wherever
possible to reduce RTL override volume.

**Rationale:**
- JSON translation files are simple, human-editable, and version-controllable.
- `data-i18n` attributes cleanly separate content from markup.
- Setting `dir` on `<html>` makes Bootstrap's RTL-aware utilities work automatically.
- CSS logical properties reduce the number of RTL overrides needed.

**Consequences:**
- Pages require a local web server to load locale JSON via fetch (ES Module + fetch cannot run on file://).
- Language switching triggers a full re-render of text nodes, not a page reload (smooth UX).

---

## ADR-007 · Shared HTML Component Strategy (No Duplication)

**Context:** The template duplicates the entire sidebar and navbar markup in every HTML file. With 10+
pages planned, maintaining consistent navigation changes becomes a serious maintenance problem.

**Decision:** The sidebar and navbar HTML are generated by `components/layout.js` from JavaScript
template strings. Each HTML page contains only a minimal shell:

```html
<body>
  <div class="admin-shell">
    <div id="sidebar-root"></div>
    <div class="admin-main">
      <div id="navbar-root"></div>
      <main class="dashboard-content" id="page-content">
        <!-- page-specific content only -->
      </main>
      <footer id="footer-root"></footer>
    </div>
  </div>
</body>
```

`layout.js` renders the sidebar, sets the active nav link by matching `window.location.pathname`,
and injects the current user's name and avatar from the auth store.

Auth pages (login, register, etc.) do not use the shared layout — they are standalone.

**Rationale:**
- A single source of truth for navigation markup.
- Adding a nav item or updating the brand requires one file change.
- Active state is set automatically, eliminating class="active" maintenance across all pages.

**Consequences:**
- Layout renders on every page load via JS — a brief flash before content is visible is possible.
  Mitigate with a CSS skeleton or by keeping layout.js small and synchronous.
- Pages that require SSR or search engine indexing are not suitable for this pattern (not applicable here,
  as this is an authenticated admin application).

---

## ADR-008 · CSS Architecture

**Context:** The template has a single 1,619-line `style.css`. It will grow much larger. It contains some
hardcoded hex values that should be CSS variables, some LTR-only layout properties, and template branding.

**Decision:**

**File split:**

| File | Contents |
|---|---|
| `assets/css/vendor/bootstrap.min.css` | Bootstrap 5.3.8, untouched |
| `assets/css/app.css` | `:root` variables (brand colours, spacing, shadows), body, reset |
| `assets/css/layout.css` | `.admin-shell`, `.admin-sidebar`, `.admin-navbar`, `.admin-footer` |
| `assets/css/auth.css` | `.auth-body`, `.auth-page`, `.auth-card`, `.auth-brand` |
| `assets/css/components.css` | `.metric-card`, `.panel`, `.badge`, `.table`, `.btn` overrides, etc. |
| `assets/css/rtl.css` | RTL-specific overrides, loaded only when `dir="rtl"` |

**HTML load order:**
```html
<link rel="stylesheet" href="/assets/css/vendor/bootstrap.min.css">
<link rel="stylesheet" href="/assets/vendors/bootstrap-icons/bootstrap-icons.css">
<link rel="stylesheet" href="/assets/css/app.css">
<link rel="stylesheet" href="/assets/css/layout.css">   <!-- dashboard pages -->
<link rel="stylesheet" href="/assets/css/auth.css">      <!-- auth pages -->
<link rel="stylesheet" href="/assets/css/components.css">
```

**RTL loading:** `rtl.css` is added dynamically by `i18n.js` when language = Arabic.

**CSS variable naming:** All colour, spacing, and shadow values go through CSS custom properties.
No hardcoded hex values in component styles. New brand variables use the `--mm-*` prefix to distinguish
them from Bootstrap's `--bs-*` variables.

**Dark mode:** The existing `html[data-theme="dark"]` variable override pattern is kept and extended.

**Rationale:**
- Separate files make it easy to find and change specific component styles.
- `rtl.css` as a separate file loaded dynamically means no RTL overhead for LTR (English) users.
- CSS logical properties reduce how much rtl.css needs to override.

---

## ADR-009 · Error Handling & User Feedback Strategy

**Context:** The backend has a rich error model (business errors, auth errors, forbidden, server errors,
network errors). The template has no error feedback mechanism beyond HTML5 form validation.

**Decision:**

**Error categories and handling:**

| Category | Condition | UI Response |
|---|---|---|
| Business validation | `success=false, code=5` | Inline form errors below each field + summary alert |
| Unauthorised | HTTP 401 or `code=6` | Silent token refresh → retry; on failure, redirect to login |
| Forbidden | `code=7` | Redirect to `/pages/errors/403.html` |
| Not found | `code=8` | Show inline "not found" message in context |
| Conflict | `code=9` | Toast warning with `message` from backend |
| Server error | `code=10` | Toast error: "حدث خطأ في الخادم. يرجى المحاولة مرحاً." |
| Request timeout | `code=11` | Toast warning: "انتهت مدة الطلب. يرجى المحاولة مرة أخرى." |
| Network failure | `fetch` throws | Toast error with offline message |

**Toast system** (`components/toast.js`):
- Renders a Bootstrap 5 toast at the top-right (LTR) / top-left (RTL) of the screen.
- Types: `success`, `warning`, `error`, `info`.
- Auto-dismiss after 5 seconds. Stacked for multiple simultaneous messages.

**Form validation errors** — displayed using existing `.invalid-feedback` Bootstrap pattern, but driven
by the API error response `errors[]` array rather than HTML5 `required` attributes alone.

**Loading state** (`components/loading.js`):
- `Loading.button(btn)` — disables button and shows spinner during API call.
- `Loading.restore(btn)` — re-enables button and restores original text.

**Rationale:**
- Centralised error handling in `api.js` means page code never writes error display logic.
- Toast is the correct pattern for transient server/network errors.
- Inline form errors are the correct pattern for field-specific validation from the backend.

---

## ADR-010 · Authentication Page Scope

**Context:** The backend provides 5 auth flows: Login, Register, Forgot Password, Reset Password,
Email Confirmation. The template has Login, Register, and Forgot Password. Reset Password and Email
Confirmation pages are missing.

**Decision:** Build all 5 authentication pages. Map to backend endpoints.

| Page | File | Backend Endpoint |
|---|---|---|
| Login | `pages/auth/login.html` | `POST /api/auth/login` |
| Register | `pages/auth/register.html` | `POST /api/auth/register` |
| Forgot Password | `pages/auth/forgot-password.html` | `POST /api/auth/forgot-password` |
| Reset Password | `pages/auth/reset-password.html` | `POST /api/auth/reset-password` |
| Email Confirmation | `pages/auth/confirm-email.html` | `GET /api/auth/confirm-email?token=...` |

Register page fields must match backend contract:
- `displayName` (Full Name)
- `email`
- `password`
- `confirmPassword`

The template's register page has only `name`, `email`, `password` — this will be updated in Phase 2.

---

## ADR-011 · Asset Cleanup

**Context:** The template ships assets that are irrelevant to a personal finance application. Keeping them
adds noise, increases repository size, and confuses future developers.

**Decision — Remove:**
- `assets/images/ecommerce/` — 10 product photos (not relevant to finance)
- `assets/images/avatar/avatar-1.jpg` through `avatar-21.jpg` — fake user avatars
- `assets/images/png/dasher-ai.png` and `dasher-ui-bootstrap-5.jpg` — template branding
- `assets/images/brand/dasher-logo.svg` — template brand
- `documentation/docs.html` — template documentation

**Decision — Keep:**
- `assets/images/avatar/avatar.jpg` — default user avatar (placeholder until replaced)
- `assets/images/avatar/avatar-fallback.jpg` — fallback for broken avatar images
- `assets/images/brand/logo-icon.svg` — repurpose as MyMoney brand icon
- `assets/images/svg/404.svg` and `500.svg` — error page illustrations
- `assets/images/favicon/` — full favicon set (repurpose with new brand)

**Decision — Add:**
- `assets/images/brand/logo.svg` — MyMoney full logo (horizontal lockup)
- `assets/images/illustrations/auth-preview.svg` — replace the `dasher-ui-bootstrap-5.jpg` auth card visual

---

## ADR-012 · Pages to Keep, Modify, and Remove from Template

| Template Page | Decision | Reason |
|---|---|---|
| `html/login.html` | Keep → modify | Rewrite as `pages/auth/login.html` |
| `html/register.html` | Keep → modify | Fields must match backend contract |
| `html/forgot-password.html` | Keep → modify | Add localization, API integration |
| `html/index.html` | Keep → modify | Dashboard — strip demo content |
| `html/profile.html` | Keep → modify | Useful profile page structure |
| `html/settings.html` | Keep → modify | Settings structure is appropriate |
| `html/404.html` | Keep → modify | Rebrand only |
| `html/500.html` | Keep → modify | Rebrand only |
| `html/blank.html` | Keep | Useful as new-page starter |
| `html/user-details.html` | Keep → modify | Will need in user management phase |
| `html/add-user.html` | Keep → modify | Will need in user management phase |
| `html/charts.html` | Remove after reference | Template demo only |
| `html/tables.html` | Remove after reference | Template demo only |
| `html/forms.html` | Remove after reference | Template demo only |
| `html/components.html` | Remove after reference | Template demo only |
| `html/alerts.html` | Remove after reference | Template demo only |
| `html/modals.html` | Remove after reference | Template demo only |
| `html/create-agent.html` | Remove | Irrelevant to MyMoney |

---

## Dependency Audit

| Library | Current Version | Latest Stable | Action |
|---|---|---|---|
| Bootstrap CSS+JS | 5.3.8 | 5.3.8 | No action — already latest |
| Bootstrap Icons | 1.13.1 | 1.13.1 | No action — already latest |
| Popper.js | Bundled in Bootstrap | — | Bundled — no separate action |
| jQuery | Not present | — | Do not add |
| Any charting library | Not present | — | Evaluate when chart features are needed |

**Security assessment:** No third-party CDN links. No external script tags. All vendor files are
locally hosted. No known vulnerabilities in Bootstrap 5.3.8 or Bootstrap Icons 1.13.1 as of June 2026.
Risk level: **Low**.
