// Contract Playbook Checker — interface layer. Parsing lives in parse.js,
// checking and grading in model.js, the positions themselves in playbook.js.

import { review } from './model.js';
import { DEFAULT_PLAYBOOK, clonePlaybook, SEVERITIES } from './playbook.js';
import { SAMPLES, loadSample } from './samples.js';
import { buildMemo } from './memo.js';
import { num, pct, parseNum } from '../../assets/js/fmt.js';
import { toCSV, download } from '../../assets/js/csv.js';

const $ = id => document.getElementById(id);

let playbook = clonePlaybook(DEFAULT_PLAYBOOK);
let sampleLabel = SAMPLES[0].label;
let latest = null;
let timer = null;

// Red for stop, amber for negotiate, neutral for note.
const TAG = { critical: 'hold', major: 'watch', minor: 'quiet' };

/* ------------------------------------------------------------- scaffold -- */

function buildSampleOptions() {
  const sel = $('sample');
  sel.innerHTML = '';
  for (const s of SAMPLES) {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = s.label;
    sel.appendChild(o);
  }
}

/** The playbook itself, editable where editing is meaningful. */
function buildPlaybookTable() {
  const body = $('playbook-body');
  body.innerHTML = '';

  for (const clause of playbook.clauses) {
    for (const [i, check] of clause.checks.entries()) {
      const tr = document.createElement('tr');

      const name = document.createElement('td');
      name.textContent = i === 0 ? clause.name : '';
      if (i === 0) name.style.fontWeight = '500';
      else name.style.color = 'var(--ink-faint)';
      tr.appendChild(name);

      const label = document.createElement('td');
      label.style.textAlign = 'left';
      label.style.whiteSpace = 'normal';
      label.style.minWidth = '230px';
      label.textContent = check.label;
      tr.appendChild(label);

      const type = document.createElement('td');
      type.style.color = 'var(--ink-muted)';
      type.style.textAlign = 'left';
      type.textContent = ({
        mustMatch: 'must be present',
        mustNotMatch: 'must be absent',
        numberAtLeast: 'at least',
        numberAtMost: 'at most',
      })[check.type];
      tr.appendChild(type);

      const threshold = document.createElement('td');
      if (check.type === 'numberAtLeast' || check.type === 'numberAtMost') {
        threshold.className = 'cell-input';
        const input = document.createElement('input');
        input.type = 'number';
        input.value = String(check.value);
        input.step = check.value >= 1000 ? '100000' : '1';
        input.min = '0';
        input.dataset.clause = clause.id;
        input.dataset.check = check.id;
        input.dataset.field = 'value';
        input.setAttribute('aria-label', `Threshold for ${check.label}`);
        threshold.appendChild(input);
      } else {
        threshold.textContent = '—';
        threshold.style.color = 'var(--ink-faint)';
      }
      tr.appendChild(threshold);

      const unit = document.createElement('td');
      unit.style.textAlign = 'left';
      unit.style.color = 'var(--ink-muted)';
      unit.textContent = check.unit ?? '';
      tr.appendChild(unit);

      const sev = document.createElement('td');
      const select = document.createElement('select');
      for (const s of SEVERITIES) {
        const o = document.createElement('option');
        o.value = s;
        o.textContent = s;
        select.appendChild(o);
      }
      select.value = check.severity;
      select.dataset.clause = clause.id;
      select.dataset.check = check.id;
      select.dataset.field = 'severity';
      select.setAttribute('aria-label', `Severity for ${check.label}`);
      sev.appendChild(select);
      tr.appendChild(sev);

      const on = document.createElement('td');
      on.style.textAlign = 'center';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = check.enabled;
      box.dataset.clause = clause.id;
      box.dataset.check = check.id;
      box.dataset.field = 'enabled';
      box.setAttribute('aria-label', `Enable ${check.label}`);
      on.appendChild(box);
      tr.appendChild(on);

      body.appendChild(tr);
    }
  }
}

/* ---------------------------------------------------------------- paint -- */

function run() {
  const text = $('document').value;
  const r = review(text, playbook);
  latest = r;

  paintMetrics(r);
  paintCoverage(r);
  paintFindings(r);
  $('memo').textContent = buildMemo(sampleLabel, playbook, r);
  $('fit-warning').style.display = r.coverageShare < 0.5 ? '' : 'none';
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(run, 250);
}

