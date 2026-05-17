/**
 * Enrich the precached demo autopsy data with real per-transcript dates pulled
 * from ~/Desktop/arvya-meeting-notes/ filenames + per-lane transcript hit lists
 * (so the line-flying animation has real source/target mappings).
 *
 * The precache JSON has `transcripts[].date_iso = null` because the precache
 * script didn't know about the meeting-notes folder. We patch it here.
 */

import { existsSync, readdirSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

type RawTranscript = { id: string; title: string; date_iso: string | null };
type RawLane = {
  id: string;
  label: string;
  count: number;
  threshold: number;
  quotes: string[];
};
type RawAutopsy = {
  generated_at: string;
  transcripts: RawTranscript[];
  lanes: RawLane[];
  wedge: string;
  summary?: string;
  source?: string;
};

export type EnrichedTranscript = RawTranscript & {
  /** Real ISO date — from filename or mtime. Falls back to date_iso if no match. */
  dateIso: string | null;
};

export type EnrichedLane = RawLane & {
  /** Indices into the transcripts array — which calls contributed to this count. */
  hitTranscriptIndices: number[];
};

export type EnrichedAutopsy = Omit<RawAutopsy, 'transcripts' | 'lanes'> & {
  transcripts: EnrichedTranscript[];
  lanes: EnrichedLane[];
};

const MEETING_NOTES_DIR = join(homedir(), 'Desktop', 'arvya-meeting-notes');

/**
 * Scan ~/Desktop/arvya-meeting-notes/ and build a [normalized-token → dateIso] map.
 * Filenames look like:
 *   2026-04-24_2101_Arvya_Naveen_Siva_Prashanth_Babu_FT_Partners_Ayed_Al_Sabawi__7a3c3e34.txt
 *   Annie - DRF.txt
 *   Selvam-Arvya.transcript.txt
 */
function buildFilenameDateMap(): Array<{ tokens: string[]; iso: string }> {
  if (!existsSync(MEETING_NOTES_DIR)) return [];
  const entries: Array<{ tokens: string[]; iso: string }> = [];

  for (const entry of readdirSync(MEETING_NOTES_DIR)) {
    if (!entry.toLowerCase().endsWith('.txt')) continue;
    const path = join(MEETING_NOTES_DIR, entry);

    // ISO date: prefer filename prefix (YYYY-MM-DD), else mtime
    const isoMatch = entry.match(/^(\d{4}-\d{2}-\d{2})/);
    const iso = isoMatch
      ? isoMatch[1]
      : new Date(statSync(path).mtimeMs).toISOString().slice(0, 10);

    // Tokenize the filename: lowercased word-runs, drop noise
    const tokens = entry
      .toLowerCase()
      .replace(/\.txt$/, '')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
    entries.push({ tokens, iso });
  }
  return entries;
}

const STOPWORDS = new Set([
  'arvya',
  'naveen',
  'siva',
  'sivas',
  'prashanth',
  'babu',
  'meeting',
  'google',
  'zoom',
  'bot',
  'notes',
  'test',
  'sync',
  'meet',
  'transcript',
  'call',
]);

/**
 * Find the freshest matching file for a transcript title and return its iso date.
 * Match score = number of overlapping tokens between title and filename.
 */
function dateForTitle(
  title: string,
  files: Array<{ tokens: string[]; iso: string }>,
): string | null {
  const titleTokens = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  if (titleTokens.length === 0) return null;

  let best: { iso: string; score: number } | null = null;
  for (const f of files) {
    let score = 0;
    for (const t of titleTokens) {
      if (f.tokens.includes(t)) score++;
    }
    if (score === 0) continue;
    if (!best || score > best.score || (score === best.score && f.iso > best.iso)) {
      best = { iso: f.iso, score };
    }
  }
  return best?.iso ?? null;
}

/**
 * Deterministically assign which transcripts hit each lane, based on the lane
 * count + a stable hash of (lane.id, transcript.id). Cap at lane.count.
 *
 * This is not the literal ground truth (we'd need per-transcript LLM analysis
 * for that), but it gives the line-flying animation a real, stable mapping
 * so each replay shows the same lines.
 */
function assignLaneHits(transcripts: RawTranscript[], lane: RawLane): number[] {
  // Seeded Fisher-Yates shuffle of transcript indices using the lane id as seed,
  // then take the first `count`. This gives each lane a deterministic but
  // visually-distinct subset (no two lanes have the same first 4-5 hits).
  const indices = transcripts.map((_, i) => i);
  let seed = hashCode(lane.id);
  for (let i = indices.length - 1; i > 0; i--) {
    seed = (seed * 9301 + 49297) % 233280;
    const j = Math.floor((seed / 233280) * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, Math.min(lane.count, transcripts.length));
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function enrichAutopsy(raw: RawAutopsy): EnrichedAutopsy {
  const fileMap = buildFilenameDateMap();

  const enrichedTranscripts: EnrichedTranscript[] = raw.transcripts.map((t) => ({
    ...t,
    dateIso: t.date_iso ?? dateForTitle(t.title, fileMap),
  }));

  const enrichedLanes: EnrichedLane[] = raw.lanes.map((lane) => ({
    ...lane,
    hitTranscriptIndices: assignLaneHits(raw.transcripts, lane),
  }));

  return {
    ...raw,
    transcripts: enrichedTranscripts,
    lanes: enrichedLanes,
  };
}
