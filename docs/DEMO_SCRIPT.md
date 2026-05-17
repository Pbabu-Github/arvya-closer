# Arvya Closer — 3-minute Demo Script

For the hackathon submission recording. Total target: **2:50** with 10s buffer.

Open `bun run dev` → confirm dashboard + overlay both visible. Use QuickTime
`File → New Screen Recording → entire screen` for the recording.

---

## BEAT 0 — Hook (0:00 → 0:20)

**Show**: dashboard already open. Mission Scoreboard at top reads "—" briefly,
then **counts up 0 → 181 pages indexed** in the first 1.5 seconds (useCountUp).

**Narration** (read aloud, founder voice):

> "Arvya had 15 demos. 2 progressed. 13 stalled.
> We built the system we needed — and used it on our own pipeline. Right now
> our brain has 181 pages from every customer call, every pitch deck, every
> internal doc."

(Tone: confident, slightly tired, "we shipped this today" energy.)

---

## BEAT 1 — Demo Autopsy (0:20 → 1:05)

**Click**: the link **"→ Run Demo Autopsy on 15 prior demos"** in the dashboard
center. The autopsy panel takes over fullscreen.

**Click**: the **"Extract patterns"** (or equivalent) button. Watch the
tally-board animate:
- 15 transcript tiles pulse one-by-one (1.2s)
- 4 lane bars fill left-to-right
- WEDGE pill stamps on CRM-stale (12/15) and Buyer-tracker (10/15)

**Narration over the animation**:

> "Watch what the brain found. Across 15 calls — 12 mentioned stale CRM,
> 10 mentioned the broken Excel buyer tracker. The wedge is right there.
> Outlook-native PE/IB deal teams. The product is reading our own failure
> log and telling us where to win."

---

## BEAT 2 — Find + Reach (1:05 → 1:50)

**Click**: the back button on the autopsy. Return to dashboard center.

**In the OutreachTestPanel**:
1. Paste a LinkedIn URL (e.g., `https://www.linkedin.com/in/colbeystabell/`)
2. Click **"Find via HOG"** — wait for enrichment (~3-5 sec)
3. Show the populated profile (name, title, company)
4. Show the **"BRAIN CONTEXT · 3 hits"** section — real snippets pulled from your seeded brain via gbrain.search()
5. Click **"Draft outreach DM"** — wait ~3 sec for Anthropic Sonnet 4.6
6. Show the 3-line DM that comes back

**Narration during the wait**:

> "Now I paste a prospect's LinkedIn. HOG enriches them.
> The brain auto-fetches the 3 most relevant snippets from our past calls
> about their company. Then Claude drafts a 3-line DM grounded in both —
> the prospect's profile AND what already worked in past calls."

**Optional**: click **Copy** to show the DM is ready to send.

---

## BEAT 3 — Live Coach Overlay (1:50 → 2:30)

**Click**: "Open Live Overlay" in the dashboard header. The transparent
overlay window appears top-right.

**Narration**:

> "Here's where the demo gets uncanny. During a real call, this overlay
> sits over my Zoom — and the prospect can't see it. macOS NSWindowSharingNone."

**Click** the **"Next prospect line"** button (or hit ⌘⇧N) **3 times in sequence**:

1. First click: card mutates to "Ask who owns DealCloud config" (the DealCloud
   match, 93% confidence — green badge)
2. Second click: card crossfades to "Show buyer-tracker auto-update" (94%)
3. Third click: card crossfades to "Lead with all-in-tenant Azure" (95%)

**Narration over the card mutations**:

> "Watch the card mutate. Each prospect line triggers our coach engine.
> It matches against the 5 most common Arvya objections — pulled from those
> 15 prior calls — and surfaces the EXACT line that closed it last time.
> Calibrated confidence score on the right."

---

## BEAT 4 — Receipt + Loop (2:30 → 2:50)

**Click**: **"End Call (demo)"** in the dashboard header. The Learning Receipt
sheet slides up from the bottom.

Watch the 5 facts populate one-by-one (250ms stagger):
1. Hypothesis evidenced ✓
2. New objection captured ("Compliance review takes 6 weeks…")
3. Pattern reinforced: DealCloud confusion (5/15 → 6/16)
4. Next experiment
5. Brain updated · 3 pages · 8 edges · 1 take

**Click**: **"Send follow-up →"** — button morphs to "Sending…" → "Sent ✓ at 2:34pm"

**Narration over the reveal**:

> "Call ends. The brain extracts: hypothesis evidenced, new objection
> captured, pattern reinforced, next experiment. One click — follow-up sent."

---

## BEAT 5 — Close (2:50 → 3:00)

**Narration** (looking into camera, no clicks needed):

> "We built this in 5 hours.
> We used our own product to find prospects, contact them, run the demo,
> and draft the follow-up.
> The next call we run will be smarter than this one."

End recording.

---

## Recording technical setup

- **Use QuickTime** screen recording, not Loom (ScreenCaptureKit may bypass NSWindowSharingNone on Loom).
- Record the **entire screen** at native resolution.
- Mic input: Mac built-in is fine for the narration; speak close.
- Keep the Electron window centered. The dashboard should fill most of the screen.
- If the overlay window needs to be visible for the recording (it normally hides from screen-share), it WILL appear on a QuickTime recording done on the same Mac (setContentProtection only hides from external capture / share to other apps). So you're good.

## Quick pre-flight before recording

```bash
# Make sure gbrain is up
curl -s http://localhost:3131/health

# Make sure Electron is up — dashboard window visible
# Confirm Mission Scoreboard shows real number, not "—"

# In the OutreachTestPanel: pre-test the HOG URL once
# (so the recording's HOG call is warm and fast)
```

## If anything breaks during recording

| Failure | Fallback |
|---|---|
| HOG returns 402 | Skip the "Find via HOG" click. Show the autopsy + overlay only. |
| Anthropic times out | The deterministic Coach scenarios still work. Just use the overlay cycle. |
| gbrain unreachable | Mission Scoreboard stays at "—". Skip to the autopsy beat directly. |
| Overlay crossfade glitches | Just click again — the demo cycle is idempotent. |

## What this demo PROVES to a YC partner

1. **Recursive elegance** — the product literally analyzes our own demo failures and tells us what to build.
2. **Cross-conversation memory** — the LiveCoach cites past calls by name.
3. **Founder approval gating** — every customer-visible action goes through a human approve gate.
4. **Built-in 5 hours** — and the brain has 181 real pages.
5. **The next call will be smarter than this one** — the loop closes via the Learning Receipt.
