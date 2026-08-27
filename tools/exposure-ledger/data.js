// data.js — the two inputs, parsed and argued with.
//
// Input one is the contract register: what was promised. Input two is the
// insurance programme: what was bought. Everything downstream is the join.

import { CATEGORIES, PERILS, coverageLine } from './assume.js';

/* ------------------------------------------------------------------ CSV --- */

/** RFC4180-ish reader. Handles quoted fields, embedded commas, CRLF, BOM. */
export function parseCSV(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const push = () => { row.push(field); field = ''; };
  const endRow = () => { push(); if (row.length > 1 || row[0] !== '') rows.push(row); row = []; };
  while (i < src.length) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { quoted = true; i++; continue; }
    if (c === ',') { push(); i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { endRow(); i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) endRow();
  if (!rows.length) return { header: [], rows: [] };
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const out = rows.slice(1).map((r, idx) => {
    const o = { __line: idx + 2 };
    header.forEach((h, j) => { o[h] = (r[j] ?? '').trim(); });
    return o;
  });
  return { header, rows: out };
}

/** Money that arrives as "$1,500,000", "1.5m", "750k", "2.5M" or a bare number. */
export function money(raw) {
  if (raw === null || raw === undefined) return NaN;
  const s = String(raw).trim().toLowerCase().replace(/[$,\s]/g, '');
  if (!s) return NaN;
  const m = s.match(/^(-?[\d.]+)([kmb])?$/);
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  if (!isFinite(n)) return NaN;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1;
  return n * mult;
}

/* ------------------------------------------------------- liability caps --- */

/**
 * Carve-out syntax, written the way the clause reads:
 *
 *   INDEMNITY=UNCAPPED;DATA=3x;IP=5000000
 *
 * "3x" means three times annual contract value — the supercap that appears in
 * roughly every negotiated technology agreement and that nobody aggregates.
 * A peril that is not named stays under the general cap. GROSS is uncapped
 * whether or not it is named, because no cap survives it.
 */
export function parseCarveouts(raw) {
  const out = {};
  const s = String(raw || '').trim();
  if (s) {
    for (const part of s.split(/[;|]/)) {
      const seg = part.trim();
      if (!seg) continue;
      const [kRaw, vRaw] = seg.split('=');
      const key = String(kRaw || '').trim().toUpperCase();
      if (!PERILS.includes(key)) continue;
      const v = String(vRaw ?? 'UNCAPPED').trim().toUpperCase();
      if (!v || v === 'UNCAPPED' || v === 'NONE' || v === 'TRUE' || v === 'Y') {
        out[key] = { kind: 'UNCAPPED' };
      } else if (/^[\d.]+X$/.test(v)) {
        out[key] = { kind: 'MULTIPLE', value: parseFloat(v) };
      } else {
        const amt = money(v);
        out[key] = isFinite(amt) ? { kind: 'AMOUNT', value: amt } : { kind: 'UNCAPPED' };
      }
    }
  }
  if (!out.GROSS) out.GROSS = { kind: 'UNCAPPED' };
  return out;
}

/** The general liability cap: an amount, a multiple of annual value, or nothing at all. */
export function parseCap(type, value, annualValue) {
  const t = String(type || '').trim().toUpperCase();
  if (!t || t === 'UNCAPPED' || t === 'NONE' || t === 'NO_CAP') return Infinity;
  if (t === 'MULTIPLE' || t === 'MULTIPLE_OF_FEES' || t === 'X') {
    const mult = parseFloat(String(value).replace(/x/i, ''));
    return isFinite(mult) ? mult * annualValue : Infinity;
  }
  const amt = money(value);
  return isFinite(amt) ? amt : Infinity;
}

/** The dollar ceiling that actually applies to one peril on one contract. */
export function ceilingFor(contract, peril) {
  const carve = contract.carveouts[peril];
  if (carve) {
    if (carve.kind === 'UNCAPPED') return Infinity;
    if (carve.kind === 'MULTIPLE') return carve.value * contract.annualValue;
    return carve.value;
  }
  return contract.cap;
}

/* -------------------------------------------------- the contract register --- */

export const REGISTER_COLUMNS = [
  'contract_id', 'counterparty', 'category', 'annual_value',
  'cap_type', 'cap_value', 'cap_carveouts', 'renewal_date', 'owner',
];

const CAP_TYPES = new Set(['AMOUNT', 'MULTIPLE', 'MULTIPLE_OF_FEES', 'X', 'UNCAPPED', 'NONE', 'NO_CAP', '']);

export function loadRegister(text) {
  const { rows } = parseCSV(text);
  const contracts = [];
  const issues = [];
  const seen = new Set();

  rows.forEach((r) => {
    const id = r.contract_id || r.id || '';
    if (!id) {
      issues.push({ line: r.__line, level: 'error', msg: 'Row has no contract_id and was dropped.' });
      return;
    }
    if (seen.has(id)) {
      issues.push({ line: r.__line, level: 'error', msg: `Duplicate contract_id "${id}" — the later row was dropped.` });
      return;
    }
    seen.add(id);

    let category = String(r.category || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (!CATEGORIES[category]) {
      issues.push({ line: r.__line, level: 'warn', msg: `Unknown category "${r.category}" on ${id}; scored as SUPPLIER.` });
      category = 'SUPPLIER';
    }

    const annualValue = money(r.annual_value ?? r.value);
    if (!isFinite(annualValue) || annualValue < 0) {
      issues.push({ line: r.__line, level: 'error', msg: `${id} has no readable annual_value and was dropped.` });
      return;
    }

    // A number written 4,500,000 without quotes splits across three CSV fields
    // and arrives here as 4. It is the most common export defect there is, and
    // silently modelling a four-dollar contract is worse than refusing to.
    if (annualValue > 0 && annualValue < 1000) {
      issues.push({
        line: r.__line,
        level: 'warn',
        msg: `${id} has an annual_value of ${annualValue}. If the source spreadsheet wrote it with thousands separators and no quotes, the row has shifted and every column after it is wrong.`,
      });
    }

    const rawCapType = String(r.cap_type || '').trim().toUpperCase();
    if (!CAP_TYPES.has(rawCapType)) {
      issues.push({
        line: r.__line,
        level: 'warn',
        msg: `${id} has an unrecognised cap_type "${r.cap_type}". Expected AMOUNT, MULTIPLE or UNCAPPED; it was read as an amount.`,
      });
    }

    const cap = parseCap(r.cap_type, r.cap_value, annualValue);
    const carveouts = parseCarveouts(r.cap_carveouts);

    if (cap === 0) {
      issues.push({
        line: r.__line,
        level: 'warn',
        msg: `${id} resolves to a liability cap of zero, which would model it as carrying no exposure at all. Check cap_value.`,
      });
    }

    if (cap === Infinity && !String(r.cap_type || '').trim()) {
      issues.push({
        line: r.__line,
        level: 'warn',
        msg: `${id} has no cap_type; treated as uncapped. If that is wrong it will dominate the tail.`,
      });
    }

    contracts.push({
      id,
      counterparty: r.counterparty || r.vendor || '(unnamed)',
      category,
      annualValue,
      cap,
      capType: String(r.cap_type || '').trim().toUpperCase() || 'UNCAPPED',
      capRaw: r.cap_value || '',
      carveouts,
      carveoutsRaw: r.cap_carveouts || '',
      renewal: r.renewal_date || '',
      owner: r.owner || '',
      line: r.__line,
    });
  });

  return { contracts, issues };
}

/* ------------------------------------------------- the insurance programme --- */

export const PROGRAM_COLUMNS = [
  'line', 'layer', 'attachment', 'limit', 'aggregate_limit',
  'aggregate_eroded', 'retention', 'agg_group', 'captive', 'premium', 'defence',
];

export function loadProgram(text) {
  const { rows } = parseCSV(text);
  const layers = [];
  const issues = [];

  rows.forEach((r) => {
    const lineCode = String(r.line || '').trim().toUpperCase();
    if (!lineCode) {
      issues.push({ line: r.__line, level: 'error', msg: 'Layer has no line and was dropped.' });
      return;
    }
    const attachment = money(r.attachment ?? '0');
    const limit = money(r.limit);
    if (!isFinite(limit) || limit <= 0) {
      issues.push({ line: r.__line, level: 'error', msg: `${lineCode} ${r.layer || ''} has no readable limit and was dropped.` });
      return;
    }
    const aggregate = isFinite(money(r.aggregate_limit)) ? money(r.aggregate_limit) : limit;
    const eroded = isFinite(money(r.aggregate_eroded)) ? money(r.aggregate_eroded) : 0;
    if (eroded > aggregate) {
      issues.push({ line: r.__line, level: 'warn', msg: `${lineCode} ${r.layer || ''} is eroded past its own aggregate; treated as exhausted.` });
    }
    layers.push({
      lineCode,
      name: r.layer || `${lineCode} ${attachment > 0 ? 'excess' : 'primary'}`,
      attachment: isFinite(attachment) ? attachment : 0,
      limit,
      aggregate,
      eroded: Math.min(Math.max(eroded, 0), aggregate),
      retention: isFinite(money(r.retention)) ? money(r.retention) : 0,
      aggGroup: String(r.agg_group || '').trim().toUpperCase() || `${lineCode}#${r.__line}`,
      captive: /^(y|yes|true|1)$/i.test(String(r.captive || '')),
      premium: isFinite(money(r.premium)) ? money(r.premium) : 0,
      defence: r.defence || '',
      src: r.__line,
    });
  });

  // Per-occurrence retention is a property of the line, taken from whichever
  // layer sits at ground level.
  const retentionByLine = {};
  layers.forEach((l) => {
    if (l.attachment === 0) {
      retentionByLine[l.lineCode] = Math.max(retentionByLine[l.lineCode] || 0, l.retention);
    }
  });

  const byLine = {};
  layers.forEach((l) => { (byLine[l.lineCode] ||= []).push(l); });
  Object.values(byLine).forEach((ls) => ls.sort((a, b) => a.attachment - b.attachment));

  // Gaps between layers are silent and expensive; say so out loud.
  Object.entries(byLine).forEach(([code, ls]) => {
    for (let i = 1; i < ls.length; i++) {
      const below = ls[i - 1];
      const top = below.attachment + below.limit;
      if (ls[i].attachment > top + 1) {
        issues.push({
          line: ls[i].src,
          level: 'warn',
          msg: `${code} tower has an unfilled gap between ${fmtShort(top)} and ${fmtShort(ls[i].attachment)}. Loss landing there is fully retained.`,
        });
      }
    }
  });

  return { layers, byLine, retentionByLine, issues };
}

function fmtShort(n) {
  if (!isFinite(n)) return 'unlimited';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n)}`;
}

/* --------------------------------------------------------- the join view --- */

/**
 * Flatten the register into the exposure units the simulator actually walks:
 * one row per contract per peril, carrying its ceiling and the line that
 * answers for it. This is the object the tool is named after.
 */
export function buildLedger(contracts, program) {
  const units = [];
  contracts.forEach((c, ci) => {
    PERILS.forEach((peril) => {
      const lineCode = coverageLine(c.category, peril);
      const ceiling = ceilingFor(c, peril);
      const covered = lineCode !== 'NONE' && !!(program.byLine[lineCode] || []).length;
      units.push({
        contractIndex: ci,
        contractId: c.id,
        counterparty: c.counterparty,
        category: c.category,
        peril,
        ceiling,
        lineCode,
        covered,
        uncapped: ceiling === Infinity,
        carvedOut: !!c.carveouts[peril],
      });
    });
  });
  return units;
}
