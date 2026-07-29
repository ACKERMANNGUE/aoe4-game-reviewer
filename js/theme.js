/**
 * Theme system - predefined palettes + day/night toggle + coolors.co random fetch.
 *
 * All themes map the same set of CSS custom properties onto :root via
 * element.style.setProperty(), so every part of the app reacts instantly.
 *
 */

export const THEMES = [
  {
    id: 'nuit',
    name: 'Night',
    preview: ['#0a0a0a', '#141414', '#c9a227'],
    vars: {
      '--bg': '#0a0a0a', '--bg-card': '#141414', '--bg-card-hover': '#1c1c1c',
      '--bg-modal': '#111111', '--border': '#2a2a2a', '--border-light': '#3a3a3a',
      '--gold': '#c9a227', '--gold-dark': '#a0801e',
      '--text': '#d0d0d0', '--text-muted': '#666666', '--text-bright': '#eeeeee',
    },
  },
  {
    id: 'jour',
    name: 'Day',
    preview: ['#f0f0f0', '#ffffff', '#c9a227'],
    vars: {
      '--bg': '#f0f0f0', '--bg-card': '#ffffff', '--bg-card-hover': '#f5f5f5',
      '--bg-modal': '#ffffff', '--border': '#e0e0e0', '--border-light': '#cccccc',
      '--gold': '#b8891e', '--gold-dark': '#8a6414',
      '--text': '#444444', '--text-muted': '#999999', '--text-bright': '#111111',
    },
  },
  {
    id: 'bordeaux',
    name: 'Bordeaux',
    preview: ['#17191e', '#7f1b38', '#f7edf6'],
    vars: {
      '--bg': '#130f13', '--bg-card': '#17191e', '--bg-card-hover': '#261020',
      '--bg-modal': '#141218', '--border': '#3a1428', '--border-light': '#7a4a70',
      '--gold': '#7f1b38', '--gold-dark': '#5a1028',
      '--text': '#e0c8d8', '--text-muted': '#7a4a70', '--text-bright': '#f7edf6',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    preview: ['#253031', '#2978a0', '#bcab79'],
    vars: {
      '--bg': '#1a2425', '--bg-card': '#253031', '--bg-card-hover': '#2c3a3c',
      '--bg-modal': '#1f2d2e', '--border': '#315659', '--border-light': '#2978a0',
      '--gold': '#bcab79', '--gold-dark': '#9a8b5f',
      '--text': '#b8d8e8', '--text-muted': '#4a7080', '--text-bright': '#c6e0ff',
    },
  },
  {
    id: 'ombre',
    name: 'Shadow',
    preview: ['#37323e', '#deb841', '#bfbdc1'],
    vars: {
      '--bg': '#1e1b22', '--bg-card': '#28242e', '--bg-card-hover': '#37323e',
      '--bg-modal': '#252030', '--border': '#37323e', '--border-light': '#6d6a75',
      '--gold': '#deb841', '--gold-dark': '#b8911a',
      '--text': '#bfbdc1', '--text-muted': '#6d6a75', '--text-bright': '#f0eef2',
    },
  },
  {
    id: 'minuit',
    name: 'Midnight',
    preview: ['#1c0221', '#e9eb87', '#b9f18c'],
    vars: {
      '--bg': '#140118', '--bg-card': '#1c0221', '--bg-card-hover': '#280a30',
      '--bg-modal': '#1a0220', '--border': '#3a1845', '--border-light': '#7b5e7b',
      '--gold': '#e9eb87', '--gold-dark': '#c0c248',
      '--text': '#d8d0e0', '--text-muted': '#7b5e7b', '--text-bright': '#f4f6b4',
    },
  },
  {
    id: 'menthe',
    name: 'Mint',
    preview: ['#0f1f1f', '#40c9a2', '#e5f9e0'],
    vars: {
      '--bg': '#0f1f1f', '--bg-card': '#182828', '--bg-card-hover': '#253030',
      '--bg-modal': '#182828', '--border': '#253030', '--border-light': '#2f9c95',
      '--gold': '#40c9a2', '--gold-dark': '#2a8878',
      '--text': '#c0eedd', '--text-muted': '#3a6a60', '--text-bright': '#e5f9e0',
    },
  },
  {
    id: 'ice-ice',
    name: 'Ice Ice',
    preview: ['#d8e1e9', '#759eb8', '#7392b7'],
    vars: {
      '--bg': '#d8e1e9', '--bg-card': '#c5d5ea', '--bg-card-hover': '#b3c5d7',
      '--bg-modal': '#d8e1e9', '--border': '#b3c5d7', '--border-light': '#7392b7',
      '--gold': '#759eb8', '--gold-dark': '#5a7d96',
      '--text': '#1e2a35', '--text-muted': '#4a6070', '--text-bright': '#0e1820',
    },
  },
  {
    id: 'day n nite',
    name: 'Day n Nite',
    preview: ['#111415', '#dd645f', '#d0dce0'],
    vars: {
      '--bg': '#111415', '--bg-card': '#191f21', '--bg-card-hover': '#22292c',
      '--bg-modal': '#111415', '--border': '#2a3235', '--border-light': '#7e3f3d',
      '--gold': '#dd645f', '--gold-dark': '#b84a45',
      '--text': '#d0dce0', '--text-muted': '#7e8f94', '--text-bright': '#eaf2f5',
    },
  }
];

// ─────────────────────────────────────────────
// Apply / save / restore
// ─────────────────────────────────────────────

let currentThemeId = 'nuit';

/** Apply a theme definition to :root CSS custom properties. */
export function applyTheme(theme) {
  const root = document.documentElement;
  for (const [prop, val] of Object.entries(theme.vars)) {
    root.style.setProperty(prop, val);
  }
  currentThemeId = theme.id;
  localStorage.setItem('aoe4-theme', theme.id);

  // Mark active swatch
  document.querySelectorAll('.theme-swatch').forEach(el => {
    el.classList.toggle('active', el.dataset.themeId === theme.id);
  });
}

/** Apply a theme by id. */
export function applyThemeById(id) {
  const theme = THEMES.find(t => t.id === id);
  if (theme) applyTheme(theme);
}

/** Restore saved theme from localStorage (called on init). */
export function restoreTheme() {
  const saved = localStorage.getItem('aoe4-theme');
  if (saved) applyThemeById(saved);
}

// ─────────────────────────────────────────────
// Random palette from coolors.co (+ local fallback)
// ─────────────────────────────────────────────

/**
 * Fetch a random 5-color palette.
 * Tries coolors.co trending page (via allorigins proxy), then falls back to
 * an algorithmic HSL-based generator.
 *
 * Returns an array of 5 hex strings like ['#rrggbb', ...].
 */
export async function fetchRandomPalette() {
  // ── Attempt: coolors.co trending palettes (server-side rendered) ──
  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent('https://coolors.co/palettes/trending')}`;
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 8000);
    const res  = await fetch(proxyUrl, { signal: ctrl.signal });
    clearTimeout(tid);

    if (res.ok) {
      const { contents } = await res.json();
      // Coolors encodes palettes in URLs like href="/palette/aa1111-bb2222-..."
      const matches = [...(contents || '').matchAll(/href="\/palette\/([0-9a-f]{6}(?:-[0-9a-f]{6}){4})"/gi)];
      if (matches.length > 0) {
        const pick = matches[Math.floor(Math.random() * matches.length)];
        return pick[1].split('-').map(c => `#${c}`);
      }
    }
  } catch (_) {}

  // ── Fallback: algorithmic harmonious palette ──
  return generateHarmonious();
}

