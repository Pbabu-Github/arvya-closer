#!/usr/bin/env bun
/**
 * scripts/seed-brain.ts
 *
 * Walks a list of source paths and seeds gbrain with everything Arvya knows.
 * Owned by lane/brain (Naveen). Default source list points at the known
 * local Arvya content; pass --add <path> to include the Google Drive download.
 *
 * Usage:
 *   bun run scripts/seed-brain.ts                  # default sources
 *   bun run scripts/seed-brain.ts --add ~/Desktop/arvya-drive-seed
 *   bun run scripts/seed-brain.ts --dry-run        # see what would happen
 *
 * What it does:
 *   1. Walks each source path, classifies files by extension
 *   2. .txt/.md → copy into inbox
 *   3. .pdf → pdftotext → .txt
 *   4. .m4a/.mp3/.mp4/.wav → Groq Whisper batch → .txt
 *   5. .docx → textutil -convert txt
 *   6. gbrain sync + embed + dream --phase extract over the inbox
 *   7. Print final gbrain stats
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, statSync, mkdirSync, copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, basename, extname, resolve } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();
const INBOX = `${HOME}/Desktop/arvya-brain-seed/inbox`;

// ───────────────────────────────────────────────────────────────────────
// Default sources — local arvya content on this Mac.
// Add the Drive download via --add <path>.
// ───────────────────────────────────────────────────────────────────────
const DEFAULT_SOURCES = [
  `${HOME}/Desktop/arvya-meeting-notes`,
  `${HOME}/Desktop/Union square advisors | arvya.txt`,
  `${HOME}/Desktop/shakya_x_arvya.txt`,
  `${HOME}/Desktop/sumit_x_arvya.txt`,
  `${HOME}/Desktop/Selvam-Arvya.transcript.txt`,
  `${HOME}/Desktop/arvya X tyton.md`,
  `${HOME}/Desktop/Arvya Data Security Pack — Update Briefing for Claude.md`,
  `${HOME}/Downloads/arvya - decks`,
  `${HOME}/Desktop/arvya_videos`,
];

type Args = { dryRun: boolean; add: string[] };

function parseArgs(argv: string[]): Args {
  const out: Args = { dryRun: false, add: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') out.dryRun = true;
    else if (argv[i] === '--add' && argv[i + 1]) {
      out.add.push(resolve(argv[++i]));
    }
  }
  return out;
}

type FileEntry = { path: string; kind: 'text' | 'pdf' | 'audio' | 'docx' | 'skip'; reason?: string };

function classify(path: string): FileEntry {
  const ext = extname(path).toLowerCase();
  if (['.txt', '.md'].includes(ext)) return { path, kind: 'text' };
  if (ext === '.pdf') return { path, kind: 'pdf' };
  if (['.m4a', '.mp3', '.mp4', '.wav', '.mov'].includes(ext)) return { path, kind: 'audio' };
  if (ext === '.docx') return { path, kind: 'docx' };
  if (ext === '.gdoc') return { path, kind: 'skip', reason: 'Drive shortcut stub — no local content' };
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'].includes(ext)) {
    return { path, kind: 'skip', reason: 'image — skip for hackathon' };
  }
  return { path, kind: 'skip', reason: `unsupported extension ${ext}` };
}

function walk(root: string): FileEntry[] {
  const out: FileEntry[] = [];
  if (!existsSync(root)) return out;
  const stat = statSync(root);
  if (stat.isFile()) return [classify(root)];

  const entries = readdirSync(root, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const p = join(root, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile()) {
      const st = statSync(p);
      if (st.size > 50 * 1024 * 1024) {
        out.push({ path: p, kind: 'skip', reason: `>50MB (size: ${(st.size / 1024 / 1024).toFixed(1)}MB)` });
      } else {
        out.push(classify(p));
      }
    }
  }
  return out;
}

function slugify(s: string): string {
  return s.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
}

async function transcribeAudio(path: string): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY missing — set in .env');

  const fd = new FormData();
  fd.append('file', new Blob([await Bun.file(path).arrayBuffer()]), basename(path));
  fd.append('model', 'whisper-large-v3');
  fd.append('response_format', 'text');

  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  });
  if (!r.ok) {
    console.error(`  ⚠️  Groq Whisper failed for ${basename(path)}: ${r.status} ${await r.text()}`);
    return null;
  }
  return await r.text();
}

function pdfToText(path: string): string | null {
  const r = spawnSync('pdftotext', ['-layout', path, '-'], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`  ⚠️  pdftotext failed for ${basename(path)} (install: brew install poppler)`);
    return null;
  }
  return r.stdout;
}

function docxToText(path: string): string | null {
  const r = spawnSync('textutil', ['-convert', 'txt', '-stdout', path], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`  ⚠️  textutil failed for ${basename(path)}`);
    return null;
  }
  return r.stdout;
}

async function processOne(entry: FileEntry, dryRun: boolean): Promise<string | null> {
  const { path, kind } = entry;
  const base = slugify(basename(path, extname(path)));
  const outPath = `${INBOX}/${base}.md`;

  if (dryRun) {
    console.log(`  [dry] ${kind.padEnd(5)} ${path}`);
    return null;
  }

  let body: string | null = null;
  switch (kind) {
    case 'text':
      copyFileSync(path, outPath);
      console.log(`  ✓ text  ${basename(path)}`);
      return outPath;
    case 'pdf':
      body = pdfToText(path);
      break;
    case 'audio':
      console.log(`  · audio ${basename(path)} (transcribing via Groq Whisper)...`);
      body = await transcribeAudio(path);
      break;
    case 'docx':
      body = docxToText(path);
      break;
    case 'skip':
      console.log(`  - skip  ${basename(path)} (${entry.reason})`);
      return null;
  }

  if (body && body.trim().length > 0) {
    const frontmatter = `---\ntitle: ${basename(path, extname(path))}\nsource_path: ${path}\ningest_kind: ${kind}\n---\n\n`;
    writeFileSync(outPath, frontmatter + body);
    console.log(`  ✓ ${kind.padEnd(5)} ${basename(path)} → ${basename(outPath)}`);
    return outPath;
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sources = [...DEFAULT_SOURCES, ...args.add];

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Arvya Brain Seed');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`Inbox: ${INBOX}`);
  console.log(`Mode:  ${args.dryRun ? 'DRY RUN' : 'INGEST'}`);
  console.log(`Sources: ${sources.length}`);

  if (!args.dryRun) mkdirSync(INBOX, { recursive: true });

  let allFiles: FileEntry[] = [];
  for (const src of sources) {
    if (!existsSync(src)) {
      console.log(`  ⚠️  missing: ${src}`);
      continue;
    }
    const files = walk(src);
    console.log(`  ${src} → ${files.length} files`);
    allFiles.push(...files);
  }

  const counts = { text: 0, pdf: 0, audio: 0, docx: 0, skip: 0 };
  for (const f of allFiles) counts[f.kind]++;
  console.log(`\nClassification: text=${counts.text} pdf=${counts.pdf} audio=${counts.audio} docx=${counts.docx} skip=${counts.skip}`);

  if (args.dryRun) {
    console.log('\nDry run — no changes made. Run without --dry-run to ingest.');
    return;
  }

  console.log(`\nProcessing ${allFiles.length - counts.skip} files into ${INBOX}...\n`);

  // Audio in serial (one Groq Whisper call at a time to be safe with rate limits)
  // Text/pdf/docx in parallel
  for (const f of allFiles) {
    if (f.kind === 'audio') await processOne(f, false);
  }
  await Promise.all(allFiles.filter((f) => f.kind !== 'audio' && f.kind !== 'skip').map((f) => processOne(f, false)));

  console.log('\nNow seeding gbrain:');
  console.log(`  cd ${INBOX}/..`);
  console.log(`  gbrain sync --dir inbox`);
  console.log(`  gbrain embed --stale`);
  console.log(`  gbrain dream --phase extract`);
  console.log('\nThen verify:');
  console.log(`  gbrain query "what are Arvya's most common buyer objections?"`);
  console.log(`  gbrain stats`);
  console.log('\nDone.');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
