/**
 * OutreachTestPanel — paste a LinkedIn URL → see HOG enrichment + GBrain context
 * + Anthropic-drafted outreach message all in one place. Demo's beat 2 in compact form.
 *
 * Lives in the dashboard center pane (replaces the empty "Selected Account" placeholder
 * when an account is selected — for now it's always shown as a quick-test surface).
 */

import { useState } from 'react';
// window.pmf types live in src/renderer/pmf-api.d.ts

type EnrichResult = {
  name?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  raw?: unknown;
};

const PROMPT_TEMPLATE = `You are drafting a cold outreach DM for Arvya — an AI execution + intelligence platform
for investment-banking and PE deal teams, built inside Outlook. Arvya drafts emails, schedules
meetings, updates buyer trackers, and builds a per-deal memory ("Deal Brain") that lasts
across analysts.

Past customer pains we've heard (use these as proof points when relevant):
- "Our CRM is stale because everyone works out of Outlook"
- "We use DealCloud, not Salesforce — schema-driven is critical"
- "Buyer tracker in Excel is never accurate"
- "Security review takes 6 weeks — needs all-in-tenant Azure"
- "Manual update of weekly buyer status takes 5+ hours / analyst / week"

Write a 3-line LinkedIn DM to the prospect below. ONE sentence per line.
- Line 1: hook tied to their role / firm / a specific Arvya pain
- Line 2: what Arvya does (one concrete capability, not a vague pitch)
- Line 3: ask for a 15-min call

No greeting. No sign-off. Plain text, no markdown. Under 90 words total.

Prospect:`;

