/**
 * pages/confirm-email-change.js — MyMoney
 * Reads ?token= from URL, POSTs to authentication email-change confirm endpoint.
 * Public page — no auth required.
 */

import { initI18n }    from '../core/i18n.js';
import { initTheme }   from '../components/layout.js';
import { AuthService } from '../services/auth-service.js';

const stateVerifying = document.getElementById('stateVerifying');
const stateSuccess   = document.getElementById('stateSuccess');
const stateError     = document.getElementById('stateError');

async function init() {
  await initI18n();
  initTheme();

  const token = new URLSearchParams(window.location.search).get('token');

  if (!token) {
    _showError();
    return;
  }

  try {
    await AuthService.confirmEmailChange(token);
    _showSuccess();
  } catch {
    _showError();
  }
}

function _showSuccess() {
  stateVerifying.classList.add('d-none');
  stateSuccess.classList.remove('d-none');
}

function _showError() {
  stateVerifying.classList.add('d-none');
  stateError.classList.remove('d-none');
}

init();
