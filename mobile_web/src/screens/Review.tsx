import { useEffect, useRef, useState } from "react";
import { PushedScreen } from "../components/Screen";
import { ErrorBlock, Skeleton, toast } from "../components/ui";
import { dayLabel, money } from "../lib/format";
import { go, openSheet } from "../lib/nav";
import { useApi } from "../lib/query";
import { reviewQuery, type TransactionPage, usePatchTransaction } from "../lib/transactions";
import type { Suggestion } from "../lib/types";

// One card at a time: pick a category (or keep it), swipe right to approve,
// left to skip. Approving writes category + reviewed in one PATCH. The queue
// refetches as rows are reviewed, so the card shown is the first one not
// handled in this session rather than an index into a list that moves.
export function Review() {
  const queue = useApi<TransactionPage>("/transactions", reviewQuery(25), { staleTime: 0 });
  const patch = usePatchTransaction();
  const [handled, setHandled] = useState<Set<string>>(() => new Set());
  const [approved, setApproved] = useState(0);
  const [exit, setExit] = useState<"left" | "right" | null>(null);
  const [dx, setDx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const startX = useRef<number | null>(null);

  const rows = queue.data?.transactions ?? [];
  const [current, next] = rows.filter((t) => !handled.has(t.id));
  const skippedInQueue = rows.filter((t) => handled.has(t.id)).length;
  const left = Math.max(0, (queue.data?.pagination.total_count ?? 0) - skippedInQueue);
  const suggestions = useApi<{ suggestions: Suggestion[] }>(current ? `/transactions/${current.id}/category_suggestions` : null, undefined, { staleTime: 300_000 });

  useEffect(() => {
    setPicked(current?.category?.id ?? suggestions.data?.suggestions[0]?.category_id ?? null);
  }, [current?.id, current?.category?.id, suggestions.data]);

  // Fly the card off, then hand it to the server and show the next one.
  const advance = (direction: "left" | "right", write?: Record<string, unknown>) => {
    if (!current || exit) return;
    const id = current.id;
    setExit(direction);
    setTimeout(() => {
      setHandled((set) => new Set(set).add(id));
      setExit(null);
      setDx(0);
      if (write) patch.mutate({ id, attrs: write }, { onError: () => toast("Couldn't save. It's back in your queue.") });
    }, 220);
  };

  const approve = () => {
    if (!current) return;
    const attrs: Record<string, unknown> = { reviewed: true };
    if (picked && picked !== current.category?.id) attrs.category_id = picked;
    setApproved((n) => n + 1);
    advance("right", attrs);
  };

  const choices = current
    ? [
        ...(current.category && !suggestions.data?.suggestions.some((s) => s.category_id === current.category!.id) ? [{ category_id: current.category.id, name: current.category.name }] : []),
        ...(suggestions.data?.suggestions ?? []),
      ]
    : [];
  const pickedName = choices.find((s) => s.category_id === picked)?.name;
  const progress = approved + left > 0 ? approved / (approved + left) : 1;

  return (
    <PushedScreen
      id="review"
      title={current ? `${left} to review` : "Review"}
      action={
        <button className="bar-link pressable" onClick={() => go("/", { replace: true })}>
          Done
        </button>
      }
      footer={
        current && (
          <div className="footer-actions">
            <button className="btn outline pressable" style={{ flex: 1 }} onClick={() => advance("left", { reviewed: true, excluded: true })}>
              Exclude
            </button>
            <button className="btn primary pressable" style={{ flex: 2 }} onClick={approve}>
              {pickedName ? `Approve as ${pickedName}` : "Approve"}
            </button>
          </div>
        )
      }
    >
      <div className="progress" aria-label={`${approved} reviewed`}>
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>

      {queue.isError && <ErrorBlock what="your review queue" onRetry={() => queue.refetch()} />}

      {queue.isPending && (
        <div className="card review-card">
          <Skeleton height={14} width="45%" />
          <Skeleton height={56} width="60%" />
          <Skeleton height={22} width="40%" />
        </div>
      )}

      {queue.isSuccess && !current && (
        <div className="done">
          <h2 className="display">{approved > 0 ? `${approved} reviewed` : "All caught up"}</h2>
          <p>{left > 0 ? "You skipped the rest for now. They stay in the queue." : "Nothing new from the last 30 days."}</p>
          <button className="btn primary pressable" onClick={() => go("/", { replace: true })}>
            Back to Home
          </button>
        </div>
      )}

      {current && (
        <div className="review-stack">
          {next && <div className="card review-next" aria-hidden />}
          <div
            key={current.id}
            className="card review-card"
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
              transform: exit ? `translateX(${exit === "right" ? 120 : -120}%) rotate(${exit === "right" ? 10 : -10}deg)` : `translateX(${dx}px) rotate(${dx / 30}deg)`,
              transition: startX.current === null ? "transform 300ms var(--spring)" : "none",
            }}
          >
            <span className="review-meta">
              {dayLabel(current.date)} · {current.account.name}
            </span>
            <span className="display review-amount" style={{ color: current.classification === "income" ? "var(--good-ink)" : undefined }}>
              {current.classification === "income" ? "+" : ""}
              {money(current.amount_cents, current.currency)}
            </span>
            <span className="review-name">{current.merchant?.name ?? current.name}</span>
            {current.merchant && current.merchant.name !== current.name && <span className="review-desc">{current.name}</span>}

            <div className="review-choices">
              <span className="label">{current.category ? "Category" : "Suggested categories"}</span>
              <div className="choice-row">
                {suggestions.isPending && choices.length === 0
                  ? [80, 100, 70].map((w, i) => <Skeleton key={i} height={40} width={w} radius={12} />)
                  : choices.map((s) => (
                      <button key={s.category_id} className="choice pressable" aria-pressed={picked === s.category_id} onClick={() => setPicked(s.category_id)}>
                        {s.name}
                      </button>
                    ))}
                <button className="choice pressable" onClick={() => openSheet({ pick: current.id })}>
                  Other…
                </button>
              </div>
            </div>
          </div>
          <p className="review-hint">Swipe right to approve, left to skip</p>
        </div>
      )}
    </PushedScreen>
  );
}
