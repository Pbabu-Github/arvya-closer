import { useEffect, useState } from "react";
import { BrainSeedPanel } from "./components/BrainSeedPanel";
import { DemoAutopsyPanel } from "./components/DemoAutopsyPanel";
import { FindEventsPanel } from "./components/FindEventsPanel";
import { AskBrainPanel } from "./components/AskBrainPanel";
import { LearningReceipt } from "./components/LearningReceipt";
import { AccountQueue, type Prospect } from "./components/AccountQueue";
import { SelectedAccountDetail } from "./components/SelectedAccountDetail";
import { useCountUp } from "../hooks/useCountUp";
// window.pmf types live in src/renderer/pmf-api.d.ts

type View = "home" | "autopsy" | "events" | "sources";

// ─────────────────────────────────────────────────────────────
// Inline SVG primitives (matches the design-kit Icon / wordmark)
// ─────────────────────────────────────────────────────────────

function Icon({ name, size = 14 }: { name: string; size?: number }) {
  const paths: Record<string, JSX.Element> = {
    sparkles: (
      <>
        <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
        <path d="M19 14l.75 2.25L22 17l-2.25.75L19 20l-.75-2.25L16 17l2.25-.75z" />
        <path d="M5 14l.6 1.8L7.4 16.4l-1.8.6L5 18.8l-.6-1.8L2.6 16.4l1.8-.6z" />
      </>
    ),
    circleDot: (
      <>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="3" fill="currentColor" />
      </>
    ),
    autopsy: (
      <>
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </>
    ),
    send: (
      <>
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </>
    ),
    phone: (
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    ),
    eye: (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    brain: (
      <>
        <path d="M12 5a3 3 0 0 0-3 3 3 3 0 0 0-3 3 3 3 0 0 0 0 6 3 3 0 0 0 3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0 3-3 3 3 0 0 0 0-6 3 3 0 0 0-3-3 3 3 0 0 0-3-3z" />
        <path d="M12 5v18" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </>
    ),
  };
  const p = paths[name];
  if (!p) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      {p}
    </svg>
  );
}

function ArvyaWordmark() {
  return (
    <span className="titlebar__brand">
      <svg
        width={15}
        height={15}
        viewBox="0 0 32 32"
        fill="none"
        style={{ flexShrink: 0 }}
      >
        <path d="M8 6 L24 16 L8 26 Z" fill="currentColor" opacity="0.16" />
        <path
          d="M8 6 L24 16 L8 26"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={8} cy={16} r={2} fill="currentColor" />
      </svg>
      arvya
    </span>
  );
}

