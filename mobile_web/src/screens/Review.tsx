import { ChevronLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { invalidate, useApi } from "../lib/data";
import { dayLabel, isoDate, money } from "../lib/format";
import { back, navigate } from "../lib/router";
import type { Suggestion, Transaction } from "../lib/types";
import { Skeleton, toast } from "../components/ui";

type Queue = { transactions: Transaction[]; pagination: { total_count: number } };

// One card at a time: pick a category (or keep it), swipe right to approve,
// left to skip. Approving writes category + reviewed in one PATCH.
export function Review() {
  const query = { reviewed: false, exclude_transfers: true, per_page: 25, start_date: isoDate(new Date(Date.now() - 30 * 86_400_000)) };
  const { data, loading } = useApi<Queue>("/transactions", query, 0);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(0);
  const [exit, setExit] = useState<"left" | "right" | null>(null);
  const [dx, setDx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const startX = useRef<number | null>(null);

  const queue = data?.transactions ?? [];
  const total = data?.pagination.total_count ?? 0;
  const current = queue[index];
  const suggestions = useApi<{ suggestions: Suggestion[] }>(current ? `/transactions/${current.id}/category_suggestions` : null);

  useEffect(() => {
    setPicked(current?.category?.id ?? suggestions.data?.suggestions[0]?.category_id ?? null);
  }, [current?.id, suggestions.data]);

  const advance = (direction: "left" | "right") => {
    setExit(direction);
    setTimeout(() => {
      setExit(null);
      setDx(0);
      setIndex((i) => i + 1);
    }, 220);
  };

  const approve = async () => {
    if (!current) return;
    const body: Record<string, unknown> = { reviewed: true };
    if (picked && picked !== current.category?.id) body.category_id = picked;
    advance("right");
    setDone((n) => n + 1);
    try {
      await api(`/transactions/${current.id}`, { method: "PATCH", body: { transaction: body } });
      invalidate("/transactions");
      invalidate("/budget");
    } catch {
      toast("Couldn't save — try again");
    }
  };

  const exclude = async () => {
    if (!current) return;
    advance("left");
    await api(`/transactions/${current.id}`, { method: "PATCH", body: { transaction: { reviewed: true, excluded: true } } }).catch(() => {});
  };

  const pickedName = suggestions.data?.suggestions.find((s) => s.category_id === picked)?.name ?? (picked === current?.category?.id ? current?.category?.name : null);

  return (
    <main className="page plain" style={{ gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 44 }}>
        <button className="icon-btn pressable" style={{ color: "var(--ink)" }} aria-label="Back" onClick={() => back()}>
          <ChevronLeft size={26} />
        </button>
        <span style={{ fontWeight: 600 }}>{current ? `${Math.min(done + 1, total)} of ${total} to review` : "Review"}</span>
        <button className="link pressable" style={{ fontSize: 16, fontWeight: 600, width: 44 }} onClick={() => back()}>
          Done
        </button>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {Array.from({ length: Math.min(total, 12) }).map((_, i) => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < done ? "var(--brand)" : "var(--line)", transition: "background 300ms" }} />
        ))}
      </div>

      {loading && <Skeleton height={340} radius={26} />}

      {!loading && !current && (
        <div style={{ flex: 1, display: "grid", placeItems: "center", textAlign: "center", gap: 8 }}>
          <div>
            <div className="display" style={{ fontSize: 30 }}>
              All caught up
            </div>
            <p className="muted">Nothing new since you last looked.</p>
            <button className="btn primary pressable" style={{ marginTop: 16 }} onClick={() => navigate("/", { replace: true })}>
              Back to Home
            </button>
          </div>
        </div>
      )}

      {current && (
        <>
          <div style={{ position: "relative", paddingTop: 14 }}>
            {queue[index + 1] && <div className="card" style={{ position: "absolute", left: 16, right: 16, top: 0, height: 60, background: "var(--line)" }} />}
            <div
              className="card"
              data-noswipe
              onTouchStart={(e) => (startX.current = e.touches[0].clientX)}
              onTouchMove={(e) => startX.current !== null && setDx(e.touches[0].clientX - startX.current)}
              onTouchEnd={() => {
                startX.current = null;
                if (dx > 110) approve();
                else if (dx < -110) advance("left");
                else setDx(0);
              }}
              style={{
                position: "relative",
                borderRadius: 26,
                padding: "28px 22px 22px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                boxShadow: "var(--shadow-lift)",
                transform: exit ? `translateX(${exit === "right" ? 120 : -120}%) rotate(${exit === "right" ? 12 : -12}deg)` : `translateX(${dx}px) rotate(${dx / 30 - 2}deg)`,
                transition: startX.current === null ? "transform 320ms cubic-bezier(0.32,0.72,0,1)" : "none",
              }}
            >
              <span className="muted" style={{ fontSize: 14 }}>
                {dayLabel(current.date)} · {current.account.name}
              </span>
              <span className="display" style={{ fontSize: 56, paddingTop: 6 }}>
                {money(current.amount_cents, current.currency)}
              </span>
              <span style={{ fontSize: 20, fontWeight: 600 }}>{current.merchant?.name ?? current.name}</span>
              {current.merchant && <span style={{ fontSize: 13, fontFamily: "var(--mono)", color: "var(--ink-3)" }}>{current.name}</span>}
              <div style={{ alignSelf: "stretch", height: 1, background: "var(--line)", margin: "16px 0 10px" }} />
              <span className="eyebrow" style={{ alignSelf: "flex-start", color: "var(--ink-3)" }}>
                Suggested
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignSelf: "flex-start", paddingTop: 6 }}>
                {[
                  ...(current.category && !suggestions.data?.suggestions.some((s) => s.category_id === current.category!.id)
                    ? [{ category_id: current.category.id, name: current.category.name }]
                    : []),
                  ...(suggestions.data?.suggestions ?? []),
                ].map((s) => (
                  <button
                    key={s.category_id}
                    className="pressable"
                    onClick={() => setPicked(s.category_id)}
                    style={{
                      padding: "9px 14px",
                      borderRadius: 12,
                      fontSize: 15,
                      fontWeight: picked === s.category_id ? 600 : 500,
                      background: picked === s.category_id ? "var(--brand)" : "var(--surface-sunk)",
                      color: picked === s.category_id ? "#fff" : "var(--ink)",
                    }}
                  >
                    {s.name}
                  </button>
                ))}
                <button className="pressable" onClick={() => navigate(`/transactions/${current.id}/category`)} style={{ padding: "9px 14px", borderRadius: 12, fontSize: 15, background: "var(--surface-sunk)" }}>
                  More…
                </button>
              </div>
            </div>
          </div>

          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0 4px", fontSize: 14 }} className="muted">
            <span>← Swipe to skip</span>
            <span>Swipe to approve →</span>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn outline pressable" style={{ flex: 1 }} onClick={exclude}>
              Exclude
            </button>
            <button className="btn primary pressable" style={{ flex: 2 }} onClick={approve}>
              {pickedName ? `Approve as ${pickedName}` : "Approve"}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
