// samples.js — a synthetic book to argue with before you load your own.
//
// Every counterparty here is invented and every number is generated from the
// seed below. No real contract, no real carrier, no real loss sits in this file.
// The shape is what matters: a book where the caps look tidy, the carve-outs do
// not, and the aggregate is thinner than the tower suggests.

import { rng } from './sim.js';

const FIRST = [
  'Ardent', 'Meridian', 'Halcyon', 'Northwind', 'Calder', 'Verity', 'Sable',
  'Brightline', 'Corvid', 'Lockridge', 'Ashfield', 'Pinnacle', 'Kestrel',
  'Granite', 'Fairhaven', 'Solace', 'Thackeray', 'Wexler', 'Orillia', 'Draycott',
  'Bellamy', 'Camden', 'Everline', 'Foxhall', 'Greymoor', 'Harlow', 'Ivestead',
  'Jarrow', 'Kinsale', 'Lyndhurst', 'Marlowe', 'Norbury', 'Oakhurst', 'Pemberly',
  'Quarrier', 'Redmont', 'Stanhope', 'Tallow', 'Underhill', 'Vantage',
];
/** Trading names that match what the counterparty actually does. */
const SECOND = {
  CLIENT_SERVICES: ['Services', 'Group', 'Partners', 'Operations'],
  PROFESSIONAL_SERVICES: ['Advisory', 'Consulting', 'Partners', 'Associates'],
  TECHNOLOGY: ['Systems', 'Technologies', 'Software', 'Data', 'Networks'],
  SUPPLIER: ['Manufacturing', 'Industrial', 'Materials', 'Components'],
  CONSTRUCTION: ['Construction', 'Contracting', 'Builders', 'Civil'],
  LEASE_PROPERTY: ['Properties', 'Realty', 'Estates', 'Holdings'],
  DISTRIBUTION: ['Distribution', 'Trading', 'Supply', 'Wholesale'],
  STAFFING: ['Staffing', 'Personnel', 'Workforce', 'Resourcing'],
  LOGISTICS: ['Logistics', 'Freight', 'Transport', 'Carriers'],
};
const SUFFIX = ['LLC', 'Inc.', 'Corp.', 'LP', 'Co.'];

const MIX = [
  ['CLIENT_SERVICES', 0.17],
  ['PROFESSIONAL_SERVICES', 0.11],
  ['TECHNOLOGY', 0.16],
  ['SUPPLIER', 0.18],
  ['CONSTRUCTION', 0.08],
  ['LEASE_PROPERTY', 0.06],
  ['DISTRIBUTION', 0.09],
  ['STAFFING', 0.08],
  ['LOGISTICS', 0.07],
];

const OWNERS = ['Commercial', 'Procurement', 'Technology', 'Facilities', 'Operations', 'Legal'];

function pick(r, arr) { return arr[Math.floor(r() * arr.length) % arr.length]; }

function pickCategory(r) {
  let x = r();
  for (const [k, w] of MIX) { x -= w; if (x <= 0) return k; }
  return MIX[MIX.length - 1][0];
}

/**
 * Contract values follow a Pareto with alpha near 1.6 — heavy enough that a
 * handful of agreements carry a quarter of the book, not so heavy that one of
 * them carries half of it.
 */
function contractValue(r) {
  const u = r();
  const v = 620e3 * Math.pow(1 / Math.max(u, 1e-4), 0.62);
  return Math.min(180e6, Math.round(v / 10e3) * 10e3);
}

/**
 * Cap and carve-out drafting patterns, in roughly the proportions a real
 * negotiated book runs at: most contracts capped at a multiple of fees, a
 * meaningful minority uncapped, and carve-outs almost everywhere.
 */
