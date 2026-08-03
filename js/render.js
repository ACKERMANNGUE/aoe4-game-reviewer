import { getCivName, getCivFlag, getRankIcon, getLBName, fmtDate, fmtDuration, escHtml, splitTeams } from './utils.js';
import { PLAYER_COLORS } from './config.js';

// ─────────────────────────────────────────────
// Player panel
// ─────────────────────────────────────────────

export function renderPlayerInfo(p) {
  const lb = p.modes ?? p.leaderboards ?? {};

  const soloData = lb.rm_solo;
  const teamData = lb.rm_team;

  // Use solo stats for the meta line; fall back to team if solo absent
  const primary  = soloData ?? teamData;
  const rating   = primary?.rating  ?? '--';
  const rank     = primary?.rank    ?? '--';
  const wr       = primary?.win_rate ?? '--';

  const rankBadge = (data, label, type) => {
    if (!data?.rank_level) return '';
    const lvlDisplay = fmtRankLevel(data.rank_level);
    const icon = getRankIcon(data.rank_level, type);
    const iconHtml = icon ? `<img src="${icon}" class="rank-icon" alt="${lvlDisplay}">` : '';
    return `<div class="rank-badge">
      ${iconHtml}
      <span class="rank-badge-label">${label} ${lvlDisplay}</span>
    </div>`;
  };

  const avatar = p.avatars?.large ?? p.avatars?.medium ?? null;
  const avatarHtml = avatar
    ? `<img src="${escHtml(avatar)}" class="player-avatar-lg" alt="${escHtml(p.name ?? '')}">`
    : '';

  const el = document.getElementById('player-info');
  el.innerHTML = `
    ${avatarHtml}
    <div style="flex:1">
      <div class="player-name-big">${escHtml(p.name)}</div>
      <div class="player-meta">
        Rank #${rank} - ${wr !== '--' ? wr + '% WR' : ''} - MMR ${rating}
        ${p.country ? `- ${p.country.toUpperCase()}` : ''}
      </div>
    </div>
    <div class="rank-badges">
      ${rankBadge(soloData, 'Solo', 'solo')}
      ${rankBadge(teamData, 'Team', 'team')}
    </div>
  `;
  el.classList.add('visible');
}

export function hidePlayerInfo() {
  const el = document.getElementById('player-info');
  el.classList.remove('visible');
  el.innerHTML = '';
}

// ─────────────────────────────────────────────
// Games list
// ─────────────────────────────────────────────

/**
 * @param {object[]} games
 * @param {string|number} profileId
 * @param {function} onGameClick  called with (game, profileId)
 */
export function renderGamesList(games, profileId, onGameClick) {
  const listEl = document.getElementById('games-list');
  listEl.innerHTML = '';

  for (const game of games) {
    const { me, myTeam, oppTeam } = splitTeams(game, profileId);
    if (!me) continue;

    const isWin    = me.result === 'win';
    const delta    = me.mmr_diff ?? me.rating_diff ?? 0;
    const diffSign = delta > 0 ? '+' : '';
    const isTeam   = myTeam.length > 1 || oppTeam.length > 1;

    // Civilization display: "Civ1 + Civ2" for team games; for AI games (empty oppTeam)
    // use actual AI names from the saved report, or numbered placeholders otherwise.
    const myCivs = myTeam.map(p => getCivName(p.civilization)).join(' + ');
    let oppCivs, oppNames;
    if (oppTeam.length > 0) {
      oppCivs  = oppTeam.map(p => getCivName(p.civilization)).join(' + ');
      oppNames = oppTeam.map(p => escHtml(p.name ?? '?')).join(' + ');
    } else {
      oppNames = '';
      // Try to read actual AI names from the saved report JSON
      const savedRaw = localStorage.getItem(`aoe4_report_${game.game_id}`);
      if (savedRaw) {
        try {
          const { gameJSON } = JSON.parse(savedRaw);
          const aiPlayers = gameJSON?.teams?.[1]?.players ?? [];
          oppCivs = aiPlayers.length > 0
            ? aiPlayers.map(p => escHtml(p.name)).join(' + ')
            : Array.from({ length: myTeam.length }, (_, i) => `AI ${i + 1}`).join(' + ');
        } catch (_) {
          oppCivs = Array.from({ length: myTeam.length }, (_, i) => `AI ${i + 1}`).join(' + ');
        }
      } else {
        oppCivs = Array.from({ length: myTeam.length }, (_, i) => `AI ${i + 1}`).join(' + ');
      }
    }

    const card = document.createElement('div');
    card.className = 'game-card';
    const hasSaved = !!localStorage.getItem(`aoe4_report_${game.game_id}`);
    card.innerHTML = `
      <div class="result-dot ${isWin ? 'win' : 'loss'}"></div>
      <div class="game-card-main">
        <div class="game-card-title">
          ${escHtml(game.map)}
          <span class="civ-tag">${myCivs} vs ${oppCivs}</span>
          <span class="civ-tag" style="opacity:.7">${oppNames}</span>
        </div>
        <div class="game-card-sub">
          ${fmtDate(game.started_at)} - ${fmtDuration(game.duration)} - ${getLBName(game.leaderboard)}
        </div>
      </div>
      <div class="game-card-right">
        <div class="result-label ${isWin ? 'win' : 'loss'}">${isWin ? 'Win' : 'Loss'}</div>
        <div class="mmr-delta ${delta >= 0 ? 'positive' : 'negative'}">${diffSign}${delta} MMR</div>
        ${hasSaved ? '<div class="saved-badge">report saved</div>' : ''}
      </div>
    `;
    card.addEventListener('click', () => onGameClick(game, profileId));
    listEl.appendChild(card);
  }
}

