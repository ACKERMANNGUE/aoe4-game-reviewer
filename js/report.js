// js/report.js
// Renders the in-app analysis report: Markdown + interactive Chart.js charts.
// Requires Chart.js and marked.js loaded via CDN (window.Chart, window.marked).

import { escHtml, getCivFlag } from './utils.js';
import { PLAYER_COLORS } from './config.js';

let _charts = [];
let _chartConfigs = [];

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export function openReport(gameJSON, markdownText) {
  destroyCharts();
  const view = document.getElementById('report-view');
  view.innerHTML = buildHTML(gameJSON);
  view.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Build name -> iconUrl lookup from timeline for entity icon replacement
  const iconMap = buildIconMap(gameJSON.timeline);

  // Render markdown (fallback to <pre> if marked not loaded)
  const mdEl = document.getElementById('rp-md');
  if (mdEl) {
    if (window.marked) {
      let html = window.marked.parse(markdownText);
      // Replace {{unit:Name}}, {{building:Name}}, {{tech:Name}}, {{age:Name}} with game icons
      html = html.replace(/\{\{(unit|building|tech|age):([.\w\s''\u2019(),-]+?)\}\}/gi, (match, typePrefix, name) => {
        const key  = name.toLowerCase().trim();
        const attr = name.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        const text = name.replace(/&/g, '&amp;');
        const url  = iconMap[key]; // scraped from build order HTML via timeline
        if (url) {
          return `<img src="${url}" class="entity-icon-inline" alt="${attr}" title="${attr}" `
            + `onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'entity-badge',title:this.alt,textContent:this.alt}))">` ;
        }
        return `<span class="entity-badge" title="${attr}">${text}</span>`;
      });
      // Replace {{civ_key}} tokens with inline flag images
      html = html.replace(/\{\{([a-z_]+)\}\}/g, (_, key) => {
        const flagPath = getCivFlag(key);
        return flagPath
          ? `<img src="${flagPath}" class="civ-flag-inline" alt="${key}" title="${key}">`
          : `{{${key}}}`;
      });
      mdEl.innerHTML = html;
    } else {
      mdEl.innerHTML = `<pre>${escHtml(markdownText)}</pre>`;
    }
  }

  document.getElementById('rp-close').addEventListener('click', closeReport);
  document.getElementById('rp-save-pdf').addEventListener('click', () => {
    document.body.classList.add('printing-report');
    window.print();
    // Clean up after the print dialog closes
    window.addEventListener('afterprint', () => {
      document.body.classList.remove('printing-report');
    }, { once: true });
  });
  document.getElementById('rp-save-html').addEventListener('click', () => exportHTML(gameJSON));

  // Render charts after a tick so canvas dimensions are computed
  requestAnimationFrame(() => renderCharts(gameJSON));
}

export function closeReport() {
  destroyCharts();
  const view = document.getElementById('report-view');
  view.classList.add('hidden');
  view.innerHTML = '';
  document.body.style.overflow = '';
}

// ─────────────────────────────────────────────
// HTML export
// ─────────────────────────────────────────────

