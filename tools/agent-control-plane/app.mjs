import { AGENTS, DATA_CLASSES, DESTINATIONS, CONTROLS, FAULTS, schedule, impact, coverage, simulateDay, byId } from './engine.mjs';
import { $, $$, table, readParams, escapeHtml } from '../../lib/dom.mjs';

const controls = $('#controls');
$('#fault').innerHTML = Object.entries(FAULTS).map(([k, f]) => `<option value="${k}">${f.name}</option>`).join('');
$('#inspect').innerHTML = AGENTS.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
$('#switches').innerHTML = AGENTS.map(a => `<label><input type="checkbox" data-kill="${a.id}"> ${a.name}</label>`).join('');
const STATE_LABEL = { ok: 'Completed', held: 'Held for a person', waiting: 'Waiting on release', killed: 'Switched off', blocked: 'Blocked upstream', 'not-scheduled': 'Not due today', failed: 'Failed' };
controls.addEventListener('change', render);
render();

function render() {
  const p = readParams(controls);
  const killed = $$('[data-kill]').filter(i => i.checked).map(i => i.dataset.kill);
  const run = simulateDay({ fault: p.fault, killed });
  const cov = coverage();
  const stat = (v, label, sub = '', cls = '') => `<div class="stat"><div class="value ${cls}">${v}</div><div class="label">${label}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;

  // finding
  const scheduled = Object.entries(run.status).filter(([, s]) => s.state !== 'not-scheduled');
  const done = scheduled.filter(([, s]) => ['ok', 'held'].includes(s.state)).length;
  const heldExt = scheduled.filter(([id, s]) => s.state === 'held' && byId(id).gate === 'external').map(([id]) => byId(id).name);
  const waiting = scheduled.filter(([, s]) => s.state === 'waiting').map(([id]) => byId(id).name);
  const blocked = scheduled.filter(([, s]) => s.state === 'blocked').map(([id]) => byId(id).name);
  const idleHours = scheduled.filter(([, s]) => ['killed', 'blocked'].includes(s.state)).reduce((s, [id]) => s + byId(id).manualHours, 0);
  let f1 = `${done} of ${scheduled.length} scheduled agents completed.`;
  if (run.held.length) f1 += ` The claim listing is held on exceptions, so ${waiting.length} agent${waiting.length === 1 ? '' : 's'} (${waiting.join(', ')}) ${waiting.length === 1 ? 'is' : 'are'} waiting and the dashboards are serving yesterday's data, marked stale.`;
  if (killed.length) f1 += ` ${killed.length} switch${killed.length === 1 ? ' is' : 'es are'} thrown, idling ${blocked.length} dependant${blocked.length === 1 ? '' : 's'}; the manual fallbacks cost ${idleHours} people-hours today.`;
  let f2 = run.denied.length
    ? `${run.denied.length} write${run.denied.length === 1 ? ' was' : 's were'} denied by the policy engine: ${run.denied.map(d => `${byId(d.agent).name} ${d.detail.split(':')[0].replace('to ', 'to ')}`).join('; ')}. The owner was paged and the row is in the audit log below.`
    : `Nothing was denied. ${heldExt.length ? `${heldExt.length} output${heldExt.length === 1 ? '' : 's'} bound outside the company (${heldExt.join(', ')}) ${heldExt.length === 1 ? 'waits' : 'wait'} for sign-off.` : ''}`;
  if (cov.gaps.length) f2 += ` ${cov.gaps.map(g => `${byId(g.agent).name} has no ${g.control.toLowerCase()} and stays in pilot`).join('; ')}.`;
  $('#finding').innerHTML = `<p>${f1}</p><p>${f2}</p>`;
  $('#stats').innerHTML =
    stat(`${done}/${scheduled.length}`, 'Agents completed', `${waiting.length} waiting, ${blocked.length} blocked, ${killed.length} off`) +
    stat(String(run.denied.length), 'Writes denied', run.denied.length ? 'owner paged' : 'policy engine had nothing to refuse', run.denied.length ? 'accent' : '') +
    stat(String(heldExt.length + (run.held.length)), 'Holds for a person', `${heldExt.length} external deliveries, ${run.held.length} exception hold${run.held.length === 1 ? '' : 's'}`) +
    stat(`${Math.round(cov.share * 100)}%`, 'Control coverage', `${cov.eligible.length} of ${AGENTS.length} agents production-eligible`, cov.gaps.length ? 'accent' : '');

  // DAG
  $('#dag').innerHTML = drawDag(run);

  // fleet table
  $('#fleet').innerHTML = table([
    { key: 'name', label: 'Agent', render: (v, r) => `<strong>${escapeHtml(v)}</strong><br><span class="muted small">${escapeHtml(r.purpose)}</span>` },
    { key: 'schedule', label: 'Runs' },
    { key: 'owner', label: 'Owner' },
    { key: 'reads', label: 'May read', render: v => v.map(c => `<span class="badge ${DATA_CLASSES[c].sensitivity === 'restricted' || DATA_CLASSES[c].sensitivity === 'privileged' ? 'accent' : ''}">${escapeHtml(DATA_CLASSES[c].name)}</span>`).join(' ') },
    { key: 'writes', label: 'Writes to', render: v => v.map(d => `${escapeHtml(DESTINATIONS[d].name)}${DESTINATIONS[d].external ? ' <span class="badge">external</span>' : ''}`).join(', ') },
    { key: 'gate', label: 'Gate', render: v => ({ none: '—', exceptions: 'Exception review', external: 'Sign-off before delivery', attorney: 'Attorney review' })[v] },
    { key: 'state', label: 'Today', render: (v, r) => `<span class="badge ${v === 'ok' ? 'ok' : v === 'not-scheduled' ? '' : v === 'held' ? 'warn' : 'accent'}">${STATE_LABEL[v]}</span><br><span class="muted small">${escapeHtml(r.note)}</span>` },
  ], run.order.map(a => ({ ...a, state: run.status[a.id].state, note: run.status[a.id].note, _class: ['killed', 'blocked'].includes(run.status[a.id].state) ? 'flag' : '' })), { caption: 'The fleet, in run order' });

  // impact
  const imp = impact(p.inspect);
  $('#impact-stats').innerHTML =
    stat(String(imp.downstream.length), 'Agents idled downstream', imp.downstream.map(d => d.name).join(', ') || 'none') +
    stat(`${imp.manualHoursPerDay}h`, 'People-hours per day', 'to run the fallbacks by hand', imp.manualHoursPerDay >= 8 ? 'accent' : '') +
    stat(String(imp.agent.tests), 'Automated tests', imp.agent.tests ? 'must pass before the switch is reset' : 'none; not production-eligible', imp.agent.tests ? '' : 'accent') +
    stat(imp.agent.owner, 'Who throws it', 'and who resets it, after tests pass');
  $('#impact').innerHTML = table([
    { key: 'name', label: 'Idled agent' },
    { key: 'delivers', label: 'What the business loses', render: v => escapeHtml(v) },
    { key: 'fallback', label: 'Manual fallback' },
    { key: 'owner', label: 'Fallback owner' },
    { key: 'manualHours', label: 'Hours/day', num: true },
  ], [imp.agent, ...imp.downstream].map(a => ({ ...a, _class: a.id === imp.agent.id ? '' : 'dim' })), { caption: `If ${imp.agent.name} is switched off` });

  // authorisation matrix
  const classes = Object.keys(DATA_CLASSES);
  $('#authz').innerHTML = `<table class="data matrix"><caption>Read authorisation by agent and data class</caption><thead><tr><th>Agent</th>${classes.map(c => `<th class="rot">${escapeHtml(DATA_CLASSES[c].name)}</th>`).join('')}<th>External destinations</th></tr></thead><tbody>${AGENTS.map(a => `<tr><td>${escapeHtml(a.name)}</td>${classes.map(c => `<td class="${a.reads.includes(c) ? 'yes' : 'no'}">${a.reads.includes(c) ? '●' : '·'}</td>`).join('')}<td>${a.writes.filter(w => DESTINATIONS[w].external).map(w => DESTINATIONS[w].name).join(', ') || '<span class="muted">none</span>'}</td></tr>`).join('')}</tbody></table>
    <p class="note">Sensitivity: ${classes.map(c => `<strong>${escapeHtml(DATA_CLASSES[c].name)}</strong> ${DATA_CLASSES[c].sensitivity}`).join(' · ')}. Restricted data is never written externally, whatever the agent's scope.</p>`;

  // coverage matrix
  $('#coverage-stats').innerHTML =
    stat(`${cov.passed}/${cov.total}`, 'Controls passing', `${cov.gaps.length} gap${cov.gaps.length === 1 ? '' : 's'}`) +
    stat(String(cov.eligible.length), 'Production-eligible', `of ${AGENTS.length} agents`) +
    stat(String(AGENTS.length - cov.eligible.length), 'In pilot', cov.gaps.map(g => byId(g.agent).name).join(', ') || 'none', cov.gaps.length ? 'accent' : '') +
    stat(String(AGENTS.reduce((s, a) => s + a.tests, 0)), 'Automated tests', 'across the fleet');
  $('#coverage').innerHTML = `<table class="data matrix"><caption>Control coverage</caption><thead><tr><th>Agent</th>${CONTROLS.map(c => `<th class="rot">${escapeHtml(c.name)}</th>`).join('')}<th>Status</th></tr></thead><tbody>${cov.rows.map(r => `<tr><td>${escapeHtml(r.name)}</td>${r.results.map(x => `<td class="${x.ok ? 'yes' : 'gap'}">${x.ok ? '●' : '✕'}</td>`).join('')}<td>${r.results.every(x => x.ok) ? '<span class="badge ok">Production</span>' : '<span class="badge accent">Pilot</span>'}</td></tr>`).join('')}</tbody></table>`;

  // audit
  $('#audit').innerHTML = table([
    { key: 'time', label: 'Time', class: 'mono' },
    { key: 'agent', label: 'Agent', render: v => byId(v)?.name || v },
    { key: 'action', label: 'Action' },
    { key: 'detail', label: 'Detail' },
    { key: 'decision', label: 'Decision', render: v => `<span class="badge ${v === 'ok' ? 'ok' : v === 'denied' ? 'accent' : v === 'held' || v === 'warn' || v === 'deferred' ? 'warn' : ''}">${v}</span>` },
  ], run.audit.map(e => ({ ...e, _class: e.decision === 'denied' ? 'flag' : e.decision === 'ok' ? '' : '' })), { caption: `${run.audit.length} entries for ${run.seed.replace('run-', '')}` });
}

