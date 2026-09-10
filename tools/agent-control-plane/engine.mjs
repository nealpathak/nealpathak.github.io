// Agent control plane: the governance layer for a fleet of AI agents.
//
// Models what a regulator's examiner would ask to see: which agents exist,
// who owns each, what data each may touch, what runs before what, where a
// human has to sign before anything leaves the company, what happens when a
// switch is thrown, and a per-run audit log that could be handed over.

import { makeRng } from '../../lib/rng.mjs';

export const DATA_CLASSES = {
  'claims-pii': { name: 'Claimant personal data', sensitivity: 'restricted', note: 'Names, contact details, medical narrative. Never leaves the company.' },
  'claims-financial': { name: 'Claim financials', sensitivity: 'confidential', note: 'Paid, reserves, incurred, status by claim.' },
  'policy': { name: 'Policy and programme', sensitivity: 'confidential', note: 'Limits, retentions, aggregates, premium.' },
  'contracts': { name: 'Contracts and certificates', sensitivity: 'confidential', note: 'Insurance requirements, certificate holders, indemnities.' },
  'legal-matters': { name: 'Legal matters', sensitivity: 'privileged', note: 'Matter files, invoices, counsel work product. Attorney review before any output.' },
  'run-telemetry': { name: 'Run telemetry', sensitivity: 'internal', note: 'Logs, timings, exception counts. No business data.' },
};

export const DESTINATIONS = {
  'data-store': { name: 'Standardised claims store', external: false },
  'reporting': { name: 'Reporting layer', external: false },
  'claims-team': { name: 'Claims team inbox', external: false },
  'cro': { name: 'Chief risk officer', external: false },
  'actuary': { name: 'Appointed actuary', external: true },
  'certificate-holders': { name: 'Certificate holders', external: true },
  'outside-counsel': { name: 'Outside counsel', external: true },
  'board': { name: 'Board pack', external: false },
  'general-counsel': { name: 'General counsel', external: false },
  'ops-channel': { name: 'Operations channel', external: false },
};

