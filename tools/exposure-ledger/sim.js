// sim.js — the engine.
//
// A contract book is not a list of caps you can add up. Two things break the
// addition, and both of them are modelled here:
//
//   1. Nobody loses their cap on every contract in the same year. Summing caps
//      answers a question no board has ever been asked.
//   2. Limits are shared. A claim on one contract erodes the aggregate that was
//      also standing behind two hundred others. Adding contracts up one at a
//      time hides the only interaction that matters.
//
// So: seeded Monte Carlo over the whole book at once, with the towers eroding
// inside each trial. Same inputs give the same number every time, which is the
// difference between a model and a rumour.

import { PERILS, perilParams } from './assume.js';

/* --------------------------------------------------------------- random --- */

/** mulberry32 — small, fast, and seeded, so a board number is reproducible. */
export function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNormal(next) {
  let spare = null;
  return function normal() {
    if (spare !== null) { const v = spare; spare = null; return v; }
    let u = 0, v = 0, s = 0;
    do {
      u = next() * 2 - 1;
      v = next() * 2 - 1;
      s = u * u + v * v;
    } while (s === 0 || s >= 1);
    const f = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * f;
    return u * f;
  };
}

/** Knuth for small means, which is all a per-contract claim count ever is. */
function poisson(next, lambda) {
  if (lambda <= 0) return 0;
  if (lambda < 30) {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do { k++; p *= next(); } while (p > L);
    return k - 1;
  }
  // Normal approximation, only reachable if somebody loads frequency hard.
  const g = Math.sqrt(lambda) * makeNormal(next)() + lambda;
  return Math.max(0, Math.round(g));
}

/* -------------------------------------------------------------- prepare --- */

/**
 * Flatten contracts and the programme into typed arrays. Everything the hot
 * loop needs is resolved once, here, so the loop itself does no lookups.
 */
export function prepare(contracts, program, ledger, settings) {
  // Lines, in a stable order, each with its layers sorted from the ground up.
  const lineCodes = Object.keys(program.byLine).sort();
  const lineIndex = new Map(lineCodes.map((c, i) => [c, i]));

  const aggGroupIds = [];
  const aggGroupIndex = new Map();
  const aggCapacity = [];
  const aggEroded = [];

  const lines = lineCodes.map((code) => {
    const layers = (program.byLine[code] || []).map((l) => {
      // A layer written with a retention and no attachment attaches at the retention.
      const attach = l.attachment > 0 ? l.attachment : l.retention;
      if (!aggGroupIndex.has(l.aggGroup)) {
        aggGroupIndex.set(l.aggGroup, aggGroupIds.length);
        aggGroupIds.push(l.aggGroup);
        aggCapacity.push(0);
        aggEroded.push(0);
      }
      const gi = aggGroupIndex.get(l.aggGroup);
      // Layers sharing an aggregate share one pool; capacity is the largest
      // aggregate written against the group, not the sum of the layers.
      aggCapacity[gi] = Math.max(aggCapacity[gi], l.aggregate);
      aggEroded[gi] = Math.max(aggEroded[gi], l.eroded);
      return {
        attach,
        limit: l.limit,
        top: attach + l.limit,
        aggIdx: gi,
        captive: l.captive,
        name: l.name,
        premium: l.premium,
        code,
      };
    }).sort((a, b) => a.attach - b.attach);
    return { code, layers, sir: layers.length ? layers[0].attach : Infinity };
  });

  // Exposure units: one per contract per peril that can actually produce a claim.
  const uLambda = [];
  const uMu = [];
  const uSigma = [];
  const uCeiling = [];
  const uLine = [];
  const uContract = [];
  const uPeril = [];
  const meta = [];

  ledger.forEach((u) => {
    const c = contracts[u.contractIndex];
    const p = perilParams(c.category, u.peril, c.annualValue, settings);
    if (!(p.lambda > 0)) return;
    uLambda.push(p.lambda);
    uMu.push(p.mu);
    uSigma.push(p.sigma);
    uCeiling.push(isFinite(u.ceiling) ? u.ceiling : settings.uncappedTruncation);
    uLine.push(lineIndex.has(u.lineCode) ? lineIndex.get(u.lineCode) : -1);
    uContract.push(u.contractIndex);
    uPeril.push(PERILS.indexOf(u.peril));
    meta.push({ ...u, lambda: p.lambda, median: p.median, effectiveCeiling: isFinite(u.ceiling) ? u.ceiling : settings.uncappedTruncation });
  });

  return {
    lines,
    lineCodes,
    aggGroupIds,
    aggCapacity: Float64Array.from(aggCapacity),
    aggEroded: Float64Array.from(aggEroded),
    contractCount: contracts.length,
    units: {
      lambda: Float64Array.from(uLambda),
      mu: Float64Array.from(uMu),
      sigma: Float64Array.from(uSigma),
      ceiling: Float64Array.from(uCeiling),
      line: Int32Array.from(uLine),
      contract: Int32Array.from(uContract),
      peril: Int8Array.from(uPeril),
      n: uLambda.length,
    },
    meta,
  };
}

