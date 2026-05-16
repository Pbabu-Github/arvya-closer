# Arvya Closer — Hackathon Plan

GStack/GBrain hackathon. ~5h to ship. 2 engineers: **Prashanth + Naveen (@naveensb4)**.

Source of truth: the design doc at `~/.gstack/projects/garrytan-gbrain/prashanthbabu-master-arvya-closer-design-20260516-163107.md` on Prashanth's machine. This file is the **operational summary** for both engineers — what to build, who owns what, when to merge.

## What we're shipping

A single **Electron app** that runs locally on macOS, with two windows:

1. **Dashboard** — normal window. Mission Scoreboard with real `gbrain stats` numbers. Demo Autopsy panel that surfaces patterns from ~15 prior demos (`~/Desktop/arvya-meeting-notes/` already has them as text — Eng review's critical-path risk RESOLVED). Account Queue, Account Detail, Proof Room, Outreach Approval (founder-approval gate before send), Learning Receipt.
2. **Live Overlay** — transparent + always-on-top + click-through-toggleable. **`setContentProtection(true)`** → invisible to Zoom screen-share. ONE coach card. Mutates as the prospect speaks. Receives suggestions from `pmf:coach:next-card` IPC (hybrid rules + Anthropic tool-call w/ strict JSON schema).

Stack:
- **Electron + Vite + React + Bun**
- **gbrain** (this team's own product) as the memory layer, called from the Electron main process via OAuth `client_credentials`
- **HOG** for enrichment + deep research
- **Groq** for Whisper batch transcription + fast inference
- **ZeroEntropy** for the Relevance Agent (top-5 proof / top-5 prior snippets / top-3 objections per account)
- **Anthropic** for the subagent (Outreach drafting + Live Coach) — **strict JSON schema via Anthropic tools API**, max_tokens 150

## The 3-minute demo narrative

| Beat | Time | What the judge SEES |
|---|---|---|
| **0. Hook** | 0:00–0:20 | "Arvya had 15 demos. 2 progressed. We pulled every customer artifact into our brain and let it tell us what to build." Mission Scoreboard shows real numbers. |
| **1. Demo Autopsy** | 0:20–1:00 | Click "Extract patterns." Tally-board animation: 5×3 transcript thumbnails on left, 4 lane bars on right (Security 8/15, DealCloud 5/15, CRM-stale 12/15, Buyer-tracker 10/15). Lines fly from transcripts to lanes. Wedge pill stamps the winning lane. **Pre-cached at hour 3; on-stage just animates the reveal.** 6s total animation, 35s narration. |
| **2. Account → Outreach** | 1:00–1:30 | Select a HOG-enriched account. Proof Room generates. Outreach Agent drafts email. Inline split-pane approval: 60% preview / 40% APPROVE & SEND button. Naveen clicks. Button morphs to "Sent ✓". Show real reply screenshot from earlier. |
| **3. Live Call (overlay)** | 1:30–2:30 | Cut to Electron overlay over Zoom. Replay 90s of the call recorded at hour 4. Prospect: "We use DealCloud." Overlay card mutates: "Arvya's CRM agent is schema-driven — ask who owns DealCloud configuration." Founder uses it. Quick narration: "the prospect saw none of this on the screen-share." Show 5s clip from the recording where the overlay region is BLANK in the screen-share recording — proof. |
| **4. Receipt + Loop** | 2:30–2:50 | "End call." Synthesize reveal animation (pre-cached at hour 4:30). Fact-pile: "Hypothesis evidenced ✓", "New objection captured", "Pattern reinforced: DealCloud now 6/16", "Next experiment: ask about IT security gate earlier", "Brain updated: 3 pages, 8 edges". One CTA: "Send follow-up". Naveen clicks. Judge in audience checks phone. |
| **5. Close** | 2:50–3:00 | "We analyzed 15 demos, ran one in real time, sent the follow-up — using our own product. **The next call we run will be smarter than this one.**" |

## Lane assignment

| Lane | Branch | Owner | Worktree path (on owner's machine) |
|---|---|---|---|
| **DASH** Dashboard renderer (Mission Scoreboard, Account Queue, Account Detail, Proof Room, Outreach Approval, Demo Autopsy panel w/ tally-board animation, Learning Receipt) | `lane/dash` | Prashanth | `~/Desktop/arvya-worktrees/closer-dash` |
| **OVL** Overlay renderer (LiveCard, TranscriptPane, ConfidenceBadge, click-through hotkey wiring) | `lane/ovl` | Prashanth | `~/Desktop/arvya-worktrees/closer-ovl` |
| **ANIM** Animation primitives (useCountUp, useStaggerReveal, useCrossfade, useMorph) — shared by DASH + OVL | `lane/anim` | Prashanth (build first, ~90 min, then DASH + OVL import) | `~/Desktop/arvya-worktrees/closer-anim` |
| **SHELL** Electron main process (BrowserWindows, setContentProtection verify, IPC handlers, lifecycle, electron-builder packaging stub) | `lane/shell` | Naveen | his choice locally |
| **BRAIN** gbrain MCP client + meeting-notes ingestion + Demo Autopsy pre-cache + Learning Receipt write-back | `lane/brain` | Naveen | his choice locally |
| **API** External clients (HOG, ZeroEntropy, Groq, Anthropic) + Live Coach engine w/ strict JSON schema | `lane/api` | Naveen | his choice locally |

**Integration branch: `main`.** Both engineers merge their lane branches into `main` aggressively (~every 30 min). One person owns the merge — call it on Slack/Discord.

## Brain Seed Sources (the moat — pre-load gbrain with everything Arvya has)

Both the Demo Autopsy beat AND the Live Coach's "remember yesterday's call" beat depend on having a LOADED brain. This is the highest-leverage hour-0 work.

### Seed sources, ranked by speed

**Tier 1 — local, ingest immediately (no download needed):**

| Source | Path | What it is |
|---|---|---|
| Meeting transcripts | `~/Desktop/arvya-meeting-notes/` | 30+ .txt transcripts from past calls, ~6,600 lines total. The 15 prior demos (and more) live HERE. |
| Loose transcripts | `~/Desktop/Union square advisors \| arvya.txt`, `shakya_x_arvya.txt`, `sumit_x_arvya.txt`, `Selvam-Arvya.transcript.txt` | More past calls — same shape, different filenames. |
| Security pack briefing | `~/Desktop/Arvya Data Security Pack — Update Briefing for Claude.md` | Internal positioning + Arvya truth on security posture. |
| Cross-tyton notes | `~/Desktop/arvya X tyton.md` | More internal context. |
| Decks (PDF) | `~/Downloads/arvya - decks/` | Pitch decks. Need `pdftotext` to ingest. |
| Videos / audio | `~/Desktop/arvya_videos/` (WUD, dealcloud, founder-video, march31-demo, old-drafts subfolders) | Audio/video. Use Groq Whisper batch — 10h of audio = ~4 min wall-clock, ~$0.40. |

**Tier 2 — Google Drive (needs download first):**

The team has a Drive folder with even more transcripts + Google Docs + customer artifacts. Drive desktop app is NOT installed on this Mac, so the **fast path** is:
1. Browser → drive.google.com → navigate to the Arvya folder
2. Right-click the folder → **Download** (Google zips it server-side)
3. Wait for the .zip (multi-GB folders take 1–5 min over WiFi)
4. Unzip to `~/Desktop/arvya-drive-seed/`
5. Point the seed at that path

Don't bother with `rclone` / Drive API auth in a hackathon — the zip-download path is 10x faster and works without any setup.

**Tier 3 — gbrain hosts the seeding (post-hackathon):**

V1 of Arvya Closer adds a real Drive integration. For the hackathon, manual download is fine.

### How seeding works (the script: `scripts/seed-brain.ts`)

```bash
# Default: ingest every Tier 1 source from this Mac
bun run scripts/seed-brain.ts

# Custom: add the Drive download path
bun run scripts/seed-brain.ts --add ~/Desktop/arvya-drive-seed

# Dry run (see what would be ingested):
bun run scripts/seed-brain.ts --dry-run
```

The script:
1. Walks each source path recursively, classifying by file extension
2. `.txt`, `.md` → directly copies into a working dir at `~/Desktop/arvya-brain-seed/inbox/`
3. `.pdf` → runs `pdftotext` if available, writes the .txt next to the original
4. `.m4a`, `.mp4`, `.mp3`, `.wav` → POSTs to Groq Whisper `/v1/audio/transcriptions`, writes `.txt` next to the original
5. `.docx` → runs macOS `textutil -convert txt` (built-in)
6. Skips: `.gdoc` (Drive shortcut stubs, no local content), images, anything > 50MB
7. Once the inbox is built, runs `gbrain sync --dir ~/Desktop/arvya-brain-seed/inbox/` + `gbrain embed --stale` + `gbrain dream --phase extract`
8. Prints final `gbrain stats` so we know how big the brain is

### Where the seed surfaces in the app

The **Brain Seed Panel** in the dashboard top-right has:
- A live count of pages indexed (calls `pmf:brain:stats` every 5s)
- A "Seed Brain" button that opens a dialog to pick source paths
- A progress strip showing the current ingestion job (which file is being processed, % done, errors)
- A "Verify" section: three sample queries that prove the brain has Arvya context loaded
  - `"what are Arvya's most common buyer objections?"`
  - `"what is Arvya's positioning vs Affinity?"`
  - `"who is naveen sb?"`
  - If these return grounded answers with citations → brain is loaded. If empty → re-run seed.

This panel is owned by **Naveen (lane/brain)**. The button + dialog wiring lives in `src/renderer/dashboard/components/BrainSeedPanel.tsx`. The actual seeding runs in `scripts/seed-brain.ts` invoked via `pmf:brain:seed` IPC.

### Demo narrative leverage from the seed

When Garry Tan or another partner watches the demo, the Mission Scoreboard's "pages indexed" number is the FIRST credibility marker:

- Bad: "0 pages indexed" — looks empty, no story
- OK: "15 calls indexed" — matches your honest 15-demos claim
- Good: "247 pages indexed — 31 calls, 12 customer threads, 8 product docs, 196 entities extracted" — looks like a real brain. The number proves the seeding worked.

The dashboard header should show the BIG number from gbrain stats, animated via `useCountUp` from 0 → real number on page load.

---

## Hour-0 sprint (first 60 min — FROM NOW)

Run 4 tracks in parallel. Stand up at hour 0:60 and decide cuts.

### T1 — meeting-notes already exist (Naveen, ~10 min)
Skip the Zoom Cloud audit. The 15 transcripts are at `~/Desktop/arvya-meeting-notes/`. Sanity check:
```bash
ls -la ~/Desktop/arvya-meeting-notes/*.txt | head -20
wc -l ~/Desktop/arvya-meeting-notes/*.txt | tail -5
```
Then run the ingestion (lives in `scripts/ingest-meeting-notes.ts`, build during this track) → seeds gbrain.

### T2 — setContentProtection verify on demo Mac (Prashanth, ~15 min)
```bash
bun install
bun run dev          # boots Electron with both windows
# Click "Open Live Overlay" in the dashboard
# Open QuickTime → File → New Screen Recording → record 30s
# Save and play back. Verify the overlay region is BLANK in the recording.
```
If it works, you can move on. If it fails (Windows demo Mac, or a setContentProtection bug), drop the overlay leg and ship dashboard-only.

### T3 — gbrain MCP wiring (Naveen, ~30 min)
```bash
# In a separate terminal:
cd /Users/prashanthbabu/Desktop/gbrain   # or wherever gbrain repo lives
gbrain serve --http --port 3131 &
gbrain auth register-client closer --grant-types client_credentials --scopes "read write"
# Note the client_id + client_secret from the output → add to .env in arvya-closer
```
Then in `src/lib/gbrain-client.ts`:
- Mint a token at startup via `POST /token` with `grant_type=client_credentials`
- Cache for 50 minutes
- Call `/mcp` JSON-RPC with `Authorization: Bearer <token>`
- Implement: `get_brain_identity`, `query`, `search`, `put_page`

Wire one IPC handler (`pmf:gbrain:query`) to call this. Test from dashboard.

### T4 — HOG + Groq + Anthropic + ZE quick-verify (Naveen or Prashanth, ~15 min)
Run these `curl`s and save outputs to `data/api-samples/` (gitignored):
- HOG `POST /enrichments` on Naveen's LinkedIn URL
- ZE rerank on a query + 10 toy docs
- Groq Whisper on a 30s `.m4a` snippet
- Anthropic chat on a single message

If any fail: confirm env vars, refresh key. Don't burn time debugging — fall back to vanilla cosine + recency for the demo if ZE fails.

### Hour 0:60 STAND UP
Decide:
- Did T2 (setContentProtection) work? If NO, drop overlay leg. Dashboard-only demo with paste-transcript.
- Did T3 (gbrain MCP) work? If NO, hand-write `~/Desktop/arvya-meeting-notes/` → in-memory data and skip the brain integration.
- Are any T4 APIs unreachable? Drop them. Cosine + recency replaces ZE. Use raw transcript text instead of Whisper for the live call (paste mode).
- Adjust lane assignments based on who's ahead.

## Hour 1–4 build cadence

Push to your lane branch every 20–30 minutes. Tag the merge owner on Slack/Discord when you have something to integrate. Merge to `main` aggressively — don't let `main` go more than 1 hour without an update.

Hour 4: book + run the real call (Naveen takes the call, Prashanth operates the overlay).

Hour 4:30: synthesize + cache the receipt.

Hour 5:15–5:45: rehearsal (3 dry-runs end-to-end), record fallback contingencies for each beat.

## Critical fixes from /autoplan reviewer (already in plan, restating because we WILL forget)

1. **gbrain MCP is server-side only** — `gbrain serve --http` default CORS is `*`, and `--cors-origin` flag does NOT exist. Browser-side OAuth would leak `client_secret`. Architecture: Electron main process holds the secret + mints tokens + calls MCP. Renderer never sees secrets. *(For us, this is natural because we're Electron-only — no browser ever talks to gbrain directly.)*
2. **Demo Autopsy MUST be pre-cached at hour 3** — never live LLM during a demo beat. Persist as `data/demo-autopsy-result.json` (gitignored), animate the reveal on stage.
3. **Live Coach uses Anthropic tools API + strict JSON schema + `max_tokens: 150` + render-side 120-char trim on `body`** — otherwise the overlay turns into wall-of-text. See `src/lib/coach-engine.ts` pseudocode template (TBD by Naveen).
4. **LearningReceipt: hackathon shortcut.** Pre-cache a template `data/learning-receipt-template.json` rendered at hour 4:30, filled with 2 fields from the actual call (objection, prospect name). The brain pages get written for real (`gbrain dream --phase synthesize --input <transcript>`), the receipt UI is rendering convention. Add a `gbrain query` terminal pane as proof.
5. **Demo on Zoom only.** Teams + Loom + ScreenCaptureKit-based recorders may bypass `NSWindowSharingNone`.
6. **HDMI: EXTENDED desktop, NOT mirror.** Overlay on laptop screen only; projector shows the Zoom window. Mirror mode hides the overlay from the projector too (setContentProtection respects the underlying surface).
7. **Live follow-up email belt-and-suspenders.** PRE-SEND the email at hour 5:00 via Gmail "Schedule send" → 5:45:50. Judge's phone buzzes on cue regardless of whether the live-click delivery works.

## Animation specs (Prashanth lane/anim — build FIRST, ~90 min, reuse everywhere)

Four reusable hooks:
- `useCountUp(target: number, duration?: number)` → animated count with ease-out
- `useStaggerReveal<T>(items: T[], stepMs?: number)` → returns `T[]` revealing one at a time
- `useCrossfade<T>(value: T, fadeMs?: number)` → cross-fade between two values
- `useMorph<T>(value: T, duration?: number)` → morphs between strings (per-char or per-token)

Where they get used:
- **DemoAutopsyPanel**: useStaggerReveal for the lane bars filling, useCountUp for the counters
- **OutreachApproval**: useMorph for "APPROVE & SEND" → "Sending..." → "Sent ✓ at 2:34pm"
- **Overlay LiveCard**: useCrossfade for the card text mutation when a new suggestion arrives
- **LearningReceipt**: useStaggerReveal for the 5-section fact-pile reveal (250ms stagger)
- **Mission Scoreboard**: useCountUp for the big number on page load

## What we DO NOT build (already cut from /autoplan)

- ❌ arvya_web/app/pmf-engine route (we're Electron-only — no Next.js)
- ❌ `find_experts`, `get_recent_salience`, `find_anomalies`, `graph-query` MCP ops (saved ~90 min)
- ❌ Proof Room's "security note" + "workflow map" panels (keep only pain→capability)
- ❌ Mic capture via Web Audio API in overlay (paste-transcript fallback only — saves ~60 min of macOS mic permission hell)
- ❌ Autonomous email send (founder approval required — explicit guardrail)
- ❌ Real Zoom/Meet/Teams bot integration (paste + mic via BlackHole only)
- ❌ Electron packaging via electron-builder (dev mode only on stage)
- ❌ Multi-user / multi-tenant
- ❌ Mobile anything

## Coordination

- Slack/Discord channel: TBD — pick one and link it here.
- Lane branch push cadence: every 20–30 min, no exceptions.
- Merge owner: Prashanth (he's on the dashboard, sees integration breaks first).
- Stand-ups: every 60 min, ~3 min each.
- Demo dry-run: hour 5:15 onward, 3 full passes minimum.
