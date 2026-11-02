import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { invalidate, useApi } from "../lib/data";
import { decimalToCents, isoDate, money, monthName, today } from "../lib/format";
import { back, navigate } from "../lib/router";
import type { BudgetCategory, SpendingVsNormal, Transaction } from "../lib/types";
import { Bars, Dot, PullIndicator, Section, Skeleton, Toggle, toast, usePullToRefresh } from "../components/ui";
import { TransactionRow } from "./Transactions";
import { useCurrentBudget } from "./Home";

type Series = { currency: string; months: { month: string; income: string; spending: string }[] };

export function Spending() {
  const series = useApi<Series>("/cash_flow/series", { months: 12 });
  const vsNormal = useApi<SpendingVsNormal>("/spending_vs_normal");
  const budget = useCurrentBudget();
  const envelopes = useApi<{ budget_categories: BudgetCategory[] }>(budget ? "/budget_categories" : null, budget ? { budget_id: budget.id, include_amounts: true, per_page: 100 } : undefined);
  const { pull, busy } = usePullToRefresh(() => Promise.all([series.reload(), vsNormal.reload(), envelopes.reload()]));

  const months = series.data?.months ?? [];
  const values = months.map((m) => decimalToCents(m.spending));
  const thisMonth = values[values.length - 1] ?? 0;
  // Headline compares month-to-date with the same days of a normal month;
  // the bars compare whole months, so their line is the prior months' average.
  const mtdNormal = decimalToCents(vsNormal.data?.normal_total);
  const change = mtdNormal > 0 ? Math.round(((decimalToCents(vsNormal.data?.total) - mtdNormal) / mtdNormal) * 100) : null;
  const past = values.slice(0, -1).filter((v) => v > 0);
  const normal = past.length ? Math.round(past.reduce((a, b) => a + b, 0) / past.length) : 0;
  const currency = series.data?.currency ?? "USD";
  const envByCategory = new Map((envelopes.data?.budget_categories ?? []).map((c) => [c.category.id, c]));

  const rows = [...(vsNormal.data?.categories ?? [])].sort((a, b) => Number(b.change ?? 0) - Number(a.change ?? 0));

  return (
    <main className="page" style={{ gap: 16 }}>
      <PullIndicator pull={pull} busy={busy} />
      <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="eyebrow" style={{ color: "var(--ink-3)" }}>
          {monthName(isoDate(today()))} spending
        </span>
        {series.data ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span className="display" style={{ fontSize: 38 }}>
                {money(thisMonth, currency, { cents: false })}
              </span>
              {change !== null && (
                <span style={{ fontSize: 14, fontWeight: 600, color: change > 0 ? "var(--over)" : "var(--good)" }}>
                  {change > 0 ? "↑" : "↓"} {Math.abs(change)}% vs normal
                </span>
              )}
            </div>
            <div style={{ paddingTop: 8 }}>
              <Bars values={values} normal={normal || undefined} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }} className="muted">
              <span>{months[0] && monthName(months[0].month, "short")}</span>
              {normal > 0 && <span>Avg month {money(normal, currency, { cents: false })}</span>}
              <span>{months.at(-1) && monthName(months.at(-1)!.month, "short")}</span>
            </div>
          </>
        ) : (
          <>
            <Skeleton height={38} width="50%" />
            <Skeleton height={110} />
          </>
        )}
      </div>

      <Section title="Vs. your normal">
        <div className="card list">
          {rows.length === 0 && <div style={{ padding: "16px 0" }} className="muted">{vsNormal.loading ? "Loading…" : "Not enough history yet."}</div>}
          {rows.map((row) => {
            const delta = decimalToCents(row.change);
            const env = envByCategory.get(row.id);
            return (
              <button key={row.id} className="row pressable" onClick={() => env && navigate(`/categories/${env.id}`)}>
                <Dot color={row.color} />
                <span className="grow name" style={{ fontWeight: 500 }}>
                  {row.name}
                </span>
                {row.change !== null && (
                  <span className="num" style={{ fontSize: 14, fontWeight: 600, width: 72, textAlign: "right", color: delta > 0 ? "var(--over)" : "var(--good)" }}>
                    {delta > 0 ? "+" : "−"}
                    {money(Math.abs(delta), currency, { cents: false })}
                  </span>
                )}
                <span className="amt" style={{ minWidth: 66 }}>
                  {money(decimalToCents(row.total), currency, { cents: false })}
                </span>
              </button>
            );
          })}
        </div>
      </Section>
    </main>
  );
}

