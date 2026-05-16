import { useState } from 'react';
import { BrainSeedPanel } from './components/BrainSeedPanel';
import { DemoAutopsyPanel } from './components/DemoAutopsyPanel';
// window.pmf types live in src/renderer/pmf-api.d.ts

type View = 'detail' | 'autopsy';

export function Dashboard() {
  const [bookedToday, _setBookedToday] = useState(0);
  const [pagesIndexed, _setPagesIndexed] = useState<number | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [view, setView] = useState<View>('detail');

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
            <div className="scoreboard__value">{pagesIndexed ?? '—'}</div>
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
        </div>
      </header>

      <main className={`dashboard__main ${view === 'autopsy' ? 'dashboard__main--autopsy' : ''}`}>
        {view === 'autopsy' ? (
          <DemoAutopsyPanel onClose={closeAutopsy} />
        ) : (
          <>
            <aside className="dashboard__rail-left">
              <div className="rail__title">Account Queue</div>
              {/* TODO(Prashanth — lane/dash): AccountQueue component */}
              <div className="rail__placeholder">Drop accounts here</div>
            </aside>

            <section className="dashboard__center">
              <div className="center__title">Selected Account</div>
              {/* TODO(Prashanth — lane/dash): AccountDetail, ProofRoom, OutreachApproval */}
              <div className="center__placeholder">
                Click an account on the left to see the proof room, outreach draft, and call prep.
              </div>

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
    </div>
  );
}
