/**
 * Widget 2 — Non-Stationarity Demonstrator
 *
 * Shows that smooth aggregate safety metrics can mask per-release regressions.
 * Progressive reveal: each click exposes one more release's actual rate
 * and its posterior density.
 *
 * Pure logic (W2_CONFIG, generateW2MonthlyData, computeW2ReleaseStats) is
 * defined at the top level so that tests can exercise it without DOM stubs.
 * Rendering lives in the IIFE below.
 */

var W2_CONFIG = {
  ALPHA0: 1,
  BETA0: 2, // prior mean = ALPHA0/BETA0 = 0.5 incidents per 100k miles
  SEED: 12345,
  RELEASES: [
    { start: 0, end: 4, version: 'v3.1', baseRate: 0.50 },
    { start: 5, end: 9, version: 'v3.2', baseRate: 0.42 },
    { start: 10, end: 14, version: 'v3.3', baseRate: 0.55 },  // regression!
    { start: 15, end: 19, version: 'v4.0', baseRate: 0.35 },
    { start: 20, end: 24, version: 'v4.1', baseRate: 0.30 },
    { start: 25, end: 29, version: 'v4.2', baseRate: 0.38 },  // mild regression
    { start: 30, end: 35, version: 'v4.3', baseRate: 0.28 },
  ],
};

function generateW2MonthlyData(releases, rng) {
  var monthlyData = [];
  var cumulativeMiles = 0;
  var cumulativeIncidents = 0;

  for (var m = 0; m < 36; m++) {
    var release = releases.find(function (r) { return m >= r.start && m <= r.end; });
    var milesThisMonth = 2400000 + rng() * 1200000;
    var noise = (rng() - 0.5) * 0.15;
    var incidentRate = Math.max(0.05, release.baseRate + noise);
    var incidents = Math.round(incidentRate * milesThisMonth / 100000);

    cumulativeMiles += milesThisMonth;
    cumulativeIncidents += incidents;

    monthlyData.push({
      month: m,
      version: release.version,
      releaseIdx: releases.indexOf(release),
      milesThisMonth: milesThisMonth,
      incidents: incidents,
      monthlyRate: incidents / (milesThisMonth / 100000),
      aggregateRate: cumulativeIncidents / (cumulativeMiles / 100000),
    });
  }
  return monthlyData;
}

function computeW2ReleaseStats(releases, monthlyData) {
  return releases.map(function (r) {
    var months = monthlyData.filter(function (m) { return m.month >= r.start && m.month <= r.end; });
    return {
      K: months.reduce(function (s, m) { return s + m.incidents; }, 0),
      E: months.reduce(function (s, m) { return s + m.milesThisMonth; }, 0) / 100000,
    };
  });
}

