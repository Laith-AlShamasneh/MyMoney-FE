# MyMoney Frontend — Development Guide

> This document is the source of truth for all frontend development standards.
> Every developer working on this project must follow these conventions.
> When in doubt: consistency over personal preference.

---

## Table of Contents

1. [Project Setup](#1-project-setup)
2. [HTML Standards](#2-html-standards)
3. [CSS Standards](#3-css-standards)
4. [JavaScript Standards](#4-javascript-standards)
5. [Localization Standards](#5-localization-standards)
6. [AJAX & API Standards](#6-ajax--api-standards)
7. [Authentication Standards](#7-authentication-standards)
8. [Component Reuse Standards](#8-component-reuse-standards)
9. [Responsive Design Standards](#9-responsive-design-standards)
10. [Naming Conventions](#10-naming-conventions)
11. [File & Folder Conventions](#11-file--folder-conventions)
12. [Adding a New Page — Checklist](#12-adding-a-new-page--checklist)

---

## 1. Project Setup

### Running the project

A local web server is required (ES Modules and locale JSON fetches do not work on `file://`).

**VS Code Live Server (recommended):**
1. Install the Live Server extension.
2. Right-click `index.html` → "Open with Live Server".

**Python (alternative):**
```bash
cd MyMoney-FE
python -m http.server 5500
```

Then open `http://localhost:5500` in your browser.

### Browser targets

Support the last 2 major versions of Chrome, Edge, Firefox, and Safari.
No IE11 support. No polyfills needed.

---

## 2. HTML Standards

### Doctype and language

Every HTML file must start with:
```html
<!DOCTYPE html>
<html lang="ar" dir="rtl">
```
The `lang` and `dir` attributes are managed at runtime by `core/i18n.js`, but the initial value in the
file should match the application's primary language (Arabic).

### Meta tags — required on every page

```html
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="[page description]">
<title>[Page Name] | MyMoney</title>
```

### CSS load order — every page

```html
<!-- 1. Bootstrap (vendor, never modify) -->
<link rel="stylesheet" href="/assets/css/vendor/bootstrap.min.css">
<!-- 2. Icons (vendor, never modify) -->
<link rel="stylesheet" href="/assets/vendors/bootstrap-icons/bootstrap-icons.css">
<!-- 3. App base (variables, reset) -->
<link rel="stylesheet" href="/assets/css/app.css">
<!-- 4. Layout (dashboard pages only) OR Auth (auth pages only) -->
<link rel="stylesheet" href="/assets/css/layout.css">
<link rel="stylesheet" href="/assets/css/auth.css">
<!-- 5. Components (all pages) -->
<link rel="stylesheet" href="/assets/css/components.css">
```

### Script load order — every page

Scripts go at the **end of `<body>`**, in this order:
```html
<!-- 1. Bootstrap JS (vendor, never modify) -->
<script src="/assets/js/vendor/bootstrap.bundle.min.js"></script>
<!-- 2. App boot + page script (ES Module) -->
<script type="module" src="/assets/js/pages/[page-name].js"></script>
```
There is only one `type="module"` script per page. It imports everything it needs.

### Semantic structure

Use semantic HTML elements:
- `<header>` for page headers
- `<nav>` for navigation
- `<main>` for the primary content area (one per page)
- `<aside>` for sidebars
- `<section>` for logical groupings within main
- `<article>` for self-contained components (metric cards, list items)
- `<footer>` for the page footer

Do not use `<div>` when a semantic element is appropriate.

### Translatable text

Every visible text string that will be translated must carry a `data-i18n` attribute. Do not hardcode
visible text in HTML:

```html
<!-- Correct -->
<label class="form-label" for="email" data-i18n="auth.login.email_label"></label>
<button class="btn btn-primary" data-i18n="auth.login.submit"></button>

<!-- Wrong -->
<label class="form-label" for="email">Email address</label>
<button class="btn btn-primary">Sign In</button>
```

For attributes (placeholder, aria-label, title):
```html
<input data-i18n-placeholder="auth.login.email_placeholder" ...>
<button data-i18n-aria-label="layout.sidebar_toggle_label" ...>
```

### ARIA and accessibility

- Every interactive element that lacks visible text must have `aria-label`.
- Decorative icons must have `aria-hidden="true"`.
- Form inputs must have associated `<label>` elements (via `for`/`id` pair).
- Use `role`, `aria-expanded`, `aria-current`, `aria-controls` on interactive components as required.

```html
<!-- Correct -->
<button aria-label="Toggle sidebar" data-sidebar-toggle>
  <i class="bi bi-list" aria-hidden="true"></i>
</button>

<!-- Wrong -->
<button data-sidebar-toggle>
  <i class="bi bi-list"></i>
</button>
```

---

## 3. CSS Standards

### Variable naming

Application variables use the `--mm-` prefix. Bootstrap variables use `--bs-`. Template layout
variables use `--admin-`. Never override `--bs-*` variables for design decisions — use `--mm-*`.

```css
/* Correct */
:root {
  --mm-brand-primary: #2563eb;
  --mm-brand-success: #0f766e;
}

/* Wrong — pollutes Bootstrap's namespace */
:root {
  --bs-primary: #2563eb;
}
```

### File responsibilities

| File | What goes here | What does NOT go here |
|---|---|---|
| `app.css` | `:root` variables, `body`, `html`, `a` base | Component styles |
| `layout.css` | Sidebar, navbar, footer, `admin-shell`, `admin-main` | Auth styles |
| `auth.css` | Auth card, auth page, auth brand, auth footer | Dashboard layout |
| `components.css` | Metric cards, panels, tables, badges, forms, buttons | Layout structure |
| `rtl.css` | RTL-specific property overrides only | LTR styles |

### Dark mode

Dark mode is applied via `html[data-theme="dark"]` CSS attribute selectors. This pattern is already
established in the template and must be followed:

```css
/* Light (default) */
.my-component {
  background: var(--mm-surface);
  color: var(--mm-text);
}

/* Dark override */
html[data-theme="dark"] .my-component {
  background: var(--mm-surface-dark);
}
```

Never use JavaScript to add `.dark-mode` classes to individual components. All dark mode is CSS-only.

### RTL support

Prefer CSS logical properties over physical properties whenever they affect direction:

```css
/* Preferred — works in both RTL and LTR */
margin-inline-start: 1rem;
padding-inline: 1.25rem;
inset-inline-start: 0;

/* Use physical only when truly direction-independent */
margin-top: 1rem;
padding-block: 0.5rem;
```

RTL-specific overrides that cannot be expressed with logical properties go in `rtl.css`:

```css
/* rtl.css */
[dir="rtl"] .sidebar-nav .nav-link:hover {
  transform: translateX(-2px); /* reverse the LTR translateX(2px) */
}
```

### Spacing

Use CSS custom property-based spacing. Do not use magic numbers:

```css
/* Correct */
padding: var(--mm-spacing-md);

/* Acceptable (Bootstrap utility) */
class="p-3 mb-4"

/* Wrong */
padding: 14px;
```

### Selectors

- Class selectors only. No ID selectors in CSS (IDs are for JS targeting only).
- Maximum selector depth: 3 levels. If you need more, the component needs restructuring.
- No `!important` except when overriding Bootstrap utilities with a documented reason.

---

## 4. JavaScript Standards

### Module structure

Every JS module follows this shape:

```javascript
// assets/js/components/toast.js

// Named exports only. No default exports.
export function showToast(message, type = 'info') {
  // ...
}

export function showSuccess(message) {
  showToast(message, 'success');
}
```

Page scripts are the entry point and import everything they need:

```javascript
// assets/js/pages/login.js
import { initLayout } from '../components/layout.js';
import { initI18n } from '../core/i18n.js';
import { post } from '../core/api.js';
import { setSession } from '../core/auth.js';
import { showToast } from '../components/toast.js';
import { Loading } from '../components/loading.js';

initI18n();
initLayout(); // only if this is a dashboard page

const form = document.getElementById('loginForm');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  // ...
});
```

### Async / error handling

All API calls use `async/await` wrapped in `try/catch`. The `api.js` layer handles the common error
cases. Page-level `catch` handles anything that reaches the page (e.g., showing inline validation errors):

```javascript
async function handleLogin(e) {
  e.preventDefault();
  const btn = e.submitter;
  Loading.button(btn);

  try {
    const result = await post('/api/auth/login', { email, password });
    setSession(result);
    window.location.href = '/pages/dashboard/index.html';
  } catch (err) {
    if (err.isApiError && err.errors?.length) {
      showFieldErrors(err.errors);
    }
    // api.js already showed a toast for server/network errors
  } finally {
    Loading.restore(btn);
  }
}
```

### No direct DOM manipulation outside modules

Do not scatter `document.querySelector` calls throughout page scripts. Group DOM lookups at the
top of the page script:

```javascript
// Good — DOM lookups are declared together at the top
const form = document.getElementById('loginForm');
const emailInput = document.getElementById('loginEmail');
const passwordInput = document.getElementById('loginPassword');
```

### No global variables

Do not write to `window.*` in application code. Module-level variables are sufficient. The only
permitted global is `window.MyMoney.config` for runtime configuration (base URL, environment).

### Event listeners

Attach event listeners once on page load. Do not attach them inside loops or conditionals unless
the listener must be conditional.

```javascript
// Correct
form.addEventListener('submit', handleSubmit);

// Wrong — risk of duplicate listeners
function render() {
  form.addEventListener('submit', handleSubmit);
}
```

### Comments

Write a comment only when the **why** is not obvious from the code. Do not describe what the code does.

```javascript
// Correct — explains why
// Retry once with a refreshed token before giving up (RFC 6750 silent refresh pattern)
if (response.status === 401 && !options._isRetry) {
  await refreshToken();
  return request(method, endpoint, body, { ...options, _isRetry: true });
}

// Wrong — describes what the code already says
// Check if response is 401
if (response.status === 401) {
```

---

## 5. Localization Standards

### Locale file structure

Keys are namespaced by page or section, then by element. Use `snake_case` for key names:

```json
{
  "common": {
    "app_name": "MyMoney",
    "loading": "جاري التحميل...",
    "save": "حفظ",
    "cancel": "إلغاء",
    "back": "رجوع"
  },
  "errors": {
    "network": "لا يوجد اتصال بالإنترنت. يرجى التحقق من الاتصال والمحاولة مرة أخرى.",
    "server": "حدث خطأ في الخادم. يرجى المحاولة مرة أخرى.",
    "timeout": "انتهت مدة الطلب. يرجى المحاولة مرة أخرى.",
    "forbidden": "ليس لديك صلاحية للوصول إلى هذه الصفحة.",
    "session_expired": "انتهت جلستك. يرجى تسجيل الدخول مجدداً."
  },
  "auth": {
    "login": {
      "title": "تسجيل الدخول",
      "subtitle": "سجّل دخولك إلى حسابك في MyMoney.",
      "email_label": "البريد الإلكتروني",
      "email_placeholder": "example@email.com",
      "password_label": "كلمة المرور",
      "forgot_link": "نسيت كلمة المرور؟",
      "remember_me": "تذكّرني",
      "submit": "دخول",
      "no_account": "ليس لديك حساب؟",
      "create_account": "إنشاء حساب"
    }
  }
}
```

Both `ar.json` and `en.json` must have **identical key structures**. A missing key in either file
is a bug.

### Using translations in JavaScript

Import and use the `t()` function:

```javascript
import { t } from '../core/i18n.js';

showToast(t('errors.network'), 'error');
const label = t('auth.login.email_label');
```

### Language switching

Language is stored in `localStorage` under `mm.lang`. The default is `'ar'`.
`i18n.js` loads the correct locale file on boot and re-applies all translations on switch.
Language switching does not require a page reload.

---

## 6. AJAX & API Standards

### All requests through api.js

Never write `fetch()` or `XMLHttpRequest` outside of `core/api.js`. This is a hard rule.

```javascript
// Correct
import { post } from '../core/api.js';
const result = await post('/api/auth/login', { email, password });

// Wrong — direct fetch in a page script
const response = await fetch('/api/auth/login', { method: 'POST', ... });
```

### API module public interface

```javascript
// core/api.js exports:
export async function get(endpoint, options)
export async function post(endpoint, body, options)
export async function put(endpoint, body, options)
export async function del(endpoint, options)
export async function upload(endpoint, formData, options)
```

### Response handling contract

- On `success: true` → the function returns `result` (the data payload).
- On `success: false` with validation errors → throws `ApiError` with `.message` and `.errors[]`.
- On auth/server/network errors → `api.js` handles entirely (toast + redirect). Page code does not
  need to handle these cases explicitly, but should have a catch block to avoid unhandled rejections.

### ApiError type

```javascript
// Thrown by api.js for business validation failures
class ApiError extends Error {
  constructor(message, errors = [], code = 0) {
    super(message);
    this.isApiError = true;
    this.errors = errors;   // string[] from the backend errors array
    this.code = code;       // InternalResponseCode
  }
}
```

### Displaying validation errors from the API

When a form submission fails with `success: false`, show inline errors on the relevant fields.
Map backend error strings to form fields using `data-error-field` attributes if field-specific errors
are returned. If the backend returns general errors (not field-specific), show them in a summary alert
above the form:

```html
<div class="alert alert-danger d-none" id="formErrorSummary" role="alert">
  <ul class="mb-0" id="formErrorList"></ul>
</div>
```

```javascript
function showFieldErrors(errors) {
  const list = document.getElementById('formErrorList');
  const summary = document.getElementById('formErrorSummary');
  list.innerHTML = errors.map(e => `<li>${e}</li>`).join('');
  summary.classList.remove('d-none');
}
```

### Loading states on buttons

Always disable the submit button during an API call and restore it after:

```javascript
import { Loading } from '../components/loading.js';

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter;
  Loading.button(btn);
  try {
    await post(/* ... */);
  } finally {
    Loading.restore(btn);
  }
});
```

---

## 7. Authentication Standards

### Token management

All token reads and writes go through `core/auth.js`. Never access `localStorage` for auth tokens
directly in page scripts.

```javascript
// Correct
import { getAccessToken, setSession, clearSession } from '../core/auth.js';

// Wrong
const token = localStorage.getItem('mm.accessToken');
```

### Protecting a page

Every non-auth page must call `guardPage()` as its first action:

```javascript
import { guardPage } from '../core/auth.js';

// This redirects to login if no valid session exists
await guardPage();

// Rest of page init below
```

### Current user data

```javascript
import { getCurrentUser } from '../core/auth.js';

const user = getCurrentUser();
// { userId, email, displayName, roles: string[] }
```

### Logout

```javascript
import { logout } from '../core/auth.js';

// Clears tokens and redirects to login
logout();
```

---

## 8. Component Reuse Standards

### Shared layout (dashboard pages)

The sidebar, navbar, and footer are injected by `components/layout.js`. Dashboard pages must call:

```javascript
import { initLayout } from '../components/layout.js';
initLayout();
```

The HTML page must have the correct placeholder elements:

```html
<div id="sidebar-root"></div>
<div id="navbar-root"></div>
<footer id="footer-root"></footer>
```

Active navigation state is set automatically based on `window.location.pathname`.

### Toast notifications

```javascript
import { showToast } from '../components/toast.js';

showToast(t('common.saved'), 'success');   // green
showToast(t('errors.network'), 'error');    // red
showToast(t('common.warning'), 'warning'); // yellow
showToast(t('common.info'), 'info');       // blue
```

Toasts auto-dismiss after 5 seconds. Multiple toasts stack vertically.

### Button loading state

```javascript
import { Loading } from '../components/loading.js';

Loading.button(buttonElement);    // disables + shows spinner
Loading.restore(buttonElement);   // re-enables + restores original text
```

### Form validation pattern

Forms use Bootstrap's `.needs-validation` pattern. HTML5 constraints (`required`, `type="email"`,
`minlength`) catch client-side issues. Backend errors from the API overlay the same `.invalid-feedback`
elements.

```html
<form id="loginForm" class="needs-validation" novalidate>
  <div class="mb-3">
    <label class="form-label" for="loginEmail" data-i18n="auth.login.email_label"></label>
    <input class="form-control" id="loginEmail" type="email" required>
    <div class="invalid-feedback" data-i18n="auth.login.email_error"></div>
  </div>
</form>
```

---

## 9. Responsive Design Standards

### Breakpoints

| Name | Range | Bootstrap Class |
|---|---|---|
| Mobile | < 576px | (default) |
| Small | 576px – 767px | `sm` |
| Medium | 768px – 991px | `md` |
| Large | 992px – 1199px | `lg` |
| Extra Large | ≥ 1200px | `xl` |

### Mobile-first

Write mobile CSS first. Use `min-width` media queries for larger breakpoints. Never write desktop CSS
then override for mobile.

```css
/* Correct — mobile first */
.metric-cards-grid {
  grid-template-columns: 1fr;
}

@media (min-width: 576px) {
  .metric-cards-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (min-width: 1200px) {
  .metric-cards-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
```

### Sidebar responsive behaviour

- Desktop (≥ 992px): Fixed sidebar, collapsible to mini-mode via toggle.
- Mobile (< 992px): Sidebar hidden off-canvas, slides in via `.sidebar-open` class on `body`.
- The behaviour is handled by `components/layout.js` — do not duplicate this logic in page scripts.

### Touch targets

All interactive elements (buttons, links, inputs) must have a minimum touch target of 44×44px on mobile.
Use Bootstrap utilities (`btn`, `form-control`) which meet this requirement, or add explicit `min-height`
when building custom interactive elements.

---

## 10. Naming Conventions

### CSS classes

Use `kebab-case`. Prefix custom components with the domain for clarity:

```
.auth-card          ← auth domain component
.metric-card        ← dashboard metric component
.mm-tag             ← MyMoney-specific global utility
```

Do not use BEM (Block__Element--Modifier). Keep class names flat and self-descriptive.

### JavaScript

| Context | Convention | Example |
|---|---|---|
| Variables | `camelCase` | `const accessToken = ...` |
| Functions | `camelCase` | `async function handleSubmit()` |
| Constants (config) | `UPPER_SNAKE_CASE` | `const BASE_URL = '...'` |
| Module exports | `camelCase` | `export function showToast()` |
| Private helpers (within a module) | `camelCase` with leading verb | `function buildHeaders()` |

### HTML IDs

Used only for JS targeting. Use `camelCase`:

```html
<form id="loginForm">
<div id="formErrorSummary">
<input id="loginEmail">
```

### Data attributes

Use `data-` attributes for JS behaviour hooks, never for styling:

```html
data-sidebar-toggle    ← JS targets this to toggle sidebar
data-theme-toggle      ← JS targets this for theme switch
data-i18n="key.path"   ← i18n engine targets this for translation
data-table-search="id" ← table search targets this
```

### Files

| Type | Convention | Example |
|---|---|---|
| HTML pages | `kebab-case.html` | `forgot-password.html` |
| JS modules | `kebab-case.js` | `api.js`, `reset-password.js` |
| CSS files | `kebab-case.css` | `app.css`, `layout.css` |
| Locale files | `{lang}.json` | `ar.json`, `en.json` |
| Images | `kebab-case.{ext}` | `logo-icon.svg`, `avatar-fallback.svg` |

---

## 11. File & Folder Conventions

### Where does new code go?

| What | Where |
|---|---|
| New page HTML | `pages/{domain}/` |
| New page JavaScript | `assets/js/pages/` |
| New shared UI component | `assets/js/components/` |
| New core infrastructure | `assets/js/core/` |
| New CSS component styles | `assets/css/components.css` (add a section comment) |
| New page-specific CSS | `assets/css/pages/{page-name}.css` (only if substantial) |
| New translation keys | Both `assets/locales/ar.json` AND `assets/locales/en.json` |
| New brand images | `assets/images/brand/` |
| New illustration images | `assets/images/illustrations/` |

### Never modify vendor files

Files under `assets/css/vendor/` and `assets/js/vendor/` are third-party files. Never modify them.
Upgrade them as a unit when a new version is released.

---

## 12. Adding a New Page — Checklist

Use this checklist every time a new page is created:

**HTML file:**
- [ ] Created in the correct `pages/{domain}/` folder
- [ ] `lang="ar" dir="rtl"` on `<html>` (initial values)
- [ ] All required `<meta>` tags present
- [ ] `<title>` follows `[Page Name] | MyMoney` format
- [ ] CSS files linked in correct order
- [ ] Only one `<script type="module">` at end of body
- [ ] All visible text uses `data-i18n` attributes (no hardcoded strings)
- [ ] Decorative icons have `aria-hidden="true"`
- [ ] Interactive controls have accessible labels

**Translation files:**
- [ ] New keys added to `assets/locales/ar.json`
- [ ] Same keys added to `assets/locales/en.json` with English equivalents

**JavaScript page file:**
- [ ] Created at `assets/js/pages/{page-name}.js`
- [ ] Imports `initI18n` and calls it first
- [ ] Imports `guardPage` and calls it (if protected page)
- [ ] Imports `initLayout` and calls it (if dashboard page)
- [ ] Form submissions use `Loading.button()` / `Loading.restore()`
- [ ] API calls are wrapped in try/catch
- [ ] No direct `fetch()` or `localStorage` access for auth tokens

**Sidebar navigation (dashboard pages only):**
- [ ] New nav link added to the nav items array in `components/layout.js`
- [ ] Nav link uses `data-i18n` key that exists in both locale files
