// Negotiation memo generation. The output is the thing that gets forwarded to
// the business owner, so it leads with the decision — sign, negotiate, or
// escalate — and puts the drafting language where someone can lift it straight
// into a redline.

const SEVERITY_ORDER = ['critical', 'major', 'minor'];
const HEADINGS = {
  critical: 'CRITICAL — RESOLVE BEFORE SIGNATURE',
  major: 'MAJOR — NEGOTIATE',
  minor: 'MINOR — NOTE AS EXCEPTIONS',
};

const W = 22;
const line = (label, value) => `  ${label.padEnd(W, '.')} ${value}`;

function wrap(text, width, indent) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((`${cur} ${w}`).trim().length > width) { lines.push(indent + cur.trim()); cur = w; }
    else cur += ` ${w}`;
  }
  if (cur.trim()) lines.push(indent + cur.trim());
  return lines;
}

export function buildMemo(sampleLabel, playbook, r) {
  const out = [];

  out.push('CONTRACT REVIEW — DEVIATIONS FROM PLAYBOOK');
  out.push('='.repeat(74));
  out.push('');

  out.push('SUMMARY');
  out.push(line('Document', sampleLabel));
  out.push(line('Playbook', `${playbook.name} (v${playbook.version})`));
  out.push(line('Reviewing as', playbook.position));
  out.push(line('Risk grade', `${r.grade.letter} — ${r.grade.label}`));
  out.push(line('Deviations', `${r.counts.critical} critical · ${r.counts.major} major · ${r.counts.minor} minor`));
  out.push(line('Clause coverage', `${r.recognised} of ${r.applicable} playbook clauses located`));
  out.push(line('Approval route', r.routing.label));
  out.push('');
  out.push(...wrap(r.routing.detail, 70, '  '));
  out.push('');

  if (r.coverageShare < 0.5) {
    out.push('  ! Fewer than half the playbook clauses were located in this document.');
    out.push('    Either the draft is unusually thin or this is the wrong playbook for');
    out.push('    the document type. Check the fit before relying on the findings.');
    out.push('');
  }

  for (const severity of SEVERITY_ORDER) {
    const group = r.findings.filter(f => f.severity === severity);
    if (!group.length) continue;

    out.push(HEADINGS[severity]);
    out.push('-'.repeat(74));
    group.forEach((f, i) => {
      out.push(`${i + 1}. ${f.clauseName} — ${f.label}`);
      out.push(...wrap(f.finding, 68, '   '));
      if (f.observed !== undefined) {
        out.push(`   Observed: ${f.observed} ${f.unit} · Playbook: ${f.threshold} ${f.unit}`);
      }
      if (f.excerpt) {
        out.push('   Text relied on:');
        out.push(...wrap(`"${f.excerpt}"`, 66, '     '));
      }
      out.push('   Standard position:');
      out.push(...wrap(f.standard, 66, '     '));
      if (f.fallback) {
        out.push('   Acceptable fallback:');
        out.push(...wrap(f.fallback, 66, '     '));
      }
      out.push('   Proposed language:');
      out.push(...wrap(f.redline, 66, '     '));
      out.push('');
    });
  }

  if (!r.findings.length) {
    out.push('NO DEVIATIONS');
    out.push('-'.repeat(74));
    out.push('  Every located clause sits within the playbook. That is a result worth');
    out.push('  a second look rather than a rubber stamp — confirm the clauses that');
    out.push('  matter most were actually located, not merely unflagged.');
    out.push('');
  }

  out.push('CLAUSE COVERAGE');
  out.push('-'.repeat(74));
  for (const c of r.coverage) {
    const state = c.state === 'clean' ? 'within playbook'
      : c.state === 'deviation' ? `${c.findings} deviation${c.findings === 1 ? '' : 's'} (${c.worst})`
      : c.state === 'missing' ? 'NOT FOUND — required'
      : 'not present — not required';
    out.push(`  ${c.name.padEnd(34, '.')} ${state}`);
  }
  out.push('');

  out.push('METHOD AND LIMITS');
  out.push('-'.repeat(74));
  out.push('  - This is deterministic pattern matching, not comprehension. It finds');
  out.push('    what the playbook told it to look for and nothing else. A clause');
  out.push('    drafted in unusual language will be missed, and a clause that reads');
  out.push('    badly for reasons no check covers will pass.');
  out.push('  - Every segment is assigned to at most one clause type. Where a draft');
  out.push('    combines term and termination in a single section, one of the two will');
  out.push('    report as not found.');
  out.push('  - Absence of a finding is not a clean bill. Read the coverage table: a');
  out.push('    clause that was never located cannot be checked.');
  out.push('  - Numeric thresholds are extracted from the surrounding sentence. A');
  out.push('    figure stated in a schedule or exhibit will not be seen.');
  out.push('  - This is a triage aid that tells a reviewer where to look first. It is');
  out.push('    not a legal review and does not replace one.');
  out.push('');
  out.push('Synthetic sample text. Not legal advice.');

  return out.join('\n');
}
