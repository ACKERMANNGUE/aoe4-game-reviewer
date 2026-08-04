
---

## ADDITIONAL TASK - PDF report (code interpreter)

After completing the written analysis, use your **code interpreter** to generate
a PDF report of this game and provide it as a **downloadable file**.

Do NOT output the Python code as a text block. Execute it directly.

### Requirements
- Use only `matplotlib` and the Python standard library
- Output file: `aoe4_report_{{GAME_ID}}.pdf`
- Every player object in the JSON includes a `color` field (hex string).
  Use it as the primary color for all charts and tables involving that player.
- **MANDATORY: embed the full written analysis as `ANALYSIS_TEXT` in the code.
  Paginate it into text pages (~55 lines per page) using `PdfPages` and `fig.text()`.
  These are the first pages of the PDF (after the cover).
  Do NOT shorten, summarise, or replace this text with a placeholder.**
- **MANDATORY: the PDF MUST contain actual matplotlib charts.**
  If `economy_snapshots` is present -> economy charts are REQUIRED.
  If `military_snapshots` is present -> military charts are REQUIRED.
  Do NOT replace any chart with a text note saying data is unavailable.

### PDF structure

{{PDF_STRUCTURE}}

Execute the code now and provide the download link for `aoe4_report_{{GAME_ID}}.pdf`.
