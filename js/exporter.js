import { CIV_LABELS, PLAYER_COLORS } from './config.js';

/**
 * Build the structured JSON object exported to the user / sent to ChatGPT.
 *
 * myTeam  – array of player objects on the searched player's team
 * oppTeam – array of player objects on the opposing team
 */
export function buildGameJSON(profileId, game, myTeam, oppTeam, timeline, { economySnapshots = null, militarySnapshots = null, statistics = null } = {}) {
  const dur      = game.duration;
  const mm       = Math.floor(dur / 60);
  const ss       = String(dur % 60).padStart(2, '0');

  const hasEco = !!economySnapshots;
  const hasMil = !!militarySnapshots;
  const hasSta = !!statistics;

  const noteItems = [];
  if (timeline.length > 0)  noteItems.push(`Build order: ${timeline.length} events`);
  if (hasEco)               noteItems.push('economy snapshots available (60s)');
  if (hasMil)               noteItems.push('military snapshots available (60s)');
  if (!timeline.length)     noteItems.push('Build order unavailable -- run via ./run.sh');

  const mapPlayer = (p, isYou, colorIdx) => ({
    profile_id:           p.profile_id ?? null,
    name:                 p.name,
    is_you:               isYou,
    color:                PLAYER_COLORS[colorIdx] ?? PLAYER_COLORS[0],
    civilization:         p.civilization ?? null,
    civilization_display: CIV_LABELS[p.civilization] || p.civilization || 'AI',
    rating:               p.rating      ?? null,
    rating_diff:          p.rating_diff  ?? null,
    mmr:                  p.mmr          ?? null,
    mmr_diff:             p.mmr_diff     ?? null,
  });

  // When oppTeam is empty (e.g. games vs AI in custom lobbies), the API does not
  // populate the opposing team's player list. Synthesize entries from snapshot data
  // so the exported JSON has a complete picture of all participants.
  const resolvedOppTeam = oppTeam.length > 0 ? oppTeam : (() => {
    const myNames = new Set(myTeam.map(p => p.name));
    const aiNames = new Set();
    for (const src of [economySnapshots, militarySnapshots, statistics]) {
      if (!src) continue;
      for (const entry of Object.values(src)) {
        if (entry?.name && !myNames.has(entry.name)) aiNames.add(entry.name);
      }
    }
    return [...aiNames].map(name => ({ name, profile_id: null, civilization: null, result: null, rating: null, rating_diff: null, mmr: null, mmr_diff: null }));
  })();

  const myResult  = myTeam[0]?.result          ?? null;
  const oppResult = resolvedOppTeam[0]?.result ?? null;

  return {
    match: {
      game_id:          game.game_id,
      map:              game.map,
      team_size:        Math.max(myTeam.length, resolvedOppTeam.length, 1),
      duration_seconds: dur,
      duration_display: `${mm}:${ss}`,
      patch:            game.patch,
      season:           game.season,
      server:           game.server,
      leaderboard:      game.leaderboard,
      started_at:       game.started_at,
      aoe4world_url:    `https://aoe4world.com/players/${profileId}/games/${game.game_id}`,
    },
    teams: [
      {
        result:  myResult,
        players: myTeam.map((p, i) => mapPlayer(p, String(p.profile_id) === String(profileId), i)),
      },
      {
        result:  oppResult,
        players: resolvedOppTeam.map((p, i) => mapPlayer(p, false, myTeam.length + i)),
      },
    ],
    timeline,
    economy_snapshots:  economySnapshots,
    military_snapshots: militarySnapshots,
    statistics,
    data_quality: {
      timeline_available: timeline.length > 0,
      timeline_events:    timeline.length,
      economy_snapshots:  hasEco,
      army_snapshots:     hasMil,
      statistics:         hasSta,
      note:               noteItems.join(' - '),
    },
  };
}
