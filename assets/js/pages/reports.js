/**
 * pages/reports.js — MyMoney
 * Report generation, history, download, and deletion.
 */

import { initI18n, t, getLanguage }   from '../core/i18n.js';
import { initLayout }                  from '../components/layout.js';
import { guardPage }                   from '../core/auth.js';
import { initOnboarding }              from '../components/onboarding.js';
import { ReportService }               from '../services/report-service.js';
import { ApiError }                    from '../core/api.js';
import { Loader }                      from '../components/loading.js';
import { showSuccess, showError }      from '../components/toast.js';
import { initWorkspaceContext }        from '../services/workspace-context.js';

/* --------------------------------------------------------------------------
   State
   -------------------------------------------------------------------------- */
/** @type {Array<object>} */
let _reports = [];

/** @type {Array<{id:number, key:string, nameEn:string, nameAr:string}>} */
let _types = [];

/* --------------------------------------------------------------------------
   DOM refs
   -------------------------------------------------------------------------- */
const generateForm      = document.getElementById('generateForm');
const generateBtn       = document.getElementById('generateBtn');
const generateError     = document.getElementById('generateError');
const generateErrorList = document.getElementById('generateErrorList');
const reportTypeSelect  = document.getElementById('reportTypeSelect');
const typeSkeleton      = document.getElementById('typeSkeleton');
const reportLanguage    = document.getElementById('reportLanguage');
const dateFrom          = document.getElementById('dateFrom');
const dateTo            = document.getElementById('dateTo');
const refreshBtn        = document.getElementById('refreshBtn');

const historyLoading = document.getElementById('historyLoading');
const historyEmpty   = document.getElementById('historyEmpty');
const historyTable   = document.getElementById('historyTable');
const historyBody    = document.getElementById('historyBody');

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */
function _esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function _formatDate(isoString) {
  if (!isoString) return '—';
  try {
    const lang = getLanguage() === 'ar' ? 'ar-SA' : 'en-US';
    return new Intl.DateTimeFormat(lang, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(isoString));
  } catch {
    return isoString.slice(0, 16).replace('T', ' ');
  }
}

function _statusBadge(status, statusName) {
  const map = {
    1: 'bg-secondary',
    2: 'bg-primary',
    3: 'bg-success',
    4: 'bg-danger',
    5: 'bg-warning text-dark',
  };
  const cls   = map[status] ?? 'bg-secondary';
  const label = t(`reports.status_${statusName.toLowerCase()}`) || statusName;
  return `<span class="badge ${cls}">${_esc(label)}</span>`;
}

function _langLabel(lang) {
  return lang === 'ar' ? t('reports.lang_ar') : t('reports.lang_en');
}

function _typeName(report) {
  const lang = getLanguage();
  return lang === 'ar' ? report.reportTypeNameAr : report.reportTypeNameEn;
}

/* --------------------------------------------------------------------------
   Load report types
   -------------------------------------------------------------------------- */
async function loadTypes() {
  try {
    _types = await ReportService.getTypes() || [];

    reportTypeSelect.innerHTML =
      `<option value="">${_esc(t('reports.generate_type_placeholder'))}</option>` +
      _types.map(tp => {
        const name = getLanguage() === 'ar' ? tp.nameAr : tp.nameEn;
        return `<option value="${tp.id}">${_esc(name)}</option>`;
      }).join('');

    typeSkeleton.classList.add('d-none');
    reportTypeSelect.classList.remove('d-none');
  } catch {
    typeSkeleton.innerHTML =
      `<p class="text-danger small mb-0">${_esc(t('errors.unknown'))}</p>`;
  }
}

/* --------------------------------------------------------------------------
   Load report history
   -------------------------------------------------------------------------- */
async function loadHistory() {
  historyLoading.classList.remove('d-none');
  historyEmpty.classList.add('d-none');
  historyTable.classList.add('d-none');

  try {
    _reports = await ReportService.getList() || [];
    _renderHistory();
  } catch {
    historyLoading.classList.add('d-none');
    historyEmpty.classList.remove('d-none');
    historyEmpty.querySelector('[id="historyEmptyTitle"]')?.remove();
  } finally {
    historyLoading.classList.add('d-none');
  }
}

function _renderHistory() {
  if (!_reports.length) {
    historyEmpty.classList.remove('d-none');
    historyTable.classList.add('d-none');
    return;
  }

  historyEmpty.classList.add('d-none');
  historyBody.innerHTML = _reports.map(_buildRow).join('');
  historyTable.classList.remove('d-none');

  // Bind action buttons
  historyBody.querySelectorAll('[data-download-id]').forEach(btn => {
    btn.addEventListener('click', () => _downloadReport(Number(btn.dataset.downloadId), btn));
  });
  historyBody.querySelectorAll('[data-delete-id]').forEach(btn => {
    btn.addEventListener('click', () => _deleteReport(Number(btn.dataset.deleteId), btn));
  });
}

