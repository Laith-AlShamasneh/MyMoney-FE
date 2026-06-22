/**
 * pages/receipts.js — MyMoney
 * Enterprise-grade Receipt Management: gallery/table/list views, upload,
 * preview drawer, edit offcanvas, bulk actions, tag management, OCR status.
 */

import { initI18n, t, getLanguage }  from '../core/i18n.js';
import { initLayout }                 from '../components/layout.js';
import { guardPage }                  from '../core/auth.js';
import { ReceiptService }             from '../services/receipt-service.js';
import { ApiError }                   from '../core/api.js';
import { showSuccess, showError }     from '../components/toast.js';

/* ── Constants ────────────────────────────────────────────────────────────── */
const STATUS   = Object.freeze({ ACTIVE: 1, ARCHIVED: 2, DELETED: 3 });
const OCR      = Object.freeze({ PENDING: 1, PROCESSING: 2, COMPLETED: 3, FAILED: 4, SKIPPED: 5 });
const VIEW_KEY = 'mm.receipts.view';
const IMAGE_TYPES = ['image/jpeg','image/png','image/gif','image/webp','image/heic','image/heif'];

/* ── State ────────────────────────────────────────────────────────────────── */
const _s = {
  page: 1, pageSize: 20, totalCount: 0,
  view: _loadPref(VIEW_KEY, 'gallery'),
  keyword: '', statusId: null,
  dateFrom: null, dateTo: null,
  amountMin: null, amountMax: null, tagId: null,
  allReceipts: [],
  allTags: [],
  selected: new Set(),
  previewIndex: -1,
  previewZoom: 1.0,
  uploadFile: null,
  uploadTagIds: [],
  editTagIds: [],
  editCurrentTxId: null,
  pendingDeleteId: null,
  tagPickerTarget: null, // 'upload' | 'edit'
  filtersOpen: false,
  _searchTimer: null,
};

/* ── DOM refs ─────────────────────────────────────────────────────────────── */
const $  = id => document.getElementById(id);
const kpiSkeletons     = $('kpiSkeletons');
const kpiStrip         = $('kpiStrip');
const kpiTotal         = $('kpiTotal');
const kpiActive        = $('kpiActive');
const kpiOcrDone       = $('kpiOcrDone');
const kpiLinked        = $('kpiLinked');
const searchInput      = $('searchInput');
const filterStatus     = $('filterStatus');
const filterSort       = $('filterSort');
const btnToggleFilters = $('btnToggleFilters');
const filterBadge      = $('filterBadge');
const advancedFilters  = $('advancedFilters');
const filterDateFrom   = $('filterDateFrom');
const filterDateTo     = $('filterDateTo');
const filterAmountMin  = $('filterAmountMin');
const filterAmountMax  = $('filterAmountMax');
const filterTag        = $('filterTag');
const btnResetFilters  = $('btnResetFilters');
const gallerySkeletons = $('gallerySkeletons');
const galleryView      = $('galleryView');
const tableView        = $('tableView');
const tableBody        = $('tableBody');
const listView         = $('listView');
const emptyState       = $('emptyState');
const emptyTitle       = $('emptyTitle');
const emptyDesc        = $('emptyDesc');
const btnEmptyCta      = $('btnEmptyCta');
const resultsInfo      = $('resultsInfo');
const resultsCount     = $('resultsCount');
const paginationWrap   = $('paginationWrap');
const paginationInfo   = $('paginationInfo');
const paginationList   = $('paginationList');
const bulkBar          = $('bulkBar');
const bulkCount        = $('bulkCount');
const btnUpload        = $('btnUpload');
const btnManageTags    = $('btnManageTags');
// Preview
const previewBackdrop  = $('previewBackdrop');
const previewDrawer    = $('previewDrawer');
const previewTitle     = $('previewTitle');
const previewViewport  = $('previewViewport');
const previewLoading   = $('previewLoading');
const previewDetail    = $('previewDetail');
const previewPosition  = $('previewPosition');
const previewPrev      = $('previewPrev');
const previewNext      = $('previewNext');
const previewZoomControls = $('previewZoomControls');
const zoomIn           = $('zoomIn');
const zoomOut          = $('zoomOut');
const zoomFit          = $('zoomFit');
const previewClose     = $('previewClose');
const previewDownloadBtn = $('previewDownloadBtn');
const previewEditBtn   = $('previewEditBtn');
// Upload
const uploadDropZone   = $('uploadDropZone');
const uploadFileInput  = $('uploadFileInput');
const uploadFilePreview= $('uploadFilePreview');
const uploadThumbWrap  = $('uploadThumbWrap');
const uploadFileName   = $('uploadFileName');
const uploadFileSize   = $('uploadFileSize');
const btnRemoveFile    = $('btnRemoveFile');
const uploadProgress   = $('uploadProgress');
const uploadProgressBar= $('uploadProgressBar');
const btnSubmitUpload  = $('btnSubmitUpload');
const uploadTagsWrap   = $('uploadTagsWrap');
const uploadTagIds     = $('uploadTagIds');
// Edit
const editOffcanvas    = $('editOffcanvas');
const editReceiptId    = $('editReceiptId');
const editTitle        = $('editTitle');
const editMerchant     = $('editMerchant');
const editDate         = $('editDate');
const editAmount       = $('editAmount');
const editCurrency     = $('editCurrency');
const editDescription  = $('editDescription');
const editNotes        = $('editNotes');
const editTagsWrap     = $('editTagsWrap');
const editTagIdsInput  = $('editTagIds');
const editTxId         = $('editTxId');
const btnLinkTx        = $('btnLinkTx');
const btnUnlinkTx      = $('btnUnlinkTx');
const editTxBadge      = $('editTxBadge');
const editTxBadgeText  = $('editTxBadgeText');
const btnSaveEdit      = $('btnSaveEdit');
// Tags
const tagsList         = $('tagsList');
const newTagName       = $('newTagName');
const newTagColor      = $('newTagColor');
const btnCreateTag     = $('btnCreateTag');
// Delete
const btnConfirmDelete = $('btnConfirmDelete');
// Tag picker
const tagPickerDropdown = $('tagPickerDropdown');
const tagPickerSearch  = $('tagPickerSearch');
const tagPickerList    = $('tagPickerList');
// Select all
const selectAll        = $('selectAll');
// Bulk
const bulkDownload     = $('bulkDownload');
const bulkArchive      = $('bulkArchive');
const bulkRestore      = $('bulkRestore');
const bulkDelete       = $('bulkDelete');
const bulkClear        = $('bulkClear');

/* ── Bootstrap modal/offcanvas instances ─────────────────────────────────── */
let _uploadModal, _tagsModal, _deleteModal, _editOC;

/* ==========================================================================
   Initialization
   ========================================================================== */
async function init() {
  await initI18n();
  await guardPage();
  await initLayout();

  _uploadModal = new bootstrap.Modal($('uploadModal'));
  _tagsModal   = new bootstrap.Modal($('tagsModal'));
  _deleteModal = new bootstrap.Modal($('deleteModal'));
  _editOC      = new bootstrap.Offcanvas(editOffcanvas);

  _applyViewMode(_s.view);
  _wireEvents();

  await Promise.all([_loadDashboard(), _loadTags()]);
  await _runSearch();
}

/* ==========================================================================
   Dashboard / KPI
   ========================================================================== */
