/**
 * pages/error.js — MyMoney
 * Shared script for the 403 / 404 / 500 error pages.
 * Initialises i18n and theme only — no auth guard needed.
 * Button actions are wired here (not inline onclick) so they comply with CSP.
 */

import { initI18n }  from '../core/i18n.js';
import { initTheme } from '../components/layout.js';

async function init() {
  await initI18n();
  initTheme();

  document.querySelectorAll('[data-error-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.errorAction;
      if (action === 'back')   history.back();
      if (action === 'reload') location.reload();
    });
  });
}

init();
