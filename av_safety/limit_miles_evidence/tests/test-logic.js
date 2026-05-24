/**
 * Tests for shared.js, widget1, and widget2 logic.
 *
 * Run: node article/tests/test-logic.js
 *
 * Uses no external test framework — plain assertions with clear output.
 */

// ── Load shared.js functions into this scope ──────────────────────────
// We eval shared.js but need to stub out the DOM-dependent parts and D3.

// Stub globals that shared.js references
global.document = { getElementById: function () { return null; } };
global.d3 = {
  select: function () { return { append: function () { return this; }, attr: function () { return this; }, style: function () { return this; } }; },
  line: function () { var l = function () { return ''; }; l.x = function () { return l; }; l.y = function () { return l; }; return l; },
};

var fs = require('fs');
var vm = require('vm');
global.jStat = require('jstat');
vm.runInThisContext(fs.readFileSync(__dirname + '/../js/shared.js', 'utf8'));
vm.runInThisContext(fs.readFileSync(__dirname + '/../js/widget2-nonstationarity.js', 'utf8'));

// ── Test harness ──────────────────────────────────────────────────────

var passed = 0;
var failed = 0;
var failures = [];

function assert(condition, name) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(name);
    console.log('  FAIL: ' + name);
  }
}

function assertClose(actual, expected, tolerance, name) {
  var ok = Math.abs(actual - expected) < tolerance;
  if (ok) {
    passed++;
  } else {
    failed++;
    failures.push(name + ' (got ' + actual + ', expected ' + expected + ' ±' + tolerance + ')');
    console.log('  FAIL: ' + name + ' (got ' + actual + ', expected ' + expected + ')');
  }
}

// ══════════════════════════════════════════════════════════════════════
// shared.js — bayesUpdate
// ══════════════════════════════════════════════════════════════════════

console.log('\n=== bayesUpdate ===');

// Basic: equal likelihoods → posterior = prior
assertClose(bayesUpdate(0.5, 0.5, 0.5), 0.5, 1e-10, 'equal likelihoods → no change');
assertClose(bayesUpdate(0.3, 0.5, 0.5), 0.3, 1e-10, 'equal likelihoods, prior 0.3 → no change');

// Strong evidence for H
assertClose(bayesUpdate(0.5, 0.9, 0.1), 0.9, 1e-10, 'strong evidence for H from 0.5');

// Strong evidence against H
assertClose(bayesUpdate(0.5, 0.1, 0.9), 0.1, 1e-10, 'strong evidence against H from 0.5');

// Prior = 0 stays 0
assertClose(bayesUpdate(0.0, 0.9, 0.1), 0.0, 1e-10, 'prior 0 stays 0');

// Prior = 1 stays 1
assertClose(bayesUpdate(1.0, 0.1, 0.9), 1.0, 1e-10, 'prior 1 stays 1');

// Denominator 0 → return prior
assertClose(bayesUpdate(0.5, 0, 0), 0.5, 1e-10, 'zero likelihoods → return prior');

// Specific calculation: prior=0.7, L(H)=0.3, L(¬H)=0.8
// P(H|E) = 0.3*0.7 / (0.3*0.7 + 0.8*0.3) = 0.21 / (0.21 + 0.24) = 0.21/0.45
assertClose(bayesUpdate(0.7, 0.3, 0.8), 0.21 / 0.45, 1e-10, 'specific calculation');

// Widget 6 scenario: recurrence after fix
// prior=0.85, likelihoodIfFixed=0.08, likelihoodIfNotFixed=0.65
var post = bayesUpdate(0.85, 0.08, 0.65);
assert(post < 0.85, 'recurrence lowers posterior');
assert(post < 0.5, 'recurrence after fix drops well below 0.5');
assertClose(post, (0.08 * 0.85) / (0.08 * 0.85 + 0.65 * 0.15), 1e-10, 'widget6 first recurrence value');

// ══════════════════════════════════════════════════════════════════════
// shared.js — runUpdateSequence
// ══════════════════════════════════════════════════════════════════════

