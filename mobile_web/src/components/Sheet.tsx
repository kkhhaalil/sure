import { type ReactNode, useEffect, useRef, useState } from "react";

// Keeps the last value while a sheet animates out after its route param is
// gone, so closing by the back gesture animates the same as a tap.
export function usePresence<T>(value: T | undefined) {
  const [kept, setKept] = useState(value);
  if (value !== undefined && value !== kept) setKept(value);
  return { value: value ?? kept, open: value !== undefined, onExited: () => setKept(undefined) };
}

const ENTER = "transform 440ms cubic-bezier(0.32, 0.72, 0, 1)";
const EXIT = "transform 260ms cubic-bezier(0.4, 0, 1, 1)";

// Bottom sheet that follows the finger. Every move is a transition on one
// transform, so entering, dragging, springing back and leaving never fight.
export function Sheet({
  open,
  onClose,
  onExited,
  label,
  tall = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onExited: () => void;
  label: string;
  tall?: boolean;
  children: ReactNode;
}) {
  const [entered, setEntered] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ y: number; t: number; decided: boolean } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Two frames: the first paints the sheet off screen, the second moves it.
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => (second = requestAnimationFrame(() => setEntered(true))));
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);

  useEffect(() => {
    if (open) return;
    setDrag(null);
    // transitionend is skipped when nothing moves (closed before entering).
    const id = setTimeout(onExited, 320);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    sheetRef.current?.focus({ preventScroll: true });
    return () => removeEventListener("keydown", onKey);
  }, [open]);

  const onTouchStart = (e: React.TouchEvent) => {
    if (!open) return;
    start.current = { y: e.touches[0].clientY, t: performance.now(), decided: false };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = start.current;
    if (!s) return;
    const dy = e.touches[0].clientY - s.y;
    if (!s.decided) {
      // Upward, or a scrolled list: the content scrolls instead.
      if (Math.abs(dy) < 6) return;
      if (dy < 0 || (bodyRef.current?.scrollTop ?? 0) > 0) {
        start.current = null;
        return;
      }
      s.decided = true;
    }
    setDrag(Math.max(0, dy));
  };
  const onTouchEnd = () => {
    const s = start.current;
    start.current = null;
    if (!s?.decided || drag === null) return;
    const velocity = drag / Math.max(1, performance.now() - s.t);
    if (drag > 110 || velocity > 0.5) onClose();
    else setDrag(null);
  };

  const visible = open && entered;
  const dragging = start.current?.decided ?? false;
  const transform = !visible ? "translateY(calc(100% + 24px))" : drag ? `translateY(${drag}px)` : "translateY(0)";

  return (
    <>
      <div
        className="scrim"
        onClick={onClose}
        style={{ opacity: visible ? Math.max(0, 1 - (drag ?? 0) / 500) : 0, transition: dragging ? "none" : `opacity ${open ? 360 : 260}ms ease`, pointerEvents: open ? "auto" : "none" }}
      />
      <div
        ref={sheetRef}
        tabIndex={-1}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={{ transform, transition: dragging ? "none" : open ? ENTER : EXIT, height: tall ? "calc(100% - var(--safe-top) - 48px)" : undefined }}
        onTransitionEnd={(e) => e.target === e.currentTarget && !open && onExited()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div className="grabber" />
        <div className="sheet-body" ref={bodyRef}>
          {children}
        </div>
      </div>
    </>
  );
}
