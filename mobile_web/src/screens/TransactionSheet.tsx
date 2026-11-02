import { useMutation } from "@tanstack/react-query";
import { Check, ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Sheet } from "../components/Sheet";
import { CategoryChip, Dot, Empty, ErrorBlock, Skeleton, Toggle, toast } from "../components/ui";
import { api } from "../lib/api";
import { dayLabel, money } from "../lib/format";
import { closeSheet, openSheet } from "../lib/nav";
import { invalidate, useApi } from "../lib/query";
import { useCurrentBudget, usePatchTransaction, useTransaction } from "../lib/transactions";
import type { BudgetCategory, CategoryRef } from "../lib/types";

type SheetProps = { id: string; open: boolean; onExited: () => void };

export function TransactionSheet({ id, open, onExited }: SheetProps) {
  const { data: t, isError, refetch } = useTransaction(id);
  const patch = usePatchTransaction();
  const [notes, setNotes] = useState<string | null>(null);
  const close = () => closeSheet("txn");

  const save = (attrs: Record<string, unknown>, done?: string) =>
    patch.mutate({ id, attrs }, { onSuccess: () => done && toast(done), onError: () => toast("Couldn't save. Try again.") });

  const remove = useMutation({
    mutationFn: () => api(`/transactions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate("/transactions", "/budget", "/cash_flow");
      toast("Transaction deleted");
      close();
    },
    onError: () => toast("Couldn't delete it. Try again."),
  });

  const income = t?.classification === "income";

  return (
    <Sheet open={open} onClose={close} onExited={onExited} label="Transaction">
      {!t ? (
        isError ? (
          <ErrorBlock what="this transaction" onRetry={() => refetch()} />
        ) : (
          <div className="txn-head">
            <Skeleton height={14} width="50%" />
            <Skeleton height={48} width="56%" />
            <Skeleton height={22} width="40%" />
            <div style={{ alignSelf: "stretch", paddingTop: 20, display: "grid", gap: 12 }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} height={40} />
              ))}
            </div>
          </div>
        )
      ) : (
        <>
          <div className="txn-head">
            <span className="review-meta">
              {dayLabel(t.date)} · {t.account.name}
            </span>
            <span className="display txn-amount" style={{ color: income ? "var(--good-ink)" : undefined }}>
              {income ? "+" : ""}
              {money(t.amount_cents, t.currency)}
            </span>
            <span className="review-name">{t.merchant?.name ?? t.name}</span>
            <span className={`status${t.reviewed_at ? " done" : ""}`}>{t.reviewed_at ? "Reviewed" : "Not reviewed yet"}</span>
          </div>

          <div className="fields">
            <button className="field-row pressable" onClick={() => openSheet({ pick: id })}>
              <span className="field-label">Category</span>
              <span className="field-value">
                <CategoryChip category={t.category} />
                <ChevronRight size={18} color="var(--ink-4)" />
              </span>
            </button>
            {t.merchant && t.merchant.name !== t.name && (
              <div className="field-row">
                <span className="field-label">Bank description</span>
                <span className="field-value muted ellipsis">{t.name}</span>
              </div>
            )}
            {t.tags.length > 0 && (
              <div className="field-row">
                <span className="field-label">Tags</span>
                <span className="field-value" style={{ gap: 6, flexWrap: "wrap" }}>
                  {t.tags.map((tag) => (
                    <span key={tag.id} className="tag">
                      {tag.name}
                    </span>
                  ))}
                </span>
              </div>
            )}
            <label className="field-row">
              <span className="field-label">Note</span>
              <input
                className="field-input"
                value={notes ?? t.notes ?? ""}
                placeholder="Add a note"
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => notes !== null && notes !== (t.notes ?? "") && save({ notes }, "Note saved")}
              />
            </label>
            <div className="field-row">
              <span className="field-label">Leave out of budgets</span>
              <Toggle on={t.excluded} label="Leave out of budgets" disabled={patch.isPending} onChange={(on) => save({ excluded: on })} />
            </div>
          </div>

          <div className="sheet-actions">
            {!t.reviewed_at && (
              <button className="btn primary pressable" style={{ flex: 2 }} disabled={patch.isPending} onClick={() => save({ reviewed: true }, "Marked reviewed")}>
                Mark reviewed
              </button>
            )}
            <button
              className="btn soft pressable"
              style={{ flex: 1, color: "var(--over)" }}
              disabled={remove.isPending}
              onClick={() => confirm(`Delete “${t.merchant?.name ?? t.name}”? This can't be undone.`) && remove.mutate()}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

type CategoryRow = CategoryRef & { parent?: { id: string; name: string } | null };

export function CategoryPicker({ id, open, onExited }: SheetProps) {
  const { data: t } = useTransaction(id);
  const categories = useApi<{ categories: CategoryRow[] }>("/categories", { per_page: 200 }, { staleTime: 300_000 });
  const { budget } = useCurrentBudget();
  const envelopes = useApi<{ budget_categories: BudgetCategory[] }>(budget ? "/budget_categories" : null, budget ? { budget_id: budget.id, include_amounts: true, per_page: 100 } : undefined);
  const patch = usePatchTransaction();
  const [search, setSearch] = useState("");
  const [always, setAlways] = useState(false);
  const close = () => closeSheet("pick");

  const remaining = useMemo(() => new Map((envelopes.data?.budget_categories ?? []).map((c) => [c.category.id, c])), [envelopes.data]);

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = (categories.data?.categories ?? []).filter((c) => !term || c.name.toLowerCase().includes(term));
    const map = new Map<string, CategoryRow[]>();
    for (const c of all) {
      const group = c.parent?.name ?? "Categories";
      map.set(group, [...(map.get(group) ?? []), c]);
    }
    return [...map.entries()].sort(([a], [b]) => (a === "Categories" ? -1 : b === "Categories" ? 1 : a.localeCompare(b)));
  }, [categories.data, search]);

  const choose = (category: CategoryRow) => {
    patch.mutate(
      { id, attrs: { category_id: category.id } },
      {
        onSuccess: async () => {
          if (always) {
            await api("/rules/from_transaction", { method: "POST", body: { transaction_id: id, category_id: category.id } }).catch(() => null);
            toast(`Future ${t?.merchant?.name ?? "matches"} go to ${category.name}`);
          } else toast(`Moved to ${category.name}`);
        },
        onError: () => toast("Couldn't change the category. Try again."),
      },
    );
    close();
  };

  return (
    <Sheet open={open} onClose={close} onExited={onExited} label="Choose category" tall>
      <h2 className="sheet-title">Category</h2>
      <label className="search sunk">
        <Search size={18} color="var(--ink-3)" aria-hidden />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search categories" aria-label="Search categories" />
      </label>

      {categories.isError && <ErrorBlock what="categories" onRetry={() => categories.refetch()} />}
      {categories.isPending && (
        <div style={{ display: "grid", gap: 14, paddingTop: 14 }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} height={22} />
          ))}
        </div>
      )}
      {categories.isSuccess && groups.length === 0 && <Empty>No category called “{search.trim()}”.</Empty>}

      {groups.map(([group, items]) => (
        <section key={group} className="picker-group">
          <h3 className="day-head">{group}</h3>
          {items.map((c) => {
            const env = remaining.get(c.id);
            const left = env?.available_to_spend_cents;
            const selected = t?.category?.id === c.id;
            return (
              <button key={c.id} className="row pressable" aria-pressed={selected} onClick={() => choose(c)}>
                <Dot color={c.color} size={12} />
                <span className="grow name" style={{ fontWeight: selected ? 600 : 500 }}>
                  {c.name}
                </span>
                {left !== undefined && env!.budgeted_spending_cents > 0 && (
                  <span className="num" style={{ fontSize: 14, color: left < 0 ? "var(--over)" : "var(--ink-3)" }}>
                    {money(Math.abs(left), env!.currency, { cents: false })} {left < 0 ? "over" : "left"}
                  </span>
                )}
                <span style={{ width: 20, flexShrink: 0 }}>{selected && <Check size={20} color="var(--brand)" strokeWidth={2.5} />}</span>
              </button>
            );
          })}
        </section>
      ))}

      <div className="picker-foot">
        <button className="row pressable" role="checkbox" aria-checked={always} onClick={() => setAlways((v) => !v)}>
          <span className={`check${always ? " on" : ""}`}>{always && <Check size={13} color="#fff" strokeWidth={3} />}</span>
          <span className="grow" style={{ fontSize: 15 }}>
            Always use this for “{t?.merchant?.name ?? t?.name ?? "this"}”
          </span>
        </button>
      </div>
    </Sheet>
  );
}