async function _loadDashboard() {
  try {
    const data = await ReceiptService.getDashboard();
    const s = data.summary;
    kpiTotal.textContent   = s.totalCount;
    kpiActive.textContent  = s.activeCount;
    kpiOcrDone.textContent = s.ocrProcessedCount;
    kpiLinked.textContent  = s.linkedToTransactionCount;
    kpiSkeletons.classList.add('d-none');
    kpiStrip.classList.remove('d-none');
  } catch {
    kpiSkeletons.classList.add('d-none');
    kpiStrip.classList.remove('d-none');
    [kpiTotal, kpiActive, kpiOcrDone, kpiLinked].forEach(el => { el.textContent = '—'; });
  }
}

/* ==========================================================================
   Tags
   ========================================================================== */
async function _loadTags() {
  try {
    _s.allTags = await ReceiptService.getTags() || [];
    _populateTagFilter();
    _renderTagsModal();
  } catch { _s.allTags = []; }
}

function _populateTagFilter() {
  const existing = Array.from(filterTag.querySelectorAll('option[data-tag]'));
  existing.forEach(o => o.remove());
  _s.allTags.forEach(tag => {
    const o = document.createElement('option');
    o.value = tag.tagId;
    o.textContent = tag.name;
    o.dataset.tag = '1';
    filterTag.appendChild(o);
  });
}

function _renderTagsModal() {
  if (!_s.allTags.length) {
    tagsList.innerHTML = `<span class="text-muted" style="font-size:var(--mm-text-sm)" data-i18n="receipts.tags_empty">${t('receipts.tags_empty')}</span>`;
    return;
  }
  tagsList.innerHTML = _s.allTags.map(tag => {
    const bg    = tag.colorHex ? `${tag.colorHex}22` : 'rgba(37,99,235,.1)';
    const color = tag.colorHex || 'var(--mm-primary)';
    return `
      <div class="d-flex align-items-center justify-content-between gap-2 py-1">
        <span class="receipt-tag-chip" style="--chip-bg:${bg};--chip-color:${color}">
          ${_esc(tag.name)}
        </span>
        <span class="text-muted" style="font-size:var(--mm-text-xs)">${t('receipts.tags_usage', { n: tag.usageCount })}</span>
        <button class="btn btn-sm btn-link text-danger p-0" data-delete-tag="${tag.tagId}" aria-label="Delete tag">
          <i class="bi bi-trash" aria-hidden="true"></i>
        </button>
      </div>`;
  }).join('');
}

/* ==========================================================================
   Search & Filter
   ========================================================================== */
async function _runSearch(resetPage = false) {
  if (resetPage) _s.page = 1;

  gallerySkeletons.classList.remove('d-none');
  galleryView.classList.add('d-none');
  tableView.classList.add('d-none');
  listView.classList.add('d-none');
  emptyState.classList.add('d-none');
  resultsInfo.classList.add('d-none');
  paginationWrap.classList.add('d-none');

  const params = {
    pageNumber: _s.page,
    pageSize:   _s.pageSize,
  };
  if (_s.keyword)   params.keyword   = _s.keyword;
  if (_s.statusId)  params.statusId  = Number(_s.statusId);
  if (_s.dateFrom)  params.dateFrom  = _s.dateFrom;
  if (_s.dateTo)    params.dateTo    = _s.dateTo;
  if (_s.amountMin) params.amountMin = parseFloat(_s.amountMin);
  if (_s.amountMax) params.amountMax = parseFloat(_s.amountMax);
  if (_s.tagId)     params.tagId     = Number(_s.tagId);

  try {
    const result = await ReceiptService.search(params);
    _s.totalCount   = result.totalCount  || 0;
    _s.allReceipts  = result.items       || [];
    gallerySkeletons.classList.add('d-none');

    if (!_s.allReceipts.length) {
      _showEmpty();
    } else {
      _renderCurrentView();
      _renderPagination();
      resultsInfo.classList.remove('d-none');
      resultsCount.textContent = t('receipts.stat_total') + ': ' + _s.totalCount;
    }
  } catch {
    gallerySkeletons.classList.add('d-none');
    _showEmpty(true);
  }

  _updateFilterBadge();
}

function _showEmpty(isError = false) {
  const hasFilters = _s.keyword || _s.statusId || _s.dateFrom || _s.dateTo || _s.tagId;
  emptyTitle.dataset.i18n = hasFilters ? 'receipts.empty_filtered_title' : 'receipts.empty_title';
  emptyDesc.dataset.i18n  = hasFilters ? 'receipts.empty_filtered_desc'  : 'receipts.empty_desc';
  btnEmptyCta.dataset.i18n = hasFilters ? 'receipts.empty_filtered_cta'  : 'receipts.empty_cta';
  emptyTitle.textContent  = t(emptyTitle.dataset.i18n);
  emptyDesc.textContent   = t(emptyDesc.dataset.i18n);
  btnEmptyCta.textContent = t(btnEmptyCta.dataset.i18n);
  emptyState.classList.remove('d-none');
}

/* ==========================================================================
   Rendering
   ========================================================================== */
function _renderCurrentView() {
  galleryView.classList.add('d-none');
  tableView.classList.add('d-none');
  listView.classList.add('d-none');

  if (_s.view === 'gallery') {
    _renderGallery();
    galleryView.classList.remove('d-none');
  } else if (_s.view === 'table') {
    _renderTable();
    tableView.classList.remove('d-none');
  } else {
    _renderList();
    listView.classList.remove('d-none');
  }
}

// ── Gallery ──
function _renderGallery() {
  galleryView.innerHTML = _s.allReceipts.map((r, i) => _galleryCardHtml(r, i)).join('');
  galleryView.querySelectorAll('.receipt-card').forEach((card, i) => {
    card.addEventListener('click', e => {
      if (e.target.closest('.receipt-card-check')) { _toggleSelect(i); return; }
      if (e.target.closest('.receipt-card-action-btn')) return;
      _openPreview(i);
    });
    card.querySelector('[data-preview]')?.addEventListener('click', () => _openPreview(i));
    card.querySelector('[data-edit]')?.addEventListener('click', () => _openEdit(_s.allReceipts[i].receiptId));
    card.querySelector('[data-download]')?.addEventListener('click', () => _downloadReceipt(_s.allReceipts[i].receiptId, _s.allReceipts[i].originalFileName));
    card.querySelector('[data-archive]')?.addEventListener('click', () => _archiveReceipt(_s.allReceipts[i].receiptId));
    card.querySelector('[data-restore]')?.addEventListener('click', () => _restoreReceipt(_s.allReceipts[i].receiptId));
    card.querySelector('[data-delete]')?.addEventListener('click', () => _confirmDelete(_s.allReceipts[i].receiptId));
    card.querySelector('.receipt-card-check')?.addEventListener('click', e => { e.stopPropagation(); _toggleSelect(i); });
  });
}