/** Fetch an image URL and return it as a base64 data URI. */
async function imgToDataUri(src) {
  const resp = await fetch(src);
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function exportHTML(gameJSON) {
  const btn = document.getElementById('rp-save-html');
  const origText = btn.textContent;
  btn.textContent = 'Building…';
  btn.disabled = true;

  try {
    // 1. Clone the report body – canvases stay empty, Chart.js will fill them
    const body = document.querySelector('#report-view .rp-body');
    const clone = body.cloneNode(true);

    // 1b. Inline flag images as base64 so the export is fully self-contained
    const flagImgs = [...clone.querySelectorAll('img.civ-flag, img.civ-flag-inline, img.entity-icon-inline')];
    const uniqueSrcs = [...new Set(flagImgs.map(img => img.src))];
    const dataUriMap = {};
    await Promise.all(uniqueSrcs.map(async (src) => {
      try { dataUriMap[src] = await imgToDataUri(src); } catch (_) { /* best-effort */ }
    }));
    flagImgs.forEach(img => { if (dataUriMap[img.src]) img.src = dataUriMap[img.src]; });

    // 2. Snapshot the active theme variables from :root so the exported file
    //    keeps the exact colours the user had at export time.
    const THEME_VARS = [
      '--bg', '--bg-card', '--bg-card-hover', '--bg-modal',
      '--border', '--border-light',
      '--gold', '--gold-dark',
      '--red', '--red-light', '--green', '--green-light', '--blue',
      '--text', '--text-muted', '--text-bright',
      '--radius',
    ];
    const rootStyle = getComputedStyle(document.documentElement);
    const themeOverride = ':root {\n' +
      THEME_VARS.map(v => `  ${v}: ${rootStyle.getPropertyValue(v).trim()};`).join('\n') +
      '\n}';

    // 3. Fetch and inline the stylesheet
    let css = '';
    try {
      const resp = await fetch('css/style.css');
      css = await resp.text();
    } catch (_) { /* best-effort */ }

    // 4. Serialize chart configs.
    //    Function values are preserved as tagged strings so they can be revived
    //    in the exported document (callbacks, tick formatters, etc.).
    const FUNC_TAG = '__FN__:';
    const chartDataJSON = JSON.stringify(_chartConfigs, (_k, v) => {
      if (typeof v === 'function') return FUNC_TAG + v.toString();
      return v;
    // Escape </ so the embedded JSON cannot accidentally close the <script> tag.
    }).replace(/</g, '\\u003c');

    // 5. Build the match title
    const { match } = gameJSON;
    const title = `AOE4 Report \u2013 Game #${match.game_id} \u2013 ${match.map}`;

    // 5. Assemble self-contained interactive HTML
    const html = [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="UTF-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
      `  <title>${escHtml(title)}</title>`,
      '  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"><\/script>',
      '  <style>',
      css,
      themeOverride,
      '/* Standalone export overrides */',
      'body { padding: 0 !important; }',
      '#report-view { position: static !important; overflow: visible !important; height: auto !important; display: flex !important; flex-direction: column; }',
      '.rp-toolbar { display: none !important; }',
      '  </style>',
      '</head>',
      '<body>',
      '<div id="report-view">',
      `  <div class="rp-body">${clone.innerHTML}</div>`,
      '</div>',
      '<script>',
      '(function () {',
      `  var FUNC_TAG = ${JSON.stringify(FUNC_TAG)};`,
      '  function revive(v) {',
      '    if (typeof v === "string" && v.indexOf(FUNC_TAG) === 0) {',
      '      try { return new Function("return (" + v.slice(FUNC_TAG.length) + ")")(); } catch(e) { return undefined; }',
      '    }',
      '    if (Array.isArray(v)) return v.map(revive);',
      '    if (v && typeof v === "object") {',
      '      var out = {};',
      '      Object.keys(v).forEach(function(k) { out[k] = revive(v[k]); });',
      '      return out;',
      '    }',
      '    return v;',
      '  }',
      `  var charts = revive(${chartDataJSON});`,
      '  charts.forEach(function(entry) {',
      '    var el = document.getElementById(entry.id);',
      '    if (el && window.Chart) new window.Chart(el, entry.cfg);',
      '  });',
      '})();',
      '<\/script>',
      '</body>',
      '</html>',
    ].join('\n');

    // 6. Trigger download
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `aoe4-report-game-${match.game_id}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } finally {
    btn.textContent = origText;
    btn.disabled = false;
  }
}

function destroyCharts() {
  _charts.forEach(c => { try { c.destroy(); } catch (_) {} });
  _charts = [];
  _chartConfigs = [];
}

// ─────────────────────────────────────────────
// HTML scaffolding
// ─────────────────────────────────────────────

function buildHTML(gameJSON) {
  const { match } = gameJSON;
  const hasEco = !!gameJSON.economy_snapshots;
  const hasMil = !!gameJSON.military_snapshots;
  const hasSta = !!gameJSON.statistics;
  const hasAgeEvents = !!gameJSON.timeline?.some(e => e.type === 'age');
  const hasTl  = !!gameJSON.timeline?.some(e => e.type === 'unit_produced' || e.type === 'building_completed');
  const allPlayers = getExtendedPlayers(gameJSON);

  const legendHTML = allPlayers.map(p => {
    const flag    = getCivFlag(p.civilization);
    const civHtml = flag
      ? `<img src="${flag}" class="civ-flag" alt="${escHtml(p.civilization_display)}" title="${escHtml(p.civilization_display)}">`
      : `<span class="rp-badge-civ">${escHtml(p.civilization_display)}</span>`;
    return `<span class="rp-badge" style="--pc:${p.color}">
      <span class="rp-dot" style="background:${p.color}"></span>
      <strong>${escHtml(p.name)}</strong>
      ${civHtml}
      ${p.is_you ? '<span class="rp-you-tag">You</span>' : ''}
    </span>`;
  }).join('');

  // ── Row 1: Economy + Military (2 cols) ──
  const row1 = [
    hasEco ? `<div class="rp-chart-card">
      <div class="rp-chart-label">Economy overview - total resources per player</div>
      <canvas id="rp-eco-all"></canvas>
    </div>` : '',
    hasMil ? `<div class="rp-chart-card">
      <div class="rp-chart-label">Military strength - total units per player</div>
      <canvas id="rp-mil-all"></canvas>
    </div>` : '',
  ].filter(Boolean).join('');

  // ── Row 2: Age-up timeline + Scores radar (2 cols) ──
  const row2 = [
    hasAgeEvents ? `<div class="rp-chart-card">
      <div class="rp-chart-label">Age-up timeline</div>
      <canvas id="rp-age-timeline"></canvas>
    </div>` : '',
    hasSta ? `<div class="rp-chart-card">
      <div class="rp-chart-label">End-game scores</div>
      <canvas id="rp-scores-radar"></canvas>
    </div>` : '',
  ].filter(Boolean).join('');

  // ── Row 3: Unit stats - full width ──
  const row3 = hasSta ? `<div class="rp-chart-card">
    <div class="rp-chart-label">Unit stats - produced / killed / lost</div>
    <canvas id="rp-unit-stats"></canvas>
  </div>` : '';

  // ── Row 4: APM - full width ──
  const row4 = hasSta ? `<div class="rp-chart-card">
    <div class="rp-chart-label">APM - actions per minute</div>
    <canvas id="rp-apm"></canvas>
  </div>` : '';

  // Wrap each row in its grid container only when the row has content
  const rowHTML1 = row1 ? `<div class="rp-charts-row rp-overview">${row1}</div>` : '';
  const rowHTML2 = row2 ? `<div class="rp-charts-row">${row2}</div>` : '';
  const rowHTML3 = row3 ? `<div class="rp-charts-row">${row3}</div>` : '';
  const rowHTML4 = row4 ? `<div class="rp-charts-row">${row4}</div>` : '';

  const perPlayerHTML = allPlayers.map(p => {
    const cards = [
      hasEco ? `<div class="rp-chart-card">
        <div class="rp-chart-label">Economy (food / gold / stone / wood)</div>
        <canvas id="rp-eco-${p.profile_id}"></canvas>
      </div>` : '',
      hasMil ? `<div class="rp-chart-card">
        <div class="rp-chart-label">Military composition</div>
        <canvas id="rp-mil-${p.profile_id}"></canvas>
      </div>` : '',
      hasTl ? `<div class="rp-chart-card">
        <div class="rp-chart-label">Military production</div>
        <canvas id="rp-mil-prod-${p.profile_id}"></canvas>
      </div>` : '',
      hasTl ? `<div class="rp-chart-card">
        <div class="rp-chart-label">Building production</div>
        <canvas id="rp-bld-prod-${p.profile_id}"></canvas>
      </div>` : '',
    ].filter(Boolean).join('');

    if (!cards) return '';
    const civFlag = getCivFlag(p.civilization);
    const civHtml = civFlag
      ? `<img src="${civFlag}" class="civ-flag" alt="${escHtml(p.civilization_display)}" title="${escHtml(p.civilization_display)}">`
      : `<span class="rp-badge-civ">${escHtml(p.civilization_display)}</span>`;
    return `
      <div class="rp-player-block">
        <div class="rp-player-header">
          <span class="rp-dot" style="background:${p.color}"></span>
          <strong>${escHtml(p.name)}</strong>
          ${civHtml}
          ${p.is_you ? '<span class="rp-you-tag">You</span>' : ''}
        </div>
        <div class="rp-charts-row">${cards}</div>
      </div>`;
  }).join('');

  return `
    <div class="rp-toolbar">
      <button class="rp-close-btn" id="rp-close">Back</button>
      <div class="rp-title-block">
        <span class="rp-game-id">Game #${match.game_id}</span>
        <span class="rp-meta">${escHtml(match.map)} - ${match.duration_display} - Patch ${match.patch} - ${escHtml(match.server)}</span>
      </div>
      <button class="rp-save-btn" id="rp-save-pdf">Save to PDF</button>
      <button class="rp-save-btn rp-save-html-btn" id="rp-save-html">Save HTML</button>
    </div>

    <div class="rp-body">
      ${hasEco || hasMil || hasSta || hasAgeEvents ? `
      <section class="rp-section">
        <div class="rp-legend">${legendHTML}</div>
        ${rowHTML1}
        ${rowHTML2}
        ${rowHTML3}
        ${rowHTML4}
        ${perPlayerHTML}
      </section>` : ''}

      <section class="rp-section rp-md-section">
        <div class="rp-md" id="rp-md"></div>
      </section>
    </div>`;
}

// ─────────────────────────────────────────────
// Chart helpers
// ─────────────────────────────────────────────

function mkChart(id, cfg) {
  const el = document.getElementById(id);
  if (!el || !window.Chart) return;
  _chartConfigs.push({ id, cfg });
  const c = new window.Chart(el, cfg);
  _charts.push(c);
}

/**
 * Build a name → iconUrl map from the timeline for entity icon replacement in markdown.
 * Keys are lowercased entity names; values are absolute image URLs scraped from the build order page.
 */
function buildIconMap(timeline) {
  const map = {};
  for (const event of (timeline || [])) {
    if (event.name && event.iconUrl) {
      const key = event.name.toLowerCase();
      if (!map[key]) map[key] = event.iconUrl;
    }
  }
  return map;
}

/**
 * Returns all players including any AI/extra players found in snapshots
 * that are not represented in the teams array (e.g. AI opponents in custom games).
 */
function getExtendedPlayers(gameJSON) {
  const basePlayers = gameJSON.teams.flatMap(t => t.players);
  const existingNames = new Set(basePlayers.map(p => p.name));

  const extraNames = new Set();
  for (const src of [gameJSON.economy_snapshots, gameJSON.military_snapshots, gameJSON.statistics]) {
    if (!src) continue;
    for (const entry of Object.values(src)) {
      if (entry?.name && !existingNames.has(entry.name)) {
        extraNames.add(entry.name);
      }
    }
  }

  const syntheticPlayers = [...extraNames].map((name, i) => ({
    profile_id:           `ai_${name.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
    name,
    is_you:               false,
    color:                PLAYER_COLORS[basePlayers.length + i] ?? '#888888',
    civilization:         null,
    civilization_display: 'AI',
    rating:               null,
    mmr:                  null,
  }));

  return [...basePlayers, ...syntheticPlayers];
}

