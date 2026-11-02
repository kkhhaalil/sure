import { Plus, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { useApi } from "../lib/data";
import { dayLabel, isoDate, money, today } from "../lib/format";
import { navigate } from "../lib/router";
import type { Transaction } from "../lib/types";
import { CategoryChip, PullIndicator, Skeleton, usePullToRefresh } from "../components/ui";
import { Stat } from "./Home";

type Page = { transactions: Transaction[]; pagination: { page: number; total_pages: number; total_count: number } };
type Filter = "all" | "month" | "uncategorized";

export function Transactions() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [pages, setPages] = useState<Transaction[][]>([]);
  const [pageCount, setPageCount] = useState(1);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  const query = useMemo(() => {
    const q: Record<string, unknown> = { per_page: 50, search: debounced || undefined };
    if (filter === "month") q.start_date = isoDate(new Date(today().getFullYear(), today().getMonth(), 1));
    if (filter === "uncategorized") {
      q.uncategorized = true;
      q.exclude_transfers = true;
    }
    return q;
  }, [debounced, filter]);

  const first = useApi<Page>("/transactions", query);
  const cashFlow = useApi<{ income: string; spending: string; savings_rate: string | null; currency: string }>("/cash_flow");
  const { pull, busy } = usePullToRefresh(() => first.reload());

  useEffect(() => {
    setPages([]);
    setPageCount(first.data?.pagination.total_pages ?? 1);
  }, [first.data]);

  // Infinite scroll: fetch the next page when the sentinel comes into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting) return;
      const next = pages.length + 2;
      if (next > pageCount) return;
      const page = await api<Page>("/transactions", { query: { ...query, page: next } });
      setPages((p) => (p.length + 2 === next ? [...p, page.transactions] : p));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [pages.length, pageCount, query]);

  const rows = [...(first.data?.transactions ?? []), ...pages.flat()];
  const groups = groupByDay(rows);

  return (
    <main className="page" style={{ gap: 16 }}>
      <PullIndicator pull={pull} busy={busy} />
      <label className="card" style={{ height: 48, display: "flex", alignItems: "center", gap: 10, padding: "0 14px", borderRadius: 16 }}>
        <Search size={18} color="var(--ink-3)" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search transactions"
          enterKeyHint="search"
          style={{ border: 0, outline: "none", background: "transparent", flex: 1, minWidth: 0 }}
        />
        <SlidersHorizontal size={20} color="var(--ink)" />
      </label>

      <div style={{ display: "flex", gap: 8 }}>
        {(
          [
            ["all", "All"],
            ["month", "This month"],
            ["uncategorized", "Uncategorized"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className="pressable"
            onClick={() => setFilter(value)}
            style={{
              padding: "7px 12px",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: filter === value ? 600 : 500,
              background: filter === value ? "var(--ink)" : "var(--surface)",
              color: filter === value ? "var(--surface)" : "var(--ink)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {cashFlow.data && filter !== "uncategorized" && !debounced && (
        <div className="card pad" style={{ display: "flex", justifyContent: "space-between", padding: 16 }}>
          <Stat label="Income" value={money(Math.round(Number(cashFlow.data.income) * 100), cashFlow.data.currency, { cents: false })} tone="good" />
          <Stat label="Spent" value={money(Math.round(Number(cashFlow.data.spending) * 100), cashFlow.data.currency, { cents: false })} />
          <Stat label="Savings rate" value={cashFlow.data.savings_rate ? `${Math.round(Number(cashFlow.data.savings_rate))}%` : "—"} tone="brand" />
        </div>
      )}

      {first.loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} height={22} />
          ))}
        </div>
      )}

      {!first.loading && rows.length === 0 && <p className="muted" style={{ textAlign: "center", paddingTop: 40 }}>No transactions match.</p>}

      <div style={{ display: "flex", flexDirection: "column", padding: "0 4px" }}>
        {groups.map(([day, items]) => (
          <div key={day}>
            <div className="eyebrow" style={{ color: "var(--ink-3)", padding: "14px 0 4px" }}>
              {dayLabel(day)}
            </div>
            {items.map((t) => (
              <TransactionRow key={t.id} t={t} />
            ))}
          </div>
        ))}
        <div ref={sentinel} style={{ height: 1 }} />
      </div>

      <button className="fab pressable" aria-label="Add transaction" onClick={() => navigate("/transactions/new")}>
        <Plus size={22} strokeWidth={2.4} />
      </button>
    </main>
  );
}

export function TransactionRow({ t }: { t: Transaction }) {
  const isTransfer = !!t.transfer || ["funds_movement", "cc_payment"].includes(t.kind);
  const income = t.classification === "income";
  return (
    <button className="row pressable" style={{ borderTop: 0, minHeight: 44, padding: "9px 0" }} onClick={() => navigate(`/transactions/${t.id}`)}>
      <span className="grow name" style={{ color: isTransfer ? "var(--ink-3)" : undefined }}>
        {isTransfer ? "↔ " : ""}
        {t.merchant?.name ?? t.name}
      </span>
      {!isTransfer && <CategoryChip category={t.category} />}
      <span className="amt" style={{ color: income ? "var(--good)" : isTransfer ? "var(--ink-3)" : undefined }}>
        {income ? "+" : ""}
        {money(t.amount_cents, t.currency)}
      </span>
      {!t.reviewed_at && !isTransfer && <span aria-label="Not reviewed" style={{ width: 6, height: 6, borderRadius: 3, background: "var(--brand)", flexShrink: 0 }} />}
    </button>
  );
}

function groupByDay(rows: Transaction[]) {
  const map = new Map<string, Transaction[]>();
  for (const t of rows) {
    const list = map.get(t.date) ?? [];
    list.push(t);
    map.set(t.date, list);
  }
  return [...map.entries()];
}
