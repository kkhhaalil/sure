import { api } from "../lib/api";
import { invalidate, useApi } from "../lib/data";
import { inDays, money, isoDate, today } from "../lib/format";
import { navigate } from "../lib/router";
import type { Budget, BudgetCategory, PacePoint, Recurring, Transaction } from "../lib/types";
import { CategoryChip, PaceChart, PullIndicator, Ring, Section, Skeleton, toast, usePullToRefresh } from "../components/ui";

type Page<K extends string, T> = Record<K, T[]>;

// The list omits spending amounts, so read the current budget's detail.
export function useCurrentBudget() {
  const start = isoDate(new Date(today().getFullYear(), today().getMonth(), 1));
  const { data } = useApi<Page<"budgets", Budget>>("/budgets", { start_date: start, per_page: 5 });
  const summary = data?.budgets.find((b) => b.current) ?? data?.budgets[0];
  return useApi<Budget>(summary ? `/budgets/${summary.id}` : null).data;
}

export function Home() {
  const budget = useCurrentBudget();
  const pace = useApi<{ points: PacePoint[]; budgeted_spending_cents: number }>(budget ? `/budgets/${budget.id}/pace` : null);
  const review = useApi<Page<"transactions", Transaction> & { pagination: { total_count: number } }>("/transactions", {
    reviewed: false,
    exclude_transfers: true,
    per_page: 3,
    start_date: isoDate(new Date(Date.now() - 30 * 86_400_000)),
  });
  const categories = useApi<Page<"budget_categories", BudgetCategory>>(budget ? "/budget_categories" : null, budget ? { budget_id: budget.id, include_amounts: true, per_page: 100 } : undefined);
  const recurring = useApi<Page<"recurring_transactions", Recurring>>("/recurring_transactions", { status: "active", per_page: 50 });
  const cashFlow = useApi<{ income: string; spending: string; net_savings: string; currency: string }>("/cash_flow");

  const refreshAll = () => Promise.all([pace.reload(), review.reload(), categories.reload(), recurring.reload(), cashFlow.reload()]);
  const { pull, busy } = usePullToRefresh(refreshAll);

  const currency = budget?.currency ?? "USD";
  const budgeted = budget?.budgeted_spending_cents ?? 0;
  const left = budget?.available_to_spend_cents ?? 0;
  const points = (pace.data?.points ?? []).map((p) => ({ actual: p.actual_cumulative_cents, ideal: p.ideal_cumulative_cents }));
  const last = points[points.length - 1];
  const paceDelta = last ? last.ideal - last.actual : 0;

  const rings = (categories.data?.budget_categories ?? [])
    .filter((c) => !c.subcategory && c.budgeted_spending_cents > 0)
    .sort((a, b) => b.actual_spending_cents / b.budgeted_spending_cents - a.actual_spending_cents / a.budgeted_spending_cents)
    .slice(0, 8);

  const upcoming = (recurring.data?.recurring_transactions ?? [])
    .filter((r) => r.next_expected_date && r.next_expected_date >= isoDate(today()))
    .sort((a, b) => (a.next_expected_date! < b.next_expected_date! ? -1 : 1))
    .slice(0, 6);

  const toReview = review.data?.transactions ?? [];
  const reviewCount = review.data?.pagination.total_count ?? 0;

  const markReviewed = async () => {
    await api("/transactions/review", { method: "POST", body: { ids: toReview.map((t) => t.id) } });
    toast(`${toReview.length} marked reviewed`);
    invalidate("/transactions");
  };

  return (
    <main className="page">
      <PullIndicator pull={pull} busy={busy} />

      <button className="card pad pressable" style={{ display: "flex", flexDirection: "column", gap: 6, textAlign: "left" }} onClick={() => navigate("/spending")}>
        {budget ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <span className="display" style={{ fontSize: 34 }}>
                {money(Math.abs(left), currency, { cents: false })}{" "}
                <span style={{ fontFamily: "var(--font)", fontSize: 17, fontWeight: 500, letterSpacing: 0, color: "var(--ink-2)" }}>{left >= 0 ? "left" : "over"}</span>
              </span>
              {last && <span className={`badge ${paceDelta >= 0 ? "good" : "over"}`}>{money(Math.abs(paceDelta), currency, { cents: false })} {paceDelta >= 0 ? "under" : "over"} pace</span>}
            </div>
            <span className="muted" style={{ fontSize: 14 }}>
              of {money(budgeted, currency, { cents: false })} budgeted
            </span>
            <PaceChart points={points} total={budgeted} />
          </>
        ) : (
          <>
            <Skeleton height={34} width="60%" />
            <Skeleton height={14} width="40%" />
            <Skeleton height={96} />
          </>
        )}
      </button>

      {reviewCount > 0 && (
        <Section title={`To review · ${reviewCount}`} action="View all" onAction={() => navigate("/review")}>
          <div className="card" style={{ padding: "6px 16px 14px" }}>
            {toReview.map((t) => (
              <button key={t.id} className="row pressable" onClick={() => navigate(`/transactions/${t.id}`)}>
                <span className="grow name">{t.merchant?.name ?? t.name}</span>
                <CategoryChip category={t.category} />
                <span className="amt">{money(t.amount_cents, t.currency)}</span>
              </button>
            ))}
            <button className="btn tint pressable" style={{ marginTop: 6 }} onClick={markReviewed}>
              Mark {toReview.length} as reviewed
            </button>
          </div>
        </Section>
      )}

      {rings.length > 0 && (
        <Section title="Budgets" action="Spending" onAction={() => navigate("/spending")}>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", margin: "0 -16px", padding: "0 16px", scrollbarWidth: "none" }} data-noswipe>
            {rings.map((c) => {
              const remaining = c.available_to_spend_cents;
              return (
                <button key={c.id} className="pressable" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 64, flexShrink: 0 }} onClick={() => navigate(`/categories/${c.id}`)}>
                  <Ring spent={c.actual_spending_cents} budget={c.budgeted_spending_cents} label={c.category.name[0]} />
                  <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>
                    {money(Math.abs(remaining), currency, { cents: false })}
                  </span>
                  <span style={{ fontSize: 12, color: remaining < 0 ? "var(--over)" : "var(--ink-3)" }}>{remaining < 0 ? "over" : "left"}</span>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {upcoming.length > 0 && (
        <Section title="Upcoming" action="Recurring" onAction={() => navigate("/recurring")}>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", margin: "0 -16px", padding: "0 16px", scrollbarWidth: "none" }} data-noswipe>
            {upcoming.map((r) => (
              <div key={r.id} className="card" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4, minWidth: 168, flexShrink: 0 }}>
                <span className="muted" style={{ fontSize: 12 }}>
                  {inDays(r.next_expected_date!)}
                </span>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 96 }}>{r.merchant?.name ?? r.name}</span>
                  <span className="num" style={{ fontSize: 15, fontWeight: 600 }}>
                    {money(r.amount_cents, r.currency)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {cashFlow.data && (
        <Section title="This month" action="Transactions" onAction={() => navigate("/transactions")}>
          <div className="card pad" style={{ display: "flex", justifyContent: "space-between" }}>
            <Stat label="Income" value={money(Math.round(Number(cashFlow.data.income) * 100), cashFlow.data.currency, { cents: false })} tone="good" />
            <Stat label="Spent" value={money(Math.round(Number(cashFlow.data.spending) * 100), cashFlow.data.currency, { cents: false })} />
            <Stat label="Net" value={money(Math.round(Number(cashFlow.data.net_savings) * 100), cashFlow.data.currency, { cents: false, sign: true })} tone="brand" />
          </div>
        </Section>
      )}
    </main>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "brand" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span className="num" style={{ fontSize: 18, fontWeight: 700, color: tone === "good" ? "var(--good)" : tone === "brand" ? "var(--brand)" : "var(--ink)" }}>
        {value}
      </span>
      <span className="eyebrow" style={{ fontSize: 11, color: "var(--ink-3)" }}>
        {label}
      </span>
    </div>
  );
}
