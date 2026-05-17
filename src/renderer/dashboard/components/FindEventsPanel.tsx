/**
 * FindEventsPanel — search for industry events / conferences where Arvya can demo.
 * Uses HOG /deep-research with a JSON schema → renders an event list with date/location/why.
 *
 * Reads `arvya wedge` (PE/IB deal teams + DealCloud + buyer-tracker pain) by default but
 * the user can edit the search criteria.
 */

import { useEffect, useRef, useState } from 'react';
import {
  loadIcpContext,
  painContextBlock,
  type IcpContext,
} from '../../icp-context';
import { ProvenancePill, rerankEvents } from './find-helpers';
// window.pmf types live in src/renderer/pmf-api.d.ts

type Event = {
  name: string;
  date?: string;
  location?: string;
  url?: string;
  audience?: string;
  why_relevant?: string;
  __score?: number;
};

const DEFAULT_CRITERIA = `PE / IB / M&A conferences and meetups in North America, next 90 days, that bring together deal-team analysts, associates, VPs, and CRM/RevOps decision-makers at investment banks and PE firms. Prioritize events where Arvya's pitch lands: Outlook-native, schema-driven CRM (incl. DealCloud), buyer-tracker automation, Deal Brain memory.`;

const EVENT_SCHEMA = {
  type: 'object',
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD or month/year' },
          location: { type: 'string', description: 'City, State or virtual' },
          url: { type: 'string' },
          audience: { type: 'string', description: '1-line description of who attends' },
          why_relevant: { type: 'string', description: '1-sentence why Arvya should be there' },
        },
        required: ['name', 'why_relevant'],
      },
    },
  },
  required: ['events'],
} as const;

// Module-level cache: survives tab-switches so the user doesn't lose their
// search when they move between sidebar views.
type FindEventsCache = {
  criteria: string;
  events: Event[];
  error: string | null;
};
let SESSION_CACHE: FindEventsCache | null = null;