/** Find the snapshot key whose .name matches the player's name. */
function snapshotKey(snapshots, player) {
  if (!snapshots) return null;
  return Object.keys(snapshots).find(k => snapshots[k]?.name === player.name) ?? null;
}

function timeLabel(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const BASE_OPTS = {
  responsive: true,
  maintainAspectRatio: true,
  aspectRatio: 2.4,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { labels: { color: '#aaa', boxWidth: 12, padding: 10, font: { size: 11 } } },
    tooltip: { backgroundColor: '#1a1a1a', borderColor: '#333', borderWidth: 1 },
  },
  scales: {
    x: { ticks: { color: '#666', maxTicksLimit: 12, font: { size: 10 } }, grid: { color: '#1e1e1e' } },
    y: { ticks: { color: '#666', font: { size: 10 } }, grid: { color: '#1e1e1e' }, beginAtZero: true },
  },
};

// Palette for unit types in stacked bar charts
const UNIT_COLORS = [
  '#e53935','#1e88e5','#43a047','#fb8c00','#8e24aa',
  '#00acc1','#f4511e','#6d4c41','#c0ca33','#00897b',
  '#d81b60','#3949ab','#039be5','#00b0ff','#ff6f00',
];

// ─────────────────────────────────────────────
// Chart rendering
// ─────────────────────────────────────────────

