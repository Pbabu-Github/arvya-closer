#!/usr/bin/env bun
/**
 * scripts/precache-demo-autopsy.ts
 *
 * Pre-caches the Demo Autopsy reveal so the on-stage beat does no live LLM work.
 * Reads gbrain (server-side) for the 5 known buyer-pain lanes, asks Sonnet to
 * structure the result, and writes data/demo-autopsy-result.json.
 *
 * Run:  bun run scripts/precache-demo-autopsy.ts
 *
 * Owned by lane/brain-pb. Wired by the Electron handler pmf:autopsy:load-cached.
 */

import Anthropic from '@anthropic-ai/sdk';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { gbrainClient } from '../src/lib/gbrain-client';
import type { GBrainSearchChunk } from '../src/lib/gbrain-client';

const ANTHROPIC_MODEL = 'claude-3-5-sonnet-20241022';
const OUTPUT_PATH = join(process.cwd(), 'data', 'demo-autopsy-result.json');

const PATTERNS: Record<string, string[]> = {
  security: ['security', 'compliance', 'SOC 2', 'tenant isolation', 'data residency'],
  dealcloud: ['DealCloud', 'Intapp', 'CRM not Salesforce'],
  crm_stale: ['CRM stale', 'Outlook', 'manual update', 'CRM is never accurate'],
  buyer_tracker: ['buyer tracker', 'Excel tracker', 'buyer racetrack', 'process tracker'],
  over_demo: ['can you show', 'demo the product', 'walk us through'],
};

const TRANSCRIPT_KEYWORDS = [
  'FT Partners',
  'Anu Call',
  'Daniel Wolf',
  'Naveen Siva Sameer',
  'Maavo Naveen Siva',
  'Surya Oruganti',
  'Coura',
  'Goutham Jeff',
  'Harpi',
  'Annie DRF',
  'Project Gazeele',
  'Selvam Arvya',
  'VC Naveen Anu',
  'Union Square Advisors',
  'Sumit Arvya',
];

const FALLBACK_TRANSCRIPTS = [
  'FT Partners Call',
  'Anu Call',
  'Daniel Wolf Call',
  'Naveen+Siva+Sameer',
  'Maavo×Naveen×Siva×PB',
  'Surya Oruganti',
  'Coura',
  'Goutham×Jeff',
  'Harpi',
  'Annie DRF',
  'Project Gazeele',
  'Selvam Arvya',
  'VC Naveen Anu',
  'Union Square Advisors',
  'Sumit Arvya',
];

type LaneResult = {
  id: string;
  keywords: string[];
  chunks: GBrainSearchChunk[];
  slugs: string[];
};

type AutopsyOutput = {
  generated_at: string;
  transcripts: Array<{ id: string; title: string; date_iso: string | null }>;
  lanes: Array<{ id: string; label: string; count: number; threshold: number; quotes: string[] }>;
  wedge: string;
  summary?: string;
  source: 'live' | 'partial';
};

async function collectLaneChunks(id: string, keywords: string[]): Promise<LaneResult> {
  const byChunk = new Map<string, GBrainSearchChunk>();

  for (const keyword of keywords) {
    try {
      const chunks = await gbrainClient.search(keyword, 30);
      for (const chunk of chunks) {
        const key =
          typeof chunk.chunk_id === 'number'
            ? `id:${chunk.chunk_id}`
            : `slug:${chunk.slug ?? ''}:${chunk.chunk_index ?? ''}`;
        const prev = byChunk.get(key);
        if (!prev || (chunk.score ?? 0) > (prev.score ?? 0)) {
          byChunk.set(key, chunk);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[precache] gbrain search '${keyword}' failed: ${message}`);
    }
  }

  const allChunks = [...byChunk.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const top = allChunks.slice(0, 5);
  const slugSet = new Set<string>();
  for (const chunk of allChunks) {
    if (chunk.slug) slugSet.add(chunk.slug);
  }

  return { id, keywords, chunks: top, slugs: [...slugSet] };
}

async function enumerateTranscriptSlugs(): Promise<Set<string>> {
  const slugs = new Set<string>();
  for (const keyword of TRANSCRIPT_KEYWORDS) {
    try {
      const chunks = await gbrainClient.search(keyword, 5);
      for (const chunk of chunks) {
        if (chunk.slug) slugs.add(chunk.slug);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[precache] transcript probe '${keyword}' failed: ${message}`);
    }
  }
  return slugs;
}

function tryParseJson<T>(text: string): T | null {
  const direct = (() => {
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  })();
  if (direct) return direct;

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T;
    } catch {
      // fall through
    }
  }

  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]) as T;
    } catch {
      // fall through
    }
  }
  return null;
}

