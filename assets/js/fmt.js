// fmt.js — number and date formatting, shared across tools.

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** Full dollars, no cents: $1,284,000. */
export function dollars(n) {
  if (!isFinite(n)) return '—';
  return usd0.format(Math.round(n));
}

/** Compact dollars for headline figures: $28.1M, $940k, $1.2B. */
export function short(n, { sign = false } = {}) {
  if (!isFinite(n)) return '—';
  const s = n < 0 ? '-' : sign && n > 0 ? '+' : '';
  const a = Math.abs(n);
  if (a >= 1e9) return `${s}$${trim(a / 1e9)}B`;
  if (a >= 1e6) return `${s}$${trim(a / 1e6)}M`;
  if (a >= 1e4) return `${s}$${Math.round(a / 1e3)}k`;
  if (a >= 1e3) return `${s}$${trim(a / 1e3)}k`;
  return `${s}$${Math.round(a)}`;
}

function trim(v) {
  if (v >= 100) return String(Math.round(v));
  if (v >= 10) return v.toFixed(1).replace(/\.0$/, '');
  return v.toFixed(2).replace(/0$/, '').replace(/\.$/, '');
}

/** Limits written the way a broker writes them: $10M xs $2.5M. */
export function limitLabel(attachment, limit) {
  return attachment > 0 ? `${short(limit)} xs ${short(attachment)}` : `${short(limit)} primary`;
}

export function pct(x, digits = 1) {
  if (!isFinite(x)) return '—';
  return `${(x * 100).toFixed(digits)}%`;
}

export function count(n) {
  return new Intl.NumberFormat('en-US').format(n);
}

/** "1 in 34 years" reads better to a board than "2.9%". */
export function returnPeriod(p) {
  if (!(p > 0)) return 'not seen in the simulation';
  const years = 1 / p;
  if (years >= 1000) return 'rarer than 1 in 1,000 years';
  if (years < 1.05) return 'in effectively every year';
  return `about 1 year in ${years < 10 ? years.toFixed(1) : Math.round(years)}`;
}

export function today() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

/** Escape for insertion into HTML text or attribute content. */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Trigger a client-side download of generated text. */
export function download(filename, text, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Quote a value for CSV output. */
export function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(header, rows) {
  return [header.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n');
}
