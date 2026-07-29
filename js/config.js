/** API base URL
 * Requests go through the local server proxy (/api/*) to avoid browser CORS blocks.
 * server.js forwards /api/<path> -> https://aoe4world.com/api/v0/<path>
 */
export const API = '/api';

/**
 * CORS proxy list (tried in order).
 * All require an http:// origin -- launch via ./run.sh (Node server).
 */
export const PROXIES = [
  'https://corsproxy.io/?url=',
  'https://api.allorigins.win/raw?url=',
  'https://thingproxy.freeboard.io/fetch/',
];

export const CIV_LABELS = {
  abbasid_dynasty:     'Abbasid Dynasty',
  ayyubids:            'Ayyubids',
  byzantines:          'Byzantines',
  chinese:             'Chinese',
  delhi_sultanate:     'Delhi Sultanate',
  english:             'English',
  french:              'French',
  holy_roman_empire:   'Holy Roman Empire',
  house_of_lancaster:  'House of Lancaster',
  japanese:            'Japanese',
  jeanne_darc:         "Jeanne d'Arc",
  malians:             'Malians',
  mongols:             'Mongols',
  order_of_the_dragon: 'Order of the Dragon',
  ottomans:            'Ottomans',
  rus:                 'Rus',
  zhu_xi_legacy:       "Zhu Xi's Legacy",
  sengoku:             'Sengoku',
};

/**
 * Standard AoE4 player colors assigned by slot order.
 * The AoE4World API does not expose slot colors, so we assign them
 * positionally: team-0 players first, then team-1 players.
 */
export const PLAYER_COLORS = [
  '#C62828', // P1 – Red
  '#1565C0', // P2 – Blue
  '#F9A825', // P3 – Yellow/Gold
  '#6A1B9A', // P4 – Purple

  '#00838F', // P5 – Teal
  '#E65100', // P6 – Orange
  '#2E7D32', // P7 – Green
  '#AD1457', // P8 – Pink
];

export const LEADERBOARD_LABELS = {
  rm_solo: '1v1 Ranked',
  rm_team: 'Team Ranked',
  qm_1v1:  '1v1 Quick Match',
  qm_2v2:  '2v2 Quick Match',
};
