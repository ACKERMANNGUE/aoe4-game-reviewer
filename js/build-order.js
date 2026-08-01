import { PROXIES } from './config.js';

// ─────────────────────────────────────────────
// Page fetch
// ─────────────────────────────────────────────

/**
 * Fetches the AoE4World game summary page and extracts the
 * hidden /summary?camelize=true JSON API URL from the
 * <build-order url="..."> Vue component attribute.
 *
 * Returns { html, source, summaryUrl } or null.
 */
export async function fetchSummaryHTML(profileId, gameId) {
  const pageUrl = `https://aoe4world.com/players/${profileId}/games/${gameId}`;

  const timedFetch = (url, ms) => {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(tid));
  };

  const isValidPage = (html) => html.length > 10000 && html.includes('aoe4world');

  const parseSummaryUrl = (html) => {
    const m = html.match(/<build-order[^>]*\burl="([^"]+)"/);
    if (!m) return null;
    const rel = m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'");
    return rel.startsWith('http') ? rel : `https://aoe4world.com${rel}`;
  };

  // 1. Direct fetch (usually blocked by CORS)
  try {
    const res = await timedFetch(pageUrl, 6000);
    if (res.ok) {
      const html = await res.text();
      if (isValidPage(html)) return { html, source: 'direct', summaryUrl: parseSummaryUrl(html), profileId, gameId };
    }
  } catch (_) {}

  // 2. Via CORS proxies
  for (const proxy of PROXIES) {
    try {
      const res = await timedFetch(proxy + encodeURIComponent(pageUrl), 14000);
      if (!res.ok) continue;
      const html = await res.text();
      if (isValidPage(html)) return { html, source: 'proxy', summaryUrl: parseSummaryUrl(html), profileId, gameId };
    } catch (_) {}
  }

  return null;
}

// ─────────────────────────────────────────────
// Build order extraction (three-step waterfall)
// ─────────────────────────────────────────────

/**
 * Extract the build-order timeline from a fetchSummaryHTML() result.
 *
 * Strategy (in order of reliability):
 *   A) Fetch the /summary?camelize=true JSON endpoint
 *      -> data.players[i].buildOrder (confirmed real-world structure)
 *      -> also extracts economy + military snapshots from the same payload
 *   B) Parse SSR HTML with AoE4World's exact CSS class structure
 *   C) Generic <img src> based parsing (legacy fallback)
 *
 * Returns { timeline, method, economySnapshots, militarySnapshots }.
 */