console.log('\n=== runUpdateSequence ===');

var trace = runUpdateSequence(0.5, []);
assert(trace.length === 1, 'empty evidence → trace length 1');
assertClose(trace[0], 0.5, 1e-10, 'empty evidence → prior unchanged');

var trace2 = runUpdateSequence(0.5, [
  { likelihoodIfTrue: 0.9, likelihoodIfFalse: 0.1 },
  { likelihoodIfTrue: 0.9, likelihoodIfFalse: 0.1 },
]);
assert(trace2.length === 3, 'two evidence → trace length 3');
assertClose(trace2[0], 0.5, 1e-10, 'trace starts with prior');
assert(trace2[1] > trace2[0], 'first update increases posterior');
assert(trace2[2] > trace2[1], 'second update increases posterior further');
assertClose(trace2[1], 0.9, 1e-10, 'first update value');

// Repeated strong evidence against H drives posterior toward 0
var traceDown = runUpdateSequence(0.85, [
  { likelihoodIfTrue: 0.08, likelihoodIfFalse: 0.65 },
  { likelihoodIfTrue: 0.08, likelihoodIfFalse: 0.65 },
  { likelihoodIfTrue: 0.08, likelihoodIfFalse: 0.65 },
]);
assert(traceDown[3] < 0.05, 'repeated negative evidence drives posterior near 0');
for (var i = 1; i < traceDown.length; i++) {
  assert(traceDown[i] < traceDown[i - 1], 'trace monotonically decreasing at step ' + i);
}

// ══════════════════════════════════════════════════════════════════════
// shared.js — PRIOR_PRESETS
// ══════════════════════════════════════════════════════════════════════

console.log('\n=== PRIOR_PRESETS ===');

['widget1', 'widget2', 'widget3', 'widget4', 'widget5', 'widget6'].forEach(function (key) {
  assert(PRIOR_PRESETS[key] !== undefined, key + ' preset exists');
  assert(typeof PRIOR_PRESETS[key].optimistic === 'number', key + '.optimistic is number');
  assert(typeof PRIOR_PRESETS[key].skeptical === 'number', key + '.skeptical is number');
  assert(PRIOR_PRESETS[key].optimistic > PRIOR_PRESETS[key].skeptical, key + ': optimistic > skeptical');
  assert(PRIOR_PRESETS[key].optimistic > 0 && PRIOR_PRESETS[key].optimistic < 1, key + '.optimistic in (0,1)');
  assert(PRIOR_PRESETS[key].skeptical > 0 && PRIOR_PRESETS[key].skeptical < 1, key + '.skeptical in (0,1)');
});

// ══════════════════════════════════════════════════════════════════════
// Widget 1 — Gamma-Poisson conjugate update logic
// ══════════════════════════════════════════════════════════════════════

console.log('\n=== Widget 1: Gamma-Poisson update ===');

var HUMAN_RATE = 1.06e-8; // NHTSA Jan-Sep 2025: 1.06 fatalities per 100M VMT

// Optimistic prior: Gamma(2, 2 / (HUMAN_RATE * 0.5))
var optAlpha = 2.0;
var optBeta = 2.0 / (HUMAN_RATE * 0.5);

// Prior mean should be 0.5 * human rate
assertClose(optAlpha / optBeta, HUMAN_RATE * 0.5, 1e-15, 'optimistic prior mean = 0.5 * human rate');

// Skeptical prior: Gamma(1.5, 1.5 / (HUMAN_RATE * 0.9))
var skepAlpha = 1.5;
var skepBeta = 1.5 / (HUMAN_RATE * 0.9);

assertClose(skepAlpha / skepBeta, HUMAN_RATE * 0.9, 1e-15, 'skeptical prior mean = 0.9 * human rate');

// After 0 miles: posterior = prior
var postBeta0 = optBeta + 0;
assertClose(optAlpha / postBeta0, HUMAN_RATE * 0.5, 1e-15, 'zero miles → posterior = prior');

