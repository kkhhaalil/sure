import { type ReactNode, useEffect, useRef, useState } from "react";
import { type CategoryRef } from "../lib/types";

export function Section({ title, action, onAction, children }: { title: string; action?: string; onAction?: () => void; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <span className="eyebrow">{title}</span>
        {action && (
          <button className="link pressable" onClick={onAction}>
            {action}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function alpha(hex: string | undefined, a: number) {
  const value = (hex ?? "#66756E").replace("#", "");
  const n = Number.parseInt(value.length === 3 ? value.replace(/./g, "$&$&") : value, 16);
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${a})`;
}

export function CategoryChip({ category, placeholder = "+ Category" }: { category: CategoryRef | null | undefined; placeholder?: string }) {
  if (!category) return <span className="chip empty">{placeholder}</span>;
  return (
    <span className="chip" style={{ background: alpha(category.color, 0.14), color: category.color }}>
      {category.name}
    </span>
  );
}

export function Dot({ color, size = 10 }: { color?: string; size?: number }) {
  return <span style={{ width: size, height: size, borderRadius: size, background: color ?? "var(--ink-4)", flexShrink: 0, display: "inline-block" }} />;
}

// Budget ring: fill is spent share; the color says over / close / fine.
export function Ring({ spent, budget, label, color }: { spent: number; budget: number; label: string; color?: string }) {
  const r = 25;
  const c = 2 * Math.PI * r;
  const share = budget > 0 ? spent / budget : spent > 0 ? 1 : 0;
  const tone = share > 1 ? "var(--over)" : share > 0.85 ? "var(--warn)" : "var(--good)";
  const track = share > 1 ? "var(--over-tint)" : share > 0.85 ? "var(--warn-tint)" : "var(--good-tint)";
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(Math.min(share, 1)));
    return () => cancelAnimationFrame(id);
  }, [share]);
  return (
    <svg width="58" height="58" viewBox="0 0 58 58" aria-hidden>
      <circle cx="29" cy="29" r={r} stroke={track} strokeWidth="5" fill="var(--surface)" />
      <circle
        cx="29"
        cy="29"
        r={r}
        stroke={tone}
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${c * shown} ${c}`}
        transform="rotate(-90 29 29)"
        style={{ transition: "stroke-dasharray 700ms cubic-bezier(0.32,0.72,0,1)" }}
      />
      <text x="29" y="35" textAnchor="middle" fontFamily="Inter" fontSize="17" fontWeight="700" fill={color ?? tone}>
        {label}
      </text>
    </svg>
  );
}

// Cumulative actual vs. the straight-line pace to the budget.
export function PaceChart({ points, total, width = 322, height = 96 }: { points: { actual: number; ideal: number }[]; total: number; width?: number; height?: number }) {
  if (points.length === 0 || total <= 0) return <div style={{ height }} />;
  const max = Math.max(total, ...points.map((p) => p.actual)) * 1.05;
  const days = points.length === 1 ? 1 : points.length - 1;
  const totalDays = Math.max(days, Math.round((total / (points[points.length - 1].ideal || total)) * points.length) - 1);
  const x = (i: number) => (i / totalDays) * width;
  const y = (v: number) => height - 4 - (v / max) * (height - 10);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.actual).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const tone = last.actual > last.ideal ? "var(--over)" : "var(--good)";
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ height, overflow: "visible" }} aria-hidden>
      <path d={`M0 ${y(0)} L${width} ${y(total)}`} stroke="var(--ink-4)" strokeWidth="1.5" strokeDasharray="4 5" fill="none" vectorEffect="non-scaling-stroke" />
      <path d={path} stroke={tone} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" className="draw" />
      <circle cx={x(points.length - 1)} cy={y(last.actual)} r="5" fill="var(--surface)" stroke={tone} strokeWidth="3" />
    </svg>
  );
}

