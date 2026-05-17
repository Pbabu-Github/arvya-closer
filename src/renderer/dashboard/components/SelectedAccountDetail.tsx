/**
 * SelectedAccountDetail — replaces the LinkedIn-URL paste flow as the home view's
 * action surface. Takes a Prospect prop, auto-fetches brain context + (optional)
 * HOG enrichment, surfaces "Draft outreach DM" grounded in the brain snippets.
 *
 * No URL input — the prospect was selected from the Account Queue, so we know who
 * they are.
 */

import { useEffect, useRef, useState } from 'react';
import type { Prospect } from './AccountQueue';

type Props = {
  prospect: Prospect;
  /** Optional CTA — when present, renders a "Find more prospects to demo with" link */
  onFindMore?: () => void;
};

/** One citation pulled from gbrain.search — slug/title used for attribution, chunk_text shown italicized */
type BrainCitation = {
  slug: string;
  title?: string;
  chunk_text: string;
};

/** Turn a gbrain slug like "calls/coura-arvya-2026-04-30" into "Coura Arvya · 2026-04-30" for display */
function humanizeSlug(slug: string): string {
  const tail = slug.split('/').pop() ?? slug;
  const dateMatch = tail.match(/(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : null;
  const stem = (date ? tail.replace(date, '') : tail)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const titled = stem.replace(/\b\w/g, (c) => c.toUpperCase());
  return date ? `${titled} · ${date}` : titled;
}

const DRAFT_SYSTEM =
  'You write concise, founder-voiced LinkedIn DMs for Arvya. No greeting, no signoff, three short lines.';

const DRAFT_USER_TEMPLATE = (params: {
  prospect: Prospect;
  enrichment?: Record<string, unknown>;
  brainSnippets: string[];
}) => {
  const { prospect, enrichment, brainSnippets } = params;
  const enrichmentLines = enrichment
    ? Object.entries(enrichment)
        .filter(([, v]) => typeof v === 'string' && v.trim() !== '')
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
    : '';

  return `You are drafting a cold outreach DM for Arvya — an AI execution + intelligence platform
for investment-banking and PE deal teams, built inside Outlook. Arvya drafts emails, schedules
meetings, updates buyer trackers, and builds a per-deal memory ("Deal Brain") that lasts across
analysts.

Past customer pains we've heard (use these as proof points when relevant):
- "Our CRM is stale because everyone works out of Outlook"
- "We use DealCloud, not Salesforce — schema-driven is critical"
- "Buyer tracker in Excel is never accurate"
- "Security review takes 6 weeks — needs all-in-tenant Azure"

Write a 3-line LinkedIn DM. ONE sentence per line.
- Line 1: hook tied to their role / firm / signal
- Line 2: what Arvya does (ONE concrete capability)
- Line 3: ask for a 15-min call

No greeting. No sign-off. Plain text. Under 90 words.

Prospect:
Name: ${prospect.name}
Company: ${prospect.company}
${prospect.title ? `Title: ${prospect.title}\n` : ''}Signal: ${prospect.signal}
Last call: ${prospect.lastCallIso}
${enrichmentLines ? `\nHOG enrichment:\n${enrichmentLines}\n` : ''}
${brainSnippets.length > 0 ? `\nRelevant from our brain (past calls / notes):\n${brainSnippets.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : ''}`;
};

function pickString(raw: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!raw) return undefined;
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function extractTopCitations(raw: unknown, max: number): BrainCitation[] {
  let arr: Array<{ slug?: string; title?: string; chunk_text?: string }> = [];
  try {
    let text: string | null = null;
    if (raw && typeof raw === 'object' && 'content' in raw) {
      const c = (raw as { content?: Array<{ text?: string }> }).content;
      if (Array.isArray(c) && c[0]?.text) text = c[0].text;
    }
    if (text) {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) arr = parsed;
    } else if (Array.isArray(raw)) {
      arr = raw as typeof arr;
    }
  } catch {
    /* ignore */
  }
  return arr
    .slice(0, max)
    .map((r) => ({
      slug: String(r.slug ?? ''),
      title: typeof r.title === 'string' ? r.title : undefined,
      chunk_text: (r.chunk_text ?? '').slice(0, 280).replace(/\s+/g, ' ').trim(),
    }))
    .filter((c) => c.chunk_text.length > 0);
}

// Per-prospect HOG enrichment cache — survives re-selects and HMR remounts so we
// never re-bill credits for an account that's already been enriched this session.
const ENRICH_CACHE = new Map<string, Record<string, unknown>>();

export function SelectedAccountDetail({ prospect, onFindMore }: Props) {
  const [brainCitations, setBrainCitations] = useState<BrainCitation[]>([]);
  const [brainLoading, setBrainLoading] = useState(false);
  const [brainError, setBrainError] = useState<string | null>(null);

  const [enrichment, setEnrichment] = useState<Record<string, unknown> | null>(null);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [enrichLoading, setEnrichLoading] = useState(false);

  const [draftText, setDraftText] = useState<string | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const lastSlugRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastSlugRef.current === prospect.slug) return;
    lastSlugRef.current = prospect.slug;

    setBrainCitations([]);
    setBrainError(null);
    setEnrichError(null);
    setDraftText(null);
    setDraftError(null);

    // Restore cached enrichment if we've already paid HOG for this prospect.
    setEnrichment(ENRICH_CACHE.get(prospect.slug) ?? null);

    if (typeof window === 'undefined' || !window.pmf) return;

    // Brain search is free — fire it.
    setBrainLoading(true);
    window.pmf.gbrain
      .search(`${prospect.name} ${prospect.company}`)
      .then((r) => {
        if (r.ok && r.result) {
          setBrainCitations(extractTopCitations(r.result, 3));
        } else if (r.error) {
          setBrainError(r.error);
        }
      })
      .catch((e) => setBrainError(String(e)))
      .finally(() => setBrainLoading(false));
  }, [prospect]);

  const onEnrich = async () => {
    if (!prospect.linkedinUrl || enrichLoading) return;
    setEnrichLoading(true);
    setEnrichError(null);
    try {
      const r = await window.pmf.hog.enrich(prospect.linkedinUrl);
      if (r.ok) {
        const result = r.result as Record<string, unknown>;
        ENRICH_CACHE.set(prospect.slug, result);
        setEnrichment(result);
      } else {
        setEnrichError(r.error ?? 'unknown HOG error');
      }
    } catch (e) {
      setEnrichError(String(e));
    } finally {
      setEnrichLoading(false);
    }
  };

  const onDraft = async () => {
    setDraftLoading(true);
    setDraftError(null);
    setDraftText(null);
    try {
      const r = (await window.pmf.anthropic.chat(
        DRAFT_SYSTEM,
        DRAFT_USER_TEMPLATE({
          prospect,
          enrichment: enrichment ?? undefined,
          brainSnippets: brainCitations.map((c) => c.chunk_text),
        }),
      )) as { ok: boolean; text?: string; error?: string };
      if (!r.ok) setDraftError(r.error ?? 'unknown Anthropic error');
      else setDraftText(r.text ?? '');
    } catch (e) {
      setDraftError(String(e));
    } finally {
      setDraftLoading(false);
    }
  };

  const enrichmentName = pickString(enrichment ?? undefined, ['name', 'full_name', 'fullName']);
  const enrichmentTitle = pickString(enrichment ?? undefined, ['title', 'headline', 'job_title']);
  const enrichmentCompany = pickString(enrichment ?? undefined, ['company', 'organization']);
  const enrichmentEmail = pickString(enrichment ?? undefined, ['email']);

  return (
    <div className="account-detail card">
      <header className="account-detail__head">
        <div>
          <div className="account-detail__name">{prospect.name}</div>
          <div className="account-detail__company">{prospect.company}</div>
        </div>
        <span className={`account-detail__status account-detail__status--${prospect.status}`}>
          {prospect.status.toUpperCase()}
        </span>
      </header>

      <div className="account-detail__signal">{prospect.signal}</div>

      <section className="account-detail__section">
        <div className="account-detail__section-title">
          Brain context · past calls
          {brainCitations.length > 0 && (
            <span className="account-detail__cite-count"> · {brainCitations.length} from your brain</span>
          )}
        </div>
        {brainLoading && <div className="account-detail__loading">Querying gbrain…</div>}
        {brainError && <div className="account-detail__error">⚠️ gbrain: {brainError}</div>}
        {!brainLoading && !brainError && brainCitations.length === 0 && (
          <div className="account-detail__loading">No prior snippets found.</div>
        )}
        {brainCitations.length > 0 && (
          <ul className="account-detail__citations">
            {brainCitations.map((c, i) => (
              <li key={`${c.slug}-${i}`} className="account-detail__cite">
                <div className="account-detail__cite-head">
                  <span className="account-detail__cite-index">[{i + 1}]</span>
                  <span className="account-detail__cite-title">
                    {c.title ?? humanizeSlug(c.slug) ?? 'past call'}
                  </span>
                </div>
                <div className="account-detail__cite-text">"{c.chunk_text}"</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(prospect.linkedinUrl || enrichment) && (
        <section className="account-detail__section">
          <div className="account-detail__section-title">HOG enrichment</div>
          {!enrichment && !enrichError && (
            <button
              onClick={onEnrich}
              disabled={enrichLoading || !prospect.linkedinUrl}
              className="btn btn--sm"
            >
              {enrichLoading ? 'Enriching via HOG…' : 'Enrich via HOG (uses credits)'}
            </button>
          )}
          {enrichError && <div className="account-detail__error">⚠️ HOG: {enrichError}</div>}
          {enrichment && (
            <dl className="account-detail__enrich">
              <dt>Name</dt><dd>{enrichmentName ?? '—'}</dd>
              <dt>Title</dt><dd>{enrichmentTitle ?? '—'}</dd>
              <dt>Company</dt><dd>{enrichmentCompany ?? '—'}</dd>
              <dt>Email</dt><dd>{enrichmentEmail ?? '—'}</dd>
            </dl>
          )}
        </section>
      )}

      <section className="account-detail__section">
        <button onClick={onDraft} disabled={draftLoading} className="btn btn--primary">
          {draftLoading ? 'Drafting via Claude Sonnet…' : 'Draft outreach DM'}
        </button>

        {draftError && <div className="account-detail__error">⚠️ Anthropic: {draftError}</div>}

        {draftText && (
          <div className="account-detail__draft">
            <div className="account-detail__section-title">Draft (grounded in brain context)</div>
            <pre className="account-detail__draft-text">{draftText}</pre>
            <div className="account-detail__draft-actions">
              <button onClick={() => navigator.clipboard?.writeText(draftText)} className="btn btn--sm">
                Copy
              </button>
              <button onClick={onDraft} className="btn btn--sm btn--ghost">
                Regenerate
              </button>
            </div>
          </div>
        )}
      </section>

      {onFindMore && (
        <footer className="account-detail__find-more">
          <button onClick={onFindMore} className="account-detail__find-more-link">
            Find more prospects to demo with →
          </button>
          <span className="account-detail__find-more-hint">
            Search the same ICP as {prospect.name}
          </span>
        </footer>
      )}
    </div>
  );
}
