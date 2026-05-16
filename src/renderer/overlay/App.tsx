import { useState, useEffect, useRef } from 'react';
// window.pmf types live in src/renderer/pmf-api.d.ts

type CoachCard = {
  type: 'say' | 'ask' | 'avoid' | 'show' | 'close';
  headline: string;
  body: string;
  confidence: number;
};

// Demo cycle — phrases that trigger the 5 deterministic Coach scenarios + 1 LLM fallback.
// Each click cycles to the next, fires window.pmf.coach.nextCard, displays the resulting card.
const DEMO_PHRASES = [
  { prospect: "Honestly, we use DealCloud — not Salesforce.", stage: 'objection' },
  { prospect: "The buyer tracker in Excel is never accurate.", stage: 'pain' },
  { prospect: "Our CRM is usually stale — everyone works out of Outlook.", stage: 'pain' },
  { prospect: "Security is the big question if this touches deal emails.", stage: 'objection' },
  { prospect: "Can you show us the product?", stage: 'discovery' },
  { prospect: "How do you handle compliance review for a new vendor?", stage: 'objection' },
];

export function Overlay() {
  const [card, setCard] = useState<CoachCard | null>(null);
  const [prevCard, setPrevCard] = useState<CoachCard | null>(null);
  const [transcriptTail, setTranscriptTail] = useState<string[]>([]);
  const [clickThrough, setClickThrough] = useState(false);
  const [demoIdx, setDemoIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [crossfading, setCrossfading] = useState(false);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hotkey: Cmd+Shift+T toggles click-through, Cmd+Shift+N triggers next demo card
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 't') {
        const next = !clickThrough;
        await window.pmf.overlayToggleClickThrough(next);
        setClickThrough(next);
      } else if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        await triggerNextCard();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clickThrough, demoIdx]);

  const triggerNextCard = async () => {
    if (loading) return;
    const phrase = DEMO_PHRASES[demoIdx % DEMO_PHRASES.length]!;
    setLoading(true);
    setTranscriptTail((t) => [...t, phrase.prospect].slice(-3));
    try {
      const r = (await window.pmf.coach.nextCard({
        lastTurns: [phrase.prospect],
        callStage: phrase.stage,
      })) as { ok: boolean; card?: CoachCard; result?: CoachCard; error?: string };

      const newCard = (r.card ?? r.result) as CoachCard | undefined;
      if (newCard) {
        // Crossfade: keep previous card visible during the 200ms transition
        if (card) setPrevCard(card);
        setCard(newCard);
        setCrossfading(true);
        if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = setTimeout(() => {
          setCrossfading(false);
          setPrevCard(null);
        }, 220);
      }
      setDemoIdx((i) => i + 1);
    } catch (e) {
      console.error('coach error', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="overlay-root">
      <div className="overlay-card-wrap">
        {/* Previous card fading out */}
        {prevCard && crossfading && (
          <div className="overlay-card overlay-card--leaving">
            <div className="overlay-card__badge" data-confidence={prevCard.confidence}>
              {Math.round(prevCard.confidence * 100)}%
            </div>
            <div className="overlay-card__type">{prevCard.type}</div>
            <div className="overlay-card__headline">{prevCard.headline}</div>
            <div className="overlay-card__body">{prevCard.body.slice(0, 120)}</div>
          </div>
        )}
        {/* Current card */}
        <div className={`overlay-card ${crossfading ? 'overlay-card--entering' : ''}`}>
          <div
            className="overlay-card__badge"
            data-confidence={card ? card.confidence : 0}
          >
            {card ? `${Math.round(card.confidence * 100)}%` : '·'}
          </div>
          <div className="overlay-card__type">{card?.type ?? 'waiting'}</div>
          <div className="overlay-card__headline">
            {card?.headline ?? 'Live coach ready'}
          </div>
          <div className="overlay-card__body">
            {card?.body?.slice(0, 120) ?? 'Click "Next prospect line" or ⌘⇧N to demo'}
          </div>
        </div>
      </div>

      <div className="overlay-transcript">
        {transcriptTail.length === 0 ? (
          <span className="overlay-transcript__placeholder">No transcript yet — click below to demo</span>
        ) : (
          transcriptTail.slice(-2).map((line, i) => (
            <div key={`${i}-${line.slice(0, 16)}`} className="overlay-transcript__line">
              "{line}"
            </div>
          ))
        )}
      </div>

      <button
        onClick={triggerNextCard}
        disabled={loading}
        className="overlay-demo-btn"
        title="⌘⇧N"
      >
        {loading ? 'Coach thinking…' : `Next prospect line  (${(demoIdx % DEMO_PHRASES.length) + 1}/${DEMO_PHRASES.length})`}
      </button>

      <div className="overlay-footer">
        <span className="overlay-footer__hint">⌘⇧T click-through · ⌘⇧N next card</span>
        <span className={`overlay-footer__state ${clickThrough ? 'on' : ''}`}>
          {clickThrough ? 'CT ON' : 'CT off'}
        </span>
      </div>
    </div>
  );
}
