// Loss-run pipeline engine: ingest a third-party administrator's loss run,
// standardise it, validate it, reconcile it against the prior run, and
// produce the exports that feed reserving and reporting.
//
// Pure functions; no DOM. The UI in app.mjs and the tests in selftest.mjs
// both drive this file.

import { makeRng } from '../../lib/rng.mjs';
import { parseCSV, toCSV } from '../../lib/csv.mjs';
import { dates } from '../../lib/format.mjs';
import { snapshot, ENTITIES, LINES } from '../../data/book.mjs';

// ---------------------------------------------------------------------------
// 1. The raw file: what a TPA actually sends.

const RAW_HEADER = ['Clm No', 'Insured Name', 'Claimant', 'LOB', 'Loss St', 'DOL', 'Rpt Dt', 'Closed Dt', 'Sts', 'Cause Desc', 'Tot Paid', 'O/S Rsv', 'Tot Incd', 'Adjuster', 'Lit Flag', 'Pol Yr', 'TPA Office'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STATE_NAMES = { TX: 'Texas', LA: 'Louisiana', OK: 'Oklahoma', NM: 'New Mexico', AR: 'Arkansas', CO: 'Colorado' };

function fmtDateVariant(iso, style) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  switch (style) {
    case 0: return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`;
    case 1: return `${m}/${d}/${String(y).slice(2)}`;
    case 2: return iso;
    default: return `${String(d).padStart(2, '0')}-${MONTHS[m - 1]}-${y}`;
  }
}
function fmtMoneyVariant(v, style) {
  const neg = v < 0; const a = Math.abs(v);
  const withCommas = a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  switch (style) {
    case 0: return (neg ? '-' : '') + '$' + withCommas;
    case 1: return (neg ? '-' : '') + a.toFixed(2);
    case 2: return neg ? `(${withCommas})` : withCommas;
    default: return ' ' + (neg ? '-' : '') + withCommas + ' ';
  }
}
const STATUS_VARIANTS = { Open: ['Open', 'OPEN', 'O', 'Open '], Closed: ['Closed', 'CLOSED', 'C', 'Closed '], Reopened: ['Reopened', 'Re-Opened', 'REOPEN', 'RO'] };

// Build the raw loss run as the TPA would deliver it: inconsistent formats
// throughout, plus a handful of genuine data defects. Every defect is
// recorded so the pipeline's findings can be checked against the truth.
export function buildRawLossRun(book, { asOf = book.evaluationDate, seed = 'tpa-file' } = {}) {
  const rng = makeRng(seed + asOf);
  const snap = snapshot(book, asOf);
  const entityByCode = Object.fromEntries(ENTITIES.map(e => [e.code, e]));
  const rows = [];
  const injected = [];
  const office = { TX: 'Houston', LA: 'Baton Rouge', OK: 'Tulsa', NM: 'Albuquerque', AR: 'Little Rock', CO: 'Denver' };

  const rowFor = (c, overrides = {}) => {
    const ent = entityByCode[c.entity];
    const ds = rng.int(0, 3), ms = rng.int(0, 3);
    const entName = rng.next() < 0.35 ? rng.pick(ent.aliases) : ent.name;
    const st = rng.next() < 0.12 ? (rng.next() < 0.5 ? STATE_NAMES[c.state] : c.state.toLowerCase()) : c.state;
    const r = {
      'Clm No': c.id, 'Insured Name': entName, 'Claimant': c.claimant, 'LOB': c.line, 'Loss St': st,
      'DOL': fmtDateVariant(c.lossDate, ds), 'Rpt Dt': fmtDateVariant(c.reportDate, ds), 'Closed Dt': fmtDateVariant(c.closedDate, ds),
      'Sts': rng.pick(STATUS_VARIANTS[c.status]), 'Cause Desc': c.cause,
      'Tot Paid': fmtMoneyVariant(c.paid, ms), 'O/S Rsv': fmtMoneyVariant(c.outstanding, ms), 'Tot Incd': fmtMoneyVariant(c.incurred, ms),
      'Adjuster': c.adjuster, 'Lit Flag': c.litigated ? (rng.next() < 0.5 ? 'Y' : 'Yes') : (rng.next() < 0.5 ? 'N' : ''), 'Pol Yr': String(c.py), 'TPA Office': office[c.state] || 'Houston',
      ...overrides,
    };
    return r;
  };

  for (const c of snap) rows.push(rowFor(c));

  // Genuine defects, on a deterministic sample of claims.
  const pickIds = n => rng.shuffle(snap).slice(0, n);
  const idx = id => rows.findIndex(r => r['Clm No'] === id);

  for (const c of pickIds(6)) { // duplicates: a stale copy of the row appears earlier in the file
    const stale = rowFor({ ...c, paid: Math.max(0, c.paid - 1500), incurred: Math.max(0, c.incurred - 1500) });
    rows.splice(rng.int(0, rows.length - 1), 0, stale);
    injected.push({ id: c.id, kind: 'duplicate' });
  }
  for (const c of pickIds(3)) { const i = idx(c.id); rows[i]['Clm No'] = ''; injected.push({ id: c.id, kind: 'missing-claim-number' }); }
  for (const c of pickIds(2)) { const i = idx(c.id); rows[i]['Tot Paid'] = fmtMoneyVariant(-Math.abs(c.paid || 800), rng.int(0, 3)); injected.push({ id: c.id, kind: 'negative-paid' }); }
  for (const c of pickIds(5)) { const i = idx(c.id); rows[i]['Tot Incd'] = fmtMoneyVariant(c.incurred + rng.int(500, 9000), rng.int(0, 3)); injected.push({ id: c.id, kind: 'incurred-mismatch' }); }
  for (const c of pickIds(2)) { const i = idx(c.id); rows[i]['Rpt Dt'] = fmtDateVariant(dates.addDays(c.lossDate, -365), rng.int(0, 3)); injected.push({ id: c.id, kind: 'report-before-loss' }); }
  for (const c of pickIds(40).filter(c => c.status === 'Closed').slice(0, 4)) { const i = idx(c.id); rows[i]['O/S Rsv'] = fmtMoneyVariant(rng.int(1000, 20000), rng.int(0, 3)); injected.push({ id: c.id, kind: 'closed-with-reserve' }); }
  for (const c of pickIds(1)) { const i = idx(c.id); rows[i]['LOB'] = 'PROP'; injected.push({ id: c.id, kind: 'unknown-line' }); }
  for (const c of pickIds(1)) { const i = idx(c.id); rows[i]['Insured Name'] = 'Northline Holdings'; injected.push({ id: c.id, kind: 'unknown-entity' }); }
  for (const c of pickIds(3)) { const i = idx(c.id); rows[i]['DOL'] = '13/45/2025'; injected.push({ id: c.id, kind: 'unparseable-date' }); }

  const text = toCSV(RAW_HEADER, rows.map(r => RAW_HEADER.map(h => r[h])));
  return { text, rowCount: rows.length, injected, asOf };
}

// ---------------------------------------------------------------------------
// 2. Column mapping: canonical field -> header patterns seen in the wild.

export const CANONICAL = [
  { key: 'claimId', label: 'Claim number', patterns: [/^clm\s*(no|nbr|num|#)?$/i, /claim\s*(no|nbr|number|#|id)/i, /^claim$/i] , required: true },
  { key: 'entity', label: 'Insured entity', patterns: [/insured/i, /entity/i, /named\s*insured/i, /company/i], required: true },
  { key: 'claimant', label: 'Claimant', patterns: [/claimant/i, /employee/i], pii: true },
  { key: 'line', label: 'Line of business', patterns: [/^lob$/i, /line/i, /coverage/i], required: true },
  { key: 'state', label: 'Loss state', patterns: [/state/i, /loss\s*st/i, /juris/i] },
  { key: 'lossDate', label: 'Date of loss', patterns: [/^dol$/i, /loss\s*d(a)?te?/i, /date\s*of\s*loss/i, /accident\s*date/i], required: true },
  { key: 'reportDate', label: 'Report date', patterns: [/rpt/i, /report(ed)?\s*d(a)?te?/i, /notice/i] },
  { key: 'closedDate', label: 'Closed date', patterns: [/clos(ed)?\s*d(a)?te?/i] },
  { key: 'status', label: 'Status', patterns: [/^sts$/i, /status/i] , required: true },
  { key: 'cause', label: 'Cause', patterns: [/cause/i, /nature/i, /description/i] },
  { key: 'paid', label: 'Total paid', patterns: [/tot(al)?\s*p(ai)?d/i, /^paid/i, /paid\s*(to\s*date|total)/i], required: true },
  { key: 'outstanding', label: 'Outstanding reserve', patterns: [/o\/?s\s*rsv/i, /outstanding/i, /reserve/i, /^o\/s/i], required: true },
  { key: 'incurred', label: 'Total incurred', patterns: [/inc(urre)?d/i, /incurred/i] },
  { key: 'adjuster', label: 'Adjuster', patterns: [/adjuster/i, /examiner/i, /handler/i] },
  { key: 'litigated', label: 'Litigated', patterns: [/lit/i, /suit/i, /attorney/i] },
  { key: 'py', label: 'Policy year', patterns: [/pol(icy)?\s*y(ea)?r/i, /^py$/i] },
];

export function mapColumns(header) {
  const mapping = {}; const used = new Set(); const unmapped = [];
  for (const field of CANONICAL) {
    const i = header.findIndex((h, idx) => !used.has(idx) && field.patterns.some(p => p.test(h.trim())));
    if (i >= 0) { mapping[field.key] = header[i]; used.add(i); }
  }
  header.forEach((h, i) => { if (!used.has(i)) unmapped.push(h); });
  const missing = CANONICAL.filter(f => f.required && !mapping[f.key]).map(f => f.label);
  return { mapping, unmapped, missing };
}

// ---------------------------------------------------------------------------
// 3. Standardisers. Each returns { value, changed, error? }.

export function parseDate(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { value: null, changed: false };
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return valid(+m[1], +m[2], +m[3], false);
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return valid(+m[3], +m[1], +m[2], true);
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/))) return valid(2000 + +m[3], +m[1], +m[2], true);
  if ((m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/))) { const mo = MONTHS.findIndex(x => x.toLowerCase() === m[2].toLowerCase()) + 1; return valid(+m[3], mo, +m[1], true); }
  return { value: null, changed: false, error: `unparseable date "${s}"` };
  function valid(y, mo, d, changed) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return { value: null, changed: false, error: `unparseable date "${s}"` };
    const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const back = dates.toISO(dates.parse(iso));
    if (back !== iso) return { value: null, changed: false, error: `impossible date "${s}"` };
    return { value: iso, changed };
  }
}

export function parseMoney(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return { value: 0, changed: false };
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  const cleaned = s.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return { value: null, changed: false, error: `unparseable amount "${raw}"` };
  const v = Math.round(parseFloat(cleaned) * 100) / 100;
  return { value: neg ? -v : v, changed: String(raw) !== String(v) };
}

const STATUS_MAP = [[/^(o|open)$/i, 'Open'], [/^(c|cl|closed)$/i, 'Closed'], [/^(ro|re-?open(ed)?)$/i, 'Reopened']];
export function parseStatus(raw) {
  const s = String(raw ?? '').trim();
  for (const [re, v] of STATUS_MAP) if (re.test(s)) return { value: v, changed: s !== v };
  return { value: null, changed: false, error: `unknown status "${raw}"` };
}

const STATE_LOOKUP = Object.fromEntries(Object.entries(STATE_NAMES).map(([k, v]) => [v.toLowerCase(), k]));
export function parseState(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { value: null, changed: false };
  if (/^[A-Za-z]{2}$/.test(s)) return { value: s.toUpperCase(), changed: s !== s.toUpperCase() };
  const code = STATE_LOOKUP[s.toLowerCase()];
  return code ? { value: code, changed: true } : { value: null, changed: false, error: `unknown state "${raw}"` };
}

export function makeEntityResolver(entities = ENTITIES) {
  const lookup = new Map();
  const norm = s => s.toLowerCase().replace(/[.,]/g, '').replace(/\b(llc|inc|group|grp|corp|co)\b/g, '').replace(/\s+/g, ' ').trim();
  const canonical = new Set();
  for (const e of entities) { lookup.set(norm(e.name), e.code); canonical.add(norm(e.name)); lookup.set(e.code.toLowerCase(), e.code); canonical.add(e.code.toLowerCase()); for (const a of e.aliases) lookup.set(norm(a), e.code); }
  return raw => {
    const s = String(raw ?? '').trim();
    const code = lookup.get(norm(s));
    if (code) return { value: code, changed: !canonical.has(norm(s)) };
    return { value: null, changed: false, error: `unknown entity "${raw}"` };
  };
}

export function parseLine(raw, lines = LINES) {
  const s = String(raw ?? '').trim().toUpperCase();
  const map = { WC: 'WC', 'WORKERS COMP': 'WC', 'WORKERS COMPENSATION': 'WC', "WORKERS' COMPENSATION": 'WC', GL: 'GL', 'GENERAL LIABILITY': 'GL', AL: 'AL', 'AUTO LIABILITY': 'AL', AUTO: 'AL' };
  const v = map[s];
  return v && lines[v] ? { value: v, changed: s !== v } : { value: null, changed: false, error: `unknown line "${raw}"` };
}

export function parseFlag(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  return { value: ['y', 'yes', 'true', '1', 'x'].includes(s), changed: false };
}

// ---------------------------------------------------------------------------
// 4. The pipeline.

export function runPipeline(rawText, { prior = [], asOf, priorAsOf, entities = ENTITIES, lines = LINES, thresholds = {} } = {}) {
  const T = { reserveMove: 25000, largeNew: 100000, ...thresholds };
  const steps = [];
  const log = (step, level, msg) => step.log.push({ level, msg });
  const newStep = name => { const s = { name, log: [], counts: {} }; steps.push(s); return s; };

  // -- parse
  let step = newStep('Parse');
  const rows = parseCSV(rawText);
  const header = (rows[0] || []).map(h => h.trim());
  const body = rows.slice(1);
  step.counts = { rows: body.length, columns: header.length };
  log(step, 'info', `${body.length.toLocaleString()} data rows, ${header.length} columns`);
  const { mapping, unmapped, missing } = mapColumns(header);
  for (const f of CANONICAL) if (mapping[f.key]) log(step, 'ok', `${f.label} ← "${mapping[f.key]}"`);
  for (const u of unmapped) log(step, 'warn', `column "${u}" not mapped; carried through untouched`);
  if (missing.length) { log(step, 'err', `required fields missing: ${missing.join(', ')}`); return { steps, fatal: `Required fields missing: ${missing.join(', ')}`, mapping, unmapped }; }
  const col = key => header.indexOf(mapping[key]);
  const get = (r, key) => mapping[key] ? r[col(key)] : undefined;

  // -- standardise
  step = newStep('Standardise');
  const resolveEntity = makeEntityResolver(entities);
  const changes = {};
  const bump = k => { changes[k] = (changes[k] || 0) + 1; };
  const records = [];
  const quarantined = [];
  body.forEach((r, i) => {
    const rec = { _row: i + 2, _errors: [] };
    const take = (key, fn) => {
      const res = fn(get(r, key));
      if (res.error) rec._errors.push({ field: key, error: res.error });
      if (res.changed) bump(key);
      rec[key] = res.value;
    };
    rec.claimId = String(get(r, 'claimId') ?? '').trim();
    take('entity', resolveEntity);
    take('line', v => parseLine(v, lines));
    take('state', parseState);
    take('lossDate', parseDate);
    take('reportDate', parseDate);
    take('closedDate', parseDate);
    take('status', parseStatus);
    take('paid', parseMoney);
    take('outstanding', parseMoney);
    take('incurred', parseMoney);
    take('litigated', parseFlag);
    rec.claimant = mapping.claimant ? String(get(r, 'claimant') ?? '').trim() : '';
    rec.cause = mapping.cause ? String(get(r, 'cause') ?? '').trim() : '';
    rec.adjuster = mapping.adjuster ? String(get(r, 'adjuster') ?? '').trim() : '';
    rec.py = mapping.py ? Number(get(r, 'py')) || null : null;
    if (!rec.py && rec.lossDate) { const [y, m] = rec.lossDate.split('-').map(Number); rec.py = m >= 9 ? y : y - 1; }
    records.push(rec);
  });
  const labels = { entity: 'entity name variants resolved', line: 'line codes normalised', state: 'state names normalised', lossDate: 'loss dates reformatted', reportDate: 'report dates reformatted', closedDate: 'closed dates reformatted', status: 'status labels normalised', paid: 'paid amounts parsed', outstanding: 'reserve amounts parsed', incurred: 'incurred amounts parsed' };
  for (const [k, n] of Object.entries(changes)) log(step, 'ok', `${n.toLocaleString()} ${labels[k] || k}`);
  step.counts = changes;

  // -- validate
  step = newStep('Validate');
  const exceptions = [];
  const seen = new Map();
  const add = (rec, rule, severity, detail, action) => exceptions.push({ row: rec._row, claimId: rec.claimId || '(blank)', rule, severity, detail, action });
  for (const rec of records) {
    if (!rec.claimId) { add(rec, 'Missing claim number', 'block', `row ${rec._row} has no claim number`, 'Quarantined; TPA to supply the number'); rec._quarantine = true; continue; }
    for (const e of rec._errors) {
      const blocking = ['entity', 'line', 'lossDate', 'status', 'paid', 'outstanding'].includes(e.field);
      add(rec, 'Unreadable field', blocking ? 'block' : 'warn', `${e.field}: ${e.error}`, blocking ? 'Quarantined until corrected' : 'Loaded with field blank');
      if (blocking) rec._quarantine = true;
    }
    if (rec._quarantine) continue;
    if (seen.has(rec.claimId)) {
      const first = seen.get(rec.claimId);
      add(rec, 'Duplicate claim number', 'warn', `also at row ${first._row}; kept the later row (incurred ${rec.incurred.toLocaleString('en-US')} against ${first.incurred.toLocaleString('en-US')})`, 'Earlier row dropped');
      first._quarantine = true; first._dupe = true;
    }
    seen.set(rec.claimId, rec);
    if (rec.paid < 0) { add(rec, 'Negative paid', 'block', `paid ${rec.paid.toLocaleString('en-US')}`, 'Quarantined; likely a recovery posted as a payment'); rec._quarantine = true; continue; }
    if (rec.reportDate && rec.lossDate && rec.reportDate < rec.lossDate) { add(rec, 'Reported before loss', 'block', `reported ${rec.reportDate}, loss ${rec.lossDate}`, 'Quarantined; one of the dates is wrong'); rec._quarantine = true; continue; }
    const expected = Math.round((rec.paid + rec.outstanding) * 100) / 100;
    if (rec.incurred !== null && Math.abs(rec.incurred - expected) > 0.01) { add(rec, 'Incurred does not foot', 'warn', `file says ${rec.incurred.toLocaleString('en-US')}, paid + reserve is ${expected.toLocaleString('en-US')}`, 'Incurred recomputed'); rec.incurred = expected; rec._recomputed = true; }
    if (rec.incurred === null) rec.incurred = expected;
    if (rec.status === 'Closed' && rec.outstanding > 0) { add(rec, 'Closed with open reserve', 'warn', `outstanding ${rec.outstanding.toLocaleString('en-US')} on a closed claim`, 'Loaded as-is; adjuster to release or reopen'); }
    if (rec.status !== 'Closed' && rec.closedDate) { add(rec, 'Open with closed date', 'warn', `status ${rec.status} but closed ${rec.closedDate}`, 'Loaded as-is'); }
    if (rec.incurred > 250000 * 1.13) { add(rec, 'Incurred above retention', 'warn', `incurred ${rec.incurred} exceeds the per-occurrence retention`, 'Confirm excess carrier notified'); }
  }
  const clean = records.filter(r => !r._quarantine);
  for (const r of records) if (r._quarantine && !r._dupe) quarantined.push(r);
  const blocks = exceptions.filter(e => e.severity === 'block').length, warns = exceptions.length - blocks;
  log(step, blocks ? 'err' : 'ok', `${blocks} blocking exception${blocks === 1 ? '' : 's'}, ${warns} warning${warns === 1 ? '' : 's'}`);
  log(step, 'info', `${clean.length.toLocaleString()} claims loaded, ${quarantined.length} quarantined, ${records.filter(r => r._dupe).length} duplicate rows dropped`);
  step.counts = { blocks, warns, loaded: clean.length, quarantined: quarantined.length };

  // control totals
  const sum = (arr, k) => Math.round(arr.reduce((s, r) => s + (r[k] || 0), 0) * 100) / 100;
  const rawIncurred = records.reduce((s, r) => s + (r._rawIncurred ?? 0), 0);
  const totals = { claims: clean.length, open: clean.filter(r => r.status !== 'Closed').length, paid: sum(clean, 'paid'), outstanding: sum(clean, 'outstanding'), incurred: sum(clean, 'incurred') };

  // -- reconcile
  step = newStep('Reconcile with prior run');
  const priorById = new Map(prior.map(p => [p.id ?? p.claimId, p]));
  const activity = { newClaims: [], closed: [], reopened: [], reserveMoves: [], largeNew: [], payments: 0, paymentsCount: 0, priorTotals: null, missingFromFile: [] };
  for (const rec of clean) {
    const p = priorById.get(rec.claimId);
    if (!p) { activity.newClaims.push(rec); if (rec.incurred >= T.largeNew) activity.largeNew.push(rec); continue; }
    const paidDelta = Math.round((rec.paid - p.paid) * 100) / 100;
    if (paidDelta > 0) { activity.payments += paidDelta; activity.paymentsCount++; }
    const resDelta = Math.round((rec.outstanding - p.outstanding) * 100) / 100;
    if (Math.abs(resDelta) >= T.reserveMove) activity.reserveMoves.push({ rec, delta: resDelta, from: p.outstanding, to: rec.outstanding });
    if (p.status !== 'Closed' && rec.status === 'Closed') activity.closed.push(rec);
    if (p.status === 'Closed' && rec.status !== 'Closed') activity.reopened.push(rec);
  }
  const fileIds = new Set(records.map(r => r.claimId).filter(Boolean));
  for (const p of prior) if (!fileIds.has(p.id ?? p.claimId)) activity.missingFromFile.push(p);
  if (prior.length) {
    activity.priorTotals = { claims: prior.length, open: prior.filter(r => r.status !== 'Closed').length, paid: sum(prior, 'paid'), outstanding: sum(prior, 'outstanding'), incurred: sum(prior, 'incurred') };
    log(step, 'info', `prior run ${priorAsOf || ''}: ${prior.length.toLocaleString()} claims, incurred ${activity.priorTotals.incurred.toLocaleString()}`);
    log(step, 'ok', `${activity.newClaims.length} new, ${activity.closed.length} closed, ${activity.reopened.length} reopened, ${activity.reserveMoves.length} reserve moves ≥ ${T.reserveMove.toLocaleString()}`);
    log(step, 'ok', `${activity.paymentsCount} claims paid a total of ${Math.round(activity.payments).toLocaleString()} since the prior run`);
    if (activity.missingFromFile.length) log(step, 'warn', `${activity.missingFromFile.length} claims present in the prior run are missing from this file`);
    if (activity.largeNew.length) log(step, 'warn', `${activity.largeNew.length} new claim(s) reported at or above ${T.largeNew.toLocaleString()} incurred`);
  } else log(step, 'info', 'no prior run supplied; activity report skipped');
  step.counts = { newClaims: activity.newClaims.length, closed: activity.closed.length, reopened: activity.reopened.length, reserveMoves: activity.reserveMoves.length, missing: activity.missingFromFile.length };

  // -- export
  step = newStep('Export');
  const actuarialHeader = ['claim_id', 'entity', 'line', 'policy_year', 'state', 'loss_date', 'report_date', 'closed_date', 'status', 'cause', 'litigated', 'paid', 'outstanding', 'incurred', 'valuation_date'];
  const actuarialRows = clean.map(r => [r.claimId, r.entity, r.line, r.py, r.state, r.lossDate, r.reportDate, r.closedDate, r.status, r.cause, r.litigated ? 'Y' : 'N', r.paid.toFixed(2), r.outstanding.toFixed(2), r.incurred.toFixed(2), asOf]);
  const exports = {
    actuarial: toCSV(actuarialHeader, actuarialRows),
    exceptions: toCSV(['row', 'claim_id', 'rule', 'severity', 'detail', 'action'], exceptions.map(e => [e.row, e.claimId, e.rule, e.severity, e.detail, e.action])),
    activity: toCSV(['event', 'claim_id', 'entity', 'line', 'status', 'paid', 'outstanding', 'incurred', 'detail'], [
      ...activity.newClaims.map(r => ['New claim', r.claimId, r.entity, r.line, r.status, r.paid, r.outstanding, r.incurred, r.cause]),
      ...activity.closed.map(r => ['Closed', r.claimId, r.entity, r.line, r.status, r.paid, r.outstanding, r.incurred, '']),
      ...activity.reopened.map(r => ['Reopened', r.claimId, r.entity, r.line, r.status, r.paid, r.outstanding, r.incurred, '']),
      ...activity.reserveMoves.map(m => ['Reserve change', m.rec.claimId, m.rec.entity, m.rec.line, m.rec.status, m.rec.paid, m.rec.outstanding, m.rec.incurred, `${m.from} → ${m.to}`]),
    ]),
  };
  log(step, 'ok', `actuarial export: ${clean.length.toLocaleString()} rows, ${actuarialHeader.length} columns; claimant names withheld`);
  log(step, 'ok', `activity report: ${activity.newClaims.length + activity.closed.length + activity.reopened.length + activity.reserveMoves.length} events`);
  log(step, 'ok', `exception file: ${exceptions.length} rows`);
  if (mapping.claimant) log(step, 'info', 'claimant column recognised as personal data and excluded from every export');

  // -- gate
  step = newStep('Release gate');
  const reasons = [];
  if (blocks) reasons.push(`resolve or accept ${blocks} blocking exception${blocks === 1 ? '' : 's'}`);
  if (activity.largeNew.length) reasons.push(`acknowledge ${activity.largeNew.length} new claim${activity.largeNew.length === 1 ? '' : 's'} above the large-claim threshold`);
  if (activity.missingFromFile.length) reasons.push(`account for ${activity.missingFromFile.length} claim${activity.missingFromFile.length === 1 ? '' : 's'} that dropped out of the TPA file`);
  const held = reasons.length > 0;
  log(step, held ? 'warn' : 'ok', held ? `held for human review: ${reasons.join('; ')}` : 'no blocking findings; exports released to reporting');
  step.counts = { held, reasons };

  return { steps, mapping, unmapped, records: clean, quarantined, exceptions, totals, activity, exports, gate: { held, reasons }, asOf, priorAsOf, rawIncurred };
}
