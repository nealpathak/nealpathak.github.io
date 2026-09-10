export const fmt = {
  money(v, opts = {}) {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    const abs = Math.abs(v);
    let s;
    if (opts.compact && abs >= 1e6) s = (abs / 1e6).toFixed(abs >= 1e7 ? 1 : 2) + 'm';
    else if (opts.compact && abs >= 1e3) s = Math.round(abs / 1e3) + 'k';
    else s = Math.round(abs).toLocaleString('en-US');
    return (v < 0 ? '−' : '') + '$' + s;
  },
  num(v, dp = 0) {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  },
  pct(v, dp = 0) {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    return (v * 100).toFixed(dp) + '%';
  },
  factor(v, dp = 3) { return v === null || v === undefined ? '—' : v.toFixed(dp); },
  date(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-').map(Number);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d} ${months[m - 1]} ${y}`;
  },
  monthYear(iso) {
    const [y, m] = iso.split('-').map(Number);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[m - 1]} ${y}`;
  },
};

// Date helpers on ISO strings, UTC-safe.
export const dates = {
  toISO(d) { return d.toISOString().slice(0, 10); },
  parse(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); },
  addDays(iso, n) { const d = dates.parse(iso); d.setUTCDate(d.getUTCDate() + n); return dates.toISO(d); },
  addMonths(iso, n) {
    const d = dates.parse(iso);
    const day = d.getUTCDate();
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
    return dates.toISO(d);
  },
  daysBetween(a, b) { return Math.round((dates.parse(b) - dates.parse(a)) / 86400000); },
  monthsBetween(a, b) {
    const A = dates.parse(a), B = dates.parse(b);
    return (B.getUTCFullYear() - A.getUTCFullYear()) * 12 + (B.getUTCMonth() - A.getUTCMonth()) + (B.getUTCDate() - A.getUTCDate()) / 30.4;
  },
  cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; },
};