// The fleet. Owners are roles, on purpose.
export const AGENTS = [
  { id: 'loss-run-ingest', name: 'Loss-run ingest', schedule: 'Daily 06:10', owner: 'Claims analytics lead', purpose: 'Standardise, validate and reconcile the administrator\'s daily loss run.', reads: ['claims-pii', 'claims-financial'], writes: ['data-store'], upstream: [], gate: 'exceptions', delivers: 'the standardised claim listing every other agent reads', manualHours: 3, tests: 24, fallback: 'Analyst runs the standardisation workbook by hand; exceptions logged manually.' },
  { id: 'actuarial-export', name: 'Actuarial export', schedule: 'Daily 06:30', owner: 'Claims analytics lead', purpose: 'Produce the canonical claim extract for reserving, with personal data removed.', reads: ['claims-financial'], writes: ['actuary'], upstream: ['loss-run-ingest'], gate: 'external', delivers: 'the reserving extract the appointed actuary works from', manualHours: 1.5, tests: 11, fallback: 'Analyst exports from the store and checks control totals against the loss run.' },
  { id: 'activity-report', name: 'Activity report', schedule: 'Daily 06:35', owner: 'Claims manager', purpose: 'Summarise what changed since yesterday: new, closed, reopened, reserve movements.', reads: ['claims-financial'], writes: ['claims-team'], upstream: ['loss-run-ingest'], gate: 'none', delivers: 'the claims team\'s morning brief', manualHours: 1, tests: 9, fallback: 'Claims manager compares two listings in a spreadsheet.' },
  { id: 'dashboard-refresh', name: 'Dashboard refresh', schedule: 'Daily 06:45', owner: 'Claims analytics lead', purpose: 'Rebuild the claims, loss development and erosion views from the day\'s data.', reads: ['claims-financial', 'policy'], writes: ['reporting'], upstream: ['actuarial-export', 'activity-report'], gate: 'none', delivers: 'current dashboards for the CRO, general counsel and finance', manualHours: 2, tests: 14, fallback: 'Dashboards keep serving the prior day, marked stale.' },
  { id: 'erosion-monitor', name: 'Aggregate erosion monitor', schedule: 'Daily 07:00', owner: 'Chief risk officer', purpose: 'Project each policy year against its aggregate and alert when projected use crosses 90%.', reads: ['claims-financial', 'policy'], writes: ['cro'], upstream: ['dashboard-refresh'], gate: 'none', delivers: 'early warning on aggregate exhaustion for renewal and capacity decisions', manualHours: 1, tests: 8, fallback: 'Weekly manual erosion check by the analytics lead.' },
  { id: 'coi-generator', name: 'Certificate generator', schedule: 'On request', owner: 'Risk manager', purpose: 'Draft certificates of insurance from the programme and the holder\'s requirements.', reads: ['contracts', 'policy'], writes: ['certificate-holders'], upstream: [], gate: 'external', delivers: 'certificates within the hour instead of the day', manualHours: 2.5, tests: 16, fallback: 'Risk manager drafts from the template library.' },
  { id: 'matter-intake', name: 'Matter intake triage', schedule: 'Hourly 08:00–18:00', owner: 'General counsel', purpose: 'Classify new matters and recommend routing: in-house, panel counsel, or administrator.', reads: ['legal-matters', 'contracts'], writes: ['general-counsel'], upstream: [], gate: 'attorney', delivers: 'same-day routing recommendations with the reasoning shown', manualHours: 1.5, tests: 12, fallback: 'Paralegal triages from the intake form.' },
  { id: 'invoice-review', name: 'Counsel invoice review', schedule: 'Weekly Mon 07:30', owner: 'General counsel', purpose: 'Check outside counsel invoices against budgets, rates and billing guidelines.', reads: ['legal-matters'], writes: ['outside-counsel'], upstream: [], gate: 'external', delivers: 'invoice exceptions back to counsel before payment', manualHours: 4, tests: 0, fallback: 'Paralegal reviews invoices line by line.' },
  { id: 'board-pack', name: 'Board pack assembler', schedule: 'Monthly, 1st 09:00', owner: 'Chief risk officer', purpose: 'Assemble the claims, erosion and capital sections of the board pack.', reads: ['claims-financial', 'policy'], writes: ['board'], upstream: ['dashboard-refresh', 'erosion-monitor'], gate: 'external', delivers: 'a first draft of the risk section two days after month end', manualHours: 6, tests: 7, fallback: 'CRO\'s office assembles from the dashboards.' },
  { id: 'exception-monitor', name: 'Exception monitor', schedule: 'Continuous', owner: 'Claims analytics lead', purpose: 'Watch every run for failures, late inputs, denied actions, and held releases; page the owner.', reads: ['run-telemetry'], writes: ['ops-channel'], upstream: [], gate: 'none', delivers: 'a person knows within minutes when something did not run', manualHours: 0.5, tests: 10, fallback: 'Owners check their own runs.' },
];

export const CONTROLS = [
  { id: 'owner', name: 'Named owner', test: a => !!a.owner },
  { id: 'data-scope', name: 'Data authorisation scoped', test: a => a.reads.length > 0 && a.reads.length <= 3 },
  { id: 'kill-switch', name: 'Kill switch', test: () => true },
  { id: 'audit', name: 'Per-run audit log', test: () => true },
  { id: 'gate', name: 'Human gate before external output', test: a => !a.writes.some(w => DESTINATIONS[w].external) || ['external', 'attorney'].includes(a.gate) },
  { id: 'tests', name: 'Automated tests', test: a => a.tests > 0 },
  { id: 'fallback', name: 'Documented manual fallback', test: a => !!a.fallback },
];

export function byId(id) { return AGENTS.find(a => a.id === id); }

// Is an agent allowed to read a data class?
export function authorizeRead(agent, dataClass) {
  const ok = agent.reads.includes(dataClass);
  return { allowed: ok, reason: ok ? `${dataClass} is in ${agent.id}'s authorised set` : `${dataClass} is not in ${agent.id}'s authorised set (${agent.reads.join(', ')})` };
}

// Is an agent allowed to write a payload of given data classes to a destination?
export function authorizeWrite(agent, destination, payloadClasses = []) {
  const dest = DESTINATIONS[destination];
  if (!dest) return { allowed: false, reason: `unknown destination ${destination}` };
  if (dest.external && payloadClasses.includes('claims-pii')) return { allowed: false, reason: `claimant personal data may not leave the company (destination ${destination} is external)` };
  if (!agent.writes.includes(destination)) return { allowed: false, reason: `${destination} is not a permitted destination for ${agent.id}` };
  const unread = payloadClasses.filter(c => !agent.reads.includes(c));
  if (unread.length) return { allowed: false, reason: `payload carries ${unread.join(', ')} which ${agent.id} may not read` };
  if (dest.external && payloadClasses.includes('legal-matters') && agent.gate !== 'attorney' && agent.gate !== 'external') return { allowed: false, reason: 'privileged material needs a gate before an external destination' };
  return { allowed: true, reason: dest.external ? `permitted; external destination, held for ${agent.gate} gate` : 'permitted' };
}

