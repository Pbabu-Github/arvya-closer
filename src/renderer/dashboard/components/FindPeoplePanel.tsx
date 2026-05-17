/**
 * FindPeoplePanel — kick off a HOG deep-research that returns BOTH people we
 * could reach out to AND events we could attend, plus a one-liner on what to
 * do at each. While HOG runs, we rotate through a set of "working" status
 * messages so the dashboard feels alive (HOG itself is not streaming).
 */

import { useEffect, useRef, useState } from 'react';

type Person = {
  name: string;
  title?: string;
  company?: string;
  linkedin_url?: string;
  why_relevant?: string;
  outreach_angle?: string;
};

type Event = {
  name: string;
  date?: string;
  location?: string;
  url?: string;
  audience?: string;
  what_to_say?: string;
};

type Result = { people: Person[]; events: Event[] };

const DEFAULT_CRITERIA = `Find investment-banking and PE deal-team leaders (VP / Director / Principal of M&A, Coverage, RevOps, Deal Operations) in North America who would benefit from Arvya — Outlook-native CRM + buyer-tracker automation built on DealCloud schemas. Also find PE/IB conferences and roundtables in the next 90 days where these folks gather. For each person: why they'd care + a one-line outreach angle. For each event: who attends + what we'd say if we walked the floor.`;

const SCHEMA = {
  type: 'object',
  properties: {
    people: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          title: { type: 'string' },
          company: { type: 'string' },
          linkedin_url: { type: 'string' },
          why_relevant: { type: 'string', description: 'Why this person fits Arvya wedge' },
          outreach_angle: { type: 'string', description: 'One-line DM angle, founder voice' },
        },
        required: ['name', 'why_relevant'],
      },
    },
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          date: { type: 'string' },
          location: { type: 'string' },
          url: { type: 'string' },
          audience: { type: 'string' },
          what_to_say: { type: 'string', description: 'Pitch one-liner for booth/floor conversation' },
        },
        required: ['name', 'what_to_say'],
      },
    },
  },
  required: ['people', 'events'],
} as const;

const LIVE_STEPS = [
  'Scanning LinkedIn for PE / IB deal leaders…',
  'Filtering for DealCloud + Outlook signal…',
  'Cross-checking ACG, SuperReturn, Bloomberg Deal events…',
  'Ranking by buyer-tracker / CRM-stale pain…',
  'Drafting outreach angles in founder voice…',
  'Almost there — finalizing list…',
];

export function FindPeoplePanel() {
  const [criteria, setCriteria] = useState(DEFAULT_CRITERIA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Rotate "live" status messages while HOG runs
  useEffect(() => {
    if (!loading) {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
      setStepIdx(0);
      return;
    }
    setStepIdx(0);
    stepTimerRef.current = setInterval(() => {
      setStepIdx((i) => Math.min(i + 1, LIVE_STEPS.length - 1));
    }, 7000);
    return () => {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    };
  }, [loading]);

  const onSearch = async () => {
    if (!criteria.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = (await window.pmf.hog.deepResearch({
        prompt: `Return ONLY real, named people and real events with verifiable URLs. Criteria:\n\n${criteria}`,
        schema: SCHEMA,
      })) as { ok: boolean; result?: unknown; error?: string };

      if (!r.ok) {
        setError(r.error ?? 'unknown HOG error');
        return;
      }

      const parsed = parseResult(r.result);
      if (!parsed || (parsed.people.length === 0 && parsed.events.length === 0)) {
        setError('No results returned. HOG may need a broader or more specific prompt.');
      } else {
        setResult(parsed);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div>
        <div className="hero__eyebrow">Find people · live HOG sweep</div>
        <h1 className="hero__title">Who should we be talking to?</h1>
        <div className="hero__subtitle">
          One sweep → people to DM, events to attend, and what to say in each room.
        </div>
      </div>

      <div className="card card--hero">
        <div className="outreach__head">
          <span className="outreach__eyebrow">Search criteria</span>
          <span className="outreach__meta">HOG · DEEP RESEARCH · COSTS CREDITS</span>
        </div>

        <textarea
          className="outreach__input events__criteria"
          rows={5}
          value={criteria}
          onChange={(e) => setCriteria(e.target.value)}
          placeholder="Who are we looking for? Be specific."
        />

        <div>
          <button onClick={onSearch} disabled={loading} className="btn btn--primary">
            {loading ? 'Sweeping… (30–90 sec)' : 'Find people & events via HOG'}
          </button>
        </div>

        {loading && (
          <div className="findp__live">
            <span className="dot dot--accent dot--pulse" />
            <span className="findp__live-text">{LIVE_STEPS[stepIdx]}</span>
          </div>
        )}

        {error && <div className="outreach__error">⚠ {error}</div>}
      </div>

      {result && (
        <>
          {result.people.length > 0 && (
            <section>
              <div className="section-header">
                <div>
                  <div className="section-header__eyebrow">People · reach out</div>
                  <h2 className="section-header__title">{result.people.length} prospects</h2>
                </div>
              </div>
              <div className="findp__list">
                {result.people.map((p, i) => (
                  <div key={i} className="card findp__card">
                    <div className="findp__card-head">
                      <div>
                        <h3 className="findp__card-title">{p.name}</h3>
                        <div className="findp__card-sub">
                          {[p.title, p.company].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      {p.linkedin_url && (
                        <a
                          href={p.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="events__card-link"
                        >
                          linkedin ↗
                        </a>
                      )}
                    </div>
                    {p.why_relevant && <p className="findp__why">{p.why_relevant}</p>}
                    {p.outreach_angle && (
                      <div className="findp__angle">
                        <span className="findp__angle-label">DM angle</span>
                        <span className="findp__angle-text">"{p.outreach_angle}"</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {result.events.length > 0 && (
            <section>
              <div className="section-header">
                <div>
                  <div className="section-header__eyebrow">Events · show up</div>
                  <h2 className="section-header__title">{result.events.length} events</h2>
                </div>
              </div>
              <div className="findp__list">
                {result.events.map((ev, i) => (
                  <div key={i} className="card findp__card">
                    <div className="findp__card-head">
                      <div>
                        <h3 className="findp__card-title">{ev.name}</h3>
                        <div className="findp__card-meta">
                          {ev.date && <span className="events__card-pill">📅 {ev.date}</span>}
                          {ev.location && <span className="events__card-pill">📍 {ev.location}</span>}
                          {ev.audience && <span className="events__card-pill">👥 {ev.audience}</span>}
                        </div>
                      </div>
                      {ev.url && (
                        <a href={ev.url} target="_blank" rel="noopener noreferrer" className="events__card-link">
                          open ↗
                        </a>
                      )}
                    </div>
                    {ev.what_to_say && (
                      <div className="findp__angle">
                        <span className="findp__angle-label">Walk-the-floor pitch</span>
                        <span className="findp__angle-text">"{ev.what_to_say}"</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}

function parseResult(raw: unknown): Result | null {
  const visit = (v: unknown): Result | null => {
    if (!v) return null;
    if (typeof v === 'string') {
      try {
        return visit(JSON.parse(v));
      } catch {
        return null;
      }
    }
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (Array.isArray(o.people) || Array.isArray(o.events)) {
        return {
          people: Array.isArray(o.people) ? (o.people as Person[]) : [],
          events: Array.isArray(o.events) ? (o.events as Event[]) : [],
        };
      }
      for (const k of ['result', 'data', 'output', 'content']) {
        if (k in o) {
          const nested = visit(o[k]);
          if (nested) return nested;
        }
      }
    }
    return null;
  };
  return visit(raw);
}
