import { structuredCall } from './anthropic';
import { gbrainClient, type GBrainSearchChunk } from './gbrain-client';

export type CoachCard = {
  type: 'say' | 'ask' | 'avoid' | 'show' | 'close';
  headline: string;
  body: string;
  confidence: number;
  provenance?: string[]; // slugs of brain pages that backed this card
};

export type CoachContext = {
  lastTurns: string[];
  callStage?: string;
};

const CARD_DEALCLOUD: CoachCard = {
  type: 'ask',
  headline: 'Ask who owns DealCloud config',
  body: 'Our CRM agent is schema-driven — auto-adapts to their setup, no manual mapping',
  confidence: 0.93,
};

const CARD_SECURITY: CoachCard = {
  type: 'show',
  headline: 'Lead with all-in-tenant Azure',
  body: 'Customer-owned data stores, Azure OpenAI, never leaves their tenant',
  confidence: 0.95,
};

const CARD_BUYER_TRACKER: CoachCard = {
  type: 'show',
  headline: 'Show buyer-tracker auto-update',
  body: 'Strongest pain in our brain — 10 of 15 prior calls said it',
  confidence: 0.94,
};

const CARD_CRM_STALE: CoachCard = {
  type: 'ask',
  headline: 'How much time does stale CRM cost weekly?',
  body: 'Their answer becomes your ROI number',
  confidence: 0.91,
};

const CARD_OVER_DEMO: CoachCard = {
  type: 'avoid',
  headline: 'Pause demo — ask workflow question first',
  body: 'Discovery incomplete. Get them to name a buyer who slipped',
  confidence: 0.88,
};

const COACH_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['say', 'ask', 'avoid', 'show', 'close'] },
    headline: { type: 'string', maxLength: 60 },
    body: { type: 'string', maxLength: 160 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['type', 'headline', 'body', 'confidence'],
};

const COACH_SYSTEM =
  'You are an expert sales coach for Arvya selling to PE/IB deal teams. Output ONE next move. Headline ≤8 words, body ≤24 words, ONE sentence. Be specific.';

function clampConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.7;
  return Math.max(0, Math.min(1, value));
}

function sanitize(card: CoachCard): CoachCard {
  return {
    type: card.type,
    headline: card.headline.slice(0, 60),
    body: card.body.slice(0, 160),
    confidence: clampConfidence(card.confidence),
    provenance: card.provenance,
  };
}

// Pull supporting chunks from gbrain that match the prospect's recent turns.
// Fans out 3 queries (the raw last turn, stopword-stripped, and a topic hint)
// then dedupes by slug. Returns top 4. Empty array if gbrain is unreachable —
// coach degrades to ungrounded mode rather than blocking.
const COACH_STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been',
  'and', 'or', 'but', 'if', 'so', 'just', 'really',
  'i', 'we', 'you', 'they', 'our', 'your', 'their',
  'do', 'does', 'did', 'have', 'has', 'had',
  'in', 'on', 'at', 'to', 'from', 'for', 'of', 'with', 'by', 'about',
  'what', 'why', 'when', 'where', 'who', 'how', 'which',
  'this', 'that', 'these', 'those', 'some', 'any', 'all',
  'not', 'no', 'yes', 'okay', 'ok',
  // Common transcript filler
  'um', 'uh', 'like', 'know', 'mean', 'right', 'yeah', 'kinda', 'sorta',
]);

function stripFiller(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && w.length >= 3 && !COACH_STOPWORDS.has(w))
    .join(' ');
}

// Keyword hints that map to known content in the brain. If the joined transcript
// mentions any, we add a targeted query that surfaces well-curated pages instead
// of relying on stripFiller alone.
function topicHint(joined: string): string | null {
  if (/\bdeal\s?cloud\b/i.test(joined)) return 'DealCloud integration';
  if (/\bbuyer\s?tracker\b/i.test(joined)) return 'buyer tracker';
  if (/\bsecur|complian|soc\s?2|hipaa|tenant/i.test(joined)) return 'Arvya security tenant';
  if (/\bcrm|stale|outlook/i.test(joined)) return 'stale CRM Outlook';
  if (/\bprice|cost|budget|expensive/i.test(joined)) return 'Arvya pricing';
  if (/\bvision|differen|why|moat/i.test(joined)) return 'Arvya vision deal brain';
  return null;
}

