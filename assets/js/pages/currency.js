/**
 * pages/currency.js — MyMoney
 * Exchange rates page: statistics, currency converter, rate cards, set manual rate.
 */

import { initI18n, t, getLanguage }   from '../core/i18n.js';
import { initLayout }                  from '../components/layout.js';
import { guardPage }                   from '../core/auth.js';
import { initOnboarding }              from '../components/onboarding.js';
import { CurrencyService }             from '../services/currency-service.js';
import { formatAmount, getCurrencyList, currencyFlag } from '../core/currency.js';
import { ApiError }                    from '../core/api.js';
import { showSuccess, showError }      from '../components/toast.js';
import { Loader }                      from '../components/loading.js';

/* --------------------------------------------------------------------------
   State
   -------------------------------------------------------------------------- */
const _s = {
  page:         1,
  pageSize:     12,
  totalCount:   0,
  rateSearch:   '',
  rateFromFilter: '',
  rates:        [],
  currencies:   [],
};

/* --------------------------------------------------------------------------
   DOM refs
   -------------------------------------------------------------------------- */
const $ = id => document.getElementById(id);

const statsSkeletons = $('statsSkeletons');
const statsCards     = $('statsCards');
const statActivePairs= $('statActivePairs');
const statTotalRates = $('statTotalRates');
const statNewestRate = $('statNewestRate');
const statDaysSync   = $('statDaysSync');

const ratesSkeletons  = $('ratesSkeletons');
const ratesGrid       = $('ratesGrid');
const ratesEmpty      = $('ratesEmpty');
const ratesPagination = $('ratesPagination');

const convertAmount    = $('convertAmount');
const convertFrom      = $('convertFrom');
const convertTo        = $('convertTo');
const convertSwapBtn   = $('convertSwapBtn');
const convertBtn       = $('convertBtn');
const convertResult    = $('convertResult');
const convertResultAmt = $('convertResultAmount');
const convertResultRate= $('convertResultRate');
const convertCopyBtn   = $('convertCopyBtn');

const rateSearch     = $('rateSearch');
const rateFromFilter = $('rateFromFilter');
const rateRefreshBtn = $('rateRefreshBtn');
const syncRatesBtn   = $('syncRatesBtn');
const setRateForm    = $('setRateForm');
const rateFromSelect = $('rateFromSelect');
const rateToSelect   = $('rateToSelect');
const rateValueInput = $('rateValueInput');
const rateDateInput  = $('rateDateInput');
const rateHint       = $('rateHint');
const setRateBtn     = $('setRateBtn');

/* --------------------------------------------------------------------------
   Formatters
   -------------------------------------------------------------------------- */
function _lang()     { return getLanguage(); }
function _isAr()     { return _lang() === 'ar'; }

function _fmtDate(str) {
  if (!str) return '—';
  try {
    return new Intl.DateTimeFormat(_isAr() ? 'ar-EG' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    }).format(new Date(str));
  } catch { return str; }
}

function _fmtRate(rate) {
  if (rate === undefined || rate === null) return '—';
  const num = typeof rate === 'string' ? parseFloat(rate) : rate;
  return num.toLocaleString(_isAr() ? 'ar-EG' : 'en-US', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 8,
  });
}

function _sourceClass(sourceTypeId) {
  return sourceTypeId === 2 ? 'rate-source-automatic'
       : sourceTypeId === 3 ? 'rate-source-estimated'
       : 'rate-source-manual';
}

function _sourceLabel(sourceTypeId) {
  return sourceTypeId === 2 ? t('currency.rates_auto')
       : sourceTypeId === 3 ? t('currency.rates_estimated')
       : t('currency.rates_manual');
}

/* --------------------------------------------------------------------------
   Statistics
   -------------------------------------------------------------------------- */
