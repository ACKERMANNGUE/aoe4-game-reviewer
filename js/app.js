import { searchPlayer, getGames, getGameDetail, getPlayerById } from './api.js';
import { THEMES, applyTheme, applyThemeById, restoreTheme, fetchRandomPalette, applyRawPalette } from './theme.js';
import { fetchSummaryHTML, extractBuildOrder } from './build-order.js';
import { buildGameJSON } from './exporter.js';
import { getPrompt, preloadPrompts } from './prompts.js';
import { openReport } from './report.js';
import { splitTeams, showMessage, clearMessage, downloadJSON, escHtml, getLBName } from './utils.js';
import {
  renderPlayerInfo, hidePlayerInfo,
  renderGamesList, hideGames,
  renderGameModalContent, renderSavedReportModal, buildTeamRowsHTML, openModal, closeModal,
  renderConversionSteps, setStep, renderConversionResult,
} from './render.js';

// ─────────────────────────────────────────────
// Application state
// ─────────────────────────────────────────────

const state = {
  player:            null,
  allGames:          [],    // all fetched games (before map filter)
  selectedGame:      null,
  myTeam:            [],    // players on the searched player's team
  oppTeam:           [],    // players on the opposing team
  selectedProfileId: null,
  convertedJSON:     null,
  gameType:          '',
  gameLimit:         10,
  activeMaps:        null,  // Set of visible map names; null = all
  apiKey:            localStorage.getItem('aoe4_api_key') || '',
};

// ─────────────────────────────────────────────
// API Key helpers
// ─────────────────────────────────────────────

function updateApiKeyStatus() {
  const dot = document.getElementById('api-key-dot');
  if (!dot) return;
  dot.style.display   = state.apiKey ? 'inline-block' : 'none';
}

// ─────────────────────────────────────────────
// Search & player
// ─────────────────────────────────────────────

function setTypeFilter(btn) {
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.gameType = btn.dataset.type;
  state.activeMaps = null;
  if (state.player) loadAndRenderGames(state.player.profile_id);
}

async function handleSearch() {
  const input = document.getElementById('player-input').value.trim();
  if (!input) return;

  const btn = document.getElementById('search-btn');
  btn.disabled = true;
  btn.textContent = '...';
  clearMessage();
  hidePlayerInfo();
  hideGames();

  try {
    let profileId  = null;
    let playerInfo = null;

    const urlMatch    = input.match(/players\/(\d+)/);
    const idNameMatch = input.match(/^(\d+)/);

    if (urlMatch) {
      profileId = urlMatch[1];
    } else if (idNameMatch && /^\d+/.test(input)) {
      profileId = idNameMatch[1];
    }

    if (profileId) {
      try {
        const games = await getGames(profileId, 1, state.gameType);
        if (games.length > 0) {
          const { me } = splitTeams(games[0], profileId);
          if (me?.name) {
            const results = await searchPlayer(me.name);
            const match   = results.find(p => String(p.profile_id) === String(profileId));
            playerInfo = match || results[0] || me;
          } else {
            playerInfo = me;
          }
        }
      } catch (_) {}
    }

    if (!playerInfo) {
      const results = await searchPlayer(input);
      if (!results.length) {
        showMessage(`No player found for "${input}"`, 'error');
        return;
      }
      playerInfo = results[0];
      profileId  = playerInfo.profile_id;
    }

    state.player           = { ...playerInfo, profile_id: profileId };
    state.selectedProfileId = String(profileId);
    renderPlayerInfo(playerInfo);
    await loadAndRenderGames(profileId);

  } catch (err) {
    showMessage(`Error: ${err.message}`, 'error');
  } finally {
    btn.disabled   = false;
    btn.textContent = 'Search';
  }
}

async function loadAndRenderGames(profileId) {
  const listEl    = document.getElementById('games-list');
  const sectionEl = document.getElementById('games-section');

  listEl.innerHTML        = '<div class="message info">Loading games...</div>';
  sectionEl.style.display = 'block';

  // Hide map filter while loading
  const mapFilterEl = document.getElementById('map-filter');
  if (mapFilterEl) mapFilterEl.style.display = 'none';

  try {
    const games = await getGames(profileId, state.gameLimit, state.gameType, state.apiKey);
    state.allGames  = games;
    state.activeMaps = null; // reset map filter on fresh load

    if (!games.length) {
      listEl.innerHTML = '<div class="message warn">No games found with this filter.</div>';
      return;
    }

    document.getElementById('games-title').textContent =
      `${games.length} game${games.length !== 1 ? 's' : ''} - ${getLBName(state.gameType) || 'All modes'}`;

    renderMapFilter(profileId, games);
    applyMapFilter(profileId);

  } catch (err) {
    listEl.innerHTML = `<div class="message error">Error loading games: ${escHtml(err.message)}</div>`;
  }
}

