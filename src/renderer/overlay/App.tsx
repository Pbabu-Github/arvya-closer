import { useEffect, useMemo, useState } from "react";
import { useCrossfade } from "../hooks/useCrossfade.ts";
// window.pmf types live in src/renderer/pmf-api.d.ts

type CoachCard = {
  type: "say" | "ask" | "avoid" | "show" | "close";
  headline: string;
  body: string;
  confidence: number;
};

const DEMO_CARDS: CoachCard[] = [
  {
    type: "ask",
    headline: "Ask who owns DealCloud config",
    body: "Their CRM is schema-driven - your agent should auto-adapt",
    confidence: 0.82,
  },
  {
    type: "show",
    headline: "Show buyer tracker auto-update",
    body: "They mentioned Excel buyer tracker pain - strongest match in our brain",
    confidence: 0.94,
  },
  {
    type: "avoid",
    headline: "Avoid Salesforce-only positioning",
    body: "They use DealCloud, not Salesforce - our brain has the exact prior objection",
    confidence: 0.91,
  },
];

const TRANSCRIPT_LINES = [
  "Prospect: Honestly, we use DealCloud, not Salesforce.",
  "Prospect: Our buyer tracker is still mostly Excel.",
];

function getConfidenceTone(confidence: number): "high" | "medium" | "low" {
  if (confidence >= 0.9) return "high";
  if (confidence >= 0.75) return "medium";
  return "low";
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const confidenceLabel = `${Math.round(confidence * 100)}%`;

  return (
    <div
      className="confidence-badge"
      data-tone={getConfidenceTone(confidence)}
      aria-label={`Confidence ${confidenceLabel}`}
    >
      {confidenceLabel}
    </div>
  );
}

function GuidanceCard({
  card,
  className = "",
}: {
  card: CoachCard;
  className?: string;
}) {
  return (
    <article className={`guidance-card ${className}`}>
      <ConfidenceBadge confidence={card.confidence} />
      <div className="guidance-card__type">{card.type}</div>
      <h1 className="guidance-card__headline">{card.headline}</h1>
      <p className="guidance-card__body">{card.body}</p>
    </article>
  );
}

function TranscriptPane({ lines }: { lines: string[] }) {
  return (
    <section className="transcript-pane" aria-label="Transcript tail">
      {lines.slice(-2).map((line) => (
        <div key={line} className="transcript-pane__line">
          {line}
        </div>
      ))}
    </section>
  );
}

export function Overlay() {
  const [cardIndex, setCardIndex] = useState(0);
  const [clickThrough, setClickThrough] = useState(false);
  const card = DEMO_CARDS[cardIndex];
  const crossfade = useCrossfade(card, 200);
  const transcriptTail = useMemo(() => TRANSCRIPT_LINES, []);

  // Hotkey: Cmd+Shift+T toggles click-through
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === "t") {
        const next = !clickThrough;
        await window.pmf.overlayToggleClickThrough(next);
        setClickThrough(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clickThrough]);

  const previousCard =
    crossfade.phase === "crossfading" ? crossfade.previous : null;

  return (
    <div className="overlay-root">
      <div className="overlay-main">
        <div className="guidance-crossfade" aria-live="polite">
          {previousCard ? (
            <GuidanceCard
              card={previousCard}
              className="guidance-card--previous"
            />
          ) : null}
          <GuidanceCard
            card={crossfade.current}
            className={
              crossfade.phase === "crossfading"
                ? "guidance-card--current guidance-card--fresh"
                : "guidance-card--current"
            }
          />
        </div>
      </div>

      <div className="overlay-bottom">
        <TranscriptPane lines={transcriptTail} />
      </div>

      <div className="overlay-footer">
        <button
          className="overlay-next"
          type="button"
          onClick={() =>
            setCardIndex((index) => (index + 1) % DEMO_CARDS.length)
          }
        >
          Next suggestion (demo)
        </button>
        <span className={`overlay-footer__state ${clickThrough ? "on" : ""}`}>
          {clickThrough ? "click-through ON" : "click-through off"}
        </span>
      </div>
    </div>
  );
}
