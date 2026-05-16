# Arvya Closer

PMF acceleration loop with a Cluely-style live overlay. Electron app, founder tool.

> The salesperson's second brain. It's there during your calls, and the prospect can't see it.

## Quick start

```bash
bun install               # install deps (~30s)
cp .env.example .env      # fill in API keys
bun run dev               # boots Electron in dev mode
```

You should see:
- A **Dashboard window** (Mission Scoreboard, Account Queue, Account Detail)
- A button **"Open Live Overlay"** in the header — click it to spawn the transparent overlay window

## What this is

GStack/GBrain hackathon project. Built in ~5 hours. See `HACKATHON.md` for the full plan + demo narrative.

Two surfaces:

1. **Dashboard** — normal window. Mission Scoreboard, Demo Autopsy on 15 prior demos, Account Queue, Proof Room, Outreach Approval, Learning Receipt.
2. **Live Overlay** — transparent + always-on-top + click-through-toggleable. `setContentProtection(true)` on macOS makes it invisible to screen-share (Zoom / Meet / OBS / QuickTime). One card. One next move.

Stack: Electron + Vite + React + Bun. Backend (gbrain MCP client, HOG, Groq, Anthropic, ZeroEntropy) lives in the Electron main process — secrets never reach the renderer.

## Files

```
electron/
  main/index.ts       — main process: windows, setContentProtection, IPC handlers
  preload/index.ts    — contextBridge: window.pmf.* APIs for the renderers
src/
  renderer/
    dashboard.html, dashboard.tsx, dashboard.css
    overlay.html, overlay.tsx, overlay.css
    dashboard/App.tsx       — dashboard root
    overlay/App.tsx         — overlay root
    dashboard/components/   — (lane/dash) Mission Scoreboard, Autopsy, Queue, Detail, etc.
    overlay/components/     — (lane/ovl) LiveCard, TranscriptPane, Badge
    hooks/                  — (lane/dash) animation primitives
  lib/
    gbrain-client.ts        — (lane/brain) gbrain MCP via OAuth client_credentials
    hog-client.ts           — (lane/api) HOG /enrichments + /deep-research
    groq-client.ts          — (lane/api) Whisper batch + chat completions
    anthropic-client.ts     — (lane/api) subagent + Live Coach
    relevance.ts            — (lane/api) ZeroEntropy rerank + keyword fallback
    coach-engine.ts         — (lane/api) hybrid rules + Anthropic tool-call (JSON schema)
    demo-autopsy.ts         — (lane/brain) pre-cache the autopsy result
scripts/
  ingest-meeting-notes.ts   — (lane/brain) seed gbrain from ~/Desktop/arvya-meeting-notes/
  transcribe-audio.ts       — (lane/api) batch-transcribe audio via Groq
```

## Onboarding

If you just got added as a collaborator, read `GET_STARTED.md` next.

## Commands

```bash
bun run dev          # dev loop with HMR
bun run build        # production build
bun run typecheck    # tsc --noEmit across both tsconfigs
```

## Notes

- Secrets live in `.env` (gitignored). Never log them. Never expose them to renderer.
- `setContentProtection(true)` is macOS-only. On Windows/Linux the overlay shows in screen-share. Demo on Mac only.
- Demo on **Zoom**, not Teams. Teams may bypass NSWindowSharingNone.
- Use **EXTENDED desktop** (not mirror) for the projector — setContentProtection hides from mirrored displays too.