function _buildRow(report) {
  const downloadBtn = report.canDownload
    ? `<button type="button"
               class="btn btn-sm btn-outline-success"
               data-download-id="${report.id}"
               aria-label="${_esc(t('reports.btn_download'))}">
         <i class="bi bi-download me-1" aria-hidden="true"></i>
         <span class="d-none d-md-inline">${_esc(t('reports.btn_download'))}</span>
       </button>`
    : '';

  const deleteBtn = report.canDelete
    ? `<button type="button"
               class="btn btn-sm btn-outline-danger"
               data-delete-id="${report.id}"
               aria-label="${_esc(t('reports.btn_delete'))}">
         <i class="bi bi-trash me-1" aria-hidden="true"></i>
         <span class="d-none d-md-inline">${_esc(t('reports.btn_delete'))}</span>
       </button>`
    : '';

  const period = report.dateFrom && report.dateTo
    ? `<span dir="ltr">${_esc(report.dateFrom)} — ${_esc(report.dateTo)}</span>`
    : '—';

  return `
    <tr data-report-id="${report.id}">
      <td class="fw-medium">${_esc(_typeName(report))}</td>
      <td class="text-muted">${period}</td>
      <td>${_esc(_langLabel(report.language))}</td>
      <td>${_statusBadge(report.status, report.statusName)}</td>
      <td class="text-muted small">${_esc(_formatDate(report.requestedOnUtc))}</td>
      <td>
        <div class="d-flex gap-2 justify-content-end">
          ${downloadBtn}
          ${deleteBtn}
        </div>
      </td>
    </tr>`;
}

/* --------------------------------------------------------------------------
   Generate report
   -------------------------------------------------------------------------- */
function _hideErrors() {
  generateError.classList.add('d-none');
  generateErrorList.innerHTML = '';
}

function _showErrors(messages) {
  generateErrorList.innerHTML = messages.map(m => `<li>${_esc(m)}</li>`).join('');
  generateError.classList.remove('d-none');
}

generateForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  _hideErrors();

  if (!generateForm.checkValidity()) {
    generateForm.classList.add('was-validated');
    return;
  }
  generateForm.classList.remove('was-validated');

  Loader.setButtonLoading(generateBtn);
  try {
    await ReportService.generate({
      reportTypeId: Number(reportTypeSelect.value),
      language:     reportLanguage.value,
      dateFrom:     dateFrom.value,
      dateTo:       dateTo.value,
    });

    showSuccess(t('reports.generate_success'));
    generateForm.reset();
    generateForm.classList.remove('was-validated');

    // Reload history after a short delay so the new pending record appears
    setTimeout(loadHistory, 800);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.errors?.length) _showErrors(err.errors);
      else _showErrors([err.message || t('errors.unknown')]);
    } else {
      _showErrors([t('errors.unknown')]);
    }
  } finally {
    Loader.clearButtonLoading(generateBtn);
  }
});

/* --------------------------------------------------------------------------
   Download
   -------------------------------------------------------------------------- */
async function _downloadReport(reportId, btn) {
  Loader.setButtonLoading(btn);
  try {
    const { blob, filename } = await ReportService.download(reportId);

    // Trigger browser download
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    showError(err instanceof ApiError ? err.message : t('reports.download_error'));
  } finally {
    Loader.clearButtonLoading(btn);
  }
}

/* --------------------------------------------------------------------------
   Delete
   -------------------------------------------------------------------------- */
async function _deleteReport(reportId, btn) {
  if (!window.confirm(t('reports.delete_confirm'))) return;

  Loader.setButtonLoading(btn);
  try {
    await ReportService.deleteReport(reportId);
    _reports = _reports.filter(r => r.id !== reportId);
    _renderHistory();
    showSuccess(t('reports.delete_success'));
  } catch (err) {
    showError(err instanceof ApiError ? err.message : t('errors.unknown'));
    Loader.clearButtonLoading(btn);
  }
}

/* --------------------------------------------------------------------------
   Refresh button
   -------------------------------------------------------------------------- */
refreshBtn.addEventListener('click', loadHistory);

/* --------------------------------------------------------------------------
   Default dates — current month
   -------------------------------------------------------------------------- */
function _setDefaultDates() {
  const now   = new Date();
  const y     = now.getFullYear();
  const m     = String(now.getMonth() + 1).padStart(2, '0');
  const last  = new Date(y, now.getMonth() + 1, 0).getDate();
  dateFrom.value = `${y}-${m}-01`;
  dateTo.value   = `${y}-${m}-${last}`;
}

/* --------------------------------------------------------------------------
   Language sync — set default language dropdown to match UI language
   -------------------------------------------------------------------------- */
function _syncLanguageDropdown() {
  const lang = getLanguage();
  reportLanguage.value = lang === 'en' ? 'en' : 'ar';
}

/* --------------------------------------------------------------------------
   Init
   -------------------------------------------------------------------------- */
async function init() {
  await initI18n();
  await guardPage();
  initLayout();
  await initWorkspaceContext({
    viewPerm:  'view_reports',
    contentId: 'generateForm',
    gates: [{ id: 'generateBtn', perm: 'export_reports' }],
  });
  _setDefaultDates();
  _syncLanguageDropdown();
  await Promise.all([loadTypes(), loadHistory()]);
  initOnboarding();
}

init();