function setMetric(id, value, sub, tone) {
  const n = $(id);
  n.querySelector('.metric__value').textContent = value;
  n.querySelector('.metric__sub').textContent = sub;
  n.classList.toggle('metric--good', tone === 'good');
  n.classList.toggle('metric--warn', tone === 'warn');
}

function paintMetrics(r) {
  setMetric('m-grade', r.grade.letter, r.grade.label,
    r.counts.critical ? 'warn' : r.score === 0 ? 'good' : undefined);
  setMetric('m-critical', String(r.counts.critical), 'must be resolved before signature',
    r.counts.critical ? 'warn' : 'good');
  setMetric('m-major', String(r.counts.major), 'worth negotiating');
  setMetric('m-minor', String(r.counts.minor), 'record as exceptions');
  setMetric('m-coverage', `${r.recognised}/${r.applicable}`,
    `playbook clauses located · ${pct(r.coverageShare, 0)} coverage`,
    r.coverageShare < 0.5 ? 'warn' : undefined);
  setMetric('m-route', r.routing.label, r.routing.detail);
  $('parse-stats').textContent =
    `${num(r.words)} words · ${r.segments.length} segments · ` +
    `${r.unclassified.length} unclassified (${num(r.unclassifiedWords)} words)`;
}

function paintCoverage(r) {
  const host = $('coverage');
  host.innerHTML = '';

  for (const c of r.coverage) {
    const item = document.createElement('div');
    const modifier = c.state === 'clean' ? 'clean'
      : c.state === 'missing' ? 'missing'
      : c.state === 'absent' ? 'absent'
      : c.worst;
    item.className = `cov cov--${modifier}`;

    const state = c.state === 'clean' ? '<span class="tag tag--go">within playbook</span>'
      : c.state === 'missing' ? '<span class="tag tag--hold">not found</span>'
      : c.state === 'absent' ? '<span class="tag tag--quiet">not present</span>'
      : `<span class="tag tag--${TAG[c.worst]}">${c.findings} ` +
        `deviation${c.findings === 1 ? '' : 's'}</span>`;

    const matched = `matched on ${c.matchedTerms.slice(0, 3).map(esc).join(', ')}` +
      `${c.matchedTerms.length > 3 ? '…' : ''}`;
    const meta = c.state === 'deviation' ? `worst ${c.worst} · ${matched}`
      : c.state === 'clean' ? matched
      : c.state === 'missing' ? 'required by the playbook' : 'not required';

    item.innerHTML =
      `<span class="cov__name">${esc(c.name)}</span>${state}` +
      `<span class="cov__meta">${meta}</span>`;
    host.appendChild(item);
  }
}