function renderCharts(gameJSON) {
  const allPlayers = getExtendedPlayers(gameJSON);
  const eco = gameJSON.economy_snapshots;
  const mil = gameJSON.military_snapshots;

  // ── Overview: economy (total resources, all players) ──
  if (eco) {
    const firstKey = snapshotKey(eco, allPlayers[0]);
    const labels   = firstKey ? eco[firstKey].timestamps.map(timeLabel) : [];
    const datasets = allPlayers.flatMap(p => {
      const k = snapshotKey(eco, p);
      if (!k) return [];
      const s = eco[k];
      return [{
        label: p.name,
        data: s.timestamps.map((_, i) => s.food[i] + s.gold[i] + s.stone[i] + s.wood[i]),
        borderColor: p.color,
        backgroundColor: p.color + '18',
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.35,
        fill: false,
      }];
    });
    mkChart('rp-eco-all', { type: 'line', data: { labels, datasets }, options: BASE_OPTS });
  }

  // ── Overview: military (total units, all players) ──
  if (mil) {
    const firstKey = snapshotKey(mil, allPlayers[0]);
    const labels   = firstKey ? mil[firstKey].snapshots.map(s => timeLabel(s.time)) : [];
    const datasets = allPlayers.flatMap(p => {
      const k = snapshotKey(mil, p);
      if (!k) return [];
      return [{
        label: p.name,
        data: mil[k].snapshots.map(s => s.total),
        borderColor: p.color,
        backgroundColor: p.color + '18',
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.35,
        fill: false,
      }];
    });
    mkChart('rp-mil-all', { type: 'line', data: { labels, datasets }, options: BASE_OPTS });
  }

  // ── Per-player charts ──
  allPlayers.forEach(p => {
    // Economy breakdown: food / gold / stone / wood
    if (eco) {
      const k = snapshotKey(eco, p);
      if (k) {
        const s = eco[k];
        const labels = s.timestamps.map(timeLabel);
        mkChart(`rp-eco-${p.profile_id}`, {
          type: 'line',
          data: {
            labels,
            datasets: [
              { label: 'Food',  data: s.food,  borderColor: '#e91e8c', backgroundColor: '#e91e8c18', borderWidth: 2, pointRadius: 0, tension: 0.35, fill: false },
              { label: 'Gold',  data: s.gold,  borderColor: '#f9a825', backgroundColor: '#f9a82518', borderWidth: 2, pointRadius: 0, tension: 0.35, fill: false },
              { label: 'Stone', data: s.stone, borderColor: '#9e9e9e', backgroundColor: '#9e9e9e18', borderWidth: 2, pointRadius: 0, tension: 0.35, fill: false },
              { label: 'Wood',  data: s.wood,  borderColor: '#a1662f', backgroundColor: '#a1662f18', borderWidth: 2, pointRadius: 0, tension: 0.35, fill: false },
            ],
          },
          options: BASE_OPTS,
        });
      }
    }

    // Military composition: stacked bar per unit type (villagers separate)
    if (mil) {
      const k = snapshotKey(mil, p);
      if (k) {
        const snaps  = mil[k].snapshots;
        const labels = snaps.map(s => timeLabel(s.time));

        // Collect all non-Villager, non-Scout unit types
        const unitTypes = [];
        snaps.forEach(s => {
          Object.keys(s.units).forEach(u => {
            if (u !== 'Villager' && u !== 'Scout' && !unitTypes.includes(u)) unitTypes.push(u);
          });
        });

        const datasets = unitTypes.map((ut, i) => ({
          label: ut,
          data: snaps.map(s => s.units[ut] ?? 0),
          backgroundColor: UNIT_COLORS[i % UNIT_COLORS.length] + 'bb',
          borderColor:     UNIT_COLORS[i % UNIT_COLORS.length],
          borderWidth: 1,
          stack: 'military',
        }));

        // Add villager line (separate axis-less line for context)
        datasets.unshift({
          label: 'Villager',
          data: snaps.map(s => s.units.Villager ?? 0),
          backgroundColor: '#ffffff08',
          borderColor: '#ffffff25',
          borderWidth: 1,
          stack: 'villagers',
          type: 'bar',
        });

        const milOpts = {
          ...BASE_OPTS,
          scales: {
            ...BASE_OPTS.scales,
            x: { ...BASE_OPTS.scales.x, stacked: true },
            y: { ...BASE_OPTS.scales.y, stacked: false },
          },
        };

        mkChart(`rp-mil-${p.profile_id}`, {
          type: 'bar',
          data: { labels, datasets },
          options: milOpts,
        });
      }
    }
  });

  // ── Stats overview: APM, end-game scores, age-up timeline ──
  renderAPMChart(gameJSON, allPlayers);
  renderScoresRadar(gameJSON, allPlayers);
  renderUnitStats(gameJSON, allPlayers);
  renderAgeTimeline(gameJSON, allPlayers);
  renderPlayerPieCharts(gameJSON, allPlayers);
}