export function hideGames() {
  document.getElementById('games-section').style.display = 'none';
  document.getElementById('games-list').innerHTML = '';
}

// ─────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────

function fmtRankLevel(rankLevel) {
  return rankLevel ? rankLevel.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';
}

export function buildTeamRowsHTML(players, allPlayers, playerProfiles, right = false, preferTeam = false) {
  const playerColor = (p) =>
    p.color ?? PLAYER_COLORS[allPlayers.findIndex(ap => String(ap.profile_id) === String(p.profile_id))] ?? '#888';

  return players.map(p => {
    const color    = playerColor(p);
    const flag     = getCivFlag(p.civilization);
    const civName  = getCivName(p.civilization);
    const flagHtml = flag
      ? `<img src="${flag}" class="civ-flag" alt="${civName}" title="${civName}">`
      : '';

    const profile   = playerProfiles[String(p.profile_id)];
    const avatar    = profile?.avatars?.small ?? null;
    const soloLevel = profile?.modes?.rm_solo?.rank_level ?? null;
    const teamLevel = profile?.modes?.rm_team?.rank_level ?? null;
    const rankLevel = preferTeam ? (teamLevel ?? soloLevel) : (soloLevel ?? teamLevel);
    const rankType  = preferTeam ? (teamLevel ? 'team' : 'solo') : (soloLevel ? 'solo' : 'team');
    const rankIcon  = getRankIcon(rankLevel, rankType);
    const rankTitle = fmtRankLevel(rankLevel);

    const avatarHtml = avatar
      ? `<img src="${escHtml(avatar)}" class="player-avatar" alt="${escHtml(p.name ?? '')}">`
      : '';
    const rankHtml = rankIcon
      ? `<img src="${rankIcon}" class="rank-icon-sm" alt="${rankTitle}" title="${rankTitle}">`
      : '';

    // left: [avatar] [dot] [name] [rank] — right: same HTML, reversed by flex-direction
    return `
      <div>
        <div class="name" style="display:flex;align-items:center;gap:6px;${right ? 'flex-direction:row-reverse;' : ''}">
          ${avatarHtml}
          <span class="player-color-dot" style="background:${color}"></span>
          <a class="player-name-link" href="https://aoe4world.com/players/${p.profile_id}" target="_blank" rel="noopener">${escHtml(p.name ?? '?')}</a>
          ${rankHtml}
        </div>
        <div class="civ" style="display:flex;align-items:center;gap:5px;${right ? 'flex-direction:row-reverse;' : ''}">
          ${flagHtml}<span>${civName}</span>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Render the initial modal content (game details + convert button).
 * Returns the HTML string; caller is responsible for wiring the convert button.
 */
export function renderGameModalContent(game, profileId, myTeam, oppTeam, playerProfiles = {}) {
  const me    = myTeam.find(p => String(p.profile_id) === String(profileId)) || myTeam[0];
  const isWin = me?.result === 'win';
  const dur   = fmtDuration(game.duration);
  const date  = fmtDate(game.started_at);
  const delta = me?.mmr_diff ?? me?.rating_diff ?? 0;

  const allPlayers = [...myTeam, ...oppTeam];
  const preferTeam = game.leaderboard === 'rm_team';
  const teamRow = (players, right = false) => buildTeamRowsHTML(players, allPlayers, playerProfiles, right, preferTeam);

  return `
    <div class="modal-header">
      <h2>
        Game #${game.game_id}
        <span class="modal-result-inline ${isWin ? 'win' : 'loss'}"> - ${isWin ? 'Win' : 'Loss'}</span>
      </h2>
      <div class="meta">${date} - ${dur} - Patch ${game.patch} - ${game.server}</div>
    </div>

    <div class="vs-row">
      <div class="vs-player" id="vs-left">${teamRow(myTeam)}</div>
      <div class="vs-sep">vs</div>
      <div class="vs-player" id="vs-right">${teamRow(oppTeam, true)}</div>
    </div>

    <div class="match-detail-grid">
      <div class="detail-cell">
        <div class="label">Map</div>
        <div class="value">${escHtml(game.map)}</div>
      </div>
      <div class="detail-cell">
        <div class="label">Duration</div>
        <div class="value">${dur}</div>
      </div>
      <div class="detail-cell">
        <div class="label">Mode</div>
        <div class="value">${getLBName(game.leaderboard)}</div>
      </div>
      <div class="detail-cell">
        <div class="label">MMR</div>
        <div class="value" style="color:${delta >= 0 ? 'var(--green-light)' : 'var(--red-light)'}">
          ${delta >= 0 ? '+' : ''}${delta}
        </div>
      </div>
    </div>

    <a class="aoe4world-link"
       href="https://aoe4world.com/players/${profileId}/games/${game.game_id}"
       target="_blank" rel="noopener">
      View on AoE4World
    </a>

    <div class="share-url-row" id="share-url-row">
      <label class="share-url-label" for="share-url-input"
             title="For private/custom games: paste the full AoE4World game URL containing ?sig= to unlock build order data">
        Share URL
        <span class="share-url-hint">(private games - paste the aoe4world link with ?sig=)</span>
      </label>
      <input
        type="text"
        id="share-url-input"
        class="share-url-input"
        placeholder="https://aoe4world.com/players/.../games/...?sig=..."
        autocomplete="off"
        spellcheck="false"
      >
    </div>

    <div id="modal-messages" style="margin-top:12px"></div>
    <div id="modal-steps"    style="margin-top:12px"></div>
    <div id="modal-result"   style="margin-top:12px"></div>

    <div class="modal-actions" style="margin-top:20px">
      <button class="btn" id="convert-btn">Start conversion</button>
    </div>
  `;
}

/** Render the modal for a game that already has a saved report. */
export function renderSavedReportModal(game, profileId, myTeam, oppTeam, savedAt, playerProfiles = {}) {
  const me    = myTeam.find(p => String(p.profile_id) === String(profileId)) || myTeam[0];
  const isWin = me?.result === 'win';
  const dur   = fmtDuration(game.duration);
  const date  = fmtDate(game.started_at);
  const delta = me?.mmr_diff ?? me?.rating_diff ?? 0;

  const allPlayers = [...myTeam, ...oppTeam];
  const preferTeam = game.leaderboard === 'rm_team';
  const teamRow = (players, right = false) => buildTeamRowsHTML(players, allPlayers, playerProfiles, right, preferTeam);

  const savedDate = new Date(savedAt).toLocaleString(undefined, {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return `
    <div class="modal-header">
      <h2>
        Game #${game.game_id}
        <span class="modal-result-inline ${isWin ? 'win' : 'loss'}"> - ${isWin ? 'Win' : 'Loss'}</span>
      </h2>
      <div class="meta">${escHtml(game.map)} - ${date} - ${dur} - Patch ${game.patch} - ${game.server}</div>
    </div>

    <div class="vs-row">
      <div class="vs-player" id="vs-left">${teamRow(myTeam)}</div>
      <div class="vs-sep">vs</div>
      <div class="vs-player" id="vs-right">${teamRow(oppTeam, true)}</div>
    </div>

    <div class="match-detail-grid">
      <div class="detail-cell"><div class="label">Map</div><div class="value">${escHtml(game.map)}</div></div>
      <div class="detail-cell"><div class="label">Duration</div><div class="value">${dur}</div></div>
      <div class="detail-cell"><div class="label">Mode</div><div class="value">${getLBName(game.leaderboard)}</div></div>
      <div class="detail-cell">
        <div class="label">MMR</div>
        <div class="value" style="color:${delta >= 0 ? 'var(--green-light)' : 'var(--red-light)'}">
          ${delta >= 0 ? '+' : ''}${delta}
        </div>
      </div>
    </div>

    <a class="aoe4world-link"
       href="https://aoe4world.com/players/${profileId}/games/${game.game_id}"
       target="_blank" rel="noopener">View on AoE4World</a>

    <div class="saved-report-banner">
      <span class="saved-report-chip">Report saved</span>
      <span class="saved-report-date">Saved on ${savedDate}</span>
    </div>

    <div class="modal-actions" style="margin-top:16px">
      <button class="btn btn-green" id="check-report-btn" style="width:100%">View report</button>
      <div class="result-step-row" style="margin-top:8px">
        <button class="btn btn-secondary" id="reconvert-btn">Reconvert</button>
        <button class="btn btn-danger" id="delete-report-btn">Delete report</button>
      </div>
    </div>
  `;
}

export function openModal() {
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

export function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

// ─────────────────────────────────────────────
// Conversion UI
// ─────────────────────────────────────────────

export function renderConversionSteps() {
  document.getElementById('modal-steps').innerHTML = `
    <div class="loading-steps">
      <div class="loading-step active" id="step-api">
        <span class="step-icon"><span class="spinner"></span></span> Fetching API data...
      </div>
      <div class="loading-step pending" id="step-html">
        <span class="step-icon">-</span> Fetching build order...
      </div>
      <div class="loading-step pending" id="step-json">
        <span class="step-icon">-</span> Building JSON...
      </div>
    </div>
  `;
}

export function setStep(id, text, status) {
  const el = document.getElementById(`step-${id}`);
  if (!el) return;
  const icons = {
    active:  '<span class="spinner"></span>',
    done:    '+',
    warn:    '!',
    fail:    'x',
    pending: '-',
  };
  el.className = `loading-step ${status}`;
  el.innerHTML = `<span class="step-icon">${icons[status] ?? '-'}</span> ${text}`;
}

export function renderConversionResult({ buildOrderOK, economyOK, militaryOK, gameJSON, filename }) {
  const jsonLines   = JSON.stringify(gameJSON, null, 2).split('\n');
  const previewText = jsonLines.slice(0, 32).join('\n') + (jsonLines.length > 32 ? '\n  ...' : '');

  return `
    <div class="data-quality">
      <span class="quality-chip ok">+ Metadata</span>
      <span class="quality-chip ${buildOrderOK ? 'ok' : 'missing'}">${buildOrderOK ? '+' : 'x'} Build order</span>
      <span class="quality-chip ${economyOK    ? 'ok' : 'missing'}">${economyOK    ? '+' : 'x'} Economy</span>
      <span class="quality-chip ${militaryOK   ? 'ok' : 'missing'}">${militaryOK   ? '+' : 'x'} Military</span>
    </div>
    ${!buildOrderOK ? `
    <div class="message warn">
      <strong>[!] Build order unavailable.</strong><br>
      AoE4World renders the build order client-side -- the HTML received by the proxy does not contain it.<br>
      <span style="font-size:.85em;margin-top:.4em;display:block">
        Make sure your match history is <strong>public</strong> in-game
        (Options &gt; Gameplay &gt; Match History &gt; Public).
      </span>
    </div>` : ''}
    <div class="section-title">JSON preview</div>
    <div class="json-preview">${escHtml(previewText)}</div>
    <div class="result-actions">

      <div class="result-step">
        <div class="result-step-label">1 - Export</div>
        <div class="result-step-row">
          <button class="btn" id="copy-btn">Copy analysis prompt</button>
          <button class="btn btn-secondary" id="dl-btn">Download JSON</button>
        </div>
        <div id="copy-confirm"></div>
      </div>

      <div class="result-step">
        <div class="result-step-label">2 - Load analysis</div>
        <div class="result-step-row">
          <button class="btn btn-accent" id="load-md-btn">Load .md file</button>
          <button class="btn btn-secondary" id="paste-md-btn">Paste analysis</button>
        </div>
        <div id="paste-area" style="display:none;margin-top:10px">
          <textarea id="paste-md-text" class="paste-textarea"
            placeholder="Paste the analysis generated by ChatGPT here..."></textarea>
          <button class="btn btn-green" id="paste-md-confirm" style="width:100%">View report</button>
        </div>
      </div>

    </div>
    <input type="file" id="md-file-input" accept=".md,.txt" style="display:none">
  `;
}
