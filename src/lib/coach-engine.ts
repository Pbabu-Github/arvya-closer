import { structuredCall } from './anthropic';

export type CoachCard = {
  type: 'say' | 'ask' | 'avoid' | 'show' | 'close';
  headline: string;
  body: string;
  confidence: number;
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
    body: card.body.slice(0, 120),
    confidence: clampConfidence(card.confidence),
  };
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

  const matched = deterministicMatch(joined);
  if (matched) return sanitize(matched);

  try {
    const result = await structuredCall<Partial<CoachCard>>({
      system: COACH_SYSTEM,
      user: `<transcript_last_turns>${ctx.lastTurns
        .slice(-3)
        .join(' ')}</transcript_last_turns>\n<call_stage>${
        ctx.callStage ?? 'unknown'
      }</call_stage>\nWhat's the ONE move?`,
      toolName: 'emit_card',
      schema: COACH_SCHEMA,
      maxTokens: 150,
    });

    const type = (result.type ?? 'ask') as CoachCard['type'];
    return sanitize({
      type,
      headline: (result.headline ?? FALLBACK_CARD.headline).toString(),
      body: (result.body ?? FALLBACK_CARD.body).toString(),
      confidence: clampConfidence(result.confidence),
    });
  } catch (error) {
    console.error('[coach-engine] LLM fallback failed:', error);
    return sanitize(FALLBACK_CARD);
  }
}