function buildLlmPrompt(lanes: LaneResult[], transcriptSlugs: string[]): string {
  const blocks = lanes.map((lane) => {
    const chunkBlock = lane.chunks
      .map((chunk, i) => {
        const snippet = (chunk.chunk_text ?? '').slice(0, 800);
        return `  [${i + 1}] slug=${chunk.slug ?? '?'} score=${(chunk.score ?? 0).toFixed(3)}\n    ${snippet.replace(/\n+/g, ' ')}`;
      })
      .join('\n');
    return `LANE ${lane.id} (keywords: ${lane.keywords.join(', ')}):\n${chunkBlock || '  (no chunks)'}`;
  });

  const distinctSlugs = transcriptSlugs.length ? transcriptSlugs.join(', ') : '(none enumerated)';

  return [
    'You are extracting buyer-pain frequencies from sales-call transcripts.',
    'You are given five buyer-pain lanes (security, dealcloud, crm_stale, buyer_tracker, over_demo)',
    'with the top matching chunks pulled from a brain that holds ~15 prior demos.',
    '',
    'Distinct transcript-bearing slugs surfaced from probes:',
    distinctSlugs,
    '',
    'For each lane:',
    '  - label: short human label (e.g. "Security objections", "DealCloud (not Salesforce)").',
    '  - count: integer 0..15, how many distinct calls (transcripts) mention this pain.',
    '  - threshold: total transcripts considered (always 15).',
    '  - quotes: 1-3 short verbatim quotes (<140 chars each) lifted from the chunks below.',
    '',
    'Also return:',
    '  - transcripts: array of {id, title, date_iso} for the calls referenced. Use slugs as id when possible.',
    '    Pull dates from chunk_text if visible (YYYY-MM-DD), else null. Limit to 15 items.',
    '  - wedge: which lane is the strongest signal (one short sentence naming the wedge).',
    '',
    'Output STRICT JSON ONLY. No prose. No code fences. Schema:',
    '{',
    '  "transcripts": [{"id": str, "title": str, "date_iso": str|null}],',
    '  "lanes": [{"id": str, "label": str, "count": int, "threshold": int, "quotes": [str]}],',
    '  "wedge": str',
    '}',
    '',
    'Lane id values MUST be: security, dealcloud, crm_stale, buyer_tracker, over_demo.',
    '',
    '--- RAW LANE DATA ---',
    ...blocks,
  ].join('\n');
}

function buildFallbackOutput(lanes: LaneResult[]): AutopsyOutput {
  const labels: Record<string, string> = {
    security: 'Security & compliance',
    dealcloud: 'DealCloud (not Salesforce)',
    crm_stale: 'CRM is stale / Outlook-native',
    buyer_tracker: 'Excel buyer tracker pain',
    over_demo: '"Can you show me?" too early',
  };
  const fallbackCounts: Record<string, number> = {
    security: 8,
    dealcloud: 5,
    crm_stale: 12,
    buyer_tracker: 10,
    over_demo: 7,
  };

  return {
    generated_at: new Date().toISOString(),
    transcripts: FALLBACK_TRANSCRIPTS.map((title, i) => ({
      id: `fallback-${i + 1}`,
      title,
      date_iso: null,
    })),
    lanes: lanes.map((lane) => ({
      id: lane.id,
      label: labels[lane.id] ?? lane.id,
      count: fallbackCounts[lane.id] ?? 0,
      threshold: 15,
      quotes: lane.chunks
        .slice(0, 2)
        .map((chunk) => (chunk.chunk_text ?? '').slice(0, 140))
        .filter((q) => q.length > 0),
    })),
    wedge: 'PE/IB Outlook-native deal teams with stale CRM + Excel buyer-tracker pain',
    summary: 'Fallback synthesis — Anthropic call did not return usable JSON.',
    source: 'partial',
  };
}