export function FindEventsPanel() {
  const [criteria, setCriteria] = useState(
    () => SESSION_CACHE?.criteria ?? DEFAULT_CRITERIA,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    () => SESSION_CACHE?.error ?? null,
  );
  const [events, setEvents] = useState<Event[]>(() => SESSION_CACHE?.events ?? []);
  const [criteriaCollapsed, setCriteriaCollapsed] = useState(
    () => (SESSION_CACHE?.events.length ?? 0) > 0,
  );
  const [icp, setIcp] = useState<IcpContext | null>(null);
  const [icpLoading, setIcpLoading] = useState(true);
  const [reranked, setReranked] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const genRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Elapsed-time counter while HOG is running
  useEffect(() => {
    if (!loading) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    setElapsed(0);
    const started = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loading]);

  useEffect(() => {
    SESSION_CACHE = { criteria, events, error };
  }, [criteria, events, error]);

  useEffect(() => {
    if (!loading && events.length > 0) setCriteriaCollapsed(true);
  }, [loading, events.length]);

  // Pull ICP context on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIcpLoading(true);
      const ctx = await loadIcpContext();
      if (!cancelled) {
        setIcp(ctx);
        setIcpLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSearch = async () => {
    if (!criteria.trim() || loading) return;
    const myGen = ++genRef.current;
    setLoading(true);
    setError(null);
    setEvents([]);
    setReranked(false);

    // ICP context refresh runs in parallel — don't block HOG on the ICP round
    // trip (was costing 1-2s of nothing-on-screen before HOG even fired).
    const ctxPromise = loadIcpContext().then((ctx) => {
      if (myGen === genRef.current) setIcp(ctx);
      return ctx;
    });

    try {
      const ctx = await ctxPromise;
      if (myGen !== genRef.current) return;

      const prompt = [
        painContextBlock(ctx),
        'Find real, upcoming events that match this criteria. Return ONLY events with a verifiable date or URL.',
        '',
        'Criteria:',
        criteria,
      ]
        .filter(Boolean)
        .join('\n');

      const r = (await window.pmf.hog.deepResearch({ prompt, schema: EVENT_SCHEMA })) as {
        ok: boolean;
        result?: unknown;
        error?: string;
      };

      if (myGen !== genRef.current) return; // user hit Stop
      if (!r.ok) {
        setError(r.error ?? 'unknown HOG error');
        return;
      }

      const result = (r.result as { result?: unknown })?.result ?? r.result;
      let parsed = parseEvents(result);
      if (parsed.length === 0) {
        setError('No events returned. HOG may need broader criteria or more time.');
        return;
      }

      // ZE rerank against the brain's pain query.
      if (ctx.online && ctx.painQuery && parsed.length > 1) {
        const ranked = await rerankEvents(ctx.painQuery, parsed);
        if (myGen !== genRef.current) return;
        if (ranked) {
          parsed = ranked;
          setReranked(true);
        }
      }

      setEvents(parsed);
    } catch (e) {
      if (myGen !== genRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (myGen === genRef.current) setLoading(false);
    }
  };

  const onStop = () => {
    genRef.current++;
    setLoading(false);
  };

  return (
    <>
      <div>
        <div className="hero__eyebrow">Find events · HOG + ZeroEntropy · grounded in gbrain</div>
        <h1 className="hero__title">Where should we demo next?</h1>
        <div className="hero__subtitle">
          The brain reads buyer pains from prior demos → HOG searches the web → ZeroEntropy
          ranks events against actual buyer language.
        </div>
      </div>

      <ProvenancePill ctx={icp} loading={icpLoading} />

      {criteriaCollapsed && !loading ? (
        <div className="findp__criteria-summary">
          <div className="findp__criteria-summary-text">
            <span className="findp__criteria-summary-label">Last search</span>
            <span className="findp__criteria-summary-quote">
              "{criteria.length > 140 ? `${criteria.slice(0, 140)}…` : criteria}"
            </span>
          </div>
          <button
            onClick={() => setCriteriaCollapsed(false)}
            className="btn btn--sm btn--ghost"
          >
            Edit search
          </button>
        </div>
      ) : (
        <div className="card card--hero">
          <div className="outreach__head">
            <span className="outreach__eyebrow">Search criteria</span>
            <span className="outreach__meta">HOG · DEEP RESEARCH</span>
          </div>

          <textarea
            className="outreach__input events__criteria"
            rows={5}
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            placeholder="What kind of event are we looking for?"
          />

          <div className="findp__actions">
            {!loading ? (
              <>
                <button onClick={onSearch} disabled={!criteria.trim()} className="btn btn--primary">
                  Find events via HOG
                </button>
                {events.length > 0 && (
                  <button
                    onClick={() => setCriteriaCollapsed(true)}
                    className="btn btn--sm btn--ghost"
                  >
                    Cancel
                  </button>
                )}
              </>
            ) : (
              <>
                <button onClick={onStop} className="btn btn--ghost">
                  Stop & keep results ({events.length})
                </button>
                <span className="findp__elapsed">⏱ {elapsed}s · HOG runs 30–90s, caps at 120s</span>
              </>
            )}
          </div>

          {loading && (
            <div className="findp__live">
              <span className="dot dot--accent dot--pulse" />
              <span className="findp__live-text">
                Sweeping HOG · {elapsed}s elapsed · {events.length} found so far
              </span>
            </div>
          )}

          {error && <div className="outreach__error">⚠ {error}</div>}
        </div>
      )}

      {loading && criteriaCollapsed && (
        <div className="findp__live">
          <span className="dot dot--accent dot--pulse" />
          <span className="findp__live-text">
            Sweeping HOG · {elapsed}s elapsed · {events.length} found so far
          </span>
        </div>
      )}

      {events.length > 0 && (
        <div className="events__list">
          <div className="section-header">
            <div>
              <div className="section-header__eyebrow">
                Results
                {reranked && <span className="findp__rerank-tag"> · ranked by ZeroEntropy</span>}
              </div>
              <h2 className="section-header__title">{events.length} events found</h2>
            </div>
          </div>

          {events.map((ev, i) => (
            <div key={i} className="card events__card">
              <div className="events__card-head">
                <h3 className="events__card-title">
                  {ev.name}
                  {typeof ev.__score === 'number' && (
                    <span className="findp__score">{ev.__score.toFixed(2)}</span>
                  )}
                </h3>
                {ev.url && (
                  <a href={ev.url} target="_blank" rel="noopener noreferrer" className="events__card-link">
                    open ↗
                  </a>
                )}
              </div>
              <div className="events__card-meta">
                {ev.date && <span className="events__card-pill">📅 {ev.date}</span>}
                {ev.location && <span className="events__card-pill">📍 {ev.location}</span>}
                {ev.audience && <span className="events__card-pill">👥 {ev.audience}</span>}
              </div>
              {ev.why_relevant && <p className="events__card-why">{ev.why_relevant}</p>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function parseEvents(raw: unknown): Event[] {
  if (!raw) return [];

  if (typeof raw === 'object' && 'events' in (raw as object)) {
    const e = (raw as { events: unknown }).events;
    if (Array.isArray(e)) return e as Event[];
  }

  if (typeof raw === 'string') {
    try {
      return parseEvents(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    for (const key of ['content', 'data', 'output', 'result']) {
      if (key in obj) {
        const nested = parseEvents(obj[key]);
        if (nested.length > 0) return nested;
      }
    }
  }

  return [];
}

// ProvenancePill + rerankEvents live in ./find-helpers (shared with FindPeoplePanel).
