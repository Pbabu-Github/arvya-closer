import { useState } from 'react';
import { useStaggerReveal, useCountUp } from '../../hooks';

interface Transcript {
  id: string;
  title: string;
  date: string;
}

interface Lane {
  id: string;
  label: string;
  count: number;
  threshold: number;
}

const TRANSCRIPTS: Transcript[] = [
  { id: 'ft-partners', title: 'FT Partners Call', date: '2026-04-12' },
  { id: 'anu', title: 'Anu Call', date: '2026-04-15' },
  { id: 'daniel-wolf', title: 'Daniel Wolf Call', date: '2026-04-18' },
  { id: 'naveen-siva-sameer', title: 'Naveen + Siva + Sameer', date: '2026-04-22' },
  { id: 'maavo', title: 'Maavo Naveen Siva PB', date: '2026-04-25' },
  { id: 'surya', title: 'Surya Oruganti', date: '2026-04-28' },
  { id: 'coura', title: 'Coura', date: '2026-05-01' },
  { id: 'goutham-jeff', title: 'Goutham Jeff', date: '2026-05-03' },
  { id: 'harpi', title: 'Harpi', date: '2026-05-05' },
  { id: 'annie-drf', title: 'Annie DRF', date: '2026-05-07' },
  { id: 'gazeele', title: 'Project Gazeele', date: '2026-05-09' },
  { id: 'selvam', title: 'Selvam Arvya', date: '2026-05-10' },
  { id: 'vc-naveen-anu', title: 'VC Naveen Anu', date: '2026-05-11' },
  { id: 'usa', title: 'Union Square Advisors', date: '2026-05-13' },
  { id: 'sumit', title: 'Sumit Arvya', date: '2026-05-14' },
];

const LANES: Lane[] = [
  { id: 'security', label: 'Security', count: 8, threshold: 9 },
  { id: 'dealcloud', label: 'DealCloud', count: 5, threshold: 9 },
  { id: 'crm_stale', label: 'CRM stale', count: 12, threshold: 9 },
  { id: 'buyer_tracker', label: 'Buyer tracker', count: 10, threshold: 9 },
];

const TOTAL = 15;

const STAGE1_STEP_MS = 80;
const STAGE2_DURATION_MS = 2400;
const STAGE3_TRIGGER_MS = 2400;

type Stage = 'idle' | 'running';

const EMPTY_TRANSCRIPTS: Transcript[] = [];

interface Props {
  onClose?: () => void;
}

export function DemoAutopsyPanel({ onClose }: Props) {
  const [stage, setStage] = useState<Stage>('idle');
  const [showWedges, setShowWedges] = useState(false);
  const [runKey, setRunKey] = useState(0);

  const onExtract = () => {
    setStage('running');
    setShowWedges(false);
    setRunKey((k) => k + 1);
    window.setTimeout(() => setShowWedges(true), STAGE3_TRIGGER_MS);
  };

  const onReset = () => {
    setStage('idle');
    setShowWedges(false);
    setRunKey((k) => k + 1);
  };

  return (
    <div className="autopsy">
      <header className="autopsy__header">
        <div className="autopsy__heading">
          {onClose && (
            <button onClick={onClose} className="btn btn--ghost autopsy__back" aria-label="Back">
              ←
            </button>
          )}
          <h2 className="autopsy__title">Demo Autopsy — Analyzing {TOTAL} prior calls</h2>
        </div>
        <div className="autopsy__actions">
          {stage === 'idle' ? (
            <button onClick={onExtract} className="btn btn--primary">
              Extract patterns
            </button>
          ) : (
            <button onClick={onReset} className="btn btn--ghost">
              Reset
            </button>
          )}
        </div>
      </header>

      <div className="autopsy__body">
        <div className="autopsy__transcripts">
          <div className="autopsy__section-label">Prior transcripts</div>
          <TranscriptGrid key={`grid-${runKey}`} running={stage === 'running'} />
        </div>

        <div className="autopsy__lanes-wrap">
          <div className="autopsy__section-label">Pattern frequency</div>
          <div className="autopsy__lanes">
            {LANES.map((lane) => (
              <LaneRow
                key={`${lane.id}-${runKey}`}
                lane={lane}
                running={stage === 'running'}
                showWedge={showWedges}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface TranscriptGridProps {
  running: boolean;
}

function TranscriptGrid({ running }: TranscriptGridProps) {
  const items = running ? TRANSCRIPTS : EMPTY_TRANSCRIPTS;
  const visible = useStaggerReveal(items, STAGE1_STEP_MS);
  const visibleIds = new Set(visible.map((t) => t.id));

  return (
    <div className="autopsy__grid">
      {TRANSCRIPTS.map((t) => {
        const isIn = visibleIds.has(t.id);
        return (
          <div
            key={t.id}
            className={`autopsy__tile ${isIn ? 'autopsy__tile--in' : ''}`}
          >
            <div className="autopsy__tile-title">{t.title}</div>
            <div className="autopsy__tile-date">{t.date}</div>
          </div>
        );
      })}
    </div>
  );
}

interface LaneRowProps {
  lane: Lane;
  running: boolean;
  showWedge: boolean;
}

function LaneRow({ lane, running, showWedge }: LaneRowProps) {
  const target = running ? lane.count : 0;
  const count = useCountUp(target, STAGE2_DURATION_MS);
  const fillPct = Math.max(0, Math.min(100, (count / TOTAL) * 100));
  const isWedge = lane.count >= lane.threshold;

  return (
    <div className="autopsy__lane">
      <div className="autopsy__lane-header">
        <span className="autopsy__lane-label">{lane.label}</span>
        <span className="autopsy__lane-count">
          {count}/{TOTAL}
        </span>
      </div>
      <div className="autopsy__lane-bar">
        <div className="autopsy__lane-fill" style={{ width: `${fillPct}%` }} />
        {isWedge && showWedge && <span className="autopsy__wedge">WEDGE</span>}
      </div>
    </div>
  );
}
