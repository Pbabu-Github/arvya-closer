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
      // STEP 1 — strip stopwords so verbose questions tokenize into the
      // keyword index. gbrain's search is FTS-based; "What are X in Y calls?"
      // returns 0 hits but "X Y" returns real chunks.
      const searchTerms = stripStopwords(finalQ);
      const s = (await window.pmf.gbrain.search(searchTerms)) as { ok: boolean; result?: unknown; error?: string };
      if (!s.ok) {
        setError(s.error ?? 'gbrain search failed');
        return;
      }

      const hits = parseSearchHits(s.result, 6);

      if (hits.length === 0) {
        // Try query as fallback (keyword-style)
        try {
          const q2 = (await window.pmf.gbrain.query(finalQ)) as { ok: boolean; result?: unknown };
          const fallback = parseSearchHits(q2.result, 6);
          if (fallback.length > 0) {
            setCitations(fallback);
            setAnswer(synthesizeFallback(finalQ, fallback));
            return;
          }
        } catch {
          /* ignore */
        }
        setError('No relevant content found in the brain for this question. Try keyword-style ("DealCloud", "buyer tracker") or a more specific question.');
        return;
      }

      // STEP 2 — render citations immediately so user sees brain hits
      setCitations(hits);

      // STEP 3 — synthesize a grounded prose answer via Anthropic Sonnet 4.6,
      // grounding it in the retrieved chunks. This is proper RAG.
      const context = hits
        .map(
          (h, i) =>
            `[Source ${i + 1}] ${h.title ?? h.slug}\n${(h.chunk_text ?? '').slice(0, 600)}`,
        )
        .join('\n\n---\n\n');

      const system =
        'You are answering questions about Arvya (an AI execution platform for PE/IB deal teams, built into Outlook) using ONLY the provided source excerpts. ' +
        'Be specific. Cite sources inline as [Source N]. If the sources do not contain the answer, say so plainly. ' +
        'Max 4 short paragraphs. Lead with the most concrete fact.';

      const user = `Sources from our brain:\n\n${context}\n\n---\n\nQuestion: ${finalQ}`;

      const a = (await window.pmf.anthropic.chat(system, user)) as { ok: boolean; text?: string; error?: string };
      if (a.ok && a.text) {
        setAnswer(a.text);
      } else {
        setAnswer(synthesizeFallback(finalQ, hits));
        if (a.error) console.warn('[ask-brain] anthropic failed, showed fallback:', a.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // If Anthropic is unreachable, build a non-LLM "answer" from the chunks so
  // the user still gets value.
  function synthesizeFallback(q: string, hits: Citation[]): string {
    return `${hits.length} sources from our brain match "${q}". See citations below.`;
  }

  // Strip filler/question words so verbose questions tokenize cleanly for FTS.
  // "What are Arvya buyer objections in PE/IB calls?" → "arvya buyer objections pe ib"
  function stripStopwords(input: string): string {
    const stopwords = new Set([
      'a','an','the','is','are','was','were','be','been','being',
      'what','why','when','where','who','whom','whose','how','which',
      'do','does','did','can','could','should','would','may','might','must','will','shall',
      'in','on','at','to','from','for','of','with','by','about','as','into','onto','over','under',
      'our','your','their','its','his','her',
      'me','you','we','they','them','i','us',
      'tell','give','show','find','list','please',
      'calls','call',
      'and','or','but','if','then','than',
      'this','that','these','those','some','any','all','no','not',
    ]);
    const cleaned = input
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // split on slash, hyphen, punctuation — gbrain FTS treats them as token boundaries
      .split(/\s+/)
      .filter((w) => w && !stopwords.has(w));
    // Return at least 1 token even if all were stopwords
    return (cleaned.length > 0 ? cleaned : input.toLowerCase().split(/\s+/)).join(' ');
  }

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
