/**
 * BrainSeedPanel — the "Seed Brain" surface in the dashboard.
 *
 * Owned by lane/brain (Naveen). UI shell in this file; the IPC handlers
 * `pmf:brain:seed` and `pmf:brain:stats` live in electron/main/index.ts.
 *
 * What it shows:
 *   - Live stats: pages indexed, last sync (animated count-up on load)
 *   - Source paths (the Tier 1 local sources are pre-filled; user can add Drive path)
 *   - "Seed Brain" button: kicks off scripts/seed-brain.ts via IPC
 *   - Progress strip: current file, % done, error count
 *   - Verify section: 3 sample queries that prove the brain has Arvya context
 */

import { useEffect, useState } from 'react';
import type { PMFApi } from '../../../../electron/preload';

declare global {
  interface Window {
    pmf: PMFApi;
  }
}

const DEFAULT_SOURCES = [
  '~/Desktop/arvya-meeting-notes',
  '~/Desktop/Union square advisors | arvya.txt',
  '~/Desktop/shakya_x_arvya.txt',
  '~/Desktop/sumit_x_arvya.txt',
  '~/Desktop/Arvya Data Security Pack — Update Briefing for Claude.md',
  '~/Downloads/arvya - decks',
  '~/Desktop/arvya_videos',
];

type Stats = { pages: number; chunks: number; last_sync: string | null; entities: number };
type Progress = { file: string; current: number; total: number; kind: string };

export function BrainSeedPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [extraPath, setExtraPath] = useState('');
  const [extraPaths, setExtraPaths] = useState<string[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Poll stats every 5s while the panel is mounted
  useEffect(() => {
    let cancelled = false;
    const fetchStats = async () => {
      try {
        const r = (await window.pmf.brain.stats()) as { ok: boolean; pages?: number; chunks?: number; last_sync?: string; entities?: number; error?: string };
        if (!cancelled && r.ok) {
          setStats({ pages: r.pages ?? 0, chunks: r.chunks ?? 0, last_sync: r.last_sync ?? null, entities: r.entities ?? 0 });
        }
      } catch {
        // ignore — backend not wired yet
      }
    };
    fetchStats();
    const id = setInterval(fetchStats, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Subscribe to progress events
  useEffect(() => {
    const unsub = window.pmf.brain.onProgress((p) => setProgress(p));
    return () => unsub();
  }, []);

  const onSeed = async () => {
    setSeeding(true);
    setError(null);
    try {
      const r = (await window.pmf.brain.seed(extraPaths)) as { ok: boolean; error?: string };
      if (!r.ok) setError(r.error ?? 'unknown error');
    } catch (e) {
      setError(String(e));
    } finally {
      setSeeding(false);
    }
  };

  const onAddPath = () => {
    if (extraPath.trim()) {
      setExtraPaths([...extraPaths, extraPath.trim()]);
      setExtraPath('');
    }
  };

  return (
    <div className="brain-seed-panel">
      <div className="brain-seed-panel__header">
        <span className="brain-seed-panel__title">Brain</span>
        <span className="brain-seed-panel__stats">
          {stats ? (
            <>
              <strong>{stats.pages}</strong> pages · <strong>{stats.entities}</strong> entities
            </>
          ) : (
            <em>not connected</em>
          )}
        </span>
      </div>

      <div className="brain-seed-panel__sources">
        <div className="brain-seed-panel__section-title">Default sources (this Mac)</div>
        <ul className="brain-seed-panel__source-list">
          {DEFAULT_SOURCES.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>

        <div className="brain-seed-panel__section-title">Add more (e.g. Drive download path)</div>
        <div className="brain-seed-panel__add">
          <input
            value={extraPath}
            onChange={(e) => setExtraPath(e.target.value)}
            placeholder="~/Desktop/arvya-drive-seed"
            className="brain-seed-panel__input"
          />
          <button onClick={onAddPath} className="btn btn--ghost">+ add</button>
        </div>
        {extraPaths.length > 0 && (
          <ul className="brain-seed-panel__source-list">
            {extraPaths.map((p) => (
              <li key={p}>+ {p}</li>
            ))}
          </ul>
        )}
      </div>

      <button onClick={onSeed} disabled={seeding} className="btn btn--primary brain-seed-panel__button">
        {seeding ? 'Seeding…' : 'Seed Brain'}
      </button>

      {progress && (
        <div className="brain-seed-panel__progress">
          <div className="brain-seed-panel__progress-label">
            {progress.kind} · {progress.current}/{progress.total}
          </div>
          <div className="brain-seed-panel__progress-bar">
            <div
              className="brain-seed-panel__progress-fill"
              style={{ width: `${(progress.current / Math.max(1, progress.total)) * 100}%` }}
            />
          </div>
          <div className="brain-seed-panel__progress-file">{progress.file}</div>
        </div>
      )}

      {error && <div className="brain-seed-panel__error">⚠️ {error}</div>}

      <div className="brain-seed-panel__verify">
        <div className="brain-seed-panel__section-title">Verify (after seed)</div>
        <ul className="brain-seed-panel__verify-list">
          <li>"What are Arvya's most common buyer objections?"</li>
          <li>"What is Arvya's positioning vs Affinity?"</li>
          <li>"Who is Naveen SB?"</li>
        </ul>
        <p className="brain-seed-panel__verify-note">
          Run via `gbrain query …` in a terminal. If grounded answers appear, the brain is seeded.
        </p>
      </div>
    </div>
  );
}