/**
 * Apply a raw 5-color array from coolors.co (or any source) to CSS variables.
 * Sorts by luminance and assigns dark->light roles accordingly.
 */
export function applyRawPalette(colors) {
  const sorted = [...colors].sort((a, b) => luminance(a) - luminance(b));
  const avgLum = sorted.reduce((s, c) => s + luminance(c), 0) / sorted.length;
  const isDark = avgLum < 0.25;

  const root = document.documentElement;
  const set  = (p, v) => root.style.setProperty(p, v);

  if (isDark) {
    set('--bg',            sorted[0]);
    set('--bg-card',       sorted[1]);
    set('--bg-card-hover', blend(sorted[1], sorted[2], 0.5));
    set('--bg-modal',      sorted[0]);
    set('--border',        blend(sorted[1], sorted[2], 0.6));
    set('--border-light',  sorted[2]);
    set('--gold',          sorted[3]);
    set('--gold-dark',     blend(sorted[2], sorted[3], 0.5));
    set('--text',          sorted[4]);
    set('--text-muted',    blend(sorted[2], sorted[3], 0.7));
    set('--text-bright',   sorted[4]);
  } else {
    set('--bg',            sorted[4]);
    set('--bg-card',       blend(sorted[3], sorted[4], 0.5));
    set('--bg-card-hover', sorted[3]);
    set('--bg-modal',      sorted[4]);
    set('--border',        sorted[3]);
    set('--border-light',  sorted[2]);
    set('--gold',          sorted[1]);
    set('--gold-dark',     sorted[0]);
    set('--text',          blend(sorted[0], sorted[1], 0.3));
    set('--text-muted',    sorted[2]);
    set('--text-bright',   sorted[0]);
  }

  currentThemeId = 'custom';
  localStorage.removeItem('aoe4-theme');

  document.querySelectorAll('.theme-swatch').forEach(el => el.classList.remove('active'));
}

// ─────────────────────────────────────────────
// Color math helpers
// ─────────────────────────────────────────────

/** Relative luminance of a hex color (WCAG formula). */
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Linear blend between two hex colors (t=0 -> a, t=1 -> b). */
function blend(hexA, hexB, t) {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return rgbToHex(r, g, b);
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex(Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255));
}

/** Generate a harmonious 5-color palette using HSL. */
function generateHarmonious() {
  const h  = Math.random() * 360;
  const h2 = (h + 150 + Math.random() * 60) % 360;
  const isDark = Math.random() > 0.35; // bias towards dark

  if (isDark) {
    return [
      hslToHex(h,  12, 5 + Math.random() * 5),
      hslToHex(h,  15, 10 + Math.random() * 5),
      hslToHex(h2, 35, 30 + Math.random() * 15),
      hslToHex(h2, 65, 55 + Math.random() * 15),
      hslToHex(h,  20, 82 + Math.random() * 10),
    ];
  } else {
    return [
      hslToHex(h,  30, 88 + Math.random() * 8),
      hslToHex(h,  25, 78 + Math.random() * 8),
      hslToHex(h,  20, 65 + Math.random() * 8),
      hslToHex(h2, 60, 32 + Math.random() * 15),
      hslToHex(h2, 50, 12 + Math.random() * 10),
    ];
  }
}
