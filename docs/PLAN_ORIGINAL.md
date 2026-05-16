# Arvya Closer / PMF Overlay Plan

## Mission

Build a closed-loop founder-led sales system for Arvya that can help Naveen and Prashanth:

1. Find high-fit PE/IB prospects.
2. Generate a specific reason to contact each prospect.
3. Book more demos.
4. Prepare for each call from Arvya truth, market signals, and past demo history.
5. Run a private live overlay during Zoom, Google Meet, Teams, phone, or in-person calls.
6. Tell the founders what to ask, say, avoid, and close on in real time.
7. Create follow-up, proof artifacts, and next-step asks immediately after the call.
8. Write every signal, conversation, objection, buying moment, and outcome into GBrain.
9. Use that memory to improve the next sourcing run, outreach, call, and product experiment.

The 6-hour hackathon target is not to build a polished generic SaaS. It is to build a working closed-loop system that Arvya can use today to create better customer conversations and show a credible path to 10 booked demos.

## Core Reframe

Do not build "an AI SDR" or "a Cluely clone."

Build a **PMF acceleration loop** with a Cluely-style live sidecar as one actuator.

The loop:

```text
Market signal
  -> buyer hypothesis
  -> account/person research
  -> account-specific proof
  -> approved outreach
  -> booked call
  -> live overlay guidance
  -> follow-up and next step
  -> GBrain learning receipt
  -> updated ICP / message / product experiment
  -> next market signal
```

Existing tools own pieces of this:

- Cluely: real-time meeting overlay and live suggestions.
- Clay/Apollo/11x/Artisan-style tools: prospecting and outbound.
- Gong/Chorus/Fathom/Otter/Granola: meeting capture and post-call notes.
- CRM tools: activity records.

Arvya Closer should own the whole learning loop for technical founders doing enterprise sales.

## Non-Negotiable Product Principles

1. **Closed loop or it does not count.** Every action must produce a learning receipt that changes the next action.
2. **Founder-approved high-stakes actions.** Agents can research, draft, rank, and recommend. Founders approve sends, calendar actions, CRM writes, and customer-visible messages.
3. **Live guidance must be sparse.** During calls, show one best next move, not a noisy dashboard.
4. **Use past conversations first.** The 15 prior demos are the most valuable dataset. Learn why 13 stalled and 2 progressed before generating more outbound.
5. **Use buyer language.** Outreach and live guidance should quote or paraphrase actual buyer pains from transcripts, not generic AI sales copy.
6. **Reliability beats autonomy for the hackathon.** If native overlay/audio capture is unstable, the web sidecar with paste/live transcript fallback wins.
7. **No reputation-damaging automation.** No hidden mass email. No fake personalization. No invented customer facts.
8. **Every hackathon sponsor/tool has a real job.** GStack builds and validates, GBrain remembers, ZeroEntropy ranks relevant context, The Hog supplies market/web intelligence, and optional tools fill capture/sending gaps.

## User Experience

### Surface 1: Command Center

Location for first slice: `arvya_web/app/pmf-engine`

Purpose: run the PMF sprint.

Primary modules:

- Mission scoreboard: `10 demos by 6 PM`
- Prior demo autopsy
- Winning/stalled pattern extraction
- The Hog signal inbox
- Account action queue
- Proof artifact generator
- Approved outreach queue
- Call prep packet
- Post-call learning receipt

### Surface 2: Live Overlay / Sidecar

Target final form: Electron desktop app with always-on-top transparent window.

Hackathon fallback: web sidecar route inside Arvya web.

Modes:

- **Desktop overlay mode:** Electron always-on-top window, click-through optional, hotkeys, compact card UI.
- **Browser sidecar mode:** open next to Zoom/Meet/Teams, no native permissions required.
- **Paste transcript mode:** user pastes captions/transcript chunks manually.
- **Mic mode:** browser or Electron captures local mic with explicit permission.
- **Future meeting bot mode:** Recall.ai or meeting-platform SDK joins/captures with consent.

Live card states:

- `Discovery`: next question to ask.
- `Pain detected`: reflect and quantify.
- `Objection`: concise response + proof point.
- `Buying signal`: dig deeper and move toward next step.
- `Over-demo warning`: stop showing product, ask workflow question.
- `Close`: ask for pilot cohort, IT stakeholder, second meeting, or calendar hold.

