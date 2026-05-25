/**
 * Widget 1 — Statistical Demonstration Calculator (Gamma-Poisson model)
 *
 * Uses a Gamma prior on the AV fatality rate λ, updated via Poisson
 * likelihood (conjugate model). Shows the full posterior distribution
 * narrowing as miles accumulate, with a credible interval band.
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
  var MOUNT = 'widget-1';
  if (!document.getElementById(MOUNT)) return;

  var HUMAN_RATE = 1.06 / 100000000; // fatalities per mile (US Jan–Sep 2025: 1.06 per 100M VMT, NHTSA)
  var DEFAULT_FLEET_PACE = 4000000 * 52; // Waymo early 2026 ~4M miles/week

  // Prior presets: Gamma(alpha, beta) on the AV fatality rate λ.
  // Mean = alpha/beta. We set priors so the mean reflects the assumed rate
  // and the shape controls how confident the prior is.
  //
  // Optimistic: believes AV rate is about half the human rate, moderate confidence
  // Skeptical: believes AV rate is close to human rate, diffuse
  var GAMMA_PRESETS = {
    optimistic: {
      alpha: 2.0,
      beta: 2.0 / (HUMAN_RATE * 0.5), // mean = 0.5 * human rate
      label: 'Optimistic',
      description: 'Prior centered at half the human fatality rate',
    },
    skeptical: {
      alpha: 1.5,
      beta: 1.5 / (HUMAN_RATE * 0.9), // mean = 0.9 * human rate
      label: 'Skeptical',
      description: 'Prior centered near the human fatality rate',
    },
  };

  var state = {
    priorMode: 'optimistic',
    prior: GAMMA_PRESETS.optimistic,
    cumulativeMiles: 170e6,
    credibleLevel: 0.99,
    fleetPace: DEFAULT_FLEET_PACE,
  };

  // Build controls
  var container = document.getElementById(MOUNT);
  var heading = container.querySelector('h3');

  var controlDiv = document.createElement('div');
  controlDiv.innerHTML =
    '<div class="widget-controls" style="flex-direction: column;">' +
      '<div class="control-group" style="flex: none; width: 100%;">' +
        '<label>Human baseline fatality rate</label>' +
        '<div class="read-only-label">1.06 deaths per 100 million miles ' +
          '(<a href="https://www.nhtsa.gov/press-releases/nhtsa-reports-sharp-drop-traffic-fatalities-first-half-2025" target="_blank" rel="noopener">NHTSA Jan–Sep 2025 estimate</a>)' +
          '<br><em style="font-size:0.9em; color:#999;">Spans the larger ODD of all US driving conditions and includes impaired drivers; comparison favors AVs</em></div>' +
      '</div>' +
      '<div style="display: flex; flex-wrap: wrap; gap: 16px;">' +
        '<div class="control-group">' +
          '<label>Cumulative miles driven (zero incidents)</label>' +
          '<input type="range" id="w1-miles" min="0" max="1000" step="10" value="170">' +
          '<div class="control-value" id="w1-miles-val">170 million miles</div>' +
        '</div>' +
        '<div class="control-group">' +
          '<label>Credible interval level</label>' +
          '<input type="range" id="w1-credible" min="0.95" max="0.999" step="0.001" value="0.99">' +
          '<div class="control-value" id="w1-credible-val">99%</div>' +
        '</div>' +
        '<div class="control-group">' +
          '<label>Fleet pace (millions of miles/year)</label>' +
          '<input type="range" id="w1-fleet-pace" min="52" max="416" step="4" value="208">' +
          '<div class="control-value" id="w1-fleet-pace-val">208 M mi/yr</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="widget-output" id="w1-output"></div>' +
    '<div id="w1-chart"></div>' +
    '<div id="w1-legend" style="font-family: -apple-system, sans-serif; font-size: 0.8em; color: #666; margin-top: 4px; display: flex; gap: 16px; flex-wrap: wrap;"></div>';

  if (heading && heading.nextSibling) {
    container.insertBefore(controlDiv, heading.nextSibling);
  } else {
    container.appendChild(controlDiv);
  }

  // Wire sliders
  document.getElementById('w1-miles').addEventListener('input', function () {
    // Slider value is in millions of miles
    state.cumulativeMiles = parseFloat(this.value) * 1e6;
    document.getElementById('w1-miles-val').textContent = formatBigMiles(state.cumulativeMiles);
    update();
  });

  document.getElementById('w1-credible').addEventListener('input', function () {
    state.credibleLevel = parseFloat(this.value);
    document.getElementById('w1-credible-val').textContent = formatPct(state.credibleLevel);
    update();
  });

  document.getElementById('w1-fleet-pace').addEventListener('input', function () {
    state.fleetPace = parseFloat(this.value) * 1e6;
    document.getElementById('w1-fleet-pace-val').textContent = Math.round(state.fleetPace / 1e6) + ' M mi/yr';
    update();
  });

  // Chart setup
  var margins = { top: 20, right: 30, bottom: 50, left: 65 };
  var chart = makeResponsiveSVG('w1-chart', margins, 0.5);
  if (!chart) return;

  // X axis: fatality rate (per 100M miles for readability)
  var xScale = d3.scaleLinear().range([0, chart.width]);
  var yScale = d3.scaleLinear().range([chart.height, 0]);

  var xAxisG = chart.g.append('g').attr('class', 'axis')
    .attr('transform', 'translate(0,' + chart.height + ')');
  var yAxisG = chart.g.append('g').attr('class', 'axis');

  chart.g.append('text')
    .attr('x', chart.width / 2).attr('y', chart.height + 42)
    .attr('text-anchor', 'middle')
    .style('font-size', '12px').style('fill', '#666')
    .text('Fatality rate (per 100 million miles)');

  chart.g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -chart.height / 2).attr('y', -50)
    .attr('text-anchor', 'middle')
    .style('font-size', '12px').style('fill', '#666')
    .text('Probability density');

  // Human baseline reference line
  var humanLine = chart.g.append('line')
    .attr('stroke', COLORS.incident)
    .attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '6,4');

  var humanLabel = chart.g.append('text')
    .style('font-size', '10px')
    .style('fill', COLORS.incident)
    .attr('text-anchor', 'start');

  // Credible interval band
  var credibleBand = chart.g.append('path')
    .attr('fill', COLORS.accent)
    .attr('opacity', 0.15);

  // Posterior density line
  var posteriorPath = chart.g.append('path')
    .attr('fill', 'none')
    .attr('stroke', COLORS.accent)
    .attr('stroke-width', 2.5);

  // Prior density line (faded)
  var priorPath = chart.g.append('path')
    .attr('fill', 'none')
    .attr('stroke', COLORS.accentLight)
    .attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '1,5')
    .attr('stroke-linecap', 'round');

  // CI bound lines
  var ciLowLine = chart.g.append('line')
    .attr('stroke', COLORS.accent).attr('stroke-width', 1).attr('stroke-dasharray', '3,3');
  var ciHighLine = chart.g.append('line')
    .attr('stroke', COLORS.accent).attr('stroke-width', 1).attr('stroke-dasharray', '3,3');

  function update() {
    var prior = state.prior;
    // Gamma-Poisson update: observe k=0 events in N miles
    // Posterior: Gamma(alpha + k, beta + N) = Gamma(alpha, beta + N)
    var postAlpha = prior.alpha;  // k = 0
    var postBeta = prior.beta + state.cumulativeMiles;

    // Compute display range for x-axis (in raw rate, but label as per 100M miles)
    // Show enough to see both prior and posterior, plus human baseline
    var priorMean = prior.alpha / prior.beta;
    var postMean = postAlpha / postBeta;
    var xMaxRate = Math.max(HUMAN_RATE * 3, priorMean * 4);
    // Make sure we can see the posterior even when it's very narrow
    var postUpper = gammaQuantile(0.999, postAlpha, postBeta);
    xMaxRate = Math.max(xMaxRate, postUpper * 1.5);
    xMaxRate = Math.min(xMaxRate, HUMAN_RATE * 6); // cap for sanity

    var SCALE = 1e8; // display as "per 100M miles"
    xScale.domain([0, xMaxRate * SCALE]);

    // Compute densities
    var nPoints = 200;
    var priorData = [];
    var postData = [];
    var yMax = 0;

    for (var i = 0; i <= nPoints; i++) {
      var rateScaled = (i / nPoints) * xMaxRate * SCALE;
      var rate = rateScaled / SCALE;

      var pPrior = gammaPDF(rate, prior.alpha, prior.beta) / SCALE;
      var pPost = gammaPDF(rate, postAlpha, postBeta) / SCALE;

      priorData.push({ x: rateScaled, y: pPrior });
      postData.push({ x: rateScaled, y: pPost });

      yMax = Math.max(yMax, pPrior, pPost);
    }

    yScale.domain([0, yMax * 1.1]);

    // Axes
    xAxisG.transition().duration(300).call(
      d3.axisBottom(xScale).ticks(6).tickFormat(function (d) { return d.toFixed(1); })
    );
    yAxisG.transition().duration(300).call(
      d3.axisLeft(yScale).ticks(5).tickFormat(d3.format('.1e'))
    );

    // Line generators
    var line = d3.line()
      .x(function (d) { return xScale(d.x); })
      .y(function (d) { return yScale(d.y); });

    var area = d3.area()
      .x(function (d) { return xScale(d.x); })
      .y0(chart.height)
      .y1(function (d) { return yScale(d.y); });

    // Prior line
    priorPath.datum(priorData).transition().duration(300).attr('d', line);

    // Posterior line
    posteriorPath.datum(postData).transition().duration(300).attr('d', line);

    // Credible interval
    var tail = (1 - state.credibleLevel) / 2;
    var ciLow = gammaQuantile(tail, postAlpha, postBeta);
    var ciHigh = gammaQuantile(1 - tail, postAlpha, postBeta);

    // Band data: filter postData to CI range
    var bandData = postData.filter(function (d) {
      var rate = d.x / SCALE;
      return rate >= ciLow && rate <= ciHigh;
    });
    // Add boundary points at zero density
    if (bandData.length > 0) {
      bandData = [{ x: bandData[0].x, y: 0 }].concat(bandData).concat([{ x: bandData[bandData.length - 1].x, y: 0 }]);
    }

    credibleBand.datum(bandData).transition().duration(300).attr('d', area);

    // CI bound lines
    ciLowLine
      .attr('x1', xScale(ciLow * SCALE)).attr('x2', xScale(ciLow * SCALE))
      .attr('y1', 0).attr('y2', chart.height);
    ciHighLine
      .attr('x1', xScale(ciHigh * SCALE)).attr('x2', xScale(ciHigh * SCALE))
      .attr('y1', 0).attr('y2', chart.height);

    // Human baseline reference
    humanLine
      .attr('x1', xScale(HUMAN_RATE * SCALE)).attr('x2', xScale(HUMAN_RATE * SCALE))
      .attr('y1', 0).attr('y2', chart.height);
    humanLabel
      .attr('x', xScale(HUMAN_RATE * SCALE) + 4).attr('y', 14)
      .text('Human baseline (1.06)');

    // Outputs
    var probBelowHuman = gammaCDF(HUMAN_RATE, postAlpha, postBeta);
    var yearsAtPace = state.cumulativeMiles / state.fleetPace;

    document.getElementById('w1-output').innerHTML =
      '<div class="output-stat">' +
        '<div class="big-number">' + formatPosteriorPct(probBelowHuman) + '</div>' +
        '<div class="stat-label">probability that AV rate &lt; human rate</div>' +
      '</div>' +
      '<div class="output-stat">' +
        '<div class="big-number">' + (postMean * 1e8).toFixed(2) + '</div>' +
        '<div class="stat-label">posterior average rate (per 100M mi)</div>' +
      '</div>' +
      '<div class="output-stat">' +
        '<div class="big-number">' + (ciLow * 1e8).toFixed(2) + ' \u2013 ' + (ciHigh * 1e8).toFixed(2) + '</div>' +
        '<div class="stat-label">' + formatPct(state.credibleLevel) + ' credible interval (per 100M mi)</div>' +
      '</div>' +
      (state.cumulativeMiles > 0 ?
        '<div class="output-stat">' +
          '<div class="big-number">' + formatYears(yearsAtPace) + '</div>' +
          '<div class="stat-label">required years at ' + Math.round(state.fleetPace / 1e6) + 'M mi/yr fleet pace</div>' +
        '</div>' : '');

    // Legend
    document.getElementById('w1-legend').innerHTML =
      '<span><svg width="20" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke="' + COLORS.accentLight + '" stroke-width="1.5" stroke-dasharray="1,5" stroke-linecap="round"/></svg> Prior distribution</span>' +
      '<span><svg width="20" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke="' + COLORS.accent + '" stroke-width="2.5"/></svg> Posterior distribution</span>' +
      '<span><svg width="20" height="10"><rect x="0" y="0" width="20" height="10" fill="' + COLORS.accent + '" opacity="0.15"/></svg> ' + formatPct(state.credibleLevel) + ' credible interval</span>' +
      '<span><svg width="20" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke="' + COLORS.incident + '" stroke-width="1.5" stroke-dasharray="6,4"/></svg> Human baseline</span>';
  }

  function formatPosteriorPct(p) {
    var pct = p * 100;
    if (pct < 99) return pct.toFixed(1) + '%';
    // Adaptive precision for a cleaner display
    // Add decimals to avoid ever misleadingly rounding to 100%
    // 99.1% → 99.9% → 99.97% → 99.998% → 99.9997%
    for (var d = 1; d <= 6; d++) {
      var s = pct.toFixed(d);
      if (parseFloat(s) < 100) return s + '%';
    }
    return '99.999999%';
  }

  function formatPct(v) {
    var p = v * 100;
    // Show one decimal if needed (e.g. 99.9%), otherwise whole number
    return (p % 1 === 0) ? p.toFixed(0) + '%' : p.toFixed(1) + '%';
  }

  function formatBigMiles(m) {
    if (m === 0) return '0 miles';
    if (m >= 1e12) return (m / 1e12).toFixed(1) + ' trillion miles';
    if (m >= 1e9) return (m / 1e9).toFixed(1) + ' billion miles';
    if (m >= 1e6) return (m / 1e6).toFixed(0) + ' million miles';
    return m.toLocaleString() + ' miles';
  }

  function formatYears(y) {
    if (y === 0) return '0';
    if (y >= 1000) return Math.round(y).toLocaleString();
    if (y >= 10) return Math.round(y).toString();
    return y.toFixed(1);
  }

  // Prior toggle
  makePriorToggle(MOUNT, 'widget1', function (val, mode) {
    state.priorMode = mode;
    state.prior = GAMMA_PRESETS[mode];
    update();
  }, {
    optimistic: 'Prior belief: AV fatality rate is about half the human rate. Gives the technology the benefit of the doubt.',
    skeptical: 'Prior belief: AV fatality rate is close to the human rate. Requires stronger evidence to be convinced.',
  }, {
    optimistic: 'believes AV rate is about half the human rate, moderate confidence',
    skeptical: 'believes AV rate is close to the human rate, low confidence',
  });

  update();
})();
