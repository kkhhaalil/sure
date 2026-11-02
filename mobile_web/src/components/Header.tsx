import { MessageCircle, Settings } from "lucide-react";
import { useEffect, useRef } from "react";
import { go } from "../lib/nav";
import { FetchingBar } from "./Screen";

export const TABS = [
  { path: "/", label: "Home" },
  { path: "/transactions", label: "Transactions" },
  { path: "/spending", label: "Spending" },
  { path: "/accounts", label: "Accounts" },
  { path: "/investments", label: "Investments" },
  { path: "/recurring", label: "Recurring" },
] as const;

export function Header({ active }: { active: string }) {
  const tabsRef = useRef<HTMLDivElement>(null);

  // Centre the active tab in the rail: at once when the header mounts on a
  // tab further right, smoothly when the tab changes.
  const mounted = useRef(false);
  useEffect(() => {
    const rail = tabsRef.current;
    const tab = rail?.querySelector<HTMLElement>("[aria-selected=true]");
    if (!rail || !tab) return;
    rail.scrollTo({ left: tab.offsetLeft - (rail.clientWidth - tab.offsetWidth) / 2, behavior: mounted.current ? "smooth" : "instant" });
    mounted.current = true;
  }, [active]);

  return (
    <header className="header">
      <div className="header-bar">
        <button className="icon-btn pressable" aria-label="Settings" onClick={() => go("/settings", { push: true })}>
          <Settings size={22} strokeWidth={1.9} />
        </button>
        <span className="wordmark">Sure</span>
        <button className="icon-btn pressable" aria-label="Assistant" onClick={() => go("/assistant", { push: true })}>
          <MessageCircle size={22} strokeWidth={1.9} />
        </button>
      </div>
      <nav className="tabs" role="tablist" aria-label="Sections" ref={tabsRef}>
        {TABS.map((tab) => (
          <button key={tab.path} role="tab" aria-selected={tab.path === active} className="tab pressable" onClick={() => go(tab.path, { replace: true })}>
            {tab.label}
          </button>
        ))}
      </nav>
      <FetchingBar />
    </header>
  );
}

// Horizontal swipe on the page body moves between tabs, like Copilot.
export function useTabSwipe(active: string) {
  useEffect(() => {
    let x0 = 0;
    let y0 = 0;
    let tracking = false;
    const down = (e: TouchEvent) => {
      if ((e.target as HTMLElement).closest(".sheet, .tabs, [data-noswipe]")) return;
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      tracking = x0 > 24 && x0 < innerWidth - 24; // leave the edges to the browser's back gesture
    };
    const up = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const dx = e.changedTouches[0].clientX - x0;
      const dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
      const i = TABS.findIndex((t) => t.path === active);
      const next = TABS[i + (dx < 0 ? 1 : -1)];
      if (next) go(next.path, { replace: true });
    };
    addEventListener("touchstart", down, { passive: true });
    addEventListener("touchend", up);
    return () => {
      removeEventListener("touchstart", down);
      removeEventListener("touchend", up);
    };
  }, [active]);
}
