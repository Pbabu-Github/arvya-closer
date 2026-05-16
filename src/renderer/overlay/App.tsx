import { useState, useEffect } from 'react';
// window.pmf types live in src/renderer/pmf-api.d.ts

type CoachCard = {
  type: 'say' | 'ask' | 'avoid' | 'show' | 'close';
  headline: string;
  body: string;
  confidence: number;
};

export function Overlay() {
  const [card, _setCard] = useState<CoachCard | null>(null);
  const [transcriptTail, _setTranscriptTail] = useState<string[]>([]);
  const [clickThrough, setClickThrough] = useState(false);

  // Hotkey: Cmd+Shift+T toggles click-through
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 't') {
        const next = !clickThrough;
        await window.pmf.overlayToggleClickThrough(next);
        setClickThrough(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clickThrough]);

  return (
    <div className="overlay-root">
      <div className="overlay-card">
        <div className="overlay-card__badge" data-confidence={card ? card.confidence : 0}>
          {card ? `${Math.round(card.confidence * 100)}%` : '·'}
        </div>
        <div className="overlay-card__type">{card?.type ?? 'waiting'}</div>
        <div className="overlay-card__headline">
          {card?.headline ?? 'Live coach ready — start the call'}
        </div>
        <div className="overlay-card__body">
          {card?.body ?? 'Suggestions appear here as the prospect speaks.'}
        </div>
      </div>

      <div className="overlay-transcript">
        {transcriptTail.length === 0 ? (
          <span className="overlay-transcript__placeholder">No transcript yet</span>
        ) : (
          transcriptTail.slice(-2).map((line, i) => (
            <div key={i} className="overlay-transcript__line">
              {line}
            </div>
          ))
        )}
      </div>

      <div className="overlay-footer">
        <span className="overlay-footer__hint">⌘⇧T click-through</span>
        <span className={`overlay-footer__state ${clickThrough ? 'on' : ''}`}>
          {clickThrough ? 'click-through ON' : 'click-through off'}
        </span>
      </div>
    </div>
  );
}