function _galleryCardHtml(r, i) {
  const isSelected = _s.selected.has(r.receiptId);
  const thumb = r.thumbnailUrl || r.fileUrl;
  const isImg = _isImageType(r.originalFileName);
  const thumbHtml = isImg
    ? `<img src="${_esc(thumb)}" alt="${_esc(r.originalFileName)}" loading="lazy" class="receipt-card-thumb-img" style="width:100%;height:100%;object-fit:cover;transition:transform .3s ease">`
    : `<div class="receipt-card-thumb-icon">${_fileIcon(r.originalFileName)}</div>`;

  const archiveBtn = r.statusId === STATUS.ACTIVE
    ? `<button class="receipt-card-action-btn" data-archive title="${_esc(t('receipts.action_archive'))}"><i class="bi bi-archive" aria-hidden="true"></i></button>`
    : r.statusId === STATUS.ARCHIVED
    ? `<button class="receipt-card-action-btn" data-restore title="${_esc(t('receipts.action_restore'))}"><i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i></button>`
    : '';

  const tags = (r.tagCount > 0) ? `<span class="receipt-tag-chip" style="font-size:.6rem">+${r.tagCount}</span>` : '';

  return `
    <div class="receipt-card receipt-card-animated${isSelected ? ' selected' : ''}" data-id="${r.receiptId}" role="button" tabindex="0" aria-label="${_esc(r.merchantName || r.originalFileName)}">
      <div class="receipt-card-thumb">
        ${thumbHtml}
        <span class="receipt-card-check" role="checkbox" aria-checked="${isSelected}" aria-label="Select">
          <i class="bi bi-check-lg" aria-hidden="true"></i>
        </span>
        <span class="receipt-card-ocr-badge">${_ocrBadgeHtml(r.processingStatusId)}</span>
        <div class="receipt-card-actions" aria-label="Quick actions">
          <button class="receipt-card-action-btn" data-preview title="${_esc(t('receipts.action_preview'))}"><i class="bi bi-eye" aria-hidden="true"></i></button>
          <button class="receipt-card-action-btn" data-edit title="${_esc(t('receipts.action_edit'))}"><i class="bi bi-pencil" aria-hidden="true"></i></button>
          <button class="receipt-card-action-btn" data-download title="${_esc(t('receipts.action_download'))}"><i class="bi bi-download" aria-hidden="true"></i></button>
          ${archiveBtn}
          <button class="receipt-card-action-btn" data-delete title="${_esc(t('receipts.action_delete'))}" style="color:var(--mm-danger)"><i class="bi bi-trash" aria-hidden="true"></i></button>
        </div>
      </div>
      <div class="receipt-card-body">
        <div class="receipt-card-merchant">${_esc(r.merchantName || r.title || r.originalFileName)}</div>
        <div class="receipt-card-meta">
          ${r.amount != null ? `<span class="receipt-card-amount">${_formatAmount(r.amount, r.currencyCode)}</span>` : '<span></span>'}
          <span class="receipt-card-date">${_formatDate(r.receiptDate || r.createdOnUtc)}</span>
        </div>
        <div class="receipt-card-tags">${tags}</div>
      </div>
    </div>`;
}

// ── Table ──
function _renderTable() {
  if (selectAll) selectAll.checked = false;
  tableBody.innerHTML = _s.allReceipts.map((r, i) => _tableRowHtml(r, i)).join('');
  tableBody.querySelectorAll('tr').forEach((row, i) => {
    row.querySelector('.row-check')?.addEventListener('change', () => _toggleSelect(i));
    row.querySelector('[data-preview]')?.addEventListener('click', () => _openPreview(i));
    row.querySelector('[data-edit]')?.addEventListener('click', () => _openEdit(_s.allReceipts[i].receiptId));
    row.querySelector('[data-delete]')?.addEventListener('click', () => _confirmDelete(_s.allReceipts[i].receiptId));
    row.addEventListener('click', e => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      _openPreview(i);
    });
  });
}

function _tableRowHtml(r, i) {
  const isSelected = _s.selected.has(r.receiptId);
  const isImg = _isImageType(r.originalFileName);
  const thumbHtml = isImg
    ? `<img src="${_esc(r.thumbnailUrl || r.fileUrl)}" alt="" loading="lazy" class="receipt-table-thumb">`
    : `<span class="receipt-table-icon">${_fileIcon(r.originalFileName)}</span>`;

  return `
    <tr class="${isSelected ? 'selected' : ''}" data-id="${r.receiptId}">
      <td><input type="checkbox" class="form-check-input row-check" ${isSelected ? 'checked' : ''} aria-label="Select receipt"></td>
      <td>${thumbHtml}</td>
      <td>
        <div style="font-weight:600;font-size:var(--mm-text-sm)">${_esc(r.merchantName || '—')}</div>
        <div class="text-muted" style="font-size:var(--mm-text-xs)">${_esc(r.title || r.originalFileName)}</div>
      </td>
      <td style="font-weight:700;color:var(--mm-danger);white-space:nowrap">
        ${r.amount != null ? _formatAmount(r.amount, r.currencyCode) : '—'}
      </td>
      <td style="white-space:nowrap;color:var(--mm-muted);font-size:var(--mm-text-xs)">
        ${_formatDate(r.receiptDate || r.createdOnUtc)}
      </td>
      <td>${_ocrBadgeHtml(r.processingStatusId)}</td>
      <td>${_statusBadgeHtml(r.statusId)}</td>
      <td>${r.tagCount > 0 ? `<span class="receipt-tag-chip">×${r.tagCount}</span>` : '—'}</td>
      <td>
        <div class="d-flex gap-1">
          <button class="btn btn-sm btn-outline-secondary p-1" data-preview style="width:28px;height:28px" aria-label="${_esc(t('receipts.action_preview'))}">
            <i class="bi bi-eye" aria-hidden="true"></i>
          </button>
          <button class="btn btn-sm btn-outline-secondary p-1" data-edit style="width:28px;height:28px" aria-label="${_esc(t('receipts.action_edit'))}">
            <i class="bi bi-pencil" aria-hidden="true"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger p-1" data-delete style="width:28px;height:28px" aria-label="${_esc(t('receipts.action_delete'))}">
            <i class="bi bi-trash" aria-hidden="true"></i>
          </button>
        </div>
      </td>
    </tr>`;
}

// ── List ──
function _renderList() {
  listView.innerHTML = _s.allReceipts.map((r, i) => _listItemHtml(r, i)).join('');
  listView.querySelectorAll('.receipt-list-item').forEach((item, i) => {
    item.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      _openPreview(i);
    });
    item.querySelector('[data-edit]')?.addEventListener('click', () => _openEdit(_s.allReceipts[i].receiptId));
    item.querySelector('[data-delete]')?.addEventListener('click', () => _confirmDelete(_s.allReceipts[i].receiptId));
  });
}

function _listItemHtml(r, i) {
  const isImg = _isImageType(r.originalFileName);
  const thumbHtml = isImg
    ? `<img src="${_esc(r.thumbnailUrl || r.fileUrl)}" alt="" loading="lazy" class="receipt-list-thumb">`
    : `<span class="receipt-list-icon">${_fileIcon(r.originalFileName)}</span>`;

  return `
    <div class="receipt-list-item${_s.selected.has(r.receiptId) ? ' selected' : ''}" data-id="${r.receiptId}" role="button" tabindex="0">
      ${thumbHtml}
      <div class="receipt-list-info">
        <div class="receipt-list-merchant">${_esc(r.merchantName || r.title || r.originalFileName)}</div>
        <div class="receipt-list-sub d-flex align-items-center gap-2">
          ${_ocrBadgeHtml(r.processingStatusId)}
          <span>${_formatDate(r.receiptDate || r.createdOnUtc)}</span>
        </div>
      </div>
      <div class="receipt-list-right">
        <span class="receipt-list-amount">${r.amount != null ? _formatAmount(r.amount, r.currencyCode) : '—'}</span>
        ${_statusBadgeHtml(r.statusId)}
      </div>
      <div class="d-flex gap-1 ms-2">
        <button class="btn btn-sm btn-outline-secondary p-1" data-edit style="width:28px;height:28px" aria-label="${_esc(t('receipts.action_edit'))}">
          <i class="bi bi-pencil" aria-hidden="true"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger p-1" data-delete style="width:28px;height:28px" aria-label="${_esc(t('receipts.action_delete'))}">
          <i class="bi bi-trash" aria-hidden="true"></i>
        </button>
      </div>
    </div>`;
}