// After observing 0 fatalities in N miles: posterior is Gamma(alpha, beta + N)
// Mean decreases as N increases
var postBeta1B = optBeta + 1e9;
var postMean1B = optAlpha / postBeta1B;
assert(postMean1B < optAlpha / optBeta, 'posterior mean decreases after 1B miles');

var postBeta5B = optBeta + 5e9;
var postMean5B = optAlpha / postBeta5B;
assert(postMean5B < postMean1B, 'posterior mean decreases further after 5B miles');

// P(rate < human) increases with miles
var pBelowHuman0 = gammaCDF(HUMAN_RATE, optAlpha, optBeta);
var pBelowHuman1B = gammaCDF(HUMAN_RATE, optAlpha, postBeta1B);
var pBelowHuman5B = gammaCDF(HUMAN_RATE, optAlpha, postBeta5B);
assert(pBelowHuman1B > pBelowHuman0, 'P(rate < human) increases after 1B miles');
assert(pBelowHuman5B > pBelowHuman1B, 'P(rate < human) increases after 5B miles');

// Credible interval narrows with more miles
var ci95Low0 = gammaQuantile(0.025, optAlpha, optBeta);
var ci95High0 = gammaQuantile(0.975, optAlpha, optBeta);
var ci95Low1B = gammaQuantile(0.025, optAlpha, postBeta1B);
var ci95High1B = gammaQuantile(0.975, optAlpha, postBeta1B);
var width0 = ci95High0 - ci95Low0;
var width1B = ci95High1B - ci95Low1B;
assert(width1B < width0, 'credible interval narrows after 1B miles');

// Even after 10B miles, the upper CI bound is still in a meaningful range
var postBeta10B = optBeta + 10e9;
var ci95High10B = gammaQuantile(0.975, optAlpha, postBeta10B);
assert(ci95High10B > 0, 'upper CI bound still positive after 10B miles');

// Skeptical prior starts with lower P(rate < human)
var pBelowHumanSkep0 = gammaCDF(HUMAN_RATE, skepAlpha, skepBeta);
assert(pBelowHumanSkep0 < pBelowHuman0, 'skeptical prior: lower initial P(rate < human)');

// But both converge with enough data
var pBelowHumanSkep50B = gammaCDF(HUMAN_RATE, skepAlpha, skepBeta + 50e9);
var pBelowHumanOpt50B = gammaCDF(HUMAN_RATE, optAlpha, optBeta + 50e9);
assertClose(pBelowHumanSkep50B, pBelowHumanOpt50B, 0.05, 'priors converge after 50B miles');

// ══════════════════════════════════════════════════════════════════════
// shared.js — mulberry32 PRNG
// ══════════════════════════════════════════════════════════════════════

console.log('\n=== mulberry32 PRNG ===');

// Determinism: same seed → same sequence
var rng1 = mulberry32(12345);
var rng2 = mulberry32(12345);
var deterministicOk = true;
for (var di = 0; di < 100; di++) {
  if (rng1() !== rng2()) { deterministicOk = false; break; }
}
assert(deterministicOk, 'mulberry32 is deterministic with same seed');

// Different seeds → different sequences
var rng3 = mulberry32(54321);
var rng4 = mulberry32(12345);
var differentOk = false;
for (var di2 = 0; di2 < 10; di2++) {
  if (rng4() !== rng3()) { differentOk = true; break; }
}
assert(differentOk, 'different seeds produce different sequences');

// Output in [0, 1)
var rngRange = mulberry32(42);
var inRange = true;
for (var ri = 0; ri < 10000; ri++) {
  var rv = rngRange();
  if (rv < 0 || rv >= 1) { inRange = false; break; }
}
assert(inRange, 'mulberry32 output in [0, 1)');

// ══════════════════════════════════════════════════════════════════════
// shared.js — computeDensity
// ══════════════════════════════════════════════════════════════════════

console.log('\n=== computeDensity ===');

var testDensity = computeDensity(3, 2, 0, 5, 100);
assert(testDensity.length === 101, 'computeDensity returns nPts+1 points');
assertClose(testDensity[0].x, 0, 1e-10, 'density starts at xMin');
assertClose(testDensity[100].x, 5, 1e-10, 'density ends at xMax');