// ─────────────────────────────────────────────
// APM comparison
// ─────────────────────────────────────────────

function renderAPMChart(gameJSON, allPlayers) {
  if (!document.getElementById('rp-apm')) return;
  const sta = gameJSON.statistics;
  if (!sta) return;

  const validPlayers = allPlayers.filter(p => {
    const k = snapshotKey(sta, p);
    return k && sta[k]?.apm != null;
  });
  if (!validPlayers.length) return;

  mkChart('rp-apm', {
    type: 'bar',
    data: {
      labels: validPlayers.map(p => p.name),
      datasets: [{
        label: 'APM',
        data: validPlayers.map(p => sta[snapshotKey(sta, p)].apm),
        backgroundColor: validPlayers.map(p => p.color + 'bb'),
        borderColor: validPlayers.map(p => p.color),
        borderWidth: 2,
        borderRadius: 4,
        clip: false,
        barThickness: 50,
      }],
    },
    options: {
      ...BASE_OPTS,
      aspectRatio: 2,
      layout: { padding: { left: 50, right: 50 } },
      scales: {
        ...BASE_OPTS.scales,
        x: { ...BASE_OPTS.scales.x, offset: true },
      },
      plugins: {
        ...BASE_OPTS.plugins,
        legend: { display: false },
        tooltip: {
          ...BASE_OPTS.plugins.tooltip,
          callbacks: { label: ctx => `${ctx.parsed.y} APM` },
        },
      },
    },
  });
}

