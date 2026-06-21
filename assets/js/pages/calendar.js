/**
 * pages/calendar.js — MyMoney
 * Financial Calendar: month/week/day/agenda views, event detail drawer,
 * create/edit modal, upcoming panel, search and filter.
 */

import { initI18n, t, getLanguage }    from '../core/i18n.js';
import { initLayout }                   from '../components/layout.js';
import { guardPage }                    from '../core/auth.js';
import { CalendarService }              from '../services/calendar-service.js';
import { ApiError }                     from '../core/api.js';
import { showError, showSuccess }       from '../components/toast.js';

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const VIEW = Object.freeze({ MONTH: 'month', WEEK: 'week', DAY: 'day', AGENDA: 'agenda', SEARCH: 'search' });

const EVENT_COLORS = Object.freeze({
  1: '#6b7280',  // Reminder   — gray
  2: '#22c55e',  // Income     — green
  3: '#ef4444',  // Expense    — red
  4: '#a855f7',  // Goal       — purple
  5: '#f97316',  // Budget     — orange
  6: '#3b82f6',  // Subscription — blue
  7: '#f59e0b',  // Bill       — amber
  8: '#14b8a6',  // Custom     — teal
});

const TYPE_I18N_KEYS = Object.freeze({
  1: 'calendar.type_reminder',
  2: 'calendar.type_income',
  3: 'calendar.type_expense',
  4: 'calendar.type_goal',
  5: 'calendar.type_budget',
  6: 'calendar.type_subscription',
  7: 'calendar.type_bill',
  8: 'calendar.type_custom',
});

const PRIORITY_I18N = Object.freeze({
  1: 'calendar.priority_low',
  2: 'calendar.priority_medium',
  3: 'calendar.priority_high',
  4: 'calendar.priority_critical',
});

const STATUS_I18N = Object.freeze({
  1: 'calendar.status_pending',
  2: 'calendar.status_completed',
  3: 'calendar.status_cancelled',
});

/* --------------------------------------------------------------------------
   DOM refs
   -------------------------------------------------------------------------- */
const calSkeleton      = document.getElementById('calSkeleton');
const calContent       = document.getElementById('calContent');
const calPeriodTitle   = document.getElementById('calPeriodTitle');
const calPrevBtn       = document.getElementById('calPrevBtn');
const calNextBtn       = document.getElementById('calNextBtn');
const calTodayBtn      = document.getElementById('calTodayBtn');
const calPrevIcon      = document.getElementById('calPrevIcon');
const calNextIcon      = document.getElementById('calNextIcon');
const calSearchInput   = document.getElementById('calSearchInput');
const calFilterToggle  = document.getElementById('calFilterToggle');
const calFilterBar     = document.getElementById('calFilterBar');
const calFilterType    = document.getElementById('calFilterType');
const calFilterStatus  = document.getElementById('calFilterStatus');
const calFilterPriority= document.getElementById('calFilterPriority');
const calFilterClearBtn= document.getElementById('calFilterClearBtn');
const calCreateBtn     = document.getElementById('calCreateBtn');

const calMonthView     = document.getElementById('calMonthView');
const calMonthHeader   = document.getElementById('calMonthHeader');
const calMonthBody     = document.getElementById('calMonthBody');

const calWeekView      = document.getElementById('calWeekView');
const calWeekHeader    = document.getElementById('calWeekHeader');
const calWeekAlldayRow = document.getElementById('calWeekAlldayRow');
const calWeekBody      = document.getElementById('calWeekBody');

const calDayView       = document.getElementById('calDayView');
const calDayTitle      = document.getElementById('calDayTitle');
const calDayEvents     = document.getElementById('calDayEvents');

const calAgendaView    = document.getElementById('calAgendaView');
const calAgendaWrap    = document.getElementById('calAgendaWrap');
const calAgendaMore    = document.getElementById('calAgendaMore');
const calAgendaLoadMore= document.getElementById('calAgendaLoadMore');

const calSearchView    = document.getElementById('calSearchView');
const calSearchHeader  = document.getElementById('calSearchHeader');
const calSearchResults = document.getElementById('calSearchResults');

const upcomingTodayList    = document.getElementById('upcomingTodayList');
const upcomingBillsList    = document.getElementById('upcomingBillsList');
const upcomingGoalsList    = document.getElementById('upcomingGoalsList');
const upcomingRecurringList= document.getElementById('upcomingRecurringList');

const calDrawerOverlay = document.getElementById('calDrawerOverlay');
const calDetailDrawer  = document.getElementById('calDetailDrawer');
const calDrawerBody    = document.getElementById('calDrawerBody');
const calDrawerFooter  = document.getElementById('calDrawerFooter');
const calDrawerClose   = document.getElementById('calDrawerClose');

const calEventModal    = document.getElementById('calEventModal');
const calModalTitle    = document.getElementById('calModalTitle');
const calEventForm     = document.getElementById('calEventForm');
const calFormEventId   = document.getElementById('calFormEventId');
const calFormTitle     = document.getElementById('calFormTitle');
const calFormDate      = document.getElementById('calFormDate');
const calFormType      = document.getElementById('calFormType');
const calFormAllDay    = document.getElementById('calFormAllDay');
const calFormTimesRow  = document.getElementById('calFormTimesRow');
const calFormStartTime = document.getElementById('calFormStartTime');
const calFormEndTime   = document.getElementById('calFormEndTime');
const calFormPriority  = document.getElementById('calFormPriority');
const calFormRemind    = document.getElementById('calFormRemind');
const calFormColor     = document.getElementById('calFormColor');
const calFormDesc      = document.getElementById('calFormDesc');
const calModalSaveBtn  = document.getElementById('calModalSaveBtn');

const calDeleteModal       = document.getElementById('calDeleteModal');
const calDeleteConfirmBtn  = document.getElementById('calDeleteConfirmBtn');

