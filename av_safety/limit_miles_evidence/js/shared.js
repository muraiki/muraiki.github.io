/**
 * shared.js — Bayesian math utilities, prior presets, D3 helpers
 * Must be loaded before all widget scripts.
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

/* ── Bayesian Utilities ────────────────────────────────────────────── */

/**
 * Single Bayesian update.
 * @param {number} prior        - P(H) before evidence
 * @param {number} likelihoodIfTrue  - P(E | H)
 * @param {number} likelihoodIfFalse - P(E | ¬H)
 * @returns {number} posterior P(H | E)
 */
function bayesUpdate(prior, likelihoodIfTrue, likelihoodIfFalse) {
  const numerator = likelihoodIfTrue * prior;
  const denominator = numerator + likelihoodIfFalse * (1 - prior);
  if (denominator === 0) return prior;
  return numerator / denominator;
}

/**
 * Run a sequence of Bayesian updates, returning the full posterior trace.
 * @param {number} prior
 * @param {Array<{likelihoodIfTrue: number, likelihoodIfFalse: number}>} evidenceArray
 * @returns {number[]} array of posteriors (length = evidenceArray.length + 1, starting with prior)
 */
function runUpdateSequence(prior, evidenceArray) {
  const trace = [prior];
  let current = prior;
  for (const ev of evidenceArray) {
    current = bayesUpdate(current, ev.likelihoodIfTrue, ev.likelihoodIfFalse);
    trace.push(current);
  }
  return trace;
}

/**
 * Prior presets per widget.
 * Each widget key maps to { optimistic: number, skeptical: number }.
 */
const PRIOR_PRESETS = {
  widget1: { optimistic: 0.7, skeptical: 0.3 },
  widget2: { optimistic: 0.75, skeptical: 0.35 },
  widget3: { optimistic: 0.75, skeptical: 0.25 },
  widget4: { optimistic: 0.80, skeptical: 0.30 },
  widget5: { optimistic: 0.75, skeptical: 0.25 },
  widget6: { optimistic: 0.85, skeptical: 0.50 },
};

/* ── Prior Toggle Component ────────────────────────────────────────── */

/**
 * Render a two-button toggle ("Skeptical" / "Optimistic") into a container.
 * Default selection: Optimistic.
 * @param {string} containerId  - DOM id of the widget container
 * @param {string} widgetKey    - key into PRIOR_PRESETS (e.g. "widget1")
 * @param {function} onChangeCallback - called with the selected preset value
 * @param {{optimistic: string, skeptical: string}} [tooltips] - optional hover text
 * @returns {{ getSelected: () => string }} control object
 */
function makePriorToggle(containerId, widgetKey, onChangeCallback, tooltips, descriptions) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  const wrapper = document.createElement('div');
  wrapper.className = 'prior-toggle';

  const presets = PRIOR_PRESETS[widgetKey];
  let selected = 'optimistic';

  let descEl = null;
  if (descriptions) {
    descEl = document.createElement('div');
    descEl.className = 'prior-description';
    const heading = container.querySelector('h3');
    if (heading && heading.nextSibling) {
      container.insertBefore(descEl, heading.nextSibling);
    } else {
      container.appendChild(descEl);
    }
  }

  function render() {
    wrapper.innerHTML = '';
    ['optimistic', 'skeptical'].forEach(key => {
      const btn = document.createElement('button');
      btn.textContent = key === 'optimistic' ? 'Optimistic' : 'Skeptical';
      btn.className = 'prior-toggle-btn' + (selected === key ? ' active' : '');
      if (tooltips && tooltips[key]) {
        btn.title = tooltips[key];
      }
      btn.addEventListener('click', () => {
        selected = key;
        render();
        onChangeCallback(presets[key], key);
      });
      wrapper.appendChild(btn);
    });
    if (descEl && descriptions) {
      const label = selected === 'optimistic' ? 'Optimistic' : 'Skeptical';
      descEl.textContent = label + ' prior: ' + descriptions[selected];
    }
  }

  render();
  container.insertBefore(wrapper, container.firstChild);

  // Fire initial callback
  onChangeCallback(presets[selected], selected);

  return {
    getSelected: () => selected,
    getValue: () => presets[selected],
  };
}

/* ── D3 Helpers ────────────────────────────────────────────────────── */

/**
 * Create a responsive SVG inside a container with proper margins.
 * @param {string} containerId
 * @param {{top: number, right: number, bottom: number, left: number}} margins
 * @param {number} [aspectRatio=0.5] - height / width ratio
 * @returns {{svg: d3.Selection, g: d3.Selection, width: number, height: number, container: Element}}
 */
