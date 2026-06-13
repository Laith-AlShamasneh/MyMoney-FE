/**
 * pages/error.js — MyMoney
 * Shared script for 404 and 500 error pages.
 * Initialises i18n and theme only — no auth guard needed.
 */

import { initI18n }  from '../core/i18n.js';
import { initTheme } from '../components/layout.js';

async function init() {
  await initI18n();
  initTheme();
}

init();
