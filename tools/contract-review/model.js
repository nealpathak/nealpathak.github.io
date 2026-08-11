// Contract review — check execution, grading, and routing.
//
// Every finding carries the text that triggered it and its position in the
// document. A review tool that reports a conclusion without the evidence is
// asking to be trusted; one that shows the clause it read is asking to be
// checked. The second is the only one worth putting in front of a reviewer.

import { segment, classify, wordCount } from './parse.js';
import { ROUTING } from './playbook.js';

const WEIGHT = { critical: 10, major: 4, minor: 1 };
const RANK = { critical: 0, major: 1, minor: 2 };

/** Case-insensitive search returning the match and a window of context. */
function findMatch(text, pattern) {
  let re;
  try { re = new RegExp(pattern, 'i'); } catch { return null; }
  const m = text.match(re);
  if (!m) return null;
  const at = m.index ?? 0;
  const from = Math.max(0, at - 90);
  const to = Math.min(text.length, at + m[0].length + 90);
  // Patterns that accept either word order carry one capture group per branch,
  // so take the first branch that actually matched.
  let capture;
  for (let i = 1; i < m.length; i++) {
    if (m[i] !== undefined) { capture = m[i]; break; }
  }
  return {
    matched: m[0],
    capture,
    at,
    excerpt: (from > 0 ? '…' : '') + text.slice(from, to).replace(/\s+/g, ' ').trim() +
             (to < text.length ? '…' : ''),
  };
}

function toNumber(raw) {
  const n = Number(String(raw ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Run one check against the assembled text of a clause. */
function runCheck(check, clause, text) {
  if (!check.enabled) return null;
  const hit = findMatch(text, check.pattern);
  const base = {
    id: `${clause.id}:${check.id}`,
    clauseId: clause.id,
    clauseName: clause.name,
    checkId: check.id,
    label: check.label,
    severity: check.severity,
    finding: check.finding,
    standard: clause.standard,
    fallback: check.fallback,
    redline: check.redline,
    kind: check.type,
  };

  switch (check.type) {
    case 'mustNotMatch':
      return hit ? { ...base, excerpt: hit.excerpt, matched: hit.matched, at: hit.at } : null;

    case 'mustMatch':
      return hit ? null : { ...base, excerpt: null, matched: null, at: null };

    case 'numberAtLeast': {
      const v = hit ? toNumber(hit.capture) : null;
      if (v === null) return null; // nothing to compare against
      return v < check.value
        ? { ...base, excerpt: hit.excerpt, matched: hit.matched, at: hit.at,
            observed: v, threshold: check.value, unit: check.unit }
        : null;
    }

    case 'numberAtMost': {
      const v = hit ? toNumber(hit.capture) : null;
      if (v === null) return null;
      return v > check.value
        ? { ...base, excerpt: hit.excerpt, matched: hit.matched, at: hit.at,
            observed: v, threshold: check.value, unit: check.unit }
        : null;
    }

    default:
      return null;
  }
}

/**
 * Review a contract against a playbook.
 * @param {string} text
 * @param {object} playbook
 */
export function review(text, playbook) {
  const segments = segment(text);
  const assignments = classify(segments, playbook);

  const findings = [];
  const coverage = [];

  for (const clause of playbook.clauses) {
    const entry = assignments.get(clause.id);
    const clauseText = entry ? entry.segments.map(s => s.text).join('\n\n') : '';

    if (!entry) {
      if (clause.required && clause.severityIfMissing) {
        findings.push({
          id: `${clause.id}:missing`,
          clauseId: clause.id,
          clauseName: clause.name,
          checkId: 'missing',
          label: 'Clause not found',
          severity: clause.severityIfMissing,
          kind: 'missing',
          finding: `No ${clause.name.toLowerCase()} clause was located in the draft. ` +
            'Either it is absent, or it is worded in a way this playbook does not ' +
            'recognise — both are worth resolving before signature.',
          standard: clause.standard,
          fallback: null,
          redline: `Insert a ${clause.name.toLowerCase()} clause reflecting the standard position.`,
          excerpt: null,
          matched: null,
          at: null,
        });
      }
      coverage.push({
        clauseId: clause.id,
        name: clause.name,
        state: clause.required ? 'missing' : 'absent',
        findings: 0,
        worst: clause.required ? clause.severityIfMissing : null,
        segments: 0,
        matchedTerms: [],
      });
      continue;
    }

    const clauseFindings = clause.checks
      .map(c => runCheck(c, clause, clauseText))
      .filter(Boolean);
    findings.push(...clauseFindings);

    const worst = clauseFindings.length
      ? clauseFindings.slice().sort((a, b) => RANK[a.severity] - RANK[b.severity])[0].severity
      : null;

    coverage.push({
      clauseId: clause.id,
      name: clause.name,
      state: clauseFindings.length ? 'deviation' : 'clean',
      findings: clauseFindings.length,
      worst,
      segments: entry.segments.length,
      matchedTerms: [...entry.matched],
      score: entry.score,
      excerpt: clauseText.replace(/\s+/g, ' ').slice(0, 220),
    });
  }

  findings.sort((a, b) => RANK[a.severity] - RANK[b.severity] ||
    a.clauseName.localeCompare(b.clauseName));

  const counts = {
    critical: findings.filter(f => f.severity === 'critical').length,
    major: findings.filter(f => f.severity === 'major').length,
    minor: findings.filter(f => f.severity === 'minor').length,
  };
  const score = counts.critical * WEIGHT.critical +
                counts.major * WEIGHT.major +
                counts.minor * WEIGHT.minor;

  const worst = counts.critical ? 'critical' : counts.major ? 'major' : counts.minor ? 'minor' : null;
  const routing = ROUTING.find(r => r.worst === worst) ?? ROUTING[0];

  const recognised = coverage.filter(c => c.state === 'clean' || c.state === 'deviation').length;
  const applicable = playbook.clauses.length;
  const unclassified = segments.filter(s => !s.clauseId);

  return {
    segments,
    unclassified,
    coverage,
    findings,
    counts,
    score,
    grade: gradeFor(score, counts),
    routing,
    recognised,
    applicable,
    coverageShare: applicable ? recognised / applicable : 0,
    words: wordCount(text),
    unclassifiedWords: unclassified.reduce((a, s) => a + wordCount(s.text), 0),
  };
}

function gradeFor(score, counts) {
  if (counts.critical) return { letter: 'D', label: 'Do not sign as drafted' };
  if (score >= 16) return { letter: 'C', label: 'Substantial negotiation needed' };
  if (score >= 6) return { letter: 'B', label: 'Negotiable with noted exceptions' };
  if (score > 0) return { letter: 'A−', label: 'Minor exceptions only' };
  return { letter: 'A', label: 'Within playbook' };
}
