import { useEffect, useState } from 'react';
import { BrainSeedPanel } from './components/BrainSeedPanel';
import { DemoAutopsyPanel } from './components/DemoAutopsyPanel';
import { OutreachTestPanel } from './components/OutreachTestPanel';
import { LearningReceipt } from './components/LearningReceipt';
import { useCountUp } from '../hooks/useCountUp';
// window.pmf types live in src/renderer/pmf-api.d.ts

type View = 'detail' | 'autopsy';

export function Dashboard() {
  const [bookedToday, _setBookedToday] = useState(0);
  const [pagesIndexed, setPagesIndexed] = useState<number | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [view, setView] = useState<View>('detail');
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

  const openAutopsy = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setView('autopsy');
  };

  const closeAutopsy = () => setView('detail');

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <div className="dashboard__brand">Arvya Closer</div>
        <div className="dashboard__scoreboard">
          <div className="scoreboard__big">
            <div className="scoreboard__value">
              {pagesIndexed === null ? '—' : animatedPages.toLocaleString()}
            </div>
            <div className="scoreboard__label">pages indexed</div>
          </div>
          <div className="scoreboard__small">
            <span className={`scoreboard__pulse ${bookedToday > 0 ? 'live' : ''}`} />
            <span>{bookedToday} booked LIVE during hackathon</span>
          </div>
        </div>
        <div className="dashboard__overlay-control">
          {overlayOpen ? (
            <button onClick={onCloseOverlay} className="btn btn--ghost">
              Hide Overlay
            </button>
          ) : (
            <button onClick={onOpenOverlay} className="btn btn--primary">
              Open Live Overlay
            </button>
          )}
          <button
            onClick={() => setReceiptOpen(true)}
            className="btn btn--ghost"
            style={{ marginLeft: 8 }}
          >
            End Call (demo)
          </button>
        </div>
      </header>

      <main className={`dashboard__main ${view === 'autopsy' ? 'dashboard__main--autopsy' : ''}`}>
        {view === 'autopsy' ? (
          <DemoAutopsyPanel onClose={closeAutopsy} />
        ) : (
          <>
            <aside className="dashboard__rail-left">
              <div className="rail__title">Account Queue</div>
              <div className="rail__placeholder">Drop accounts here</div>
            </aside>

            <section className="dashboard__center">
              <OutreachTestPanel />

              <div className="center__autopsy-link">
                <a href="#autopsy" onClick={openAutopsy}>
                  → Run Demo Autopsy on 15 prior demos
                </a>
              </div>
            </section>

            <aside className="dashboard__rail-right">
              <BrainSeedPanel />
            </aside>
          </>
        )}
      </main>

      <LearningReceipt open={receiptOpen} onClose={() => setReceiptOpen(false)} />
    </div>
  );
}
