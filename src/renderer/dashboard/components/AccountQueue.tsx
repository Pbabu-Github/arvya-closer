/**
 * AccountQueue — populates the dashboard left rail with real prospects from past
 * meeting notes. Each row: name, last-touch date, status dot, signal one-liner.
 * Click a row to make it the active account; parent owns selection state.
 */

import { useEffect, useState } from 'react';

type Prospect = {
  slug: string;
  name: string;
  company: string;
  title?: string;
  linkedinUrl?: string;
  lastCallIso: string;
  status: 'hot' | 'stalled' | 'cold' | 'new';
  signal: string;
};

type Props = {
  selectedSlug: string | null;
  onSelect: (prospect: Prospect) => void;
};

function relativeDays(iso: string): string {
  const then = new Date(iso + 'T00:00:00').getTime();
  const days = Math.max(0, Math.round((Date.now() - then) / 86_400_000));
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 14) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  return `${weeks}w ago`;
}

export function AccountQueue({ selectedSlug, onSelect }: Props) {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.pmf?.prospects) return;
    let cancelled = false;
    window.pmf.prospects
      .list()
      .then((r) => {
        if (cancelled) return;
        if (r.ok && r.prospects) {
          setProspects(r.prospects);
          // Auto-select first prospect so the center pane is never empty
          if (r.prospects.length > 0 && !selectedSlug) {
            onSelect(r.prospects[0]);
          }
        } else {
          setError(r.error ?? 'prospects list failed');
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
    // intentionally exclude selectedSlug/onSelect so auto-select fires once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="account-queue">
      <div className="rail__title">Account Queue · {prospects.length}</div>

      {error && <div className="account-queue__error">⚠️ {error}</div>}

      {prospects.length === 0 && !error && (
        <div className="rail__placeholder">Loading prior conversations…</div>
      )}

      <ul className="account-queue__list">
        {prospects.map((p) => (
          <li
            key={p.slug}
            className={`account-queue__row ${selectedSlug === p.slug ? 'account-queue__row--active' : ''}`}
            onClick={() => onSelect(p)}
          >
            <div className="account-queue__head">
              <span className={`account-queue__dot account-queue__dot--${p.status}`} />
              <span className="account-queue__name">{p.name}</span>
              <span className="account-queue__when">{relativeDays(p.lastCallIso)}</span>
            </div>
            <div className="account-queue__company">{p.company}</div>
            <div className="account-queue__signal">{p.signal}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type { Prospect };