/* --------------------------------------------------------------------------
   State
   -------------------------------------------------------------------------- */
let _view          = VIEW.MONTH;
let _currentDate   = new Date();         // pivot date for navigation
let _monthEvents   = {};                 // "yyyy-MM-dd" -> CalendarEventRow[]
let _weekEvents    = [];
let _dayEvents     = [];
let _agendaPage    = 1;
let _agendaTotal   = 0;
let _activeEventId = null;              // currently opened in drawer
let _deleteEventId = null;
let _bsEventModal  = null;
let _bsDeleteModal = null;
let _searchTimer   = null;
let _selectedDate  = null;              // highlighted day in month view

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */
const _lang   = () => getLanguage();
const _isRtl  = () => _lang() === 'ar';
const _isAr   = () => _lang() === 'ar';

function _toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function _parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function _todayStr() { return _toDateStr(new Date()); }

function _eventTitle(ev) {
  if (!ev) return '';
  if (_isAr() && ev.TitleAr) return ev.TitleAr;
  return ev.TitleEn || ev.TitleAr || '';
}

function _eventColor(ev) {
  if (!ev) return '#6b7280';
  if (ev.ColorHex) return ev.ColorHex;
  return EVENT_COLORS[ev.EventTypeId] || '#6b7280';
}

function _typeLabel(typeId) {
  return t(TYPE_I18N_KEYS[typeId] || 'calendar.type_custom');
}

function _priorityLabel(pri) {
  return t(PRIORITY_I18N[pri] || 'calendar.priority_medium');
}

function _statusLabel(statusId) {
  return t(STATUS_I18N[statusId] || 'calendar.status_pending');
}

function _fmtDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = _parseDate(dateStr);
    return new Intl.DateTimeFormat(_isAr() ? 'ar-EG' : 'en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }).format(d);
  } catch { return dateStr; }
}

function _fmtShortDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = _parseDate(dateStr);
    return new Intl.DateTimeFormat(_isAr() ? 'ar-EG' : 'en-US', {
      month: 'short', day: 'numeric',
    }).format(d);
  } catch { return dateStr; }
}

