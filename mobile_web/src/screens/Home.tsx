import { CategoryChip, Empty, ErrorBlock, PaceChart, Ring, Section, Skeleton, Stat, toast } from "../components/ui";
import { decimalToCents, inDays, isoDate, money, monthName, today } from "../lib/format";
import { go, openSheet } from "../lib/nav";
import { useApi } from "../lib/query";
import { reviewQuery, type TransactionPage, useCurrentBudget, useMarkReviewed } from "../lib/transactions";
import type { BudgetCategory, PacePoint, Recurring } from "../lib/types";

export function Home() {
  const { budget, missing, isError: budgetError, refetch: refetchBudget } = useCurrentBudget();
  const pace = useApi<{ points: PacePoint[]; budgeted_spending_cents: number }>(budget ? `/budgets/${budget.id}/pace` : null);
  const review = useApi<TransactionPage>("/transactions", reviewQuery(3));
  const categories = useApi<{ budget_categories: BudgetCategory[] }>(budget ? "/budget_categories" : null, budget ? { budget_id: budget.id, include_amounts: true, per_page: 100 } : undefined);
  const recurring = useApi<{ recurring_transactions: Recurring[] }>("/recurring_transactions", { status: "active", per_page: 50 });
  const cashFlow = useApi<{ income: string; spending: string; net_savings: string; currency: string }>("/cash_flow");
  const markReviewed = useMarkReviewed();

  const currency = budget?.currency ?? "USD";
  const budgeted = budget?.budgeted_spending_cents ?? 0;
  const left = budget?.available_to_spend_cents ?? 0;
  const points = (pace.data?.points ?? []).map((p) => ({ actual: p.actual_cumulative_cents, ideal: p.ideal_cumulative_cents }));
  const last = points[points.length - 1];
  const paceDelta = last ? last.ideal - last.actual : 0;
  const month = monthName(isoDate(today()));
  const Lead = budget ? "button" : "div";

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

  const markShown = () => {
    const ids = toReview.map((t) => t.id);
    markReviewed.mutate(ids, {
      onSuccess: () => toast(`${ids.length} marked reviewed`),
      onError: () => toast("Couldn't mark them reviewed. Try again."),
    });
  };

  return (
    <main className="page">
      <Lead className={`card pad lead${budget ? " pressable" : ""}`} onClick={budget ? () => go("/spending") : undefined}>
        {budget ? (
          <>
            <span className="label">{month} budget</span>
            <span className="display lead-figure">
              {money(Math.abs(left), currency, { cents: false })} <span className="lead-unit">{left >= 0 ? "left" : "over"}</span>
            </span>
            <span className="lead-sub">
              of {money(budgeted, currency, { cents: false })} budgeted
              {last && (
                <>
                  {" · "}
                  <b style={{ color: paceDelta >= 0 ? "var(--good-ink)" : "var(--over)" }}>
                    {money(Math.abs(paceDelta), currency, { cents: false })} {paceDelta >= 0 ? "under" : "over"} pace
                  </b>
                </>
              )}
            </span>
            {pace.isError ? <ErrorBlock what="the pace chart" onRetry={() => pace.refetch()} /> : <PaceChart points={points} total={budgeted} />}
          </>
        ) : budgetError ? (
          <ErrorBlock what="your budget" onRetry={refetchBudget} />
        ) : missing ? (
          <>
            <span className="label">{month} budget</span>
            <span className="display lead-figure">No budget yet</span>
            <span className="lead-sub">Set one on the web and your pace shows here.</span>
            <a className="link" href="/budgets">
              Set up a budget
            </a>
          </>
        ) : (
          <>
            <Skeleton height={14} width="34%" />
            <Skeleton height={38} width="62%" />
            <Skeleton height={16} width="54%" />
            <Skeleton height={96} />
          </>
        )}
      </Lead>

      {review.isError ? (
        <Section title="To review">
          <div className="card list">
            <ErrorBlock what="transactions to review" onRetry={() => review.refetch()} />
          </div>
        </Section>
      ) : (
        reviewCount > 0 && (
          <Section title={`To review · ${reviewCount}`} action="Review all" onAction={() => go("/review", { push: true })}>
            <div className="card list">
              {toReview.length === 0
                ? [0, 1, 2].slice(0, Math.min(3, reviewCount)).map((i) => (
                    <div key={i} className="row">
                      <Skeleton height={18} />
                    </div>
                  ))
                : toReview.map((t) => (
                    <button key={t.id} className="row pressable" onClick={() => openSheet({ txn: t.id })}>
                      <span className="grow name">{t.merchant?.name ?? t.name}</span>
                      <CategoryChip category={t.category} />
                      <span className="amt">{money(t.amount_cents, t.currency)}</span>
                    </button>
                  ))}
              <div className="row">
                <button className="btn tint pressable" disabled={markReviewed.isPending || toReview.length === 0} onClick={markShown}>
                  {toReview.length > 1 ? `Mark these ${toReview.length} reviewed` : "Mark reviewed"}
                </button>
              </div>
            </div>
          </Section>
        )
      )}

      {rings.length > 0 && (
        <Section title="Budgets" action="Spending" onAction={() => go("/spending")}>
          <div className="rail" data-noswipe>
            {rings.map((c) => {
              const remaining = c.available_to_spend_cents;
              return (
                <button key={c.id} className="ring-item pressable" onClick={() => go(`/categories/${c.id}`, { push: true })}>
                  <Ring spent={c.actual_spending_cents} budget={c.budgeted_spending_cents} />
                  <span className="ring-name">{c.category.name}</span>
                  <span className="ring-left" style={{ color: remaining < 0 ? "var(--over)" : undefined }}>
                    {money(Math.abs(remaining), currency, { cents: false })} {remaining < 0 ? "over" : "left"}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="Upcoming" action="Recurring" onAction={() => go("/recurring")}>
        {recurring.isError ? (
          <div className="card list">
            <ErrorBlock what="upcoming bills" onRetry={() => recurring.refetch()} />
          </div>
        ) : recurring.isPending ? (
          <div className="rail">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card bill">
                <Skeleton height={13} width="50%" />
                <Skeleton height={18} />
              </div>
            ))}
          </div>
        ) : upcoming.length === 0 ? (
          <div className="card list">
            <Empty>No bills expected in the next weeks.</Empty>
          </div>
        ) : (
          <div className="rail" data-noswipe>
            {upcoming.map((r) => (
              <div key={r.id} className="card bill">
                <span className="label">{inDays(r.next_expected_date!)}</span>
                <span className="bill-name">{r.merchant?.name ?? r.name}</span>
                <span className="num bill-amt">{money(r.amount_cents, r.currency)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={`${month} so far`} action="Transactions" onAction={() => go("/transactions", { search: { filter: "month" } })}>
        <div className="card pad stats">
          {cashFlow.isError ? (
            <ErrorBlock what="this month's cash flow" onRetry={() => cashFlow.refetch()} />
          ) : cashFlow.data ? (
            <>
              <Stat label="Income" value={money(decimalToCents(cashFlow.data.income), cashFlow.data.currency, { cents: false })} />
              <Stat label="Spent" value={money(decimalToCents(cashFlow.data.spending), cashFlow.data.currency, { cents: false })} />
              <Stat
                label="Net"
                value={money(decimalToCents(cashFlow.data.net_savings), cashFlow.data.currency, { cents: false, sign: true })}
                tone={decimalToCents(cashFlow.data.net_savings) < 0 ? "over" : undefined}
              />
            </>
          ) : (
            [0, 1, 2].map((i) => (
              <div key={i} className="stat">
                <Skeleton height={13} width={48} />
                <Skeleton height={22} width={72} />
              </div>
            ))
          )}
        </div>
      </Section>
    </main>
  );
}