### Surface 3: Proof Room

Purpose: account-specific artifact founders can send before or after a call.

Generated from:

- account/person signal
- Arvya product truth
- past demo patterns
- live call transcript
- security and integration proof

Contents:

- buyer workflow hypothesis
- pain map
- relevant Arvya agents
- before/after workflow
- implementation path
- security posture
- pilot proposal
- booking CTA

## System Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                         Founder UI                              │
│  Command Center        Live Sidecar        Proof Rooms           │
└────────────┬──────────────────┬──────────────────┬──────────────┘
             │                  │                  │
             v                  v                  v
┌─────────────────────────────────────────────────────────────────┐
│                     PMF Orchestrator                             │
│  Agent router, state machine, status tracking, receipts           │
└────────────┬──────────────────┬──────────────────┬──────────────┘
             │                  │                  │
             v                  v                  v
┌──────────────────┐   ┌─────────────────┐   ┌──────────────────┐
│ Signal Sources   │   │ Context Engine  │   │ Action Engine     │
│ The Hog          │   │ GBrain          │   │ Outreach drafts   │
│ Web search       │   │ ZeroEntropy     │   │ Proof generation  │
│ Manual import    │   │ Arvya docs      │   │ Call coaching     │
│ CSV/paste        │   │ Demo transcripts│   │ Follow-up drafts  │
└──────────────────┘   └─────────────────┘   └──────────────────┘
             │                  │                  │
             └──────────────────┴──────────────────┘
                                v
┌─────────────────────────────────────────────────────────────────┐
│                         GBrain Memory                            │
│  accounts, people, pains, objections, proof, outcomes, learnings  │
└─────────────────────────────────────────────────────────────────┘
```

## Agent Swarm

### 1. Demo Autopsy Agent

Input:

- pasted transcripts
- call notes
- outcome labels: progressed, stalled, no-show, bad fit, next meeting

Output:

- recurring pains
- recurring objections
- personas that engaged
- personas that stalled
- best demo moments
- missing discovery questions
- product requests
- next wedge recommendation

Minimum viable implementation:

- UI text area for transcripts/notes.
- Deterministic extraction prompts/functions.
- Store structured results in local state and export receipt.

### 2. Market Signal Agent

Input:

- The Hog API, when available
- pasted/exported Hog output
- manually added signals
- web-searched events and market triggers

Data contract:

```ts
type MarketSignal = {
  id: string
  source: 'hog' | 'web' | 'manual' | 'csv'
  company?: string
  person?: string
  role?: string
  segment: string
  trigger: string
  evidence: string
  channel: 'email' | 'linkedin' | 'conference' | 'intro' | 'phone' | 'unknown'
  urgency: number
  suggestedPlay: string
  sourceUrl?: string
}
```

Output:

- prioritized demand signals
- account/person hypotheses
- recommended channel
- reason to contact now

### 3. Account Research Agent

Input:

- account name
- person/title
- market signal
- Arvya ICP rules

Output:

- account dossier
- likely workflow
- likely CRM/Microsoft posture
- what to ask
- what not to say
- best wedge

Minimum viable implementation:

- seeded PE/IB account dataset
- manual additions
- optional web search later

### 4. Relevance Agent

Input:

- current buyer/account/signal
- Arvya product truth
- prior demo snippets
- objections
- proof points

Tooling:

- ZeroEntropy rerank when `ZEROENTROPY_API_KEY` is available.
- deterministic keyword fallback otherwise.

Output:

- top 5 relevant proof points
- top 5 similar prior-call snippets
- top 3 objections to prepare for
- explanation for why each item was selected

This needs to be visible in the UI. Judges should see ZeroEntropy doing an important job.

### 5. Proof Builder Agent

Input:

- account dossier
- signal
- relevance output
- Arvya truth
- live call excerpts if available

Output:

- proof room
- workflow map
- pain-to-capability mapping
- pilot plan
- security/implementation note

### 6. Outreach Agent

Input:

- account dossier
- proof room
- target persona
- channel

Output:

- founder email
- LinkedIn note
- follow-up sequence
- subject lines
- approval checklist

Guardrails:

- no invented facts
- no fake familiarity
- no automatic sends in first slice
- every message must contain a specific why-now trigger and a concrete proof offer

### 7. Live Coach Agent

Input:

- live transcript chunks
- pre-call brief
- relevance output
- Arvya truth
- past demo patterns

Output:

- one-card guidance:
  - say this
  - ask this
  - avoid this
  - show this proof
  - close on this

State machine:

```text
intro -> discovery -> pain -> proof -> objection -> close -> follow-up
```

### 8. Learning Agent

Input:

- outreach status
- reply
- transcript
- founder notes
- outcome label

Output:

- GBrain learning receipt
- updated ICP notes
- updated objection bank
- updated product requests
- next experiment recommendation

Receipt contract:

```ts
type LearningReceipt = {
  id: string
  timestamp: string
  account: string
  person?: string
  segment: string
  sourceSignal: string
  hypothesis: string
  actionTaken: string
  proofUsed: string[]
  buyerPains: string[]
  objections: string[]
  outcome: 'drafted' | 'sent' | 'positive_reply' | 'booked' | 'stalled' | 'closed_lost' | 'progressed'
  nextStep: string
  productLearning: string
  gbrainSlug?: string
}
```

## Data Model

### Core Types

```ts
type PMFHypothesis = {
  id: string
  segment: string
  persona: string
  pain: string
  wedge: string
  proof: string
  confidence: number
  evidence: string[]
  status: 'untested' | 'testing' | 'validated' | 'weakened' | 'rejected'
}

