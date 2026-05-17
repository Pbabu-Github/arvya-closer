/**
 * Shared bits for FindPeoplePanel and FindEventsPanel:
 *   - ProvenancePill: small status pill rendering ICP context (grounded/offline/empty)
 *   - rerankItems<T>: generic ZE rerank that returns items decorated with __score
 *   - eventToDoc: serializer used as the rerank doc for events
 *
 * Kept here so both panels render the same provenance UI and use the same
 * rerank path against the same ZeroEntropy contract.
 */

import type { IcpContext } from '../../icp-context';

export function ProvenancePill({
  ctx,
  loading,
}: {
  ctx: IcpContext | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="findp__provenance findp__provenance--loading">
        <span className="dot dot--pulse" />
        Reading brain…
      </div>
    );
  }
  if (!ctx) return null;
  if (!ctx.online) {
    return (
      <div className="findp__provenance findp__provenance--offline" title={ctx.error}>
        ⚠ brain offline — HOG will run ungrounded
      </div>
    );
  }
  if (ctx.painChunkCount === 0) {
    return (
      <div className="findp__provenance findp__provenance--empty">
        brain online but empty — seed the brain to ground sweeps
      </div>
    );
  }
  return (
    <div className="findp__provenance findp__provenance--online">
      grounded in <strong>{ctx.painChunkCount}</strong> gbrain chunks ·{' '}
      <strong>{ctx.entityCount}</strong> known accounts available for dedup
    </div>
  );
}

export async function rerankItems<T extends object>(
  query: string,
  items: T[],
  toDoc: (item: T) => string,
): Promise<(T & { __score?: number })[] | null> {
  try {
    const docs = items.map(toDoc);
    const r = (await window.pmf.ze.rerank(query, docs)) as {
      ok: boolean;
      hits?: Array<{ index: number; score: number }>;
    };
    if (!r.ok || !r.hits || r.hits.length === 0) return null;

    const seen = new Set<number>();
    const out: (T & { __score?: number })[] = [];
    for (const hit of r.hits) {
      if (seen.has(hit.index)) continue;
      seen.add(hit.index);
      const original = items[hit.index];
      if (original) out.push({ ...original, __score: hit.score });
    }
    for (let i = 0; i < items.length; i++) {
      if (!seen.has(i)) out.push({ ...items[i] });
    }
    return out;
  } catch {
    return null;
  }
}

export type EventLike = {
  name: string;
  audience?: string;
  what_to_say?: string;
  why_relevant?: string;
  location?: string;
};

export function eventToDoc(ev: EventLike): string {
  return [ev.name, ev.audience, ev.what_to_say, ev.why_relevant, ev.location]
    .filter(Boolean)
    .join(' · ');
}

export async function rerankEvents<T extends EventLike>(
  query: string,
  items: T[],
): Promise<(T & { __score?: number })[] | null> {
  return rerankItems(query, items, eventToDoc);
}
