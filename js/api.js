import { API } from './config.js';

export async function apiGet(endpoint) {
  const url = `${API}${endpoint}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}: ${endpoint}`);
  return res.json();
}

export async function searchPlayer(query) {
  const data = await apiGet(`/players/search?query=${encodeURIComponent(query)}`);
  return data.players || [];
}

export async function getPlayerById(profileId) {
  return apiGet(`/players/${profileId}`);
}

/** @param {string|number} profileId @param {number} limit @param {string} gameType @param {string} apiKey */
export async function getGames(profileId, limit = 5, gameType = '', apiKey = '') {
  const typeParam = gameType ? `&leaderboard=${gameType}` : '';
  const keyParam  = apiKey   ? `&api_key=${encodeURIComponent(apiKey)}` : '';
  const data = await apiGet(`/players/${profileId}/games?limit=${limit}${typeParam}${keyParam}`);
  return data.games || [];
}

/** Try global endpoint first; fall back to player-specific endpoint (required for private/custom games). */
export async function getGameDetail(gameId, profileId = null, apiKey = '') {
  // Global endpoint works for public games
  const globalPath = `/games/${gameId}`;
  console.log('[api] getGameDetail attempt (global):', globalPath);
  try {
    const data = await apiGet(globalPath);
    console.log('[api] getGameDetail global OK');
    return data;
  } catch (e) {
    console.log('[api] getGameDetail global failed:', e.message);
  }

  // Player-specific endpoint - required for private/custom games
  if (profileId) {
    const keyParam     = apiKey ? `?api_key=${encodeURIComponent(apiKey)}` : '';
    const playerPath   = `/players/${profileId}/games/${gameId}${keyParam}`;
    console.log('[api] getGameDetail attempt (player-specific):', playerPath);
    const data = await apiGet(playerPath);
    console.log('[api] getGameDetail player-specific OK');
    return data;
  }

  throw new Error(`Game ${gameId} not found`);
}