type AccountAction = {
  id: string
  account: string
  person?: string
  role?: string
  email?: string
  linkedinUrl?: string
  signalId: string
  hypothesisId: string
  score: number
  status: 'research' | 'drafted' | 'approved' | 'sent' | 'replied' | 'booked' | 'stalled'
  outreach: {
    emailSubject: string
    emailBody: string
    linkedinNote: string
    followUp: string
  }
  proofRoom: ProofRoom
  callPrep: CallPrep
  receipts: LearningReceipt[]
}

type ProofRoom = {
  id: string
  account: string
  headline: string
  currentWorkflow: string[]
  painMap: Array<{ pain: string; consequence: string; arvyaCapability: string }>
  securityProof: string
  pilotPlan: string[]
  callToAction: string
}

type CallPrep = {
  objective: string
  founderRoles: Array<{ person: 'Naveen' | 'Prashanth'; role: string }>
  discoveryQuestions: string[]
  demoPath: string[]
  objectionCards: Array<{ objection: string; response: string; proof: string }>
  closeAsk: string
}
```

## GBrain Integration

### First Slice

Use copy/export receipts if calling the CLI from Next.js is risky.

UI should provide:

- `Copy GBrain Receipt`
- `Download receipt.json`
- `Download receipt.md`

Receipt markdown format:

```md
# PMF Learning: {account} - {date}

## Hypothesis
...

## Signal
...

## Action
...

## Buyer Pain
...

## Objections
...

## Outcome
...

## Next Step
...

## Product Learning
...
```

### Next Step

Backend API route:

```text
POST /api/pmf/gbrain/write
```

Behavior:

- writes receipt to a local `.pmf-receipts/` folder or GBrain CLI
- runs `gbrain import` / `gbrain put` when safe
- never exposes secrets to the browser

### Long-Term GBrain Memory Shape

Suggested slugs:

- `companies/{account}`
- `people/{person}`
- `gtm/signals/{signal}`
- `gtm/hypotheses/{hypothesis}`
- `gtm/calls/{date}-{account}`
- `gtm/objections/{objection}`
- `gtm/proof/{account}`

## The Hog Integration

### Reality

The Hog API access exists, but public docs are not stable. Treat API as an adapter, not a blocker.

### Adapter Interface

```ts
interface SignalSource {
  name: string
  fetchSignals(input: SignalQuery): Promise<MarketSignal[]>
}

