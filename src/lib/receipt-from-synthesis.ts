/**
 * src/lib/receipt-from-synthesis.ts
 *
 * Single Anthropic Sonnet call that turns a finished call's transcript into:
 *   - a LearningReceipt (PLAN_ORIGINAL.md L354-373) for GBrain write-back, and
 *   - the demo-narrative "fact pile" rendered in beat 4 (Receipt + Loop).
 *
 * Owned by lane/brain-pb. Called from the dashboard's "End call → Synthesize"
 * action via the pmf:receipt:build IPC (wiring lives elsewhere).
 */

import Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_MODEL = 'claude-sonnet-4-6';

export type LearningReceiptOutcome =
  | 'drafted'
  | 'sent'
  | 'positive_reply'
  | 'booked'
  | 'stalled'
  | 'closed_lost'
  | 'progressed';

export type LearningReceipt = {
  id: string;
  timestamp: string;
  account: string;
  person?: string;
  segment: string;
  sourceSignal: string;
  hypothesis: string;
  actionTaken: string;
  proofUsed: string[];
  buyerPains: string[];
  objections: string[];
  outcome: LearningReceiptOutcome;
  nextStep: string;
  productLearning: string;
  gbrainSlug?: string;
  hypothesisEvidenced: boolean;
  newObjections: string[];
  patternsReinforced: Array<{ name: string; oldCount: number; newCount: number }>;
  nextExperiment: string;
  brainUpdate: { pagesAdded: number; edgesAdded: number };
};

export type CallContext = {
  prospectName: string;
  transcriptText: string;
  dateIso: string;
  account?: string;
  segment?: string;
  sourceSignal?: string;
  hypothesis?: string;
};

const OUTCOMES: ReadonlySet<LearningReceiptOutcome> = new Set([
  'drafted',
  'sent',
  'positive_reply',
  'booked',
  'stalled',
  'closed_lost',
  'progressed',
]);

const SYSTEM_PROMPT = [
  'You are the Learning Agent for Arvya Closer. After a sales call, you extract a structured',
  'LearningReceipt that updates the brain and renders the "receipt" beat of the demo.',
  '',
  'Output STRICT JSON only — no prose, no code fences. Schema (every field required):',
  '{',
  '  "id": str,                    // short slug, e.g. "rcpt-<account>-<date>"',
  '  "timestamp": str,             // ISO-8601 datetime',
  '  "account": str,',
  '  "person": str|null,',
  '  "segment": str,               // e.g. "PE/IB" or "M&A advisory"',
  '  "sourceSignal": str,',
  '  "hypothesis": str,',
  '  "actionTaken": str,',
  '  "proofUsed": [str],           // proof points referenced in the call',
  '  "buyerPains": [str],          // recurring pains observed',
  '  "objections": [str],          // objections raised',
  '  "outcome": enum,              // one of: drafted, sent, positive_reply, booked, stalled, closed_lost, progressed',
  '  "nextStep": str,',
  '  "productLearning": str,       // ONE-sentence learning to feed the next call',
  '  "gbrainSlug": str|null,       // suggested slug for gtm/calls/<date>-<account>',
  '  "hypothesisEvidenced": bool,',
  '  "newObjections": [str],',
  '  "patternsReinforced": [{"name": str, "oldCount": int, "newCount": int}],',
  '  "nextExperiment": str,',
  '  "brainUpdate": {"pagesAdded": int, "edgesAdded": int}',
  '}',
  '',
  'Rules:',
  '  - Pull verbatim phrases for objections / pains where possible.',
  '  - If a field is unknown, use empty string or empty array — NOT null (except where the schema allows it).',
  '  - patternsReinforced.oldCount + 1 = newCount in most cases.',
  '  - brainUpdate counts are reasonable estimates (pagesAdded 1-5, edgesAdded 3-15).',
  '  - "outcome" MUST be one of the enum values.',
].join('\n');

function tryParseJson<T>(text: string): T | null {
  const candidates: string[] = [text.trim()];

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) candidates.push(fenceMatch[1].trim());

  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) candidates.push(braceMatch[0]);

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // try next
    }
  }
  return null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

function asInt(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string' && Number.isFinite(Number(value))) return Math.round(Number(value));
  return fallback;
}