function _fmtTime(timeStr) {
  if (!timeStr) return '';
  try {
    const [h, m] = timeStr.split(':').map(Number);
    return new Intl.DateTimeFormat(_isAr() ? 'ar-EG' : 'en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(new Date(2000, 0, 1, h, m));
  } catch { return timeStr; }
}

function _fmtDateTime(utcStr) {
  if (!utcStr) return '—';
  try {
    return new Intl.DateTimeFormat(_isAr() ? 'ar-EG' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(new Date(utcStr));
  } catch { return utcStr; }
}

function _fmtAmount(amount) {
  if (amount == null) return '';
  return new Intl.NumberFormat(_isAr() ? 'ar-JO' : 'en-US', {
    style: 'currency', currency: 'JOD', minimumFractionDigits: 3,
  }).format(amount);
}

function _esc(str) {
  return String(str ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function _monthName(month) {
  return t(`calendar.month_${month}`);
}

function _dayShortName(dow) {
  const keys = ['day_sun', 'day_mon', 'day_tue', 'day_wed', 'day_thu', 'day_fri', 'day_sat'];
  return t(`calendar.${keys[dow]}`);
}

function _dayFullName(dow) {
  const keys = ['day_sun_full', 'day_mon_full', 'day_tue_full', 'day_wed_full', 'day_thu_full', 'day_fri_full', 'day_sat_full'];
  return t(`calendar.${keys[dow]}`);
}

/* --------------------------------------------------------------------------
   Month view
   -------------------------------------------------------------------------- */
function _buildMonthHeader() {
  calMonthHeader.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-month-header-cell';
    cell.textContent = _dayShortName(i);
    calMonthHeader.appendChild(cell);
  }
}

function _buildMonthGrid(year, month) {
  calMonthBody.innerHTML = '';
  const firstDay     = new Date(year, month - 1, 1);
  const lastDay      = new Date(year, month, 0);
  const startDow     = firstDay.getDay();          // 0 = Sun
  const daysInMonth  = lastDay.getDate();
  const todayStr     = _todayStr();

  const cells = [];

  // prev-month overflow
  for (let i = 0; i < startDow; i++) {
    const d = new Date(year, month - 1, -startDow + 1 + i);
    cells.push({ date: d, current: false });
  }
  // current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month - 1, d), current: true });
  }
  // next-month overflow to fill rows
  const remaining = (7 - (cells.length % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ date: new Date(year, month, d), current: false });
  }

  cells.forEach(cell => {
    const dateStr = _toDateStr(cell.date);
    const events  = _monthEvents[dateStr] || [];

    const div = document.createElement('div');
    div.className = 'cal-day-cell';
    if (!cell.current) div.classList.add('cal-other-month');
    if (dateStr === todayStr) div.classList.add('cal-today');
    if (dateStr === _selectedDate) div.classList.add('cal-selected');
    div.dataset.date = dateStr;

    const numDiv = document.createElement('div');
    numDiv.className = 'cal-day-num';
    numDiv.textContent = cell.date.getDate();
    div.appendChild(numDiv);

    const maxPills = 3;
    events.slice(0, maxPills).forEach(ev => {
      const pill = document.createElement('div');
      pill.className = 'cal-event-pill';
      if (ev.IsCompleted) pill.classList.add('cal-event-completed');
      pill.style.background = _eventColor(ev);
      pill.title = _eventTitle(ev);
      pill.dataset.eventId = ev.EventId;

      const icon = document.createElement('i');
      icon.className = `bi ${ev.Icon || 'bi-circle-fill'}`;
      icon.style.fontSize = '0.55rem';
      pill.appendChild(icon);

      const txt = document.createElement('span');
      txt.textContent = _eventTitle(ev);
      pill.appendChild(txt);

      div.appendChild(pill);
    });

    if (events.length > maxPills) {
      const more = document.createElement('div');
      more.className = 'cal-more-link';
      more.textContent = t('calendar.more_events').replace('{n}', events.length - maxPills);
      div.appendChild(more);
    }

    calMonthBody.appendChild(div);
  });
}

function _updateMonthTitle() {
  const y = _currentDate.getFullYear();
  const m = _currentDate.getMonth() + 1;
  calPeriodTitle.textContent = `${_monthName(m)} ${y}`;
}

/* --------------------------------------------------------------------------
   Week view
   -------------------------------------------------------------------------- */
function _getWeekStart(d) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

function _renderWeekView() {
  const weekStart = _getWeekStart(_currentDate);
  const todayStr  = _todayStr();

  // Build grouped map by date
  const byDate = {};
  _weekEvents.forEach(ev => {
    byDate[ev.EventDate] = byDate[ev.EventDate] || [];
    byDate[ev.EventDate].push(ev);
  });

  // Header
  calWeekHeader.innerHTML = '<div class="cal-week-header-spacer"></div>';
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dStr  = _toDateStr(d);
    const cell  = document.createElement('div');
    cell.className = 'cal-week-header-day';
    if (dStr === todayStr) cell.classList.add('cal-today');
    cell.dataset.date = dStr;
    cell.innerHTML = `
      <div class="day-name">${_dayShortName(i)}</div>
      <div class="day-num">${d.getDate()}</div>`;
    calWeekHeader.appendChild(cell);
  }

  // All-day row
  calWeekAlldayRow.innerHTML = `<div class="cal-week-allday-label">${_esc(t('calendar.all_day'))}</div>`;
  for (let i = 0; i < 7; i++) {
    const d    = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dStr = _toDateStr(d);
    const cell = document.createElement('div');
    cell.className = 'cal-week-allday-cell';
    (byDate[dStr] || []).filter(ev => ev.AllDay).forEach(ev => {
      const pill = document.createElement('div');
      pill.className = 'cal-event-pill';
      pill.style.background = _eventColor(ev);
      pill.dataset.eventId = ev.EventId;
      pill.textContent = _eventTitle(ev);
      cell.appendChild(pill);
    });
    calWeekAlldayRow.appendChild(cell);
  }

  // Body: time slots
  calWeekBody.innerHTML = '';
  const timeCol = document.createElement('div');
  timeCol.className = 'cal-time-col';
  for (let h = 0; h < 24; h++) {
    const slot = document.createElement('div');
    slot.className = 'cal-time-slot-label';
    slot.textContent = h === 0 ? '' : new Intl.DateTimeFormat(_isAr() ? 'ar-EG' : 'en-US', {
      hour: 'numeric', hour12: true,
    }).format(new Date(2000, 0, 1, h, 0));
    timeCol.appendChild(slot);
  }
  calWeekBody.appendChild(timeCol);

  for (let i = 0; i < 7; i++) {
    const d    = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const dStr = _toDateStr(d);
    const col  = document.createElement('div');
    col.className = 'cal-week-day-col';
    col.style.position = 'relative';

    for (let h = 0; h < 24; h++) {
      const slot = document.createElement('div');
      slot.className = 'cal-week-hour-slot';
      col.appendChild(slot);
    }

    (byDate[dStr] || []).filter(ev => !ev.AllDay && ev.StartTime).forEach(ev => {
      const [sh, sm] = (ev.StartTime || '00:00').split(':').map(Number);
      const topPx = (sh * 60 + sm) / 60 * 48;
      let heightPx = 48;
      if (ev.EndTime) {
        const [eh, em] = ev.EndTime.split(':').map(Number);
        heightPx = Math.max(20, ((eh * 60 + em) - (sh * 60 + sm)) / 60 * 48);
      }
      const evDiv = document.createElement('div');
      evDiv.className = 'cal-week-event';
      evDiv.style.top  = `${topPx}px`;
      evDiv.style.height = `${heightPx}px`;
      evDiv.style.background = _eventColor(ev);
      evDiv.dataset.eventId = ev.EventId;
      evDiv.title = _eventTitle(ev);
      evDiv.textContent = _eventTitle(ev);
      col.appendChild(evDiv);
    });

    calWeekBody.appendChild(col);
  }
}

