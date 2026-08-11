// Reserve memo generation. The table below is the artefact that actually gets
// circulated — the charts are for the room, this is for the file.

import { money, num, pct } from '../../assets/js/fmt.js';

const W = 24;

const line = (label, value) => `  ${label.padEnd(W, '.')} ${value}`;

const METHOD_NAMES = {
  'volume-all': 'Volume-weighted, all years',
  'simple-all': 'Simple average, all years',
  'volume-3': 'Volume-weighted, latest three',
  'simple-3': 'Simple average, latest three',
};

const BLEND_NAMES = {
  benktander: 'Benktander — credibility weight equals share reported',
  manual: 'Manual weight on chain ladder',
  cl: 'Chain ladder only',
  bf: 'Bornhuetter-Ferguson only',
};

function col(v, width, align = 'right') {
  const s = String(v);
  return align === 'right' ? s.padStart(width) : s.padEnd(width);
}

export function buildMemo(config, r) {
  const p = config.program;
  const t = r.totals;
  const out = [];

  out.push(`RESERVE AND AGGREGATE POSITION — ${p.name.toUpperCase()}`);
  out.push('='.repeat(76));
  out.push(`Valuation ${p.valuation} · Projection basis: reported ${p.basis}`);
  out.push('');

  out.push('POSITION — ALL YEARS');
  out.push(line('Earned premium', money(t.earnedPremium)));
  out.push(line('Paid to date', money(t.paid)));
  out.push(line('Case reserves', money(t.caseReserve)));
  out.push(line('Reported incurred', money(t.incurred)));
  out.push(line('IBNR', money(t.ibnr)));
  out.push(line('Selected ultimate', `${money(t.ultimate)}  (loss ratio ${pct(t.lossRatio)})`));
  out.push(line('Total reserve need', money(t.totalReserve)));
  out.push(line('Held funding', money(t.funded)));
  out.push(line('Surplus / (deficit)', money(t.surplus)));
  out.push('');

  out.push('METHOD');
  out.push(line('Factor selection', METHOD_NAMES[p.method] ?? p.method));
  out.push(line('Tail factor', p.tailFactor.toFixed(3)));
  out.push(line('A priori loss ratio', pct(p.aprioriLossRatio)));
  out.push(line('Ultimate selection', BLEND_NAMES[p.blend] ?? p.blend));
  if (p.blend === 'manual') out.push(line('Weight on chain ladder', pct(p.blendWeight, 0)));
  out.push(line('Severity trend', `${pct(p.trend)} per annum`));
  out.push(line('Rate level trend', `${pct(p.rateLevelTrend)} per annum`));
  out.push(line('Maturity threshold', `${pct(p.maturityThreshold, 0)} reported`));
  out.push('');

  out.push('SELECTED DEVELOPMENT FACTORS');
  const bands = r.selected.map(s =>
    `${s.fromAge}-${s.toAge} ${s.selected.toFixed(3)}${s.overridden ? '*' : ''}`);
  bands.push(`tail ${p.tailFactor.toFixed(3)}`);
  for (let i = 0; i < bands.length; i += 4) {
    out.push(`  ${bands.slice(i, i + 4).map(b => col(b, 17, 'left')).join('')}`.trimEnd());
  }
  if (r.selected.some(s => s.overridden)) out.push('  * manually overridden');
  out.push('');

  out.push('BY ACCIDENT YEAR');
  out.push(
    `  ${col('AY', 6, 'left')}${col('Age', 5)}${col('Incurred', 13)}${col('CDF', 8)}` +
    `${col('Chain ldr', 13)}${col('B-F', 13)}${col('Selected', 13)}${col('LR', 8)}${col('Agg', 8)}`);
  out.push(`  ${'-'.repeat(85)}`);
  for (const y of r.years) {
    out.push(
      `  ${col(y.year, 6, 'left')}${col(y.age ?? '—', 5)}${col(money(y.incurred), 13)}` +
      `${col(y.cdf.toFixed(3), 8)}${col(money(y.clUlt), 13)}${col(money(y.bfUlt), 13)}` +
      `${col(money(y.ultimate), 13)}${col(pct(y.lossRatio, 0), 8)}` +
      `${col(y.erosionUltimate === null ? '—' : pct(y.erosionUltimate, 0), 8)}`);
  }
  out.push(`  ${'-'.repeat(85)}`);
  out.push(
    `  ${col('Total', 6, 'left')}${col('', 5)}${col(money(t.incurred), 13)}${col('', 8)}` +
    `${col(money(t.clUlt), 13)}${col(money(t.bfUlt), 13)}${col(money(t.ultimate), 13)}` +
    `${col(pct(t.lossRatio, 0), 8)}${col(pct(t.erosionUltimate, 0), 8)}`);
  out.push('');

  out.push('FUNDING AND AGGREGATE');
  out.push(
    `  ${col('AY', 6, 'left')}${col('Funded', 13)}${col('Ultimate', 13)}` +
    `${col('Surplus', 13)}${col('Agg limit', 13)}${col('Headroom', 13)}`);
  out.push(`  ${'-'.repeat(71)}`);
  for (const y of r.years) {
    out.push(
      `  ${col(y.year, 6, 'left')}${col(money(y.funded), 13)}${col(money(y.ultimate), 13)}` +
      `${col(money(y.surplus), 13)}${col(money(y.limit), 13)}${col(money(y.headroom), 13)}`);
  }
  out.push('');

  out.push(`RENEWAL INDICATION — ${r.indication.next}`);
  if (r.indication.insufficient) {
    out.push('  No accident year is mature enough to carry experience weight at the');
    out.push('  stated threshold. The indication has to come from exposure rating or');
    out.push('  from the a priori, not from this triangle.');
  } else {
    out.push(line('Years used', r.indication.used.join(', ')));
    if (r.indication.excluded.length) {
      out.push(line('Excluded as immature', r.indication.excluded.join(', ')));
    }
    out.push(line('Trended ultimate loss', money(r.indication.trendedLoss)));
    out.push(line('On-level premium', money(r.indication.onLevelPremium)));
    out.push(line('Trended loss ratio', pct(r.indication.trendedLossRatio)));
    out.push(line('Against a priori', pct(p.aprioriLossRatio)));
    out.push(line('Indicated change', `${r.indication.change >= 0 ? '+' : ''}${pct(r.indication.change)}`));
    out.push('');
    out.push('  Losses are trended at the severity trend and premium is brought to');
    out.push('  current rate level at the rate trend. Trending one without the other');
    out.push('  manufactures a rate need that is not there.');
  }
  out.push('');

  if (r.diagnostics.length) {
    out.push('DIAGNOSTICS');
    for (const d of r.diagnostics) {
      out.push(`  [${d.severity.toUpperCase().padEnd(6)}] ${d.title}`);
      out.push(`           ${wrap(d.detail, 66).join('\n           ')}`);
    }
    out.push('');
  }

  out.push('ASSUMPTIONS AND LIMITS');
  out.push('  - Chain ladder assumes future development resembles the average of the');
  out.push('    past. It cannot see a change in case reserving philosophy, a shift in');
  out.push('    claim mix, or a single large claim distorting one cell.');
  out.push('  - The tail factor is an assumption. There is no observation beyond the');
  out.push('    end of the triangle to support it, and on a long-tail line it can carry');
  out.push('    more of the answer than the data does.');
  out.push('  - Ultimates are undiscounted and gross of any reinsurance or excess');
  out.push('    recovery unless the input triangle was already net.');
  out.push('  - Erosion is measured on an aggregate basis from projected ultimates.');
  out.push('    Applying a per-occurrence retention needs claim-level detail this');
  out.push('    triangle does not carry.');
  out.push('  - No claim count, exposure, or severity trend testing is performed. The');
  out.push('    renewal indication trends ultimates only.');
  out.push('  - A range matters more than a point. Vary the tail, the selection method,');
  out.push('    and the a priori before anyone treats one figure as the answer.');
  out.push('');
  out.push('Illustrative modelling on synthetic data. Not an actuarial opinion, not a');
  out.push('reserve certification, and not accounting or legal advice.');

  return out.join('\n');
}

function wrap(text, width) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > width) { lines.push(cur.trim()); cur = w; }
    else cur += ` ${w}`;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}