export async function extractBuildOrder(result, playerName, oppName, apiKey = '', sig = '') {
  const { html } = result;

  // Effective summary URL: from page HTML, or constructed directly from profileId/gameId
  // The constructed fallback is essential for private/custom games where the proxy
  // receives a page without the <build-order> Vue component (client-side only).
  const baseSummaryUrl = result.summaryUrl
    ?? (result.profileId && result.gameId
      ? `https://aoe4world.com/players/${result.profileId}/games/${result.gameId}/summary?camelize=true`
      : null);

  /** Append api_key and/or sig to any URL. */
  const withKey = (url) => {
    const params = [];
    if (apiKey) params.push(`api_key=${encodeURIComponent(apiKey)}`);
    if (sig)    params.push(`sig=${encodeURIComponent(sig)}`);
    if (!params.length) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}${params.join('&')}`;
  };

  // ── A. JSON summary endpoint ──
  if (baseSummaryUrl) {
    const summaryUrl = withKey(baseSummaryUrl);

    // Try local server proxy first - avoids CORS limits and forwards api_key/sig server-side.
    // Two URL formats tried:
    //   1. /api/  → proxied to https://aoe4world.com/api/v0/...  (api_key supported)
    //   2. /web-proxy/ → proxied to https://aoe4world.com/...    (sig supported)
    if (result.profileId && result.gameId && (apiKey || sig)) {
      const relPath  = `/players/${result.profileId}/games/${result.gameId}/summary?camelize=true`;
      const localUrls = [
        `/api${withKey(relPath)}`,
        `/web-proxy${withKey(relPath)}`,
      ];
      for (const localUrl of localUrls) {
        console.log('[build-order] local proxy attempt:', localUrl);
        try {
          const r = await fetch(localUrl);
          console.log('[build-order] local proxy response:', r.status, localUrl);
          if (r.ok) {
            let data;
            try { data = JSON.parse(await r.text()); } catch (_) {
              console.log('[build-order] local proxy 200 but not JSON');
              data = null;
            }
            if (data) {
              console.log('[build-order] local proxy JSON OK, players:', data.players?.length, 'keys:', Object.keys(data).join(', '));
              const tl = extractTimelineFromSummaryJSON(data, playerName, oppName);
              if (tl && tl.length > 0) {
                // Enrich with actual CDN URLs extracted from the HTML page
                const _hmap = extractIconMapFromHTML(html);
                for (const ev of tl) { if (ev.name && _hmap[ev.name.toLowerCase()]) ev.iconUrl = _hmap[ev.name.toLowerCase()]; }
                return {
                  timeline:          tl,
                  method:            'summary-json',
                  economySnapshots:  extractEconomySnapshots(data, playerName, oppName),
                  militarySnapshots: extractMilitarySnapshots(data, playerName, oppName),
                  statistics:        extractStatistics(data, playerName, oppName),
                };
              }
              console.log('[build-order] local proxy: data OK but no timeline events');
            } else {
              console.log('[build-order] local proxy: response not valid JSON');
            }
          }
        } catch (e) {
          console.log('[build-order] local proxy error:', e.message, localUrl);
        }
      }
    }

    // Fall back to external CORS proxies
    for (const proxy of PROXIES) {
      try {
        const ctrl = new AbortController();
        const tid  = setTimeout(() => ctrl.abort(), 12000);
        const fullUrl = proxy + encodeURIComponent(summaryUrl);
        console.log('[build-order] CORS proxy attempt:', fullUrl);
        const res  = await fetch(fullUrl, { signal: ctrl.signal });
        clearTimeout(tid);
        console.log('[build-order] CORS proxy response:', res.status, proxy);
        if (!res.ok) continue;
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch (_) {
          console.log('[build-order] CORS proxy 200 but not JSON (first 200 chars):', text.slice(0, 200));
          continue;
        }
        if (!data?.players) {
          console.log('[build-order] CORS proxy JSON OK but no players field. Keys:', Object.keys(data).join(', '));
          continue;
        }
        const tl = extractTimelineFromSummaryJSON(data, playerName, oppName);
        if (tl && tl.length > 0) {
          // Enrich with actual CDN URLs extracted from the HTML page
          const _hmap = extractIconMapFromHTML(html);
          for (const ev of tl) { if (ev.name && _hmap[ev.name.toLowerCase()]) ev.iconUrl = _hmap[ev.name.toLowerCase()]; }
          return {
            timeline:          tl,
            method:            'summary-json',
            economySnapshots:  extractEconomySnapshots(data, playerName, oppName),
            militarySnapshots: extractMilitarySnapshots(data, playerName, oppName),
            statistics:        extractStatistics(data, playerName, oppName),
          };
        }
      } catch (_) {}
    }
  }

  // ── B. CSS-class based HTML parser ──
  const tl2 = parseAoE4WorldBuildOrderHTML(html, playerName, oppName);
  if (tl2.length > 0) return { timeline: tl2, method: 'html-css-classes', economySnapshots: null, militarySnapshots: null, statistics: null };

  // ── C. Generic img-src fallback ──
  const tl3 = parseImagesFromHTML(html, playerName, oppName);
  if (tl3.length > 0) return { timeline: tl3, method: 'img-ssr', economySnapshots: null, militarySnapshots: null, statistics: null };

  return { timeline: [], method: 'none', economySnapshots: null, militarySnapshots: null, statistics: null };
}

// ─────────────────────────────────────────────
// Economy snapshots
// ─────────────────────────────────────────────

/**
 * Extract economy snapshots from the summary JSON.
 * Downsamples the 20s resource series to 60s intervals for readability.
 *
 * Returns { player: { name, timestamps, food, gold, stone, wood },
 *           opponent: { ... } }  or null.
 */
function extractEconomySnapshots(data, playerName, oppName) {
  if (!data?.players) return null;
  const out = {};

  const me = data.players.find(p => (p.name ?? '').toLowerCase().includes(playerName.toLowerCase()));
  const myTeamNum = me?.team ?? null;

  for (const player of data.players) {
    const isMe     = (player.name ?? '').toLowerCase().includes(playerName.toLowerCase());
    const isMyTeam = myTeamNum !== null && player.team === myTeamNum;
    const label    = isMe ? 'player' : (isMyTeam ? 'teammate' : (player.name ?? 'opponent'));
    const res = player.resources;
    if (!res?.timestamps?.length) continue;

    // Keep every 3rd sample: 20s -> 60s resolution
    const indices = [];
    for (let i = 0; i < res.timestamps.length; i += 3) indices.push(i);
    const pick = arr => indices.map(i => arr?.[i] ?? 0);

    out[label] = {
      name:       player.name,
      timestamps: pick(res.timestamps),
      food:       pick(res.food),
      gold:       pick(res.gold),
      stone:      pick(res.stone),
      wood:       pick(res.wood),
    };
  }

  return Object.keys(out).length >= 2 ? out : null;
}

// ─────────────────────────────────────────────
// Military snapshots
// ─────────────────────────────────────────────

/**
 * Compute army composition snapshots at 60s intervals.
 *
 * For each unit type, living count at time T =
 *   count(finished ≤ T) − count(destroyed ≤ T)
 *
 * Returns { player: { name, snapshots: [{ time, total, units }] },
 *           opponent: { ... } }  or null.
 */
function extractMilitarySnapshots(data, playerName, oppName) {
  if (!data?.players) return null;
  const duration = data.duration || 0;

  const ticks = [];
  for (let t = 0; t <= duration; t += 60) ticks.push(t);

  const out = {};

  const me = data.players.find(p => (p.name ?? '').toLowerCase().includes(playerName.toLowerCase()));
  const myTeamNum = me?.team ?? null;

  for (const player of data.players) {
    const isMe     = (player.name ?? '').toLowerCase().includes(playerName.toLowerCase());
    const isMyTeam = myTeamNum !== null && player.team === myTeamNum;
    const label    = isMe ? 'player' : (isMyTeam ? 'teammate' : (player.name ?? 'opponent'));
    const buildOrder = player.buildOrder;
    if (!Array.isArray(buildOrder)) continue;

    const unitItems = buildOrder.filter(item => item.type === 'Unit');

    const snapshots = ticks.map(t => {
      const units = {};
      let total = 0;
      for (const item of unitItems) {
        const name = iconToName(item.icon || '');
        if (!name) continue;
        const alive = (item.finished  || []).filter(ts => ts <= t).length
                    - (item.destroyed || []).filter(ts => ts <= t).length;
        if (alive > 0) {
          units[name] = alive;
          total += alive;
        }
      }
      return total > 0 ? { time: t, total, units } : { time: t, total: 0 };
    });

    out[label] = { name: player.name, snapshots };
  }

  return Object.keys(out).length >= 2 ? out : null;
}

// ─────────────────────────────────────────────
// Match statistics
// ─────────────────────────────────────────────

/**
 * Extract end-of-match statistics from the summary JSON.
 * Sources: player._stats, player.scores, player.totalResourcesGathered,
 *          player.totalResourcesSpent, player.apm.
 *
 * Returns { player: { ... }, opponent: { ... } } or null.
 */
function extractStatistics(data, playerName, oppName) {
  if (!data?.players) return null;
  const out = {};

  const me = data.players.find(p => (p.name ?? '').toLowerCase().includes(playerName.toLowerCase()));
  const myTeamNum = me?.team ?? null;

  for (const player of data.players) {
    const isMe     = (player.name ?? '').toLowerCase().includes(playerName.toLowerCase());
    const isMyTeam = myTeamNum !== null && player.team === myTeamNum;
    const label    = isMe ? 'player' : (isMyTeam ? 'teammate' : (player.name ?? 'opponent'));
    const s  = player._stats ?? {};
    const rg = player.totalResourcesGathered ?? {};
    const rs = player.totalResourcesSpent    ?? {};

    out[label] = {
      name:                player.name,
      apm:                 player.apm ?? null,
      units_produced:      s.unitprod  ?? null,
      units_lost:          s.sqlost    ?? null,
      units_killed:        s.sqkill    ?? null,
      buildings_built:     s.bprod     ?? null,
      buildings_lost:      s.blost     ?? null,
      upgrades_researched: s.upg       ?? null,
      total_commands:      s.totalcmds ?? null,
      scores: player.scores
        ? {
            total:      player.scores.total      ?? null,
            military:   player.scores.military    ?? null,
            economy:    player.scores.economy     ?? null,
            technology: player.scores.technology  ?? null,
            society:    player.scores.society     ?? null,
          }
        : null,
      resources_gathered: {
        food: rg.food ?? 0, gold: rg.gold ?? 0,
        stone: rg.stone ?? 0, wood: rg.wood ?? 0,
        total: rg.total ?? 0,
      },
      resources_spent: {
        food: rs.food ?? 0, gold: rs.gold ?? 0,
        stone: rs.stone ?? 0, wood: rs.wood ?? 0,
        total: rs.total ?? 0,
      },
    };
  }

  return Object.keys(out).length >= 2 ? out : null;
}

// ─────────────────────────────────────────────
// Parser A: summary JSON (data.players[i].buildOrder)
// ─────────────────────────────────────────────

/**
 * The /summary?camelize=true endpoint returns:
 *   { players: [{ name, buildOrder: [{ icon, type, finished[], constructed[], ... }], ... }] }
 *
 * Each buildOrder item represents one entity KIND.
 * The timestamp arrays hold one entry per in-game instance/event:
 *   - Units, Upgrades, Ages : use `finished`
 *   - Buildings             : use `constructed`
 */
function extractTimelineFromSummaryJSON(data, playerName, oppName) {
  if (!data?.players || !Array.isArray(data.players)) return null;

  // Find the searched player's team number for correct teammate labeling
  const me = data.players.find(p => (p.name ?? '').toLowerCase().includes(playerName.toLowerCase()));
  const myTeamNum = me?.team ?? null;

  const timeline = [];

  for (const player of data.players) {
    const isMe     = (player.name ?? '').toLowerCase().includes(playerName.toLowerCase());
    const isMyTeam = myTeamNum !== null && player.team === myTeamNum;
    // 'player' = you, 'teammate' = same team, player name = opponent(s)
    const label = isMe ? 'player' : (isMyTeam ? 'teammate' : (player.name ?? 'opponent'));

    const buildOrder = player.buildOrder;
    if (!Array.isArray(buildOrder)) continue;

    for (const item of buildOrder) {
      const name = iconToName(item.icon || '');
      if (!name) continue;

      const iconUrl = iconPathToUrl(item.icon);

      const rawType = item.type || '';
      let type;
      let timestamps;

      switch (rawType) {
        case 'Unit':
          type = 'unit_produced';
          timestamps = item.finished || [];
          break;
        case 'Building':
          type = 'building_completed';
          // Buildings use 'constructed' (placement); fall back to 'finished'
          timestamps = (item.constructed?.length ? item.constructed : item.finished) || [];
          break;
        case 'Upgrade':
        case 'Technology':
          type = 'technology_researched';
          timestamps = item.finished || [];
          break;
        case 'Age':
          type = 'age';
          timestamps = item.finished || [];
          break;
        case 'Animal':
          type = 'animal';
          timestamps = item.finished || [];
          break;
        default:
          type = rawType.toLowerCase().replace(/\s+/g, '_') || 'event';
          timestamps = item.finished || item.constructed || [];
      }

      for (const ts of timestamps) {
        if (typeof ts === 'number') {
          timeline.push({ time: ts, player: label, type, name, count: 1, ...(iconUrl ? { iconUrl } : {}) });
        }
      }
    }
  }

  return timeline.length > 0 ? timeline.sort((a, b) => a.time - b.time) : null;
}

// ─────────────────────────────────────────────
// Parser B: CSS-class based HTML parser
// ─────────────────────────────────────────────

/**
 * AoE4World SSR-renders the build order inside a <build-order> custom element.
 * Two-column CSS grid: column 1 = first player, column 2 = second player.
 * Rows 1-2 = headers/stats; rows 3+ = per-minute event groups.
 *
 * Each event row: div.flex.p-1.rounded.items-center.bg-item-{type}
 *   span.opacity-70          -> "MM:SS" timestamp
 *   span.font-bold.flex-auto -> entity name
 *   span.text-base.mx-2      -> optional "× N" count
 */
function parseAoE4WorldBuildOrderHTML(html, playerName, oppName) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const timeline = [];

  const buildOrderEl = doc.querySelector('build-order');
  if (!buildOrderEl) return [];

  const allDivs = [...buildOrderEl.querySelectorAll('div[style*="grid-area"]')];

  // Determine which column belongs to the searched player
  let playerCol = 1;
  for (const div of allDivs) {
    const gm = (div.getAttribute('style') || '').match(/grid-area:\s*1\s*\/\s*(\d+)/);
    if (!gm) continue;
    const h1 = div.querySelector('h1');
    if (h1 && h1.textContent.trim() === playerName.trim()) {
      playerCol = parseInt(gm[1]);
      break;
    }
  }

  for (const div of allDivs) {
    const gm = (div.getAttribute('style') || '').match(/grid-area:\s*(\d+)\s*\/\s*(\d+)/);
    if (!gm) continue;
    const row = parseInt(gm[1]);
    const col = parseInt(gm[2]);
    if (row < 3) continue; // skip header and stats rows

    const label = col === playerCol ? 'player' : 'opponent';

    for (const er of div.querySelectorAll('div.flex.p-1.rounded.items-center')) {
      // Type from CSS class
      let type;
      if      (er.classList.contains('bg-item-unit'))        type = 'unit_produced';
      else if (er.classList.contains('bg-item-building'))     type = 'building_completed';
      else if (er.classList.contains('bg-item-technology'))   type = 'technology_researched';
      else if (er.classList.contains('bg-item-upgrade'))      type = 'technology_researched';
      else if (er.classList.contains('bg-item-age'))          type = 'age';
      else if (er.classList.contains('bg-item-animal'))       type = 'animal';
      else continue;

      // Timestamp from span.opacity-70
      const timeText = er.querySelector('span.opacity-70')?.textContent?.trim() || '';
      const tm = timeText.match(/(\d{1,2}):(\d{2})/);
      const timeSeconds = tm ? parseInt(tm[1]) * 60 + parseInt(tm[2]) : 0;

      // Get icon image element (used for both URL and name fallback)
      const iconImg = er.querySelector('img[src*="data.aoe4world.com/images"]');
      const iconUrl = iconImg ? (iconImg.getAttribute('src') || null) : null;

      // Name from span.flex-auto, fallback to img src slug
      let name = er.querySelector('span.flex-auto')?.textContent?.trim() || '';
      if (!name && iconImg) {
        const slug = (iconImg.getAttribute('src') || '').split('/').pop()
          .replace(/\.[^.]+$/, '').replace(/-\d+$/, '');
        name = iconToName(slug.replace(/-/g, '_'));
      }
      if (!name) continue;

      // Count from span.text-base (optional "× N")
      const cm = er.querySelector('span.text-base')?.textContent?.match(/×\s*(\d+)/);
      const count = cm ? parseInt(cm[1]) : 1;

      timeline.push({ time: timeSeconds, player: label, type, name, count, ...(iconUrl ? { iconUrl } : {}) });
    }
  }

  return timeline.sort((a, b) => a.time - b.time);
}

// ─────────────────────────────────────────────
// Parser C: generic img-src fallback
// ─────────────────────────────────────────────

function parseImagesFromHTML(html, playerName, opponentName) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const timeline = [];

  const imgs = [...doc.querySelectorAll('img[src*="data.aoe4world.com/images"]')]
    .filter(img => /\/(units|buildings|technologies|upgrades)\//.test(img.getAttribute('src') || ''));

  if (!imgs.length) return [];

  const bodyHtml = doc.body.innerHTML;
  const safeName = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

  let p1Pos = bodyHtml.indexOf(safeName(playerName));
  let p2Pos = bodyHtml.indexOf(safeName(opponentName));
  if (p1Pos === -1) p1Pos = bodyHtml.indexOf(playerName);
  if (p2Pos === -1) p2Pos = bodyHtml.indexOf(opponentName);

  let splitIndex = Math.floor(imgs.length / 2);
  if (p1Pos !== -1 && p2Pos !== -1) {
    const secondPlayerPos = Math.max(p1Pos, p2Pos);
    const countBefore = (bodyHtml.substring(0, secondPlayerPos).match(/data\.aoe4world\.com\/images\//g) || []).length;
    if (countBefore > 0 && countBefore < imgs.length) splitIndex = countBefore;
  }

  const firstIsPlayer = p1Pos <= p2Pos;
  const labels = firstIsPlayer ? ['player', 'opponent'] : ['opponent', 'player'];

  const extractEvents = (imgSlice, label) => {
    let lastTime = 0;
    for (const img of imgSlice) {
      const src = img.getAttribute('src') || '';
      let type;
      if      (/\/units\//.test(src))         type = 'unit_produced';
      else if (/\/buildings\//.test(src))      type = 'building_completed';
      else if (/\/technologies\//.test(src))   type = 'technology_researched';
      else if (/\/upgrades\//.test(src))       type = 'technology_researched';
      else continue;

      const nextText = (img.nextSibling?.textContent || '').trim();
      if (/^\d+-\d+$/.test(nextText)) continue;

      let name = '';
      const alt = img.getAttribute('alt') || '';
      if (alt && alt !== 'Image') {
        name = alt;
      } else {
        let node = img.nextSibling;
        while (node && !name) {
          if (node.nodeType === Node.TEXT_NODE) {
            const t = node.textContent.replace(/×\s*\d+/, '').trim();
            if (t && !/^\d+:\d+$/.test(t)) name = t;
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            if (['IMG', 'SECTION', 'ARTICLE'].includes(node.tagName)) break;
            const t = node.textContent.replace(/×\s*\d+/, '').trim();
            if (t && !/^\d+:\d+$/.test(t) && !/^×/.test(t)) { name = t; break; }
          }
          node = node.nextSibling;
        }
      }

      if (!name || name === 'Image') {
        const file = src.split('/').pop().replace(/\.[^.]+$/, '');
        name = file.replace(/-\d+$/, '').replace(/-/g, ' ')
                   .replace(/\b\w/g, c => c.toUpperCase());
      }

      let timeStr = null;
      let el = img.parentElement;
      for (let i = 0; i < 3 && el && !timeStr; i++) {
        const m = (el.textContent || '').match(/(\d{1,2}):(\d{2})/);
        if (m) timeStr = m[0];
        el = el.parentElement;
      }

      if (timeStr) {
        const [mm, ss] = timeStr.split(':').map(Number);
        lastTime = mm * 60 + ss;
      }

      const countMatch = (img.parentElement?.textContent || '').match(/×\s*(\d+)/);
      const count = countMatch ? parseInt(countMatch[1]) : 1;

      if (name) timeline.push({ time: lastTime, player: label, type, name, count, iconUrl: src });
    }
  };

  extractEvents(imgs.slice(0, splitIndex), labels[0]);
  extractEvents(imgs.slice(splitIndex), labels[1]);

  return timeline.sort((a, b) => a.time - b.time);
}

// ─────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────

/**
 * Convert an AoE4World API icon path to a CDN image URL.
 * e.g. "icons/races/japanese/units/unit_yumi-ashigaru-2"
 *   → "https://data.aoe4world.com/images/units/yumi-ashigaru-2.png"
 */
function iconPathToUrl(iconPath) {
  if (!iconPath) return null;
  const parts = iconPath.split('/');
  const CAT_MAP = { units: 'units', buildings: 'buildings', technologies: 'technologies', upgrades: 'technologies' };
  const catIdx = parts.findIndex(p => CAT_MAP[p]);
  if (catIdx < 0) return null;
  const cat  = CAT_MAP[parts[catIdx]];
  const slug = parts[parts.length - 1]
    .replace(/^unit_/, '').replace(/^building_landmark_/, '').replace(/^building_/, '')
    .replace(/^technology_/, '').replace(/^upgrade_/, '')
    .replace(/_/g, '-');
  return slug ? `https://data.aoe4world.com/images/${cat}/${slug}.png` : null;
}