async function _loadStatistics() {
  statsSkeletons.classList.remove('d-none');
  statsCards.classList.add('d-none');
  try {
    const stats = await CurrencyService.getStatistics();
    statActivePairs.textContent = stats.totalActivePairs ?? '—';
    statTotalRates.textContent  = stats.totalActiveRates ?? '—';
    statNewestRate.textContent  = stats.newestRate ? _fmtDate(stats.newestRate) : '—';
    statDaysSync.textContent    = stats.daysSinceLastSync ?? '0';
    statsSkeletons.classList.add('d-none');
    statsCards.classList.remove('d-none');
  } catch {
    statsSkeletons.classList.add('d-none');
  }
}

/* --------------------------------------------------------------------------
   Rate cards
   -------------------------------------------------------------------------- */
function _buildRateCard(rate) {
  const fromFlag = currencyFlag(rate.fromCurrency);
  const toFlag   = currencyFlag(rate.toCurrency);
  const srcCls   = _sourceClass(rate.sourceTypeId);
  const srcLbl   = _sourceLabel(rate.sourceTypeId);

  return `
    <div class="col-sm-6">
      <div class="rate-card">
        <div class="rate-card-pair">
          <div class="rate-card-flags">
            <span class="rate-card-flag">${fromFlag}</span>
            <i class="bi bi-arrow-right rate-card-arrow mx-1" aria-hidden="true"></i>
            <span class="rate-card-flag">${toFlag}</span>
          </div>
          <span class="rate-card-codes">${rate.fromCurrency} → ${rate.toCurrency}</span>
        </div>
        <div class="rate-card-rate">${_fmtRate(rate.rate)}</div>
        <div class="rate-card-inverse">
          1 ${rate.toCurrency} = ${_fmtRate(rate.inverseRate)} ${rate.fromCurrency}
        </div>
        <div class="rate-card-meta">
          <span class="rate-card-meta-item">
            <i class="bi bi-calendar3" aria-hidden="true"></i>
            ${_fmtDate(rate.effectiveDate)}
          </span>
          <span class="rate-card-meta-item">
            <span class="rate-source-badge ${srcCls}">${srcLbl}</span>
          </span>
          <span class="rate-card-meta-item text-muted">
            ${rate.providerNameEn || t('currency.rates_manual')}
          </span>
        </div>
      </div>
    </div>`;
}

function _applyFilters(rates) {
  let filtered = rates;
  if (_s.rateFromFilter) {
    filtered = filtered.filter(r => r.fromCurrency === _s.rateFromFilter);
  }
  if (_s.rateSearch) {
    const q = _s.rateSearch.toLowerCase();
    filtered = filtered.filter(r =>
      r.fromCurrency.toLowerCase().includes(q) ||
      r.toCurrency.toLowerCase().includes(q)
    );
  }
  return filtered;
}

async function _loadRates() {
  ratesSkeletons.classList.remove('d-none');
  ratesGrid.classList.add('d-none');
  ratesEmpty.classList.add('d-none');
  ratesPagination.classList.add('d-none');

  try {
    const result = await CurrencyService.getRateHistory({
      pageNumber: _s.page,
      pageSize:   _s.pageSize,
    });

    const items = result?.items ?? [];
    _s.rates      = items;
    _s.totalCount = result?.totalCount ?? 0;

    ratesSkeletons.classList.add('d-none');

    const filtered = _applyFilters(items);

    if (!filtered.length) {
      ratesEmpty.classList.remove('d-none');
      return;
    }

    ratesGrid.innerHTML = filtered.map(_buildRateCard).join('');
    ratesGrid.classList.remove('d-none');
    _renderPagination();
  } catch (err) {
    ratesSkeletons.classList.add('d-none');
    ratesEmpty.classList.remove('d-none');
    showError(err instanceof ApiError ? err.message : t('errors.unknown'));
  }
}

