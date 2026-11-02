import { type ReactNode, useEffect, useRef, useState } from "react";

// Bottom sheet that follows the finger: drag the grabber (or the top of the
// sheet) down to dismiss, release early and it springs back.
export function Sheet({ onClose, children, label, tall = false }: { onClose: () => void; children: ReactNode; label: string; tall?: boolean }) {
  const [closing, setClosing] = useState(false);
  const [drag, setDrag] = useState(0);
  const startY = useRef<number | null>(null);
  const startedAt = useRef(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  const close = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 240);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  });

  const onTouchStart = (e: React.TouchEvent) => {
    if ((bodyRef.current?.scrollTop ?? 0) > 0) return;
    startY.current = e.touches[0].clientY;
    startedAt.current = performance.now();
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null) return;
    const dy = e.touches[0].clientY - startY.current;
    setDrag(dy > 0 ? dy : dy / 6);
  };
  const onTouchEnd = () => {
    if (startY.current === null) return;
    const velocity = drag / Math.max(1, performance.now() - startedAt.current);
    startY.current = null;
    if (drag > 120 || velocity > 0.6) close();
    else setDrag(0);
  };

  return (
    <>
      <div className={`scrim${closing ? " closing" : ""}`} onClick={close} style={drag > 0 ? { opacity: Math.max(0.2, 1 - drag / 400) } : undefined} />
      <div
        className={`sheet${closing ? " closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={{
          transform: drag ? `translateY(${drag}px)` : undefined,
          transition: startY.current === null ? "transform 380ms cubic-bezier(0.32,0.72,0,1)" : "none",
          minHeight: tall ? "calc(100dvh - var(--safe-top) - 60px)" : undefined,
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="grabber" />
        <div className="sheet-body" ref={bodyRef}>
          {children}
        </div>
      </div>
    </>
  );
}