/**
 * Build a name → iconUrl map from the AoE4World build order HTML.
 * Extracts the actual CDN image URLs straight from the \u003cimg\u003e elements.
 * Used to enrich Parser A (JSON API) results.
 */
function extractIconMapFromHTML(html) {
  if (typeof DOMParser === 'undefined') return {};
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const map = {};
  // Method 1: CSS-class structure (same as parser B)
  for (const er of doc.querySelectorAll('div.flex.p-1.rounded.items-center')) {
    const imgEl = er.querySelector('img[src*="data.aoe4world.com/images"]');
    if (!imgEl) continue;
    const src  = imgEl.getAttribute('src');
    if (!src) continue;
    const name = er.querySelector('span.flex-auto')?.textContent?.trim();
    if (name) map[name.toLowerCase()] = src;
  }
  // Method 2: any img with non-empty alt (fallback when CSS structure not found)
  if (Object.keys(map).length === 0) {
    for (const img of doc.querySelectorAll('img[src*="data.aoe4world.com/images"]')) {
      const src = img.getAttribute('src');
      if (!src || !/\/(units|buildings|technologies|upgrades)\//.test(src)) continue;
      const alt = (img.getAttribute('alt') || '').trim();
      if (alt && alt !== 'Image') map[alt.toLowerCase()] = src;
    }
  }
  return map;
}

/**
 * Convert an AoE4World icon path or slug to a human-readable name.
 *   "icons/races/japanese/buildings/building_farmhouse" -> "Farmhouse"
 *   "icons/hud/age/age_display_persistent_2"           -> "Feudal Age"
 *   "yumi-ashigaru" (img src slug)                     -> "Yumi Ashigaru"
 */
export function iconToName(iconPath) {
  if (!iconPath) return '';
  const AGES = {
    age_display_persistent_2: 'Feudal Age',
    age_display_persistent_3: 'Castle Age',
    age_display_persistent_4: 'Imperial Age',
  };
  const slug = iconPath.split('/').pop();
  if (AGES[slug]) return AGES[slug];
  return slug
    .replace(/^building_landmark_/, '')
    .replace(/^building_/, '')
    .replace(/^unit_/, '')
    .replace(/^upgrade_/, '')
    .replace(/^technology_/, '')
    .split(/[_-]/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