function _renderPagination() {
  const totalPages = Math.ceil(_s.totalCount / _s.pageSize);
  if (totalPages <= 1) { ratesPagination.classList.add('d-none'); return; }

  const list = $('ratesPaginationList');
  list.innerHTML = '';
  ratesPagination.classList.remove('d-none');

  const addPage = (label, page, disabled) => {
    const li  = document.createElement('li');
    li.className = `page-item ${disabled ? 'disabled' : ''}`;
    const btn = document.createElement('button');
    btn.className   = 'page-link';
    btn.textContent = label;
    btn.disabled    = disabled;
    if (!disabled) btn.addEventListener('click', () => { _s.page = page; _loadRates(); });
    li.appendChild(btn);
    list.appendChild(li);
  };

  addPage('‹', _s.page - 1, _s.page === 1);
  for (let p = 1; p <= totalPages; p++) {
    const li  = document.createElement('li');
    li.className = `page-item ${p === _s.page ? 'active' : ''}`;
    const btn = document.createElement('button');
    btn.className   = 'page-link';
    btn.textContent = p;
    btn.addEventListener('click', () => { _s.page = p; _loadRates(); });
    li.appendChild(btn);
    list.appendChild(li);
  }
  addPage('›', _s.page + 1, _s.page === totalPages);
}

/* --------------------------------------------------------------------------
   Currency selects (converter + set-rate form)
   -------------------------------------------------------------------------- */
function _populateCurrencySelects() {
  const list = getCurrencyList();
  if (!list.length) return;

  const makeOptions = (selEl, selectedCode) => {
    selEl.innerHTML = list
      .filter(c => c.isActive)
      .map(c => {
        const flag = currencyFlag(c.code);
        const name = _isAr() && c.nameAr ? c.nameAr : c.nameEn;
        const sel  = c.code === selectedCode ? ' selected' : '';
        return `<option value="${c.code}"${sel}>${flag} ${c.code} — ${name}</option>`;
      }).join('');
  };

  makeOptions(convertFrom, 'USD');
  makeOptions(convertTo,   'JOD');
  makeOptions(rateFromSelect, 'USD');
  makeOptions(rateToSelect,   'JOD');

  // From filter
  rateFromFilter.innerHTML = `<option value="">${t('currency.all_currencies')}</option>`;
  list.filter(c => c.isActive).forEach(c => {
    const opt = document.createElement('option');
    opt.value       = c.code;
    opt.textContent = `${currencyFlag(c.code)} ${c.code}`;
    rateFromFilter.appendChild(opt);
  });
}

/* --------------------------------------------------------------------------
   Converter
   -------------------------------------------------------------------------- */
async function _runConversion() {
  const amount = parseFloat(convertAmount.value);
  const from   = convertFrom.value;
  const to     = convertTo.value;

  if (isNaN(amount) || amount < 0) { showError(t('currency.convert_invalid_amount')); return; }
  if (!from || !to) return;
  if (from === to) {
    convertResultAmt.textContent = formatAmount(amount, to);
    convertResultRate.textContent = `1 ${from} = 1 ${to}`;
    convertResult.classList.remove('d-none');
    return;
  }

  Loader.setButtonLoading(convertBtn);
  convertResult.classList.add('d-none');

  try {
    const result = await CurrencyService.convert({ amount, fromCurrency: from, toCurrency: to });
    convertResultAmt.textContent = formatAmount(result.convertedAmount, result.toCurrency);
    convertResultRate.textContent = `1 ${result.fromCurrency} = ${_fmtRate(result.exchangeRate)} ${result.toCurrency} · ${_fmtDate(result.rateEffectiveDate)}`;
    convertResult.classList.remove('d-none');
  } catch (err) {
    showError(err instanceof ApiError ? err.message : t('errors.unknown'));
  } finally {
    Loader.clearButtonLoading(convertBtn);
  }
}

/* --------------------------------------------------------------------------
   Set Manual Rate
   -------------------------------------------------------------------------- */
