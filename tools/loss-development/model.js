// Loss Development & Aggregate Erosion — calculation layer.
//
// Pure functions over a plain config object. No DOM, no I/O.
//
// Method summary
// --------------
// Standard chain ladder on a cumulative triangle, with a Bornhuetter-Ferguson
// alternative and a credibility blend of the two.
//
//   CDF(age)      product of the selected age-to-age factors from that age
//                 onward, times the tail factor
//   Chain ladder  latest cumulative × CDF
//   BF            latest cumulative + (1 − 1/CDF) × a priori ultimate
//   Benktander    (1/CDF) × chain ladder + (1 − 1/CDF) × BF
//
// The Benktander form is the credibility blend: it leans on the data as a year
// matures and on the a priori while the year is green. That is the whole reason
// it exists, and it is why it is the default here — a green year run on chain
// ladder alone is a factor applied to noise.

import { clamp } from '../../assets/js/fmt.js';

/* ------------------------------------------------------------- triangle -- */

/** Index of the most recent development point with data, or -1. */
export function latestIndex(row) {
  for (let i = row.length - 1; i >= 0; i--) {
    if (row[i] !== null && row[i] !== undefined && Number.isFinite(row[i])) return i;
  }
  return -1;
}

function cell(year, basis, i) {
  const v = year[basis][i];
  return v === null || v === undefined || !Number.isFinite(v) ? null : v;
}

/**
 * Age-to-age factors for every year at every age, plus the four candidate
 * selections at each age.
 */
export function linkRatios(config) {
  const { ages, basis } = config.program;
  const out = [];

  for (let i = 0; i < ages.length - 1; i++) {
    const ratios = [];
    let sumFrom = 0;
    let sumTo = 0;

    for (const y of config.years) {
      const from = cell(y, basis, i);
      const to = cell(y, basis, i + 1);
      if (from === null || to === null || from <= 0) continue;
      ratios.push({ year: y.year, value: to / from });
      sumFrom += from;
      sumTo += to;
    }

    const volumeAll = sumFrom > 0 ? sumTo / sumFrom : null;
    const simpleAll = ratios.length
      ? ratios.reduce((a, r) => a + r.value, 0) / ratios.length
      : null;

    // "Latest 3" means the three most recent accident years that contribute a
    // factor at this age, not the last three rows of the triangle.
    const latest3 = ratios.slice(-3);
    const simple3 = latest3.length
      ? latest3.reduce((a, r) => a + r.value, 0) / latest3.length
      : null;

    let v3From = 0;
    let v3To = 0;
    for (const r of latest3) {
      const y = config.years.find(x => x.year === r.year);
      v3From += cell(y, basis, i);
      v3To += cell(y, basis, i + 1);
    }
    const volume3 = v3From > 0 ? v3To / v3From : null;

    out.push({
      index: i,
      fromAge: ages[i],
      toAge: ages[i + 1],
      ratios,
      candidates: { 'volume-all': volumeAll, 'simple-all': simpleAll, 'volume-3': volume3, 'simple-3': simple3 },
      count: ratios.length,
    });
  }

  return out;
}

/** Apply the selection method and any manual overrides. */
export function selectedFactors(config, links) {
  const { method, ldfOverrides } = config.program;
  return links.map(link => {
    const override = ldfOverrides[link.index];
    const auto = link.candidates[method] ?? link.candidates['volume-all'] ?? 1;
    const value = Number.isFinite(override) ? override : (auto ?? 1);
    return {
      ...link,
      auto: auto ?? 1,
      selected: value,
      overridden: Number.isFinite(override),
    };
  });
}

/** Cumulative development factor at each age, tail included. */
export function cumulativeFactors(config, selected) {
  const { ages, tailFactor } = config.program;
  const cdf = new Array(ages.length).fill(1);
  cdf[ages.length - 1] = tailFactor;
  for (let i = ages.length - 2; i >= 0; i--) {
    cdf[i] = cdf[i + 1] * selected[i].selected;
  }
  return cdf;
}

/* ----------------------------------------------------------- projection -- */

