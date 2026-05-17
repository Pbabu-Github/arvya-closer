/**
 * DemoAutopsyPanel — reveals real patterns extracted from the 15 prior
 * Arvya demo transcripts. Loads precached results from disk (the precache
 * script ran via Anthropic + gbrain at hour 3), then animates the reveal
 * on stage: transcript tiles pulse, SVG arcs fly to the lanes they hit,
 * lane bars fill, the wedge gets stamped, and a real quote pops in.
 *
 * Source of truth: data/demo-autopsy-result.json (enriched by
 * src/lib/autopsy-enrich.ts to add real meeting-notes dates + per-lane
 * transcript hit lists).
 */

import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useStaggerReveal, useCountUp } from '../../hooks';

// ---------- Shape coming back from pmf:autopsy:load-cached ----------
type EnrichedTranscript = { id: string; title: string; dateIso: string | null };
type EnrichedLane = {
  id: string;
  label: string;
  count: number;
  threshold: number;
  quotes: string[];
  hitTranscriptIndices: number[];
};
type AutopsyData = {
  transcripts: EnrichedTranscript[];
  lanes: EnrichedLane[];
  wedge: string;
  summary?: string;
  source?: string;
};

// ---------- Timing knobs ----------
const STAGE1_STEP_MS = 80; // transcript pulse stagger
const STAGE2_LANE_DELAY_MS = 180; // delay between lanes starting to fill
const STAGE2_FILL_MS = 1400; // per-lane fill duration
const STAGE3_TRIGGER_MS = 2600; // when wedge pill stamps + summary appears
const LINE_FLIGHT_MS = 700; // how long each SVG line takes to draw

// Only show the 4 main lanes on the tally board (matches the spec).
// over_demo is a coach trigger, not a pipeline wedge.
const DISPLAY_LANE_IDS = ['security', 'dealcloud', 'crm_stale', 'buyer_tracker'];

const SHORT_LABELS: Record<string, string> = {
  security: 'Security & compliance',
  dealcloud: 'DealCloud (not Salesforce)',
  crm_stale: 'CRM stale · Outlook-native',
  buyer_tracker: 'Excel buyer-tracker pain',
};

const TOTAL = 15;
const EMPTY: EnrichedTranscript[] = [];

type Stage = 'idle' | 'running' | 'done';

interface Props {
  onClose?: () => void;
}