/* ==========================================================================
   Pagination
   ========================================================================== */
function _renderPagination() {
  const totalPages = Math.ceil(_s.totalCount / _s.pageSize);
  if (totalPages <= 1) { paginationWrap.classList.add('d-none'); return; }

  const start = (_s.page - 1) * _s.pageSize + 1;
  const end   = Math.min(_s.page * _s.pageSize, _s.totalCount);
  paginationInfo.textContent = `${start}–${end} / ${_s.totalCount}`;

  const pages = _buildPageRange(_s.page, totalPages);
  paginationList.innerHTML = [
    `<li class="page-item${_s.page === 1 ? ' disabled' : ''}">
       <button class="page-link" data-page="${_s.page - 1}" aria-label="Previous">‹</button>
     </li>`,
    ...pages.map(p => p === '…'
      ? `<li class="page-item disabled"><span class="page-link">…</span></li>`
      : `<li class="page-item${p === _s.page ? ' active' : ''}">
           <button class="page-link" data-page="${p}">${p}</button>
         </li>`),
    `<li class="page-item${_s.page === totalPages ? ' disabled' : ''}">
       <button class="page-link" data-page="${_s.page + 1}" aria-label="Next">›</button>
     </li>`,
  ].join('');

  paginationList.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      _s.page = Number(btn.dataset.page);
      _runSearch();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  paginationWrap.classList.remove('d-none');
}

function _buildPageRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total];
  if (current >= total - 3) return [1, '…', total-4, total-3, total-2, total-1, total];
  return [1, '…', current-1, current, current+1, '…', total];
}

/* ==========================================================================
   Preview Drawer
   ========================================================================== */
function _openPreview(index) {
  _s.previewIndex = index;
  _s.previewZoom  = 1.0;
  _renderPreview();
  previewDrawer.classList.add('open');
  previewBackdrop.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function _closePreview() {
  previewDrawer.classList.remove('open');
  previewBackdrop.classList.remove('show');
  document.body.style.overflow = '';
  _s.previewIndex = -1;
}

async function _renderPreview() {
  const r = _s.allReceipts[_s.previewIndex];
  if (!r) return;

  // Navigation state
  previewPosition.textContent = `${_s.previewIndex + 1} ${t('receipts.preview_of')} ${_s.allReceipts.length}`;
  previewPrev.disabled = _s.previewIndex === 0;
  previewNext.disabled = _s.previewIndex === _s.allReceipts.length - 1;
  previewTitle.textContent = r.merchantName || r.title || r.originalFileName;

  // Viewport content
  previewLoading.style.display = 'flex';
  previewZoomControls.style.setProperty('display', 'none', 'important');
  previewViewport.querySelectorAll('img.preview-image, iframe.preview-pdf, .preview-no-support').forEach(el => el.remove());

  const isImg = _isImageType(r.originalFileName) || IMAGE_TYPES.includes(r.contentType || '');
  const isPdf = r.originalFileName?.toLowerCase().endsWith('.pdf') || r.contentType === 'application/pdf';

  if (isImg) {
    const img = document.createElement('img');
    img.className = 'preview-image';
    img.alt = r.originalFileName || '';
    img.style.transform = `scale(${_s.previewZoom})`;
    img.onload  = () => { previewLoading.style.display = 'none'; previewZoomControls.style.removeProperty('display'); };
    img.onerror = () => { previewLoading.style.display = 'none'; _showNoPreview(); };
    img.src = r.fileUrl;
    previewViewport.insertBefore(img, previewZoomControls);
  } else if (isPdf) {
    const frame = document.createElement('iframe');
    frame.className = 'preview-pdf';
    frame.title = r.originalFileName || 'PDF';
    frame.onload  = () => { previewLoading.style.display = 'none'; };
    frame.onerror = () => { previewLoading.style.display = 'none'; _showNoPreview(); };
    frame.src = r.fileUrl;
    previewViewport.insertBefore(frame, previewZoomControls);
  } else {
    previewLoading.style.display = 'none';
    _showNoPreview();
  }

  // Fetch full detail for the metadata panel
  try {
    const detail = await ReceiptService.getById(r.receiptId);
    _renderPreviewDetail(detail);
  } catch {
    _renderPreviewDetail(r);
  }
}

function _showNoPreview() {
  const el = document.createElement('div');
  el.className = 'preview-no-support';
  el.innerHTML = `<i class="bi bi-file-earmark-x" aria-hidden="true"></i>
    <span>${t('receipts.preview_no_preview')}</span>`;
  previewViewport.insertBefore(el, previewZoomControls);
}

function _renderPreviewDetail(r) {
  const tags = r.tags?.map(tag => _tagChipHtml(tag)).join('') || '—';
  const txHtml = r.transactionId
    ? `<a href="/pages/transactions/index.html?id=${r.transactionId}" class="btn btn-xs btn-outline-primary" style="font-size:var(--mm-text-xs);padding:.15rem .5rem" target="_blank">
         <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i> #${r.transactionId}
       </a>`
    : `<span class="text-muted">${t('receipts.detail_no_transaction')}</span>`;

  previewDetail.innerHTML = `
    <div class="preview-detail-grid">
      <div class="preview-detail-item">
        <span class="preview-detail-label">${t('receipts.detail_merchant')}</span>
        <span class="preview-detail-value">${_esc(r.merchantName || t('receipts.detail_no_merchant'))}</span>
      </div>
      <div class="preview-detail-item">
        <span class="preview-detail-label">${t('receipts.detail_amount')}</span>
        <span class="preview-detail-value">${r.amount != null ? _formatAmount(r.amount, r.currencyCode) : t('receipts.detail_no_amount')}</span>
      </div>
      <div class="preview-detail-item">
        <span class="preview-detail-label">${t('receipts.detail_date')}</span>
        <span class="preview-detail-value">${_formatDate(r.receiptDate) || t('receipts.detail_no_date')}</span>
      </div>
      <div class="preview-detail-item">
        <span class="preview-detail-label">${t('receipts.detail_uploaded')}</span>
        <span class="preview-detail-value">${_formatDate(r.createdOnUtc)}</span>
      </div>
      <div class="preview-detail-item">
        <span class="preview-detail-label">${t('receipts.detail_ocr_status')}</span>
        <span class="preview-detail-value">${_ocrBadgeHtml(r.processingStatusId)}</span>
      </div>
      <div class="preview-detail-item">
        <span class="preview-detail-label">${t('receipts.detail_status')}</span>
        <span class="preview-detail-value">${_statusBadgeHtml(r.statusId)}</span>
      </div>
      ${r.fileSizeBytes ? `<div class="preview-detail-item">
        <span class="preview-detail-label">${t('receipts.detail_file_size')}</span>
        <span class="preview-detail-value">${_formatSize(r.fileSizeBytes)}</span>
      </div>` : ''}
      <div class="preview-detail-item">
        <span class="preview-detail-label">${t('receipts.detail_transaction')}</span>
        <span class="preview-detail-value">${txHtml}</span>
      </div>
      <div class="preview-detail-item" style="grid-column:1/-1">
        <span class="preview-detail-label">${t('receipts.detail_tags')}</span>
        <div style="display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.2rem">${tags}</div>
      </div>
      ${r.notes ? `<div class="preview-detail-item" style="grid-column:1/-1">
        <span class="preview-detail-label">${t('receipts.detail_notes')}</span>
        <span class="preview-detail-value">${_esc(r.notes)}</span>
      </div>` : ''}
    </div>
    <div class="preview-detail-actions">
      <button class="btn btn-sm btn-outline-secondary" id="detailEditBtn">
        <i class="bi bi-pencil" aria-hidden="true"></i> ${t('receipts.action_edit')}
      </button>
      ${r.statusId === STATUS.ACTIVE
        ? `<button class="btn btn-sm btn-outline-secondary" id="detailArchiveBtn"><i class="bi bi-archive" aria-hidden="true"></i> ${t('receipts.action_archive')}</button>`
        : r.statusId === STATUS.ARCHIVED
        ? `<button class="btn btn-sm btn-outline-secondary" id="detailRestoreBtn"><i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i> ${t('receipts.action_restore')}</button>`
        : ''}
      <button class="btn btn-sm btn-outline-danger" id="detailDeleteBtn">
        <i class="bi bi-trash" aria-hidden="true"></i> ${t('receipts.action_delete')}
      </button>
    </div>`;

  $('detailEditBtn')?.addEventListener('click', () => _openEdit(r.receiptId));
  $('detailArchiveBtn')?.addEventListener('click', () => _archiveReceipt(r.receiptId));
  $('detailRestoreBtn')?.addEventListener('click', () => _restoreReceipt(r.receiptId));
  $('detailDeleteBtn')?.addEventListener('click', () => _confirmDelete(r.receiptId));
}

/* ==========================================================================
   Upload
   ========================================================================== */
function _openUploadModal() {
  _clearUploadForm();
  _uploadModal.show();
}

function _clearUploadForm() {
  _s.uploadFile = null;
  _s.uploadTagIds = [];
  uploadFileInput.value = '';
  uploadFilePreview.classList.add('d-none');
  uploadProgress.classList.add('d-none');
  uploadProgressBar.style.width = '0%';
  btnSubmitUpload.disabled = true;
  ['uploadTitle','uploadMerchant','uploadDate','uploadAmount','uploadDescription','uploadNotes'].forEach(id => {
    const el = $(id); if (el) el.value = '';
  });
  const cur = $('uploadCurrency'); if (cur) cur.value = 'SAR';
  _s.uploadTagIds = [];
  _renderTagWrap(uploadTagsWrap, _s.uploadTagIds);
  uploadTagIds.value = '[]';
}

function _handleFileSelect(file) {
  if (!file) return;
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) { showError(t('receipts.upload_accepted_formats')); return; }

  _s.uploadFile = file;
  uploadFileName.textContent = file.name;
  uploadFileSize.textContent = _formatSize(file.size);

  uploadThumbWrap.innerHTML = '';
  if (file.type.startsWith('image/')) {
    const img = document.createElement('img');
    img.className = 'upload-file-thumb';
    img.src = URL.createObjectURL(file);
    img.onload = () => URL.revokeObjectURL(img.src);
    uploadThumbWrap.appendChild(img);
  } else {
    uploadThumbWrap.innerHTML = `<span class="upload-file-icon">${_fileIcon(file.name)}</span>`;
  }

  uploadFilePreview.classList.remove('d-none');
  uploadDropZone.classList.add('d-none');
  btnSubmitUpload.disabled = false;
}

