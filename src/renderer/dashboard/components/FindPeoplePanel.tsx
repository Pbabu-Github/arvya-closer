/**
 * FindPeoplePanel — one sweep that hits gbrain (instant — people we've already
 * met / have transcripts on) and HOG deep-research (slower — outside-world
 * prospects). Brain results land in 1-3s. HOG fills in fresh names + events
 * over 30-90s. User can hit Stop anytime and keep whatever's on screen.
 */

import { useEffect, useRef, useState } from 'react';
import {
  loadIcpContext,
  painContextBlock,
  type IcpContext,
} from '../../../lib/icp-context';
import { ProvenancePill, rerankItems, eventToDoc } from './find-helpers';

type Person = {
  name: string;
  title?: string;
  company?: string;
  linkedin_url?: string;
  why_relevant?: string;
  outreach_angle?: string;
  source?: 'brain' | 'hog';
  slug?: string;
  __score?: number;
};

type Event = {
  name: string;
  date?: string;
  location?: string;
  url?: string;
  audience?: string;
  what_to_say?: string;
  __score?: number;
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

// Search terms aimed at the gbrain transcript corpus — pulls people we've
// actually talked to who match the wedge.
const BRAIN_SEED_QUERIES = [
  'investment banker',
  'private equity',
  'deal team',
  'M&A advisor',
  'DealCloud',
  'FT Partners',
];

// Module-level cache so results survive sidebar tab-switches (the component
// unmounts when the user leaves "Find people"). Only persists for the lifetime
// of the renderer process — that's the right scope for an in-progress sweep.
type FindPeopleCache = {
  criteria: string;
  people: Person[];
  events: Event[];
  error: string | null;
};
let SESSION_CACHE: FindPeopleCache | null = null;

export function FindPeoplePanel() {
  const [criteria, setCriteria] = useState(
    () => SESSION_CACHE?.criteria ?? DEFAULT_CRITERIA,
  );
  const [loading, setLoading] = useState(false);
  const [hogLoading, setHogLoading] = useState(false);
  const [brainLoading, setBrainLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    () => SESSION_CACHE?.error ?? null,
  );
  const [people, setPeople] = useState<Person[]>(
    () => SESSION_CACHE?.people ?? [],
  );
  const [events, setEvents] = useState<Event[]>(
    () => SESSION_CACHE?.events ?? [],
  );
  const [elapsed, setElapsed] = useState(0);
  // Auto-collapse the criteria card whenever there are results to show. User
  // can re-expand via the "Edit search" button in the results header.
  const [criteriaCollapsed, setCriteriaCollapsed] = useState(
    () =>
      (SESSION_CACHE?.people.length ?? 0) +
        (SESSION_CACHE?.events.length ?? 0) >
      0,
  );
  const [icp, setIcp] = useState<IcpContext | null>(null);
  const [icpLoading, setIcpLoading] = useState(true);
  const [reranked, setReranked] = useState<{ people: boolean; events: boolean }>({
    people: false,
    events: false,
  });
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveSlug, setSaveSlug] = useState<string | null>(null);

  const genRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const peopleRef = useRef<Person[]>([]);
  const eventsRef = useRef<Event[]>([]);

  // Keep refs in sync so async rerank can read the latest merged list
  // without racing the brain-vs-HOG lanes.
  useEffect(() => {
    peopleRef.current = people;
  }, [people]);
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  // Pull ICP context on mount so the provenance pill shows real numbers up front.
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

  // Elapsed-time counter while either lane is running
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

  // Mirror visible state into the module-level cache so a tab-switch keeps it.
  useEffect(() => {
    SESSION_CACHE = { criteria, people, events, error };
  }, [criteria, people, events, error]);

  // Auto-collapse the criteria card once a search settles with at least one
  // result — the prompt has done its job; get out of the user's way.
  useEffect(() => {
    if (!loading && people.length + events.length > 0) {
      setCriteriaCollapsed(true);
    }
  }, [loading, people.length, events.length]);

  const onSearch = async () => {
    if (!criteria.trim() || loading) return;
    const myGen = ++genRef.current;
    setLoading(true);
    setHogLoading(true);
    setBrainLoading(true);
    setError(null);
    setPeople([]);
    setEvents([]);
    peopleRef.current = [];
    eventsRef.current = [];
    setReranked({ people: false, events: false });
    setSaveState('idle');
    setSaveSlug(null);

    // Refresh ICP context — brain may have been seeded since mount.
    const ctx = await loadIcpContext();
    if (myGen !== genRef.current) return;
    setIcp(ctx);

    // ─── LANE 1: brain-first instant results (1-3s) ───
    (async () => {
      try {
        const brainPeople: Person[] = [];
        const seen = new Set<string>();
        for (const q of BRAIN_SEED_QUERIES) {
          if (myGen !== genRef.current) return;
          try {
            const r = (await window.pmf.gbrain.search(q)) as { ok: boolean; result?: unknown };
            if (!r.ok) continue;
            const hits = parseSearchHits(r.result);
            for (const h of hits) {
              if (!h.slug || seen.has(h.slug)) continue;
              if (!isPersonSlug(h.slug)) continue;
              seen.add(h.slug);
              brainPeople.push({
                name: h.title ?? humanizeSlug(h.slug),
                source: 'brain',
                slug: h.slug,
                why_relevant: (h.chunk_text ?? '').slice(0, 220),
              });
            }
          } catch {
            /* skip individual brain failures */
          }
        }
        if (myGen !== genRef.current) return;
        // Just merge — ZE rerank happens after HOG so all sources are scored together.
        const merged = mergePeople(peopleRef.current, brainPeople);
        peopleRef.current = merged;
        setPeople(merged);
      } finally {
        if (myGen === genRef.current) setBrainLoading(false);
      }
    })();

    // ─── LANE 2: HOG deep-research (slower, fresh outside-world prospects) ───
    // Inject pain context into the prompt so HOG itself is grounded in buyer language.
    (async () => {
      try {
        const promptHead = painContextBlock(ctx);
        const prompt = [
          promptHead,
          'Return ONLY real, named people and real events with verifiable URLs.',
          '',
          'Criteria:',
          criteria,
        ]
          .filter(Boolean)
          .join('\n');

        const r = (await window.pmf.hog.deepResearch({ prompt, schema: SCHEMA })) as {
          ok: boolean;
          result?: unknown;
          error?: string;
        };

        if (myGen !== genRef.current) return; // stale or stopped
        if (!r.ok) {
          // Don't blow up — brain may have results. Show error but keep brain.
          setError(`HOG: ${r.error ?? 'unknown error'}`);
          return;
        }
        const parsed = parseHogResult(r.result);
        if (!parsed) return;
        const hogPeople = parsed.people.map((p) => ({ ...p, source: 'hog' as const }));

        // Merge first (dedup by name+company), then ZE-rerank the combined list.
        const merged = mergePeople(peopleRef.current, hogPeople);
        peopleRef.current = merged;
        setPeople(merged);

        const mergedEvents = [...eventsRef.current, ...parsed.events];
        eventsRef.current = mergedEvents;
        setEvents(mergedEvents);

        // ZE rerank — people. Only fires if brain online AND we have a pain query.
        if (ctx.online && ctx.painQuery && merged.length > 1) {
          const ranked = await rerankItems(ctx.painQuery, merged, personToDoc);
          if (ranked && myGen === genRef.current) {
            peopleRef.current = ranked;
            setPeople(ranked);
            setReranked((r2) => ({ ...r2, people: true }));
          }
        }

        // ZE rerank — events.
        if (ctx.online && ctx.painQuery && mergedEvents.length > 1) {
          const ranked = await rerankItems(ctx.painQuery, mergedEvents, eventToDoc);
          if (ranked && myGen === genRef.current) {
            eventsRef.current = ranked;
            setEvents(ranked);
            setReranked((r2) => ({ ...r2, events: true }));
          }
        }
      } catch (e) {
        if (myGen !== genRef.current) return;
        setError(`HOG: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        if (myGen === genRef.current) {
          setHogLoading(false);
          setLoading(false);
        }
      }
    })();
  };

  const onSaveToBrain = async () => {
    if (saveState === 'saving' || (people.length === 0 && events.length === 0)) return;
    setSaveState('saving');
    const iso = new Date().toISOString().slice(0, 10);
    const tag = Math.random().toString(36).slice(2, 8);
    const slug = `gtm/sweeps/${iso}-people-events-${tag}`;
    const md = sweepMarkdown(criteria, icp, { people, events });
    try {
      const r = (await window.pmf.gbrain.putPage(slug, md)) as { ok: boolean; error?: string };
      if (r.ok) {
        setSaveState('saved');
        setSaveSlug(slug);
      } else {
        setSaveState('error');
        setError(`Save failed: ${r.error ?? 'unknown error'}`);
      }
    } catch (e) {
      setSaveState('error');
      setError(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const onStop = () => {
    genRef.current++; // any in-flight callbacks see a stale gen and bail
    setLoading(false);
    setHogLoading(false);
    setBrainLoading(false);
  };

  const totalFound = people.length + events.length;
  const status = hogLoading
    ? `Sweeping HOG · ${elapsed}s elapsed · ${totalFound} found so far`
    : brainLoading
      ? `Scanning brain · ${totalFound} found so far`
      : '';

  return (
    <>
      <div>
        <div className="hero__eyebrow">Find people · gbrain + HOG + ZeroEntropy</div>
        <h1 className="hero__title">Who should we be talking to?</h1>
        <div className="hero__subtitle">
          The brain reads our prior demos → HOG searches the web for matching people →
          ZeroEntropy ranks the combined result against real buyer language.
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
            <span className="outreach__meta">GBRAIN + HOG · DEEP RESEARCH</span>
          </div>

          <textarea
            className="outreach__input events__criteria"
            rows={5}
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            placeholder="Who are we looking for? Be specific."
          />

          <div className="findp__actions">
            {!loading ? (
              <>
                <button
                  onClick={onSearch}
                  disabled={!criteria.trim()}
                  className="btn btn--primary"
                >
                  Find people & events
                </button>
                {totalFound > 0 && (
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
                  Stop & keep results ({totalFound})
                </button>
                <span className="findp__elapsed">⏱ {elapsed}s · HOG runs 30–90s</span>
              </>
            )}
          </div>

          {loading && (
            <div className="findp__live">
              <span className="dot dot--accent dot--pulse" />
              <span className="findp__live-text">{status}</span>
            </div>
          )}

          {error && <div className="outreach__error">⚠ {error}</div>}
        </div>
      )}

      {loading && criteriaCollapsed && (
        <div className="findp__live">
          <span className="dot dot--accent dot--pulse" />
          <span className="findp__live-text">{status}</span>
        </div>
      )}

      {people.length > 0 && (
        <section>
          <div className="section-header">
            <div>
              <div className="section-header__eyebrow">
                People · reach out
                {reranked.people && (
                  <span className="findp__rerank-tag"> · ranked by ZeroEntropy</span>
                )}
              </div>
              <h2 className="section-header__title">
                {people.length} prospects
                {brainLoading || hogLoading ? <span className="findp__loading-tag"> · still searching…</span> : null}
              </h2>
            </div>
            {!loading && (people.length > 0 || events.length > 0) && (
              <button
                onClick={onSaveToBrain}
                disabled={saveState === 'saving' || saveState === 'saved'}
                className="btn btn--ghost"
                title={saveSlug ?? 'Write this sweep to gbrain as gtm/sweeps/...'}
              >
                {saveState === 'saved'
                  ? `Saved → brain`
                  : saveState === 'saving'
                    ? 'Saving…'
                    : 'Save sweep to brain'}
              </button>
            )}
          </div>
          <div className="findp__list">
            {people.map((p, i) => (
              <div key={`${p.source}-${p.name}-${i}`} className="card findp__card">
                <div className="findp__card-head">
                  <div>
                    <h3 className="findp__card-title">
                      {p.name}
                      {p.source === 'brain' && (
                        <span className="findp__source-tag">from brain</span>
                      )}
                      {typeof p.__score === 'number' && (
                        <span className="findp__score">{p.__score.toFixed(2)}</span>
                      )}
                    </h3>
                    <div className="findp__card-sub">
                      {[p.title, p.company].filter(Boolean).join(' · ') || (p.slug ?? '')}
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

      {events.length > 0 && (
        <section>
          <div className="section-header">
            <div>
              <div className="section-header__eyebrow">
                Events · show up
                {reranked.events && (
                  <span className="findp__rerank-tag"> · ranked by ZeroEntropy</span>
                )}
              </div>
              <h2 className="section-header__title">{events.length} events</h2>
            </div>
          </div>
          <div className="findp__list">
            {events.map((ev, i) => (
              <div key={i} className="card findp__card">
                <div className="findp__card-head">
                  <div>
                    <h3 className="findp__card-title">
                      {ev.name}
                      {typeof ev.__score === 'number' && (
                        <span className="findp__score">{ev.__score.toFixed(2)}</span>
                      )}
                    </h3>
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
  );
}

// ---------- helpers ----------

type SearchHit = { slug?: string; title?: string; chunk_text?: string; score?: number };

function parseSearchHits(raw: unknown): SearchHit[] {
  // Tolerate already-parsed array, MCP envelope, or { result: ... } wrap
  let v: unknown = raw;
  for (let i = 0; i < 4; i++) {
    if (!v) break;
    if (typeof v === 'object' && 'content' in (v as object)) {
      const c = (v as { content?: Array<{ text?: string }> }).content;
      if (Array.isArray(c) && typeof c[0]?.text === 'string') {
        try { v = JSON.parse(c[0].text); } catch { v = c[0].text; }
        continue;
      }
    }
    if (typeof v === 'object' && 'result' in (v as object) && Object.keys(v as object).length <= 3) {
      v = (v as { result: unknown }).result;
      continue;
    }
    break;
  }
  if (!Array.isArray(v)) return [];
  return v as SearchHit[];
}

// Slug heuristic — gbrain person pages live under `wiki/people/`, `people/`, or
// embed an attendee name. We want the high-precision case first.
function isPersonSlug(slug: string): boolean {
  return /^(wiki\/)?people\//i.test(slug) || /^people-/i.test(slug);
}

function humanizeSlug(slug: string): string {
  const tail = slug.split('/').pop() ?? slug;
  return tail.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function mergePeople(prev: Person[], add: Person[]): Person[] {
  const out = [...prev];
  const seen = new Set(prev.map((p) => norm(p.name) + '::' + (p.company ?? '')));
  for (const p of add) {
    const k = norm(p.name) + '::' + (p.company ?? '');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseHogResult(raw: unknown): Result | null {
  const visit = (v: unknown): Result | null => {
    if (!v) return null;
    if (typeof v === 'string') {
      try { return visit(JSON.parse(v)); } catch { return null; }
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

// ---------- panel-local helpers (ProvenancePill + rerankItems live in find-helpers) ----------

function personToDoc(p: Person): string {
  return [p.name, p.title, p.company, p.why_relevant, p.outreach_angle]
    .filter(Boolean)
    .join(' · ');
}

function sweepMarkdown(
  criteria: string,
  ctx: IcpContext | null,
  result: { people: Person[]; events: Event[] },
): string {
  const iso = new Date().toISOString();
  const lines: string[] = [];
  lines.push(`# ICP Sweep — ${iso.slice(0, 10)}`);
  lines.push('');
  lines.push('## Provenance');
  if (ctx?.online) {
    lines.push(`- Grounded in **${ctx.painChunkCount}** gbrain chunks`);
    lines.push(`- **${ctx.entityCount}** known names/companies available for dedup`);
  } else {
    lines.push('- Brain was offline — HOG ran ungrounded');
  }
  lines.push('');
  lines.push('## Criteria');
  lines.push(criteria);
  lines.push('');
  if (result.people.length > 0) {
    lines.push(`## People (${result.people.length})`);
    for (const p of result.people) {
      lines.push(
        `- **${p.name}**${p.title ? ` — ${p.title}` : ''}${p.company ? ` @ ${p.company}` : ''}`,
      );
      if (p.linkedin_url) lines.push(`  - LinkedIn: ${p.linkedin_url}`);
      if (p.source === 'brain') lines.push(`  - Source: brain (${p.slug ?? ''})`);
      if (p.why_relevant) lines.push(`  - Why: ${p.why_relevant}`);
      if (p.outreach_angle) lines.push(`  - DM angle: ${p.outreach_angle}`);
      if (typeof p.__score === 'number') lines.push(`  - ZE score: ${p.__score.toFixed(3)}`);
    }
    lines.push('');
  }
  if (result.events.length > 0) {
    lines.push(`## Events (${result.events.length})`);
    for (const ev of result.events) {
      lines.push(
        `- **${ev.name}**${ev.date ? ` — ${ev.date}` : ''}${ev.location ? ` (${ev.location})` : ''}`,
      );
      if (ev.url) lines.push(`  - URL: ${ev.url}`);
      if (ev.audience) lines.push(`  - Audience: ${ev.audience}`);
      if (ev.what_to_say) lines.push(`  - Pitch: ${ev.what_to_say}`);
      if (typeof ev.__score === 'number') lines.push(`  - ZE score: ${ev.__score.toFixed(3)}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
