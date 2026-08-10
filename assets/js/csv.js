// Minimal RFC 4180 CSV parse/serialize. Handles quoted fields, embedded commas,
// escaped quotes, and CRLF. No dependency, no streaming — these tools work on
// datasets that comfortably fit in memory.

/**
 * Parse CSV text into an array of row arrays.
 * @param {string} text
 * @returns {string[][]}
 */
export function parseRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;

  // Strip a UTF-8 BOM if Excel left one behind.
  if (text.charCodeAt(0) === 0xfeff) i = 1;

  for (; i < text.length; i++) {
    const c = text[i];

    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') { quoted = true; }
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* handled by the \n branch */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }

  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r[0] ?? '').trim() !== '');
}

/**
 * Parse CSV text into objects keyed by the header row.
 * Header keys are lowercased and non-alphanumerics collapsed to underscores.
 * @param {string} text
 * @returns {{headers: string[], keys: string[], rows: Object[]}}
 */
export function parseObjects(text) {
  const rows = parseRows(text);
  if (!rows.length) return { headers: [], keys: [], rows: [] };
  const headers = rows[0].map(h => h.trim());
  const keys = headers.map(normalizeKey);
  const out = rows.slice(1).map(r => {
    const o = {};
    keys.forEach((k, idx) => { o[k] = (r[idx] ?? '').trim(); });
    return o;
  });
  return { headers, keys, rows: out };
}

export function normalizeKey(header) {
  return String(header)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Serialize rows (arrays or objects) to CSV text. */
export function toCSV(rows, headers) {
  if (!rows.length) return '';
  const isObj = !Array.isArray(rows[0]);
  const cols = headers ?? (isObj ? Object.keys(rows[0]) : null);
  const lines = [];
  if (cols) lines.push(cols.map(escapeCell).join(','));
  for (const r of rows) {
    const cells = isObj ? cols.map(c => r[c]) : r;
    lines.push(cells.map(escapeCell).join(','));
  }
  return lines.join('\r\n');
}

function escapeCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Trigger a client-side file download. */
export function download(filename, text, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