export function DemoAutopsyPanel({ onClose }: Props) {
  const [data, setData] = useState<AutopsyData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [runKey, setRunKey] = useState(0);
  const [showWedges, setShowWedges] = useState(false);
  const [activeQuoteLaneId, setActiveQuoteLaneId] = useState<string | null>(null);

  // Load real precached data on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !window.pmf?.autopsy) return;
    let cancelled = false;
    window.pmf.autopsy
      .loadCached()
      .then((r) => {
        if (cancelled) return;
        if (!r.ok) {
          setLoadError(r.error ?? 'autopsy precache not available');
          return;
        }
        const raw = r as unknown as AutopsyData;
        const lanes = DISPLAY_LANE_IDS.map((id) => raw.lanes.find((l) => l.id === id)).filter(
          (l): l is EnrichedLane => !!l,
        );
        setData({ ...raw, lanes });
      })
      .catch((e) => {
        if (!cancelled) setLoadError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onExtract = () => {
    setStage('running');
    setShowWedges(false);
    setActiveQuoteLaneId(null);
    setRunKey((k) => k + 1);
    window.setTimeout(() => {
      setShowWedges(true);
      setStage('done');
    }, STAGE3_TRIGGER_MS);
  };

  const onReset = () => {
    setStage('idle');
    setShowWedges(false);
    setActiveQuoteLaneId(null);
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
          <h2 className="autopsy__title">Demo Autopsy — {TOTAL} prior calls</h2>
          {data?.source === 'partial' && (
            <span className="autopsy__source-pill" title={data.summary}>
              real keyword scan · LLM summary deferred
            </span>
          )}
        </div>
        <div className="autopsy__actions">
          {stage === 'idle' ? (
            <button
              onClick={onExtract}
              className="btn btn--primary"
              disabled={!data && !loadError}
            >
              Extract patterns
            </button>
          ) : (
            <button onClick={onReset} className="btn btn--ghost">
              Reset
            </button>
          )}
        </div>
      </header>

      {loadError && (
        <div className="autopsy__error">
          ⚠️ Could not load precache: {loadError}
          <div className="autopsy__error-hint">
            Run <code>bun run scripts/precache-demo-autopsy.ts</code> to regenerate.
          </div>
        </div>
      )}

      {data && (
        <AutopsyBoard
          key={runKey}
          data={data}
          stage={stage}
          showWedges={showWedges}
          activeQuoteLaneId={activeQuoteLaneId}
          onLaneClick={setActiveQuoteLaneId}
        />
      )}

      {showWedges && data && (
        <div className="autopsy__summary">
          <span className="autopsy__summary-label">Wedge identified</span>
          <span className="autopsy__summary-value">{data.wedge}</span>
          <span className="autopsy__summary-hint">
            Click any lane bar to see a real quote pulled from the brain.
          </span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Board: transcripts grid + lane bars + SVG lines overlay
// ─────────────────────────────────────────────────────────────

interface BoardProps {
  data: AutopsyData;
  stage: Stage;
  showWedges: boolean;
  activeQuoteLaneId: string | null;
  onLaneClick: (id: string | null) => void;
}

function AutopsyBoard({ data, stage, showWedges, activeQuoteLaneId, onLaneClick }: BoardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tileRefs = useRef<Array<HTMLDivElement | null>>([]);
  const laneRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [lines, setLines] = useState<Array<{ key: string; d: string; laneIdx: number }>>([]);

  const running = stage !== 'idle';
  const transcripts = data.transcripts;

  // Compute SVG paths from tile centers to lane left-edges once we've started
  useLayoutEffect(() => {
    if (!running) {
      setLines([]);
      return;
    }
    if (!containerRef.current) return;
    const cRect = containerRef.current.getBoundingClientRect();

    const computed: Array<{ key: string; d: string; laneIdx: number }> = [];
    data.lanes.forEach((lane, laneIdx) => {
      const laneEl = laneRefs.current[lane.id];
      if (!laneEl) return;
      const laneRect = laneEl.getBoundingClientRect();
      const tx = laneRect.left - cRect.left;
      const ty = laneRect.top - cRect.top + laneRect.height / 2;

      lane.hitTranscriptIndices.forEach((tIdx) => {
        const tileEl = tileRefs.current[tIdx];
        if (!tileEl) return;
        const tRect = tileEl.getBoundingClientRect();
        const sx = tRect.right - cRect.left;
        const sy = tRect.top - cRect.top + tRect.height / 2;

        const midX = (sx + tx) / 2;
        const cx1 = midX + 40;
        const cx2 = midX - 20;
        const d = `M ${sx} ${sy} C ${cx1} ${sy}, ${cx2} ${ty}, ${tx} ${ty}`;
        computed.push({ key: `${lane.id}-${tIdx}`, d, laneIdx });
      });
    });
    setLines(computed);
  }, [running, data]);

  const visible = useStaggerReveal(running ? transcripts : EMPTY, STAGE1_STEP_MS);
  const visibleIds = new Set(visible.map((t) => t.id));

  return (
    <div ref={containerRef} className="autopsy__body autopsy__body--lines">
      <div className="autopsy__transcripts">
        <div className="autopsy__section-label">Prior transcripts · {TOTAL}</div>
        <div className="autopsy__grid">
          {transcripts.map((t, i) => {
            const isIn = visibleIds.has(t.id);
            return (
              <div
                key={t.id}
                ref={(el) => {
                  tileRefs.current[i] = el;
                }}
                className={`autopsy__tile ${isIn ? 'autopsy__tile--in' : ''}`}
              >
                <div className="autopsy__tile-title">{t.title}</div>
                <div className="autopsy__tile-date">{t.dateIso ?? '—'}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="autopsy__lanes-wrap">
        <div className="autopsy__section-label">Pattern frequency</div>
        <div className={`autopsy__lanes ${showWedges ? 'autopsy__lanes--wedged' : ''}`}>
          {data.lanes.map((lane, i) => (
            <LaneRow
              key={lane.id}
              ref={(el: HTMLDivElement | null) => {
                laneRefs.current[lane.id] = el;
              }}
              lane={lane}
              running={running}
              showWedge={showWedges}
              laneIdx={i}
              activeQuote={activeQuoteLaneId === lane.id ? lane.quotes[0] ?? null : null}
              onClick={() => onLaneClick(activeQuoteLaneId === lane.id ? null : lane.id)}
            />
          ))}
        </div>
      </div>

      {running && lines.length > 0 && (
        <svg className="autopsy__lines" aria-hidden="true">
          {lines.map((line) => (
            <path
              key={line.key}
              d={line.d}
              className={`autopsy__line autopsy__line--lane-${line.laneIdx}`}
              style={{
                animationDelay: `${1200 + line.laneIdx * 100 + ((line.key.charCodeAt(0) * 7) % 220)}ms`,
                animationDuration: `${LINE_FLIGHT_MS}ms`,
              }}
            />
          ))}
        </svg>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LaneRow: animated bar + count + wedge stamp + quote popover
// ─────────────────────────────────────────────────────────────

interface LaneRowProps {
  lane: EnrichedLane;
  running: boolean;
  showWedge: boolean;
  laneIdx: number;
  activeQuote: string | null;
  onClick: () => void;
}

const LaneRow = forwardRef<HTMLDivElement, LaneRowProps>(function LaneRow(
  { lane, running, showWedge, laneIdx, activeQuote, onClick },
  ref,
) {
  const target = running ? lane.count : 0;
  const count = useCountUp(target, STAGE2_FILL_MS);
  const fillPct = Math.max(0, Math.min(100, (count / TOTAL) * 100));
  const thresholdPct = (lane.threshold / TOTAL) * 100;
  const isWedge = lane.count >= lane.threshold;

  const laneStyle = { '--lane-idx': laneIdx } as CSSProperties;

  return (
    <div
      ref={ref}
      className={`autopsy__lane ${isWedge ? 'autopsy__lane--wedge' : ''} ${
        activeQuote ? 'autopsy__lane--active' : ''
      }`}
      onClick={onClick}
      style={laneStyle}
    >
      <div className="autopsy__lane-header">
        <span className="autopsy__lane-label">{SHORT_LABELS[lane.id] ?? lane.label}</span>
        <span className="autopsy__lane-count">
          {count}/{TOTAL}
        </span>
      </div>
      <div className="autopsy__lane-bar">
        <div
          className="autopsy__lane-fill"
          style={{
            width: `${fillPct}%`,
            transitionDelay: running ? `${laneIdx * STAGE2_LANE_DELAY_MS}ms` : '0ms',
          }}
        />
        <div
          className="autopsy__lane-threshold"
          style={{ left: `${thresholdPct}%` }}
          aria-hidden="true"
        />
        {isWedge && showWedge && <span className="autopsy__wedge">WEDGE</span>}
      </div>
      {activeQuote && (
        <div className="autopsy__quote">
          <span className="autopsy__quote-eyebrow">From the brain — real call snippet</span>
          <span className="autopsy__quote-text">"{truncate(activeQuote, 220)}"</span>
        </div>
      )}
    </div>
  );
});

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n).replace(/\s+\S*$/, '') + '…';
}
