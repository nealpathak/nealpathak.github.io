// assume.js — the assumption set behind the model.
//
// Nothing in this file is a fact. It is a starting frequency/severity view for a
// mid-to-large US corporate contract book, written down so it can be argued with
// and replaced. The calibration panel overwrites every number here from a
// company's own claim history; until it does, these defaults are labelled as
// illustrative everywhere they surface.

/** The five ways a commercial contract turns into money going out the door. */
export const PERILS = ['GENERAL', 'INDEMNITY', 'IP', 'DATA', 'GROSS'];

export const PERIL_META = {
  GENERAL: {
    label: 'Performance / negligence',
    blurb: 'Ordinary breach and negligent performance claims brought by the counterparty. Almost always sits under the liability cap.',
  },
  INDEMNITY: {
    label: 'Third-party indemnity',
    blurb: 'Defence and indemnity owed for claims brought by someone outside the contract. The most commonly carved out of the cap, and the most commonly under-reserved.',
  },
  IP: {
    label: 'IP infringement',
    blurb: 'Infringement claims flowing from what was delivered. Carved out of the cap as a matter of course, and excluded from the general liability form as a matter of course.',
  },
  DATA: {
    label: 'Data / confidentiality',
    blurb: 'Breach of confidentiality and security obligations. Usually carved out or given its own supercap; responds to cyber, not to GL.',
  },
  GROSS: {
    label: 'Gross negligence / wilful',
    blurb: 'Conduct that no cap survives and most policies exclude. Small frequency, no ceiling — which is why it dominates the far tail.',
  },
};

/**
 * Which policy line answers for each peril, by contract category.
 * 'NONE' is a real and deliberate answer: it means the corporation retains this
 * loss in full because no standard form responds to it.
 */
export const DEFAULT_COVERAGE = {
  GENERAL: 'PROF',
  INDEMNITY: 'GL',
  IP: 'NONE',
  DATA: 'CYBER',
  GROSS: 'NONE',
};

export const COVERAGE_NOTES = {
  IP: 'The ISO general liability form excludes infringement of patent, trademark and trade secret from personal and advertising injury. Unless a standalone IP policy has been bought, this class is uninsured.',
  GROSS: 'Insuring gross negligence and wilful misconduct is void as against public policy in most US states, and excluded by the forms in any event.',
  DATA: 'Responds to cyber, not to GL or E&O. If no cyber tower is entered below, this class runs uninsured.',
};

/**
 * Contract categories. `line` overrides DEFAULT_COVERAGE where the category
 * changes which form responds — a construction indemnity answers to GL, a
 * consulting failure answers to professional liability.
 *
 * freq — expected claims per year for a contract carrying $1M of annual value.
 * sev  — median claim size for a contract carrying $1M of annual value.
 */
export const CATEGORIES = {
  CLIENT_SERVICES: {
    label: 'Client services (revenue)',
    line: { GENERAL: 'PROF' },
    freq: { GENERAL: 0.030, INDEMNITY: 0.012, IP: 0.0020, DATA: 0.0045, GROSS: 0.0008 },
    sev:  { GENERAL: 260e3, INDEMNITY: 420e3, IP: 950e3, DATA: 1.30e6, GROSS: 1.70e6 },
  },
  PROFESSIONAL_SERVICES: {
    label: 'Professional services (consulting, advisory)',
    line: { GENERAL: 'PROF' },
    freq: { GENERAL: 0.038, INDEMNITY: 0.010, IP: 0.0018, DATA: 0.0035, GROSS: 0.0010 },
    sev:  { GENERAL: 340e3, INDEMNITY: 380e3, IP: 800e3, DATA: 1.10e6, GROSS: 2.10e6 },
  },
  TECHNOLOGY: {
    label: 'Technology / SaaS',
    line: { GENERAL: 'PROF' },
    freq: { GENERAL: 0.026, INDEMNITY: 0.014, IP: 0.0075, DATA: 0.0140, GROSS: 0.0006 },
    sev:  { GENERAL: 300e3, INDEMNITY: 520e3, IP: 1.80e6, DATA: 2.40e6, GROSS: 1.90e6 },
  },
  SUPPLIER: {
    label: 'Supplier / goods',
    line: { GENERAL: 'GL' },
    freq: { GENERAL: 0.022, INDEMNITY: 0.020, IP: 0.0030, DATA: 0.0012, GROSS: 0.0006 },
    sev:  { GENERAL: 210e3, INDEMNITY: 640e3, IP: 700e3, DATA: 450e3, GROSS: 1.40e6 },
  },
  CONSTRUCTION: {
    label: 'Construction / contracting',
    line: { GENERAL: 'GL' },
    freq: { GENERAL: 0.045, INDEMNITY: 0.055, IP: 0.0004, DATA: 0.0006, GROSS: 0.0022 },
    sev:  { GENERAL: 380e3, INDEMNITY: 1.10e6, IP: 350e3, DATA: 300e3, GROSS: 3.20e6 },
  },
  LEASE_PROPERTY: {
    label: 'Real property / lease',
    line: { GENERAL: 'GL' },
    freq: { GENERAL: 0.018, INDEMNITY: 0.030, IP: 0.0002, DATA: 0.0004, GROSS: 0.0010 },
    sev:  { GENERAL: 180e3, INDEMNITY: 720e3, IP: 250e3, DATA: 260e3, GROSS: 1.80e6 },
  },
  DISTRIBUTION: {
    label: 'Distribution / reseller',
    line: { GENERAL: 'GL' },
    freq: { GENERAL: 0.024, INDEMNITY: 0.026, IP: 0.0055, DATA: 0.0020, GROSS: 0.0007 },
    sev:  { GENERAL: 230e3, INDEMNITY: 580e3, IP: 1.20e6, DATA: 520e3, GROSS: 1.50e6 },
  },
  STAFFING: {
    label: 'Staffing / contingent labour',
    line: { GENERAL: 'GL' },
    freq: { GENERAL: 0.034, INDEMNITY: 0.042, IP: 0.0008, DATA: 0.0030, GROSS: 0.0018 },
    sev:  { GENERAL: 190e3, INDEMNITY: 540e3, IP: 400e3, DATA: 780e3, GROSS: 1.60e6 },
  },
  LOGISTICS: {
    label: 'Transport / logistics',
    line: { GENERAL: 'GL' },
    freq: { GENERAL: 0.028, INDEMNITY: 0.048, IP: 0.0003, DATA: 0.0008, GROSS: 0.0016 },
    sev:  { GENERAL: 200e3, INDEMNITY: 860e3, IP: 300e3, DATA: 340e3, GROSS: 2.40e6 },
  },
};

