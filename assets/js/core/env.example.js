/**
 * env.example.js — per-environment runtime configuration (FM10)
 *
 * The app's API base URL must NOT be hardcoded for production. This file is the
 * template for supplying it per environment WITHOUT a build step.
 *
 * Setup:
 *   1. Copy this file to `env.js` in the same folder.
 *   2. Set MM_API_BASE_URL to the backend origin for THAT environment.
 *   3. Load it as a CLASSIC script in each page <head>, BEFORE the module
 *      entry point, so the value exists when core/config.js evaluates:
 *
 *        <script src="/assets/js/core/env.js"></script>
 *        <script type="module" src="/assets/js/pages/<page>.js"></script>
 *
 *   4. Keep `env.js` OUT of version control (add it to .gitignore) and deploy
 *      it per environment (dev / staging / prod). Only this `.example` file is
 *      committed, so no environment URL ever ships baked into the repo.
 *
 * If MM_API_BASE_URL is left unset, core/config.js falls back to
 * https://localhost:44320 ONLY on localhost; any other host logs a loud error
 * and uses an empty base so the misconfiguration is obvious rather than silent.
 */
window.MM_API_BASE_URL = 'https://localhost:44320';