export function analyse(config) {
  const p = config.program;
  const links = linkRatios(config);
  const selected = selectedFactors(config, links);
  const cdf = cumulativeFactors(config, selected);

  const years = config.years.map(y => {
    const iBasis = latestIndex(y[p.basis]);
    const iPaid = latestIndex(y.paid);
    const iInc = latestIndex(y.incurred);

    const latest = iBasis >= 0 ? y[p.basis][iBasis] : 0;
    const paid = iPaid >= 0 ? y.paid[iPaid] : 0;
    const incurred = iInc >= 0 ? y.incurred[iInc] : 0;
    const factor = iBasis >= 0 ? cdf[iBasis] : 1;

    const aprioriUlt = y.earnedPremium * p.aprioriLossRatio;
    const clUlt = latest * factor;
    const bfUlt = latest + (1 - 1 / factor) * aprioriUlt;
    const reported = 1 / factor;

    let weight; // weight placed on the chain ladder
    if (p.blend === 'cl') weight = 1;
    else if (p.blend === 'bf') weight = 0;
    else if (p.blend === 'manual') weight = clamp(p.blendWeight, 0, 1);
    else weight = clamp(reported, 0, 1); // Benktander

    const ultimate = weight * clUlt + (1 - weight) * bfUlt;
    const caseReserve = incurred - paid;
    const ibnr = ultimate - incurred;
    const limit = y.aggregateLimit;

    return {
      year: y.year,
      ageIndex: iBasis,
      age: iBasis >= 0 ? p.ages[iBasis] : null,
      earnedPremium: y.earnedPremium,
      paid,
      incurred,
      caseReserve,
      cdf: factor,
      reportedShare: reported,
      aprioriUlt,
      clUlt,
      bfUlt,
      weight,
      ultimate,
      ibnr,
      totalReserve: ultimate - paid,
      lossRatio: y.earnedPremium > 0 ? ultimate / y.earnedPremium : null,
      funded: y.funded,
      surplus: y.funded - ultimate,
      limit,
      erosionPaid: limit > 0 ? paid / limit : null,
      erosionIncurred: limit > 0 ? incurred / limit : null,
      erosionUltimate: limit > 0 ? ultimate / limit : null,
      headroom: limit - ultimate,
    };
  });

  const sum = key => years.reduce((a, y) => a + (y[key] || 0), 0);
  const totals = {
    earnedPremium: sum('earnedPremium'),
    paid: sum('paid'),
    incurred: sum('incurred'),
    caseReserve: sum('caseReserve'),
    clUlt: sum('clUlt'),
    bfUlt: sum('bfUlt'),
    ultimate: sum('ultimate'),
    ibnr: sum('ibnr'),
    totalReserve: sum('totalReserve'),
    funded: sum('funded'),
    surplus: sum('surplus'),
    limit: sum('limit'),
  };
  totals.lossRatio = totals.earnedPremium > 0 ? totals.ultimate / totals.earnedPremium : null;
  totals.erosionUltimate = totals.limit > 0 ? totals.ultimate / totals.limit : null;

  const rateIndication = indication(config, years);

  return {
    links,
    selected,
    cdf,
    years,
    totals,
    pattern: cdf.map(f => 1 / f),
    indication: rateIndication,
    diagnostics: diagnose(config, { years, selected, cdf, totals, rateIndication }),
  };
}

/* ----------------------------------------------------------- indication -- */

/**
 * Experience indication for the next program year.
 *
 * Losses are trended forward at the severity trend and premium is brought to
 * current rate level at the rate-change trend. Trending one without the other
 * is the classic way to manufacture a rate need that does not exist — if the
 * two trends are equal the indication collapses back to the raw loss ratio,
 * which is exactly the behaviour it should have.
 *
 * Green years are excluded. A year that is 20% reported carries no useful
 * signal about its own loss ratio, and including it just imports the a priori
 * back into the answer it was supposed to test.
 */
export function indication(config, years) {
  const p = config.program;
  const next = Math.max(...years.map(y => y.year)) + 1;
  const used = years.filter(y => y.reportedShare >= p.maturityThreshold);
  const excluded = years.filter(y => y.reportedShare < p.maturityThreshold).map(y => y.year);

  if (!used.length) {
    return { next, used: [], excluded, trendedLossRatio: null, change: null, insufficient: true };
  }

  let trendedLoss = 0;
  let onLevelPremium = 0;
  for (const y of used) {
    trendedLoss += y.ultimate * (1 + p.trend) ** (next - y.year);
    onLevelPremium += y.earnedPremium * (1 + p.rateLevelTrend) ** (next - y.year);
  }

  const trendedLossRatio = onLevelPremium > 0 ? trendedLoss / onLevelPremium : null;
  return {
    next,
    used: used.map(y => y.year),
    excluded,
    trendedLoss,
    onLevelPremium,
    trendedLossRatio,
    change: trendedLossRatio !== null ? trendedLossRatio / p.aprioriLossRatio - 1 : null,
    insufficient: false,
  };
}