function normalizeReceipt(parsed: unknown, ctx: CallContext): LearningReceipt {
  const obj = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
  const outcomeCandidate = asString(obj.outcome, 'drafted');
  const outcome: LearningReceiptOutcome = OUTCOMES.has(outcomeCandidate as LearningReceiptOutcome)
    ? (outcomeCandidate as LearningReceiptOutcome)
    : 'drafted';

  const patternsRaw = Array.isArray(obj.patternsReinforced) ? obj.patternsReinforced : [];
  const patternsReinforced = patternsRaw
    .map((p): { name: string; oldCount: number; newCount: number } | null => {
      if (!p || typeof p !== 'object') return null;
      const rec = p as Record<string, unknown>;
      const name = asString(rec.name).trim();
      if (!name) return null;
      const oldCount = asInt(rec.oldCount, 0);
      const newCount = asInt(rec.newCount, oldCount + 1);
      return { name, oldCount, newCount };
    })
    .filter((p): p is { name: string; oldCount: number; newCount: number } => p !== null);

  const brainUpdateRaw = obj.brainUpdate as Record<string, unknown> | undefined;
  const brainUpdate = {
    pagesAdded: asInt(brainUpdateRaw?.pagesAdded, 1),
    edgesAdded: asInt(brainUpdateRaw?.edgesAdded, 3),
  };

  const account = asString(obj.account, ctx.account ?? ctx.prospectName);
  const dateSlug = ctx.dateIso.slice(0, 10);
  const fallbackId = `rcpt-${account.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${dateSlug}`;

  return {
    id: asString(obj.id, fallbackId),
    timestamp: asString(obj.timestamp, ctx.dateIso),
    account,
    person: typeof obj.person === 'string' && obj.person ? obj.person : ctx.prospectName,
    segment: asString(obj.segment, ctx.segment ?? ''),
    sourceSignal: asString(obj.sourceSignal, ctx.sourceSignal ?? ''),
    hypothesis: asString(obj.hypothesis, ctx.hypothesis ?? ''),
    actionTaken: asString(obj.actionTaken),
    proofUsed: asStringArray(obj.proofUsed),
    buyerPains: asStringArray(obj.buyerPains),
    objections: asStringArray(obj.objections),
    outcome,
    nextStep: asString(obj.nextStep),
    productLearning: asString(obj.productLearning),
    gbrainSlug:
      typeof obj.gbrainSlug === 'string' && obj.gbrainSlug
        ? obj.gbrainSlug
        : `gtm/calls/${dateSlug}-${account.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    hypothesisEvidenced: obj.hypothesisEvidenced === true,
    newObjections: asStringArray(obj.newObjections),
    patternsReinforced,
    nextExperiment: asString(obj.nextExperiment),
    brainUpdate,
  };
}

function buildFallbackReceipt(ctx: CallContext, reason: string): LearningReceipt {
  const dateSlug = ctx.dateIso.slice(0, 10);
  const account = ctx.account ?? ctx.prospectName;
  const accountSlug = account.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return {
    id: `rcpt-${accountSlug}-${dateSlug}`,
    timestamp: ctx.dateIso,
    account,
    person: ctx.prospectName,
    segment: ctx.segment ?? '',
    sourceSignal: ctx.sourceSignal ?? '',
    hypothesis: ctx.hypothesis ?? '',
    actionTaken: 'Ran live demo with overlay coaching.',
    proofUsed: [],
    buyerPains: [],
    objections: [],
    outcome: 'drafted',
    nextStep: `Send follow-up to ${ctx.prospectName} with pilot proposal.`,
    productLearning: `Fallback receipt — ${reason}`,
    gbrainSlug: `gtm/calls/${dateSlug}-${accountSlug}`,
    hypothesisEvidenced: false,
    newObjections: [],
    patternsReinforced: [],
    nextExperiment: 'Ask about IT security gate earlier in discovery.',
    brainUpdate: { pagesAdded: 1, edgesAdded: 3 },
  };
}

export async function buildReceipt(ctx: CallContext): Promise<LearningReceipt> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return buildFallbackReceipt(ctx, 'ANTHROPIC_API_KEY not set');
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const transcript = ctx.transcriptText.length > 24000
    ? ctx.transcriptText.slice(0, 12000) + '\n\n[…truncated…]\n\n' + ctx.transcriptText.slice(-12000)
    : ctx.transcriptText;

  const user = [
    `<prospect>${ctx.prospectName}</prospect>`,
    `<date_iso>${ctx.dateIso}</date_iso>`,
    ctx.account ? `<account>${ctx.account}</account>` : '',
    ctx.segment ? `<segment>${ctx.segment}</segment>` : '',
    ctx.sourceSignal ? `<source_signal>${ctx.sourceSignal}</source_signal>` : '',
    ctx.hypothesis ? `<hypothesis>${ctx.hypothesis}</hypothesis>` : '',
    `<transcript>\n${transcript}\n</transcript>`,
    '',
    'Emit the LearningReceipt JSON now.',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: user }],
    });

    const textBlock = response.content.find(
      (block): block is { type: 'text'; text: string } => block.type === 'text',
    );
    const text = textBlock?.text ?? '';
    const parsed = tryParseJson<Record<string, unknown>>(text);
    if (!parsed) {
      return buildFallbackReceipt(ctx, 'LLM output was not valid JSON');
    }
    return normalizeReceipt(parsed, ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return buildFallbackReceipt(ctx, `Anthropic call failed: ${message}`);
  }
}