async function fetchBrainContext(
  ctx: CoachContext,
): Promise<GBrainSearchChunk[]> {
  if (ctx.lastTurns.length === 0) return [];
  const lastTurn = ctx.lastTurns[ctx.lastTurns.length - 1] ?? '';
  const joined = ctx.lastTurns.join(' ');

  const stripped = stripFiller(lastTurn) || stripFiller(joined);
  const hint = topicHint(joined);

  const queries = Array.from(
    new Set(
      [lastTurn.slice(0, 120), stripped, hint]
        .filter((q): q is string => !!q && q.length >= 3),
    ),
  );

  const seen = new Set<string>();
  const out: GBrainSearchChunk[] = [];
  for (const q of queries) {
    try {
      const hits = await gbrainClient.search(q, 4);
      for (const h of hits) {
        const key = `${h.slug ?? ''}::${(h.chunk_text ?? '').slice(0, 60)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(h);
        if (out.length >= 4) return out;
      }
    } catch {
      /* skip individual failures — coach degrades gracefully */
    }
  }
  return out;
}

function chunkBlock(chunks: GBrainSearchChunk[]): string {
  if (chunks.length === 0) return '';
  return chunks
    .map(
      (c, i) =>
        `[Brain ${i + 1}] ${c.title ?? c.slug ?? '?'}\n${(c.chunk_text ?? '').slice(0, 380)}`,
    )
    .join('\n\n---\n\n');
}

function deterministicMatch(joined: string): CoachCard | null {
  // Require word boundaries on single tokens so Whisper noise like "watching"
  // doesn't fire "watch us through", "show" doesn't fire "over-demo" guard, etc.
  if (/\b(deal\s?cloud|intapp)\b/.test(joined)) return CARD_DEALCLOUD;

  if (
    /\b(soc\s?2|hipaa|compliance review|security review|security questionnaire|tenant isolation|data residency)\b/.test(
      joined,
    )
  ) {
    return CARD_SECURITY;
  }

  if (/\b(buyer\s?tracker|excel\s?tracker|buyer racetrack|process tracker)\b/.test(joined)) {
    return CARD_BUYER_TRACKER;
  }

  if (
    /\bcrm\b.*\b(stale|never accurate|out of date|week behind)\b/.test(joined) ||
    /\bworks?\s+out\s+of\s+outlook\b/.test(joined)
  ) {
    return CARD_CRM_STALE;
  }

  if (
    /\b(can you show|show us|walk us through|walk me through|demo the product|jump into the demo)\b/.test(
      joined,
    )
  ) {
    return CARD_OVER_DEMO;
  }

  return null;
}

const FALLBACK_CARD: CoachCard = {
  type: 'ask',
  headline: 'Ask one workflow question',
  body: 'Get them to name a deal that slipped — turn that into the wedge',
  confidence: 0.6,
};

export async function nextCard(ctx: CoachContext): Promise<CoachCard> {
  const joined = ctx.lastTurns.join(' ').toLowerCase();

  // Pull brain context BEFORE both deterministic and LLM paths so every card
  // can cite a real past call instead of a hardcoded one-liner.
  const chunks = await fetchBrainContext(ctx);
  const provenance = chunks.map((c) => c.slug ?? '').filter(Boolean);

  // Deterministic path: still fast, but now we splice the strongest matching
  // brain quote into the body so the card says *something real from our calls*.
  const matched = deterministicMatch(joined);
  if (matched) {
    if (chunks[0]) {
      const quote = (chunks[0].chunk_text ?? '').trim().replace(/\s+/g, ' ');
      const short = quote.length > 140 ? quote.slice(0, 138) + '…' : quote;
      const sourceLabel = chunks[0].title ?? chunks[0].slug ?? 'brain';
      return sanitize({
        ...matched,
        body: `${matched.body} · From ${sourceLabel}: "${short}"`,
        provenance,
      });
    }
    return sanitize({ ...matched, provenance });
  }

  // LLM path with retrieved context. Anthropic now sees real past-call
  // excerpts and is told to ground in them, with citation in the body.
  try {
    const contextBlock = chunkBlock(chunks);
    const userPrompt = contextBlock
      ? `<transcript_last_turns>\n${ctx.lastTurns.slice(-3).join(' ')}\n</transcript_last_turns>\n` +
        `<call_stage>${ctx.callStage ?? 'unknown'}</call_stage>\n` +
        `<brain_context>\n${contextBlock}\n</brain_context>\n` +
        `Pick the ONE next move. Ground the body in [Brain N] when relevant. ` +
        `Cite by short page name in the body like: "(from <page>)". ` +
        `If brain has nothing relevant, say so honestly and lower confidence.`
      : `<transcript_last_turns>\n${ctx.lastTurns.slice(-3).join(' ')}\n</transcript_last_turns>\n` +
        `<call_stage>${ctx.callStage ?? 'unknown'}</call_stage>\n` +
        `No brain context available. Output a generic next move with low confidence (≤0.6).`;

    const system = contextBlock
      ? `${COACH_SYSTEM} Use ONLY the provided [Brain N] excerpts as evidence. ` +
        `If they don't speak to the moment, lower confidence below 0.7. Never invent facts.`
      : COACH_SYSTEM;

    const result = await structuredCall<Partial<CoachCard>>({
      system,
      user: userPrompt,
      toolName: 'emit_card',
      schema: COACH_SCHEMA,
      maxTokens: 180,
    });

    const type = (result.type ?? 'ask') as CoachCard['type'];
    return sanitize({
      type,
      headline: (result.headline ?? FALLBACK_CARD.headline).toString(),
      body: (result.body ?? FALLBACK_CARD.body).toString(),
      confidence: clampConfidence(result.confidence),
      provenance,
    });
  } catch (error) {
    console.error('[coach-engine] LLM fallback failed:', error);
    return sanitize({ ...FALLBACK_CARD, provenance });
  }
}
