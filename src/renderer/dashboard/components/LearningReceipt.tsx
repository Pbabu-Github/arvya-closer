/**
 * LearningReceipt — bottom-sheet that slides up after "End Call".
 * Stages 5 fact-pile rows on a 250ms cadence via useStaggerReveal.
 * Single CTA "Send follow-up →" that morphs to "Sending…" → "Sent ✓".
 */

import { useEffect, useState } from 'react';
import { useStaggerReveal } from '../../hooks/useStaggerReveal';
import { useMorph } from '../../hooks/useMorph';

type ReceiptFact = {
  id: string;
  label: string;
  detail?: string;
};

const HARDCODED_FACTS: ReceiptFact[] = [
  { id: 'hyp', label: 'Hypothesis evidenced ✓', detail: 'PE/IB deal teams care about CRM-stale pain' },
  { id: 'obj', label: 'New objection captured', detail: '"Compliance review takes 6 weeks for new vendors"' },
  { id: 'pat', label: 'Pattern reinforced: DealCloud confusion', detail: '5/15 → 6/16 calls now mention DealCloud-not-Salesforce' },
  { id: 'exp', label: 'Next experiment: ask about IT security gate earlier', detail: 'Move security objection from late-stage to discovery' },
  { id: 'brain', label: 'Brain updated', detail: '3 pages added · 8 new edges · 1 take' },
];

type ButtonPhase = 'idle' | 'sending' | 'sent';

interface LearningReceiptProps {
  open: boolean;
  onClose: () => void;
}

export function LearningReceipt({ open, onClose }: LearningReceiptProps) {
  const [phase, setPhase] = useState<ButtonPhase>('idle');
  const facts = useStaggerReveal(open ? HARDCODED_FACTS : [], 250);

  // Morphing button text
  const buttonLabel = phase === 'idle' ? 'Send follow-up →' : phase === 'sending' ? 'Sending…' : 'Sent ✓ at 2:34pm';
  const morphedLabel = useMorph(buttonLabel, 400);

  // Reset phase when the sheet is closed and reopened
  useEffect(() => {
    if (open) setPhase('idle');
  }, [open]);

  if (!open) return null;

  const onSend = () => {
    if (phase !== 'idle') return;
    setPhase('sending');
    setTimeout(() => setPhase('sent'), 700);
  };

  return (
    <div className="receipt-backdrop" onClick={onClose}>
      <div className="receipt-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="receipt-header">
          <div className="receipt-title">Learning Receipt</div>
          <div className="receipt-subtitle">Call ended · 2:34pm · synthesize complete</div>
          <button className="receipt-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <ul className="receipt-facts">
          {facts.map((fact) => (
            <li key={fact.id} className="receipt-fact">
              <div className="receipt-fact__label">{fact.label}</div>
              {fact.detail && <div className="receipt-fact__detail">{fact.detail}</div>}
            </li>
          ))}
        </ul>

        <button
          className={`receipt-cta receipt-cta--${phase}`}
          onClick={onSend}
          disabled={phase !== 'idle'}
        >
          {morphedLabel}
        </button>
      </div>
    </div>
  );
}
