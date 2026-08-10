// Formatting helpers. Shared across tools so every figure on the site reads the
// same way.

const usd0 = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
});
const usd2 = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
});

/** Currency, no cents. Negatives render in parentheses, accounting style. */
export function money(n) {
  if (!Number.isFinite(n)) return '—';
  const s = usd0.format(Math.abs(Math.round(n)));
  return n < 0 ? `(${s})` : s;
}

export function money2(n) {
  if (!Number.isFinite(n)) return '—';
  const s = usd2.format(Math.abs(n));
  return n < 0 ? `(${s})` : s;
}

/** Abbreviated currency for axis labels: $1.2M, $840K. */
export function moneyShort(n) {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
  return `${sign}$${Math.round(a)}`;
}

export function num(n, digits = 0) {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
}

export function pct(fraction, digits = 1) {
  if (!Number.isFinite(fraction)) return '—';
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** Elapsed hours as business-readable duration: "3.2 days", "6.5 hrs". */
export function duration(hours) {
  if (!Number.isFinite(hours)) return '—';
  if (hours < 8) return `${num(hours, 1)} hrs`;
  const days = hours / 8;
  if (days < 15) return `${num(days, 1)} days`;
  return `${num(days / 5, 1)} wks`;
}

/** Whole months as "14 mo" or "1 yr 2 mo". */
export function months(m) {
  if (!Number.isFinite(m)) return 'never';
  const whole = Math.ceil(m);
  if (whole < 12) return `${whole} mo`;
  const y = Math.floor(whole / 12);
  const r = whole % 12;
  return r ? `${y} yr ${r} mo` : `${y} yr`;
}

export function minutes(m) {
  if (!Number.isFinite(m)) return '—';
  if (m < 60) return `${num(m, m % 1 ? 1 : 0)} min`;
  return `${num(m / 60, 1)} hrs`;
}

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/** Parse a user-entered number, tolerating $ , % and blanks. */
export function parseNum(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const cleaned = String(value ?? '').replace(/[$,%\s]/g, '');
  if (cleaned === '' || cleaned === '-') return fallback;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}