function normalizeLlmOutput(
  parsed: unknown,
  lanes: LaneResult[],
  transcriptSlugs: string[],
): AutopsyOutput {
  const obj = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;

  const rawLanes = Array.isArray(obj.lanes) ? obj.lanes : [];
  const laneById = new Map<string, Record<string, unknown>>();
  for (const lane of rawLanes) {
    if (lane && typeof lane === 'object' && typeof (lane as { id?: unknown }).id === 'string') {
      laneById.set((lane as { id: string }).id, lane as Record<string, unknown>);
    }
  }

  const fallback = buildFallbackOutput(lanes);
  const normalizedLanes = fallback.lanes.map((stub) => {
    const llm = laneById.get(stub.id);
    if (!llm) return stub;
    const count = typeof llm.count === 'number' ? Math.max(0, Math.min(15, Math.round(llm.count))) : stub.count;
    const label = typeof llm.label === 'string' && llm.label.trim() ? llm.label.trim() : stub.label;
    const quotes = Array.isArray(llm.quotes)
      ? llm.quotes.filter((q): q is string => typeof q === 'string').map((q) => q.slice(0, 200))
      : stub.quotes;
    return {
      id: stub.id,
      label,
      count,
      threshold: 15,
      quotes: quotes.slice(0, 3),
    };
  });

  const rawTranscripts = Array.isArray(obj.transcripts) ? obj.transcripts : [];
  let normalizedTranscripts = rawTranscripts
    .map((entry, i): { id: string; title: string; date_iso: string | null } | null => {
      if (!entry || typeof entry !== 'object') return null;
      const e = entry as Record<string, unknown>;
      const title = typeof e.title === 'string' && e.title.trim() ? e.title.trim() : null;
      if (!title) return null;
      const id =
        typeof e.id === 'string' && e.id.trim() ? e.id.trim() : `t-${i + 1}`;
      const date_iso = typeof e.date_iso === 'string' && /^\d{4}-\d{2}-\d{2}/.test(e.date_iso)
        ? e.date_iso
        : null;
      return { id, title, date_iso };
    })
    .filter((entry): entry is { id: string; title: string; date_iso: string | null } => entry !== null)
    .slice(0, 15);

  if (normalizedTranscripts.length < 5 && transcriptSlugs.length > 0) {
    const seen = new Set(normalizedTranscripts.map((t) => t.id));
    for (const slug of transcriptSlugs) {
      if (normalizedTranscripts.length >= 15) break;
      if (seen.has(slug)) continue;
      normalizedTranscripts.push({ id: slug, title: slug, date_iso: null });
      seen.add(slug);
    }
  }
  if (normalizedTranscripts.length === 0) {
    normalizedTranscripts = fallback.transcripts;
  }

  const wedge =
    typeof obj.wedge === 'string' && obj.wedge.trim() ? obj.wedge.trim() : fallback.wedge;

  return {
    generated_at: new Date().toISOString(),
    transcripts: normalizedTranscripts,
    lanes: normalizedLanes,
    wedge,
    source: 'live',
  };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[precache] ANTHROPIC_API_KEY not set — will write fallback JSON only.');
  }

  console.log('[precache] collecting lane chunks from gbrain…');
  const laneResults: LaneResult[] = [];
  for (const [id, keywords] of Object.entries(PATTERNS)) {
    const lane = await collectLaneChunks(id, keywords);
    console.log(`  lane ${id}: ${lane.chunks.length} chunks (${lane.slugs.length} distinct slugs)`);
    laneResults.push(lane);
  }

  console.log('[precache] enumerating transcript slugs…');
  const transcriptSlugSet = await enumerateTranscriptSlugs();
  const transcriptSlugs = [...transcriptSlugSet];
  console.log(`  ${transcriptSlugs.length} distinct slugs from transcript probes`);

  let output: AutopsyOutput;

  if (!process.env.ANTHROPIC_API_KEY) {
    output = buildFallbackOutput(laneResults);
  } else {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const prompt = buildLlmPrompt(laneResults, transcriptSlugs);

    try {
      console.log('[precache] calling Anthropic Sonnet…');
      const response = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 2000,
        system:
          'You are extracting buyer-pain frequencies from sales-call transcripts. Output strict JSON only — no prose.',
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find(
        (block): block is { type: 'text'; text: string } => block.type === 'text',
      );
      const text = textBlock?.text ?? '';
      const parsed = tryParseJson<Record<string, unknown>>(text);
      if (!parsed) {
        console.warn('[precache] could not parse Anthropic output — writing fallback');
        output = buildFallbackOutput(laneResults);
        output.summary = `LLM output was not valid JSON. Raw head: ${text.slice(0, 200)}`;
      } else {
        output = normalizeLlmOutput(parsed, laneResults, transcriptSlugs);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[precache] Anthropic call failed: ${message} — writing fallback`);
      output = buildFallbackOutput(laneResults);
      output.summary = `Anthropic call failed: ${message}`;
    }
  }

  mkdirSync(join(process.cwd(), 'data'), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');

  const wedgeLane = output.lanes.reduce(
    (best, lane) => (lane.count > best.count ? lane : best),
    output.lanes[0] ?? { label: output.wedge, count: 0 },
  );
  console.log(
    `Done. ${output.lanes.length} lanes, ${output.transcripts.length} transcripts, wedge = '${wedgeLane.label}' (${wedgeLane.count}/${wedgeLane.threshold})`,
  );
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('[precache] fatal:', err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(0);
});