export function LineChart({ values, height = 80, color = "var(--good)", fill }: { values: number[]; height?: number; color?: string; fill?: string }) {
  const width = 320;
  if (values.length < 2) return <div style={{ height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - 6 - ((v - min) / span) * (height - 12)]);
  const d = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ height }} aria-hidden>
      {fill && <path d={`${d} L${width} ${height} L0 ${height} Z`} fill={fill} />}
      <path d={d} stroke={color} strokeWidth="2.5" fill="none" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function Bars({ values, normal, highlightLast = true, height = 110 }: { values: number[]; normal?: number; highlightLast?: boolean; height?: number }) {
  const max = Math.max(normal ?? 0, ...values, 1) * 1.1;
  return (
    <div style={{ position: "relative", height, display: "flex", alignItems: "flex-end", gap: 6 }} aria-hidden>
      {normal !== undefined && normal > 0 && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: (normal / max) * height, borderTop: "1.5px solid var(--ink)" }} />
      )}
      {values.map((v, i) => {
        const last = highlightLast && i === values.length - 1;
        const over = normal !== undefined && v > normal * 1.1;
        const bg = last ? (over ? "var(--over)" : "var(--brand)") : over ? "var(--warn)" : "var(--good-tint)";
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: Math.max(4, (v / max) * height),
              background: bg,
              borderRadius: 5,
              transition: "height 600ms cubic-bezier(0.32,0.72,0,1)",
            }}
          />
        );
      })}
    </div>
  );
}

export function Skeleton({ height = 20, width = "100%", radius = 10 }: { height?: number; width?: number | string; radius?: number }) {
  return <div className="skeleton" style={{ height, width, borderRadius: radius }} />;
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      style={{
        width: 51,
        height: 31,
        borderRadius: 16,
        padding: 2,
        background: on ? "var(--brand)" : "var(--line)",
        display: "flex",
        justifyContent: on ? "flex-end" : "flex-start",
        transition: "background 200ms",
        flexShrink: 0,
      }}
    >
      <span style={{ width: 27, height: 27, borderRadius: 14, background: "#fff", boxShadow: "0 1px 3px rgb(0 0 0 / 0.15)" }} />
    </button>
  );
}

let toastTimer: number | undefined;
const toastListeners = new Set<(message: string | null) => void>();

export function toast(message: string) {
  toastListeners.forEach((fn) => fn(message));
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastListeners.forEach((fn) => fn(null)), 2200);
}

export function Toaster() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    toastListeners.add(setMessage);
    return () => {
      toastListeners.delete(setMessage);
    };
  }, []);
  return message ? (
    <div className="toast" role="status">
      {message}
    </div>
  ) : null;
}

// Pull down at the top of a page to refresh, with a rubber-band feel.
export function usePullToRefresh(onRefresh: () => Promise<unknown>) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef<number | null>(null);

  useEffect(() => {
    const down = (e: TouchEvent) => {
      start.current = scrollY <= 0 ? e.touches[0].clientY : null;
    };
    const move = (e: TouchEvent) => {
      if (start.current === null || busy) return;
      const dy = e.touches[0].clientY - start.current;
      setPull(dy > 0 ? Math.min(90, dy * 0.45) : 0);
    };
    const up = () => {
      if (pull > 60 && !busy) {
        setBusy(true);
        onRefresh().finally(() => {
          setBusy(false);
          setPull(0);
        });
      } else setPull(0);
      start.current = null;
    };
    addEventListener("touchstart", down, { passive: true });
    addEventListener("touchmove", move, { passive: true });
    addEventListener("touchend", up);
    return () => {
      removeEventListener("touchstart", down);
      removeEventListener("touchmove", move);
      removeEventListener("touchend", up);
    };
  }, [pull, busy, onRefresh]);

  return { pull: busy ? 48 : pull, busy };
}

export function PullIndicator({ pull, busy }: { pull: number; busy: boolean }) {
  if (pull <= 0) return null;
  return (
    <div style={{ height: pull, display: "grid", placeItems: "center", transition: busy ? "height 200ms" : undefined }}>
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          border: "2.5px solid var(--line)",
          borderTopColor: "var(--brand)",
          transform: `rotate(${pull * 4}deg)`,
          animation: busy ? "spin 700ms linear infinite" : undefined,
        }}
      />
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}
