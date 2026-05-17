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
  const [stage, setStage] = useState<'idle' | 'searching' | 'synthesizing' | 'done'>('idle');

  // Streaming/typing effect for ChatGPT-feel
  const streamAnswer = (full: string) => {
    setAnswer('');
    let i = 0;
    const tick = () => {
      if (i >= full.length) return;
      // Reveal ~2-3 chars per frame for that satisfying typewriter feel
      const step = Math.max(2, Math.min(6, Math.floor(full.length / 250)));
      i = Math.min(full.length, i + step);
      setAnswer(full.slice(0, i));
      if (i < full.length) setTimeout(tick, 14);
    };
    tick();
  };

  const onAsk = async (q?: string) => {
    const finalQ = (q ?? question).trim();
    if (!finalQ) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    setCitations([]);
    setAskedQuestion(finalQ);
    setStage('searching');

    try {
      // STEP 1 — MULTI-QUERY SEARCH. gbrain FTS is AND-semantic ("ft partners
      // care most" requires all 4 words in same chunk), so we run 3 separate
      // searches and merge:
      //   a) full stripped query
      //   b) just named entities (capitalized terms from original question)
      //   c) the 2 most "content-y" tokens
      const cleaned = stripStopwords(finalQ);
      const named = extractNamedEntities(finalQ);
      const top2 = cleaned.split(' ').slice(0, 2).join(' ');

      const queries = Array.from(
        new Set([cleaned, named, top2, finalQ].filter((s) => s && s.length > 1)),
      );

      const allHits: Citation[] = [];
      for (const q of queries) {
        try {
          const r = (await window.pmf.gbrain.search(q)) as { ok: boolean; result?: unknown };
          if (r.ok) {
            const partial = parseSearchHits(r.result, 8);
            for (const h of partial) allHits.push(h);
          }
        } catch {
          /* skip individual search failures */
        }
      }

      // Dedupe by slug+chunk_text, keep highest score per slug
      const dedupedMap = new Map<string, Citation>();
      for (const h of allHits) {
        const key = `${h.slug}::${(h.chunk_text ?? '').slice(0, 80)}`;
        const existing = dedupedMap.get(key);
        if (!existing || (h.score ?? 0) > (existing.score ?? 0)) {
          dedupedMap.set(key, h);
        }
      }
      const hits = Array.from(dedupedMap.values())
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 8);

      if (hits.length === 0) {
        setError(
          'No content found. Try keyword-style ("DealCloud", "buyer tracker") or a specific name ("FT Partners", "Naveen Siva").',
        );
        return;
      }

      // STEP 2 — render citations immediately
      setCitations(hits);
      setStage('synthesizing');

      // STEP 3 — synthesize with Anthropic Sonnet 4.6, grounded in chunks
      const context = hits
        .map((h, i) => `[Source ${i + 1}] ${h.title ?? h.slug}\n${(h.chunk_text ?? '').slice(0, 700)}`)
        .join('\n\n---\n\n');

      const system =
        'You answer questions about Arvya (an AI execution platform for PE/IB deal teams, built into Outlook) using ONLY the provided source excerpts. ' +
        'Be specific and direct. Cite sources inline as [Source N]. If the sources contain partial info, surface the partial info — do NOT refuse with "no info available" unless the sources are genuinely empty. ' +
        'Max 4 short paragraphs. Lead with the most concrete fact. Sound like a builder, not a chatbot.';

      const user = `Sources from our brain:\n\n${context}\n\n---\n\nQuestion: ${finalQ}\n\nAnswer the question using the sources above. If the sources are about adjacent topics, surface what they DO say and note the adjacency.`;

      const a = (await window.pmf.anthropic.chat(system, user)) as { ok: boolean; text?: string; error?: string };
      if (a.ok && a.text) {
        setStage('done');
        streamAnswer(a.text);
      } else {
        setAnswer(synthesizeFallback(finalQ, hits));
        setStage('done');
        if (a.error) console.warn('[ask-brain] anthropic failed, showed fallback:', a.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setStage('idle');
    }
  };

  // Extract capitalized terms (proper nouns) from the original question.
  // "What did FT Partners care about most?" → "FT Partners"
  function extractNamedEntities(input: string): string {
    const words = input.split(/\s+/);
    const named: string[] = [];
    for (const w of words) {
      const stripped = w.replace(/[^\w]/g, '');
      // Skip first word (sentence-start capital) unless it's UPPERCASE or clearly a name
      if (stripped.length >= 2 && /^[A-Z]/.test(stripped)) {
        // Skip common sentence-start words
        if (!/^(What|Why|When|Where|Who|How|Which|Do|Does|Did|Is|Are|Was|Were|Can|Could|Should|Would|Tell|Give|Show|Find)$/.test(stripped)) {
          named.push(stripped);
        }
      }
    }
    return named.join(' ').toLowerCase();
  }

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

      {askedQuestion && loading && !answer && (
        <div className="ask-brain__thinking">
          <span className="ask-brain__thinking-dot" />
          <span className="ask-brain__thinking-dot" />
          <span className="ask-brain__thinking-dot" />
          <span className="ask-brain__thinking-label">
            {stage === 'searching' ? 'Searching 181 pages…' :
             stage === 'synthesizing' ? 'Thinking…' :
             'Loading…'}
          </span>
        </div>
      )}

      {askedQuestion && answer && (
        <div className="ask-brain__answer">
          <div className="outreach__section-label">Brain says</div>
          <div className="ask-brain__answer-text">{answer}{loading && <span className="ask-brain__cursor">▊</span>}</div>

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
