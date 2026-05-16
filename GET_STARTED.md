# Get Started — Naveen

You just got added as a collaborator on `Pbabu-Github/arvya-closer`. This file tells you how to be productive in the next 5 minutes.

## 1. Clone (~30s)

```bash
cd ~/Desktop                                              # or wherever you keep code
gh repo clone Pbabu-Github/arvya-closer
cd arvya-closer
git fetch origin
git checkout lane/shell                                   # your first lane (Electron main)
```

## 2. Install + boot (~60s)

```bash
bun install                                               # ~30s
cp .env.example .env                                      # then fill in keys you have
bun run dev                                               # boots Electron with both windows
```

You should see:
- Dashboard window opens automatically
- Button **"Open Live Overlay"** in the header — click → transparent overlay window appears
- The overlay is invisible to screen-share on macOS (we'll verify in your first task)

## 3. Read the plan

- `HACKATHON.md` — the locked plan, demo narrative, lane assignments, hour-0 sprint, critical fixes.
- `README.md` — quick reference of what's in `src/` and `electron/`.
- The full design doc is on Prashanth's machine at `~/.gstack/projects/garrytan-gbrain/prashanthbabu-master-arvya-closer-design-20260516-163107.md`. Ask him to paste it or check it in if you want the full reasoning.

## 4. Your lanes (~3 in total)

You own three branches. Use git worktrees so you can move between them without re-installing deps.

```bash
# Inside ~/Desktop/arvya-closer (on lane/shell)
git worktree add ../arvya-closer-brain lane/brain
git worktree add ../arvya-closer-api lane/api

# Now you have three working copies:
# ~/Desktop/arvya-closer          → lane/shell
# ~/Desktop/arvya-closer-brain    → lane/brain
# ~/Desktop/arvya-closer-api      → lane/api
```

`cd` to switch lanes. Each worktree shares the same `node_modules` after `bun install` in `arvya-closer` (Bun symlinks them). If anything breaks, just `bun install` inside the worktree directory.

### Lane SHELL — `lane/shell` — your hour-0 lane

**Files**: `electron/main/index.ts`, `electron/preload/index.ts`

**Hour 0 (first 30 min):**
1. **Verify `setContentProtection(true)` works on your demo Mac.**
   ```bash
   bun run dev
   # Click "Open Live Overlay"
   # Open QuickTime → File → New Screen Recording → record 30s while moving your mouse
   # Stop, play back. The overlay region should be BLANK in the recording.
   ```
   If it works → ship. If it fails → tell Prashanth, we drop the overlay leg.
2. Add a real `dock` / menu bar item so the user can show/hide overlay.
3. Test the IPC roundtrip — call `pmf.openOverlay()` from the dashboard React → overlay should appear.

**Hour 1+:** Wire the IPC handlers in `electron/main/index.ts`. Right now they're all TODO stubs. The renderer calls go through `window.pmf.*` → preload → main. Implement each handler to call the lib in `src/lib/*` (which you also build).

### Lane BRAIN — `lane/brain` — the moat

**Files**: `src/lib/gbrain-client.ts` (new), `scripts/seed-brain.ts` (already scaffolded), `scripts/ingest-meeting-notes.ts` (new), `src/renderer/dashboard/components/BrainSeedPanel.tsx` (already scaffolded — wire it up)

**Hour 0 (parallel with SHELL):**
1. Get gbrain running on Prashanth's machine. He has the gbrain repo at `~/Desktop/gbrain`.
   ```bash
   # On Prashanth's machine:
   cd ~/Desktop/gbrain
   bun run build:bin     # or just `bun run src/cli.ts`
   gbrain serve --http --port 3131 &
   gbrain auth register-client closer --grant-types client_credentials --scopes "read write"
   # Copy the client_id + client_secret → add to arvya-closer/.env on BOTH machines
   ```
2. Implement `src/lib/gbrain-client.ts`:
   - `mintToken()` — POST to `${GBRAIN_HTTP_URL}/token` with `grant_type=client_credentials`, `client_id`, `client_secret`. Cache for 50 min.
   - `mcpCall(op, params)` — POST to `${GBRAIN_HTTP_URL}/mcp` with Bearer token, JSON-RPC `tools/call` envelope.
   - `query(q)`, `search(q)`, `putPage(slug, content)`, `getBrainIdentity()` — thin wrappers.
3. Wire the IPC handlers in `electron/main/index.ts` to call your client.

**Hour 1: seed the brain.**
Run the seed script with Prashanth's local Arvya content + (if available) the Drive download:
```bash
# Default sources (Prashanth's Mac local Arvya content):
bun run scripts/seed-brain.ts --dry-run    # see what would be ingested first
bun run scripts/seed-brain.ts              # actually do it

# Add Drive download (if Prashanth downloads the Arvya Drive folder as a zip):
bun run scripts/seed-brain.ts --add ~/Desktop/arvya-drive-seed
```
After it finishes, verify:
```bash
gbrain query "what are Arvya's most common buyer objections?"
gbrain stats     # should show real numbers — pages, chunks, last sync
```

**Hour 2+:** Pre-cache the Demo Autopsy result at `data/demo-autopsy-result.json` so the on-stage beat is an animated reveal of cached output (NOT a live LLM call). Run the autopsy LLM once via `gbrain query` + Anthropic over the 15 calls, save the JSON.

### Lane API — `lane/api` — Hog + Groq + Anthropic + ZeroEntropy

**Files**: `src/lib/hog-client.ts`, `src/lib/groq-client.ts`, `src/lib/anthropic-client.ts`, `src/lib/relevance.ts`, `src/lib/coach-engine.ts` (all new)

**Hour 0:** Verify each API with a curl/script. Save sample responses to `data/api-samples/`.

**Hour 1+:** Implement each client + the Live Coach engine.

**Live Coach engine — non-negotiable spec:**
- Use Anthropic's `tools` API with `tool_choice: { type: 'tool', name: 'emit_card' }`
- Schema: `{ type: 'say'|'ask'|'avoid'|'show'|'close', headline: string (≤60 chars), body: string (≤160 chars), confidence: 0..1 }`
- `max_tokens: 150` (hard cap)
- Render-side: trim `body` to 120 chars defensively
- See `HACKATHON.md` § "Critical fixes from /autoplan reviewer" item 3 for the full pseudocode.

## 5. Coordinate with Prashanth

- **Push every ~30 min** to your lane branch. Don't sit on uncommitted work.
- **Ping him** in Slack/Discord when you're ready to merge a lane to `main`. He owns the merge.
- **Stand up every 60 min** — 3 min, what's done, what's blocking.
- **Hour-0 STAND-UP** at +60 min from now: confirm setContentProtection works (you), gbrain MCP works (you), HOG/Groq/Anthropic keys work (you), Prashanth has the dashboard rendering at all.

## 6. Need help? Read these in order

1. `HACKATHON.md` — your operational plan
2. `README.md` — file layout reference
3. The TODO comments in `electron/main/index.ts` — tell you exactly what each IPC handler needs to do
4. Prashanth on Slack/Discord — for everything else

Go.
