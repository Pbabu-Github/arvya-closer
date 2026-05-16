/**
 * FindEventsPanel — search for industry events / conferences where Arvya can demo.
 * Uses HOG /deep-research with a JSON schema → renders an event list with date/location/why.
 *
 * Reads `arvya wedge` (PE/IB deal teams + DealCloud + buyer-tracker pain) by default but
 * the user can edit the search criteria.
 */

import { useState } from 'react';
// window.pmf types live in src/renderer/pmf-api.d.ts

type Event = {
  name: string;
  date?: string;
  location?: string;
  url?: string;
  audience?: string;
  why_relevant?: string;
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

export function FindEventsPanel() {
  const [criteria, setCriteria] = useState(DEFAULT_CRITERIA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<Event[]>([]);

  const onSearch = async () => {
    if (!criteria.trim()) return;
    setLoading(true);
    setError(null);
    setEvents([]);
    try {
      const r = (await window.pmf.hog.deepResearch({
        prompt: `Find real, upcoming events that match this criteria. Return ONLY events with a verifiable date or URL. Criteria:\n\n${criteria}`,
        schema: EVENT_SCHEMA,
      })) as { ok: boolean; result?: unknown; error?: string };

      if (!r.ok) {
        setError(r.error ?? 'unknown HOG error');
        return;
      }

      const result = (r.result as { result?: unknown })?.result ?? r.result;
      const parsed = parseEvents(result);
      if (parsed.length === 0) {
        setError('No events returned. HOG may need broader criteria or more time.');
      } else {
        setEvents(parsed);
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
        <div className="hero__eyebrow">Find events · HOG deep-research</div>
        <h1 className="hero__title">Where should we demo next?</h1>
        <div className="hero__subtitle">
          Edit the criteria, hit search. HOG runs deep-research against the web.
        </div>
      </div>

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

        <div>
          <button onClick={onSearch} disabled={loading} className="btn btn--primary">
            {loading ? 'Researching… (30-60 sec)' : 'Find events via HOG'}
          </button>
        </div>

        {error && <div className="outreach__error">⚠ {error}</div>}
      </div>

      {events.length > 0 && (
        <div className="events__list">
          <div className="section-header">
            <div>
              <div className="section-header__eyebrow">Results</div>
              <h2 className="section-header__title">{events.length} events found</h2>
            </div>
          </div>

          {events.map((ev, i) => (
            <div key={i} className="card events__card">
              <div className="events__card-head">
                <h3 className="events__card-title">{ev.name}</h3>
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