/* ---------------------------------------------------------- diagnostics -- */

const usd = n => `$${Math.round(n).toLocaleString('en-US')}`;
const list = arr => (arr.length > 1
  ? `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`
  : String(arr[0]));

/**
 * Diagnostics are grouped by kind rather than emitted per year. Seven separate
 * "this year is underfunded" cards say less than one card naming seven years
 * and the total, and a wall of findings trains people to skim past them.
 */
function diagnose(config, { years, selected, cdf, totals, rateIndication }) {
  const p = config.program;
  const out = [];
  const add = (severity, title, detail) => out.push({ severity, title, detail });

  if (rateIndication.insufficient) {
    add('high', 'No year is mature enough to rate on',
      `Nothing in this triangle is ${(p.maturityThreshold * 100).toFixed(0)}% reported. ` +
      'The renewal indication has to come from exposure rating or from a benchmark ' +
      'loss ratio — this experience cannot produce one.');
  } else if (rateIndication.used.length < 3) {
    add('high',
      `Renewal indication rests on ${rateIndication.used.length} accident year` +
      `${rateIndication.used.length === 1 ? '' : 's'}`,
      `Only ${rateIndication.used.join(', ')} clears the ` +
      `${(p.maturityThreshold * 100).toFixed(0)}% maturity threshold. An indication ` +
      'built on this few years carries almost no credibility on its own and should ' +
      'be blended with exposure rating or an industry benchmark before it is quoted.');
  }

  if (config.years.length < 5) {
    add('high', 'Thin experience base',
      `${config.years.length} accident years support every factor selection here. ` +
      'Selections drawn from this few observations carry very wide error bars and ' +
      'should not be presented as a point estimate.');
  }

  const green = years.filter(y => y.ageIndex >= 0 && y.ageIndex + 1 < 3);
  if (green.length) {
    const detail = green.map(y =>
      `${y.year}: ${y.ageIndex + 1} development point${y.ageIndex ? 's' : ''} at CDF ` +
      `${y.cdf.toFixed(2)}, ${((1 - y.reportedShare) * 100).toFixed(0)}% of ultimate ` +
      'coming from the factor rather than from reported experience').join('; ');
    add('high', `${list(green.map(y => y.year))} too green for chain ladder`,
      `${detail}. On years this thin the chain ladder is a factor applied to noise ` +
      '— the a priori should be carrying the weight, which is what the Benktander ' +
      'selection does automatically.');
  }

  const negative = years.filter(y => y.ibnr < 0);
  if (negative.length) {
    add('high', `Negative IBNR on ${list(negative.map(y => y.year))}`,
      `${negative.map(y => `${y.year}: selected ultimate ${usd(y.ultimate)} against ` +
        `reported incurred ${usd(y.incurred)}`).join('; ')}. Either case reserves are ` +
      'redundant or the selected factors are too low for these years. Both are ' +
      'positions someone has to take deliberately.');
  }

  const pierced = years.filter(y => y.erosionUltimate !== null && y.erosionUltimate >= 1);
  if (pierced.length) {
    add('high', `Aggregate projected to be pierced on ${list(pierced.map(y => y.year))}`,
      `${pierced.map(y => `${y.year} at ${(y.erosionUltimate * 100).toFixed(0)}% of ` +
        `a ${usd(y.limit)} limit`).join('; ')}. Excess attaches on these projections, ` +
      'and the excess carrier or reinsurer should already know.');
  }

  const near = years.filter(y =>
    y.erosionUltimate !== null && y.erosionUltimate >= 0.85 && y.erosionUltimate < 1);
  if (near.length) {
    add('medium', `${list(near.map(y => y.year))} close to the aggregate`,
      `${near.map(y => `${y.year} at ${(y.erosionUltimate * 100).toFixed(0)}%, ` +
        `${usd(y.headroom)} of headroom`).join('; ')}. Headroom in dollars is the ` +
      'number to watch — the percentage moves slowly right up until it does not.');
  }

  const short = years.filter(y => y.surplus < 0);
  if (short.length) {
    add(totals.surplus < 0 ? 'high' : 'medium',
      `${short.length} of ${years.length} years funded below ultimate`,
      `${short.map(y => `${y.year} short ${usd(-y.surplus)}`).join('; ')}. ` +
      `Across the program, funding ${totals.surplus < 0 ? 'trails' : 'still exceeds'} ` +
      `selected ultimate by ${usd(Math.abs(totals.surplus))}. This is the figure the ` +
      'funding and renewal conversations actually turn on.');
  }

  const tailShare = (p.tailFactor - 1) / p.tailFactor;
  if (tailShare > 0.015) {
    add(tailShare > 0.08 ? 'high' : 'medium', 'The tail factor is doing real work',
      `A tail of ${p.tailFactor.toFixed(3)} contributes ` +
      `${(tailShare * 100).toFixed(1)}% of ultimate on every year in the triangle. ` +
      'Nothing beyond the end of the triangle supports it — it is an assumption, ' +
      'and at this size it deserves its own slide rather than a footnote.');
  }

  const thin = selected.filter(s => s.count <= 1 && !s.overridden);
  if (thin.length) {
    add('medium',
      `${thin.length} factor${thin.length === 1 ? '' : 's'} selected from a single observation`,
      `${thin.map(s => `${s.fromAge}–${s.toAge} months (${s.selected.toFixed(3)})`).join('; ')}. ` +
      'At the old end of a triangle there is only ever one year to average, so the ' +
      '"average" is one accident year. Benchmark or judgement usually beats it.');
  }

  const outliers = [];
  const downward = [];
  for (const s of selected) {
    for (const r of s.ratios) {
      if (Math.abs(r.value - s.selected) / (s.selected || 1) > 0.4) {
        outliers.push(`${r.year} at ${s.fromAge}–${s.toAge} months ` +
          `(${r.value.toFixed(3)} against ${s.selected.toFixed(3)})`);
      }
    }
    if (s.selected < 0.97) downward.push(`${s.fromAge}–${s.toAge} at ${s.selected.toFixed(3)}`);
  }
  if (outliers.length) {
    add('note', `${outliers.length} age-to-age factor${outliers.length === 1 ? '' : 's'} off-pattern`,
      `${outliers.slice(0, 6).join('; ')}${outliers.length > 6 ? '; and others' : ''}. ` +
      'One large claim in one cell is the usual explanation. Worth knowing which ' +
      'cell before the selection is defended to anyone.');
  }
  if (downward.length) {
    add('note', 'Downward development selected',
      `${downward.join('; ')}. A factor below 1.00 says case reserves have run ` +
      'redundant at that age. Reasonable, but it should be a stated position ' +
      'rather than a mechanical average.');
  }

  const rank = { high: 0, medium: 1, note: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/* ------------------------------------------------------------ triangle IO -- */

/**
 * Build a config from long-format rows: one row per accident year and
 * development age. Unknown ages are added to the age vector in order.
 */
export function fromLongRows(rows, template) {
  const ages = [...new Set(rows.map(r => Number(r.dev_months)))]
    .filter(Number.isFinite).sort((a, b) => a - b);
  const yearNums = [...new Set(rows.map(r => Number(r.accident_year)))]
    .filter(Number.isFinite).sort((a, b) => a - b);

  const years = yearNums.map(year => {
    const src = template.years.find(y => y.year === year);
    const blank = () => new Array(ages.length).fill(null);
    const paid = blank();
    const incurred = blank();
    for (const r of rows.filter(r => Number(r.accident_year) === year)) {
      const i = ages.indexOf(Number(r.dev_months));
      if (i < 0) continue;
      const pv = Number(String(r.paid ?? '').replace(/[$,]/g, ''));
      const iv = Number(String(r.incurred ?? '').replace(/[$,]/g, ''));
      if (Number.isFinite(pv)) paid[i] = pv;
      if (Number.isFinite(iv)) incurred[i] = iv;
    }
    const first = rows.find(r => Number(r.accident_year) === year) || {};
    const numberOr = (raw, fallback) => {
      const n = Number(String(raw ?? '').replace(/[$,]/g, ''));
      return Number.isFinite(n) && n > 0 ? n : fallback;
    };
    return {
      year,
      earnedPremium: numberOr(first.earned_premium, src ? src.earnedPremium : 0),
      aggregateLimit: numberOr(first.aggregate_limit, src ? src.aggregateLimit : 0),
      funded: numberOr(first.funded, src ? src.funded : 0),
      paid,
      incurred,
    };
  });

  return {
    id: 'imported',
    label: 'Imported triangle',
    note: 'Loaded from a CSV in this browser. Nothing was uploaded.',
    program: { ...template.program, ages, ldfOverrides: {} },
    years,
  };
}