type SignalQuery = {
  company: string
  icp: string
  market: string
  goal: string
  keywords: string[]
}
```

### Supported Modes

1. `HogPasteSignalSource`
   - paste Hog output
   - parser turns text/JSON into `MarketSignal[]`

2. `HogApiSignalSource`
   - uses env vars:
     - `HOG_API_KEY`
     - `HOG_API_SECRET`
   - hidden behind server route
   - implemented after endpoint shape is verified

3. `ManualSignalSource`
   - manual account/signal entry

4. `SeedSignalSource`
   - reliable demo data

## ZeroEntropy Integration

### First Slice API

```text
POST /api/pmf/rerank
```

Request:

```json
{
  "query": "PE sponsor using Outlook and DealCloud with CRM staleness concern",
  "documents": ["...", "..."]
}
```

Response:

```json
{
  "provider": "zeroentropy" | "local-keyword",
  "ranked": [
    { "index": 0, "score": 0.92, "document": "..." }
  ]
}
```

Behavior:

- Use ZeroEntropy rerank if `ZEROENTROPY_API_KEY` exists.
- Fall back to local keyword scoring.
- Show provider in UI so the demo is transparent.

## Electron Overlay Plan

### Why Electron

The overlay needs:

- always-on-top window
- compact view over Zoom/Meet/Teams
- global hotkeys
- optional click-through
- microphone capture
- clipboard/paste transcript support
- future screen/audio capture

Electron gives the fastest path for a local desktop sidecar.

### App Structure

```text
apps/closer-desktop/
  package.json
  electron/
    main.ts
    preload.ts
    permissions.ts
    overlay-window.ts
  src/
    OverlayApp.tsx
    components/
      LiveCard.tsx
      TranscriptPane.tsx
      GuidanceCard.tsx
      ConfidenceBadge.tsx
    lib/
      transcript-buffer.ts
      guidance-engine.ts
      pmf-api-client.ts