/**
 * Re-price a prepared model under a lever without re-reading the CSVs:
 * `ceilingOverrides` is a Map from `contractIndex|PERIL` to a new dollar ceiling.
 */
export function withCeilings(prepared, overrides) {
  if (!overrides || !overrides.size) return prepared;
  const ceiling = Float64Array.from(prepared.units.ceiling);
  const { contract, peril } = prepared.units;
  for (let i = 0; i < ceiling.length; i++) {
    const key = `${contract[i]}|${PERILS[peril[i]]}`;
    if (overrides.has(key)) ceiling[i] = overrides.get(key);
  }
  return { ...prepared, units: { ...prepared.units, ceiling } };
}

/** Re-price a prepared model with extra layers bolted onto the programme. */
export function withLayers(prepared, extras) {
  if (!extras || !extras.length) return prepared;
  const lines = prepared.lines.map((l) => ({ ...l, layers: l.layers.slice() }));
  const codeToIdx = new Map(lines.map((l, i) => [l.code, i]));
  const aggCapacity = Array.from(prepared.aggCapacity);
  const aggEroded = Array.from(prepared.aggEroded);
  const aggGroupIds = prepared.aggGroupIds.slice();

  extras.forEach((x, k) => {
    const code = String(x.lineCode || '').toUpperCase();
    if (!codeToIdx.has(code)) {
      codeToIdx.set(code, lines.length);
      lines.push({ code, layers: [], sir: x.attachment });
    }
    const li = codeToIdx.get(code);
    const groupId = (x.aggGroup || `CANDIDATE-${k}`).toUpperCase();
    let gi = aggGroupIds.indexOf(groupId);
    if (gi === -1) { gi = aggGroupIds.length; aggGroupIds.push(groupId); aggCapacity.push(0); aggEroded.push(0); }
    aggCapacity[gi] = Math.max(aggCapacity[gi], x.aggregate || x.limit);
    lines[li].layers.push({
      attach: x.attachment,
      limit: x.limit,
      top: x.attachment + x.limit,
      aggIdx: gi,
      captive: !!x.captive,
      name: x.name || 'candidate layer',
      premium: x.premium || 0,
      code,
    });
    lines[li].layers.sort((a, b) => a.attach - b.attach);
    lines[li].sir = lines[li].layers[0].attach;
  });

  // Units pointing at a line that did not previously exist need re-linking.
  const line = Int32Array.from(prepared.units.line);
  prepared.meta.forEach((m, i) => {
    if (line[i] === -1 && codeToIdx.has(m.lineCode)) line[i] = codeToIdx.get(m.lineCode);
  });

  return {
    ...prepared,
    lines,
    lineCodes: lines.map((l) => l.code),
    aggGroupIds,
    aggCapacity: Float64Array.from(aggCapacity),
    aggEroded: Float64Array.from(aggEroded),
    units: { ...prepared.units, line },
  };
}

/* ------------------------------------------------------------- simulate --- */

/**
 * One pass over `trials` years of the whole book.
 *
 * `attributionThreshold` runs the second pass: identical seed, identical draws,
 * but this time it records which contracts were in the room during the worst
 * years. That is tail contribution, and it is the only defensible way to rank a
 * renegotiation list.
 */