async function _submitUpload() {
  if (!_s.uploadFile) return;

  const fd = new FormData();
  fd.append('File', _s.uploadFile);

  const title   = $('uploadTitle')?.value.trim();
  const merchant= $('uploadMerchant')?.value.trim();
  const date    = $('uploadDate')?.value;
  const amount  = $('uploadAmount')?.value;
  const currency= $('uploadCurrency')?.value.trim();
  const desc    = $('uploadDescription')?.value.trim();
  const notes   = $('uploadNotes')?.value.trim();

  if (title)    fd.append('Title', title);
  if (merchant) fd.append('MerchantName', merchant);
  if (date)     fd.append('ReceiptDate', date);
  if (amount)   fd.append('Amount', amount);
  if (currency) fd.append('CurrencyCode', currency);
  if (desc)     fd.append('Description', desc);
  if (notes)    fd.append('Notes', notes);
  if (_s.uploadTagIds.length) fd.append('TagIds', JSON.stringify(_s.uploadTagIds));

  uploadProgress.classList.remove('d-none');
  uploadProgressBar.style.transition = 'width 2s ease';
  uploadProgressBar.style.width = '85%';
  btnSubmitUpload.disabled = true;

  try {
    await ReceiptService.upload(fd);
    uploadProgressBar.style.transition = 'width .3s ease';
    uploadProgressBar.style.width = '100%';
    setTimeout(() => {
      _uploadModal.hide();
      _clearUploadForm();
      showSuccess(t('receipts.upload_success'));
      _loadDashboard();
      _runSearch(true);
    }, 400);
  } catch (err) {
    uploadProgressBar.style.width = '0%';
    uploadProgress.classList.add('d-none');
    btnSubmitUpload.disabled = false;
    const msg = err instanceof ApiError ? err.message : t('errors.server');
    if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('تكرار')) {
      showError(t('receipts.upload_duplicate'));
    } else {
      showError(msg);
    }
  }
}

/* ==========================================================================
   Edit Offcanvas
   ========================================================================== */
async function _openEdit(receiptId) {
  editReceiptId.value = receiptId;
  _s.editTagIds = [];
  _s.editCurrentTxId = null;

  try {
    const r = await ReceiptService.getById(receiptId);
    editTitle.value       = r.title        || '';
    editMerchant.value    = r.merchantName  || '';
    editDate.value        = r.receiptDate?.substring(0, 10) || '';
    editAmount.value      = r.amount != null ? r.amount : '';
    editCurrency.value    = r.currencyCode  || 'SAR';
    editDescription.value = r.description   || '';
    editNotes.value       = r.notes         || '';

    _s.editTagIds     = (r.tags || []).map(t => t.tagId);
    _s.editCurrentTxId = r.transactionId || null;
    editTxId.value    = _s.editCurrentTxId || '';

    _renderTagWrap(editTagsWrap, _s.editTagIds);
    _updateEditTxBadge();
  } catch {
    showError(t('errors.server'));
    return;
  }

  _editOC.show();
}