// Topological order by upstream dependencies, then by schedule text.
export function schedule(agents = AGENTS) {
  const depth = {};
  const d = a => { if (depth[a.id] !== undefined) return depth[a.id]; depth[a.id] = a.upstream.length ? 1 + Math.max(...a.upstream.map(u => d(byId(u)))) : 0; return depth[a.id]; };
  agents.forEach(d);
  return agents.slice().sort((x, y) => depth[x.id] - depth[y.id] || agents.indexOf(x) - agents.indexOf(y)).map(a => ({ ...a, depth: depth[a.id] }));
}

export function downstream(id, agents = AGENTS) {
  const out = []; const seen = new Set();
  const walk = x => { for (const a of agents) if (a.upstream.includes(x) && !seen.has(a.id)) { seen.add(a.id); out.push(a); walk(a.id); } };
  walk(id);
  return out;
}

// What is lost, and what it costs in people, if an agent is switched off.
export function impact(id, agents = AGENTS) {
  const a = byId(id);
  const down = downstream(id, agents);
  const idle = [a, ...down];
  return { agent: a, downstream: down, manualHoursPerDay: idle.reduce((s, x) => s + x.manualHours, 0), loses: idle.map(x => x.delivers), fallbacks: idle.map(x => ({ id: x.id, name: x.name, fallback: x.fallback, owner: x.owner })) };
}

export function coverage(agents = AGENTS) {
  const rows = agents.map(a => ({ id: a.id, name: a.name, results: CONTROLS.map(c => ({ id: c.id, ok: c.test(a) })) }));
  const total = rows.length * CONTROLS.length;
  const passed = rows.reduce((s, r) => s + r.results.filter(x => x.ok).length, 0);
  const gaps = rows.flatMap(r => r.results.filter(x => !x.ok).map(x => ({ agent: r.id, control: CONTROLS.find(c => c.id === x.id).name })));
  const eligible = rows.filter(r => r.results.every(x => x.ok)).map(r => r.id);
  return { rows, passed, total, share: passed / total, gaps, eligible };
}

export const FAULTS = {
  none: { name: 'A normal day' },
  'schema-drift': { name: 'Administrator changes a column name', at: 'loss-run-ingest' },
  'late-file': { name: 'Loss run arrives ninety minutes late', at: 'loss-run-ingest' },
  'pii-leak-attempt': { name: 'Activity report tries to email claimant names to the actuary', at: 'activity-report' },
  'privilege-attempt': { name: 'Invoice review tries to send matter narrative to counsel', at: 'invoice-review' },
};