/** Populate the map filter chips from the loaded games. */
function renderMapFilter(profileId, games) {
  const container = document.getElementById('map-filter');
  const chips     = document.getElementById('map-chips');
  if (!container || !chips) return;

  const maps = [...new Set(games.map(g => g.map).filter(Boolean))].sort();
  if (maps.length <= 1) { container.style.display = 'none'; return; }

  state.activeMaps = new Set(maps); // all maps active by default
  container.style.display = 'flex';
  chips.innerHTML = maps.map(m =>
    `<button class="map-chip active" data-map="${escHtml(m)}">${escHtml(m)}</button>`
  ).join('');

  chips.querySelectorAll('.map-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      const active = [...chips.querySelectorAll('.map-chip.active')].map(b => b.dataset.map);
      state.activeMaps = active.length === maps.length ? null : new Set(active);
      applyMapFilter(profileId);
    });
  });
}

/** Re-render the games list using the current map filter. */
function applyMapFilter(profileId) {
  const filtered = state.activeMaps
    ? state.allGames.filter(g => state.activeMaps.has(g.map))
    : state.allGames;
  renderGamesList(filtered, profileId, openGameModal);
}

// ─────────────────────────────────────────────
// Report localStorage helpers
// ─────────────────────────────────────────────

const reportKey = (gameId) => `aoe4_report_${gameId}`;

function saveReport(gameId, gameJSON, markdownText) {
  try {
    localStorage.setItem(reportKey(gameId), JSON.stringify({
      gameJSON,
      markdownText,
      savedAt: new Date().toISOString(),
    }));
  } catch (_) {}
}

function loadSavedReport(gameId) {
  try {
    const item = localStorage.getItem(reportKey(gameId));
    return item ? JSON.parse(item) : null;
  } catch (_) { return null; }
}

function deleteSavedReport(gameId) {
  localStorage.removeItem(reportKey(gameId));
}

// ─────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────

function wireConvertButton() {
  document.getElementById('convert-btn')?.addEventListener('click', startConversion);
}

function wireSavedReportButtons(game, profileId) {
  const { myTeam, oppTeam } = { myTeam: state.myTeam, oppTeam: state.oppTeam };

  document.getElementById('check-report-btn').addEventListener('click', () => {
    const saved = loadSavedReport(game.game_id);
    if (!saved) return;
    closeModal();
    openReport(saved.gameJSON, saved.markdownText);
  });

  document.getElementById('reconvert-btn').addEventListener('click', () => {
    document.getElementById('modal-content').innerHTML =
      renderGameModalContent(game, profileId, myTeam, oppTeam);
    wireConvertButton();
  });

  document.getElementById('delete-report-btn').addEventListener('click', () => {
    deleteSavedReport(game.game_id);
    document.getElementById('modal-content').innerHTML =
      renderGameModalContent(game, profileId, myTeam, oppTeam);
    wireConvertButton();
    // Refresh game card badge
    applyMapFilter(state.selectedProfileId);
  });
}

