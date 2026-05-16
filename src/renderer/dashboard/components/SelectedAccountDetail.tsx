/**
 * SelectedAccountDetail — replaces OutreachTestPanel as the dashboard center pane.
 * Takes a Prospect prop, auto-fetches brain context + (optional) HOG enrichment,
 * surfaces "Draft outreach DM" grounded in the brain snippets.
 *
 * No URL input — the prospect was selected from the Account Queue, so we know who
 * they are. Manual paste lives behind a tiny "+ Add prospect" affordance handled
 * separately by the parent.
 */

import { useEffect, useRef, useState } from 'react';
import type { Prospect } from './AccountQueue';

type Props = {
  prospect: Prospect;
};

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

function extractTopSnippets(raw: unknown, max: number): string[] {
  let arr: Array<{ chunk_text?: string }> = [];
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
      arr = raw as Array<{ chunk_text?: string }>;
    }
  } catch {
    /* ignore */
  }
  return arr
    .slice(0, max)
    .map((r) => (r.chunk_text ?? '').slice(0, 240).replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0);
}

export function SelectedAccountDetail({ prospect }: Props) {
  const [brainSnippets, setBrainSnippets] = useState<string[]>([]);
  const [brainLoading, setBrainLoading] = useState(false);
  const [brainError, setBrainError] = useState<string | null>(null);

  const [enrichment, setEnrichment] = useState<Record<string, unknown> | null>(null);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  const [draftText, setDraftText] = useState<string | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  // Reset everything and refetch whenever the selected prospect changes
  const lastSlugRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastSlugRef.current === prospect.slug) return;
    lastSlugRef.current = prospect.slug;

    setBrainSnippets([]);
    setBrainError(null);
    setEnrichment(null);
    setEnrichError(null);
    setDraftText(null);
    setDraftError(null);

    if (typeof window === 'undefined' || !window.pmf) return;

    // Brain context — always
    setBrainLoading(true);
    window.pmf.gbrain
      .search(`${prospect.name} ${prospect.company}`)
      .then((r) => {
        if (r.ok && r.result) {
          setBrainSnippets(extractTopSnippets(r.result, 3));
        } else if (r.error) {
          setBrainError(r.error);
        }
      })
      .catch((e) => setBrainError(String(e)))
      .finally(() => setBrainLoading(false));

    // HOG enrichment — only if we have a LinkedIn URL
    if (prospect.linkedinUrl) {
      window.pmf.hog
        .enrich(prospect.linkedinUrl)
        .then((r) => {
          if (r.ok) setEnrichment(r.result as Record<string, unknown>);
          else setEnrichError(r.error ?? 'unknown HOG error');
        })
        .catch((e) => setEnrichError(String(e)));
    }
  }, [prospect]);

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
          brainSnippets,
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
    <div className="selected-account">
      <header className="selected-account__head">
        <div>
          <div className="selected-account__name">{prospect.name}</div>
          <div className="selected-account__company">{prospect.company}</div>
        </div>
        <span className={`selected-account__status selected-account__status--${prospect.status}`}>
          {prospect.status.toUpperCase()}
        </span>
      </header>

      <div className="selected-account__signal">{prospect.signal}</div>

      <section className="selected-account__section">
        <div className="selected-account__section-title">Brain context · past calls</div>
        {brainLoading && <div className="selected-account__loading">Querying gbrain…</div>}
        {brainError && <div className="selected-account__error">⚠️ gbrain: {brainError}</div>}
        {!brainLoading && !brainError && brainSnippets.length === 0 && (
          <div className="selected-account__loading">No prior snippets found.</div>
        )}
        {brainSnippets.length > 0 && (
          <ul className="selected-account__snippets">
            {brainSnippets.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        )}
      </section>

      {(prospect.linkedinUrl || enrichment) && (
        <section className="selected-account__section">
          <div className="selected-account__section-title">HOG enrichment</div>
          {enrichError && <div className="selected-account__error">⚠️ HOG: {enrichError}</div>}
          {enrichment && (
            <dl className="selected-account__enrich">
              <dt>Name</dt><dd>{enrichmentName ?? '—'}</dd>
              <dt>Title</dt><dd>{enrichmentTitle ?? '—'}</dd>
              <dt>Company</dt><dd>{enrichmentCompany ?? '—'}</dd>
              <dt>Email</dt><dd>{enrichmentEmail ?? '—'}</dd>
            </dl>
          )}
        </section>
      )}

      <section className="selected-account__section">
        <button onClick={onDraft} disabled={draftLoading} className="btn btn--primary">
          {draftLoading ? 'Drafting via Claude Sonnet…' : 'Draft outreach DM'}
        </button>

        {draftError && <div className="selected-account__error">⚠️ Anthropic: {draftError}</div>}

        {draftText && (
          <div className="selected-account__draft">
            <div className="selected-account__section-title">Draft (grounded in brain context)</div>
            <pre className="selected-account__draft-text">{draftText}</pre>
            <div className="selected-account__draft-actions">
              <button onClick={() => navigator.clipboard?.writeText(draftText)} className="btn btn--ghost">
                Copy
              </button>
              <button onClick={onDraft} className="btn btn--ghost">
                Regenerate
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