(function () {
  var MOUNT = 'widget-2';
  if (!document.getElementById(MOUNT)) return;

  var RELEASES = W2_CONFIG.RELEASES;
  var ALPHA0 = W2_CONFIG.ALPHA0;
  var BETA0 = W2_CONFIG.BETA0;

  var rng = mulberry32(W2_CONFIG.SEED);
  var monthlyData = generateW2MonthlyData(RELEASES, rng);
  var releaseStats = computeW2ReleaseStats(RELEASES, monthlyData);

  var state = {
    revealCount: 0,
  };

  // Build DOM
  var container = document.getElementById(MOUNT);
  var heading = container.querySelector('h3');

  var controlDiv = document.createElement('div');
  controlDiv.innerHTML =
    '<div class="view-toggle">' +
      '<button class="widget-btn" id="w2-reveal-btn">Reveal ' + RELEASES[0].version + '</button>' +
      '<button class="widget-btn" id="w2-reset-btn" disabled>Reset</button>' +
    '</div>' +
    '<div id="w2-chart"></div>' +
    '<div id="w2-posterior-chart"></div>' +
    '<div id="w2-overlap-summary" class="bayes-panel" style="display:none;"></div>';

  if (heading && heading.nextSibling) {
    container.insertBefore(controlDiv, heading.nextSibling);
  } else {
    container.appendChild(controlDiv);
  }

  var revealBtn = document.getElementById('w2-reveal-btn');
  var resetBtn = document.getElementById('w2-reset-btn');

  revealBtn.addEventListener('click', function () {
    if (state.revealCount >= RELEASES.length) return;
    state.revealCount++;
    resetBtn.disabled = false;
    if (state.revealCount >= RELEASES.length) {
      revealBtn.disabled = true;
      revealBtn.textContent = 'All releases revealed';
    } else {
      revealBtn.textContent = 'Reveal ' + RELEASES[state.revealCount].version;
    }
    drawChart();
    drawPosteriors();
  });

  resetBtn.addEventListener('click', function () {
    state.revealCount = 0;
    revealBtn.disabled = false;
    revealBtn.textContent = 'Reveal ' + RELEASES[0].version;
    resetBtn.disabled = true;
    drawChart();
    drawPosteriors();
  });

  // ── Time-series chart ──────────────────────────────────────────────
  var margins = { top: 20, right: 30, bottom: 50, left: 60 };
  var chart = makeResponsiveSVG('w2-chart', margins, 0.5);
  if (!chart) return;

  var xScale = d3.scaleLinear().domain([0, 35]).range([0, chart.width]);
  var yScale = d3.scaleLinear().domain([0, 0.8]).range([chart.height, 0]);

  chart.g.append('g').attr('class', 'axis').attr('transform', 'translate(0,' + chart.height + ')')
    .call(d3.axisBottom(xScale).ticks(12).tickFormat(function (d) { return 'M' + (d + 1); }));
  chart.g.append('g').attr('class', 'axis')
    .call(d3.axisLeft(yScale).ticks(5));

  chart.g.append('text')
    .attr('x', chart.width / 2).attr('y', chart.height + 42)
    .attr('text-anchor', 'middle')
    .style('font-size', '12px').style('fill', '#666')
    .text('Month');

  chart.g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -chart.height / 2).attr('y', -45)
    .attr('text-anchor', 'middle')
    .style('font-size', '12px').style('fill', '#666')
    .text('Incidents per 100k miles');

  // Release boundary lines and labels
  var releaseGroup = chart.g.append('g').attr('class', 'release-boundaries');
  RELEASES.forEach(function (r, i) {
    if (i > 0) {
      releaseGroup.append('line')
        .attr('x1', xScale(r.start)).attr('x2', xScale(r.start))
        .attr('y1', 0).attr('y2', chart.height)
        .attr('stroke', '#ccc').attr('stroke-width', 1).attr('stroke-dasharray', '4,3');
    }
    releaseGroup.append('text')
      .attr('x', xScale((r.start + r.end) / 2))
      .attr('y', -6)
      .attr('text-anchor', 'middle')
      .style('font-size', '10px').style('fill', '#999')
      .text(r.version);
  });

  var aggregateLine = chart.g.append('path').attr('fill', 'none').attr('stroke', COLORS.accent).attr('stroke-width', 2.5);

  var releaseColors = ['#4A7BF7', '#26A69A', '#E05252', '#7E57C2', '#FF7043', '#EF5350', '#66BB6A'];

  var relLine = d3.line()
    .x(function (d) { return xScale(d.month); })
    .y(function (d) { return yScale(d.monthlyRate); })
    .curve(d3.curveMonotoneX);

  var releasePaths = [];
  RELEASES.forEach(function (r, i) {
    var segData = monthlyData.filter(function (m) { return m.month >= r.start && m.month <= r.end; });
    var p = chart.g.append('path')
      .datum(segData)
      .attr('fill', 'none')
      .attr('stroke', releaseColors[i])
      .attr('stroke-width', 2.5)
      .attr('d', relLine)
      .attr('opacity', 0);
    releasePaths.push(p);
  });

  var aggLine = d3.line()
    .x(function (d) { return xScale(d.month); })
    .y(function (d) { return yScale(d.aggregateRate); })
    .curve(d3.curveMonotoneX);

  function drawChart() {
    var aggOpacity = state.revealCount === 0 ? 1 : Math.max(0.2, 1 - state.revealCount * 0.12);
    aggregateLine
      .datum(monthlyData)
      .transition().duration(500)
      .attr('d', aggLine)
      .attr('opacity', aggOpacity);

    releasePaths.forEach(function (p, i) {
      p.transition().duration(500)
        .attr('opacity', i < state.revealCount ? 1 : 0);
    });
  }

  // ── Posterior density chart ────────────────────────────────────────
  var pMargins = { top: 16, right: 30, bottom: 40, left: 60 };
  var pChart = makeResponsiveSVG('w2-posterior-chart', pMargins, 0.35);
  if (!pChart) return;

  var pXScale = d3.scaleLinear().range([0, pChart.width]);
  var pYScale = d3.scaleLinear().range([pChart.height, 0]);

  var pXAxisG = pChart.g.append('g').attr('class', 'axis')
    .attr('transform', 'translate(0,' + pChart.height + ')');
  var pYAxisG = pChart.g.append('g').attr('class', 'axis');

  pChart.g.append('text')
    .attr('x', pChart.width / 2).attr('y', pChart.height + 32)
    .attr('text-anchor', 'middle')
    .style('font-size', '12px').style('fill', '#666')
    .text('Incident rate (per 100k miles)');

  pChart.g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -pChart.height / 2).attr('y', -45)
    .attr('text-anchor', 'middle')
    .style('font-size', '12px').style('fill', '#666')
    .text('Posterior density');

  // Pooled posterior path (dashed)
  var pooledPath = pChart.g.append('path')
    .attr('fill', 'none')
    .attr('stroke', '#999')
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', '6,4');

  // Per-release posterior paths
  var posteriorPaths = RELEASES.map(function (r, i) {
    return pChart.g.append('path')
      .attr('fill', 'none')
      .attr('stroke', releaseColors[i])
      .attr('stroke-width', 2)
      .attr('opacity', 0);
  });

  // 90% CI bands per release
  var ciBands = RELEASES.map(function (r, i) {
    return pChart.g.append('path')
      .attr('fill', releaseColors[i])
      .attr('opacity', 0);
  });

  var pLineGen = d3.line()
    .x(function (d) { return pXScale(d.x); })
    .y(function (d) { return pYScale(d.y); });

  var pAreaGen = d3.area()
    .x(function (d) { return pXScale(d.x); })
    .y0(pChart.height)
    .y1(function (d) { return pYScale(d.y); });

  function drawPosteriors() {
    var summaryEl = document.getElementById('w2-overlap-summary');

    if (state.revealCount === 0) {
      summaryEl.style.display = 'none';
      pooledPath.attr('opacity', 0);
      posteriorPaths.forEach(function (p) { p.attr('opacity', 0); });
      ciBands.forEach(function (b) { b.attr('opacity', 0); });
      return;
    }

    summaryEl.style.display = '';

    // Compute posteriors for revealed releases
    var posteriors = [];
    var pooledK = 0, pooledE = 0;
    for (var i = 0; i < state.revealCount; i++) {
      var K = releaseStats[i].K;
      var E = releaseStats[i].E;
      pooledK += K;
      pooledE += E;
      posteriors.push({
        alpha: ALPHA0 + K,
        beta: BETA0 + E,
        version: RELEASES[i].version,
      });
    }

    var pooledAlpha = ALPHA0 + pooledK;
    var pooledBeta = BETA0 + pooledE;

    // Determine x-axis range from all visible posteriors
    var xMin = 0;
    var xMax = 0;
    posteriors.forEach(function (p) {
      var upper = gammaQuantile(0.995, p.alpha, p.beta);
      if (upper > xMax) xMax = upper;
    });
    var pooledUpper = gammaQuantile(0.995, pooledAlpha, pooledBeta);
    xMax = Math.max(xMax, pooledUpper) * 1.1;
    xMax = Math.max(xMax, 0.8);

    pXScale.domain([xMin, xMax]);
    var nPts = 150;

    // Compute densities and find yMax
    var yMax = 0;
    var densities = posteriors.map(function (p) {
      var pts = computeDensity(p.alpha, p.beta, xMin, xMax, nPts);
      pts.forEach(function (d) { if (d.y > yMax) yMax = d.y; });
      return pts;
    });

    var pooledDensity = computeDensity(pooledAlpha, pooledBeta, xMin, xMax, nPts);
    pooledDensity.forEach(function (d) { if (d.y > yMax) yMax = d.y; });

    pYScale.domain([0, yMax * 1.1]);

    // Update axes
    pXAxisG.transition().duration(300).call(d3.axisBottom(pXScale).ticks(6));
    pYAxisG.transition().duration(300).call(d3.axisLeft(pYScale).ticks(4).tickFormat(d3.format('.1f')));

    // Draw pooled posterior
    pooledPath
      .datum(pooledDensity)
      .transition().duration(400)
      .attr('d', pLineGen)
      .attr('opacity', 0.7);

    // Draw per-release posteriors and CI bands
    posteriorPaths.forEach(function (path, i) {
      if (i < state.revealCount) {
        path.datum(densities[i])
          .transition().duration(400)
          .attr('d', pLineGen)
          .attr('opacity', 1);

        // 90% CI band
        var lo = gammaQuantile(0.05, posteriors[i].alpha, posteriors[i].beta);
        var hi = gammaQuantile(0.95, posteriors[i].alpha, posteriors[i].beta);
        var bandData = densities[i].filter(function (d) { return d.x >= lo && d.x <= hi; });
        ciBands[i].datum(bandData)
          .transition().duration(400)
          .attr('d', pAreaGen)
          .attr('opacity', 0.12);
      } else {
        path.transition().duration(400).attr('opacity', 0);
        ciBands[i].transition().duration(400).attr('opacity', 0);
      }
    });

    // Overlap analysis: check pairwise 90% CI overlap
    var intervals = posteriors.map(function (p) {
      return {
        lo: gammaQuantile(0.05, p.alpha, p.beta),
        hi: gammaQuantile(0.95, p.alpha, p.beta),
        version: p.version,
      };
    });

    var overlap = checkCIOverlap(intervals);
    var nonOverlapping = overlap.nonOverlapping;
    var totalPairs = overlap.totalPairs;

    var html;
    if (state.revealCount === 1) {
      html = '<span class="posterior-label">Showing posterior for ' + posteriors[0].version +
        ' (solid) vs. pooled estimate (dashed).</span>';
    } else if (nonOverlapping === 0) {
      html = '<span class="posterior-label">All ' + state.revealCount +
        ' release posteriors overlap at 90% credible level.</span>' +
        '<div class="posterior-gloss">So far consistent with a shared rate.</div>';
    } else {
      html = '<span class="posterior-label">' + nonOverlapping + ' of ' + totalPairs +
        ' release pairs have non-overlapping 90% credible intervals.</span>' +
        '<div class="posterior-gloss">The releases have meaningfully different incident rates — the aggregate masks this.</div>';
    }
    summaryEl.innerHTML = html;
  }

  drawChart();
  drawPosteriors();
})();
