import { useEffect, useMemo, useRef, useState } from "react";
import { useCrossfade } from "../hooks/useCrossfade.ts";
// window.pmf types live in src/renderer/pmf-api.d.ts

type CoachCard = {
  type: "say" | "ask" | "avoid" | "show" | "close";
  headline: string;
  body: string;
  confidence: number;
};

// Brain-mined prospect quotes. We pull these from gbrain on mount using
// objection-flavored search seeds; no hardcoded fake phrases. Stage is
// inferred heuristically from the chunk content.
type BrainPhrase = {
  prospect: string;
  stage: string;
  slug?: string; // source page for provenance — shows the user this is REAL
  title?: string;
};

// Seed terms used to fish prospect-voice quotes out of the brain. Picked to
// hit buyer-tracker / DealCloud / Outlook / security / pricing pain — the
// content we actually have in 181 pages of past calls.
const BRAIN_PHRASE_SEEDS = [
  'objection',
  'concerned about',
  'we use DealCloud',
  'buyer tracker',
  'stale CRM',
  'security review',
  'how do you handle',
  'the problem is',
  'too expensive',
  'compliance review',
];

const CHUNK_MS = 5000; // send a chunk every 5s to Groq Whisper (batch endpoint, ~3-4s latency)
const COACH_INTERVAL_MS = 8000; // re-trigger coach every 8s of new transcript
const MAX_TRANSCRIPT_TURNS = 6; // keep last 6 lines for coach context