async function _saveEdit() {
  const rid = Number(editReceiptId.value);
  if (!rid) return;

  const payload = {
    receiptId:    rid,
    title:        editTitle.value.trim()       || null,
    merchantName: editMerchant.value.trim()     || null,
    receiptDate:  editDate.value               || null,
    amount:       editAmount.value ? parseFloat(editAmount.value) : null,
    currencyCode: editCurrency.value.trim()     || null,
    description:  editDescription.value.trim() || null,
    notes:        editNotes.value.trim()        || null,
    tagIds:       JSON.stringify(_s.editTagIds),
  };

  const origText = btnSaveEdit.innerHTML;
  btnSaveEdit.disabled = true;
  btnSaveEdit.innerHTML = `<span class="spinner-border spinner-border-sm" role="status"></span>`;

  try {
    await ReceiptService.update(payload);
    showSuccess(t('receipts.edit_success'));
    _editOC.hide();
    _loadDashboard();
    _runSearch();
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : t('errors.server');
    showError(msg);
  } finally {
    btnSaveEdit.disabled = false;
    btnSaveEdit.innerHTML = origText;
  }
}

function _updateEditTxBadge() {
  if (_s.editCurrentTxId) {
    editTxBadge.classList.remove('d-none');
    editTxBadgeText.textContent = `#${_s.editCurrentTxId}`;
    btnLinkTx.classList.add('d-none');
    btnUnlinkTx.classList.remove('d-none');
  } else {
    editTxBadge.classList.add('d-none');
    btnLinkTx.classList.remove('d-none');
    btnUnlinkTx.classList.add('d-none');
  }
}

async function _linkTransaction() {
  const rid = Number(editReceiptId.value);
  const txId = parseInt(editTxId.value, 10);
  if (!rid || !txId) return;
  try {
    await ReceiptService.assignTransaction(rid, txId);
    _s.editCurrentTxId = txId;
    _updateEditTxBadge();
    showSuccess(t('receipts.tx_link_success'));
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : t('receipts.tx_not_found');
    showError(msg);
  }
}

async function _unlinkTransaction() {
  const rid = Number(editReceiptId.value);
  if (!rid) return;
  try {
    await ReceiptService.assignTransaction(rid, null);
    _s.editCurrentTxId = null;
    editTxId.value = '';
    _updateEditTxBadge();
    showSuccess(t('receipts.tx_unlink_success'));
  } catch { showError(t('errors.server')); }
}

/* ==========================================================================
   Delete / Archive / Restore
   ========================================================================== */
function _confirmDelete(receiptId) {
  _s.pendingDeleteId = receiptId;
  _deleteModal.show();
}

async function _doDelete() {
  if (!_s.pendingDeleteId) return;
  btnConfirmDelete.disabled = true;
  try {
    await ReceiptService.remove(_s.pendingDeleteId);
    showSuccess(t('receipts.delete_success'));
    _deleteModal.hide();
    if (_s.previewIndex >= 0) _closePreview();
    _loadDashboard();
    _runSearch();
  } catch (err) {
    showError(err instanceof ApiError ? err.message : t('errors.server'));
  } finally {
    btnConfirmDelete.disabled = false;
    _s.pendingDeleteId = null;
  }
}

async function _archiveReceipt(receiptId) {
  try {
    await ReceiptService.archive(receiptId);
    showSuccess(t('receipts.archive_success'));
    _loadDashboard(); _runSearch();
  } catch (err) { showError(err instanceof ApiError ? err.message : t('errors.server')); }
}

async function _restoreReceipt(receiptId) {
  try {
    await ReceiptService.restore(receiptId);
    showSuccess(t('receipts.restore_success'));
    _loadDashboard(); _runSearch();
  } catch (err) { showError(err instanceof ApiError ? err.message : t('errors.server')); }
}

/* ==========================================================================
   Download
   ========================================================================== */
async function _downloadReceipt(receiptId, filename) {
  try {
    const { blob, filename: serverName } = await ReceiptService.download(receiptId);
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url;
    a.download = serverName || filename || 'receipt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch { showError(t('errors.server')); }
}

/* ==========================================================================
   Bulk Actions
   ========================================================================== */
function _toggleSelect(index) {
  const r = _s.allReceipts[index];
  if (!r) return;
  if (_s.selected.has(r.receiptId)) {
    _s.selected.delete(r.receiptId);
  } else {
    _s.selected.add(r.receiptId);
  }
  _updateBulkBar();
  _updateSelectionVisual(r.receiptId, _s.selected.has(r.receiptId));
}

function _updateSelectionVisual(receiptId, isSelected) {
  document.querySelectorAll(`[data-id="${receiptId}"]`).forEach(el => {
    el.classList.toggle('selected', isSelected);
    const check = el.querySelector('.receipt-card-check');
    if (check) check.setAttribute('aria-checked', String(isSelected));
    const checkInput = el.querySelector('.row-check');
    if (checkInput) checkInput.checked = isSelected;
  });
}

function _updateBulkBar() {
  const n = _s.selected.size;
  bulkBar.classList.toggle('show', n > 0);
  bulkCount.textContent = t('receipts.bulk_selected', { n });
}

async function _bulkAction(action) {
  const ids = Array.from(_s.selected);
  if (!ids.length) return;

  for (const id of ids) {
    try {
      if (action === 'archive')  await ReceiptService.archive(id);
      if (action === 'restore')  await ReceiptService.restore(id);
      if (action === 'delete')   await ReceiptService.remove(id);
      if (action === 'download') await _downloadReceipt(id, '');
    } catch { /* continue with rest */ }
  }

  _s.selected.clear();
  _updateBulkBar();
  _loadDashboard();
  _runSearch();
}

/* ==========================================================================
   Tag Management
   ========================================================================== */
async function _createTag() {
  const name = newTagName.value.trim();
  if (!name) return;
  const color = newTagColor.value || null;

  btnCreateTag.disabled = true;
  try {
    await ReceiptService.createTag(name, color);
    newTagName.value = '';
    newTagColor.value = '#2563eb';
    showSuccess(t('receipts.tags_created'));
    await _loadTags();
  } catch (err) {
    showError(err instanceof ApiError ? err.message : t('errors.server'));
  } finally {
    btnCreateTag.disabled = false;
  }
}

async function _deleteTag(tagId) {
  if (!confirm(t('receipts.tags_delete_confirm'))) return;
  try {
    await ReceiptService.deleteTag(tagId);
    showSuccess(t('receipts.tags_deleted'));
    await _loadTags();
  } catch (err) {
    showError(err instanceof ApiError ? err.message : t('errors.server'));
  }
}

/* ==========================================================================
   Tag Picker (shared, for upload & edit forms)
   ========================================================================== */
function _openTagPicker(target, anchorEl) {
  _s.tagPickerTarget = target;
  _renderTagPickerList();
  tagPickerSearch.value = '';

  const rect = anchorEl.getBoundingClientRect();
  tagPickerDropdown.style.display = 'block';
  tagPickerDropdown.style.top  = `${rect.bottom + window.scrollY + 4}px`;
  tagPickerDropdown.style.left = `${rect.left + window.scrollX}px`;
  tagPickerDropdown.style.minWidth = `${Math.max(220, rect.width)}px`;
}

function _closeTagPicker() {
  tagPickerDropdown.style.display = 'none';
  _s.tagPickerTarget = null;
}

function _renderTagPickerList(filter = '') {
  const selectedIds = _s.tagPickerTarget === 'upload' ? _s.uploadTagIds : _s.editTagIds;
  const tags = _s.allTags.filter(t => t.name.toLowerCase().includes(filter.toLowerCase()));

  if (!tags.length) {
    tagPickerList.innerHTML = `<div class="px-2 py-1 text-muted" style="font-size:var(--mm-text-xs)">${t('receipts.tags_empty')}</div>`;
    return;
  }

  tagPickerList.innerHTML = tags.map(tag => {
    const isChecked = selectedIds.includes(tag.tagId);
    const bg = tag.colorHex ? `${tag.colorHex}22` : 'rgba(37,99,235,.1)';
    const color = tag.colorHex || 'var(--mm-primary)';
    return `
      <div class="d-flex align-items-center gap-2 px-2 py-1 rounded" style="cursor:pointer" data-pick-tag="${tag.tagId}">
        <input type="checkbox" class="form-check-input m-0" ${isChecked ? 'checked' : ''} aria-hidden="true">
        <span class="receipt-tag-chip" style="--chip-bg:${bg};--chip-color:${color}">${_esc(tag.name)}</span>
      </div>`;
  }).join('');

  tagPickerList.querySelectorAll('[data-pick-tag]').forEach(row => {
    row.addEventListener('click', () => {
      const tagId = Number(row.dataset.pickTag);
      const ids   = _s.tagPickerTarget === 'upload' ? _s.uploadTagIds : _s.editTagIds;
      const idx   = ids.indexOf(tagId);
      if (idx >= 0) ids.splice(idx, 1); else ids.push(tagId);
      _renderTagPickerList(tagPickerSearch.value);
      const wrap = _s.tagPickerTarget === 'upload' ? uploadTagsWrap : editTagsWrap;
      _renderTagWrap(wrap, ids);
      if (_s.tagPickerTarget === 'upload') uploadTagIds.value = JSON.stringify(ids);
      else editTagIdsInput.value = JSON.stringify(ids);
    });
  });
}

function _renderTagWrap(wrapEl, selectedIds) {
  const tags = _s.allTags.filter(t => selectedIds.includes(t.tagId));
  if (!tags.length) {
    wrapEl.innerHTML = `<span class="text-muted" style="font-size:var(--mm-text-xs)">${t('receipts.upload_tags_placeholder')}</span>`;
    return;
  }
  wrapEl.innerHTML = tags.map(tag => {
    const bg = tag.colorHex ? `${tag.colorHex}22` : 'rgba(37,99,235,.1)';
    const color = tag.colorHex || 'var(--mm-primary)';
    return `<span class="receipt-tag-chip" style="--chip-bg:${bg};--chip-color:${color}">
      ${_esc(tag.name)}
      <button class="tag-chip-delete" data-remove-tag="${tag.tagId}" aria-label="Remove tag" type="button">
        <i class="bi bi-x" aria-hidden="true"></i>
      </button>
    </span>`;
  }).join('');

  wrapEl.querySelectorAll('[data-remove-tag]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const tagId = Number(btn.dataset.removeTag);
      const ids   = wrapEl === uploadTagsWrap ? _s.uploadTagIds : _s.editTagIds;
      const idx   = ids.indexOf(tagId);
      if (idx >= 0) ids.splice(idx, 1);
      _renderTagWrap(wrapEl, ids);
      if (wrapEl === uploadTagsWrap) uploadTagIds.value = JSON.stringify(ids);
      else editTagIdsInput.value = JSON.stringify(ids);
    });
  });
}