function _updateWeekTitle() {
  const ws  = _getWeekStart(_currentDate);
  const we  = new Date(ws);
  we.setDate(we.getDate() + 6);
  const fmt = new Intl.DateTimeFormat(_isAr() ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric' });
  calPeriodTitle.textContent = `${fmt.format(ws)} – ${fmt.format(we)}`;
}

/* --------------------------------------------------------------------------
   Day view
   -------------------------------------------------------------------------- */
function _renderDayView() {
  const dateStr = _toDateStr(_currentDate);
  calDayTitle.textContent = _fmtDate(dateStr);
  calDayEvents.innerHTML  = '';

  if (!_dayEvents.length) {
    calDayEvents.innerHTML = `
      <div class="cal-empty py-4">
        <div class="cal-empty-icon"><i class="bi bi-calendar-x"></i></div>
        <div class="cal-empty-title">${_esc(t('calendar.no_events_day'))}</div>
      </div>`;
    return;
  }

  _dayEvents.forEach(ev => {
    const row = document.createElement('div');
    row.className = 'cal-day-event-row';
    row.dataset.eventId = ev.EventId;

    const color = _eventColor(ev);
    const timeLabel = ev.AllDay
      ? t('calendar.all_day')
      : (ev.StartTime ? _fmtTime(ev.StartTime) : '');

    row.innerHTML = `
      <div class="cal-day-event-color" style="background:${_esc(color)}"></div>
      <div class="cal-day-event-body">
        <div class="cal-day-event-title${ev.IsCompleted ? ' text-decoration-line-through opacity-50' : ''}">${_esc(_eventTitle(ev))}</div>
        <div class="cal-day-event-meta">
          ${timeLabel ? `<span>${_esc(timeLabel)}</span>` : ''}
          <span class="cal-day-event-badge" style="background:${_esc(color)}">${_esc(_typeLabel(ev.EventTypeId))}</span>
          ${ev.Amount != null ? `<span>${_esc(_fmtAmount(ev.Amount))}</span>` : ''}
        </div>
      </div>
      <div class="flex-shrink-0"><i class="bi bi-chevron-${_isRtl() ? 'left' : 'right'} text-muted" style="font-size:0.7rem"></i></div>`;

    calDayEvents.appendChild(row);
  });
}

function _updateDayTitle() {
  const dateStr = _toDateStr(_currentDate);
  calPeriodTitle.textContent = _fmtDate(dateStr);
}

/* --------------------------------------------------------------------------
   Agenda view
   -------------------------------------------------------------------------- */
function _renderAgendaGroups(items, append = false) {
  if (!append) calAgendaWrap.innerHTML = '';

  if (!items.length && !append) {
    calAgendaWrap.innerHTML = `
      <div class="cal-empty py-4">
        <div class="cal-empty-icon"><i class="bi bi-calendar3"></i></div>
        <div class="cal-empty-title">${_esc(t('calendar.agenda_empty'))}</div>
      </div>`;
    return;
  }

  // Group by date
  const groups = {};
  const order  = [];
  items.forEach(ev => {
    if (!groups[ev.EventDate]) {
      groups[ev.EventDate] = [];
      order.push(ev.EventDate);
    }
    groups[ev.EventDate].push(ev);
  });

  const todayStr = _todayStr();

  order.forEach(dateStr => {
    const d = _parseDate(dateStr);
    const group = document.createElement('div');
    group.className = 'cal-agenda-date-group';
    group.dataset.date = dateStr;

    const hdr = document.createElement('div');
    hdr.className = 'cal-agenda-date-header';
    const isToday = dateStr === todayStr;
    hdr.innerHTML = `
      <div class="cal-agenda-date-num">${d.getDate()}</div>
      <div class="cal-agenda-date-info">
        <span class="cal-agenda-day-name">${_esc(_dayFullName(d.getDay()))}</span>
        <span class="cal-agenda-month-year">${_esc(_monthName(d.getMonth() + 1))} ${d.getFullYear()}</span>
      </div>
      ${isToday ? `<span class="cal-agenda-today-badge">${_esc(t('calendar.btn_today'))}</span>` : ''}`;
    group.appendChild(hdr);

    const eventsDiv = document.createElement('div');
    eventsDiv.className = 'cal-agenda-events';

    groups[dateStr].forEach(ev => {
      const color     = _eventColor(ev);
      const timeLabel = ev.AllDay
        ? t('calendar.all_day')
        : (ev.StartTime ? _fmtTime(ev.StartTime) : '');
      const row = document.createElement('div');
      row.className = 'cal-agenda-event-row' + (ev.IsCompleted ? ' cal-completed' : '');
      row.dataset.eventId = ev.EventId;
      row.innerHTML = `
        <div class="cal-agenda-event-dot" style="background:${_esc(color)}"></div>
        <div class="cal-agenda-event-title">${_esc(_eventTitle(ev))}</div>
        ${timeLabel ? `<div class="cal-agenda-event-time">${_esc(timeLabel)}</div>` : ''}
        <div class="cal-agenda-event-badge" style="background:${_esc(color)}">${_esc(_typeLabel(ev.EventTypeId))}</div>`;
      eventsDiv.appendChild(row);
    });

    group.appendChild(eventsDiv);
    calAgendaWrap.appendChild(group);
  });
}

/* --------------------------------------------------------------------------
   Search results
   -------------------------------------------------------------------------- */
function _renderSearchResults(items, keyword) {
  calSearchHeader.textContent = t('calendar.search_results_for').replace('{q}', keyword);
  calSearchResults.innerHTML  = '';

  if (!items.length) {
    calSearchResults.innerHTML = `
      <div class="cal-empty py-4">
        <div class="cal-empty-icon"><i class="bi bi-search"></i></div>
        <div class="cal-empty-title">${_esc(t('calendar.search_empty'))}</div>
      </div>`;
    return;
  }

  const eventsDiv = document.createElement('div');
  eventsDiv.className = 'cal-agenda-events p-2';
  items.forEach(ev => {
    const color = _eventColor(ev);
    const row = document.createElement('div');
    row.className = 'cal-agenda-event-row' + (ev.IsCompleted ? ' cal-completed' : '');
    row.dataset.eventId = ev.EventId;
    row.innerHTML = `
      <div class="cal-agenda-event-dot" style="background:${_esc(color)}"></div>
      <div>
        <div class="cal-agenda-event-title">${_esc(_eventTitle(ev))}</div>
        <div class="cal-agenda-event-time">${_esc(_fmtShortDate(ev.EventDate))}</div>
      </div>
      <div class="cal-agenda-event-badge ms-auto" style="background:${_esc(color)}">${_esc(_typeLabel(ev.EventTypeId))}</div>`;
    eventsDiv.appendChild(row);
  });
  calSearchResults.appendChild(eventsDiv);
}

/* --------------------------------------------------------------------------
   Upcoming panel
   -------------------------------------------------------------------------- */
function _renderUpcomingList(container, events) {
  container.innerHTML = '';
  if (!events || !events.length) {
    container.innerHTML = `<div class="cal-upcoming-empty">${_esc(t('calendar.no_upcoming'))}</div>`;
    return;
  }
  events.forEach(ev => {
    const color = _eventColor(ev);
    const item  = document.createElement('div');
    item.className = 'cal-upcoming-item';
    item.dataset.eventId = ev.EventId;
    item.innerHTML = `
      <div class="cal-upcoming-dot" style="background:${_esc(color)}"></div>
      <div class="cal-upcoming-item-body">
        <div class="cal-upcoming-item-title">${_esc(_eventTitle(ev))}</div>
        <div class="cal-upcoming-item-date">${_esc(_fmtShortDate(ev.EventDate))}</div>
      </div>
      ${ev.Amount != null ? `<div class="cal-upcoming-amount">${_esc(_fmtAmount(ev.Amount))}</div>` : ''}`;
    container.appendChild(item);
  });
}

function _renderUpcomingPanel(dashboard) {
  _renderUpcomingList(upcomingTodayList,     dashboard.TodayEvents     || []);
  _renderUpcomingList(upcomingBillsList,     dashboard.UpcomingBills   || []);
  _renderUpcomingList(upcomingGoalsList,     dashboard.UpcomingGoals   || []);
  _renderUpcomingList(upcomingRecurringList, dashboard.UpcomingRecurring || []);
}

/* --------------------------------------------------------------------------
   Detail drawer
   -------------------------------------------------------------------------- */
function _openDrawerOverlay() {
  calDrawerOverlay.classList.add('show');
  calDetailDrawer.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function _closeDrawer() {
  calDrawerOverlay.classList.remove('show');
  calDetailDrawer.classList.remove('open');
  document.body.style.overflow = '';
  _activeEventId = null;
}

async function _openDrawer(eventId) {
  _activeEventId = eventId;
  calDrawerBody.innerHTML   = '<div class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary"></div></div>';
  calDrawerFooter.innerHTML = '';
  _openDrawerOverlay();

  let detail;
  try {
    detail = await CalendarService.getEvent(eventId);
  } catch (err) {
    _closeDrawer();
    showError(err instanceof ApiError ? err.message : t('calendar.error'));
    return;
  }

  _renderDrawer(detail);
}

function _renderDrawer(detail) {
  const color    = detail.ColorHex || EVENT_COLORS[detail.EventTypeId] || '#6b7280';
  const isCompleted = detail.StatusId === 2;

  // Body
  calDrawerBody.innerHTML = `
    <div class="cal-detail-type-badge" style="background:${_esc(color)}">
      <i class="bi ${_esc(detail.Icon || 'bi-calendar-event')}"></i>
      ${_esc(_typeLabel(detail.EventTypeId))}
    </div>
    <div class="cal-detail-title">${_esc(detail.Title)}</div>
    ${isCompleted ? `
      <div class="cal-detail-completed-badge">
        <i class="bi bi-check-circle-fill"></i>
        ${_esc(t('calendar.detail_completed_on'))}
        ${detail.CompletedAtUtc ? _fmtDateTime(detail.CompletedAtUtc) : ''}
      </div>` : ''}
    <div class="cal-detail-meta-grid">
      <span class="cal-detail-meta-label">${_esc(t('calendar.detail_date'))}</span>
      <span class="cal-detail-meta-value">${_esc(_fmtDate(detail.EventDate))}</span>
      ${!detail.AllDay && detail.StartTime ? `
        <span class="cal-detail-meta-label">${_esc(t('calendar.detail_time'))}</span>
        <span class="cal-detail-meta-value">${_esc(_fmtTime(detail.StartTime))}${detail.EndTime ? ' – ' + _fmtTime(detail.EndTime) : ''}</span>` : ''}
      ${detail.AllDay ? `
        <span class="cal-detail-meta-label">${_esc(t('calendar.detail_time'))}</span>
        <span class="cal-detail-meta-value">${_esc(t('calendar.all_day'))}</span>` : ''}
      <span class="cal-detail-meta-label">${_esc(t('calendar.detail_priority'))}</span>
      <span class="cal-detail-meta-value">${_esc(_priorityLabel(detail.Priority))}</span>
      <span class="cal-detail-meta-label">${_esc(t('calendar.detail_status'))}</span>
      <span class="cal-detail-meta-value">${_esc(_statusLabel(detail.StatusId))}</span>
      ${detail.Amount != null ? `
        <span class="cal-detail-meta-label">${_esc(t('calendar.detail_amount'))}</span>
        <span class="cal-detail-meta-value fw-semibold">${_esc(_fmtAmount(detail.Amount))}</span>` : ''}
    </div>
    ${detail.Description ? `<div class="cal-detail-desc">${_esc(detail.Description)}</div>` : ''}
    <div class="cal-detail-reminder-box">
      <i class="bi bi-bell text-warning"></i>
      <span class="text-muted small">${_esc(t('calendar.detail_reminder'))}:</span>
      <span class="small fw-500">
        ${detail.Reminder
          ? `${_fmtDateTime(detail.Reminder.ReminderAtUtc)}`
          : t('calendar.reminder_none')}
      </span>
      ${detail.Reminder && detail.Reminder.StatusId === 1 ? `
        <button class="btn btn-xs btn-outline-secondary ms-auto cal-dismiss-reminder-btn" data-reminder-id="${detail.Reminder.ReminderId}">
          ${_esc(t('calendar.reminder_dismiss'))}
        </button>` : ''}
    </div>
    <div class="text-muted" style="font-size:0.72rem;">
      ${_esc(t('calendar.detail_created'))}: ${_fmtDateTime(detail.CreatedAtUtc)}
    </div>`;

  // Footer buttons
  calDrawerFooter.innerHTML = '';

  if (!isCompleted) {
    const completeBtn = document.createElement('button');
    completeBtn.className = 'btn btn-success btn-sm';
    completeBtn.innerHTML = `<i class="bi bi-check-lg me-1"></i>${_esc(t('calendar.detail_complete_btn'))}`;
    completeBtn.addEventListener('click', () => _completeEvent(detail.EventId));
    calDrawerFooter.appendChild(completeBtn);
  }

  const editBtn = document.createElement('button');
  editBtn.className = 'btn btn-outline-primary btn-sm';
  editBtn.innerHTML = `<i class="bi bi-pencil me-1"></i>${_esc(t('calendar.detail_edit_btn'))}`;
  editBtn.addEventListener('click', () => _openEditModal(detail));
  calDrawerFooter.appendChild(editBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn-outline-danger btn-sm';
  deleteBtn.innerHTML = `<i class="bi bi-trash me-1"></i>${_esc(t('calendar.detail_delete_btn'))}`;
  deleteBtn.addEventListener('click', () => _confirmDelete(detail.EventId));
  calDrawerFooter.appendChild(deleteBtn);

  // Wire dismiss reminder buttons
  calDrawerBody.querySelectorAll('.cal-dismiss-reminder-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const remId = parseInt(btn.dataset.reminderId, 10);
      try {
        await CalendarService.dismissReminder(remId);
        showSuccess(t('calendar.reminder_dismissed'));
        await _openDrawer(_activeEventId);
      } catch (err) {
        showError(err instanceof ApiError ? err.message : t('calendar.error'));
      }
    });
  });
}