// ─────────────────────────────────────────────
// End-game scores radar
// ─────────────────────────────────────────────

function renderScoresRadar(gameJSON, allPlayers) {
  if (!document.getElementById('rp-scores-radar')) return;
  const sta = gameJSON.statistics;
  if (!sta) return;

  const validPlayers = allPlayers.filter(p => {
    const k = snapshotKey(sta, p);
    return k && sta[k]?.scores;
  });
  if (!validPlayers.length) return;

  const axes = ['Military', 'Economy', 'Technology', 'Society'];
  const datasets = validPlayers.map(p => {
    const s = sta[snapshotKey(sta, p)].scores;
    return {
      label: p.name,
      data: [s.military ?? 0, s.economy ?? 0, s.technology ?? 0, s.society ?? 0],
      borderColor: p.color,
      backgroundColor: p.color + '28',
      borderWidth: 2,
      pointBackgroundColor: p.color,
      pointRadius: 3,
    };
  });

  mkChart('rp-scores-radar', {
    type: 'radar',
    data: { labels: axes, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.5,
      plugins: {
        legend: { labels: { color: '#aaa', font: { size: 11 } } },
        tooltip: { backgroundColor: '#1a1a1a', borderColor: '#333', borderWidth: 1 },
      },
      scales: {
        r: {
          ticks: { color: '#555', font: { size: 9 }, backdropColor: 'transparent' },
          grid: { color: '#2a2a2a' },
          pointLabels: { color: '#999', font: { size: 11 } },
          angleLines: { color: '#2a2a2a' },
          beginAtZero: true,
        },
      },
    },
  });
}

// ─────────────────────────────────────────────
// Unit stats (produced / killed / lost)
// ─────────────────────────────────────────────