function drawDag(run) {
  const order = run.order;
  const cols = {};
  for (const a of order) (cols[a.depth] ??= []).push(a);
  const W = 190, H = 46, CX = 240, CY = 66, PAD = 12;
  const nCols = Object.keys(cols).length;
  const nRows = Math.max(...Object.values(cols).map(c => c.length));
  const width = PAD * 2 + nCols * CX - (CX - W), height = PAD * 2 + nRows * CY - (CY - H);
  const pos = {};
  Object.entries(cols).forEach(([d, list]) => list.forEach((a, i) => { pos[a.id] = { x: PAD + d * CX, y: PAD + i * CY }; }));
  let s = `<svg viewBox="0 0 ${width} ${height}" class="diagram" role="img" aria-label="Agent dependency graph"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--ink-2)"/></marker></defs>`;
  for (const a of order) for (const u of a.upstream) {
    const A = pos[u], B = pos[a.id];
    const x1 = A.x + W, y1 = A.y + H / 2, x2 = B.x, y2 = B.y + H / 2;
    const dashed = ['waiting', 'blocked', 'killed'].includes(run.status[a.id].state);
    s += `<path class="edge ${dashed ? 'dashed' : ''}" d="M${x1},${y1} C${x1 + 40},${y1} ${x2 - 40},${y2} ${x2},${y2}"/>`;
  }
  for (const a of order) {
    const { x, y } = pos[a.id]; const st = run.status[a.id].state;
    const style = st === 'killed' ? 'fill:var(--accent);stroke:var(--accent)' : st === 'held' ? 'stroke:var(--accent);stroke-dasharray:4 3' : st === 'waiting' ? 'stroke:var(--muted);stroke-dasharray:2 3' : st === 'blocked' ? 'stroke:var(--muted);fill:var(--paper-2)' : st === 'not-scheduled' ? 'stroke:var(--rule-2)' : '';
    const tcol = st === 'killed' ? 'fill:#fff' : st === 'not-scheduled' ? 'fill:var(--muted)' : '';
    s += `<rect class="box" x="${x}" y="${y}" width="${W}" height="${H}" style="${style}"/>`;
    s += `<text class="t" x="${x + 10}" y="${y + 18}" style="${tcol}">${escapeHtml(a.name)}</text>`;
    s += `<text class="t small" x="${x + 10}" y="${y + 34}" style="${st === 'killed' ? 'fill:#fff;opacity:.85' : ''}">${escapeHtml(a.schedule)} · ${escapeHtml(STATE_LABEL[st])}</text>`;
  }
  return s + '</svg>';
}
