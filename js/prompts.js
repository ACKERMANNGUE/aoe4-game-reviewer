// js/prompts.js
// Loads prompt templates from the /prompts/ directory and exposes async helpers.

const _cache = {};

async function load(name) {
  if (!_cache[name]) {
    const res = await fetch(`/prompts/${name}`);
    if (!res.ok) throw new Error(`Could not load prompt template: ${name} (${res.status})`);
    _cache[name] = await res.text();
  }
  return _cache[name];
}

/** Preload all prompt templates upfront for better UX. */
export async function preloadPrompts() {
  await Promise.all([
    load('analysis.md'),
    load('pdf-task.md'),
  ]);
}

/**
 * Build the full ChatGPT analysis prompt embedding the game JSON.
 * @returns {Promise<string>}
 */
export async function getPrompt(playerName, gameJSON) {
  const gameId   = gameJSON.match?.game_id ?? 'game';
  const template = await load('analysis.md');
  const system   = template
    .replaceAll('{{PLAYER}}',  playerName)
    .replaceAll('{{GAME_ID}}', String(gameId));

  return `${system}

---

Here is the match data:

\`\`\`json
${JSON.stringify(gameJSON, null, 2)}
\`\`\`

---

REMINDER: Use your code interpreter to save the full analysis to \`aoe4_analysis_${gameId}.md\` and provide the download link. Show only a brief verdict sentence in the chat.`;
}

// ─────────────────────────────────────────────
// PDF prompt helpers
// ─────────────────────────────────────────────

/**
 * Build the PDF structure description embedded in the pdf-task template.
 * Sections are ordered: Cover -> Analysis text -> Per-player -> Overall eco -> Overall mil -> Stats.
 */
function buildPdfStructure(hasEco, hasMil, totalPlayers) {
  const parts = [];
  let page = 1;

  // Cover
  parts.push(
`**Page ${page++} - Cover**
- Title: "AoE4 Match Report"
- Map, date, duration, patch
- Team 1 vs Team 2 (player names + civilizations + result)
- Small colored legend using each player's \`color\` field`
  );

  // Written analysis text pages (MANDATORY)
  parts.push(
`**Pages ${page}–${page + 8} (estimated, ~5–10 pages) - Written analysis**
- At the very top of the script, define a variable ANALYSIS_TEXT that contains
  your full written analysis from OUTPUT 1 as a Python multi-line string.
  This is MANDATORY - the analysis text MUST be embedded verbatim in the script.
- Paginate ANALYSIS_TEXT into pages of approximately 55 lines each.
- Render each page using matplotlib fig.text() with a legible font (9–10pt).
- Lines starting with # are section headings - render them bold or at a slightly
  larger font size to preserve the document structure.
- These pages are the MOST IMPORTANT part of the PDF. Do NOT skip, shorten,
  summarise, or replace the analysis with a placeholder.`
  );
  page += 9; // estimated; actual page count depends on analysis length

  // Per-player pages (one page per player)
  if (hasEco || hasMil) {
    const perPlayerLines = [
      hasEco
        ? '- Economy over time: line chart of food (green), gold (yellow), stone (grey), wood (brown) with vertical age-up markers'
        : null,
      hasMil
        ? '- Military over time: stacked area chart of unit types with vertical age-up markers'
        : null,
    ].filter(Boolean).join('\n');

    const lastPlayerPage = page + totalPlayers - 1;
    parts.push(
`**Pages ${page}–${lastPlayerPage} - Per-player breakdown (${totalPlayers} pages, one per player)**
For each player, one dedicated page containing:
${perPlayerLines}
- Chart title and accent color taken from the player's \`color\` field`
    );
    page = lastPlayerPage + 1;
  }

  // Overall eco comparison
  if (hasEco) {
    parts.push(
`**Page ${page++} - Economy comparison (all players)**
- One line per player on a single chart
- X axis: time in minutes, Y axis: total resources
- Use each player's \`color\` field for their line
- Legend + grid + vertical age-up markers`
    );
  }

  // Overall military comparison
  if (hasMil) {
    parts.push(
`**Page ${page++} - Military comparison (all players)**
- One line per player: total army units alive at each 60s tick
- X axis: time in minutes, Y axis: unit count
- Use each player's \`color\` field for their line
- Legend + grid + vertical age-up markers`
    );
  }

  // Statistics table (always last)
  parts.push(
`**Page ${page} - Statistics table**
- Side-by-side table: APM, units produced, units lost, units killed,
  buildings built, buildings lost, upgrades researched, total commands,
  resources gathered, resources spent
- Use a matplotlib table or text layout`
  );

  return parts.join('\n\n');
}

