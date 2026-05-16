# gstack Artifacts — How We Got Here

These are the planning + review artifacts produced by the gstack skills
(/office-hours, /plan-ceo-review, /autoplan) on Prashanth's machine.
They're checked in so Naveen's agents can understand the reasoning.

## Read order

1. **../PLAN_ORIGINAL.md** — Naveen's original Arvya Closer plan. The product vision.
2. **01-closeloop-design-SUPERSEDED.md** — The first design doc, generic-framed as "Closeloop" before PLAN_ORIGINAL.md was provided. Shows the initial reviewer fixes (Groq-not-streaming, CORS default-deny, live synthesize dead-air, etc.). SUPERSEDED.
3. **02-ceo-plan-closeloop-SUPERSEDED.md** — The /plan-ceo-review CEO plan in SCOPE_EXPANSION mode. Shows the 6 accepted expansions (compounding beat, demo script reframe, send-live, etc.). SUPERSEDED by ../DESIGN.md.
4. **../DESIGN.md** — **The canonical plan we are shipping.** Re-framed once PLAN_ORIGINAL.md was provided. Approach B (PMF Loop + thin Electron overlay). All reviewer fixes folded in. Honest-N booking claim. Google Drive ingestion section.
5. **../../HACKATHON.md** — operational summary: lanes, hour-0 sprint, demo narrative, coordination protocol.

## What an agent should do with this

- Treat **DESIGN.md** as the source of truth for any architecture / UX question.
- Treat **PLAN_ORIGINAL.md** as the source of truth for product vision, 8-agent contracts, data types (`LearningReceipt`, `MarketSignal`, `AccountAction`, `ProofRoom`, `CallPrep`, `PMFHypothesis`).
- Treat the SUPERSEDED files as historical context — useful for understanding WHY decisions were made, but don't act on them.
- See **HACKATHON.md** for what's in scope vs cut, and which TODOs land in which lane.

## Append-only logs (for forensics)

- **03-review-log.jsonl** — autoplan + plan-ceo-review review verdicts with timestamps
- **04-timeline.jsonl** — which skill ran when, on which branch

These won't be updated by Naveen's agents — they're a snapshot of Prashanth's planning session.