export function CategoryDetail({ id }: { id: string }) {
  const { data: env, reload } = useApi<BudgetCategory>(`/budget_categories/${id}`);
  const series = useApi<Series>(env ? "/cash_flow/series" : null, env ? { months: 12, category_id: env.category.id } : undefined);
  const txns = useApi<{ transactions: Transaction[] }>(env ? "/transactions" : null, env ? { category_id: env.category.id, per_page: 20 } : undefined);
  const [editing, setEditing] = useState<string | null>(null);

  const currency = env?.currency ?? "USD";
  const values = (series.data?.months ?? []).map((m) => decimalToCents(m.spending));
  const avg = values.length > 1 ? Math.round(values.slice(0, -1).reduce((a, b) => a + b, 0) / (values.length - 1)) : 0;
  const left = env?.available_to_spend_cents ?? 0;

  const save = async (patch: Record<string, unknown>) => {
    await api(`/budget_categories/${id}`, { method: "PATCH", body: { budget_category: patch } });
    invalidate("/budget");
    await reload();
    toast("Budget updated");
  };

  return (
    <main className="page plain" style={{ gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 44 }}>
        <button className="icon-btn pressable" style={{ color: "var(--ink)" }} aria-label="Back" onClick={() => back("/spending")}>
          <ChevronLeft size={26} />
        </button>
        <span style={{ fontWeight: 600 }}>Category</span>
        <span style={{ width: 44 }} />
      </div>
      {!env ? (
        <Skeleton height={200} />
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <span className="display" style={{ fontSize: 30, color: env.category.color }}>
              {env.category.name}
            </span>
            <span className="display" style={{ fontSize: 44 }}>
              {money(env.actual_spending_cents, currency, { cents: false })}
            </span>
            <span style={{ fontSize: 15, fontWeight: 600, color: left < 0 ? "var(--over)" : "var(--good)" }}>
              {money(Math.abs(left), currency, { cents: false })} {left < 0 ? "over" : "left"} · budget {money(env.budgeted_spending_cents, currency, { cents: false })}
            </span>
          </div>
          <Bars values={values} normal={env.budgeted_spending_cents || undefined} />
          <div className="card list">
            <div className="row">
              <span className="grow muted">Average per month</span>
              <span className="amt">{money(avg, currency, { cents: false })}</span>
            </div>
            <div className="row">
              <span className="grow muted">Rollover</span>
              <Toggle on={env.rollover_enabled} label="Rollover" onChange={(on) => save({ rollover_enabled: on })} />
            </div>
            <div className="row">
              <span className="grow muted">Budget</span>
              {editing === null ? (
                <button className="link pressable" style={{ fontSize: 15, fontWeight: 600 }} onClick={() => setEditing(String(env.budgeted_spending_cents / 100))}>
                  {money(env.budgeted_spending_cents, currency, { cents: false })} · Edit
                </button>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    save({ budgeted_spending: Number(editing) }).then(() => setEditing(null));
                  }}
                  style={{ display: "flex", gap: 8 }}
                >
                  <input autoFocus inputMode="decimal" value={editing} onChange={(e) => setEditing(e.target.value)} className="field" style={{ height: 40, width: 110, textAlign: "right" }} />
                  <button className="link pressable" type="submit" style={{ fontWeight: 600 }}>
                    Save
                  </button>
                </form>
              )}
            </div>
          </div>
          <Section title="Transactions">
            <div style={{ padding: "0 4px" }}>
              {(txns.data?.transactions ?? []).map((t) => (
                <TransactionRow key={t.id} t={t} />
              ))}
            </div>
          </Section>
        </>
      )}
    </main>
  );
}
