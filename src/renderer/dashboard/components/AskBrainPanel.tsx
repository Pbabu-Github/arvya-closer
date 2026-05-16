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

/**
 * Tolerant deep unwrap. The IPC result might be:
 *   - already-parsed (string, array, object)  ← current gbrain-client.ts shape
 *   - raw MCP envelope { content: [{text}] }  ← old shape, just in case
 *   - nested { result: <above> }
 */
function unwrap(raw: unknown): unknown {
  let cur: unknown = raw;
  for (let i = 0; i < 4; i++) {
    if (!cur) return cur;
    // Raw MCP wrapper → unwrap to inner text (and try to JSON.parse it)
    if (typeof cur === 'object' && 'content' in (cur as object)) {
      const c = (cur as { content?: Array<{ text?: string }> }).content;
      if (Array.isArray(c) && typeof c[0]?.text === 'string') {
        try { cur = JSON.parse(c[0].text); } catch { cur = c[0].text; }
        continue;
      }
    }
    // structuredContent wrapper
    if (typeof cur === 'object' && 'structuredContent' in (cur as object)) {
      cur = (cur as { structuredContent: unknown }).structuredContent;
      continue;
    }
    // Generic { result: ... } wrapper
    if (typeof cur === 'object' && 'result' in (cur as object) && Object.keys(cur as object).length <= 3) {
      cur = (cur as { result: unknown }).result;
      continue;
    }
    return cur;
  }
  return cur;
}

function coerceCitations(raw: unknown, max: number): Citation[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, max).map((c: Record<string, unknown>) => ({
    slug: String(c.slug ?? ''),
    title: typeof c.title === 'string' ? c.title : undefined,
    chunk_text: typeof c.chunk_text === 'string' ? c.chunk_text : undefined,
    score: typeof c.score === 'number' ? c.score : undefined,
  }));
}

type ParsedQuery = {
  answer: string | null;
  citations: Citation[];
};

function parseQueryResult(raw: unknown): ParsedQuery {
  const v = unwrap(raw);
  if (!v) return { answer: null, citations: [] };

  // 1) Plain string → grounded prose answer
  if (typeof v === 'string') {
    return { answer: v, citations: [] };
  }

  // 2) Object with .answer / .text + optional .citations
  if (typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (typeof o.answer === 'string') {
      return { answer: o.answer, citations: coerceCitations(o.citations, 5) };
    }
    if (typeof o.text === 'string') {
      return { answer: o.text, citations: coerceCitations(o.citations, 5) };
    }
  }

  // 3) Array of search chunks
  if (Array.isArray(v)) {
    const cits = coerceCitations(v, 5);
    return {
      answer: cits.length > 0
        ? `Brain returned ${cits.length} relevant chunks. See citations below.`
        : null,
      citations: cits,
    };
  }

  // 4) Last resort — stringify
  return { answer: JSON.stringify(v).slice(0, 600), citations: [] };
}

function parseSearchHits(raw: unknown, max: number): Citation[] {
  const v = unwrap(raw);
  if (Array.isArray(v)) return coerceCitations(v, max);
  return [];
}