// Values match direct gammaPDF calls
var midPt = testDensity[50];
assertClose(midPt.y, gammaPDF(midPt.x, 3, 2), 1e-10, 'density values match gammaPDF');

// Density at x=0 is 0 for alpha > 1
assertClose(testDensity[0].y, 0, 1e-10, 'density at x=0 is 0 for alpha=3');

// Peak is near the mode: mode = (alpha-1)/beta = 1.0
var peakIdx = 0;
var peakVal = 0;
for (var pi = 0; pi < testDensity.length; pi++) {
  if (testDensity[pi].y > peakVal) {
    peakVal = testDensity[pi].y;
    peakIdx = pi;
  }
}
assertClose(testDensity[peakIdx].x, (3 - 1) / 2, 0.1, 'density peak near mode (alpha-1)/beta');

// ══════════════════════════════════════════════════════════════════════
// shared.js — checkCIOverlap
// ══════════════════════════════════════════════════════════════════════

console.log('\n=== checkCIOverlap ===');

// All intervals are overlapping
var ov1 = checkCIOverlap([{ lo: 0.1, hi: 0.5 }, { lo: 0.2, hi: 0.6 }]);
assert(ov1.nonOverlapping === 0, 'overlapping intervals: 0 non-overlapping');
assert(ov1.totalPairs === 1, 'two intervals: 1 pair');

// All intervals are separated
var ov2 = checkCIOverlap([{ lo: 0.1, hi: 0.3 }, { lo: 0.5, hi: 0.7 }]);
assert(ov2.nonOverlapping === 1, 'separated intervals: 1 non-overlapping');

// Touching at boundary (hi == lo) — considered overlapping
var ov2b = checkCIOverlap([{ lo: 0.1, hi: 0.5 }, { lo: 0.5, hi: 0.7 }]);
assert(ov2b.nonOverlapping === 0, 'touching intervals count as overlapping');

// Three intervals, one separated from the other two
var ov3 = checkCIOverlap([
  { lo: 0.1, hi: 0.4 }, { lo: 0.2, hi: 0.5 }, { lo: 0.7, hi: 0.9 },
]);
assert(ov3.totalPairs === 3, 'three intervals: 3 pairs');
assert(ov3.nonOverlapping === 2, 'third interval separated from first two');

// Single interval: no pairs
var ov4 = checkCIOverlap([{ lo: 0.1, hi: 0.5 }]);
assert(ov4.totalPairs === 0, 'single interval: 0 pairs');
assert(ov4.nonOverlapping === 0, 'single interval: 0 non-overlapping');

// Empty: no intervals
var ov5 = checkCIOverlap([]);
assert(ov5.totalPairs === 0, 'no intervals: 0 pairs');

// ══════════════════════════════════════════════════════════════════════
// Widget 2 — Data generation (uses generateW2MonthlyData from widget2)
// ══════════════════════════════════════════════════════════════════════

console.log('\n=== Widget 2: data generation ===');

var w2rng = mulberry32(W2_CONFIG.SEED);
var w2Monthly = generateW2MonthlyData(W2_CONFIG.RELEASES, w2rng);

assert(w2Monthly.length === 36, 'generates 36 months of data');

var allPositiveMiles = w2Monthly.every(function (d) { return d.milesThisMonth > 0; });
assert(allPositiveMiles, 'all months have positive miles');

var milesInRange = w2Monthly.every(function (d) {
  return d.milesThisMonth >= 2400000 && d.milesThisMonth <= 3600000;
});
assert(milesInRange, 'monthly miles in [2.4M, 3.6M] range');

var allNonNegIncidents = w2Monthly.every(function (d) { return d.incidents >= 0; });
assert(allNonNegIncidents, 'all months have non-negative incidents');

var aggPositive = w2Monthly.every(function (d) { return d.aggregateRate > 0; });
assert(aggPositive, 'aggregate rate always positive');