/* ==========================================================================
   View Mode
   ========================================================================== */
function _applyViewMode(view) {
  _s.view = view;
  _savePref(VIEW_KEY, view);
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
}

/* ==========================================================================
   Filter badge
   ========================================================================== */
function _updateFilterBadge() {
  const count = [_s.keyword, _s.statusId, _s.dateFrom, _s.dateTo, _s.amountMin, _s.amountMax, _s.tagId]
    .filter(Boolean).length;
  filterBadge.textContent = count;
  filterBadge.classList.toggle('d-none', count === 0);
}

/* ==========================================================================
   Event Wiring
   ========================================================================== */
function _wireEvents() {
  // Upload
  btnUpload.addEventListener('click', _openUploadModal);
  btnEmptyCta.addEventListener('click', () => {
    if (_s.keyword || _s.statusId || _s.dateFrom || _s.dateTo || _s.tagId) {
      _resetFilters();
    } else {
      _openUploadModal();
    }
  });

  uploadFileInput.addEventListener('change', e => _handleFileSelect(e.target.files[0]));
  btnRemoveFile.addEventListener('click', () => {
    _s.uploadFile = null;
    uploadFileInput.value = '';
    uploadFilePreview.classList.add('d-none');
    uploadDropZone.classList.remove('d-none');
    btnSubmitUpload.disabled = true;
  });

  uploadDropZone.addEventListener('dragover', e => { e.preventDefault(); uploadDropZone.classList.add('dragover'); });
  uploadDropZone.addEventListener('dragleave', () => uploadDropZone.classList.remove('dragover'));
  uploadDropZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadDropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) { uploadDropZone.classList.add('d-none'); _handleFileSelect(file); }
  });

  btnSubmitUpload.addEventListener('click', _submitUpload);

  // Modal cleanup on close
  $('uploadModal').addEventListener('hidden.bs.modal', _clearUploadForm);

  // Tag pickers
  uploadTagsWrap.addEventListener('click', () => _openTagPicker('upload', uploadTagsWrap));
  editTagsWrap.addEventListener('click',   () => _openTagPicker('edit', editTagsWrap));
  tagPickerSearch.addEventListener('input', e => _renderTagPickerList(e.target.value));
  document.addEventListener('click', e => {
    if (!tagPickerDropdown.contains(e.target) && e.target !== uploadTagsWrap && e.target !== editTagsWrap) {
      _closeTagPicker();
    }
  });

  // Search + filters
  searchInput.addEventListener('input', () => {
    clearTimeout(_s._searchTimer);
    _s._searchTimer = setTimeout(() => {
      _s.keyword = searchInput.value.trim();
      _runSearch(true);
    }, 400);
  });

  filterStatus.addEventListener('change', () => { _s.statusId = filterStatus.value || null; _runSearch(true); });
  filterSort.addEventListener('change', () => _runSearch(true));

  btnToggleFilters.addEventListener('click', () => {
    _s.filtersOpen = !_s.filtersOpen;
    advancedFilters.classList.toggle('show', _s.filtersOpen);
  });

  filterDateFrom.addEventListener('change', () => { _s.dateFrom = filterDateFrom.value || null; _runSearch(true); });
  filterDateTo.addEventListener('change',   () => { _s.dateTo   = filterDateTo.value   || null; _runSearch(true); });
  filterAmountMin.addEventListener('change',() => { _s.amountMin = filterAmountMin.value || null; _runSearch(true); });
  filterAmountMax.addEventListener('change',() => { _s.amountMax = filterAmountMax.value || null; _runSearch(true); });
  filterTag.addEventListener('change',      () => { _s.tagId = filterTag.value ? Number(filterTag.value) : null; _runSearch(true); });
  btnResetFilters.addEventListener('click', _resetFilters);

  // View toggle
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => { _applyViewMode(btn.dataset.view); _renderCurrentView(); });
  });

  // Select all (table view)
  selectAll?.addEventListener('change', () => {
    if (selectAll.checked) {
      _s.allReceipts.forEach(r => _s.selected.add(r.receiptId));
    } else {
      _s.allReceipts.forEach(r => _s.selected.delete(r.receiptId));
    }
    _updateBulkBar();
    _renderCurrentView();
  });

  // Bulk actions
  bulkDownload.addEventListener('click', () => _bulkAction('download'));
  bulkArchive.addEventListener('click',  () => _bulkAction('archive'));
  bulkRestore.addEventListener('click',  () => _bulkAction('restore'));
  bulkDelete.addEventListener('click',   () => {
    if (confirm(t('receipts.delete_confirm_body'))) _bulkAction('delete');
  });
  bulkClear.addEventListener('click', () => {
    _s.selected.clear();
    _updateBulkBar();
    _renderCurrentView();
  });

  // Preview
  previewBackdrop.addEventListener('click', _closePreview);
  previewClose.addEventListener('click',    _closePreview);
  previewPrev.addEventListener('click', () => {
    if (_s.previewIndex > 0) { _s.previewIndex--; _renderPreview(); }
  });
  previewNext.addEventListener('click', () => {
    if (_s.previewIndex < _s.allReceipts.length - 1) { _s.previewIndex++; _renderPreview(); }
  });
  previewDownloadBtn.addEventListener('click', () => {
    const r = _s.allReceipts[_s.previewIndex];
    if (r) _downloadReceipt(r.receiptId, r.originalFileName);
  });
  previewEditBtn.addEventListener('click', () => {
    const r = _s.allReceipts[_s.previewIndex];
    if (r) _openEdit(r.receiptId);
  });

  // Zoom
  zoomIn.addEventListener('click',  () => _setZoom(_s.previewZoom * 1.25));
  zoomOut.addEventListener('click', () => _setZoom(_s.previewZoom / 1.25));
  zoomFit.addEventListener('click', () => _setZoom(1.0));

  // Keyboard navigation in preview
  document.addEventListener('keydown', e => {
    if (!previewDrawer.classList.contains('open')) return;
    if (e.key === 'Escape')      _closePreview();
    if (e.key === 'ArrowLeft')   previewPrev.click();
    if (e.key === 'ArrowRight')  previewNext.click();
    if (e.key === '+' || e.key === '=') _setZoom(_s.previewZoom * 1.25);
    if (e.key === '-')           _setZoom(_s.previewZoom / 1.25);
  });

  // Edit offcanvas
  btnSaveEdit.addEventListener('click', _saveEdit);
  btnLinkTx.addEventListener('click',   _linkTransaction);
  btnUnlinkTx.addEventListener('click', _unlinkTransaction);

  // Delete modal
  btnConfirmDelete.addEventListener('click', _doDelete);

  // Tags modal
  btnManageTags.addEventListener('click', () => _tagsModal.show());
  btnCreateTag.addEventListener('click',  _createTag);
  newTagName.addEventListener('keydown', e => { if (e.key === 'Enter') _createTag(); });
  tagsList.addEventListener('click', e => {
    const btn = e.target.closest('[data-delete-tag]');
    if (btn) _deleteTag(Number(btn.dataset.deleteTag));
  });
}

