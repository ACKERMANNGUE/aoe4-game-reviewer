# AOE4 Game Reviewer

A local web application that fetches your Age of Empires IV match data from [AoE4World](https://aoe4world.com), packages it into a structured JSON, and walks you through a ChatGPT-powered game review workflow. The app also provides an interactive in-app report viewer with charts covering economy, military composition, age-up timings, scores, and unit production.

> This project is still under active development. It is functional and usable as-is, but expect breaking changes and new features over time.

---

## What it does

1. You search for any player by name or AoE4World profile ID.
2. The app fetches the player's recent games from the AoE4World API.
3. You click a game to open its details.
4. The app fetches full game data: build order events, economy snapshots, military snapshots, unit statistics, and age-up timings.
5. A structured JSON is assembled from all this data.
6. A pre-built analysis prompt is generated. You copy it and paste it into ChatGPT.
7. ChatGPT produces a detailed written analysis of the game and saves it as a downloadable `.md` file.
8. You load the resulting `.md` file back into the app.
9. The app renders the full analysis alongside interactive charts directly in the browser.
10. Optionally, you can trigger a second ChatGPT task to generate a PDF report with embedded charts using the code interpreter.

Analyzed reports are saved in the browser's local storage so you can reopen them at any time without repeating the conversion.

---

## Requirements

### Runtime

- **Node.js** v18 or later (no npm install required -- the server uses only built-in Node.js modules)
- A modern browser (Chrome, Edge, Firefox, or Safari -- recent versions)

### ChatGPT account

- A **ChatGPT Plus or Pro** subscription is required for full functionality.
  - The analysis step uses a long structured prompt with embedded JSON data. GPT-4o or GPT-4.5 produces significantly better results than the free tier.
  - The `.md` file export relies on the **code interpreter** tool (file downloads), which is only available to Plus and Pro subscribers.
  - The optional PDF generation step also requires the code interpreter.
- The analysis *can* technically be run on the free tier, but the model will not be able to save and provide a download link for the `.md` file, which breaks the import flow in the app.

### AoE4World

- Your in-game match history must be set to **Public** for full data access.
  In-game: Options > Gameplay > Match History > Public.
- Private or custom game data requires an **AoE4World API key** (available from your AoE4World account settings). You can paste your key into the app's settings panel -- it is stored locally and never sent anywhere except the AoE4World API.

---

## Getting started

```bash
git clone https://github.com/your-username/aoe4-game-reviewer.git
cd aoe4-game-reviewer
./run.sh
```

Then open [http://localhost:8080](http://localhost:8080) in your browser.

On Windows you can run:

```cmd
node server.js
```

> Do not open `index.html` directly as a file. The app must be served through the local Node.js server because it proxies requests to the AoE4World API to avoid browser CORS restrictions, and it fetches build order data from AoE4World pages on your behalf.

---

## How the analysis workflow works in practice

1. Click a game in the list.
2. Click **Start conversion**. The app fetches all available data and assembles the JSON.
3. Click **Copy analysis prompt**. This copies a ChatGPT prompt with the full JSON embedded.
4. Open [ChatGPT](https://chatgpt.com) and paste the prompt into a new conversation.
5. ChatGPT will analyze the game and provide a download link for `aoe4_analysis_<game_id>.md`.
6. Download that file.
7. Back in the app, click **Load .md file** and select the downloaded file.
8. The report opens with the written analysis and all interactive charts.

---

## Customizing the analysis prompt

The prompt template is located at `prompts/analysis.md`.

**Important:** the current prompt instructs ChatGPT to write the analysis in French. This is intentional for the original author's use. If you want the analysis in English or another language, open `prompts/analysis.md` and find the line:

```
Respond in French.
```

Replace it with your preferred instruction, for example:

```
Respond in English.
```

You can also edit the analytical framework, the output structure, or the level of detail to match your own coaching preferences. The prompt is plain Markdown and designed to be modified.

A second prompt template at `prompts/pdf-task.md` controls the PDF generation task. It can be adjusted independently.

---

## Features

- Player search by name, profile ID, or AoE4World URL
- Configurable game list limit (5, 10, 20, 50 games)
- Filter by game mode (ranked solo, ranked team, quick match, custom)
- Filter by map
- Full game detail modal with player lineup, map, duration, and patch
- One-click conversion to structured JSON
- Copy-to-clipboard analysis prompt for ChatGPT
- JSON download for manual use or archiving
- In-app report viewer:
  - Rendered Markdown analysis
  - Economy overview chart (total resources over time, all players)
  - Military strength chart (total units over time, all players)
  - Per-player economy breakdown (food / gold / stone / wood)
  - Per-player military composition (stacked bar chart over time)
  - Per-player military and building production pie charts
  - Age-up timeline (floating bar chart with landmark names)
  - End-game scores radar chart
  - Unit stats comparison (produced / killed / lost)
  - APM comparison
- Save and reload reports from local storage
- Export report as a self-contained interactive HTML file
- PDF generation via ChatGPT code interpreter
- Multiple color themes
- Support for 1v1, team games (2v2, 3v3, 4v4), custom games, and games against AI opponents
- Saved profile list for quick access

---

## Project structure

```
index.html          Main page
server.js           Local Node.js server (static files + AoE4World API proxy)
run.sh              Launch script
css/
  style.css         All styles
js/
  app.js            Application logic and UI wiring
  api.js            AoE4World API calls
  exporter.js       Assembles the structured game JSON
  render.js         DOM rendering (game list, modals)
  report.js         In-app report viewer and charts
  build-order.js    Build order fetcher and parser
  prompts.js        Prompt template loader
  theme.js          Theme switcher
  utils.js          Shared utilities
  config.js         Constants (API base, civilization names, player colors)
prompts/
  analysis.md       ChatGPT analysis prompt template (edit this to customize)
  pdf-task.md       ChatGPT PDF generation prompt template
```

---

## Notes and known limitations

- The build order (timeline events) is scraped from the AoE4World game page HTML. This is the most fragile part of the data pipeline. If AoE4World changes its page structure, the build order parser may break. Economy and military snapshots come from the JSON API and are more stable.

  **Name and icon resolution** works in two layers (annoying but I didn't find a better way at this time) :
  1. *Automatic (primary):* the parser cross-references the JSON API data with the SSR-rendered HTML from the same page. It builds a word-index from every display name on the page (`"Batu Khan"` -> indexed under `"batu"` and `"khan"`) and uses it to match internal API slugs (`unit_khan`) to the correct CDN image and display name. No manual mapping is needed for this path.
  2. *Static fallback (secondary):* when the page HTML does not contain SSR build order content (private games, proxy timeout, custom matches), the parser falls back to constructing the CDN URL from the API icon path. A small table of known slug aliases in `js/build-order.js` (`SLUG_ALIASES`) handles cases where the API internal name differs from the CDN filename (e.g. `khan` -> `batu-khan-2`). If you encounter a broken icon exclusively in private/custom games and the icon is correct in public games, add the mapping there.
- Private and custom game data may not be accessible without an API key and a share URL provided by one of the participants.
- AI opponent data (name, economy, military) is only available when the match data is exported through this app. Older saved reports generated before this feature was added will show numbered placeholders instead of real AI names.
- Reports are stored in `localStorage`. They will be lost if you clear browser data. Use the HTML export feature to create permanent copies.
- The app has no backend and no user accounts. All data stays on your machine.