var allAssigned = w2Monthly.every(function (d) {
  return d.releaseIdx >= 0 && d.releaseIdx < W2_CONFIG.RELEASES.length;
});
assert(allAssigned, 'each month assigned to a release');

// v3.3 (regression) should have higher average rate than v3.2
var w2v32 = w2Monthly.filter(function (d) { return d.version === 'v3.2'; });
var w2v33 = w2Monthly.filter(function (d) { return d.version === 'v3.3'; });
var w2v32Avg = w2v32.reduce(function (s, d) { return s + d.monthlyRate; }, 0) / w2v32.length;
var w2v33Avg = w2v33.reduce(function (s, d) { return s + d.monthlyRate; }, 0) / w2v33.length;
assert(w2v33Avg > w2v32Avg, 'v3.3 (regression) has higher avg rate than v3.2');

// v4.2 (mild regression) should have higher average rate than v4.1
var w2v41 = w2Monthly.filter(function (d) { return d.version === 'v4.1'; });
var w2v42 = w2Monthly.filter(function (d) { return d.version === 'v4.2'; });
var w2v41Avg = w2v41.reduce(function (s, d) { return s + d.monthlyRate; }, 0) / w2v41.length;
var w2v42Avg = w2v42.reduce(function (s, d) { return s + d.monthlyRate; }, 0) / w2v42.length;
assert(w2v42Avg > w2v41Avg, 'v4.2 (mild regression) has higher avg rate than v4.1');

// ══════════════════════════════════════════════════════════════════════
// Widget 2 — Release stats & posteriors (uses computeW2ReleaseStats)
// ══════════════════════════════════════════════════════════════════════

console.log('\n=== Widget 2: release stats & posteriors ===');

var w2Stats = computeW2ReleaseStats(W2_CONFIG.RELEASES, w2Monthly);

assert(w2Stats.length === 7, '7 releases computed');

var statsValid = w2Stats.every(function (s) { return s.K >= 0 && s.E > 0; });
assert(statsValid, 'all releases have K >= 0 and E > 0');

// Cross-check: v3.1 stats match sum of months 0-4
var v31Months = w2Monthly.filter(function (d) { return d.month >= 0 && d.month <= 4; });
assertClose(w2Stats[0].K,
  v31Months.reduce(function (s, m) { return s + m.incidents; }, 0),
  0.001, 'v3.1 K matches monthly sum');
assertClose(w2Stats[0].E,
  v31Months.reduce(function (s, m) { return s + m.milesThisMonth; }, 0) / 100000,
  0.001, 'v3.1 E matches monthly sum');

// Posterior computation: Gamma(α₀+K, β₀+E)
var w2Post = w2Stats.map(function (s, i) {
  return {
    alpha: W2_CONFIG.ALPHA0 + s.K,
    beta: W2_CONFIG.BETA0 + s.E,
    version: W2_CONFIG.RELEASES[i].version,
  };
});

// Posterior mean should be positive and finite
w2Post.forEach(function (p) {
  var mean = p.alpha / p.beta;
  assert(mean > 0 && isFinite(mean), p.version + ': posterior mean is positive and finite');
});

// With weak prior and decent data, posterior mean is between prior mean and empirical rate
var w2PriorMean = W2_CONFIG.ALPHA0 / W2_CONFIG.BETA0;
w2Post.forEach(function (p, i) {
  var postMean = p.alpha / p.beta;
  var empirical = w2Stats[i].K / w2Stats[i].E;
  var lo = Math.min(w2PriorMean, empirical);
  var hi = Math.max(w2PriorMean, empirical);
  assert(postMean >= lo - 0.01 && postMean <= hi + 0.01,
    p.version + ': posterior mean between prior mean and empirical rate');
});

// ══════════════════════════════════════════════════════════════════════
// Widget 2 — Pooled posterior
// ══════════════════════════════════════════════════════════════════════

console.log('\n=== Widget 2: pooled posterior ===');