function openGameModal(game, profileId) {
  state.selectedGame      = game;
  state.selectedProfileId = String(profileId);
  state.convertedJSON     = null;

  const { myTeam, oppTeam } = splitTeams(game, profileId);
  state.myTeam  = myTeam;
  state.oppTeam = oppTeam;

  const saved = loadSavedReport(game.game_id);

  // For AI games (empty oppTeam), resolve display players:
  // use actual AI names from the saved report, or numbered placeholders.
  let resolvedOppTeam = oppTeam;
  if (oppTeam.length === 0) {
    const aiFromSaved = saved?.gameJSON?.teams?.[1]?.players ?? [];
    resolvedOppTeam = aiFromSaved.length > 0
      ? aiFromSaved
      : Array.from({ length: myTeam.length }, (_, i) => ({
          profile_id:           `ai_placeholder_${i}`,
          name:                 `AI ${i + 1}`,
          civilization:         null,
          civilization_display: 'AI',
        }));
  }

  // Open modal immediately with no profile data
  document.getElementById('modal-content').innerHTML = saved
    ? renderSavedReportModal(game, profileId, myTeam, resolvedOppTeam, saved.savedAt, {})
    : renderGameModalContent(game, profileId, myTeam, resolvedOppTeam, {});

  if (saved) {
    wireSavedReportButtons(game, profileId);
  } else {
    wireConvertButton();
  }

  openModal();

  // Fetch profiles and patch only the vs-row player columns - does not touch the rest of the modal
  const realPlayers = [...myTeam, ...resolvedOppTeam].filter(p => !String(p.profile_id).startsWith('ai_'));
  const playerProfiles = {};
  Promise.all(
    realPlayers.map(p =>
      getPlayerById(p.profile_id)
        .then(data => { playerProfiles[String(p.profile_id)] = data; })
        .catch(() => {})
    )
  ).then(() => {
    const leftEl    = document.getElementById('vs-left');
    const rightEl   = document.getElementById('vs-right');
    const allP      = [...myTeam, ...resolvedOppTeam];
    const preferTeam = game.leaderboard === 'rm_team';
    if (leftEl)  leftEl.innerHTML  = buildTeamRowsHTML(myTeam,          allP, playerProfiles, false, preferTeam);
    if (rightEl) rightEl.innerHTML = buildTeamRowsHTML(resolvedOppTeam, allP, playerProfiles, true,  preferTeam);
  });
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

// ─────────────────────────────────────────────
// Conversion pipeline
// ─────────────────────────────────────────────

async function startConversion() {
  document.getElementById('convert-btn')?.remove();

  const gameId    = state.selectedGame.game_id;
  const profileId = state.selectedProfileId;

  // Extract sig from optional share URL input
  const shareUrlRaw = document.getElementById('share-url-input')?.value?.trim() || '';
  const sigMatch    = shareUrlRaw.match(/[?&]sig=([^&]+)/);
  let sig = '';
  if (sigMatch) {
    sig = sigMatch[1];
  } else if (/^[a-f0-9]{20,}$/i.test(shareUrlRaw)) {
    sig = shareUrlRaw;
  }
  if (sig) console.log('[app] using sig for build order:', sig.slice(0, 8) + '...');

  renderConversionSteps();

  let gameDetail;
  let timeline          = [];
  let buildOrderOK      = false;
  let economySnapshots  = null;
  let militarySnapshots = null;
  let statistics        = null;

  // Step 1: API
  try {
    gameDetail = await getGameDetail(gameId, profileId, state.apiKey);
    setStep('api', 'API data fetched', 'done');
  } catch (err) {
    setStep('api', `API error: ${escHtml(err.message)}`, 'fail');
    showMessage('Data retrieval failed.', 'error', 'modal-messages');
    return;
  }

  const { myTeam: detailMyTeam, oppTeam: detailOppTeam } = splitTeams(gameDetail, profileId);
  const myTeam  = detailMyTeam.length  ? detailMyTeam  : state.myTeam;
  const oppTeam = detailOppTeam.length ? detailOppTeam : state.oppTeam;
  const me      = myTeam.find(p => String(p.profile_id) === String(profileId)) || myTeam[0];
  const opp     = oppTeam[0];

  // Step 2: Build order
  setStep('html', 'Fetching build order...', 'active');

  try {
    let result = await fetchSummaryHTML(profileId, gameId);

    // When the HTML page is inaccessible (private/custom game) but an api_key is set,
    // create a synthetic result so extractBuildOrder can still hit the summary JSON
    // endpoint directly (profileId + gameId → constructed fallback URL + api_key).
    if (!result && state.apiKey) {
      result = { html: '', source: 'api-key-direct', summaryUrl: null, profileId, gameId };
    }

    if (result) {
      const bo  = await extractBuildOrder(result, me?.name ?? '', opp?.name ?? '', state.apiKey, sig);
      timeline          = bo.timeline;
      economySnapshots  = bo.economySnapshots;
      militarySnapshots = bo.militarySnapshots;
      statistics        = bo.statistics;
      if (timeline.length > 0) {
        buildOrderOK = true;
        setStep('html', `Build order extracted (${bo.method}) - ${timeline.length} events`, 'done');
      } else {
        setStep('html', `Page fetched (${result.source}) - build order not found`, 'warn');
      }
    } else {
      setStep('html', 'Summary page unreachable (all CORS proxies blocked)', 'warn');
    }
  } catch (err) {
    setStep('html', `Build order skipped: ${escHtml(err.message)}`, 'warn');
  }

  // Step 3: JSON
  setStep('json', 'Building JSON...', 'active');

  const gameSource = gameDetail || state.selectedGame;
  const gameJSON   = buildGameJSON(profileId, gameSource, myTeam, oppTeam, timeline, { economySnapshots, militarySnapshots, statistics });
  state.convertedJSON = gameJSON;
  setStep('json', 'JSON ready', 'done');

  // Render result
  const safeName = (me?.name ?? 'player').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename  = `aoe4_${gameId}_${safeName}.json`;

  document.getElementById('modal-result').innerHTML =
    renderConversionResult({ buildOrderOK, economyOK: !!economySnapshots, militaryOK: !!militarySnapshots, gameJSON, filename });

  document.getElementById('dl-btn').addEventListener('click', () => {
    if (state.convertedJSON) downloadJSON(state.convertedJSON, filename);
  });

  document.getElementById('copy-btn').addEventListener('click', async () => {
    if (!state.convertedJSON) return;
    const pName  = state.convertedJSON.teams?.[0]?.players?.find(p => p.is_you)?.name ?? 'Player';
    const prompt = await getPrompt(pName, state.convertedJSON);
    try {
      await navigator.clipboard.writeText(prompt);
      window.open('https://chatgpt.com', '_blank', 'noopener');
      const el = document.getElementById('copy-confirm');
      if (el) {
        el.innerHTML = '<div class="message success">Prompt copied &amp; ChatGPT opened -  press <strong>Ctrl+V</strong> then <strong>Enter</strong>. Enable <strong>Code Interpreter</strong>. Download the .md file it generates, then load it here.</div>';
        setTimeout(() => { const e2 = document.getElementById('copy-confirm'); if (e2) e2.innerHTML = ''; }, 8000);
      }
    } catch (e) {
      const el = document.getElementById('copy-confirm');
      if (el) el.innerHTML = `<div class="message error">Copy error: ${escHtml(e.message)}</div>`;
    }
  });

  // ── Load analysis from .md file or paste ──────────────────────────────────────
  function openReportFromText(text) {
    if (!text.trim()) return;    const gameId = state.convertedJSON?.match?.game_id;
    if (gameId) {
      saveReport(gameId, state.convertedJSON, text);
      // Refresh game card to show the saved badge
      applyMapFilter(state.selectedProfileId);
    }    closeModal();
    openReport(state.convertedJSON, text);
  }

  document.getElementById('load-md-btn').addEventListener('click', () => {
    document.getElementById('md-file-input').click();
  });

  document.getElementById('md-file-input').addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => openReportFromText(ev.target.result);
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('paste-md-btn').addEventListener('click', () => {
    const area = document.getElementById('paste-area');
    area.style.display = area.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('paste-md-confirm').addEventListener('click', () => {
    const text = document.getElementById('paste-md-text').value;
    openReportFromText(text);
  });
}

// ─────────────────────────────────────────────
// Theme panel
// ─────────────────────────────────────────────

function initThemePanel() {
  // Restore saved theme
  restoreTheme();

  // Populate swatch grid
  const swatchContainer = document.getElementById('theme-swatches');
  for (const theme of THEMES) {
    const btn = document.createElement('button');
    btn.className = 'theme-swatch';
    btn.dataset.themeId = theme.id;
    btn.title = theme.name;
    btn.innerHTML = theme.preview
      .map(c => `<span class="swatch-dot" style="background:${c}"></span>`)
      .join('') +
      `<span class="swatch-label">${theme.name}</span>`;
    btn.addEventListener('click', () => {
      applyTheme(theme);
    });
    swatchContainer.appendChild(btn);
  }

  // Toggle panel open/close
  const btn   = document.getElementById('theme-btn');
  const panel = document.getElementById('theme-panel');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!document.getElementById('theme-controls').contains(e.target)) {
      panel.classList.add('hidden');
    }
  });

  // Random theme
  document.getElementById('random-theme-btn').addEventListener('click', async () => {
    const statusEl = document.getElementById('theme-status');
    const btn = document.getElementById('random-theme-btn');
    btn.disabled = true;
    btn.textContent = 'Loading...';
    statusEl.textContent = '';

    try {
      const colors = await fetchRandomPalette();
      applyRawPalette(colors);
      statusEl.textContent = 'Palette: ' + colors.map(c => c.toUpperCase()).join('  ');
    } catch (err) {
      statusEl.textContent = 'Error: ' + err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Random theme';
    }
  });
}