function renderUnitStats(gameJSON, allPlayers) {
  if (!document.getElementById('rp-unit-stats')) return;
  const sta = gameJSON.statistics;
  if (!sta) return;

  const validPlayers = allPlayers.filter(p => {
    const k = snapshotKey(sta, p);
    return k && sta[k]?.units_produced != null;
  });
  if (!validPlayers.length) return;

  const METRICS = [
    { key: 'units_produced', label: 'Produced', color: '#43a047' },
    { key: 'units_killed',   label: 'Killed',   color: '#e53935' },
    { key: 'units_lost',     label: 'Lost',     color: '#757575' },
  ];

  const datasets = METRICS.map(({ key, label, color }) => {
    const values = validPlayers.map(p => sta[snapshotKey(sta, p)][key] ?? 0);
    if (values.every(v => !v)) return null;
    return {
      label,
      data: values,
      backgroundColor: color + 'bb',
      borderColor: color,
      borderWidth: 2,
      borderRadius: 3,
      clip: false,
      barThickness: 30,
    };
  }).filter(Boolean);
  if (!datasets.length) return;

  mkChart('rp-unit-stats', {
    type: 'bar',
    data: { labels: validPlayers.map(p => p.name), datasets },
    options: {
      ...BASE_OPTS,
      aspectRatio: 2,
      layout: { padding: { left: 50, right: 50 } },
      scales: {
        ...BASE_OPTS.scales,
        x: { ...BASE_OPTS.scales.x, offset: true },
      },
    },
  });
}

// ─────────────────────────────────────────────
// Age-up timeline
// ─────────────────────────────────────────────

