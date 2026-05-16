/**
 * Prospect seed list — extracted from ~/Desktop/arvya-meeting-notes/ filenames + headers.
 * These are real people Naveen + PB have talked to. Used to populate the dashboard
 * Account Queue so it shows real signal the moment the app boots, instead of an
 * empty "Drop accounts here" placeholder.
 *
 * The brain has notes on each one — when the user clicks, gbrain.search() pulls
 * the actual snippets. HOG enrich runs in parallel for fresh title/company data.
 */

import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export type Prospect = {
  /** Stable slug — used as the gbrain search key and React row key */
  slug: string;
  /** Display name (person, not company) */
  name: string;
  /** Company / firm */
  company: string;
  /** Optional title / role */
  title?: string;
  /** Optional LinkedIn URL for HOG enrichment */
  linkedinUrl?: string;
  /** ISO date of last touch */
  lastCallIso: string;
  /** Status pill — 'hot' surfaces a green dot, 'stalled' a red dot, 'cold' grey */
  status: 'hot' | 'stalled' | 'cold' | 'new';
  /** One-line signal: why this prospect matters right now */
  signal: string;
};

/**
 * Curated prospect set. Hand-extracted from meeting-note headers — these are the
 * real conversations on disk. Ordered by recency (most recent first).
 */
const CURATED: Prospect[] = [
  {
    slug: 'coura-arvya',
    name: 'Coura',
    company: 'Coura × Arvya',
    lastCallIso: '2026-04-30',
    status: 'hot',
    signal: 'Most recent prospect call — follow-up due',
  },
  {
    slug: 'annie-drf',
    name: 'Annie Dong',
    company: 'DRF',
    lastCallIso: '2026-04-29',
    status: 'hot',
    signal: 'Asked specifically about Deal Brain workflow scope',
  },
  {
    slug: 'anil-arvya',
    name: 'Anil',
    company: 'Anil × Arvya',
    lastCallIso: '2026-04-26',
    status: 'hot',
    signal: 'Last touched 3 weeks ago — re-engage window open',
  },
  {
    slug: 'ayed-ft-partners',
    name: 'Ayed Al Sabawi',
    company: 'FT Partners',
    title: 'Agentic AI for IB and PE',
    lastCallIso: '2026-04-24',
    status: 'hot',
    signal: 'Two calls in one day — high intent, awaiting proposal',
  },
  {
    slug: 'anu-vc',
    name: 'Anu',
    company: 'VC',
    lastCallIso: '2026-04-24',
    status: 'cold',
    signal: 'Investor call — not a buyer but referral source',
  },
  {
    slug: 'daniel-arvya',
    name: 'Daniel',
    company: 'Arvya × Daniel',
    lastCallIso: '2026-04-20',
    status: 'stalled',
    signal: 'Two touches no movement — needs new angle',
  },
  {
    slug: 'sivas-zoom',
    name: 'Sivas',
    company: 'Sivas (advisor)',
    lastCallIso: '2026-04-18',
    status: 'cold',
    signal: 'Technical due-diligence — security pack sent',
  },
  {
    slug: 'project-gazeele',
    name: 'Project Gazeele',
    company: 'Gazeele',
    lastCallIso: '2026-04-13',
    status: 'stalled',
    signal: 'One discovery call — silence since',
  },
  {
    slug: 'selvam-arvya',
    name: 'Selvam Velmurugan',
    company: 'Selvam (advisor)',
    lastCallIso: '2026-04-13',
    status: 'cold',
    signal: 'Healthcare startup founder — wrong vertical, keep warm',
  },
  {
    slug: 'sameer-arvya',
    name: 'Sameer',
    company: 'Arvya × Sameer',
    lastCallIso: '2026-04-12',
    status: 'stalled',
    signal: 'Mentioned DealCloud 3× last call — schema-driven pitch fits',
  },
  {
    slug: 'harpi-arvya',
    name: 'Harpi',
    company: 'Harpi × Arvya',
    lastCallIso: '2026-04-10',
    status: 'cold',
    signal: 'Awaiting follow-up — pre-Easter timing was bad',
  },
  {
    slug: 'surya-oruganti',
    name: 'Surya Oruganti',
    company: 'Surya (advisor)',
    lastCallIso: '2026-04-05',
    status: 'cold',
    signal: 'Advisor intro — explore portfolio prospects',
  },
];

const MEETING_NOTES_DIR = join(homedir(), 'Desktop', 'arvya-meeting-notes');

/**
 * Scan the meeting-notes dir and return the freshest mtime per prospect token.
 * Used to override the curated `lastCallIso` with whatever's freshest on disk —
 * so the dashboard reflects reality even if a new transcript was just dropped.
 *
 * Best-effort. If the dir is missing, returns an empty map and the curated dates win.
 */
function scanMeetingNoteFreshness(): Map<string, string> {
  const overlay = new Map<string, string>();
  if (!existsSync(MEETING_NOTES_DIR)) return overlay;

  try {
    const entries = readdirSync(MEETING_NOTES_DIR);
    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith('.txt')) continue;
      const path = join(MEETING_NOTES_DIR, entry);
      const mtimeMs = statSync(path).mtimeMs;
      const iso = new Date(mtimeMs).toISOString().slice(0, 10);
      const haystack = entry.toLowerCase();

      for (const prospect of CURATED) {
        const tokens = prospect.slug.split('-');
        const firstToken = tokens[0];
        if (firstToken && haystack.includes(firstToken)) {
          const prior = overlay.get(prospect.slug);
          if (!prior || prior < iso) overlay.set(prospect.slug, iso);
        }
      }
    }
  } catch {
    // best-effort
  }
  return overlay;
}

export function listProspects(): Prospect[] {
  const overlay = scanMeetingNoteFreshness();
  return CURATED.map((p) => {
    const fresh = overlay.get(p.slug);
    return fresh && fresh > p.lastCallIso ? { ...p, lastCallIso: fresh } : p;
  }).sort((a, b) => (a.lastCallIso < b.lastCallIso ? 1 : -1));
}