// ─────────────────────────────────────────────
// Saved profiles (localStorage)
// ─────────────────────────────────────────────

const PROFILES_KEY = 'aoe4_saved_profiles';

function loadProfiles() {
  try { return JSON.parse(localStorage.getItem(PROFILES_KEY)) || []; }
  catch (_) { return []; }
}

function persistProfiles(profiles) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

function renderProfilesDropdown() {
  const profiles = loadProfiles();
  const row = document.getElementById('profiles-row');
  const sel = document.getElementById('profiles-select');
  if (!row || !sel) return;

  if (!profiles.length) {
    row.style.display = 'none';
    return;
  }

  row.style.display = 'flex';
  sel.innerHTML = '<option value="">\u2014 Select a profile \u2014</option>' +
    profiles.map((p, i) => `<option value="${i}">${escHtml(p.label)}</option>`).join('');
}

function handleSaveProfile() {
  const input = document.getElementById('player-input').value.trim();
  if (!input && !state.player) return;

  const profiles = loadProfiles();
  let label, query;

  if (state.player) {
    const name = state.player.name || input;
    const pid  = state.player.profile_id;
    label = `${name} (${pid})`;
    query = String(pid);
  } else {
    label = input;
    query = input;
  }

  // Avoid exact duplicates
  if (profiles.some(p => p.query === query)) {
    const btn = document.getElementById('save-profile-btn');
    const orig = btn.textContent;
    btn.textContent = 'Already saved';
    setTimeout(() => { btn.textContent = orig; }, 1500);
    return;
  }

  profiles.push({ label, query });
  persistProfiles(profiles);
  renderProfilesDropdown();

  const btn = document.getElementById('save-profile-btn');
  const orig = btn.textContent;
  btn.textContent = 'Saved!';
  setTimeout(() => { btn.textContent = orig; }, 1500);
}

