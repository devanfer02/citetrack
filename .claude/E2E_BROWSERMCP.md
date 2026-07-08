# Browser E2E Testing (browsermcp) — Agent Runbook

This is the self-serve guide for end-to-end testing CiteTrack in a real Chrome
browser via the **browsermcp** MCP server, in `dev` mode. It exists so the
agent can run E2E flows **without asking the user for step-by-step prompts**.

## Division of labor

- **The user does exactly one thing:** opens Chrome and clicks the browsermcp
  extension's **Connect** button on a tab pointed at `http://localhost:3000`.
  browsermcp drives whatever tab is connected; it cannot open or connect a tab
  on its own.
- **The agent does everything else:** start the dev server, seed data, navigate,
  click, type, screenshot, read console logs, assert.

If a `browser_*` tool returns `No connection to browser extension`, that means
the user has not connected a tab yet. Pause and ask them to click **Connect**,
then continue — do not treat it as a code failure.

## One-time environment (agent runs these)

```bash
# 1. Start the dev server (port 3000). Background it; don't block.
bun run dev          # via Bash run_in_background: true

# 2. Seed deterministic data for the feature under test.
#    For the evaluation-comparison feature, this ensures one finished
#    evaluation exists for EACH thesis example PDF:
bun .claude/scripts/seed-compare-e2e.ts
#    -> prints the two eval IDs + ready-to-open /history and /compare URLs.
#    Add FRESH=1 to force a fresh analysis run instead of reusing.
```

Permissions for `bun run dev`, `bun run build`, the seed script, and every
`mcp__browsermcp__browser_*` tool are pre-approved in
`.claude/settings.local.json`, so none of these prompt.

## browsermcp tool cheat-sheet

| Tool | Use for |
|------|---------|
| `browser_navigate({ url })` | Go to a URL. |
| `browser_snapshot()` | Accessibility tree of the page. **Get element `ref`s here before clicking.** |
| `browser_click({ element, ref })` | Click. `element` is a human description, `ref` comes from the latest snapshot. |
| `browser_type({ element, ref, text, submit })` | Type into a field. |
| `browser_hover` / `browser_select_option` / `browser_press_key` | Hover, select, keypress. |
| `browser_screenshot()` | Visual capture — use to confirm layout/rendering for the user. |
| `browser_get_console_logs()` | Pull console output — check for client errors after each step. |
| `browser_wait({ time })` | Wait for async UI (loaders, query refetch). |

**Golden loop:** `navigate` → `snapshot` (grab refs) → act (`click`/`type`) →
`snapshot` again (refs are invalidated by navigation/DOM change) → assert →
`screenshot` for the user. Re-snapshot after every navigation; never reuse a
stale `ref`.

## Flow under test: Evaluation Comparison

**Goal:** verify a student can compare two evaluations and see the scoreboard +
resolved / still-present / newly-introduced buckets.

Preconditions: dev server up, seed run (two thesis evals exist), tab connected.

1. `browser_navigate({ url: "http://localhost:3000/history?kind=evaluation" })`
2. `browser_snapshot()` — confirm the Riwayat list renders and that `done`
   evaluation rows show a checkbox (aria-label `Pilih <filename> untuk dibandingkan`).
   Assert: checkboxes appear only on finished rows.
3. Click the checkbox on the `thesis_example.pdf` row → `browser_click`.
4. `browser_snapshot()` — assert a sticky bar appears reading
   "Pilih satu lagi untuk membandingkan." and the "Bandingkan dipilih" button
   is disabled.
5. Click the checkbox on the `thesis_example_2.pdf` row.
6. `browser_snapshot()` — assert the sticky bar now reads "Dua evaluation
   dipilih." and "Bandingkan dipilih" is enabled.
7. Click "Bandingkan dipilih".
8. `browser_wait({ time: 1 })` then `browser_snapshot()` — assert URL is
   `/evaluation/compare/<older>/<newer>` (older→newer canonical order) and the
   page shows, in order:
   - Header "Sebelum dan sesudah." with two filename pills.
   - "Ringkasan perubahan" scoreboard cards (Skor keseluruhan, Total temuan,
     Temuan KBBI, Temuan EYD) + the severity strip.
   - "Yang sudah beres." (resolved), "Yang masih perlu disentuh."
     (still present), "Yang baru muncul." (introduced) sections with counts.
   - "Per aturan" reductions/regressions.
9. `browser_screenshot()` — capture the full comparison for the user to validate.
10. `browser_get_console_logs()` — assert no client-side errors.
11. (If still-present has rows) click a still-present row → assert it navigates
    to `/evaluation/<afterId>?highlights=p.<n>;<token>` and the report opens on
    that page.

### Error-path checks (optional, fast)

- `browser_navigate` to `/evaluation/compare/<id>/<id>` (same id twice) → assert
  the friendly "Perbandingan gagal dibuka" view with "Kembali ke riwayat" link.
- `/evaluation/compare/<bogus-uuid>/<real-id>` → assert "tidak ditemukan" message.

## Reporting back

After the flow, summarize for the user: which assertions passed, attach the
screenshot, surface any console errors. **Final validation is the user's call** —
present the result and let them confirm the feature works.

## Known gotcha: flaky `click` / `screenshot` (this setup)

On this machine, `browser_click` and `browser_screenshot` frequently fail with
`WebSocket response timeout after 30000ms` — the action may or may not apply and
the call never returns. `browser_navigate`, `browser_snapshot`, and
`browser_get_console_logs` are reliable.

**Workaround — drive by URL state, not by clicking:**

- Selection-on-history is URL-backed, so instead of clicking checkboxes,
  navigate straight to the pre-selected URL:
  `/history?kind=evaluation&selected=%5B%22<id1>%22%2C%22<id2>%22%5D`
  then `snapshot` to assert both rows show `[checked]` and the sticky bar reads
  "Dua evaluation dipilih." with an enabled "Bandingkan dipilih" button.
- For the compare result, navigate directly to the destination the button
  targets: `/evaluation/compare/<id1>/<id2>` (it self-canonicalizes older→newer).
- The compare page's accessibility snapshot can exceed the tool's token limit
  because it renders **every** finding bucket (no truncation). When that happens
  the result is written to a file — `grep` it for headings/counts/numbers rather
  than reading the whole thing.
- Skip `screenshot`; rely on the snapshot text + `get_console_logs` for
  assertions, and tell the user a visual capture wasn't possible.

## Notes / gotchas

- The compare route canonicalizes URL order (older→newer by `createdAt`) via a
  redirect, so the final URL may swap the two IDs you passed. That's expected.
- Selection state lives in the URL (`?selected=[...]` JSON array) and survives
  pagination.
- History/compare are local-only (`isLocalEnv`); they 404 in public mode.
