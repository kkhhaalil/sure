import { useMutation } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";
import { PushedScreen } from "../components/Screen";
import { Bars, CategoryName, Dot, Empty, ErrorBlock, Figure, Section, Skeleton, Toggle, toast } from "../components/ui";
import { api } from "../lib/api";
import { decimalToCents, isoDate, money, monthName, today } from "../lib/format";
import { go } from "../lib/nav";
import { invalidate, queryClient, useApi } from "../lib/query";
import { useCurrentBudget } from "../lib/transactions";
import type { BudgetCategory, SpendingVsNormal, Transaction } from "../lib/types";
import { TransactionRow } from "./Transactions";

type Series = { currency: string; months: { month: string; income: string; spending: string }[] };

export function Spending() {
  const series = useApi<Series>("/cash_flow/series", { months: 12 });
  const vsNormal = useApi<SpendingVsNormal>("/spending_vs_normal");
  const { budget } = useCurrentBudget();
  const envelopes = useApi<{ budget_categories: BudgetCategory[] }>(budget ? "/budget_categories" : null, budget ? { budget_id: budget.id, include_amounts: true, per_page: 100 } : undefined);

  const months = series.data?.months ?? [];
  const values = months.map((m) => decimalToCents(m.spending));
  const thisMonth = values[values.length - 1] ?? 0;
  // The headline compares month-to-date with the same days of a normal
  // month; the bars compare whole months, so their line is the prior average.
  const mtdNormal = decimalToCents(vsNormal.data?.normal_total);
  const change = mtdNormal > 0 ? Math.round(((decimalToCents(vsNormal.data?.total) - mtdNormal) / mtdNormal) * 100) : null;
  const past = values.slice(0, -1).filter((v) => v > 0);
  const normal = past.length ? Math.round(past.reduce((a, b) => a + b, 0) / past.length) : 0;
  const currency = series.data?.currency ?? "USD";
  const envByCategory = new Map((envelopes.data?.budget_categories ?? []).map((c) => [c.category.id, c]));
  const rows = [...(vsNormal.data?.categories ?? [])].sort((a, b) => Number(b.change ?? 0) - Number(a.change ?? 0));

  return (
    <main className="page">
      <div className="card pad lead">
        <span className="label">Spent in {monthName(isoDate(today()))}</span>
        {series.isError ? (
          <ErrorBlock what="spending by month" onRetry={() => series.refetch()} />
        ) : series.data ? (
          <>
            <span className="display lead-figure"><Figure text={money(thisMonth, currency, { cents: false })} /></span>
            <span className="lead-sub">
              {change === null ? (
                "Not enough history to compare yet"
              ) : change === 0 ? (
                "Same as a normal month so far"
              ) : (
                <b style={{ color: change > 0 ? "var(--over)" : "var(--good-ink)" }}>
                  {Math.abs(change)}% {change > 0 ? "more" : "less"} than a normal month so far
                </b>
              )}
            </span>
            <div style={{ paddingTop: 10 }}>
              <Bars values={values} normal={normal || undefined} />
            </div>
            <div className="axis">
              <span>{months[0] && monthName(months[0].month, "short")}</span>
              {normal > 0 && <span>Dashed line: average month, {money(normal, currency, { cents: false })}</span>}
              <span>{months.at(-1) && monthName(months.at(-1)!.month, "short")}</span>
            </div>
          </>
        ) : (
          <>
            <Skeleton height={38} width="50%" />
            <Skeleton height={16} width="70%" />
            <Skeleton height={110} />
          </>
        )}
      </div>

      <Section title="By category, vs. normal">
        <div className="card list">
          {vsNormal.isError && <ErrorBlock what="categories" onRetry={() => vsNormal.refetch()} />}
          {vsNormal.isPending &&
            [0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="row">
                <Skeleton height={18} />
              </div>
            ))}
          {vsNormal.isSuccess && rows.length === 0 && <Empty>No spending this month yet.</Empty>}
          {rows.map((row) => {
            const delta = decimalToCents(row.change);
            const env = envByCategory.get(row.id);
            const Row = env ? "button" : "div";
            return (
              <Row key={row.id} className={`row${env ? " pressable" : ""}`} onClick={env ? () => go(`/categories/${env.id}`, { push: true }) : undefined}>
                <Dot color={row.color} />
                <CategoryName name={row.name} color={row.color} className="grow name" />
                <span className="num delta" style={{ color: row.change === null || delta === 0 ? "var(--ink-4)" : delta > 0 ? "var(--over)" : "var(--good-ink)" }}>
                  {row.change === null ? "new" : delta === 0 ? "—" : `${delta > 0 ? "+" : "−"}${money(Math.abs(delta), currency, { cents: false })}`}
                </span>
                <span className="amt">{money(decimalToCents(row.total), currency, { cents: false })}</span>
              </Row>
            );
          })}
        </div>
        {rows.length > 0 && <p className="footnote">Change against your usual spend by this day of the month.</p>}
      </Section>
    </main>
  );
}

