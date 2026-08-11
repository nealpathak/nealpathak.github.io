// Segmentation and clause classification.
//
// This is deterministic text matching, not comprehension. It finds structure it
// was told to look for and assigns clauses by weighted term score. The whole
// point of exposing the score and the matched terms in the interface is that a
// reviewer can see exactly why a segment was labelled the way it was — and can
// see when it was labelled wrongly, which is the failure mode that matters.

const HEADING_PATTERNS = [
  // 1. / 1.1 / 12.3.4 followed by a title
  /^\s*(\d+(?:\.\d+)*)[.):]?\s+(.{2,90})$/,
  // ARTICLE IV — TITLE  |  SECTION 5. TITLE
  /^\s*(ARTICLE|SECTION)\s+([IVXLC]+|\d+)[.):—-]*\s*(.{0,90})$/i,
  // A short line in title or upper case, used as a bare heading
  /^\s*([A-Z][A-Z \t&,'()/-]{3,60})\s*$/,
];

/**
 * Break a contract into heading-led segments. Falls back to paragraph blocks
 * when the document carries no detectable numbering, which is common in short
 * form NDAs.
 * @param {string} text
 * @returns {{index:number, heading:string, body:string, text:string, start:number}[]}
 */
export function segment(text) {
  const clean = String(text).replace(/\r\n?/g, '\n').replace(/ /g, ' ');
  const lines = clean.split('\n');

  const segments = [];
  let current = null;
  let offset = 0;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const lineStart = offset;
    offset += raw.length + 1;

    const heading = detectHeading(line);
    if (heading) {
      if (current) segments.push(current);
      current = { heading, bodyLines: [], start: lineStart };
      continue;
    }
    if (!line.trim()) {
      if (current) current.bodyLines.push('');
      continue;
    }
    if (!current) current = { heading: '', bodyLines: [], start: lineStart };
    current.bodyLines.push(line);
  }
  if (current) segments.push(current);

  const withBodies = segments
    .map((s, i) => {
      const body = s.bodyLines.join('\n').trim();
      return {
        index: i,
        heading: s.heading,
        body,
        text: `${s.heading}\n${body}`.trim(),
        start: s.start,
      };
    })
    .filter(s => s.text.length > 0);

  // No headings at all — fall back to paragraphs so classification still has
  // something the size of a clause to work with.
  if (withBodies.every(s => !s.heading) && withBodies.length <= 2) {
    return clean
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 40)
      .map((p, i) => ({
        index: i,
        heading: '',
        body: p,
        text: p,
        start: clean.indexOf(p),
      }));
  }

  return withBodies;
}

function detectHeading(line) {
  if (!line.trim() || line.length > 120) return '';
  for (const re of HEADING_PATTERNS) {
    const m = line.match(re);
    if (!m) continue;
    // A numbered line that runs on into a sentence is body text, not a heading.
    if (re === HEADING_PATTERNS[0] && m[2].length > 70) return '';
    if (re === HEADING_PATTERNS[0] && /[.;]$/.test(m[2]) && m[2].split(' ').length > 8) return '';
    return line.trim();
  }
  return '';
}

/**
 * Score each segment against every clause type and assign the best match.
 * Terms found in a heading count double — a heading is the drafter telling you
 * what the clause is, and it is the strongest signal in the document.
 */
export function classify(segments, playbook) {
  const assignments = new Map(); // clause id -> {segments:[], score, matched:Set}

  for (const seg of segments) {
    const headingLower = seg.heading.toLowerCase();
    const bodyLower = seg.body.toLowerCase();

    let best = null;
    for (const clause of playbook.clauses) {
      let score = 0;
      const matched = [];
      for (const term of clause.terms) {
        const t = term.toLowerCase();
        const weight = 1 + Math.min(2, t.split(' ').length - 1) * 0.5;
        if (headingLower.includes(t)) { score += weight * 2.5; matched.push(term); }
        else if (bodyLower.includes(t)) { score += weight; matched.push(term); }
      }
      if (score > 0 && (!best || score > best.score)) best = { clause, score, matched };
    }

    if (!best || best.score < 1.5) continue;

    seg.clauseId = best.clause.id;
    seg.score = best.score;
    seg.matchedTerms = best.matched;

    const entry = assignments.get(best.clause.id) ??
      { segments: [], score: 0, matched: new Set() };
    entry.segments.push(seg);
    entry.score += best.score;
    best.matched.forEach(m => entry.matched.add(m));
    assignments.set(best.clause.id, entry);
  }

  return assignments;
}

/** Words, for the coverage statistics. */
export function wordCount(text) {
  const m = String(text).trim().match(/\S+/g);
  return m ? m.length : 0;
}