export function Overlay() {
  const [card, setCard] = useState<CoachCard | null>(null);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [clickThrough, setClickThrough] = useState(false);
  const [demoIdx, setDemoIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [listenError, setListenError] = useState<string | null>(null);
  const [phrases, setPhrases] = useState<BrainPhrase[]>([]);
  const [phrasesLoading, setPhrasesLoading] = useState(true);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const coachTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listeningRef = useRef<boolean>(false);
  const transcriptRef = useRef<string[]>([]);

  // Keep ref in sync so timer callbacks see fresh data
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // Pull real prospect quotes from the brain on mount. No hardcoded fakes —
  // if the brain returns nothing we hide the button entirely.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mined = await minePhrasesFromBrain();
      if (cancelled) return;
      setPhrases(mined);
      setPhrasesLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Hotkeys: ⌘⇧T click-through, ⌘⇧N next demo, ⌘⇧L toggle listen
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === "t") {
        const next = !clickThrough;
        await window.pmf.overlayToggleClickThrough(next);
        setClickThrough(next);
      } else if (e.metaKey && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        await triggerDemoCard();
      } else if (e.metaKey && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        if (listening) stopListening();
        else startListening();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clickThrough, demoIdx, listening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderCard = (newCard: CoachCard) => {
    setCard(newCard);
  };

  const fallbackCard = useMemo<CoachCard>(
    () => ({
      type: "say",
      headline: listening ? "Live coach listening..." : "Live coach ready",
      body: listening
        ? "Speak - I'll surface the next move."
        : 'Click "Start listening" or Cmd+Shift+L for live audio. Or Cmd+Shift+N to demo.',
      confidence: 0,
    }),
    [listening],
  );
  const crossfade = useCrossfade(card ?? fallbackCard, 200);
  const previousCard =
    crossfade.phase === "crossfading" ? crossfade.previous : null;

  const triggerDemoCard = async () => {
    if (loading || phrases.length === 0) return;
    const phrase = phrases[demoIdx % phrases.length]!;
    setLoading(true);
    setTranscript((t) =>
      [...t, `[from brain] ${phrase.prospect}`].slice(-MAX_TRANSCRIPT_TURNS),
    );
    try {
      const r = (await window.pmf.coach.nextCard({
        lastTurns: [phrase.prospect],
        callStage: phrase.stage,
      })) as {
        ok: boolean;
        card?: CoachCard;
        result?: CoachCard;
        error?: string;
      };

      const newCard = (r.card ?? r.result) as CoachCard | undefined;
      if (newCard) renderCard(newCard);
      setDemoIdx((i) => i + 1);
    } catch (e) {
      console.error("coach error", e);
    } finally {
      setLoading(false);
    }
  };

  const currentPhrase: BrainPhrase | null =
    phrases.length > 0 ? phrases[demoIdx % phrases.length]! : null;

  // -----------------------------------------------------------
  // LIVE AUDIO CAPTURE — getUserMedia → MediaRecorder → Groq Whisper
  //
  // We do NOT use MediaRecorder.start(timeslice). With timeslice, only the
  // FIRST chunk carries the webm container header; subsequent chunks are raw
  // fragments that Whisper cannot decode and answers with hallucinations
  // ("Thanks for watching.", "🎵", etc).
  //
  // Instead we run a chain of short recordings: every CHUNK_MS we stop the
  // recorder (which emits one complete, self-contained blob), then immediately
  // start a fresh recorder on the same stream. Each blob is a valid webm.
  // -----------------------------------------------------------
  const startListening = async () => {
    if (listening) return;
    setListenError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      listeningRef.current = true;
      setListening(true);
      spawnRecorder(stream);

      // Trigger coach engine periodically on the accumulated transcript
      coachTimerRef.current = setInterval(async () => {
        const turns = transcriptRef.current.filter(
          (line) => !line.startsWith("[demo] ") && !isLikelyHallucination(line),
        );
        if (turns.length === 0) return;
        try {
          const r = (await window.pmf.coach.nextCard({
            lastTurns: turns,
            callStage: "live",
          })) as { ok: boolean; card?: CoachCard; result?: CoachCard };
          const newCard = (r.card ?? r.result) as CoachCard | undefined;
          if (newCard) renderCard(newCard);
        } catch (e) {
          console.error("[overlay] coach poll failed", e);
        }
      }, COACH_INTERVAL_MS);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setListenError(
        msg.includes("NotAllowed")
          ? "Mic permission denied. Allow in System Settings → Privacy → Microphone."
          : msg,
      );
      listeningRef.current = false;
      setListening(false);
    }
  };

  const spawnRecorder = (stream: MediaStream) => {
    if (!listeningRef.current) return;
    const mime = pickMimeType();
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      audioBitsPerSecond: 96_000,
    });
    recorderRef.current = recorder;
    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: mime });
      // Restart immediately so we don't drop audio between chunks
      if (listeningRef.current) spawnRecorder(stream);

      if (blob.size < 4_000) return; // < ~330ms of opus @ 96kbps — drop noise
      try {
        const buf = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const resp = (await window.pmf.groq.transcribe(bytes, mime)) as {
          ok: boolean;
          text?: string;
          error?: string;
        };
        if (resp.ok && resp.text && resp.text.trim()) {
          const line = resp.text.trim();
          if (isLikelyHallucination(line)) {
            console.debug("[overlay] dropping hallucination:", line);
            return;
          }
          setTranscript((t) => [...t, line].slice(-MAX_TRANSCRIPT_TURNS));
        } else if (!resp.ok && resp.error) {
          console.warn("[overlay] groq transcribe error:", resp.error);
        }
      } catch (e) {
        console.error("[overlay] chunk send failed", e);
      }
    };

    recorder.onerror = (event) => {
      console.error("[overlay] recorder error", event);
      setListenError(
        String(
          (event as unknown as { error?: Error }).error?.message ??
            "recorder error",
        ),
      );
    };

    recorder.start();
    // Stop after CHUNK_MS to produce one complete, self-decoding blob
    chunkTimerRef.current = setTimeout(() => {
      if (recorder.state === "recording") {
        try {
          recorder.stop();
        } catch {
          /* ignore */
        }
      }
    }, CHUNK_MS);
  };

  const stopListening = () => {
    listeningRef.current = false;
    if (chunkTimerRef.current) {
      clearTimeout(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (coachTimerRef.current) {
      clearInterval(coachTimerRef.current);
      coachTimerRef.current = null;
    }
    recorderRef.current = null;
    setListening(false);
  };

  return (
    <div className="overlay-root">
      <div
        className="overlay-titlebar"
        title="Drag to move overlay"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="overlay-titlebar__grip">
          <span /><span /><span /><span /><span /><span />
        </span>
        <span className="overlay-titlebar__label">
          <span className="overlay-titlebar__dot" />
          arvya · live coach
        </span>
        <button
          className="overlay-titlebar__close"
          title="Hide overlay (⌘W)"
          onClick={() => window.pmf.hideOverlay()}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          ✕
        </button>
      </div>
      <div className="overlay-card-wrap">
        {previousCard && (
          <CoachOverlayCard
            card={previousCard}
            listening={listening}
            className="overlay-card--leaving"
          />
        )}
        <CoachOverlayCard
          card={crossfade.current}
          listening={listening}
          className={
            crossfade.phase === "crossfading" ? "overlay-card--entering" : ""
          }
        />
      </div>

      <div className="overlay-transcript">
        {transcript.length === 0 ? (
          <span className="overlay-transcript__placeholder">
            {listening
              ? "Listening… first transcript in ~4s"
              : "No transcript yet"}
          </span>
        ) : (
          transcript.slice(-2).map((line, i) => (
            <div
              key={`${i}-${line.slice(0, 16)}`}
              className="overlay-transcript__line"
            >
              "{line}"
            </div>
          ))
        )}
      </div>

      {listenError && (
        <div
          className="overlay-transcript"
          style={{ color: "#ff5a5f", fontSize: 11 }}
        >
          ⚠ {listenError}
        </div>
      )}

      <div
        style={
          {
            display: "flex",
            gap: 6,
            margin: "8px 12px 0",
            WebkitAppRegion: "no-drag",
          } as React.CSSProperties
        }
      >
        {listening ? (
          <button
            onClick={stopListening}
            className="overlay-demo-btn"
            title="⌘⇧L"
          >
            ⏹ Stop listening
          </button>
        ) : (
          <button
            onClick={startListening}
            className="overlay-demo-btn"
            title="⌘⇧L"
          >
            ● Start listening
          </button>
        )}
        {phrases.length > 0 && (
          <button
            onClick={triggerDemoCard}
            disabled={loading}
            className="overlay-demo-btn"
            title={currentPhrase ? `Real prospect quote from past call: "${currentPhrase.prospect}"` : ''}
            style={{ flex: 1 }}
          >
            {loading
              ? "Coach thinking…"
              : `Try real objection · ${(demoIdx % phrases.length) + 1}/${phrases.length}`}
          </button>
        )}
      </div>

      {!listening && currentPhrase && (
        <div className="overlay-explainer">
          <span className="overlay-explainer__label">From brain:</span>
          <span className="overlay-explainer__quote">
            "{currentPhrase.prospect}"
          </span>
          {currentPhrase.slug && (
            <span className="overlay-explainer__source" title={currentPhrase.slug}>
              · {currentPhrase.title ?? shortSlug(currentPhrase.slug)}
            </span>
          )}
        </div>
      )}
      {!listening && phrasesLoading && phrases.length === 0 && (
        <div className="overlay-explainer">
          <span className="overlay-explainer__label">Mining brain…</span>
          <span className="overlay-explainer__quote">
            Loading real prospect quotes from past calls.
          </span>
        </div>
      )}

      <div className="overlay-footer">
        <span className="overlay-footer__hint">
          ⌘⇧L listen · ⌘⇧N next · ⌘⇧T click-through
        </span>
        <span className={`overlay-footer__state ${clickThrough ? "on" : ""}`}>
          {clickThrough ? "CT ON" : "CT off"}
        </span>
      </div>
    </div>
  );
}

function CoachOverlayCard({
  card,
  listening,
  className = "",
}: {
  card: CoachCard;
  listening: boolean;
  className?: string;
}) {
  const confidenceLabel =
    card.confidence > 0 ? `${Math.round(card.confidence * 100)}%` : "·";

  return (
    <div className={`overlay-card ${className}`}>
      <div className="overlay-card__badge" data-confidence={card.confidence}>
        {confidenceLabel}
      </div>
      <div className="overlay-card__type">
        {listening ? `LISTENING · ${card.type}` : card.type}
      </div>
      <div className="overlay-card__headline">{card.headline}</div>
      <div className="overlay-card__body">{card.body.slice(0, 120)}</div>
    </div>
  );
}

/**
 * Mine prospect-voice quotes out of gbrain. Runs once on overlay mount.
 * Strategy: fan out a handful of objection-flavored search terms, extract
 * short sentences from the returned chunks, score by how "prospect-shaped"
 * they are (1st-person buyer voice, contains a complaint cue), dedupe.
 *
 * Returns up to 8 phrases. If gbrain is unreachable or has nothing relevant,
 * returns [] and the overlay hides the button — better silence than fakes.
 */
async function minePhrasesFromBrain(): Promise<BrainPhrase[]> {
  if (typeof window === "undefined" || !window.pmf?.gbrain?.search) return [];

  const found: BrainPhrase[] = [];
  const seen = new Set<string>();

  for (const seed of BRAIN_PHRASE_SEEDS) {
    try {
      const r = (await window.pmf.gbrain.search(seed)) as {
        ok: boolean;
        result?: unknown;
      };
      if (!r.ok) continue;
      const hits = parseSearchHits(r.result);
      for (const h of hits) {
        const text = (h.chunk_text ?? "").toString();
        if (!text) continue;
        const sentences = extractProspectSentences(text);
        for (const s of sentences) {
          const norm = s.toLowerCase().slice(0, 80);
          if (seen.has(norm)) continue;
          seen.add(norm);
          found.push({
            prospect: s,
            stage: inferStage(s),
            slug: h.slug,
            title: h.title,
          });
          if (found.length >= 24) break;
        }
        if (found.length >= 24) break;
      }
    } catch {
      /* skip individual seed failures */
    }
    if (found.length >= 24) break;
  }

  // Rank by length-sweet-spot (40-160 chars reads best in a coach card) and
  // diversity by source slug — at most 2 quotes per slug so we don't show 6
  // lines from the same call.
  const perSlug = new Map<string, number>();
  const ranked = found
    .map((p) => ({
      ...p,
      __score: scorePhrase(p.prospect),
    }))
    .sort((a, b) => b.__score - a.__score)
    .filter((p) => {
      const slug = p.slug ?? "_";
      const n = perSlug.get(slug) ?? 0;
      if (n >= 2) return false;
      perSlug.set(slug, n + 1);
      return true;
    })
    .slice(0, 8);

  return ranked.map(({ __score, ...rest }) => {
    void __score;
    return rest;
  });
}

type RawHit = {
  slug?: string;
  title?: string;
  chunk_text?: string;
  score?: number;
};

function parseSearchHits(raw: unknown): RawHit[] {
  let v: unknown = raw;
  for (let i = 0; i < 4; i++) {
    if (!v) break;
    if (typeof v === "object" && "content" in (v as object)) {
      const c = (v as { content?: Array<{ text?: string }> }).content;
      if (Array.isArray(c) && typeof c[0]?.text === "string") {
        try {
          v = JSON.parse(c[0].text);
        } catch {
          v = c[0].text;
        }
        continue;
      }
    }
    if (
      typeof v === "object" &&
      "result" in (v as object) &&
      Object.keys(v as object).length <= 3
    ) {
      v = (v as { result: unknown }).result;
      continue;
    }
    break;
  }
  return Array.isArray(v) ? (v as RawHit[]) : [];
}

// Pull sentences that read like buyer speech. We skip narration ("they said",
// "the prospect noted") and lean toward quoted/first-person fragments.
function extractProspectSentences(text: string): string[] {
  // Split on sentence enders. Keeps `?` and `!` which matter for objections.
  const rough = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 30 && s.length <= 220);

  const out: string[] = [];
  for (let s of rough) {
    // Strip a leading speaker tag like "Naveen:" / "PB:" / "Prospect:"
    s = s.replace(/^[A-Z][A-Za-z. ]{0,30}:\s+/, "");
    // Strip surrounding quotes if present
    s = s.replace(/^["“'](.*?)["”']$/, "$1");
    if (!/^[A-Z“"']/.test(s) && !/^I |^We |^Our /.test(s)) continue;
    // Skip narration cues
    if (/\b(they said|the prospect|the buyer|the client)\b/i.test(s)) continue;
    // Skip URLs and markdown noise
    if (/https?:|\]\(|\\n|---/.test(s)) continue;
    out.push(s);
  }
  return out;
}

function inferStage(s: string): string {
  const lower = s.toLowerCase();
  if (/\?$/.test(s) || /\bhow\b|\bwhat\b|\bwhy\b|\bcan you\b/.test(lower))
    return "discovery";
  if (/\b(security|compliance|cost|expensive|but|concern|worried)\b/.test(lower))
    return "objection";
  if (/\b(broken|stale|never|always|hate|frustrat|pain|hard)\b/.test(lower))
    return "pain";
  return "live";
}

function scorePhrase(s: string): number {
  let score = 0;
  const len = s.length;
  // Sweet spot 60-150 chars
  if (len >= 60 && len <= 150) score += 3;
  else if (len >= 40 && len <= 180) score += 1;
  // Bonus for prospect-voice signals
  if (/^I |^We |^Our /.test(s)) score += 2;
  if (/\?$/.test(s)) score += 1; // questions are great coach triggers
  if (/\b(DealCloud|Outlook|CRM|buyer tracker|Salesforce|security)\b/i.test(s))
    score += 2;
  // Penalty for very short or run-on
  if (len < 40) score -= 2;
  if (len > 200) score -= 1;
  return score;
}

function shortSlug(slug: string): string {
  const tail = slug.split("/").pop() ?? slug;
  return tail.length > 32 ? tail.slice(0, 30) + "…" : tail;
}

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const t of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(t)
    )
      return t;
  }
  return "audio/webm";
}

/**
 * Whisper hallucinates a fixed bag of phrases on silent / near-silent / noisy
 * audio. Drop these so they don't poison the transcript window the coach reads.
 * Pattern catalog from openai/whisper#928, #1762 + Groq's whisper-large-v3
 * behavior on demo Mac mic input.
 */
const HALLUCINATION_PATTERNS: RegExp[] = [
  /^[\s.,?!♪♫♬♭♮♯]*$/u, // empty / only punctuation / music notes
  /thanks?\s+(for|so much\s+for)\s+watching/i,
  /thank\s+you\s+(so much\s+)?for\s+watching/i,
  /please\s+(like|subscribe)/i,
  /subscribe\s+(to\s+)?(my|the)\s+channel/i,
  /see\s+you\s+(in\s+the\s+)?next\s+(video|time)/i,
  /^\s*you\s*$/i,
  /^\s*bye\s*\.?\s*$/i,
  /^\s*(thanks|thank you)\.?\s*$/i,
  /♪/,
];

function isLikelyHallucination(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3) return true;
  return HALLUCINATION_PATTERNS.some((re) => re.test(trimmed));
}
