/**
 * Animation: Bayesian Rate Modeling introduction
 *
 * Four-phase animation demonstrating:
 *   1. The prior distribution
 *   2. How data narrows the posterior
 *   3. Credible interval width varies with confidence level
 *   4. Same mean, different uncertainty — why point estimates aren't enough
 *
 * Uses Gamma-Poisson conjugate model via shared.js utilities.
 * 
 *  Copyright (C) 2026 Erik Ferguson
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as
 *  published by the Free Software Foundation, either version 3 of the
 *  License, or (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
(function () {
  var MOUNT = 'bayes-intro';
  if (!document.getElementById(MOUNT)) return;

  var X_MAX = 10;
  var N_POINTS = 300;
  var TRANS = 700;

  var PRIOR = { alpha: 2, beta: 0.4 };

  // Posteriors from accumulating Poisson data (true rate ≈ 2).
  // Each step adds 20 time units; event counts vary naturally.
  // Posterior: Gamma(α₀ + cumulative_k, β₀ + cumulative_T)
  var DATA_POSTERIORS = [
    { alpha: 54, beta: 20.4, nLabel: '20 time units, 52 events' },   // window rate 2.6
    { alpha: 86, beta: 40.4, nLabel: '40 time units, 84 events' },   // +32 events, window rate 1.6
    { alpha: 124, beta: 60.4, nLabel: '60 time units, 122 events' }, // +38 events, window rate 1.9
  ];

  var CI_DIST = DATA_POSTERIORS[2];
  var CI_SEQUENCE = [0.80, 0.90, 0.95, 0.99];

  var COMPARE = [
    { alpha: 4, beta: 2, color: '#E05252', label: 'Few observations' },
    { alpha: 40, beta: 20, color: COLORS.accent, label: 'Many observations' },
  ];

  var PHASE_INFO = [
    {
      id: 'prior',
      label: '1: The prior',
      caption: 'We start with a <em>prior distribution</em>: our belief or known evidence (such as from existing research) about the event rate before seeing any data. This one is centered at 5 with wide spread, reflecting substantial uncertainty.',
      animated: false,
    },
    {
      id: 'data',
      label: '2: Data updates the prior',
      caption: 'As observations accumulate, the <em>posterior</em> (solid) narrows and shifts toward the true rate (~2). The dashed line is the original prior, whose influence fades as data grows.',
      animated: true,
    },
    {
      id: 'ci',
      label: '3: Credible intervals',
      caption: 'A <em>credible interval</em> contains a specified probability mass of the posterior: a 99% credible interval contains the 99% most credible values. Higher certainty requires a wider interval.',
      animated: true,
    },
    {
      id: 'mean',
      label: '4: Why the mean isn\'t enough',
      caption: 'Both distributions have a mean of 2.0. But the <span style="color:#E05252;font-weight:600">red</span> curve says the rate could plausibly be anywhere from 0 to 6, while the <span style="color:#4A7BF7;font-weight:600">blue</span> curve pins it between 1.5 and 2.5. Reporting only a single estimate hides this critical difference.',
      animated: false,
    },
  ];

  // ── State ───────────────────────────────────────────────────────────

  var currentPhase = -1;
  var subTimers = [];

  function clearTimers() {
    subTimers.forEach(function (t) { clearTimeout(t); });
    subTimers = [];
  }

  // ── Build DOM ───────────────────────────────────────────────────────

  var container = document.getElementById(MOUNT);
  var heading = container.querySelector('h3');

  var controlDiv = document.createElement('div');
  controlDiv.innerHTML =
    '<div id="bi-chart"></div>' +
    '<div class="bi-nav">' +
      '<div id="bi-dots"></div>' +
      '<div id="bi-phase-label"></div>' +
      '<button class="widget-btn" id="bi-replay" style="display:none">Replay this step</button>' +
      '<button class="widget-btn" id="bi-next">Next</button>' +
    '</div>' +
    '<div id="bi-caption"></div>';

  if (heading && heading.nextSibling) {
    container.insertBefore(controlDiv, heading.nextSibling);
  } else {
    container.appendChild(controlDiv);
  }

  var dotsEl = document.getElementById('bi-dots');
  var dots = [];
  PHASE_INFO.forEach(function (p, i) {
    var dot = document.createElement('span');
    dot.className = 'bi-dot';
    dot.addEventListener('click', function () { goToPhase(i); });
    dotsEl.appendChild(dot);
    dots.push(dot);
  });

  document.getElementById('bi-replay').addEventListener('click', function () {
    if (currentPhase >= 0) goToPhase(currentPhase);
  });

  document.getElementById('bi-next').addEventListener('click', function () {
    if (currentPhase < PHASE_INFO.length - 1) goToPhase(currentPhase + 1);
  });

  // ── Chart Setup ─────────────────────────────────────────────────────

  var margins = { top: 24, right: 30, bottom: 44, left: 55 };
  var chart = makeResponsiveSVG('bi-chart', margins, 0.48);
  if (!chart) return;

  var xScale = d3.scaleLinear().domain([0, X_MAX]).range([0, chart.width]);
  var yScale = d3.scaleLinear().range([chart.height, 0]);

  var xAxisG = chart.g.append('g').attr('class', 'axis')
    .attr('transform', 'translate(0,' + chart.height + ')')
    .call(d3.axisBottom(xScale).ticks(10));
  var yAxisG = chart.g.append('g').attr('class', 'axis');

  chart.g.append('text')
    .attr('x', chart.width / 2).attr('y', chart.height + 36)
    .attr('text-anchor', 'middle')
    .style('font-size', '12px').style('fill', '#666')
    .text('Event rate');

  chart.g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -chart.height / 2).attr('y', -42)
    .attr('text-anchor', 'middle')
    .style('font-size', '12px').style('fill', '#666')
    .text('Probability density');

  // ── Chart Elements ──────────────────────────────────────────────────

  var ciBand = chart.g.append('path')
    .attr('fill', COLORS.accent).attr('opacity', 0);

  var priorPath = chart.g.append('path')
    .attr('fill', 'none').attr('stroke', COLORS.accentLight)
    .attr('stroke-width', 1.5).attr('stroke-dasharray', '5,4')
    .attr('opacity', 0);

  var posteriorPath = chart.g.append('path')
    .attr('fill', 'none').attr('stroke', COLORS.accent)
    .attr('stroke-width', 2.5).attr('opacity', 0);

  var comparePath1 = chart.g.append('path')
    .attr('fill', 'none').attr('stroke-width', 2.5).attr('opacity', 0);
  var comparePath2 = chart.g.append('path')
    .attr('fill', 'none').attr('stroke-width', 2.5).attr('opacity', 0);

  var meanLine = chart.g.append('line')
    .attr('stroke', '#555').attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '6,4').attr('opacity', 0);

  var meanLabel = chart.g.append('text')
    .attr('text-anchor', 'middle')
    .style('font-size', '11px').style('fill', '#555')
    .style('font-family', '-apple-system, sans-serif')
    .attr('opacity', 0);

  var infoLabel = chart.g.append('text')
    .attr('x', chart.width - 8).attr('y', 18)
    .attr('text-anchor', 'end')
    .style('font-size', '13px').style('font-weight', '600')
    .style('font-family', '-apple-system, sans-serif')
    .style('fill', '#333').attr('opacity', 0);

  var ciLabel = chart.g.append('text')
    .attr('text-anchor', 'middle')
    .style('font-size', '12px').style('font-weight', '600')
    .style('font-family', '-apple-system, sans-serif')
    .style('fill', COLORS.accent).attr('opacity', 0);

  // Legend for comparison phase
  var legendG = chart.g.append('g')
    .attr('transform', 'translate(' + (chart.width - 160) + ', 4)')
    .attr('opacity', 0);

  legendG.append('line').attr('x1', 0).attr('x2', 18).attr('y1', 6).attr('y2', 6)
    .attr('stroke', COMPARE[0].color).attr('stroke-width', 2.5);
  legendG.append('text').attr('x', 24).attr('y', 10)
    .text(COMPARE[0].label)
    .style('font-size', '11px').style('fill', '#666')
    .style('font-family', '-apple-system, sans-serif');

  legendG.append('line').attr('x1', 0).attr('x2', 18).attr('y1', 22).attr('y2', 22)
    .attr('stroke', COMPARE[1].color).attr('stroke-width', 2.5);
  legendG.append('text').attr('x', 24).attr('y', 26)
    .text(COMPARE[1].label)
    .style('font-size', '11px').style('fill', '#666')
    .style('font-family', '-apple-system, sans-serif');

  // ── Helpers ─────────────────────────────────────────────────────────

  var lineGen = d3.line()
    .x(function (d) { return xScale(d.x); })
    .y(function (d) { return yScale(d.y); })
    .curve(d3.curveMonotoneX);

  var areaGen = d3.area()
    .x(function (d) { return xScale(d.x); })
    .y0(chart.height)
    .y1(function (d) { return yScale(d.y); })
    .curve(d3.curveMonotoneX);

  function density(alpha, beta) {
    var pts = [];
    var yMax = 0;
    for (var i = 0; i <= N_POINTS; i++) {
      var x = (i / N_POINTS) * X_MAX;
      var y = gammaPDF(x, alpha, beta);
      pts.push({ x: x, y: y });
      if (y > yMax) yMax = y;
    }
    return { pts: pts, yMax: yMax };
  }

  function setYMax(yMax, dur) {
    yScale.domain([0, yMax * 1.15]);
    yAxisG.transition().duration(dur || TRANS)
      .call(d3.axisLeft(yScale).ticks(4));
  }

  function hideAll(dur) {
    var d = dur || 300;
    [priorPath, posteriorPath, ciBand, meanLine, meanLabel,
     comparePath1, comparePath2, infoLabel, ciLabel, legendG]
      .forEach(function (el) { el.transition().duration(d).attr('opacity', 0); });
  }

  // ── Phase Renderers ─────────────────────────────────────────────────

  function showPrior() {
    hideAll(250);

    var prior = density(PRIOR.alpha, PRIOR.beta);
    setYMax(prior.yMax);

    var mean = PRIOR.alpha / PRIOR.beta;

    setTimeout(function () {
      // Pre-set priorPath so it can transition smoothly in the data phase
      priorPath.datum(prior.pts).attr('d', lineGen);

      posteriorPath.datum(prior.pts).attr('d', lineGen)
        .attr('stroke', COLORS.accent).attr('stroke-dasharray', 'none')
        .transition().duration(TRANS).attr('opacity', 1);

      meanLine
        .attr('x1', xScale(mean)).attr('x2', xScale(mean))
        .attr('y1', 0).attr('y2', chart.height)
        .transition().duration(TRANS).attr('opacity', 0.5);
      meanLabel
        .attr('x', xScale(mean)).attr('y', -8)
        .text('mean = ' + mean.toFixed(1))
        .transition().duration(TRANS).attr('opacity', 0.7);
    }, 350);
  }

  function showData(step) {
    var prior = density(PRIOR.alpha, PRIOR.beta);
    var post = density(DATA_POSTERIORS[step].alpha, DATA_POSTERIORS[step].beta);
    var yMax = Math.max(prior.yMax, post.yMax);
    setYMax(yMax);

    priorPath.datum(prior.pts)
      .transition().duration(TRANS)
      .attr('d', lineGen).attr('opacity', 0.35);

    posteriorPath.datum(post.pts)
      .attr('stroke', COLORS.accent).attr('stroke-dasharray', 'none')
      .transition().duration(TRANS).attr('d', lineGen).attr('opacity', 1);

    var postMean = DATA_POSTERIORS[step].alpha / DATA_POSTERIORS[step].beta;
    meanLine.transition().duration(TRANS)
      .attr('x1', xScale(postMean)).attr('x2', xScale(postMean))
      .attr('y1', 0).attr('y2', chart.height).attr('opacity', 0.5);
    meanLabel.transition().duration(TRANS)
      .attr('x', xScale(postMean)).attr('y', -8).attr('opacity', 0.7);
    meanLabel.text('mean = ' + postMean.toFixed(2));

    infoLabel.text(DATA_POSTERIORS[step].nLabel)
      .transition().duration(TRANS).attr('opacity', 1);

    ciBand.transition().duration(TRANS).attr('opacity', 0);
    ciLabel.transition().duration(TRANS).attr('opacity', 0);
    comparePath1.transition().duration(TRANS).attr('opacity', 0);
    comparePath2.transition().duration(TRANS).attr('opacity', 0);
    legendG.transition().duration(TRANS).attr('opacity', 0);
  }

  function showCI(levelIdx) {
    var dist = CI_DIST;
    var post = density(dist.alpha, dist.beta);
    setYMax(post.yMax);

    priorPath.transition().duration(TRANS).attr('opacity', 0);
    posteriorPath.datum(post.pts)
      .attr('stroke', COLORS.accent).attr('stroke-dasharray', 'none')
      .transition().duration(TRANS).attr('d', lineGen).attr('opacity', 1);

    meanLine.transition().duration(TRANS).attr('opacity', 0);
    meanLabel.transition().duration(TRANS).attr('opacity', 0);
    infoLabel.transition().duration(TRANS).attr('opacity', 0);
    comparePath1.transition().duration(TRANS).attr('opacity', 0);
    comparePath2.transition().duration(TRANS).attr('opacity', 0);
    legendG.transition().duration(TRANS).attr('opacity', 0);

    var level = CI_SEQUENCE[levelIdx];
    var tail = (1 - level) / 2;
    var lo = gammaQuantile(tail, dist.alpha, dist.beta);
    var hi = gammaQuantile(1 - tail, dist.alpha, dist.beta);

    var bandPts = post.pts.filter(function (d) { return d.x >= lo && d.x <= hi; });
    if (bandPts.length > 0) {
      bandPts = [{ x: bandPts[0].x, y: 0 }].concat(bandPts)
        .concat([{ x: bandPts[bandPts.length - 1].x, y: 0 }]);
    }

    ciBand.datum(bandPts)
      .transition().duration(TRANS)
      .attr('d', areaGen).attr('opacity', 0.18);

    var mid = (lo + hi) / 2;
    var labelY = yScale(gammaPDF(mid, dist.alpha, dist.beta)) - 14;
    labelY = Math.max(16, labelY);
    ciLabel
      .attr('x', xScale(mid)).attr('y', labelY)
      .text(Math.round(level * 100) + '% CI: [' + lo.toFixed(2) + ', ' + hi.toFixed(2) + ']')
      .transition().duration(TRANS).attr('opacity', 1);
  }

  function showMeanCompare() {
    hideAll(350);

    var d1 = density(COMPARE[0].alpha, COMPARE[0].beta);
    var d2 = density(COMPARE[1].alpha, COMPARE[1].beta);
    var yMax = Math.max(d1.yMax, d2.yMax);

    setTimeout(function () {
      setYMax(yMax);

      comparePath1.datum(d1.pts).attr('d', lineGen)
        .attr('stroke', COMPARE[0].color)
        .transition().duration(TRANS).attr('opacity', 1);
      comparePath2.datum(d2.pts).attr('d', lineGen)
        .attr('stroke', COMPARE[1].color)
        .transition().duration(TRANS).attr('opacity', 1);

      var mean = COMPARE[0].alpha / COMPARE[0].beta;
      meanLine
        .attr('x1', xScale(mean)).attr('x2', xScale(mean))
        .attr('y1', 0).attr('y2', chart.height)
        .transition().duration(TRANS).attr('opacity', 0.5);
      meanLabel
        .attr('x', xScale(mean)).attr('y', -8)
        .text('mean = ' + mean.toFixed(1))
        .transition().duration(TRANS).attr('opacity', 0.7);

      legendG.transition().duration(TRANS).attr('opacity', 1);
    }, 400);
  }

  // ── Phase Navigation ────────────────────────────────────────────────

  function updateUI(phase) {
    dots.forEach(function (d, i) {
      d.className = 'bi-dot' + (i === phase ? ' active' : i < phase ? ' done' : '');
    });
    document.getElementById('bi-phase-label').textContent = PHASE_INFO[phase].label;
    document.getElementById('bi-caption').innerHTML = PHASE_INFO[phase].caption;
    document.getElementById('bi-replay').style.display = PHASE_INFO[phase].animated ? '' : 'none';
    document.getElementById('bi-next').style.display = phase < PHASE_INFO.length - 1 ? '' : 'none';
  }

  function goToPhase(phase) {
    clearTimers();
    currentPhase = phase;
    updateUI(phase);

    switch (PHASE_INFO[phase].id) {
      case 'prior':
        showPrior();
        break;

      case 'data':
        showData(0);
        subTimers.push(setTimeout(function () { showData(1); }, 2200));
        subTimers.push(setTimeout(function () { showData(2); }, 4400));
        break;

      case 'ci':
        showCI(0);
        subTimers.push(setTimeout(function () { showCI(1); }, 2000));
        subTimers.push(setTimeout(function () { showCI(2); }, 4000));
        subTimers.push(setTimeout(function () { showCI(3); }, 6000));
        break;

      case 'mean':
        showMeanCompare();
        break;
    }
  }

  goToPhase(0);
})();
