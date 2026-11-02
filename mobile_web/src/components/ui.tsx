import { ChevronRight } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useId, useState } from "react";
import { type CategoryRef } from "../lib/types";

export function Section({ title, action, onAction, children }: { title: string; action?: string; onAction?: () => void; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {action && (
          <button className="link pressable" onClick={onAction}>
            {action}
            <ChevronRight size={16} strokeWidth={2.4} aria-hidden />
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

export function CategoryChip({ category, placeholder = "Add category" }: { category: CategoryRef | null | undefined; placeholder?: string }) {
  if (!category) return <span className="chip empty">{placeholder}</span>;
  return (
    <span className="chip" style={{ "--c": category.color } as CSSProperties}>
      {category.name}
    </span>
  );
}

// A large amount with its currency symbol set small, as Copilot does.
export function Figure({ text }: { text: string }) {
  const [, sign, lead, digits, trail] = text.match(/^([+−-]?)(\D*)(.*?)(\D*)$/) ?? ["", "", "", text, ""];
  return (
    <>
      {sign}
      {lead && <span className="figure-sym">{lead}</span>}
      {digits}
      {trail && <span className="figure-sym">{trail}</span>}
    </>
  );
}

// A category's name in its own colour, for rows that list categories.
export function CategoryName({ name, color, className = "" }: { name: string; color?: string; className?: string }) {
  return (
    <span className={`category-name ${className}`} style={{ "--c": color } as CSSProperties}>
      {name}
    </span>
  );
}

export function Dot({ color, size = 10 }: { color?: string; size?: number }) {
  return <span style={{ width: size, height: size, borderRadius: size, background: color ?? "var(--ink-4)", flexShrink: 0, display: "inline-block" }} />;
}

// Budget ring: the fill is the share spent; colour only when close or over.
export function Ring({ spent, budget, color }: { spent: number; budget: number; color?: string }) {
  const r = 25;
  const c = 2 * Math.PI * r;
  const share = budget > 0 ? spent / budget : spent > 0 ? 1 : 0;
  const tone = share > 1 ? "var(--over)" : share > 0.85 ? "var(--warn)" : (color ?? "var(--brand)");
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(Math.min(share, 1)));
    return () => cancelAnimationFrame(id);
  }, [share]);
  return (
    <svg width="58" height="58" viewBox="0 0 58 58" aria-hidden>
      <circle cx="29" cy="29" r={r} stroke={alpha(undefined, 0.16)} strokeWidth="5" fill="none" />
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
      <text x="29" y="33.5" textAnchor="middle" fontFamily="var(--font)" fontSize="13" fontWeight="700" fill={share > 1 ? "var(--over)" : "var(--ink)"} style={{ fontVariantNumeric: "tabular-nums" }}>
        {Math.round(share * 100)}%
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
      <path d={path} stroke={tone} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(points.length - 1)} cy={y(last.actual)} r="5" fill="var(--surface)" stroke={tone} strokeWidth="3" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// With area, the line's own colour fades to nothing under it.
export function LineChart({ values, height = 80, color = "var(--brand)", area = false }: { values: number[]; height?: number; color?: string; area?: boolean }) {
  const gradient = useId();
  const width = 320;
  if (values.length < 2) return <div style={{ height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - 6 - ((v - min) / span) * (height - 12)]);
  const d = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ height }} aria-hidden>
      {area && (
        <>
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.24" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${d} L${width} ${height} L0 ${height} Z`} fill={`url(#${gradient})`} />
        </>
      )}
      <path d={d} stroke={color} strokeWidth="2.5" fill="none" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

// Months as bars against a reference line. Past months stay neutral; the
// current one is green, or red when it is over the line.
export function Bars({ values, normal, height = 110 }: { values: number[]; normal?: number; height?: number }) {
  const max = Math.max(normal ?? 0, ...values, 1) * 1.1;
  return (
    <div style={{ position: "relative", height, display: "flex", alignItems: "flex-end", gap: 6 }} aria-hidden>
      {values.map((v, i) => {
        const last = i === values.length - 1;
        const over = normal !== undefined && v > normal;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: v > 0 ? Math.max(4, (v / max) * height) : 2,
              background: last ? (over ? "var(--over)" : "var(--good)") : "var(--bar)",
              borderRadius: 5,
              transition: "height 600ms cubic-bezier(0.32,0.72,0,1)",
            }}
          />
        );
      })}
      {normal !== undefined && normal > 0 && <div style={{ position: "absolute", left: 0, right: 0, bottom: (normal / max) * height, borderTop: "1.5px dashed var(--ink-3)" }} />}
    </div>
  );
}

export function Skeleton({ height = 20, width = "100%", radius = 8 }: { height?: number; width?: number | string; radius?: number }) {
  return <div className="skeleton" style={{ height, width, borderRadius: radius }} />;
}

// A block that failed keeps its place and says so, with a way to retry.
export function ErrorBlock({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="state" role="alert">
      <span>Couldn't load {what}.</span>
      <button className="link pressable" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

export function Empty({ children, action, onAction }: { children: ReactNode; action?: string; onAction?: () => void }) {
  return (
    <div className="state">
      <span>{children}</span>
      {action && (
        <button className="link pressable" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

// Label over value, the label in grey sentence case.
export function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "over" }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className="num" style={{ color: tone ? `var(--${tone})` : undefined }}>
        {value}
      </span>
    </div>
  );
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} disabled={disabled} className="toggle" onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

let toastTimer: number | undefined;
type ToastAction = { label: string; run: () => void };
type CurrentToast = { message: string; id: number; action?: ToastAction };
const toastListeners = new Set<(toast: CurrentToast | null) => void>();
const dismissToast = () => toastListeners.forEach((fn) => fn(null));

// A toast with an action stays long enough to reach for it.
export function toast(message: string, action?: ToastAction) {
  const id = Date.now();
  toastListeners.forEach((fn) => fn({ message, id, action }));
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(dismissToast, action ? 6000 : 2400);
}

export function Toaster() {
  const [current, setCurrent] = useState<CurrentToast | null>(null);
  useEffect(() => {
    toastListeners.add(setCurrent);
    return () => {
      toastListeners.delete(setCurrent);
    };
  }, []);
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {current && (
        <div key={current.id} className="toast">
          {current.message}
          {current.action && (
            <button
              className="toast-action pressable"
              onClick={() => {
                window.clearTimeout(toastTimer);
                dismissToast();
                current.action!.run();
              }}
            >
              {current.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