export function Dashboard() {
  const [pagesIndexed, setPagesIndexed] = useState<number | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [view, setView] = useState<View>("home");
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(
    null,
  );

  // Animated count-up for Mission Scoreboard
  const animatedPages = useCountUp(pagesIndexed ?? 0, 1600);

  // Pull real stats from gbrain on mount
  useEffect(() => {
    if (typeof window === "undefined" || !window.pmf) return;
    let cancelled = false;
    window.pmf.brain
      .stats()
      .then((r) => {
        if (!cancelled && r.ok && typeof r.pages === "number") {
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
        <ArvyaWordmark />

        <div className="live-pill">
          <span
            className={`dot ${pagesIndexed === null ? "dot--idle" : "dot--ok dot--pulse"}`}
          />
          <span>
            <strong>
              {pagesIndexed === null ? "—" : animatedPages.toLocaleString()}
            </strong>{" "}
            pages · brain live
          </span>
        </div>

        <div className="titlebar__spacer" />

        <div className="titlebar__search">
          <Icon name="search" size={13} />
          <span className="titlebar__search-text">
            Ask the brain — DealCloud, security, buyer tracker…
          </span>
          <span className="kbd">⌘</span>
          <span className="kbd">K</span>
        </div>

        <div className="titlebar__spacer" />

        <div className="titlebar__right">
          <button
            onClick={() => setReceiptOpen(true)}
            className="btn btn--ghost btn--sm"
          >
            End Call
          </button>
          {overlayOpen ? (
            <button onClick={onCloseOverlay} className="btn btn--sm">
              <Icon name="eye" size={12} />
              Hide overlay
            </button>
          ) : (
            <button
              onClick={onOpenOverlay}
              className="btn btn--primary btn--sm"
            >
              <Icon name="eye" size={12} />
              Open Live Overlay
            </button>
          )}
          <span className="avatar">PB</span>
        </div>
      </header>

      {/* ---------- MAIN ---------- */}
      <main
        className={`dashboard__main ${view === "autopsy" ? "dashboard__main--autopsy" : ""}`}
      >
        {view === "autopsy" ? (
          <DemoAutopsyPanel onClose={() => setView("home")} />
        ) : (
          <>
            {/* SIDEBAR */}
            <aside className="sidebar">
              <div className="sidebar__section">Workspace</div>
              <button
                className={`nav-item ${view === "home" ? "nav-item--active" : ""}`}
                onClick={() => setView("home")}
              >
                <span className="nav-item__icon">
                  <Icon name="sparkles" />
                </span>
                <span className="nav-item__label">Today</span>
                <span className="nav-item__shortcut">1</span>
              </button>
              <button
                className={`nav-item ${view === "events" ? "nav-item--active" : ""}`}
                onClick={() => setView("events")}
              >
                <span className="nav-item__icon">
                  <Icon name="circleDot" />
                </span>
                <span className="nav-item__label">Find events</span>
                <span className="nav-item__shortcut">2</span>
              </button>
              <button className="nav-item" onClick={() => setView("autopsy")}>
                <span className="nav-item__icon">
                  <Icon name="autopsy" />
                </span>
                <span className="nav-item__label">Demo autopsy</span>
                <span className="nav-item__count">15</span>
              </button>

              <div className="sidebar__section">Pipeline</div>
              <button className="nav-item">
                <span className="nav-item__icon">
                  <Icon name="send" />
                </span>
                <span className="nav-item__label">Outreach drafts</span>
                <span className="nav-item__count">0</span>
              </button>
              <button className="nav-item">
                <span className="nav-item__icon">
                  <Icon name="phone" />
                </span>
                <span className="nav-item__label">Booked demos</span>
                <span className="nav-item__count">0</span>
              </button>
              <button className="nav-item">
                <span className="nav-item__icon">
                  <Icon name="brain" />
                </span>
                <span className="nav-item__label">Past calls</span>
                <span className="nav-item__count">
                  {pagesIndexed ? Math.floor(pagesIndexed / 12) : "—"}
                </span>
              </button>

              <div className="sidebar__spacer" />

              <div className="sidebar__section">Setup</div>
              <button
                className={`nav-item ${view === "sources" ? "nav-item--active" : ""}`}
                onClick={() => setView("sources")}
              >
                <span className="nav-item__icon">
                  <Icon name="brain" />
                </span>
                <span className="nav-item__label">Brain sources</span>
                <span className="nav-item__count">{pagesIndexed ?? "—"}</span>
              </button>

              <div className="sidebar__section">Status</div>
              <div className="nav-item" style={{ cursor: "default" }}>
                <span className="nav-item__icon">
                  <span className="dot dot--ok" />
                </span>
                <span className="nav-item__label">gbrain · live</span>
              </div>
            </aside>

            {/* CENTER MAIN */}
            <section className="main">
              {view === "home" ? (
                <>
                  <div>
                    <div className="hero__eyebrow">
                      Today · prior conversations the brain remembers
                    </div>
                    <h1 className="hero__title">Pick up where you left off.</h1>
                    <div className="hero__subtitle">
                      Every past call is loaded. Click an account to see what
                      the brain knows and draft outreach.
                    </div>
                  </div>

                  <AskBrainPanel />

                  <div className="home-grid">
                    <AccountQueue
                      selectedSlug={selectedProspect?.slug ?? null}
                      onSelect={setSelectedProspect}
                    />
                    {selectedProspect ? (
                      <SelectedAccountDetail prospect={selectedProspect} />
                    ) : (
                      <div className="queue queue__empty">
                        Select an account from the queue.
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setView("autopsy")}
                    className="autopsy-link"
                  >
                    <span>Run Demo Autopsy on 15 prior calls</span>
                    <span className="autopsy-link__arrow">→</span>
                  </button>
                </>
              ) : view === "events" ? (
                <FindEventsPanel />
              ) : view === "sources" ? (
                <>
                  <div>
                    <div className="hero__eyebrow">Setup · brain sources</div>
                    <h1 className="hero__title">What the brain reads.</h1>
                    <div className="hero__subtitle">
                      Local files, transcripts, and decks Arvya pulls into
                      GBrain. Edit, add, re-seed.
                    </div>
                  </div>
                  <div className="sources-wrap">
                    <BrainSeedPanel />
                  </div>
                </>
              ) : null}
            </section>
          </>
        )}
      </main>

      <LearningReceipt
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
      />
    </div>
  );
}