// ─────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────

function init() {
  // ── API key ──
  const apiKeyInput = document.getElementById('api-key-input');
  if (apiKeyInput) {
    apiKeyInput.value = state.apiKey;
    apiKeyInput.addEventListener('change', e => {
      state.apiKey = e.target.value.trim();
      if (state.apiKey) {
        localStorage.setItem('aoe4_api_key', state.apiKey);
      } else {
        localStorage.removeItem('aoe4_api_key');
      }
      updateApiKeyStatus();
    });
  }
  updateApiKeyStatus();

  // ── Saved profiles ──
  renderProfilesDropdown();

  document.getElementById('save-profile-btn').addEventListener('click', handleSaveProfile);

  document.getElementById('profiles-select').addEventListener('change', e => {
    const idx = e.target.value;
    if (idx === '') return;
    const profiles = loadProfiles();
    const profile = profiles[parseInt(idx, 10)];
    if (!profile) return;
    document.getElementById('player-input').value = profile.query;
    e.target.value = '';          // reset dropdown to placeholder
    handleSearch();
  });

  document.getElementById('profile-delete-btn').addEventListener('click', () => {
    const sel = document.getElementById('profiles-select');
    const idx = sel.value;
    if (idx === '') return;
    const profiles = loadProfiles();
    profiles.splice(parseInt(idx, 10), 1);
    persistProfiles(profiles);
    renderProfilesDropdown();
  });

  // ── Search ──
  document.getElementById('player-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSearch();
  });
  document.getElementById('search-btn').addEventListener('click', handleSearch);

  document.getElementById('game-limit').addEventListener('change', e => {
    state.gameLimit = parseInt(e.target.value, 10);
    if (state.player) loadAndRenderGames(state.player.profile_id);
  });

  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => setTypeFilter(btn));
  });

  // ── Modal ──
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', handleOverlayClick);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // ── Prompts preload ──
  preloadPrompts().catch(() => {}); // non-blocking, templates cached on first use if this fails

  // ── Theme panel ──
  initThemePanel();

  // ── File:// warning ──
  if (location.protocol === 'file:') {
    const el = document.getElementById('cors-notice');
    if (el) el.style.display = 'block';
  }
}

document.addEventListener('DOMContentLoaded', init);
