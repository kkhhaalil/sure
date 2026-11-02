import { useIsFetching } from "@tanstack/react-query";
import { ChevronLeft, X } from "lucide-react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { back } from "../lib/nav";
import { queryClient } from "../lib/query";

// The app never scrolls the document: bars stay fixed and only this region
// moves, the way a native navigation stack behaves (no rubber-banding the
// header away). Pull down at the top to refetch everything on screen.
const positions = new Map<string, number>();

export function Scroller({ id, sky, children }: { id: string; sky?: "long" | "short"; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef<number | null>(null);
  const pullRef = useRef(0);
  pullRef.current = pull;

  // Each tab keeps its own scroll position.
  useLayoutEffect(() => {
    ref.current!.scrollTop = positions.get(id) ?? 0;
  }, [id]);

  useEffect(() => {
    const el = ref.current!;
    const down = (e: TouchEvent) => {
      start.current = el.scrollTop <= 0 && !busy ? e.touches[0].clientY : null;
    };
    const move = (e: TouchEvent) => {
      if (start.current === null) return;
      const dy = e.touches[0].clientY - start.current;
      setPull(dy > 0 ? Math.min(96, dy * 0.45) : 0);
    };
    const up = () => {
      if (start.current === null) return;
      start.current = null;
      if (pullRef.current > 64) {
        setBusy(true);
        setPull(56);
        queryClient.refetchQueries({ type: "active" }).finally(() => {
          setBusy(false);
          setPull(0);
        });
      } else setPull(0);
    };
    el.addEventListener("touchstart", down, { passive: true });
    el.addEventListener("touchmove", move, { passive: true });
    el.addEventListener("touchend", up);
    el.addEventListener("touchcancel", up);
    return () => {
      el.removeEventListener("touchstart", down);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", up);
      el.removeEventListener("touchcancel", up);
    };
  }, [busy]);

  return (
    <div className={sky ? `scroller sky ${sky}` : "scroller"} ref={ref} onScroll={(e) => positions.set(id, e.currentTarget.scrollTop)}>
      <div className="pull" style={{ height: pull, transition: start.current === null ? "height 260ms var(--spring)" : "none" }} aria-hidden>
        {pull > 0 && <span className={`spinner${busy ? " spinning" : ""}`} style={busy ? undefined : { transform: `rotate(${pull * 4}deg)`, opacity: Math.min(1, pull / 64) }} />}
      </div>
      {children}
    </div>
  );
}

// A thin progress line under the bar while anything refreshes in the background.
export function FetchingBar() {
  const fetching = useIsFetching() > 0;
  return <div className={`fetching${fetching ? " on" : ""}`} aria-hidden />;
}

// A pushed screen: a blue bar (the status bar text is always light),
// a title, back or close, one optional action, and an optional footer that
// stays above the home indicator.
export function PushedScreen({
  title,
  close = false,
  fallback = "/",
  action,
  footer,
  children,
  id,
}: {
  title: ReactNode;
  close?: boolean;
  fallback?: string;
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  id: string;
}) {
  return (
    <div className="app">
      <header className="header pushed">
        <div className="header-bar">
          <button className="icon-btn pressable" aria-label={close ? "Close" : "Back"} onClick={() => back(fallback)}>
            {close ? <X size={24} strokeWidth={2} /> : <ChevronLeft size={28} strokeWidth={2} />}
          </button>
          <h1 className="bar-title">{title}</h1>
          <span className="bar-action">{action}</span>
        </div>
        <FetchingBar />
      </header>
      <Scroller id={id}>
        <main className="page">{children}</main>
      </Scroller>
      {footer && <div className="footer">{footer}</div>}
    </div>
  );
}