// A deterministic day's run. Returns per-agent status, the audit log, and
// what the business had at the end of it.
export function simulateDay({ seed = 'run-2026-09-01', killed = [], fault = 'none', agents = AGENTS } = {}) {
  const rng = makeRng(seed + fault + killed.join(','));
  const killedSet = new Set(killed);
  const order = schedule(agents);
  const status = {};
  const audit = [];
  let clock = 6 * 60 + 8; // minutes
  const t = () => `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`;
  const log = (agent, action, detail, decision = 'ok') => audit.push({ time: t(), agent, action, detail, decision });
  const held = new Set();
  for (const a of order) {
    if (!/Daily|Continuous|Hourly/.test(a.schedule)) { status[a.id] = { state: 'not-scheduled', note: `${a.schedule}; not due today` }; continue; }
    if (killedSet.has(a.id)) { status[a.id] = { state: 'killed', note: `switch thrown by ${a.owner}; fallback: ${a.fallback}` }; log(a.id, 'skipped', 'kill switch is on', 'skipped'); continue; }
    const blockedBy = a.upstream.filter(u => ['killed', 'blocked', 'failed'].includes(status[u]?.state));
    if (blockedBy.length) { status[a.id] = { state: 'blocked', note: `upstream ${blockedBy.join(', ')} did not complete; fallback: ${a.fallback}` }; log(a.id, 'skipped', `upstream ${blockedBy.join(', ')} unavailable`, 'skipped'); continue; }
    const waitingOn = a.upstream.filter(u => held.has(u) || status[u]?.state === 'waiting');
    if (waitingOn.length) { status[a.id] = { state: 'waiting', note: `waiting on release of ${waitingOn.join(', ')}` }; log(a.id, 'deferred', `waiting on human release of ${waitingOn.join(', ')}`, 'deferred'); continue; }
    if (fault === 'late-file' && a.id === 'loss-run-ingest') { clock += 90; log(a.id, 'input late', 'loss run expected 06:00, arrived ' + t(), 'warn'); log('exception-monitor', 'paged', `loss-run-ingest input 90 minutes late; ${a.owner} paged`, 'warn'); }
    log(a.id, 'started', a.purpose);
    for (const dc of a.reads) { const r = authorizeRead(a, dc); log(a.id, 'read', `${dc}: ${r.reason}`, r.allowed ? 'ok' : 'denied'); }
    // the injected faults
    if (fault === 'schema-drift' && a.id === 'loss-run-ingest') {
      log(a.id, 'parse', 'column "O/S Rsv" not found; nearest header "Outstanding Reserve Amt" mapped by pattern', 'warn');
      log(a.id, 'validate', '12 blocking exceptions; release held for human review', 'held');
      held.add(a.id);
      status[a.id] = { state: 'held', note: 'completed; release held on 12 blocking exceptions' };
      log('exception-monitor', 'paged', `loss-run-ingest release held; ${a.owner} paged`, 'warn');
      clock += 2 + rng.int(0, 3); continue;
    }
    if (fault === 'pii-leak-attempt' && a.id === 'activity-report') {
      const w = authorizeWrite(a, 'actuary', ['claims-financial', 'claims-pii']);
      log(a.id, 'write attempt', `to actuary with claims-pii: ${w.reason}`, w.allowed ? 'ok' : 'denied');
      log('exception-monitor', 'paged', `activity-report attempted an unauthorised write; ${a.owner} and general counsel paged`, 'warn');
    }
    if (fault === 'privilege-attempt' && a.id === 'invoice-review') {
      const w = authorizeWrite({ ...a, gate: 'none' }, 'outside-counsel', ['legal-matters']);
      log(a.id, 'write attempt', `to outside-counsel with matter narrative and no gate: ${w.reason}`, w.allowed ? 'ok' : 'denied');
    }
    for (const dest of a.writes) {
      const w = authorizeWrite(a, dest, a.reads.filter(c => c !== 'claims-pii'));
      log(a.id, 'write', `${dest}: ${w.reason}`, w.allowed ? (DESTINATIONS[dest].external ? 'held' : 'ok') : 'denied');
    }
    if (a.id === 'loss-run-ingest') log(a.id, 'validate', `${rng.int(0, 2)} blocking exceptions, ${rng.int(5, 20)} warnings`);
    const external = a.writes.some(w => DESTINATIONS[w].external);
    if (external) { status[a.id] = { state: 'held', note: `completed; output to ${a.writes.filter(w => DESTINATIONS[w].external).map(w => DESTINATIONS[w].name).join(', ')} awaits ${a.gate} sign-off by ${a.owner}` }; }
    else if (a.gate === 'exceptions' || a.gate === 'attorney') { status[a.id] = { state: 'ok', note: `completed; ${a.gate === 'attorney' ? 'recommendations queued for attorney review' : 'no blocking exceptions; released'}` }; }
    else status[a.id] = { state: 'ok', note: 'completed' };
    log(a.id, 'finished', `${1 + rng.int(0, 4)} min ${rng.int(0, 59)} s`);
    clock += 1 + rng.int(0, 4);
  }
  // An external gate holds delivery, not the internal artifact, so dependants
  // still run; an exception hold on the listing blocks them.
  const counts = {};
  for (const s of Object.values(status)) counts[s.state] = (counts[s.state] || 0) + 1;
  const denied = audit.filter(e => e.decision === 'denied');
  const dashboardsFresh = status['dashboard-refresh']?.state === 'ok';
  return { order, status, audit, counts, denied, held: [...held], dashboardsFresh, seed, fault, killed };
}