function _resetFilters() {
  _s.keyword = ''; _s.statusId = null; _s.dateFrom = null; _s.dateTo = null;
  _s.amountMin = null; _s.amountMax = null; _s.tagId = null;
  searchInput.value = ''; filterStatus.value = ''; filterSort.value = 'date_desc';
  filterDateFrom.value = ''; filterDateTo.value = '';
  filterAmountMin.value = ''; filterAmountMax.value = ''; filterTag.value = '';
  _runSearch(true);
}

function _setZoom(z) {
  _s.previewZoom = Math.max(0.25, Math.min(4, z));
  const img = previewViewport.querySelector('img.preview-image');
  if (img) img.style.transform = `scale(${_s.previewZoom})`;
}

/* ==========================================================================
   Helpers
   ========================================================================== */
function _ocrBadgeHtml(statusId) {
  const map = {
    [OCR.PENDING]:    `<span class="ocr-badge ocr-badge-pending"><span class="ocr-dot"></span>${t('receipts.ocr_pending')}</span>`,
    [OCR.PROCESSING]: `<span class="ocr-badge ocr-badge-processing"><i class="bi bi-arrow-repeat ocr-spin" aria-hidden="true"></i>${t('receipts.ocr_processing')}</span>`,
    [OCR.COMPLETED]:  `<span class="ocr-badge ocr-badge-completed"><i class="bi bi-check-circle-fill" aria-hidden="true"></i>${t('receipts.ocr_completed')}</span>`,
    [OCR.FAILED]:     `<span class="ocr-badge ocr-badge-failed"><i class="bi bi-x-circle-fill" aria-hidden="true"></i>${t('receipts.ocr_failed')}</span>`,
    [OCR.SKIPPED]:    `<span class="ocr-badge ocr-badge-skipped"><i class="bi bi-skip-forward" aria-hidden="true"></i>${t('receipts.ocr_skipped')}</span>`,
  };
  return map[statusId] || map[OCR.SKIPPED];
}

function _statusBadgeHtml(statusId) {
  if (statusId === STATUS.ACTIVE)   return `<span class="receipt-status-badge status-active"><i class="bi bi-circle-fill" style="font-size:.4rem" aria-hidden="true"></i>${t('receipts.status_active')}</span>`;
  if (statusId === STATUS.ARCHIVED) return `<span class="receipt-status-badge status-archived"><i class="bi bi-archive" aria-hidden="true"></i>${t('receipts.status_archived')}</span>`;
  return '';
}

function _tagChipHtml(tag) {
  const bg    = tag.colorHex ? `${tag.colorHex}22` : 'rgba(37,99,235,.1)';
  const color = tag.colorHex || 'var(--mm-primary)';
  return `<span class="receipt-tag-chip" style="--chip-bg:${bg};--chip-color:${color}">${_esc(tag.name)}</span>`;
}

function _fileIcon(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  if (ext === 'pdf') return '<i class="bi bi-file-earmark-pdf text-danger" aria-hidden="true"></i>';
  if (['doc','docx'].includes(ext)) return '<i class="bi bi-file-earmark-word text-primary" aria-hidden="true"></i>';
  return '<i class="bi bi-file-earmark-image text-info" aria-hidden="true"></i>';
}

function _isImageType(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  return ['jpg','jpeg','png','gif','webp','heic','heif'].includes(ext);
}

function _formatAmount(amount, currency) {
  if (amount == null) return '—';
  const lang = getLanguage();
  try {
    return new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-US', {
      style:    'currency',
      currency: currency || 'SAR',
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency || ''}`;
  }
}

function _formatDate(isoStr) {
  if (!isoStr) return '—';
  const lang = getLanguage();
  try {
    return new Date(isoStr).toLocaleDateString(
      lang === 'ar' ? 'ar-SA' : 'en-GB',
      { year: 'numeric', month: 'short', day: 'numeric' },
    );
  } catch { return isoStr.substring(0, 10); }
}

function _formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return t('receipts.file_size_kb', { n: (bytes / 1024).toFixed(0) });
  return t('receipts.file_size_mb', { n: (bytes / (1024 * 1024)).toFixed(1) });
}

function _esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _loadPref(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

function _savePref(key, val) {
  try { localStorage.setItem(key, val); } catch { /* ignore */ }
}

/* ==========================================================================
   Boot
   ========================================================================== */
init();