/* --------------------------------------------------------------------------
   Create / Edit modal
   -------------------------------------------------------------------------- */
function _resetForm() {
  calEventForm.classList.remove('was-validated');
  calFormEventId.value   = '';
  calFormTitle.value     = '';
  calFormDate.value      = _toDateStr(new Date());
  calFormType.value      = '8';
  calFormAllDay.checked  = true;
  calFormTimesRow.classList.add('d-none');
  calFormStartTime.value = '';
  calFormEndTime.value   = '';
  calFormPriority.value  = '2';
  calFormRemind.value    = '';
  calFormColor.value     = '#6366f1';
  calFormDesc.value      = '';
}

function _openCreateModal(prefillDate = null) {
  _resetForm();
  calModalTitle.textContent = t('calendar.modal_create_title');
  if (prefillDate) calFormDate.value = prefillDate;
  _bsEventModal?.show();
}

function _openEditModal(detail) {
  _resetForm();
  calModalTitle.textContent  = t('calendar.modal_edit_title');
  calFormEventId.value       = detail.EventId;
  calFormTitle.value         = detail.Title;
  calFormDate.value          = detail.EventDate;
  calFormType.value          = String(detail.EventTypeId);
  calFormAllDay.checked      = detail.AllDay;
  calFormTimesRow.classList.toggle('d-none', detail.AllDay);
  calFormStartTime.value     = detail.StartTime || '';
  calFormEndTime.value       = detail.EndTime   || '';
  calFormPriority.value      = String(detail.Priority);
  calFormRemind.value        = detail.NotifyBefore != null ? String(detail.NotifyBefore) : '';
  calFormColor.value         = detail.ColorHex || EVENT_COLORS[detail.EventTypeId] || '#6366f1';
  calFormDesc.value          = detail.Description || '';
  _closeDrawer();
  _bsEventModal?.show();
}