function makeResponsiveSVG(containerId, margins, aspectRatio) {
  aspectRatio = aspectRatio || 0.5;
  const container = document.getElementById(containerId);
  if (!container) return null;

  const containerWidth = container.clientWidth || 700;
  const totalHeight = containerWidth * aspectRatio;
  const width = containerWidth - margins.left - margins.right;
  const height = totalHeight - margins.top - margins.bottom;

  const svg = d3.select('#' + containerId)
    .append('svg')
    .attr('viewBox', '0 0 ' + containerWidth + ' ' + totalHeight)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .style('width', '100%')
    .style('height', 'auto');

  const g = svg.append('g')
    .attr('transform', 'translate(' + margins.left + ',' + margins.top + ')');

  return { svg: svg, g: g, width: width, height: height, container: container };
}

/**
 * Smoothly transition a line path to new data.
 * @param {d3.Selection} selection - the path selection
 * @param {string} newD - new path d attribute value
 * @param {number} duration - ms
 */
function animateLineUpdate(selection, newD, duration) {
  selection.transition().duration(duration || 500).attr('d', newD);
}

/**
 * Create a tooltip object attached to the given SVG's parent.
 * @param {d3.Selection} svg
 * @returns {{show: function(x,y,html), hide: function}}
 */
function makeTooltip(svg) {
  const parentNode = svg.node().parentNode;
  const tip = d3.select(parentNode)
    .append('div')
    .attr('class', 'widget-tooltip')
    .style('opacity', 0)
    .style('position', 'absolute')
    .style('pointer-events', 'none');

  return {
    show: function (x, y, html) {
      tip.html(html)
        .style('left', x + 'px')
        .style('top', y + 'px')
        .transition().duration(150).style('opacity', 1);
    },
    hide: function () {
      tip.transition().duration(150).style('opacity', 0);
    }
  };
}

/**
 * Draw a standard posterior curve line.
 * @param {d3.Selection} g - group to append to
 * @param {Array<{x: number, y: number}>} data
 * @param {d3.Scale} xScale
 * @param {d3.Scale} yScale
 * @param {string} color
 * @param {string} [cssClass]
 * @returns {d3.Selection} the path selection
 */
function posteriorCurve(g, data, xScale, yScale, color, cssClass) {
  const line = d3.line()
    .x(function (d) { return xScale(d.x); })
    .y(function (d) { return yScale(d.y); });

  return g.append('path')
    .datum(data)
    .attr('class', cssClass || 'posterior-line')
    .attr('fill', 'none')
    .attr('stroke', color)
    .attr('stroke-width', 2)
    .attr('d', line);
}

/* ── Gamma Distribution Utilities (jStat wrappers) ────────────────── */
// Our convention: beta is a RATE parameter (mean = alpha/beta).
// jStat uses SCALE (= 1/rate), so we convert.

function logGamma(x) {
  if (x <= 0) return Infinity;
  return jStat.gammaln(x);
}

function gammaPDF(x, alpha, beta) {
  if (x <= 0 || alpha <= 0 || beta <= 0) return 0;
  return jStat.gamma.pdf(x, alpha, 1 / beta);
}

function gammaCDF(x, alpha, beta) {
  if (x <= 0) return 0;
  return jStat.gamma.cdf(x, alpha, 1 / beta);
}

function gammaQuantile(p, alpha, beta) {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  return jStat.gamma.inv(p, alpha, 1 / beta);
}

/* ── Seeded PRNG ──────────────────────────────────────────────────── */
// Adapted from https://github.com/bryc/code/blob/master/jshash/PRNGs.md#mulberry32
// In public domain

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ── Density & Overlap Helpers ────────────────────────────────────── */

function computeDensity(alpha, beta, xMin, xMax, nPts) {
  var pts = [];
  for (var i = 0; i <= nPts; i++) {
    var x = xMin + (i / nPts) * (xMax - xMin);
    pts.push({ x: x, y: gammaPDF(x, alpha, beta) });
  }
  return pts;
}

function checkCIOverlap(intervals) {
  var nonOverlapping = 0;
  var totalPairs = 0;
  for (var a = 0; a < intervals.length; a++) {
    for (var b = a + 1; b < intervals.length; b++) {
      totalPairs++;
      if (intervals[a].hi < intervals[b].lo || intervals[b].hi < intervals[a].lo) {
        nonOverlapping++;
      }
    }
  }
  return { nonOverlapping: nonOverlapping, totalPairs: totalPairs };
}

/* ── Color Palette ─────────────────────────────────────────────────── */

const COLORS = {
  accent: '#4A7BF7',       // posterior traces, primary blue
  accentLight: '#93B4FF',   // secondary / faded traces
  incident: '#E05252',      // red
  fixClaimed: '#4CAF50',    // green
  aggregateReport: '#4A7BF7', // blue
  inactive: '#BDBDBD',     // gray
  background: '#F5F5F5',
  gridLine: '#E0E0E0',
  text: '#333333',
  textSecondary: '#666666',
};
