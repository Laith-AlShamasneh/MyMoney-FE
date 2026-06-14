/**
 * core/chart-theme.js — MyMoney
 *
 * Returns Chart.js-compatible colour and option objects that adapt to the
 * current light/dark theme.  Import these helpers in any page that renders
 * charts so Chart.js options are always in sync with the active theme.
 *
 * All functions read the live `data-theme` attribute at call time, so they
 * always reflect the theme that is active when the chart is built or rebuilt.
 */

/* --------------------------------------------------------------------------
   Theme detection
   -------------------------------------------------------------------------- */
function _isDark() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

/* --------------------------------------------------------------------------
   Primitive colour tokens
   -------------------------------------------------------------------------- */

/** Muted text colour for tick labels and legend text. */
export function chartTextColor() {
  return _isDark() ? '#9aa8bd' : '#6b7280';
}

/** Subtle grid-line colour. */
export function chartGridColor() {
  return _isDark() ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
}

/** Surface colour used as donut segment separator border. */
export function chartSurfaceColor() {
  return _isDark() ? '#182235' : '#ffffff';
}

/* --------------------------------------------------------------------------
   Dataset colour pairs
   -------------------------------------------------------------------------- */

/** Income dataset colours (background fill + border). */
export function incomeColors() {
  return _isDark()
    ? { backgroundColor: 'rgba(52,211,153,0.22)',  borderColor: '#34d399' }
    : { backgroundColor: 'rgba(25,135,84,0.15)',   borderColor: '#198754' };
}

/** Expense dataset colours (background fill + border). */
export function expenseColors() {
  return _isDark()
    ? { backgroundColor: 'rgba(248,113,113,0.22)', borderColor: '#f87171' }
    : { backgroundColor: 'rgba(220,53,69,0.15)',   borderColor: '#dc3545' };
}

/**
 * Colour palette for multi-series charts (donut categories, etc.).
 * Values are vivid enough to read on both light and dark backgrounds.
 */
export function chartPalette() {
  return _isDark()
    ? ['#60a5fa','#a78bfa','#f472b6','#fb923c','#34d399','#22d3ee','#fbbf24','#4ade80']
    : ['#2563eb','#7c3aed','#db2777','#ea580c','#059669','#0891b2','#d97706','#16a34a'];
}

/* --------------------------------------------------------------------------
   Plugin option builders
   -------------------------------------------------------------------------- */

/** Tooltip plugin options — styled for the active theme. */
export function chartTooltipOptions(overrides = {}) {
  const dark = _isDark();
  return {
    backgroundColor: dark ? '#1e2d45' : 'rgba(15,23,42,0.9)',
    titleColor:      dark ? '#e5edf7' : '#f1f5f9',
    bodyColor:       dark ? '#9aa8bd' : '#cbd5e1',
    borderColor:     dark ? '#2f3b52' : 'rgba(255,255,255,0.12)',
    borderWidth:     1,
    padding:         { x: 12, y: 8 },
    cornerRadius:    8,
    boxPadding:      4,
    ...overrides,
  };
}

/**
 * Legend `labels` sub-option block.
 * @param {object} [overrides] – merged on top of the defaults
 */
export function chartLegendLabels(overrides = {}) {
  return {
    color:    chartTextColor(),
    boxWidth: 12,
    padding:  16,
    font:     { size: 12 },
    ...overrides,
  };
}

/* --------------------------------------------------------------------------
   Scale option builder
   -------------------------------------------------------------------------- */

/**
 * Returns a `scales` object for a standard two-axis bar / line chart.
 *
 * @param {object} [opts]
 * @param {Function} [opts.yCallback] – `ticks.callback` for the Y axis
 * @param {boolean}  [opts.showXGrid] – show vertical grid lines (default false)
 */
export function chartScales({ yCallback, showXGrid = false } = {}) {
  const text = chartTextColor();
  const grid = chartGridColor();

  return {
    x: {
      grid:   { display: showXGrid, color: grid },
      ticks:  { color: text, font: { size: 11 } },
      border: { color: grid },
    },
    y: {
      beginAtZero: true,
      grid:        { color: grid },
      border:      { color: 'transparent' },
      ticks: {
        color: text,
        font:  { size: 11 },
        ...(yCallback ? { callback: yCallback } : {}),
      },
    },
  };
}
