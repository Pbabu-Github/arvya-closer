/// <reference path="./pmf-api.d.ts" />
/**
 * ICP context loader — pulls grounding from gbrain before HOG runs.
 *
 * Two parallel gbrain.search calls:
 *   1. Pain/wedge chunks  → feed into HOG prompt AND become the ZE rerank query.
 *   2. Named accounts/people → dedup list so we don't re-surface what we already know.
 *
 * Runs in the renderer via window.pmf.gbrain.search. Main process holds the secrets.
 *
 * Graceful degradation: if the brain is unreachable or returns no usable chunks,
 * returns an "offline" context. Callers fall back to ungrounded HOG.
 */

const PAIN_QUERY = 'Arvya buyer pains objections wedge DealCloud buyer tracker CRM stale';
const ENTITY_QUERY = 'PE IB firm names people companies mentioned in calls';

const PAIN_CHUNK_LIMIT = 8;
const ENTITY_CHUNK_LIMIT = 12;
const MIN_USEFUL_CHARS = 40;
const EXCERPT_CHARS = 280;

export type IcpContext = {
  online: boolean;
  /** Top pain/wedge excerpts pulled from gbrain — what to inject into prompts. */
  painChunks: string[];
  /** Concat of painChunks, capped per chunk — what to pass to ZE as the rerank query. */
  painQuery: string;
  /** Lowercased names extracted from gbrain — for client-side dedup of HOG results. */
  knownNames: string[];
  /** Lowercased companies extracted from gbrain — for client-side dedup. */
  knownCompanies: string[];
  /** How many gbrain chunks were used for the pain context (after filtering). */
  painChunkCount: number;
  /** How many entities (names + companies) we extracted. */
  entityCount: number;
  /** Set if the brain was unreachable or errored. */
  error?: string;
};

type GbrainSearchChunk = {
  chunk_text?: string;
  title?: string;
  slug?: string;
};

const offline = (error?: string): IcpContext => ({
  online: false,
  painChunks: [],
  painQuery: '',
  knownNames: [],
  knownCompanies: [],
  painChunkCount: 0,
  entityCount: 0,
  error,
});

/**
 * Run two parallel gbrain.search calls and synthesize an ICP context.
 * Never throws — degrades to offline mode on any failure.
 */
export async function loadIcpContext(): Promise<IcpContext> {
  if (typeof window === 'undefined' || !window.pmf?.gbrain?.search) {
    return offline('window.pmf.gbrain.search not available');
  }

  type SearchOutcome = { ok: boolean; result?: unknown; error?: string };
  const [painRes, entityRes] = (await Promise.all([
    window.pmf.gbrain.search(PAIN_QUERY).catch((e) => ({ ok: false, error: String(e) })),
    window.pmf.gbrain.search(ENTITY_QUERY).catch((e) => ({ ok: false, error: String(e) })),
  ])) as [SearchOutcome, SearchOutcome];

  if (!painRes.ok) {
    return offline(painRes.error ?? 'gbrain pain search failed');
  }

  const painRaw = toChunks(painRes.result);
  const painChunks = painRaw
    .map((c) => (c.chunk_text ?? '').trim())
    .filter((t) => t.length >= MIN_USEFUL_CHARS)
    .slice(0, PAIN_CHUNK_LIMIT);

  const painExcerpts = painChunks.map((t) =>
    t.length > EXCERPT_CHARS ? `${t.slice(0, EXCERPT_CHARS)}…` : t,
  );

  const entityRaw = entityRes.ok ? toChunks(entityRes.result) : [];
  const entityText = entityRaw
    .map((c) => (c.chunk_text ?? '').trim())
    .filter((t) => t.length >= MIN_USEFUL_CHARS)
    .slice(0, ENTITY_CHUNK_LIMIT)
    .join('\n');

  const { names, companies } = extractEntities(entityText);

  return {
    online: true,
    painChunks: painExcerpts,
    painQuery: painExcerpts.join(' '),
    knownNames: names,
    knownCompanies: companies,
    painChunkCount: painExcerpts.length,
    entityCount: names.length + companies.length,
  };
}