var w2PooledK = w2Stats.reduce(function (s, r) { return s + r.K; }, 0);
var w2PooledE = w2Stats.reduce(function (s, r) { return s + r.E; }, 0);
var w2PooledAlpha = W2_CONFIG.ALPHA0 + w2PooledK;
var w2PooledBeta = W2_CONFIG.BETA0 + w2PooledE;

// Pooled mean between min and max per-release means
var perRelMeans = w2Post.map(function (p) { return p.alpha / p.beta; });
var w2PooledMean = w2PooledAlpha / w2PooledBeta;
assert(w2PooledMean >= Math.min.apply(null, perRelMeans) - 0.01,
  'pooled mean >= min per-release mean');
assert(w2PooledMean <= Math.max.apply(null, perRelMeans) + 0.01,
  'pooled mean <= max per-release mean');

// Pooled posterior is narrower than any individual release posterior
var pooledCI90 = gammaQuantile(0.95, w2PooledAlpha, w2PooledBeta) -
  gammaQuantile(0.05, w2PooledAlpha, w2PooledBeta);
w2Post.forEach(function (p) {
  var relCI = gammaQuantile(0.95, p.alpha, p.beta) - gammaQuantile(0.05, p.alpha, p.beta);
  assert(pooledCI90 < relCI, p.version + ': pooled 90% CI narrower than per-release');
});

// ══════════════════════════════════════════════════════════════════════
// Widget 2 — CI overlap on actual data
// ══════════════════════════════════════════════════════════════════════

console.log('\n=== Widget 2: CI overlap on actual data ===');

var w2CIs = w2Post.map(function (p) {
  return {
    lo: gammaQuantile(0.05, p.alpha, p.beta),
    hi: gammaQuantile(0.95, p.alpha, p.beta),
    version: p.version,
  };
});

var w2Ov = checkCIOverlap(w2CIs);
assert(w2Ov.totalPairs === 21, '7 releases → C(7,2) = 21 pairs');
assert(w2Ov.nonOverlapping > 0, 'regressions produce non-overlapping CI pairs');

// v3.3 (highest base rate 0.55) vs v4.3 (lowest base rate 0.28) should not overlap
var v33CI = w2CIs[2];
var v43CI = w2CIs[6];
var v33v43Sep = v33CI.hi < v43CI.lo || v43CI.hi < v33CI.lo;
assert(v33v43Sep, 'v3.3 and v4.3 have non-overlapping 90% CIs');

// v3.3 and v4.1 (0.55 vs 0.30) should be clearly separated
var v33v41Sep = w2CIs[2].hi < w2CIs[4].lo || w2CIs[4].hi < w2CIs[2].lo;
assert(v33v41Sep, 'v3.3 and v4.1 have non-overlapping 90% CIs');

// ══════════════════════════════════════════════════════════════════════
// Widget 2 — Aggregate masks regressions (key article claim)
// ══════════════════════════════════════════════════════════════════════

console.log('\n=== Widget 2: aggregate masks regressions ===');

// The aggregate rate at the end should be between the best and worst per-release rates
var finalAgg = w2Monthly[w2Monthly.length - 1].aggregateRate;
var perRelEmpRates = w2Stats.map(function (s) { return s.K / s.E; });
assert(finalAgg >= Math.min.apply(null, perRelEmpRates) - 0.01,
  'final aggregate >= min per-release empirical rate');
assert(finalAgg <= Math.max.apply(null, perRelEmpRates) + 0.01,
  'final aggregate <= max per-release empirical rate');

// The aggregate smooths over the v3.3 regression: aggregate at end of v3.3 should
// be lower than v3.3's own empirical rate (diluted by earlier good releases)
var aggAfterV33 = w2Monthly[14].aggregateRate; // end of v3.3
var v33Empirical = w2Stats[2].K / w2Stats[2].E;
assert(aggAfterV33 < v33Empirical, 'aggregate after v3.3 lower than v3.3 empirical rate (dilution)');

// ══════════════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failures.length > 0) {
  console.log('\nFailures:');
  failures.forEach(function (f) { console.log('  - ' + f); });
}
console.log('');

process.exit(failed > 0 ? 1 : 0);
