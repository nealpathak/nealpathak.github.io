// Run: node tools/agent-control-plane/selftest.mjs
import { AGENTS, DESTINATIONS, authorizeRead, authorizeWrite, schedule, downstream, impact, coverage, simulateDay, byId } from './engine.mjs';

let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) { failures++; console.log(`  FAIL ${name} ${detail}`); } else console.log(`  ok   ${name}`); };

console.log('agent control plane');
check('every upstream reference resolves', AGENTS.every(a => a.upstream.every(u => byId(u))));
check('every destination is defined', AGENTS.every(a => a.writes.every(w => DESTINATIONS[w])));
const order = schedule();
const pos = Object.fromEntries(order.map((a, i) => [a.id, i]));
check('schedule places every agent after its upstreams', order.every(a => a.upstream.every(u => pos[u] < pos[a.id])));
check('ingest is first and board pack is last of the chain', pos['loss-run-ingest'] < pos['actuarial-export'] && pos['dashboard-refresh'] < pos['board-pack']);
const down = downstream('loss-run-ingest');
check('killing ingest reaches everything that depends on the listing', ['actuarial-export', 'activity-report', 'dashboard-refresh', 'erosion-monitor', 'board-pack'].every(id => down.some(a => a.id === id)) && !down.some(a => a.id === 'coi-generator'));
const imp = impact('loss-run-ingest');
check('impact sums manual hours across the idle set', Math.abs(imp.manualHoursPerDay - (3 + 1.5 + 1 + 2 + 1 + 6)) < 1e-9, String(imp.manualHoursPerDay));

const ingest = byId('loss-run-ingest'), activity = byId('activity-report');
check('an agent may read what it is scoped to', authorizeRead(ingest, 'claims-pii').allowed);
check('an agent may not read outside its scope', !authorizeRead(activity, 'legal-matters').allowed);
check('personal data may never go to an external destination', !authorizeWrite(byId('actuarial-export'), 'actuary', ['claims-financial', 'claims-pii']).allowed);
check('an agent cannot write to a destination it is not scoped to', !authorizeWrite(activity, 'actuary', ['claims-financial']).allowed);
check('a permitted external write is flagged for the gate', /held/.test(authorizeWrite(byId('actuarial-export'), 'actuary', ['claims-financial']).reason));
check('privileged material without a gate is denied externally', !authorizeWrite({ ...byId('invoice-review'), gate: 'none' }, 'outside-counsel', ['legal-matters']).allowed);

const cov = coverage();
check('coverage finds the one agent without tests', cov.gaps.length === 1 && cov.gaps[0].agent === 'invoice-review' && /tests/i.test(cov.gaps[0].control));
check('every other agent is production-eligible', cov.eligible.length === AGENTS.length - 1);

const normal = simulateDay();
check('a normal day runs every scheduled agent', Object.values(normal.status).filter(s => ['ok', 'held'].includes(s.state)).length === Object.values(normal.status).filter(s => s.state !== 'not-scheduled').length);
check('a normal day denies nothing', normal.denied.length === 0);
check('runs are deterministic', JSON.stringify(simulateDay().audit) === JSON.stringify(normal.audit));
const drift = simulateDay({ fault: 'schema-drift' });
check('schema drift holds the ingest release', drift.status['loss-run-ingest'].state === 'held');
check('agents downstream of a held release wait rather than run', ['actuarial-export', 'activity-report', 'dashboard-refresh'].every(id => drift.status[id].state === 'waiting'));
check('dashboards are not fresh on a held day', drift.dashboardsFresh === false && normal.dashboardsFresh === true);
const leak = simulateDay({ fault: 'pii-leak-attempt' });
check('an attempted personal-data write is denied and logged', leak.denied.length === 1 && leak.denied[0].agent === 'activity-report');
const killed = simulateDay({ killed: ['loss-run-ingest'] });
check('a thrown switch blocks dependants and leaves independents running', killed.status['dashboard-refresh'].state === 'blocked' && killed.status['matter-intake'].state === 'ok');
check('audit log carries a time, agent, action and decision on every row', normal.audit.every(e => e.time && e.agent && e.action && e.decision));

if (failures) { console.log(`${failures} failure(s)`); process.exit(1); }
console.log('all control plane checks passed');
