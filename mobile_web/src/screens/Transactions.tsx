import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { ArrowLeftRight, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CategoryChip, Empty, ErrorBlock, Skeleton, Stat } from "../components/ui";
import { api } from "../lib/api";
import { dayLabel, decimalToCents, isoDate, money, monthName, today } from "../lib/format";
import { go, openSheet } from "../lib/nav";
import { useApi } from "../lib/query";
import type { TransactionPage } from "../lib/transactions";
import type { Account, Transaction } from "../lib/types";

const FILTERS = [
  [undefined, "All"],
  ["month", "This month"],
  ["uncategorized", "Uncategorized"],
] as const;

export function Transactions() {
  const { filter, in: accountId } = useSearch({ from: "/tabs/transactions" });
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  const query = useMemo(() => {
    const q: Record<string, unknown> = { per_page: 50 };
    if (debounced) q.search = debounced;
    if (accountId) q.account_id = accountId;
    if (filter === "month") q.start_date = isoDate(new Date(today().getFullYear(), today().getMonth(), 1));
    if (filter === "uncategorized") {
      q.uncategorized = true;
      q.exclude_transfers = true;
    }
    return q;
  }, [debounced, filter, accountId]);

  const list = useInfiniteQuery({
    queryKey: ["/transactions", query, "pages"],
    queryFn: ({ pageParam }) => api<TransactionPage>("/transactions", { query: { ...query, page: pageParam } }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination.page < last.pagination.total_pages ? last.pagination.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
  const account = useApi<Account>(accountId ? `/accounts/${accountId}` : null);
  const cashFlow = useApi<{ income: string; spending: string; savings_rate: string | null; currency: string }>("/cash_flow");

  // Infinite scroll: the next page loads as the sentinel nears the screen.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage(), { rootMargin: "400px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [list.hasNextPage, list.isFetchingNextPage, list.fetchNextPage]);

  const rows = list.data?.pages.flatMap((p) => p.transactions) ?? [];
  const groups = groupByDay(rows);
  const setFilter = (value: (typeof FILTERS)[number][0]) => go("/transactions", { replace: true, search: { filter: value, in: accountId } });
  const searching = search.trim().length > 0;

  return (
    <main className="page" style={{ gap: 14 }}>
      <label className="search">
        <Search size={18} color="var(--ink-3)" aria-hidden />
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search transactions" enterKeyHint="search" aria-label="Search transactions" />
        {searching && (
          <button className="pressable clear" aria-label="Clear search" onClick={() => setSearch("")}>
            <X size={16} />
          </button>
        )}
      </label>

      <div className="filters" data-noswipe>
        {accountId && (
          <button className="filter pressable" aria-pressed onClick={() => go("/transactions", { replace: true, search: { filter } })}>
            {account.data?.name ?? "Account"} <X size={14} aria-label="Remove account filter" />
          </button>
        )}
        {FILTERS.map(([value, label]) => (
          <button key={label} className="filter pressable" aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {label}
          </button>
        ))}
      </div>

      {filter === "month" && !accountId && !searching && (
        <div className="card pad stats">
          {cashFlow.data ? (
            <>
              <Stat label={`${monthName(isoDate(today()))} income`} value={money(decimalToCents(cashFlow.data.income), cashFlow.data.currency, { cents: false })} />
              <Stat label="Spent" value={money(decimalToCents(cashFlow.data.spending), cashFlow.data.currency, { cents: false })} />
              <Stat label="Saved" value={cashFlow.data.savings_rate ? `${Math.round(Number(cashFlow.data.savings_rate))}%` : "—"} />
            </>
          ) : (
            <Skeleton height={44} />
          )}
        </div>
      )}

      {list.isError && !list.data && (
        <div className="card list">
          <ErrorBlock what="transactions" onRetry={() => list.refetch()} />
        </div>
      )}

      {list.isPending && (
        <div className="card list">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="row">
              <Skeleton height={18} />
            </div>
          ))}
        </div>
      )}

      {list.isSuccess && rows.length === 0 && (
        <div className="card list">
          <Empty action={searching || filter ? "Show all" : undefined} onAction={() => (setSearch(""), setFilter(undefined))}>
            {searching ? `Nothing matches “${search.trim()}”.` : filter === "uncategorized" ? "Everything has a category." : "No transactions yet."}
          </Empty>
        </div>
      )}

      <div style={{ opacity: list.isPlaceholderData ? 0.5 : 1, transition: "opacity 160ms" }}>
        {groups.map(([day, items]) => (
          <section key={day} className="day">
            <h2 className="day-head">
              <span>{dayLabel(day)}</span>
              <DaySpend items={items} />
            </h2>
            <div className="card list">
              {items.map((t) => (
                <TransactionRow key={t.id} t={t} />
              ))}
            </div>
          </section>
        ))}
        {list.isFetchingNextPage && (
          <div className="card list" style={{ marginTop: 12 }}>
            <div className="row">
              <Skeleton height={18} />
            </div>
          </div>
        )}
        <div ref={sentinel} style={{ height: 1 }} />
      </div>

      <button className="fab pressable" aria-label="Add transaction" onClick={() => openSheet({ add: true })}>
        <Plus size={24} strokeWidth={2.2} />
      </button>
    </main>
  );
}

const isTransfer = (t: Transaction) => !!t.transfer || ["funds_movement", "cc_payment"].includes(t.kind);

export function TransactionRow({ t }: { t: Transaction }) {
  const transfer = isTransfer(t);
  const income = t.classification === "income" && !transfer;
  return (
    <button className="row pressable" onClick={() => openSheet({ txn: t.id })}>
      <span className="grow name" style={{ color: transfer ? "var(--ink-3)" : undefined }}>
        {transfer && <ArrowLeftRight size={14} style={{ marginRight: 6, verticalAlign: -2 }} aria-label="Transfer" />}
        {t.merchant?.name ?? t.name}
      </span>
      {!transfer && <CategoryChip category={t.category} />}
      <span className="amt" style={{ color: income ? "var(--good-ink)" : transfer ? "var(--ink-3)" : undefined }}>
        {t.classification === "income" ? "+" : ""}
        {money(t.amount_cents, t.currency)}
      </span>
      <span className={`unreviewed${!t.reviewed_at && !transfer ? " on" : ""}`} aria-label={!t.reviewed_at && !transfer ? "Not reviewed" : undefined} />
    </button>
  );
}

// What the day cost: spending only, and only when it is in one currency.
function DaySpend({ items }: { items: Transaction[] }) {
  const spent = items.filter((t) => t.classification !== "income" && !isTransfer(t));
  if (!spent.length || spent.some((t) => t.currency !== spent[0].currency)) return null;
  return <span className="num">{money(spent.reduce((sum, t) => sum + t.amount_cents, 0), spent[0].currency)}</span>;
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