/**
 * Format the ICP context as a prompt-prefix block to inject into a HOG prompt.
 * Empty string when offline or no pain chunks — caller can concatenate unconditionally.
 */
export function painContextBlock(ctx: IcpContext): string {
  if (ctx.painChunks.length === 0) return '';
  return [
    'BUYER PAIN CONTEXT (from our brain — 15+ prior demos, real buyer language):',
    ...ctx.painChunks.map((c, i) => `[${i + 1}] ${c}`),
    '',
    'Find people and events that match this real pain. Quote or paraphrase this language in the why_relevant / outreach_angle fields when natural.',
    '',
  ].join('\n');
}

/**
 * Filter HOG-returned items to drop anyone whose name OR company already appears
 * in the gbrain dedup list. Returns the filtered list AND the count removed.
 */
export function dedupAgainstKnown<T extends { name?: string; company?: string }>(
  items: T[],
  ctx: IcpContext,
): { kept: T[]; removed: number } {
  if (items.length === 0 || (ctx.knownNames.length === 0 && ctx.knownCompanies.length === 0)) {
    return { kept: items, removed: 0 };
  }
  const nameSet = new Set(ctx.knownNames);
  const companySet = new Set(ctx.knownCompanies);
  const kept: T[] = [];
  for (const item of items) {
    const n = item.name?.toLowerCase().trim();
    const c = item.company?.toLowerCase().trim();
    if (n && nameSet.has(n)) continue;
    if (c && companySet.has(c)) continue;
    kept.push(item);
  }
  return { kept, removed: items.length - kept.length };
}

// --- internals ----------------------------------------------------------------

function toChunks(raw: unknown): GbrainSearchChunk[] {
  if (Array.isArray(raw)) return raw as GbrainSearchChunk[];
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    for (const key of ['chunks', 'results', 'data', 'content']) {
      if (Array.isArray(obj[key])) return obj[key] as GbrainSearchChunk[];
    }
  }
  return [];
}

/**
 * Cheap entity extraction — finds Title-Cased multi-word phrases and known PE/IB
 * suffixes. Good enough for client-side dedup, not for production NER. Lower-cased
 * for case-insensitive comparison downstream.
 */
function extractEntities(text: string): { names: string[]; companies: string[] } {
  const names = new Set<string>();
  const companies = new Set<string>();

  if (!text) return { names: [], companies: [] };

  // Companies: anything ending in common PE/IB/corp suffixes.
  const companyRe =
    /\b([A-Z][A-Za-z0-9&'.-]+(?:\s+[A-Z][A-Za-z0-9&'.-]+)*)\s+(Capital|Partners|Group|Advisors?|Securities|Bank|Holdings|Equity|Investments?|Ventures|LLC|LP|Inc\.?|Corp\.?|Co\.?|& Co\.?)\b/g;
  for (const m of text.matchAll(companyRe)) {
    const full = `${m[1]} ${m[2]}`.trim().toLowerCase();
    if (full.length > 4 && full.length < 80) companies.add(full);
  }

  // Names: two-to-three Title Case words, not following a sentence-starter common-word.
  const nameRe = /\b([A-Z][a-z]{1,15}(?:\s+[A-Z][a-z]{1,15}){1,2})\b/g;
  const stopwords = new Set([
    'New York', 'San Francisco', 'Los Angeles', 'United States', 'North America',
    'Deal Cloud', 'DealCloud', 'Salesforce', 'Microsoft', 'Outlook', 'Excel',
    'Wall Street', 'Investment Banking', 'Private Equity', 'Goldman Sachs',
    'Morgan Stanley', 'Bank Of', 'The Hog', 'Zero Entropy',
  ]);
  for (const m of text.matchAll(nameRe)) {
    const candidate = m[1];
    if (stopwords.has(candidate)) continue;
    // Skip if it's clearly a company match we already captured.
    const lower = candidate.toLowerCase();
    if ([...companies].some((c) => c.startsWith(lower))) continue;
    names.add(lower);
  }

  return {
    names: [...names].slice(0, 200),
    companies: [...companies].slice(0, 200),
  };
}