/**
 * Defence cost as a fraction of the indemnity finally paid.
 *
 * This is the line item that quietly halves a tower. Two facts sit behind it and
 * both are ordinary: on most claims-made professional and cyber forms defence
 * erodes the limit, so every dollar spent on lawyers is a dollar of capacity
 * gone before a settlement is signed; and a contractual liability cap caps
 * damages, not what your own defence costs you. IP is the outlier because IP
 * litigation is the outlier — it is routinely defended past the point where the
 * damages at stake would justify it.
 */
export const DEFENCE_RATIO = {
  GENERAL: 0.30,
  INDEMNITY: 0.40,
  IP: 0.75,
  DATA: 0.35,
  GROSS: 0.45,
};

/**
 * Where defence sits by default when the schedule of insurance does not say.
 * The occurrence-based general liability form pays defence in addition to the
 * limit; claims-made professional and cyber forms almost always erode it.
 */
export const DEFENCE_TREATMENT = {
  GL: 'OUTSIDE',
  AUTO: 'OUTSIDE',
  PROPERTY: 'OUTSIDE',
  PROF: 'INSIDE',
  CYBER: 'INSIDE',
  DNO: 'INSIDE',
  EPL: 'INSIDE',
};

export const DEFAULT_DEFENCE_TREATMENT = 'INSIDE';

/** Sub-linear scaling. A contract worth ten times as much does not carry ten times the claims. */
export const SCALING = {
  freqExponent: 0.60,
  sevExponent: 0.35,
  /** Coefficient of variation of claim severity. 2.2 gives a long but not absurd right tail. */
  severityCV: 2.2,
  /** Value floor in dollars, so a $12k contract does not scale to zero exposure. */
  valueFloor: 50e3,
};

export const DEFAULT_SETTINGS = {
  trials: 20000,
  seed: 20260823,
  horizonYears: 1,
  severityCV: SCALING.severityCV,
  freqExponent: SCALING.freqExponent,
  sevExponent: SCALING.sevExponent,
  /** Applied to every frequency at once. The single dial for "we think the book is running hot". */
  frequencyLoad: 1.0,
  /** Applied to every severity median at once. The other half of that dial. */
  severityScale: 1.0,
  /** Applied to every defence ratio at once. Set to 0 to see the tower without defence in it. */
  defenceLoad: 1.0,
  /** Where an uncapped peril is truncated, so the mean stays finite and arguable. */
  uncappedTruncation: 250e6,
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES);

/** Resolve the policy line that answers for a peril on a given contract category. */
export function coverageLine(category, peril) {
  const cat = CATEGORIES[category];
  if (cat && cat.line && cat.line[peril]) return cat.line[peril];
  return DEFAULT_COVERAGE[peril];
}

/**
 * Turn a contract's category and annual value into a frequency and a lognormal
 * severity for one peril class.
 */
export function perilParams(category, peril, annualValue, settings = DEFAULT_SETTINGS) {
  const cat = CATEGORIES[category] || CATEGORIES.SUPPLIER;
  const value = Math.max(annualValue || 0, SCALING.valueFloor);
  const scale = value / 1e6;
  const lambda =
    (cat.freq[peril] || 0) *
    Math.pow(scale, settings.freqExponent ?? SCALING.freqExponent) *
    (settings.frequencyLoad ?? 1);
  const median =
    (cat.sev[peril] || 0) *
    Math.pow(scale, settings.sevExponent ?? SCALING.sevExponent) *
    (settings.severityScale ?? 1);
  const cv = settings.severityCV ?? SCALING.severityCV;
  const sigma = Math.sqrt(Math.log(1 + cv * cv));
  const mu = Math.log(Math.max(median, 1));
  const defence = (DEFENCE_RATIO[peril] || 0) * (settings.defenceLoad ?? 1);
  return { lambda, mu, sigma, median, defence };
}

/** How a line treats defence, from the schedule if stated and from the form if not. */
export function defenceTreatment(lineCode, stated) {
  const v = String(stated || '').trim().toUpperCase();
  if (v === 'INSIDE' || v === 'OUTSIDE') return v;
  return DEFENCE_TREATMENT[String(lineCode || '').toUpperCase()] || DEFAULT_DEFENCE_TREATMENT;
}
