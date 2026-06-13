/**
 * pages/profile.js — MyMoney
 * Phase 2: infrastructure init only.
 * Phase 3: will load profile data and handle edit form.
 */

import { initI18n }   from '../core/i18n.js';
import { guardPage }  from '../core/auth.js';
import { initLayout } from '../components/layout.js';

async function init() {
  await initI18n();
  await guardPage();
  initLayout();
}

init();
