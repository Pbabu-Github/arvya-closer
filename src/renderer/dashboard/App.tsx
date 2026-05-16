import { useEffect, useState } from 'react';
import { BrainSeedPanel } from './components/BrainSeedPanel';
import { DemoAutopsyPanel } from './components/DemoAutopsyPanel';
import { OutreachTestPanel } from './components/OutreachTestPanel';
import { FindEventsPanel } from './components/FindEventsPanel';
import { LearningReceipt } from './components/LearningReceipt';
import { useCountUp } from '../hooks/useCountUp';
// window.pmf types live in src/renderer/pmf-api.d.ts

type View = 'home' | 'autopsy' | 'events';

export function Dashboard() {
  const [pagesIndexed, setPagesIndexed] = useState<number | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [view, setView] = useState<View>('home');
  const [receiptOpen, setReceiptOpen] = useState(false);

  // Animated count-up for Mission Scoreboard
  const animatedPages = useCountUp(pagesIndexed ?? 0, 1600);

  // Pull real stats from gbrain on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !window.pmf) return;
    let cancelled = false;
    window.pmf.brain
      .stats()
      .then((r) => {
        if (!cancelled && r.ok && typeof r.pages === 'number') {
          setPagesIndexed(r.pages);
        }
      })
      .catch(() => {
        /* gbrain unreachable — leave dash */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onOpenOverlay = async () => {
    await window.pmf.openOverlay();
    setOverlayOpen(true);
  };

  const onCloseOverlay = async () => {
    await window.pmf.hideOverlay();
    setOverlayOpen(false);
  };

  return (
    <div className="dashboard">
      {/* ---------- TITLEBAR ---------- */}
      <header className="titlebar">
        <div className="titlebar__brand">
          <span className="dot dot--accent" /> Arvya Closer
        </div>

        <div className="titlebar__spacer" />

        <div className="titlebar__search">
          <span className="titlebar__search-text">Ask the brain — DealCloud, security, buyer tracker…</span>
          <span className="kbd">⌘K</span>
        </div>

        <div className="titlebar__right">
          <div className="live-pill">
            <span className={`dot ${pagesIndexed === null ? 'dot--idle' : 'dot--ok dot--pulse'}`} />
            <span>
              <strong>{pagesIndexed === null ? '—' : animatedPages.toLocaleString()}</strong>
              {' '}
              pages · brain live
            </span>
          </div>
          {overlayOpen ? (
            <button onClick={onCloseOverlay} className="btn btn--sm">Hide Overlay</button>
          ) : (
            <button onClick={onOpenOverlay} className="btn btn--primary btn--sm">Open Live Overlay</button>
          )}
          <button onClick={() => setReceiptOpen(true)} className="btn btn--ghost btn--sm">End Call</button>
          <div className="avatar">PB</div>
        </div>
      </header>

      {/* ---------- MAIN ---------- */}
      <main className={`dashboard__main ${view === 'autopsy' ? 'dashboard__main--autopsy' : ''}`}>
        {view === 'autopsy' ? (
          <DemoAutopsyPanel onClose={() => setView('home')} />
        ) : (
          <>
            {/* SIDEBAR */}
            <aside className="sidebar">
              <div className="sidebar__section">Workspace</div>
              <button
                className={`nav-item ${view === 'home' ? 'nav-item--active' : ''}`}
                onClick={() => setView('home')}
              >
                <span className="nav-item__icon">⌂</span>
                <span className="nav-item__label">Home</span>
                <span className="nav-item__shortcut">⌘1</span>
              </button>
              <button
                className={`nav-item ${view === 'events' ? 'nav-item--active' : ''}`}
                onClick={() => setView('events')}
              >
                <span className="nav-item__icon">◎</span>
                <span className="nav-item__label">Find events</span>
                <span className="nav-item__shortcut">⌘2</span>
              </button>
              <button className="nav-item" onClick={() => setView('autopsy')}>
                <span className="nav-item__icon">◧</span>
                <span className="nav-item__label">Demo autopsy</span>
                <span className="nav-item__count">15</span>
              </button>

              <div className="sidebar__section">Pipeline</div>
              <button className="nav-item">
                <span className="nav-item__icon">→</span>
                <span className="nav-item__label">Outreach drafts</span>
                <span className="nav-item__count">0</span>
              </button>
              <button className="nav-item">
                <span className="nav-item__icon">●</span>
                <span className="nav-item__label">Booked demos</span>
                <span className="nav-item__count">0</span>
              </button>
              <button className="nav-item">
                <span className="nav-item__icon">◆</span>
                <span className="nav-item__label">Past calls</span>
                <span className="nav-item__count">{pagesIndexed ? Math.floor(pagesIndexed / 12) : '—'}</span>
              </button>

              <div className="sidebar__spacer" />

              <div className="sidebar__section">Status</div>
              <div className="nav-item" style={{ cursor: 'default' }}>
                <span className="dot dot--ok" />
                <span className="nav-item__label">gbrain · live</span>
              </div>
            </aside>

            {/* CENTER MAIN */}
            <section className="main">
              {view === 'home' ? (
                <>
                  <div>
                    <div className="hero__eyebrow">Today · Find your next demo</div>
                    <h1 className="hero__title">
                      The salesperson's second brain.
                    </h1>
                    <div className="hero__subtitle">
                      Paste a LinkedIn URL. Watch your brain do the rest.
                    </div>
                  </div>

                  <OutreachTestPanel />

                  <button onClick={() => setView('autopsy')} className="autopsy-link">
                    <span>Run Demo Autopsy on 15 prior calls</span>
                    <span className="autopsy-link__arrow">→</span>
                  </button>
                </>
              ) : view === 'events' ? (
                <FindEventsPanel />
              ) : null}
            </section>

            {/* RIGHT RAIL */}
            <aside className="rail-right">
              <BrainSeedPanel />
            </aside>
          </>
        )}
      </main>

      <LearningReceipt open={receiptOpen} onClose={() => setReceiptOpen(false)} />
    </div>
  );
}
