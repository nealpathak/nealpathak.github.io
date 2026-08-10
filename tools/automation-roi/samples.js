// Synthetic process datasets. Nothing here is derived from a real book of
// business, carrier, firm, or employer. The three cases are chosen to behave
// differently under the model: one where automation clearly pays, one where the
// value sits in a single dominant step, and one where the volume is too thin to
// justify the build — a model that can only ever say "yes" is not a model.

export const SAMPLES = [
  {
    id: 'fnol',
    label: 'Claim intake → first reserve',
    note: 'High-volume P&C claims operation. Automation pays quickly and the ' +
          'constraint is reserve accuracy, not headcount.',
    process: {
      name: 'Claim intake → first reserve set',
      volumePerMonth: 1400,
      horizonMonths: 36,
      productiveHoursPerFTEMonth: 142,
    },
    roles: [
      { id: 'intake', name: 'Intake Specialist',  loadedAnnualCost: 62000,  productiveHoursPerYear: 1700 },
      { id: 'adj',    name: 'Claims Adjuster',    loadedAnnualCost: 92000,  productiveHoursPerYear: 1700 },
      { id: 'sup',    name: 'Claims Supervisor',  loadedAnnualCost: 128000, productiveHoursPerYear: 1650 },
      { id: 'cov',    name: 'Coverage Paralegal', loadedAnnualCost: 86000,  productiveHoursPerYear: 1600 },
    ],
    steps: [
      { id: 's1', name: 'FNOL capture into claim system', roleId: 'intake',
        applicability: 1.00, touchMinutes: 18, waitHours: 4,  reworkRate: 0.12,
        automatable: 0.75, waitReduction: 0.80, buildCost: 45000, runCostMonthly: 900,  selected: true },
      { id: 's2', name: 'Duplicate and prior-claim check', roleId: 'intake',
        applicability: 1.00, touchMinutes: 7,  waitHours: 1,  reworkRate: 0.05,
        automatable: 0.90, waitReduction: 0.90, buildCost: 18000, runCostMonthly: 250,  selected: true },
      { id: 's3', name: 'Policy and coverage verification', roleId: 'adj',
        applicability: 1.00, touchMinutes: 22, waitHours: 9,  reworkRate: 0.18,
        automatable: 0.55, waitReduction: 0.60, buildCost: 60000, runCostMonthly: 1200, selected: true },
      { id: 's4', name: 'Coverage position memo (complex only)', roleId: 'cov',
        applicability: 0.28, touchMinutes: 95, waitHours: 26, reworkRate: 0.22,
        automatable: 0.30, waitReduction: 0.35, buildCost: 55000, runCostMonthly: 1400, selected: false },
      { id: 's5', name: 'Assignment and routing to adjuster', roleId: 'sup',
        applicability: 1.00, touchMinutes: 9,  waitHours: 12, reworkRate: 0.08,
        automatable: 0.85, waitReduction: 0.85, buildCost: 22000, runCostMonthly: 300,  selected: true },
      { id: 's6', name: 'Initial reserve calculation and entry', roleId: 'adj',
        applicability: 1.00, touchMinutes: 34, waitHours: 16, reworkRate: 0.25,
        automatable: 0.40, waitReduction: 0.40, buildCost: 70000, runCostMonthly: 1600, selected: true },
      { id: 's7', name: 'Supervisor reserve approval (over authority)', roleId: 'sup',
        applicability: 0.35, touchMinutes: 20, waitHours: 30, reworkRate: 0.15,
        automatable: 0.25, waitReduction: 0.50, buildCost: 30000, runCostMonthly: 500,  selected: false },
      { id: 's8', name: 'Acknowledgement letter and contact log', roleId: 'intake',
        applicability: 1.00, touchMinutes: 12, waitHours: 8,  reworkRate: 0.06,
        automatable: 0.90, waitReduction: 0.90, buildCost: 20000, runCostMonthly: 350,  selected: true },
    ],
  },

  {
    id: 'invoice',
    label: 'Legal invoice review → payment',
    note: 'Outside-counsel spend management. Most of the recoverable time sits ' +
          'in one line-item review step; the rest is routing.',
    process: {
      name: 'Vendor invoice review → payment release',
      volumePerMonth: 3200,
      horizonMonths: 36,
      productiveHoursPerFTEMonth: 142,
    },
    roles: [
      { id: 'ap',   name: 'AP Specialist',     loadedAnnualCost: 58000,  productiveHoursPerYear: 1700 },
      { id: 'ops',  name: 'Legal Ops Analyst', loadedAnnualCost: 88000,  productiveHoursPerYear: 1700 },
      { id: 'mgr',  name: 'Billing Manager',   loadedAnnualCost: 118000, productiveHoursPerYear: 1650 },
      { id: 'atty', name: 'Reviewing Attorney', loadedAnnualCost: 175000, productiveHoursPerYear: 1600 },
    ],
    steps: [
      { id: 'i1', name: 'Invoice receipt and data capture', roleId: 'ap',
        applicability: 1.00, touchMinutes: 9,  waitHours: 6,  reworkRate: 0.10,
        automatable: 0.90, waitReduction: 0.85, buildCost: 38000, runCostMonthly: 800,  selected: true },
      { id: 'i2', name: 'Matter and budget code matching', roleId: 'ops',
        applicability: 1.00, touchMinutes: 6,  waitHours: 4,  reworkRate: 0.14,
        automatable: 0.85, waitReduction: 0.80, buildCost: 26000, runCostMonthly: 450,  selected: true },
      { id: 'i3', name: 'Billing-guideline compliance review', roleId: 'ops',
        applicability: 1.00, touchMinutes: 24, waitHours: 18, reworkRate: 0.20,
        automatable: 0.60, waitReduction: 0.60, buildCost: 85000, runCostMonthly: 2200, selected: true },
      { id: 'i4', name: 'Attorney substantive review (over threshold)', roleId: 'atty',
        applicability: 0.22, touchMinutes: 40, waitHours: 40, reworkRate: 0.12,
        automatable: 0.15, waitReduction: 0.30, buildCost: 40000, runCostMonthly: 700,  selected: false },
      { id: 'i5', name: 'Adjustment negotiation with firm', roleId: 'mgr',
        applicability: 0.31, touchMinutes: 35, waitHours: 72, reworkRate: 0.30,
        automatable: 0.20, waitReduction: 0.25, buildCost: 32000, runCostMonthly: 600,  selected: false },
      { id: 'i6', name: 'Approval routing and authority check', roleId: 'mgr',
        applicability: 1.00, touchMinutes: 8,  waitHours: 20, reworkRate: 0.09,
        automatable: 0.80, waitReduction: 0.80, buildCost: 24000, runCostMonthly: 400,  selected: true },
      { id: 'i7', name: 'Payment release and GL posting', roleId: 'ap',
        applicability: 1.00, touchMinutes: 7,  waitHours: 10, reworkRate: 0.05,
        automatable: 0.90, waitReduction: 0.90, buildCost: 30000, runCostMonthly: 500,  selected: true },
      { id: 'i8', name: 'Accrual reporting and variance flagging', roleId: 'ops',
        applicability: 1.00, touchMinutes: 5,  waitHours: 24, reworkRate: 0.08,
        automatable: 0.95, waitReduction: 0.90, buildCost: 34000, runCostMonthly: 650,  selected: true },
    ],
  },

  {
    id: 'intake',
    label: 'New matter intake → engagement',
    note: 'Low volume, high touch. Run the numbers before assuming this one is ' +
          'worth building — at 260 matters a month several steps never pay back.',
    process: {
      name: 'New matter inquiry → engagement letter executed',
      volumePerMonth: 260,
      horizonMonths: 36,
      productiveHoursPerFTEMonth: 138,
    },
    roles: [
      { id: 'coord', name: 'Intake Coordinator', loadedAnnualCost: 56000,  productiveHoursPerYear: 1700 },
      { id: 'confl', name: 'Conflicts Analyst',  loadedAnnualCost: 74000,  productiveHoursPerYear: 1700 },
      { id: 'assoc', name: 'Associate',          loadedAnnualCost: 155000, productiveHoursPerYear: 1600 },
      { id: 'pm',    name: 'Practice Manager',   loadedAnnualCost: 105000, productiveHoursPerYear: 1650 },
    ],
    steps: [
      { id: 'm1', name: 'Inquiry capture and client detail collection', roleId: 'coord',
        applicability: 1.00, touchMinutes: 25, waitHours: 6,  reworkRate: 0.15,
        automatable: 0.70, waitReduction: 0.70, buildCost: 55000, runCostMonthly: 900,  selected: true },
      { id: 'm2', name: 'Conflicts search and clearance', roleId: 'confl',
        applicability: 1.00, touchMinutes: 45, waitHours: 20, reworkRate: 0.18,
        automatable: 0.50, waitReduction: 0.55, buildCost: 90000, runCostMonthly: 1800, selected: true },
      { id: 'm3', name: 'Conflicts waiver drafting (when required)', roleId: 'assoc',
        applicability: 0.12, touchMinutes: 70, waitHours: 48, reworkRate: 0.20,
        automatable: 0.20, waitReduction: 0.30, buildCost: 45000, runCostMonthly: 800,  selected: false },
      { id: 'm4', name: 'Rate and fee arrangement approval', roleId: 'pm',
        applicability: 1.00, touchMinutes: 20, waitHours: 36, reworkRate: 0.22,
        automatable: 0.35, waitReduction: 0.50, buildCost: 40000, runCostMonthly: 700,  selected: false },
      { id: 'm5', name: 'Engagement letter drafting', roleId: 'assoc',
        applicability: 1.00, touchMinutes: 40, waitHours: 24, reworkRate: 0.25,
        automatable: 0.60, waitReduction: 0.60, buildCost: 65000, runCostMonthly: 1200, selected: true },
      { id: 'm6', name: 'Client signature and return handling', roleId: 'coord',
        applicability: 1.00, touchMinutes: 15, waitHours: 96, reworkRate: 0.12,
        automatable: 0.75, waitReduction: 0.60, buildCost: 28000, runCostMonthly: 900,  selected: true },
      { id: 'm7', name: 'Matter opening in system of record', roleId: 'coord',
        applicability: 1.00, touchMinutes: 22, waitHours: 8,  reworkRate: 0.14,
        automatable: 0.80, waitReduction: 0.80, buildCost: 36000, runCostMonthly: 600,  selected: true },
    ],
  },
];

/** Structural clone so edits in the interface never mutate the sample. */
export function loadSample(id) {
  const s = SAMPLES.find(x => x.id === id) ?? SAMPLES[0];
  return {
    id: s.id,
    label: s.label,
    note: s.note,
    process: { ...s.process },
    roles: s.roles.map(r => ({ ...r })),
    steps: s.steps.map(x => ({ ...x })),
  };
}