async function _saveEvent() {
  calEventForm.classList.add('was-validated');
  if (!calEventForm.checkValidity()) return;

  const eventId = calFormEventId.value ? parseInt(calFormEventId.value, 10) : null;
  const isEdit  = !!eventId;

  const payload = {
    title:         calFormTitle.value.trim(),
    eventDate:     calFormDate.value,
    eventTypeId:   parseInt(calFormType.value, 10),
    allDay:        calFormAllDay.checked,
    startTime:     (!calFormAllDay.checked && calFormStartTime.value) ? calFormStartTime.value : null,
    endTime:       (!calFormAllDay.checked && calFormEndTime.value)   ? calFormEndTime.value   : null,
    priority:      parseInt(calFormPriority.value, 10),
    colorHex:      calFormColor.value,
    notifyBefore:  calFormRemind.value ? parseInt(calFormRemind.value, 10) : null,
    description:   calFormDesc.value.trim() || null,
  };

  if (isEdit) payload.eventId = eventId;

  calModalSaveBtn.disabled    = true;
  calModalSaveBtn.textContent = t('calendar.modal_saving');

  try {
    if (isEdit) {
      await CalendarService.updateEvent(payload);
      showSuccess(t('calendar.updated_success'));
    } else {
      await CalendarService.createEvent(payload);
      showSuccess(t('calendar.created_success'));
    }
    _bsEventModal?.hide();
    await _refreshCurrentView();
  } catch (err) {
    showError(err instanceof ApiError ? err.message : t('calendar.error'));
  } finally {
    calModalSaveBtn.disabled    = false;
    calModalSaveBtn.textContent = t('calendar.modal_save');
  }
}

/* --------------------------------------------------------------------------
   Delete
   -------------------------------------------------------------------------- */
function _confirmDelete(eventId) {
  _deleteEventId = eventId;
  _closeDrawer();
  _bsDeleteModal?.show();
}

async function _doDelete() {
  if (!_deleteEventId) return;
  calDeleteConfirmBtn.disabled    = true;
  calDeleteConfirmBtn.textContent = t('calendar.deleting');
  try {
    await CalendarService.deleteEvent(_deleteEventId);
    showSuccess(t('calendar.deleted_success'));
    _bsDeleteModal?.hide();
    _deleteEventId = null;
    await _refreshCurrentView();
  } catch (err) {
    showError(err instanceof ApiError ? err.message : t('calendar.error'));
  } finally {
    calDeleteConfirmBtn.disabled    = false;
    calDeleteConfirmBtn.textContent = t('calendar.delete_btn');
  }
}

/* --------------------------------------------------------------------------
   Complete event
   -------------------------------------------------------------------------- */
async function _completeEvent(eventId) {
  try {
    await CalendarService.completeEvent(eventId);
    showSuccess(t('calendar.completed_success'));
    _closeDrawer();
    await _refreshCurrentView();
  } catch (err) {
    showError(err instanceof ApiError ? err.message : t('calendar.error'));
  }
}