/**
 * Extended prompt that asks ChatGPT to:
 *   1. Write a full game analysis in the chat (OUTPUT 1)
 *   2. Use its code interpreter to directly generate and provide a
 *      downloadable PDF containing the analysis text + charts (OUTPUT 2)
 *
 * Structure (to prevent ChatGPT from forgetting the PDF):
 *   1. Mandatory notice   ← before everything, impossible to miss
 *   2. Analysis system prompt
 *   3. Match data (JSON)
 *   4. Hard reminder + full PDF requirements  ← repeated after the JSON
 *
 * @returns {Promise<string>}
 */
export async function getPDFPrompt(playerName, gameJSON) {
  const gameId       = gameJSON.match?.game_id ?? 'game';
  const hasEco       = !!gameJSON.economy_snapshots;
  const hasMil       = !!gameJSON.military_snapshots;
  const totalPlayers = gameJSON.teams?.flatMap(t => t.players ?? []).length ?? 2;

  const [analysisTpl, pdfTaskTpl] = await Promise.all([
    load('analysis.md'),
    load('pdf-task.md'),
  ]);

  const system  = analysisTpl.replaceAll('{{PLAYER}}', playerName);
  const pdfTask = pdfTaskTpl
    .replaceAll('{{GAME_ID}}',    gameId)
    .replace('{{PDF_STRUCTURE}}', buildPdfStructure(hasEco, hasMil, totalPlayers));

  // ── 1. Mandatory preamble (read BEFORE the analysis instructions) ──────────
  const preamble =
`⚠️ THIS PROMPT REQUIRES TWO MANDATORY OUTPUTS ⚠️

You MUST produce BOTH of the following before ending your response:

  OUTPUT 1 - Written game analysis in this chat  (instructions follow below)
  OUTPUT 2 - A PDF file generated via your code interpreter
             Use code interpreter to execute the code and provide a download link.
             Do NOT output Python code as a text block - EXECUTE it.

Do NOT finish your response after the written analysis.
The PDF is NOT optional. It is a required part of this prompt.
If your response ends without a downloadable PDF link, it is incomplete.

The PDF MUST contain actual matplotlib charts AND the full written analysis
as paginated text pages. A PDF with only text or only charts is NOT acceptable.
If economy or military data is present, the corresponding charts are MANDATORY.

──────────────────────────────────────────────────────────────────────────────`;

  // ── 4. Hard reminder (read AFTER the long JSON blob) ──────────────────────
  const reminder =
`──────────────────────────────────────────────────────────────────────────────
⚠️ REMINDER - DO NOT STOP HERE ⚠️

You have now read the match data.
Produce the written analysis (OUTPUT 1), then IMMEDIATELY use your code
interpreter to generate the PDF (OUTPUT 2). Do not end between the two.

CRITICAL CHECKLIST - the PDF MUST contain:
  ✓ ANALYSIS_TEXT = your full written analysis, paginated as text pages (pages 1–N)
  ✓ Economy chart per player  (if economy_snapshots is present in the JSON)
  ✓ Military chart per player (if military_snapshots is present in the JSON)
  ✓ Overall economy comparison chart  (all players on one figure)
  ✓ Overall military comparison chart (all players on one figure)
  ✓ Statistics table
Do NOT output Python code as text. Execute it and provide the download link.
──────────────────────────────────────────────────────────────────────────────
${pdfTask}`;

  return `${preamble}

${system}

---

Here is the match data:

\`\`\`json
${JSON.stringify(gameJSON, null, 2)}
\`\`\`

${reminder}`;
}

