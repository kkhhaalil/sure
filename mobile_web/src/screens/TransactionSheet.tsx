import { Check, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Sheet } from "../components/Sheet";
import { CategoryChip, Dot, Skeleton, Toggle, toast } from "../components/ui";
import { api } from "../lib/api";
import { invalidate, setCached, useApi } from "../lib/data";
import { dayLabel, money } from "../lib/format";
import { back, navigate } from "../lib/router";
import type { BudgetCategory, CategoryRef, Transaction } from "../lib/types";
import { useCurrentBudget } from "./Home";

function useTransaction(id: string) {
  return useApi<Transaction>(`/transactions/${id}`, undefined, 5_000);
}

async function patch(id: string, attrs: Record<string, unknown>) {
  const updated = await api<Transaction>(`/transactions/${id}`, { method: "PATCH", body: { transaction: attrs } });
  setCached<Transaction>(`/transactions/${id}`, undefined, () => updated);
  invalidate("/transactions");
  invalidate("/budget");
  return updated;
}

export function TransactionSheet({ id }: { id: string }) {
  const { data: t } = useTransaction(id);
  const [notes, setNotes] = useState<string | null>(null);

  const remove = async () => {
    if (!t || !confirm(`Delete “${t.merchant?.name ?? t.name}”?`)) return;
    await api(`/transactions/${id}`, { method: "DELETE" });
    invalidate("/transactions");
    toast("Transaction deleted");
    back();
  };

  return (
    <Sheet onClose={() => back()} label="Transaction">
      {!t ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", padding: "20px 0" }}>
          <Skeleton height={14} width="50%" />
          <Skeleton height={52} width="60%" />
          <Skeleton height={20} width="40%" />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignSelf: "stretch", paddingTop: 4 }}>
            <span className="eyebrow" style={{ color: "var(--ink-3)" }}>
              Transaction
            </span>
            {t.reviewed_at ? <span className="badge good">Reviewed</span> : <span className="badge" style={{ background: "var(--brand-tint)", color: "var(--brand)" }}>New</span>}
          </div>
          <span className="muted" style={{ fontSize: 14, paddingTop: 12 }}>
            {dayLabel(t.date)} · {t.account.name}
          </span>
          <span className="display" style={{ fontSize: 52, color: t.classification === "income" ? "var(--good)" : undefined }}>
            {t.classification === "income" ? "+" : ""}
            {money(t.amount_cents, t.currency)}
          </span>
          <span style={{ fontSize: 20, fontWeight: 600, textAlign: "center" }}>{t.merchant?.name ?? t.name}</span>

          <div style={{ alignSelf: "stretch", paddingTop: 18 }}>
            <Field label="Category">
              <button className="pressable" onClick={() => navigate(`/transactions/${id}/category`)}>
                <CategoryChip category={t.category} />
              </button>
            </Field>
            <Field label="Merchant">{t.merchant?.name ?? <span className="muted">—</span>}</Field>
            <Field label="Description">
              <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200, display: "inline-block" }}>
                {t.name}
              </span>
            </Field>
            <Field label="Tags">
              {t.tags.length ? (
                <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  {t.tags.map((tag) => (
                    <span key={tag.id} style={{ fontSize: 13, background: "var(--surface-sunk)", padding: "5px 10px", borderRadius: 9 }}>
                      #{tag.name}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="muted">None</span>
              )}
            </Field>
            <Field label="Notes">
              <input
                value={notes ?? t.notes ?? ""}
                placeholder="Add a note"
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => notes !== null && notes !== (t.notes ?? "") && patch(id, { notes }).then(() => toast("Note saved"))}
                style={{ border: 0, outline: "none", background: "transparent", textAlign: "right", width: "100%" }}
              />
            </Field>
            <Field label="Exclude from budgets" last>
              <Toggle on={t.excluded} label="Exclude" onChange={(on) => patch(id, { excluded: on })} />
            </Field>
          </div>

          <div style={{ display: "flex", gap: 10, alignSelf: "stretch", paddingTop: 22 }}>
            {!t.reviewed_at && (
              <button className="btn primary pressable" style={{ flex: 2 }} onClick={() => patch(id, { reviewed: true }).then(() => toast("Marked reviewed"))}>
                Mark reviewed
              </button>
            )}
            <button className="btn soft pressable" style={{ flex: 1, color: "var(--over)" }} onClick={remove}>
              Delete
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function Field({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 52, borderTop: "1px solid var(--line)", borderBottom: last ? "1px solid var(--line)" : undefined }}>
      <span className="muted" style={{ fontSize: 15, width: 120, flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", fontSize: 15, fontWeight: 500, minWidth: 0 }}>{children}</div>
    </div>
  );
}

type CategoryRow = CategoryRef & { parent?: { id: string; name: string } | null };

export function CategoryPicker({ id }: { id: string }) {
  const { data: t } = useTransaction(id);
  const { data } = useApi<{ categories: CategoryRow[] }>("/categories", { per_page: 200 }, 300_000);
  const budget = useCurrentBudget();
  const envelopes = useApi<{ budget_categories: BudgetCategory[] }>(budget ? "/budget_categories" : null, budget ? { budget_id: budget.id, include_amounts: true, per_page: 100 } : undefined);
  const [search, setSearch] = useState("");
  const [always, setAlways] = useState(false);

  const remaining = useMemo(() => new Map((envelopes.data?.budget_categories ?? []).map((c) => [c.category.id, c])), [envelopes.data]);

  const groups = useMemo(() => {
    const term = search.toLowerCase();
    const all = (data?.categories ?? []).filter((c) => !term || c.name.toLowerCase().includes(term));
    const map = new Map<string, CategoryRow[]>();
    for (const c of all) {
      const group = c.parent?.name ?? "Categories";
      map.set(group, [...(map.get(group) ?? []), c]);
    }
    return [...map.entries()].sort(([a], [b]) => (a === "Categories" ? -1 : b === "Categories" ? 1 : a.localeCompare(b)));
  }, [data, search]);

  const choose = async (category: CategoryRow) => {
    await patch(id, { category_id: category.id });
    if (always) {
      await api("/rules/from_transaction", { method: "POST", body: { transaction_id: id, category_id: category.id } });
      toast(`Future ${t?.merchant?.name ?? "matches"} → ${category.name}`);
    } else toast(`Moved to ${category.name}`);
    back();
  };

  return (
    <Sheet onClose={() => back()} label="Choose category" tall>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <span className="eyebrow" style={{ alignSelf: "center", color: "var(--ink-3)" }}>
          Category
        </span>
        <label style={{ height: 44, borderRadius: 12, background: "var(--surface-sunk)", display: "flex", alignItems: "center", gap: 10, padding: "0 14px" }}>
          <Search size={18} color="var(--ink-3)" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search categories" style={{ border: 0, outline: "none", background: "transparent", flex: 1 }} />
        </label>

        {groups.map(([group, items]) => (
          <div key={group}>
            <div className="eyebrow" style={{ color: "var(--ink-3)", padding: "6px 0" }}>
              {group}
            </div>
            {items.map((c) => {
              const env = remaining.get(c.id);
              const left = env?.available_to_spend_cents;
              return (
                <button key={c.id} className="row pressable" onClick={() => choose(c)}>
                  <Dot color={c.color} size={12} />
                  <span className="grow name" style={{ fontWeight: t?.category?.id === c.id ? 600 : 500 }}>
                    {c.name}
                  </span>
                  {left !== undefined && (
                    <span className="num" style={{ fontSize: 14, width: 96, textAlign: "right", color: left < 0 ? "var(--over)" : "var(--ink-3)" }}>
                      {money(Math.abs(left), env!.currency, { cents: false })} {left < 0 ? "over" : "left"}
                    </span>
                  )}
                  <span style={{ width: 20, flexShrink: 0 }}>{t?.category?.id === c.id && <Check size={20} color="var(--brand)" strokeWidth={2.5} />}</span>
                </button>
              );
            })}
          </div>
        ))}

        <button
          className="pressable"
          onClick={() => setAlways((v) => !v)}
          style={{ position: "sticky", bottom: 0, display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 14, background: "var(--brand-tint)", textAlign: "left" }}
        >
          <span style={{ width: 20, height: 20, borderRadius: 6, background: always ? "var(--brand)" : "var(--surface)", border: always ? 0 : "1.5px solid var(--brand)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            {always && <Check size={13} color="#fff" strokeWidth={3} />}
          </span>
          <span style={{ fontSize: 14, color: "var(--brand)", fontWeight: 500 }}>Always categorize “{t?.merchant?.name ?? t?.name ?? "this"}” this way</span>
        </button>
      </div>
    </Sheet>
  );
}