function renderAgeTimeline(gameJSON, allPlayers) {
  if (!document.getElementById('rp-age-timeline')) return;
  const tl = gameJSON.timeline;
  if (!tl?.length) return;

  const AGE_LABELS = ['Feudal Age', 'Castle Age', 'Imperial Age'];
  const gameDurMin = (gameJSON.match.duration_seconds ?? 0) / 60;

  const labelToPlayer = label => {
    if (label === 'player')   return allPlayers.find(p => p.is_you) ?? allPlayers[0];
    if (label === 'teammate') return gameJSON.teams[0]?.players.find(p => !p.is_you) ?? null;
    return allPlayers.find(p => p.name === label) ?? null;
  };

  // Group age events per player label
  const agesByLabel = {};
  tl.filter(e => e.type === 'age').forEach(e => {
    if (!agesByLabel[e.player]) agesByLabel[e.player] = [];
    agesByLabel[e.player].push(e);
  });
  if (!Object.keys(agesByLabel).length) return;

  const fmtMin = v => {
    const m = Math.floor(v);
    const s = Math.round((v - m) * 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // Pre-build tooltip metadata: exact time + landmark name per player per age
  const KNOWN_AGE_NAMES = new Set(['Feudal Age', 'Castle Age', 'Imperial Age']);
  const tooltipMeta = {}; // playerName -> [{ timeStr, landmark }|null, ...]

  // One dataset per player - floating bars, full-height within their category slot
  const datasets = Object.entries(agesByLabel).map(([label, events]) => {
    const player = labelToPlayer(label);
    if (!player) return null;
    const sorted = [...events].sort((a, b) => a.time - b.time);

    const ttData = [];
    const data = AGE_LABELS.map((ageName, i) => {
      const hit = sorted.find(e => e.name === ageName) ?? sorted[i] ?? null;
      if (!hit) { ttData.push(null); return null; }
      const t = hit.time / 60;
      // Resolve landmark name
      let landmark = null;
      if (!KNOWN_AGE_NAMES.has(hit.name)) {
        // Parser B: event name is already the landmark
        landmark = hit.name;
      } else {
        // Parser A: find the closest building_completed event for this player
        const nearby = tl
          .filter(e => e.player === label && e.type === 'building_completed' && Math.abs(e.time - hit.time) <= 15)
          .sort((a, b) => Math.abs(a.time - hit.time) - Math.abs(b.time - hit.time));
        if (nearby.length) landmark = nearby[0].name;
      }
      ttData.push({ timeStr: fmtMin(t), landmark });
      return [Math.max(0, t - 0.3), t + 0.3];
    });
    tooltipMeta[player.name] = ttData;

    return {
      label: player.name,
      data,
      backgroundColor: player.color + 'cc',
      borderColor: player.color,
      borderWidth: 1,
      barPercentage: 1.0,
      categoryPercentage: 1.0,
    };
  }).filter(Boolean);

  if (!datasets.length) return;

  mkChart('rp-age-timeline', {
    type: 'bar',
    data: { labels: AGE_LABELS, datasets, tooltipMeta },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.3,
      interaction: { mode: 'nearest', intersect: true },
      plugins: {
        legend: { labels: { color: '#aaa', boxWidth: 12, padding: 10, font: { size: 11 } } },
        tooltip: {
          backgroundColor: '#1a1a1a',
          borderColor: '#333',
          borderWidth: 1,
          callbacks: {
            label: ctx => {
              const val = ctx.raw;
              if (!Array.isArray(val)) return '';
              const meta = ctx.chart.data.tooltipMeta?.[ctx.dataset.label]?.[ctx.dataIndex];
              if (!meta) {
                const mid = (val[0] + val[1]) / 2;
                const m = Math.floor(mid), s = Math.round((mid - m) * 60);
                return `${ctx.dataset.label}: ${m}:${String(s).padStart(2, '0')}`;
              }
              return `${ctx.dataset.label}: ${meta.timeStr}${meta.landmark ? ` - ${meta.landmark}` : ''}`;
            },
          },
        },
      },
      scales: {
        x: {
          min: 0,
          max: gameDurMin || 30,
          ticks: { color: '#666', font: { size: 10 }, maxTicksLimit: 12, callback: v => { const m = Math.floor(v); return `${m}:${String(Math.round((v - m) * 60)).padStart(2, '0')}`; } },
          grid: { color: '#1e1e1e' },
          title: { display: true, text: 'minutes', color: '#555', font: { size: 10 } },
        },
        y: {
          ticks: { color: '#aaa', font: { size: 11 } },
          grid: { color: '#1e1e1e' },
        },
      },
    },
  });
}

// ─────────────────────────────────────────────
// Per-player pie charts (military + building production)
// ─────────────────────────────────────────────

/** Return the timeline label used for a given player. */
function timelineLabelForPlayer(player, gameJSON) {
  if (player.is_you) return 'player';
  const team0 = gameJSON.teams[0]?.players ?? [];
  if (team0.some(p => String(p.profile_id) === String(player.profile_id))) return 'teammate';
  return player.name;
}

function renderPlayerPieCharts(gameJSON, allPlayers) {
  const tl = gameJSON.timeline;
  if (!tl?.length) return;

  allPlayers.forEach(p => {
    const label = timelineLabelForPlayer(p, gameJSON);
    renderPieChart(`rp-mil-prod-${p.profile_id}`, tl, label, 'unit_produced');
    renderPieChart(`rp-bld-prod-${p.profile_id}`, tl, label, 'building_completed');
  });
}

function renderPieChart(canvasId, tl, playerLabel, eventType) {
  if (!document.getElementById(canvasId)) return;

  // Aggregate counts by entity name, exclude pure-econ units
  // Normalise names: strip trailing tier/variant digit (e.g. "Yumi Ashigaru 2" -> "Yumi Ashigaru")
  const SKIP = new Set(['Villager', 'Scout']);
  const counts = {};
  tl.filter(e => e.player === playerLabel && e.type === eventType && !SKIP.has(e.name))
    .forEach(e => {
      const normName = e.name.replace(/\s+\d+$/, '').trim();
      counts[normName] = (counts[normName] ?? 0) + (e.count || 1);
    });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 14);
  if (!sorted.length) return;

  const labels = sorted.map(([name]) => name);
  const data   = sorted.map(([, n]) => n);
  const total  = data.reduce((s, v) => s + v, 0);
  const colors = UNIT_COLORS.slice(0, labels.length);

  mkChart(canvasId, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.map(c => c + 'cc'),
        borderColor:     colors,
        borderWidth: 1,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.6,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#aaa', boxWidth: 10, font: { size: 9 }, padding: 5 },
        },
        tooltip: {
          backgroundColor: '#1a1a1a',
          borderColor: '#333',
          borderWidth: 1,
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((s, v) => s + v, 0);
              const pct = Math.round(ctx.parsed / total * 100);
              return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}