```

### Native Behavior

- `Cmd+Shift+Space`: show/hide overlay.
- `Cmd+Shift+Enter`: mark current guidance as used.
- `Cmd+Shift+L`: create learning note.
- `Cmd+Shift+P`: paste transcript from clipboard and analyze.
- `alwaysOnTop: true`.
- `transparent: true`.
- `frame: false`.
- `skipTaskbar: true`.
- optional `setIgnoreMouseEvents(true, { forward: true })`.

### Audio Capture Options

Ranked for hackathon reliability:

1. Manual paste of live captions/transcript chunks.
2. Browser/Electron microphone capture with Web Speech API if supported.
3. Local Whisper stream via `whisper.cpp` / `mlx-whisper` / `whisper` wrapper.
4. Deepgram/AssemblyAI streaming transcription.
5. Recall.ai bot / Zoom SDK / Teams Graph transcript integration.

First slice should support 1 and 2. Do not block on system audio capture.

### Legal/Trust Guardrail

The app should not market itself as hidden or undetectable. For real customer calls, founders should follow consent and recording laws. Use "private founder sidecar" language.

## Parallel Build Lanes

### Lane A: Command Center UI

Owner scope:

- `arvya_web/app/pmf-engine/page.tsx`
- `arvya_web/app/pmf-engine/pmf-engine-client.tsx`
- UI components local to route

Tasks:

1. Build mission scoreboard.
2. Build demo autopsy panel.
3. Build hypothesis/wedge panel.
4. Build account action queue.
5. Build selected account detail panel.
6. Build proof room preview.
7. Build live sidecar preview.

Acceptance:

- route loads locally
- no auth wall
- usable at desktop and laptop widths
- no overlapping text

### Lane B: PMF Data + Generators

Owner scope:

- `arvya_web/lib/pmf-engine-data.ts`
- `arvya_web/lib/pmf-engine.ts`

Tasks:

1. Define types.
2. Seed Arvya truth.
3. Seed signals and PE/IB accounts.
4. Implement deterministic scoring.
5. Implement proof room generator.
6. Implement outreach generator.
7. Implement call prep generator.
8. Implement learning receipt generator.

Acceptance:

- selecting any account generates a full packet
- at least 10 credible campaigns can be produced from seeded/manual data

### Lane C: ZeroEntropy + Relevance

Owner scope:

- `arvya_web/app/api/pmf/rerank/route.ts`
- relevance UI integration

Tasks:

1. Implement server-only API route.
2. Use `ZEROENTROPY_API_KEY` if available.
3. Fall back to local scoring.
4. Show top relevant proof/call snippets in UI.

Acceptance:

- no secret is exposed to browser
- route works without env var
- UI labels provider as ZeroEntropy or fallback

### Lane D: Hog Signal Import

Owner scope:

- `arvya_web/lib/hog-signals.ts`
- Hog import panel in UI

Tasks:

1. Define `MarketSignal`.
2. Build paste parser for JSON and loose text.
3. Build manual signal form.
4. Keep API adapter stub behind server-only boundary.

Acceptance:

- pasted Hog-style output creates usable signals
- invalid pasted input fails gracefully

### Lane E: Live Sidecar MVP

Owner scope:

- route-local live sidecar component
- optional `apps/closer-desktop` later

Tasks:

1. Transcript chunk input.
2. Optional mic start/stop using browser APIs.
3. Detect keywords:
   - CRM stale
   - DealCloud
   - Salesforce
   - security
   - buyer tracker
   - weekly updates
   - scheduling
   - Outlook
4. Map to next question / proof / objection response.
5. Show one-card guidance.

Acceptance:

- pasting a buyer quote changes guidance immediately
- security, DealCloud, CRM-stale, and buyer-tracker scenarios all produce correct guidance

### Lane F: GBrain Receipts

Owner scope:

- receipt generator
- export/copy/download UI
- optional server write route

Tasks:

1. Generate JSON receipt.
2. Generate markdown receipt.
3. Copy to clipboard.
4. Download file.
5. Add future `POST /api/pmf/gbrain/write` plan stub.

Acceptance:

- every account/action can produce a complete receipt
- receipt is human-readable and importable into GBrain

### Lane G: QA + Demo Script

Owner scope:

- test checklist
- demo data
- recorded path through app

Tasks:

1. Write demo script.
2. Test 3 account scenarios.
3. Test live sidecar with 5 buyer quotes.
4. Test no-env fallback.
5. Test responsive layout.

Acceptance:

- 3-minute demo works offline
- product still works if Hog/ZeroEntropy fail

## 6-Hour Execution Timeline

### 0:00-0:30 - Lock Plan and Data

- Confirm the revised plan.
- Decide first wedge:
  - recommended: PE/IB deal teams with Outlook + stale CRM + buyer tracker pain.
- Gather 3-5 past demo transcripts or notes.
- Add `.env.local` locally for API keys if needed, never commit.

### 0:30-1:30 - Skeleton and Data Layer

- Create `/pmf-engine`.
- Add seed data and generators.
- Render mission board and account queue.
- Make one account produce a full packet.

### 1:30-2:30 - Closed Loop

- Add demo autopsy input.
- Extract patterns into hypotheses.
- Add receipt generator.
- Add proof room preview.

### 2:30-3:30 - Relevance and Hog

- Add Hog paste/manual import.
- Add ZeroEntropy rerank route with fallback.
- Show relevant proof/past-call snippets.

### 3:30-4:30 - Live Sidecar

- Add transcript input.
- Add guidance state machine.
- Add objection cards.
- Add "mark learning" action.

### 4:30-5:15 - Polish and Reliability

- Tighten copy.
- Make layout dense and operational.
- Add empty/error states.
- Make no-API fallback obvious.

### 5:15-6:00 - QA and Demo

- Run build/lint if feasible.
- Start dev server.
- Walk demo:
  - demo autopsy
  - wedge selection
  - target account
  - proof room
  - outreach
  - live sidecar
  - GBrain receipt

## Acceptance Tests

### Functional Tests

1. Page loads at `/pmf-engine`.
2. User can paste a demo transcript and receive extracted pains/objections.
3. User can select a hypothesis and account.
4. User can generate outreach and proof room.
5. User can paste a live transcript quote and receive guidance.
6. User can export a learning receipt.
7. ZeroEntropy route returns fallback rankings with no API key.
8. Hog import accepts pasted JSON/text and creates signals.

### Scenario Tests

#### Scenario 1: CRM Stale

Transcript:

```text
Our CRM is usually stale because everyone works out of Outlook.
```

Expected guidance:

- Ask how stale CRM affects buyer follow-up or weekly updates.
- Show Deal Brain -> CRM sync -> buyer tracker update.

#### Scenario 2: DealCloud

Transcript:

```text
We use DealCloud, not Salesforce.
```

Expected guidance:

- Do not position as Salesforce-only.
- Say Arvya's CRM agent is schema-driven.
- Ask who owns DealCloud configuration.

#### Scenario 3: Security

Transcript:

```text
Security will be the big question if this touches deal emails.
```

Expected guidance:

- Lead with all-in-tenant Azure.
- Mention customer-owned data stores and Azure OpenAI.
- Ask who needs to be in the security review.

#### Scenario 4: Buyer Tracker

Transcript:

```text
Buyer feedback gets forwarded around and the Excel tracker is never accurate.
```

Expected guidance:

- Strong pain.
- Ask who updates the tracker today and how often it is wrong.
- Show buyer tracker automation.

#### Scenario 5: Over-Demo

Transcript:

```text
Can you show us the product?
```

Expected guidance:

- If discovery is incomplete, ask one workflow question before demoing.
- Then show the shortest relevant path only.

## Demo Script

1. "Arvya had 15 demos and only 2 progressed. We built the system we needed."
2. Paste a prior demo note into Demo Autopsy.
3. PMF Engine extracts: security, CRM staleness, buyer tracker, DealCloud.
4. It recommends the wedge: Outlook-native Deal Brain + buyer tracker for PE/IB teams.
5. Import or select a Hog market signal.
6. Select a target account.
7. ZeroEntropy ranks the most relevant proof points and past-call learnings.
8. Generate proof room and founder outreach.
9. Open live sidecar.
10. Paste buyer quote: "We use DealCloud, not Salesforce."
11. Overlay gives the exact response and next question.
12. Export GBrain learning receipt.
13. Show that the next account's guidance changes from the learning.

## Risks and Fallbacks

| Risk | Impact | Fallback |
|---|---:|---|
| The Hog API docs are unavailable | Cannot call API live | Use paste/manual signal adapter and keep API boundary |
| ZeroEntropy endpoint shape differs | Rerank fails | Local scoring fallback |
| Browser mic capture unreliable | Live overlay demo breaks | Paste transcript mode |
| Electron takes too long | No desktop overlay | Use web sidecar first |
| Past transcripts unavailable | Autopsy weak | Use manual notes and simulated prior-call snippets |
| Outreach quality is generic | Low credibility | Force every message to include why-now, buyer pain, proof, and specific ask |
| Too many UI modules | Slow build | Ship one integrated route with selected account state |
| Hidden/undetectable framing creates trust risk | Reputation/legal risk | Position as private sidecar with consent-aware capture |

## Out of Scope For Hackathon First Slice

- Autonomous email sending.
- LinkedIn automation.
- Real Zoom/Meet/Teams bot.
- Full Electron app packaging.
- Multi-user/team accounts.
- CRM writeback.
- Native system audio capture.
- Perfect transcript diarization.
- Full PMF analytics dashboard.

## Future Roadmap

### V1: Desktop Overlay

- Electron always-on-top overlay.
- Global hotkeys.
- Local transcript capture.
- Local encrypted session store.
- Live coaching from GBrain + ZeroEntropy.

### V2: Meeting Platform Integrations

- Recall.ai for bot-based capture.
- Zoom SDK.
- Google Meet captions capture.
- Microsoft Teams / Graph transcript retrieval where tenant allows.

### V3: Autonomous Sourcing and Booking

- The Hog API integration.
- Gmail/Outlook draft creation.
- Calendar link insertion.
- Reply classification.
- Follow-up timers.
- Human approval queue.

### V4: Product Experiment Generator

- Converts recurring buyer requests into:
  - prototype plan
  - demo variant
  - landing page
  - sales proof
  - product backlog item
- Uses GStack to build and QA the highest-probability experiment.

## Final Build Decision

Build the web sidecar + PMF command center first.

Electron is the right long-term shell, but the reliable hackathon implementation is:

1. `/pmf-engine` web app first.
2. paste/mic transcript sidecar first.
3. export/write GBrain receipts first.
4. Electron overlay second, once the guidance loop works.

The product should feel like a live AI revenue room, not a CRM dashboard.

