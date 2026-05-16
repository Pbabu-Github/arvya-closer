/**
 * AskBrainPanel — type any question, hit ⌘↩, see a grounded answer pulled from
 * the 181 pages of Arvya content seeded in gbrain (calls, decks, security docs,
 * customer notes, internal Naveen+PB thinking).
 *
 * Uses window.pmf.gbrain.query() which returns natural-language Q&A with
 * citations. Falls back to window.pmf.gbrain.search() display if query doesn't
 * return a clean prose answer.
 */

import { useState } from 'react';
// window.pmf types live in src/renderer/pmf-api.d.ts

type Citation = {
  slug: string;
  title?: string;
  chunk_text?: string;
  score?: number;
};

const SUGGESTED_QUESTIONS = [
  "What are Arvya's biggest buyer objections from past calls?",
  "What's the wedge for PE/IB deal teams?",
  "What did FT Partners care about most?",
  "How does Arvya handle DealCloud integration?",
  "What's Arvya's security posture (all-in-tenant Azure)?",
  "Who is Naveen Siva and what's his founder story?",
  "What's the buyer-tracker pain in Excel?",
];

export function AskBrainPanel() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [askedQuestion, setAskedQuestion] = useState<string | null>(null);

  const onAsk = async (q?: string) => {
    const finalQ = (q ?? question).trim();
    if (!finalQ) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    setCitations([]);
    setAskedQuestion(finalQ);

    try {
      // Try the grounded `query` op first
      const r = (await window.pmf.gbrain.query(finalQ)) as { ok: boolean; result?: unknown; error?: string };
      if (!r.ok) {
        setError(r.error ?? 'gbrain query failed');
        return;
      }

      const parsed = parseQueryResult(r.result);
      if (parsed.answer) {
        setAnswer(parsed.answer);
        setCitations(parsed.citations);
        return;
      }

      // Fallback: if query didn't return a grounded answer, do a raw search
      const s = (await window.pmf.gbrain.search(finalQ)) as { ok: boolean; result?: unknown; error?: string };
      if (s.ok) {
        const hits = parseSearchHits(s.result, 5);
        if (hits.length > 0) {
          setAnswer(`Found ${hits.length} relevant snippets across the brain. See citations below.`);
          setCitations(hits);
          return;
        }
      }

      setError('No grounded answer found. Try a more specific question.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !loading) {
      e.preventDefault();
      onAsk();
    }
  };

  return (
    <div className="card card--hero">
      <div className="outreach__head">
        <span className="outreach__eyebrow">Ask the Brain</span>
        <span className="outreach__meta">181 pages · GBrain · live</span>
      </div>

      <div>
        <h2 className="outreach__title">What do we know?</h2>
        <div className="outreach__subtitle">
          Ask anything — Arvya truth, customer calls, security, founder notes.
        </div>
      </div>

      <div className="outreach__row">
        <input
          type="text"
          className="outreach__input"
          placeholder="What are our biggest buyer objections?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={onKey}
        />
        <button onClick={() => onAsk()} disabled={loading || !question.trim()} className="btn btn--primary">
          {loading ? 'Asking…' : 'Ask'}
        </button>
      </div>

      {!askedQuestion && (
        <div className="ask-brain__suggestions">
          <div className="outreach__section-label">Try one of these</div>
          <div className="ask-brain__chips">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button key={q} className="ask-brain__chip" onClick={() => { setQuestion(q); onAsk(q); }}>
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <div className="outreach__error">⚠ {error}</div>}

      {askedQuestion && answer && (
        <div className="ask-brain__answer">
          <div className="outreach__section-label">Brain says</div>
          <div className="ask-brain__answer-text">{answer}</div>

          {citations.length > 0 && (
            <>
              <div className="outreach__section-label" style={{ marginTop: 12 }}>
                Citations · {citations.length} from your brain
              </div>
              <ul className="ask-brain__citations">
                {citations.map((c, i) => (
                  <li key={`${c.slug}-${i}`} className="ask-brain__cite">
                    <div className="ask-brain__cite-head">
                      <span className="ask-brain__cite-title">{c.title ?? c.slug}</span>
                      {typeof c.score === 'number' && (
                        <span className="ask-brain__cite-score">score {c.score.toFixed(2)}</span>
                      )}
                    </div>
                    {c.chunk_text && (
                      <div className="ask-brain__cite-text">"{trim(c.chunk_text, 280)}"</div>
                    )}
                    <div className="ask-brain__cite-slug">{c.slug}</div>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="outreach__draft-actions">
            <button
              className="btn btn--sm"
              onClick={() => {
                if (answer) navigator.clipboard?.writeText(answer);
              }}
            >
              Copy answer
            </button>
            <button className="btn btn--sm" onClick={() => onAsk()}>
              Re-ask
            </button>
            <button
              className="btn btn--sm btn--ghost"
              onClick={() => {
                setAskedQuestion(null);
                setAnswer(null);
                setCitations([]);
                setQuestion('');
              }}
            >
              New question
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- helpers ----------

function trim(s: string, max: number): string {
  const cleaned = s.replace(/\s+/g, ' ').trim();
  return cleaned.length > max ? cleaned.slice(0, max - 1) + '…' : cleaned;
}

function unwrapMcpText(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if ('content' in r && Array.isArray(r.content)) {
    const first = (r.content as Array<{ type?: string; text?: string }>)[0];
    if (first && typeof first.text === 'string') return first.text;
  }
  return null;
}

type ParsedQuery = {
  answer: string | null;
  citations: Citation[];
};

function parseQueryResult(raw: unknown): ParsedQuery {
  const text = unwrapMcpText(raw);
  if (!text) return { answer: null, citations: [] };

  // Sometimes `query` returns a JSON object with {answer, citations}
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.answer === 'string') {
        const citations = Array.isArray(parsed.citations)
          ? (parsed.citations as Array<Record<string, unknown>>).map((c) => ({
              slug: String(c.slug ?? c.page_slug ?? ''),
              title: typeof c.title === 'string' ? c.title : undefined,
              chunk_text: typeof c.chunk_text === 'string' ? c.chunk_text : undefined,
              score: typeof c.score === 'number' ? c.score : undefined,
            }))
          : [];
        return { answer: parsed.answer, citations };
      }
      // Some gbrain shapes return a raw array — treat as search hits
      if (Array.isArray(parsed)) {
        return {
          answer: `Brain returned ${parsed.length} relevant chunks (no synthesized answer).`,
          citations: parsed.slice(0, 5).map((c: Record<string, unknown>) => ({
            slug: String(c.slug ?? ''),
            title: typeof c.title === 'string' ? c.title : undefined,
            chunk_text: typeof c.chunk_text === 'string' ? c.chunk_text : undefined,
            score: typeof c.score === 'number' ? c.score : undefined,
          })),
        };
      }
    }
  } catch {
    // Not JSON — treat as plain prose answer
  }

  return { answer: text, citations: [] };
}

function parseSearchHits(raw: unknown, max: number): Citation[] {
  const text = unwrapMcpText(raw);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, max).map((c: Record<string, unknown>) => ({
        slug: String(c.slug ?? ''),
        title: typeof c.title === 'string' ? c.title : undefined,
        chunk_text: typeof c.chunk_text === 'string' ? c.chunk_text : undefined,
        score: typeof c.score === 'number' ? c.score : undefined,
      }));
    }
  } catch {
    // ignore
  }
  return [];
}