export function OutreachTestPanel() {
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [enrichResult, setEnrichResult] = useState<EnrichResult | null>(null);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  const [draftLoading, setDraftLoading] = useState(false);
  const [draftText, setDraftText] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  const [brainSnippets, setBrainSnippets] = useState<string[]>([]);

  const onEnrich = async () => {
    if (!linkedinUrl.trim()) return;
    setEnrichLoading(true);
    setEnrichError(null);
    setEnrichResult(null);
    setDraftText(null);
    try {
      const r = (await window.pmf.hog.enrich(linkedinUrl.trim())) as { ok: boolean; result?: unknown; error?: string };
      if (!r.ok) {
        setEnrichError(r.error ?? 'unknown HOG error');
      } else {
        // The HOG enrichment shape is loose — try several keys to surface what we got
        const raw = r.result as Record<string, unknown> | undefined;
        const merged: EnrichResult = {
          name: pickString(raw, ['name', 'full_name', 'fullName']),
          title: pickString(raw, ['title', 'job_title', 'role']),
          company: pickString(raw, ['company', 'organization', 'company_name']),
          email: pickString(raw, ['email', 'contact.email']),
          phone: pickString(raw, ['phone', 'contact.phone']),
          linkedinUrl: linkedinUrl.trim(),
          raw,
        };
        setEnrichResult(merged);

        // Pull a couple of brain snippets that match the company name or title
        try {
          const queryText = `${merged.company ?? ''} ${merged.title ?? ''}`.trim();
          if (queryText.length > 1) {
            const s = (await window.pmf.gbrain.search(queryText)) as { ok: boolean; result?: unknown };
            if (s.ok && s.result) {
              setBrainSnippets(extractTopSnippets(s.result, 3));
            }
          }
        } catch {
          // brain failure is non-fatal — outreach can still draft from HOG context alone
        }
      }
    } catch (e) {
      setEnrichError(String(e));
    } finally {
      setEnrichLoading(false);
    }
  };

  const onDraft = async () => {
    if (!enrichResult) return;
    setDraftLoading(true);
    setDraftError(null);
    try {
      const prospectBlock = [
        enrichResult.name && `Name: ${enrichResult.name}`,
        enrichResult.title && `Title: ${enrichResult.title}`,
        enrichResult.company && `Company: ${enrichResult.company}`,
        enrichResult.linkedinUrl && `LinkedIn: ${enrichResult.linkedinUrl}`,
        brainSnippets.length > 0 && `\n\nRelevant from our brain (past notes / calls / docs):\n${brainSnippets.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
      ]
        .filter(Boolean)
        .join('\n');

      const r = (await window.pmf.anthropic.chat(
        'You write concise, founder-voiced outreach DMs. No greeting, no signoff, three short lines.',
        `${PROMPT_TEMPLATE}\n${prospectBlock}`,
      )) as { ok: boolean; text?: string; error?: string };

      if (!r.ok) {
        setDraftError(r.error ?? 'unknown Anthropic error');
      } else {
        setDraftText(r.text ?? '');
      }
    } catch (e) {
      setDraftError(String(e));
    } finally {
      setDraftLoading(false);
    }
  };

  return (
    <div className="outreach-test">
      <div className="outreach-test__title">Find people · Draft outreach</div>
      <div className="outreach-test__row">
        <input
          className="outreach-test__input"
          placeholder="https://www.linkedin.com/in/<handle>"
          value={linkedinUrl}
          onChange={(e) => setLinkedinUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !enrichLoading) onEnrich();
          }}
        />
        <button onClick={onEnrich} disabled={enrichLoading || !linkedinUrl.trim()} className="btn btn--primary">
          {enrichLoading ? 'Enriching…' : 'Find via HOG'}
        </button>
      </div>

      {enrichError && <div className="outreach-test__error">⚠️ HOG: {enrichError}</div>}

      {enrichResult && (
        <div className="outreach-test__card">
          <div className="outreach-test__field"><strong>Name:</strong> {enrichResult.name ?? '—'}</div>
          <div className="outreach-test__field"><strong>Title:</strong> {enrichResult.title ?? '—'}</div>
          <div className="outreach-test__field"><strong>Company:</strong> {enrichResult.company ?? '—'}</div>
          <div className="outreach-test__field"><strong>Email:</strong> {enrichResult.email ?? '—'}</div>
          <div className="outreach-test__field"><strong>Phone:</strong> {enrichResult.phone ?? '—'}</div>

          {brainSnippets.length > 0 && (
            <div className="outreach-test__brain">
              <div className="outreach-test__section-title">Brain context · {brainSnippets.length} hits</div>
              <ul className="outreach-test__brain-list">
                {brainSnippets.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          <button onClick={onDraft} disabled={draftLoading} className="btn btn--primary outreach-test__draft-btn">
            {draftLoading ? 'Drafting via Claude Sonnet…' : 'Draft outreach DM'}
          </button>

          {draftError && <div className="outreach-test__error">⚠️ Anthropic: {draftError}</div>}

          {draftText && (
            <div className="outreach-test__draft">
              <div className="outreach-test__section-title">Drafted DM (Anthropic + brain context)</div>
              <pre className="outreach-test__draft-text">{draftText}</pre>
              <div className="outreach-test__draft-actions">
                <button onClick={() => navigator.clipboard?.writeText(draftText)} className="btn btn--ghost">
                  Copy
                </button>
                <button onClick={onDraft} className="btn btn--ghost">
                  Regenerate
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function pickString(raw: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!raw) return undefined;
  for (const k of keys) {
    const parts = k.split('.');
    let cur: unknown = raw;
    for (const p of parts) {
      if (cur && typeof cur === 'object' && p in (cur as object)) {
        cur = (cur as Record<string, unknown>)[p];
      } else {
        cur = undefined;
        break;
      }
    }
    if (typeof cur === 'string' && cur.trim()) return cur.trim();
  }
  return undefined;
}

function extractTopSnippets(raw: unknown, max: number): string[] {
  // gbrain MCP returns { content: [{type:'text', text: '<JSON array string>'}] }
  // or sometimes already parsed. Be defensive.
  let arr: Array<{ chunk_text?: string; title?: string }> = [];
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
      arr = raw as Array<{ chunk_text?: string; title?: string }>;
    }
  } catch {
    // ignore
  }
  return arr
    .slice(0, max)
    .map((r) => (r.chunk_text ?? '').slice(0, 240).replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0);
}
