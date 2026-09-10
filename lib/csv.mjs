// Small, dependency-free CSV parser and serialiser. Handles quoted fields,
// embedded commas, doubled quotes and CRLF line endings.

export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', i = 0, inQuotes = false;
  const s = text.replace(/^\uFEFF/, '');
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}

export function parseCSVObjects(text) {
  const rows = parseCSV(text);
  if (!rows.length) return { header: [], records: [] };
  const header = rows[0].map(h => h.trim());
  const records = rows.slice(1).map(r => {
    const o = {};
    header.forEach((h, idx) => { o[h] = r[idx] === undefined ? '' : r[idx]; });
    return o;
  });
  return { header, records };
}

function esc(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCSV(header, rows) {
  const lines = [header.map(esc).join(',')];
  for (const r of rows) lines.push(header.map(h => esc(Array.isArray(r) ? r[header.indexOf(h)] : r[h])).join(','));
  return lines.join('\n');
}