function paintFindings(r) {
  const host = $('findings');
  host.innerHTML = '';

  if (!r.findings.length) {
    host.innerHTML =
      '<div class="finding finding--note"><p class="finding__head">' +
      '<span class="tag tag--go">clear</span> No deviation from the playbook</p>' +
      '<p class="finding__body">Every located clause sits within the playbook. Read the ' +
      'coverage map above before treating that as a clean bill — a clause that was ' +
      'never located cannot be checked, and silence from a check is not the same ' +
      'as a good clause.</p></div>';
    return;
  }

  for (const f of r.findings) {
    const item = document.createElement('div');
    item.className = `finding finding--${f.severity}`;

    let html =
      `<p class="finding__head"><span class="tag tag--${TAG[f.severity]}">${f.severity}</span> ` +
      `${esc(f.clauseName)} — ${esc(f.label)}</p>` +
      `<p class="finding__body">${esc(f.finding)}</p>`;

    if (f.observed !== undefined) {
      html += `<p class="finding__body"><strong>Observed ${num(f.observed)} ${esc(f.unit)}` +
        `</strong> against a playbook position of ${num(f.threshold)} ${esc(f.unit)}.</p>`;
    }
    if (f.excerpt) {
      html += `<p class="finding__evidence">${esc(f.excerpt)}</p>`;
    }

    html += '<dl class="finding__grid">' +
      `<div><dt>Standard position</dt><dd>${esc(f.standard)}</dd></div>` +
      (f.fallback ? `<div><dt>Acceptable fallback</dt><dd>${esc(f.fallback)}</dd></div>` : '') +
      `<div><dt>Proposed language</dt><dd class="redline">${esc(f.redline)}</dd></div>` +
      '</dl>';

    item.innerHTML = html;
    host.appendChild(item);
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ---------------------------------------------------------------- input -- */

function onPlaybookInput(e) {
  const t = e.target;
  const { clause: clauseId, check: checkId, field } = t.dataset;
  if (!clauseId || !checkId || !field) return;

  const clause = playbook.clauses.find(c => c.id === clauseId);
  const check = clause && clause.checks.find(k => k.id === checkId);
  if (!check) return;

  if (field === 'enabled') check.enabled = t.checked;
  else if (field === 'severity') check.severity = t.value;
  else if (field === 'value') check.value = Math.max(0, parseNum(t.value, check.value));

  run();
}

function exportFindings() {
  const rows = latest.findings.map(f => ({
    severity: f.severity,
    clause: f.clauseName,
    deviation: f.label,
    check_id: f.checkId,
    observed: f.observed ?? '',
    playbook_position: f.threshold ?? '',
    unit: f.unit ?? '',
    finding: f.finding,
    text_relied_on: f.excerpt ?? '',
    standard: f.standard,
    fallback: f.fallback ?? '',
    proposed_language: f.redline,
  }));
  if (!rows.length) {
    toast('No deviations to export');
    return;
  }
  download('contract-review-findings.csv', toCSV(rows));
  toast('Findings exported');
}

function exportPlaybook() {
  download('negotiation-playbook.json', JSON.stringify(playbook, null, 2),
    'application/json;charset=utf-8');
  toast('Playbook exported — portable to any other review process');
}

function importPlaybook(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const next = JSON.parse(String(reader.result));
      if (!next || !Array.isArray(next.clauses) || !next.clauses.length) {
        throw new Error('shape');
      }
      playbook = next;
      $('playbook-name').textContent = `${playbook.name} · v${playbook.version}`;
      buildPlaybookTable();
      run();
      const n = playbook.clauses.length;
      toast(`Loaded ${n} clause type${n === 1 ? '' : 's'}`);
    } catch {
      toast('Could not read that playbook — expected the JSON this tool exports');
    }
  };
  reader.readAsText(file);
}

async function copyMemo() {
  try {
    await navigator.clipboard.writeText($('memo').textContent);
    toast('Memo copied to clipboard');
  } catch {
    const range = document.createRange();
    range.selectNodeContents($('memo'));
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    toast('Memo selected — press Ctrl/Cmd + C');
  }
}

let toastTimer;
function toast(message) {
  const n = $('toast');
  n.textContent = message;
  n.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => n.classList.remove('is-visible'), 2600);
}

function loadInto(id) {
  const s = loadSample(id);
  sampleLabel = s.label;
  $('document').value = s.text;
  $('sample-note').textContent = s.note;
  run();
}

/* ---------------------------------------------------------------- start -- */

function init() {
  buildSampleOptions();
  buildPlaybookTable();
  $('playbook-name').textContent = `${playbook.name} · v${playbook.version}`;
  $('sample').value = SAMPLES[0].id;
  loadInto(SAMPLES[0].id);

  $('sample').addEventListener('change', e => loadInto(e.target.value));
  $('document').addEventListener('input', schedule);
  $('playbook-body').addEventListener('input', onPlaybookInput);
  $('playbook-body').addEventListener('change', onPlaybookInput);

  $('btn-copy').addEventListener('click', copyMemo);
  $('btn-csv').addEventListener('click', exportFindings);
  $('btn-playbook').addEventListener('click', exportPlaybook);
  $('btn-load-playbook').addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', e => {
    if (e.target.files && e.target.files[0]) importPlaybook(e.target.files[0]);
    e.target.value = '';
  });
  $('btn-reset').addEventListener('click', () => {
    playbook = clonePlaybook(DEFAULT_PLAYBOOK);
    $('playbook-name').textContent = `${playbook.name} · v${playbook.version}`;
    buildPlaybookTable();
    loadInto($('sample').value || SAMPLES[0].id);
  });
  $('btn-clear').addEventListener('click', () => {
    sampleLabel = 'Pasted document';
    $('document').value = '';
    $('sample-note').textContent = 'Paste a contract into the box below.';
    $('document').focus();
    run();
  });
}

init();
