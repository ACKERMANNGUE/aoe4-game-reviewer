import { CIV_LABELS, LEADERBOARD_LABELS } from './config.js';

// ─────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────

export function fmtDuration(s) {
  const m   = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, '0');
  return `${m}:${sec}`;
}

export function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

export function getCivName(civ) {
  return CIV_LABELS[civ] || (civ || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function getLBName(lb) {
  return LEADERBOARD_LABELS[lb] || lb;
}

// ─────────────────────────────────────────────
// Game data helpers
// ─────────────────────────────────────────────

/**
 * Unpack a team entry, handling two API shapes:
 *   Shape A (/players/{id}/games): { player: { profile_id, name, result, ... } }
 *   Shape B (/games/{id}):         { profile_id, name, result, ... }
 */
export function unpackEntry(entry) {
  return entry.player ? { ...entry.player } : { ...entry };
}

/**
 * Split a game's teams around the searched profile.
 * Returns:
 *   me        – the searched player (flat object)
 *   opp       – first opponent (backward compat for 1v1)
 *   myTeam    – array of all players on the searched player's team
 *   oppTeam   – array of all players on the opposing team(s)
 */
export function splitTeams(game, myProfileId) {
  const teams = (game.teams || []).map(team => team.map(raw => unpackEntry(raw)));
  const myTeam  = teams.find(t => t.some(p => String(p.profile_id) === String(myProfileId))) || [];
  const oppTeam = teams.find(t => !t.some(p => String(p.profile_id) === String(myProfileId))) || [];
  const me  = myTeam.find(p => String(p.profile_id) === String(myProfileId)) || myTeam[0] || null;
  const opp = oppTeam[0] || null;
  return { me, opp, myTeam, oppTeam };
}

// ─────────────────────────────────────────────
// DOM helpers
// ─────────────────────────────────────────────

export function showMessage(text, type = 'info', targetId = 'messages') {
  const el = document.getElementById(targetId);
  if (el) el.innerHTML = `<div class="message ${type}">${text}</div>`;
}

export function clearMessage(targetId = 'messages') {
  const el = document.getElementById(targetId);
  if (el) el.innerHTML = '';
}

export function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
// Security
// ─────────────────────────────────────────────

export function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}