function drafting(r, category, value) {
  const u = r();
  let capType = 'MULTIPLE';
  let capValue = '1x';
  if (u < 0.08) { capType = 'UNCAPPED'; capValue = ''; }
  else if (u < 0.30) { capType = 'AMOUNT'; capValue = String(Math.max(250e3, Math.round((value * (0.8 + r())) / 250e3) * 250e3)); }
  else if (u < 0.62) { capValue = '1x'; }
  else if (u < 0.86) { capValue = '2x'; }
  else { capValue = '3x'; }

  const carve = [];
  const heavy = category === 'TECHNOLOGY' || category === 'CLIENT_SERVICES';
  if (r() < (heavy ? 0.82 : 0.66)) carve.push('INDEMNITY=UNCAPPED');
  if (r() < (category === 'TECHNOLOGY' ? 0.74 : 0.34)) carve.push('IP=UNCAPPED');
  const dataRoll = r();
  if (dataRoll < 0.30) carve.push('DATA=UNCAPPED');
  else if (dataRoll < 0.58) carve.push(`DATA=${[2, 3, 5][Math.floor(r() * 3)]}x`);
  return { capType, capValue, carveouts: carve.join(';') };
}

function renewalDate(r) {
  const month = 1 + Math.floor(r() * 12);
  const day = 1 + Math.floor(r() * 28);
  const year = r() < 0.62 ? 2027 : 2028;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function generateRegister(seed = 4417, count = 412) {
  const r = rng(seed);
  const rows = [];
  const used = new Set();
  for (let i = 0; i < count; i++) {
    const category = pickCategory(r);
    let name;
    let guard = 0;
    do {
      name = `${pick(r, FIRST)} ${pick(r, SECOND[category])} ${pick(r, SUFFIX)}`;
      guard++;
    } while (used.has(name) && guard < 60);
    used.add(name);

    const value = contractValue(r);
    const d = drafting(r, category, value);
    rows.push({
      contract_id: `CT-${String(1000 + i)}`,
      counterparty: name,
      category,
      annual_value: String(value),
      cap_type: d.capType,
      cap_value: d.capValue,
      cap_carveouts: d.carveouts,
      renewal_date: renewalDate(r),
      owner: pick(r, OWNERS),
    });
  }
  return rows;
}

const REGISTER_HEADER = [
  'contract_id', 'counterparty', 'category', 'annual_value',
  'cap_type', 'cap_value', 'cap_carveouts', 'renewal_date', 'owner',
];

function toCSV(header, rows) {
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [header.join(','), ...rows.map((row) => header.map((h) => esc(row[h] ?? '')).join(','))].join('\n');
}

export function sampleRegisterCSV(seed, count) {
  return toCSV(REGISTER_HEADER, generateRegister(seed, count));
}

/**
 * A programme of the kind a company this size actually buys: a captive taking
 * the working layer on professional liability, a self-insured retention on
 * general liability, an umbrella shared across both, and a cyber tower that is
 * the only thing standing behind every data carve-out in the register.
 */
export const SAMPLE_PROGRAM_CSV = [
  'line,layer,attachment,limit,aggregate_limit,aggregate_eroded,retention,agg_group,captive,premium,defence',
  'PROF,Captive working layer,0,2500000,7500000,3100000,2500000,CAPTIVE-PROF,Y,0,INSIDE',
  'PROF,Primary professional liability,2500000,10000000,10000000,0,0,PROF-PRIMARY,N,1650000,INSIDE',
  'PROF,Excess professional liability,12500000,25000000,50000000,0,0,SHARED-UMBRELLA,N,1080000,INSIDE',
  'GL,Primary general liability,1000000,2000000,8000000,2900000,1000000,GL-PRIMARY,N,940000,OUTSIDE',
  'GL,Umbrella,3000000,50000000,50000000,0,0,SHARED-UMBRELLA,N,2100000,OUTSIDE',
  'GL,First excess,53000000,50000000,50000000,0,0,GL-EXCESS-1,N,1240000,OUTSIDE',
  'CYBER,Cyber primary,1000000,25000000,25000000,0,1000000,CYBER-PRIMARY,N,1420000,INSIDE',
].join('\n');

export const SAMPLE_NOTE =
  'Synthetic book: 412 invented counterparties and a seven-layer programme, generated from a fixed seed. ' +
  'It is here so the model has something to chew on before your own register is loaded. Nothing in it is real.';