export function simulate(prepared, settings, opts = {}) {
  const { units, lines, aggCapacity, aggEroded } = prepared;
  const n = units.n;
  const trials = Math.max(1, settings.trials | 0);
  const truncation = settings.uncappedTruncation;
  const attribute = !!opts.attribute;
  const attributionQuantile = opts.attributionQuantile ?? 0.99;

  const next = rng(settings.seed >>> 0);
  const normal = makeNormal(next);

  const groupCount = aggCapacity.length;
  const aggRemainingStart = new Float64Array(groupCount);
  for (let g = 0; g < groupCount; g++) aggRemainingStart[g] = Math.max(0, aggCapacity[g] - aggEroded[g]);
  const aggRemaining = new Float64Array(groupCount);
  const aggExhaustedCount = new Float64Array(groupCount);
  const aggUsedTotal = new Float64Array(groupCount);

  const totalRetained = new Float64Array(trials);
  const totalGross = new Float64Array(trials);
  const totalTransferred = new Float64Array(trials);

  const grossByContractMean = new Float64Array(prepared.contractCount);
  const retainedByContractMean = new Float64Array(prepared.contractCount);
  const retainedByPeril = new Float64Array(PERILS.length);
  const grossByPeril = new Float64Array(PERILS.length);
  const claimsByPeril = new Float64Array(PERILS.length);

  let sumGross = 0;
  let sumTransferred = 0;
  let sumCaptive = 0;
  let sumSir = 0;
  let sumAbove = 0;
  let sumUninsured = 0;
  let tailTrials = 0;
  let maxSingleClaim = 0;
  let claimCount = 0;

  for (let t = 0; t < trials; t++) {
    aggRemaining.set(aggRemainingStart);
    let gross = 0;
    let transferred = 0;
    let captive = 0;
    let sir = 0;
    let above = 0;
    let uninsured = 0;

    for (let i = 0; i < n; i++) {
      const lam = units.lambda[i];
      if (lam <= 0) continue;
      const k = poisson(next, lam);
      if (k === 0) continue;
      const mu = units.mu[i];
      const sigma = units.sigma[i];
      const ceiling = units.ceiling[i];
      const li = units.line[i];
      const ci = units.contract[i];
      const pi = units.peril[i];

      for (let c = 0; c < k; c++) {
        let loss = Math.exp(mu + sigma * normal());
        if (loss > ceiling) loss = ceiling;
        if (loss > truncation) loss = truncation;
        if (!(loss > 0)) continue;

        gross += loss;
        claimCount++;
        grossByPeril[pi] += loss;
        claimsByPeril[pi] += 1;
        if (loss > maxSingleClaim) maxSingleClaim = loss;
        grossByContractMean[ci] += loss;

        if (li < 0) {
          // No form responds. The whole loss is the corporation's.
          uninsured += loss;
          retainedByPeril[pi] += loss;
          retainedByContractMean[ci] += loss;
          continue;
        }

        const layers = lines[li].layers;
        let recovered = 0;
        for (let z = 0; z < layers.length; z++) {
          const L = layers[z];
          if (loss <= L.attach) break;
          let cover = loss - L.attach;
          if (cover > L.limit) cover = L.limit;
          const gi = L.aggIdx;
          const avail = aggRemaining[gi];
          if (avail <= 0) continue;
          const actual = cover < avail ? cover : avail;
          aggRemaining[gi] -= actual;
          aggUsedTotal[gi] += actual;
          recovered += actual;
          if (L.captive) captive += actual; else transferred += actual;
        }

        const retained = loss - recovered;
        // Everything under the first attachment is the retention proper.
        const sirPart = Math.min(retained, lines[li].sir === Infinity ? retained : Math.min(loss, lines[li].sir));
        sir += sirPart;
        above += retained - sirPart;
        retainedByPeril[pi] += retained;
        retainedByContractMean[ci] += retained;
      }
    }

    const groupRetained = gross - transferred;
    totalGross[t] = gross;
    totalRetained[t] = groupRetained;
    totalTransferred[t] = transferred;
    sumGross += gross;
    sumTransferred += transferred;
    sumCaptive += captive;
    sumSir += sir;
    sumAbove += above;
    sumUninsured += uninsured;
    for (let g = 0; g < groupCount; g++) if (aggRemaining[g] <= 0.5) aggExhaustedCount[g] += 1;
  }

  const sorted = Float64Array.from(totalRetained).sort();
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
  const tvar = (p) => {
    const from = Math.floor(p * sorted.length);
    let s2 = 0;
    let c2 = 0;
    for (let i = from; i < sorted.length; i++) { s2 += sorted[i]; c2++; }
    return c2 ? s2 / c2 : 0;
  };
  const attributionThreshold = attribute ? pct(attributionQuantile) : null;

  // Second pass: same seed, same draws, but only bank the worst years.
  let tailByContract = null;
  if (attribute) {
    tailByContract = new Float64Array(prepared.contractCount);
    const next2 = rng(settings.seed >>> 0);
    const normal2 = makeNormal(next2);
    const trialContract = new Float64Array(prepared.contractCount);
    for (let t = 0; t < trials; t++) {
      aggRemaining.set(aggRemainingStart);
      trialContract.fill(0);
      let transferredT = 0;
      let grossT = 0;
      for (let i = 0; i < n; i++) {
        const lam = units.lambda[i];
        if (lam <= 0) continue;
        const k = poisson(next2, lam);
        if (k === 0) continue;
        const mu = units.mu[i];
        const sigma = units.sigma[i];
        const ceiling = units.ceiling[i];
        const li = units.line[i];
        const ci = units.contract[i];
        for (let c = 0; c < k; c++) {
          let loss = Math.exp(mu + sigma * normal2());
          if (loss > ceiling) loss = ceiling;
          if (loss > truncation) loss = truncation;
          if (!(loss > 0)) continue;
          grossT += loss;
          if (li < 0) { trialContract[ci] += loss; continue; }
          const layers = lines[li].layers;
          let recovered = 0;
          let ceded = 0;
          for (let z = 0; z < layers.length; z++) {
            const L = layers[z];
            if (loss <= L.attach) break;
            let cover = loss - L.attach;
            if (cover > L.limit) cover = L.limit;
            const avail = aggRemaining[L.aggIdx];
            if (avail <= 0) continue;
            const actual = cover < avail ? cover : avail;
            aggRemaining[L.aggIdx] -= actual;
            recovered += actual;
            if (!L.captive) ceded += actual;
          }
          transferredT += ceded;
          trialContract[ci] += loss - ceded;
        }
      }
      if (grossT - transferredT >= attributionThreshold) {
        tailTrials++;
        for (let ci = 0; ci < trialContract.length; ci++) tailByContract[ci] += trialContract[ci];
      }
    }
    if (tailTrials > 0) for (let ci = 0; ci < tailByContract.length; ci++) tailByContract[ci] /= tailTrials;
  }

  for (let ci = 0; ci < grossByContractMean.length; ci++) {
    grossByContractMean[ci] /= trials;
    retainedByContractMean[ci] /= trials;
  }

  return {
    trials,
    seed: settings.seed,
    gross: { mean: sumGross / trials },
    transferred: { mean: sumTransferred / trials },
    retained: {
      mean: (sumGross - sumTransferred) / trials,
      p50: pct(0.50),
      p75: pct(0.75),
      p90: pct(0.90),
      p95: pct(0.95),
      p99: pct(0.99),
      p995: pct(0.995),
      tvar95: tvar(0.95),
      tvar99: tvar(0.99),
      max: sorted[sorted.length - 1],
    },
    split: {
      retention: sumSir / trials,
      captive: sumCaptive / trials,
      aboveProgram: sumAbove / trials,
      uninsuredByForm: sumUninsured / trials,
      transferred: sumTransferred / trials,
    },
    byPeril: PERILS.map((p, i) => ({
      peril: p,
      gross: grossByPeril[i] / trials,
      retained: retainedByPeril[i] / trials,
      claims: claimsByPeril[i] / trials,
    })),
    aggregates: prepared.aggGroupIds.map((id, g) => ({
      group: id,
      capacity: aggCapacity[g],
      eroded: aggEroded[g],
      available: Math.max(0, aggCapacity[g] - aggEroded[g]),
      meanUsed: aggUsedTotal[g] / trials,
      exhaustionProb: aggExhaustedCount[g] / trials,
    })),
    perContract: { gross: grossByContractMean, retained: retainedByContractMean, tail: tailByContract },
    tailTrials,
    attributionThreshold,
    distribution: sorted,
    claimsPerYear: claimCount / trials,
    maxSingleClaim,
  };
}

/** Two passes: one to size the tail, one to attribute it. */
export function simulateWithAttribution(prepared, settings) {
  return simulate(prepared, settings, { attribute: true, attributionQuantile: 0.99 });
}