/* --------------------------------------------------------------------------
   Data loading
   -------------------------------------------------------------------------- */
async function _loadMonthData() {
  const y = _currentDate.getFullYear();
  const m = _currentDate.getMonth() + 1;
  const typeFilter = calFilterType.value ? parseInt(calFilterType.value, 10) : null;
  const rows = await CalendarService.getByMonth(y, m, typeFilter);

  _monthEvents = {};
  (rows || []).forEach(ev => {
    _monthEvents[ev.EventDate] = _monthEvents[ev.EventDate] || [];
    _monthEvents[ev.EventDate].push(ev);
  });
  _buildMonthGrid(y, m);
}

async function _loadWeekData() {
  const ws   = _getWeekStart(_currentDate);
  const wsStr = _toDateStr(ws);
  _weekEvents = await CalendarService.getByWeek(wsStr) || [];
  _renderWeekView();
}

async function _loadDayData() {
  const dateStr = _toDateStr(_currentDate);
  _dayEvents = await CalendarService.getByDay(dateStr) || [];
  _renderDayView();
}

async function _loadAgendaData(append = false) {
  if (!append) _agendaPage = 1;
  const startDate = append ? null : _toDateStr(_currentDate);
  const result = await CalendarService.getAgenda(startDate, 60, _agendaPage, 30);
  _agendaTotal = result?.TotalCount ?? 0;
  const items  = result?.Items || [];
  _renderAgendaGroups(items, append);

  const loaded = (_agendaPage - 1) * 30 + items.length;
  calAgendaMore.classList.toggle('d-none', loaded >= _agendaTotal);
  if (!append && !items.length) calAgendaMore.classList.add('d-none');
}

async function _loadDashboard() {
  try {
    const dash = await CalendarService.getDashboard();
    _renderUpcomingPanel(dash || {});
  } catch {
    _renderUpcomingPanel({});
  }
}

async function _doSearch(keyword) {
  if (!keyword.trim()) {
    _switchView(_view === VIEW.SEARCH ? VIEW.MONTH : _view);
    return;
  }
  _showView(VIEW.SEARCH);
  calSearchResults.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div></div>';
  try {
    const result = await CalendarService.search({
      keyword:    keyword.trim(),
      pageNumber: 1,
      pageSize:   50,
    });
    _renderSearchResults(result?.Items || [], keyword.trim());
  } catch (err) {
    showError(err instanceof ApiError ? err.message : t('errors.unknown'));
  }
}

/* --------------------------------------------------------------------------
   View management
   -------------------------------------------------------------------------- */