async function _submitSetRate(e) {
  e.preventDefault();
  setRateForm.classList.remove('was-validated');

  const from  = rateFromSelect.value;
  const to    = rateToSelect.value;
  const rate  = parseFloat(rateValueInput.value);
  const date  = rateDateInput.value;

  if (!from || !to || isNaN(rate) || rate <= 0 || !date) {
    setRateForm.classList.add('was-validated');
    return;
  }

  Loader.setButtonLoading(setRateBtn);
  try {
    await CurrencyService.setManualRate({
      fromCurrency:  from,
      toCurrency:    to,
      rate:          rate,
      effectiveDate: date,
    });
    showSuccess(t('currency.set_rate_success'));
    rateValueInput.value = '';
    setRateForm.classList.remove('was-validated');
    await _loadRates();
  } catch (err) {
    showError(err instanceof ApiError ? err.message : t('errors.unknown'));
  } finally {
    Loader.clearButtonLoading(setRateBtn);
  }
}

/* --------------------------------------------------------------------------
   Rate hint (shows inverse)
   -------------------------------------------------------------------------- */
function _updateRateHint() {
  const from = rateFromSelect.value;
  const to   = rateToSelect.value;
  const val  = parseFloat(rateValueInput.value);
  if (from && to && val > 0) {
    const inv = (1 / val).toFixed(6);
    rateHint.textContent = `1 ${to} = ${inv} ${from}`;
  } else {
    rateHint.textContent = '';
  }
}

/* --------------------------------------------------------------------------
   Sync
   -------------------------------------------------------------------------- */
async function _triggerSync() {
  Loader.setButtonLoading(syncRatesBtn);
  try {
    await CurrencyService.syncRates();
    showSuccess(t('currency.sync_success'));
    await _loadRates();
    await _loadStatistics();
  } catch (err) {
    showError(err instanceof ApiError ? err.message : t('errors.unknown'));
  } finally {
    Loader.clearButtonLoading(syncRatesBtn);
  }
}

/* --------------------------------------------------------------------------
   Wire events
   -------------------------------------------------------------------------- */
function _wireEvents() {
  convertBtn?.addEventListener('click', _runConversion);
  convertAmount?.addEventListener('keydown', e => { if (e.key === 'Enter') _runConversion(); });

  convertSwapBtn?.addEventListener('click', () => {
    const a = convertFrom.value;
    const b = convertTo.value;
    convertFrom.value = b;
    convertTo.value   = a;
    if (convertResult && !convertResult.classList.contains('d-none')) _runConversion();
  });

  convertCopyBtn?.addEventListener('click', () => {
    const txt = convertResultAmt?.textContent;
    if (!txt) return;
    navigator.clipboard.writeText(txt).then(() => {
      const icon = convertCopyBtn.querySelector('i');
      if (icon) { icon.className = 'bi bi-check-lg'; setTimeout(() => { icon.className = 'bi bi-copy'; }, 1500); }
    });
  });

  setRateForm?.addEventListener('submit', _submitSetRate);
  rateValueInput?.addEventListener('input', _updateRateHint);
  rateFromSelect?.addEventListener('change', _updateRateHint);
  rateToSelect?.addEventListener('change', _updateRateHint);

  let _searchTimer = null;
  rateSearch?.addEventListener('input', () => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      _s.rateSearch = rateSearch.value;
      _s.page = 1;
      _loadRates();
    }, 300);
  });

  rateFromFilter?.addEventListener('change', () => {
    _s.rateFromFilter = rateFromFilter.value;
    _s.page = 1;
    _loadRates();
  });

  rateRefreshBtn?.addEventListener('click', () => _loadRates());
  syncRatesBtn?.addEventListener('click', _triggerSync);

  // Re-populate selects once currencies load
  document.addEventListener('mm-currencies-loaded', _populateCurrencySelects);

  // Set today as default rate date
  if (rateDateInput) {
    const today = new Date();
    rateDateInput.value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  }
}

/* --------------------------------------------------------------------------
   Init
   -------------------------------------------------------------------------- */
async function init() {
  await initI18n();
  await guardPage();
  initLayout();
  _wireEvents();

  const [,] = await Promise.allSettled([
    _loadStatistics(),
    _loadRates(),
  ]);

  _populateCurrencySelects();
  initOnboarding();
}

init();
