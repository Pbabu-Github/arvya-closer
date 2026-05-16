import { useState, useEffect, useRef } from 'react';
// window.pmf types live in src/renderer/pmf-api.d.ts

type CoachCard = {
  type: 'say' | 'ask' | 'avoid' | 'show' | 'close';
  headline: string;
  body: string;
  confidence: number;
};

const DEMO_PHRASES = [
  { prospect: "Honestly, we use DealCloud — not Salesforce.", stage: 'objection' },
  { prospect: "The buyer tracker in Excel is never accurate.", stage: 'pain' },
  { prospect: "Our CRM is usually stale — everyone works out of Outlook.", stage: 'pain' },
  { prospect: "Security is the big question if this touches deal emails.", stage: 'objection' },
  { prospect: "Can you show us the product?", stage: 'discovery' },
  { prospect: "How do you handle compliance review for a new vendor?", stage: 'objection' },
];

const CHUNK_MS = 5000; // send a chunk every 5s to Groq Whisper (batch endpoint, ~3-4s latency)
const COACH_INTERVAL_MS = 8000; // re-trigger coach every 8s of new transcript
const MAX_TRANSCRIPT_TURNS = 6; // keep last 6 lines for coach context

export function Overlay() {
  const [card, setCard] = useState<CoachCard | null>(null);
  const [prevCard, setPrevCard] = useState<CoachCard | null>(null);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [clickThrough, setClickThrough] = useState(false);
  const [demoIdx, setDemoIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [crossfading, setCrossfading] = useState(false);
  const [listening, setListening] = useState(false);
  const [listenError, setListenError] = useState<string | null>(null);

  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const coachTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptRef = useRef<string[]>([]);

  // Keep ref in sync so timer callbacks see fresh data
  useEffect(() => { transcriptRef.current = transcript; }, [transcript]);

  // Hotkeys: ⌘⇧T click-through, ⌘⇧N next demo, ⌘⇧L toggle listen
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 't') {
        const next = !clickThrough;
        await window.pmf.overlayToggleClickThrough(next);
        setClickThrough(next);
      } else if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        await triggerDemoCard();
      } else if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        if (listening) stopListening();
        else startListening();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clickThrough, demoIdx, listening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderCard = (newCard: CoachCard) => {
    if (card) setPrevCard(card);
    setCard(newCard);
    setCrossfading(true);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = setTimeout(() => {
      setCrossfading(false);
      setPrevCard(null);
    }, 220);
  };

  const triggerDemoCard = async () => {
    if (loading) return;
    const phrase = DEMO_PHRASES[demoIdx % DEMO_PHRASES.length]!;
    setLoading(true);
    setTranscript((t) => [...t, `[demo] ${phrase.prospect}`].slice(-MAX_TRANSCRIPT_TURNS));
    try {
      const r = (await window.pmf.coach.nextCard({
        lastTurns: [phrase.prospect],
        callStage: phrase.stage,
      })) as { ok: boolean; card?: CoachCard; result?: CoachCard; error?: string };

      const newCard = (r.card ?? r.result) as CoachCard | undefined;
      if (newCard) renderCard(newCard);
      setDemoIdx((i) => i + 1);
    } catch (e) {
      console.error('coach error', e);
    } finally {
      setLoading(false);
    }
  };

  // -----------------------------------------------------------
  // LIVE AUDIO CAPTURE — getUserMedia → MediaRecorder → Groq Whisper
  // -----------------------------------------------------------
  const startListening = async () => {
    if (listening) return;
    setListenError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Build a fresh MediaRecorder. Default codec is audio/webm; Groq Whisper accepts webm.
      const recorder = new MediaRecorder(stream, {
        mimeType: pickMimeType(),
        audioBitsPerSecond: 96_000,
      });
      recorderRef.current = recorder;

      recorder.ondataavailable = async (event) => {
        if (!event.data || event.data.size < 2_000) return; // ignore micro-chunks
        try {
          const buf = await event.data.arrayBuffer();
          const bytes = new Uint8Array(buf);
          const resp = (await window.pmf.groq.transcribe(bytes)) as {
            ok: boolean;
            text?: string;
            error?: string;
          };
          if (resp.ok && resp.text && resp.text.trim()) {
            const line = resp.text.trim();
            setTranscript((t) => [...t, line].slice(-MAX_TRANSCRIPT_TURNS));
          } else if (!resp.ok && resp.error) {
            console.warn('[overlay] groq transcribe error:', resp.error);
          }
        } catch (e) {
          console.error('[overlay] chunk send failed', e);
        }
      };

      recorder.onerror = (event) => {
        console.error('[overlay] recorder error', event);
        setListenError(String((event as unknown as { error?: Error }).error?.message ?? 'recorder error'));
      };

      // Start recording. Use timeslice so ondataavailable fires every CHUNK_MS.
      recorder.start(CHUNK_MS);
      setListening(true);

      // Trigger coach engine periodically on the accumulated transcript
      coachTimerRef.current = setInterval(async () => {
        if (transcriptRef.current.length === 0) return;
        try {
          const r = (await window.pmf.coach.nextCard({
            lastTurns: transcriptRef.current,
            callStage: 'live',
          })) as { ok: boolean; card?: CoachCard; result?: CoachCard };
          const newCard = (r.card ?? r.result) as CoachCard | undefined;
          if (newCard) renderCard(newCard);
        } catch (e) {
          console.error('[overlay] coach poll failed', e);
        }
      }, COACH_INTERVAL_MS);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setListenError(msg.includes('NotAllowed') ? 'Mic permission denied. Allow in System Settings → Privacy → Microphone.' : msg);
      setListening(false);
    }
  };

  const stopListening = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
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
      <div className="overlay-card-wrap">
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
        <div className={`overlay-card ${crossfading ? 'overlay-card--entering' : ''}`}>
          <div className="overlay-card__badge" data-confidence={card ? card.confidence : 0}>
            {card ? `${Math.round(card.confidence * 100)}%` : '·'}
          </div>
          <div className="overlay-card__type">{listening ? 'LISTENING · ' + (card?.type ?? 'waiting') : card?.type ?? 'waiting'}</div>
          <div className="overlay-card__headline">
            {card?.headline ?? (listening ? 'Live coach listening…' : 'Live coach ready')}
          </div>
          <div className="overlay-card__body">
            {card?.body?.slice(0, 120) ?? (listening ? 'Speak — I\'ll surface the next move.' : 'Click "Start listening" or ⌘⇧L for live audio. Or ⌘⇧N to demo.')}
          </div>
        </div>
      </div>

      <div className="overlay-transcript">
        {transcript.length === 0 ? (
          <span className="overlay-transcript__placeholder">
            {listening ? 'Listening… first transcript in ~4s' : 'No transcript yet'}
          </span>
        ) : (
          transcript.slice(-2).map((line, i) => (
            <div key={`${i}-${line.slice(0, 16)}`} className="overlay-transcript__line">
              "{line}"
            </div>
          ))
        )}
      </div>

      {listenError && (
        <div className="overlay-transcript" style={{ color: '#ff5a5f', fontSize: 11 }}>
          ⚠ {listenError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {listening ? (
          <button onClick={stopListening} className="overlay-demo-btn" title="⌘⇧L">
            ⏹ Stop listening
          </button>
        ) : (
          <button onClick={startListening} className="overlay-demo-btn" title="⌘⇧L">
            ● Start listening
          </button>
        )}
        <button
          onClick={triggerDemoCard}
          disabled={loading}
          className="overlay-demo-btn"
          title="⌘⇧N"
          style={{ flex: 1 }}
        >
          {loading ? 'Coach thinking…' : `Demo cycle (${(demoIdx % DEMO_PHRASES.length) + 1}/${DEMO_PHRASES.length})`}
        </button>
      </div>

      <div className="overlay-footer">
        <span className="overlay-footer__hint">⌘⇧L listen · ⌘⇧N next · ⌘⇧T click-through</span>
        <span className={`overlay-footer__state ${clickThrough ? 'on' : ''}`}>
          {clickThrough ? 'CT ON' : 'CT off'}
        </span>
      </div>
    </div>
  );
}

function pickMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const t of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
  }
  return 'audio/webm';
}