function _showView(view) {
  calMonthView.classList.toggle('d-none', view !== VIEW.MONTH);
  calWeekView .classList.toggle('d-none', view !== VIEW.WEEK);
  calDayView  .classList.toggle('d-none', view !== VIEW.DAY);
  calAgendaView.classList.toggle('d-none', view !== VIEW.AGENDA);
  calSearchView.classList.toggle('d-none', view !== VIEW.SEARCH);

  document.querySelectorAll('.cal-view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
}

function _switchView(view) {
  _view = view;
  _showView(view);
  _updateTitle();
}

function _updateTitle() {
  switch (_view) {
    case VIEW.MONTH:  _updateMonthTitle(); break;
    case VIEW.WEEK:   _updateWeekTitle();  break;
    case VIEW.DAY:    _updateDayTitle();   break;
    case VIEW.AGENDA: calPeriodTitle.textContent = t('calendar.view_agenda'); break;
    default:          calPeriodTitle.textContent = ''; break;
  }
}

async function _refreshCurrentView() {
  switch (_view) {
    case VIEW.MONTH:  await _loadMonthData();   break;
    case VIEW.WEEK:   await _loadWeekData();    break;
    case VIEW.DAY:    await _loadDayData();     break;
    case VIEW.AGENDA: await _loadAgendaData();  break;
  }
  await _loadDashboard();
}

/* --------------------------------------------------------------------------
   Navigation
   -------------------------------------------------------------------------- */
function _goNext() {
  switch (_view) {
    case VIEW.MONTH:
      _currentDate = new Date(_currentDate.getFullYear(), _currentDate.getMonth() + 1, 1);
      _loadMonthData().then(_updateMonthTitle);
      break;
    case VIEW.WEEK:
      _currentDate = new Date(_currentDate);
      _currentDate.setDate(_currentDate.getDate() + 7);
      _loadWeekData().then(_updateWeekTitle);
      break;
    case VIEW.DAY:
      _currentDate = new Date(_currentDate);
      _currentDate.setDate(_currentDate.getDate() + 1);
      _loadDayData().then(_updateDayTitle);
      break;
    case VIEW.AGENDA:
      _agendaPage++;
      _loadAgendaData(true);
      break;
  }
}

function _goPrev() {
  switch (_view) {
    case VIEW.MONTH:
      _currentDate = new Date(_currentDate.getFullYear(), _currentDate.getMonth() - 1, 1);
      _loadMonthData().then(_updateMonthTitle);
      break;
    case VIEW.WEEK:
      _currentDate = new Date(_currentDate);
      _currentDate.setDate(_currentDate.getDate() - 7);
      _loadWeekData().then(_updateWeekTitle);
      break;
    case VIEW.DAY:
      _currentDate = new Date(_currentDate);
      _currentDate.setDate(_currentDate.getDate() - 1);
      _loadDayData().then(_updateDayTitle);
      break;
  }
}

function _goToday() {
  _currentDate = new Date();
  _selectedDate = _todayStr();
  _refreshCurrentView().then(_updateTitle);
}

/* --------------------------------------------------------------------------
   RTL arrow icons
   -------------------------------------------------------------------------- */
function _updateArrowIcons() {
  const rtl = _isRtl();
  calPrevIcon.className = `bi bi-chevron-${rtl ? 'right' : 'left'}`;
  calNextIcon.className = `bi bi-chevron-${rtl ? 'left' : 'right'}`;
}

/* --------------------------------------------------------------------------
   Event wiring
   -------------------------------------------------------------------------- */
function _wireEvents() {
  // View buttons
  document.querySelectorAll('.cal-view-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const v = btn.dataset.view;
      _switchView(v);
      switch (v) {
        case VIEW.MONTH:  await _loadMonthData();  break;
        case VIEW.WEEK:   await _loadWeekData();   break;
        case VIEW.DAY:    await _loadDayData();    break;
        case VIEW.AGENDA: await _loadAgendaData(); break;
      }
    });
  });

  // Navigation
  calPrevBtn.addEventListener('click', _goPrev);
  calNextBtn.addEventListener('click', _goNext);
  calTodayBtn.addEventListener('click', _goToday);

  // Create event
  calCreateBtn.addEventListener('click', () => _openCreateModal());

  // Filter toggle
  calFilterToggle.addEventListener('click', () => {
    calFilterBar.classList.toggle('d-none');
  });

  // Filter change
  [calFilterType, calFilterStatus, calFilterPriority].forEach(sel => {
    sel.addEventListener('change', () => _refreshCurrentView());
  });

  // Filter clear
  calFilterClearBtn.addEventListener('click', () => {
    calFilterType.value     = '';
    calFilterStatus.value   = '';
    calFilterPriority.value = '';
    _refreshCurrentView();
  });

  // Search input
  calSearchInput.addEventListener('input', () => {
    clearTimeout(_searchTimer);
    const q = calSearchInput.value.trim();
    if (!q) {
      _switchView(VIEW.MONTH);
      return;
    }
    _searchTimer = setTimeout(() => _doSearch(q), 400);
  });

  // Drawer close
  calDrawerClose.addEventListener('click', _closeDrawer);
  calDrawerOverlay.addEventListener('click', _closeDrawer);

  // Month day cells (click)
  calMonthBody.addEventListener('click', e => {
    const pill = e.target.closest('.cal-event-pill');
    if (pill) {
      e.stopPropagation();
      _openDrawer(parseInt(pill.dataset.eventId, 10));
      return;
    }
    const dayCell = e.target.closest('.cal-day-cell');
    if (dayCell && dayCell.dataset.date) {
      _selectedDate = dayCell.dataset.date;
      _currentDate  = _parseDate(dayCell.dataset.date) || _currentDate;
      _switchView(VIEW.DAY);
      _loadDayData();
    }
  });

  // Week body event clicks
  calWeekBody.addEventListener('click', e => {
    const ev = e.target.closest('[data-event-id]');
    if (ev) _openDrawer(parseInt(ev.dataset.eventId, 10));
  });

  calWeekHeader.addEventListener('click', e => {
    const cell = e.target.closest('[data-date]');
    if (cell && cell.dataset.date) {
      _currentDate = _parseDate(cell.dataset.date) || _currentDate;
      _switchView(VIEW.DAY);
      _loadDayData();
    }
  });

  // Day view row click
  calDayEvents.addEventListener('click', e => {
    const row = e.target.closest('[data-event-id]');
    if (row) _openDrawer(parseInt(row.dataset.eventId, 10));
  });

  // Agenda view row click
  calAgendaWrap.addEventListener('click', e => {
    const row = e.target.closest('[data-event-id]');
    if (row) _openDrawer(parseInt(row.dataset.eventId, 10));
  });

  // Search results click
  calSearchResults.addEventListener('click', e => {
    const row = e.target.closest('[data-event-id]');
    if (row) _openDrawer(parseInt(row.dataset.eventId, 10));
  });

  // Upcoming panel click
  [upcomingTodayList, upcomingBillsList, upcomingGoalsList, upcomingRecurringList].forEach(el => {
    el.addEventListener('click', e => {
      const item = e.target.closest('[data-event-id]');
      if (item) _openDrawer(parseInt(item.dataset.eventId, 10));
    });
  });

  // Agenda load more
  calAgendaLoadMore.addEventListener('click', () => {
    _agendaPage++;
    _loadAgendaData(true);
  });

  // Modal save
  calModalSaveBtn.addEventListener('click', _saveEvent);

  // All-day toggle
  calFormAllDay.addEventListener('change', () => {
    calFormTimesRow.classList.toggle('d-none', calFormAllDay.checked);
  });

  // Delete confirm
  calDeleteConfirmBtn.addEventListener('click', _doDelete);

  // Event type → auto-fill colour
  calFormType.addEventListener('change', () => {
    const typeId = parseInt(calFormType.value, 10);
    if (EVENT_COLORS[typeId]) calFormColor.value = EVENT_COLORS[typeId];
  });

  // Theme change — rebuild month grid colours
  document.addEventListener('mm-theme-change', () => {
    if (_view === VIEW.MONTH) {
      const y = _currentDate.getFullYear();
      const m = _currentDate.getMonth() + 1;
      _buildMonthGrid(y, m);
    }
  });
}

/* --------------------------------------------------------------------------
   Init
   -------------------------------------------------------------------------- */
async function init() {
  await initI18n();
  await guardPage();
  initLayout();

  _updateArrowIcons();
  _buildMonthHeader();
  _wireEvents();

  // Initialise Bootstrap modals
  if (window.bootstrap) {
    _bsEventModal  = new bootstrap.Modal(calEventModal);
    _bsDeleteModal = new bootstrap.Modal(calDeleteModal);
  }

  calSkeleton.classList.add('d-none');
  calContent.classList.remove('d-none');
  _updateMonthTitle();

  try {
    await Promise.all([
      _loadMonthData(),
      _loadDashboard(),
    ]);
  } catch (err) {
    showError(err instanceof ApiError ? err.message : t('errors.unknown'));
  }
}

init();