export function CategoryDetail() {
  const { id } = useParams({ from: "/categories/$id" });
  const env = useApi<BudgetCategory>(`/budget_categories/${id}`);
  const category = env.data?.category;
  const series = useApi<Series>(category ? "/cash_flow/series" : null, category ? { months: 12, category_id: category.id } : undefined);
  const txns = useApi<{ transactions: Transaction[] }>(category ? "/transactions" : null, category ? { category_id: category.id, per_page: 20 } : undefined);
  const [editing, setEditing] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api<BudgetCategory>(`/budget_categories/${id}`, { method: "PATCH", body: { budget_category: patch } }),
    onSuccess: (updated) => {
      queryClient.setQueryData([`/budget_categories/${id}`], updated);
      invalidate("/budget");
      setEditing(null);
      toast("Budget updated");
    },
    onError: () => toast("Couldn't update the budget. Try again."),
  });

  const data = env.data;
  const currency = data?.currency ?? "USD";
  const values = (series.data?.months ?? []).map((m) => decimalToCents(m.spending));
  const avg = values.length > 1 ? Math.round(values.slice(0, -1).reduce((a, b) => a + b, 0) / (values.length - 1)) : 0;
  const left = data?.available_to_spend_cents ?? 0;

  return (
    <PushedScreen id={`category-${id}`} title={category?.name ?? "Category"} fallback="/spending">
      {env.isError ? (
        <ErrorBlock what="this category" onRetry={() => env.refetch()} />
      ) : !data ? (
        <div className="card pad lead">
          <Skeleton height={14} width="40%" />
          <Skeleton height={38} width="50%" />
          <Skeleton height={110} />
        </div>
      ) : (
        <>
          <div className="card pad lead">
            <span className="label">Spent in {monthName(isoDate(today()))}</span>
            <span className="display lead-figure"><Figure text={money(data.actual_spending_cents, currency, { cents: false })} /></span>
            <span className="lead-sub">
              {data.budgeted_spending_cents > 0 ? (
                <b style={{ color: left < 0 ? "var(--over)" : "var(--good-ink)" }}>
                  {money(Math.abs(left), currency, { cents: false })} {left < 0 ? "over" : "left"} of {money(data.budgeted_spending_cents, currency, { cents: false })}
                </b>
              ) : (
                "No budget set for this category"
              )}
            </span>
            <div style={{ paddingTop: 10 }}>{series.isError ? <ErrorBlock what="monthly spending" onRetry={() => series.refetch()} /> : <Bars values={values} normal={data.budgeted_spending_cents || undefined} />}</div>
            {data.budgeted_spending_cents > 0 && <div className="axis">Dashed line: this month's budget</div>}
          </div>

          <div className="card list">
            <div className="row">
              <span className="grow">Average month</span>
              <span className="amt">{values.length > 1 ? money(avg, currency, { cents: false }) : "—"}</span>
            </div>
            <div className="row">
              <span className="grow">Monthly budget</span>
              {editing === null ? (
                <button className="link pressable" onClick={() => setEditing(String(data.budgeted_spending_cents / 100))}>
                  {money(data.budgeted_spending_cents, currency, { cents: false })} · Edit
                </button>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const value = Number(editing.replace(",", "."));
                    if (Number.isFinite(value) && value >= 0) save.mutate({ budgeted_spending: value });
                  }}
                  style={{ display: "flex", gap: 8, alignItems: "center" }}
                >
                  <input autoFocus inputMode="decimal" aria-label="Monthly budget" value={editing} onChange={(e) => setEditing(e.target.value)} className="field compact" />
                  <button className="link pressable" type="submit" disabled={save.isPending}>
                    Save
                  </button>
                </form>
              )}
            </div>
            <div className="row">
              <span className="grow">Roll over what's left</span>
              <Toggle on={data.rollover_enabled} label="Roll over what's left" disabled={save.isPending} onChange={(on) => save.mutate({ rollover_enabled: on })} />
            </div>
          </div>

          <Section title="Recent transactions">
            <div className="card list">
              {txns.isError && <ErrorBlock what="transactions" onRetry={() => txns.refetch()} />}
              {txns.isPending &&
                [0, 1, 2].map((i) => (
                  <div key={i} className="row">
                    <Skeleton height={18} />
                  </div>
                ))}
              {txns.isSuccess && txns.data.transactions.length === 0 && <Empty>Nothing in this category yet.</Empty>}
              {(txns.data?.transactions ?? []).map((t) => (
                <TransactionRow key={t.id} t={t} />
              ))}
            </div>
          </Section>
        </>
      )}
    </PushedScreen>
  );
}
