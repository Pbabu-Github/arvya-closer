# Notes from lane/brain-pb (build session 2026-05-16)

## What landed on lane/brain-pb

1. `scripts/precache-demo-autopsy.ts` — 5-pattern gbrain search → Sonnet structured
   JSON → `data/demo-autopsy-result.json` (gitignored). Includes a fallback path
   that fills the receipt with real gbrain quotes if Anthropic is down.
2. `electron/main/index.ts` — `pmf:autopsy:load-cached` IPC now reads
   `data/demo-autopsy-result.json` and returns `{ok:true, ...data}`.
3. `src/lib/receipt-from-synthesis.ts` — `buildReceipt({prospectName, transcriptText, dateIso, ...})`
   one-shot Anthropic call producing a `LearningReceipt`. NOT yet wired to an IPC
   handler — the dashboard renderer should call it via a new
   `pmf:receipt:build` handler once the renderer-side End-call action exists.

## Blocking issue — Anthropic credit balance

The Anthropic API key in `.env` is returning HTTP 400 with:

> "Your credit balance is too low to access the Anthropic API.
>  Please go to Plans & Billing to upgrade or purchase credits."

This means:
- The precache script's LLM synthesis silently falls back to the hardcoded
  lane labels + counts. The numbers in the fallback are the design-doc
  numbers (security 8/15, dealcloud 5/15, crm_stale 12/15, buyer_tracker 10/15,
  over_demo 7/15) so the demo still tells the right story, but the quotes
  are pulled directly from gbrain chunks rather than LLM-summarized.
- `buildReceipt` likewise returns a synthetic receipt when called.
- The Live Coach (lane/api) and Outreach Agent will hit the same wall once
  they try to call Anthropic.

**Fix before demo:** top up Anthropic credits, then re-run
`bun run scripts/precache-demo-autopsy.ts` to regenerate
`data/demo-autopsy-result.json` with the real LLM-extracted quotes + dates.

## Bonus fix shipped — gbrain client patched for gbrain 0.33.x

`src/lib/gbrain-client.ts` had two compat breakages against the running
gbrain server (0.33.2.1):

1. Server requires `Accept: application/json, text/event-stream` — I added it.
2. The `search` and `query` MCP tools expect arg name `query`, not `q`. I
   renamed the args and added SSE response parsing + a `content[0].text`
   structured-extraction helper.

Without this fix every `gbrainClient.search(...)` call (including the existing
`pmf:gbrain:search` IPC handler) was throwing HTTP 406. Verified live against
the running server — `getBrainIdentity()` returns 181 pages / 944 chunks,
`search("DealCloud")` returns 4 chunks with scores.

Naveen's lane/api work that touches the gbrain client should pick this up
when they merge from lane/brain-pb.

## Local-only state (not committed)

- `.env` is symlinked from `/Users/prashanthbabu/Desktop/arvya-closer/.env`.
  The worktree didn't have an `.env` of its own. The symlink is gitignored.
