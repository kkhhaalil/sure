import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Sheet } from "../components/Sheet";
import { CategoryChip, ErrorBlock, Skeleton, Toggle, toast } from "../components/ui";
import { api } from "../lib/api";
import { isoDate, money, shortDate, today } from "../lib/format";
import { closeSheet, openSheet } from "../lib/nav";
import { invalidate } from "../lib/query";
import { useTransaction } from "../lib/transactions";
import type { CategoryRef } from "../lib/types";

// The offer to turn a recategorization into a rule. It lives outside the
// router so it survives the picker closing and shows on the transaction
// sheet underneath.
type Offer = { txn: string; category: string } | null;
let offer: Offer = null;
const offerListeners = new Set<() => void>();

export function offerRule(next: Offer) {
  offer = next;
  offerListeners.forEach((fn) => fn());
}

export function useRuleOffer(txnId: string) {
  const current = useSyncExternalStore(
    (fn) => {
      offerListeners.add(fn);
      return () => offerListeners.delete(fn);
    },
    () => offer,
  );
  return current?.txn === txnId ? current : null;
}

export function RuleOffer({ txnId, label }: { txnId: string; label: string }) {
  const current = useRuleOffer(txnId);
  if (!current) return null;
  return (
    <div className="rule-offer" role="region" aria-label="Create a rule">
      <div className="rule-offer-text">
        <b>
          Always put “{label}” in {current.category}?
        </b>
        <span>A rule sorts the next ones for you, and can fix past ones too.</span>
      </div>
      <div className="rule-offer-actions">
        <button className="btn soft pressable" onClick={() => offerRule(null)}>
          Not now
        </button>
        <button className="btn brand pressable" onClick={() => openSheet({ rule: txnId })}>
          Create rule
        </button>
      </div>
    </div>
  );
}

type Condition = { condition_type: string; operator: string; value: string };
type Preview = {
  data: {
    count: number;
    transactions: { id: string; name: string; merchant_name: string | null; date: string; amount_cents: number; currency: string; classification: string; category: CategoryRef | null }[];
  };
};

export function RuleSheet({ id, open, onExited }: { id: string; open: boolean; onExited: () => void }) {
  const { data: t, isError, refetch } = useTransaction(id);
  const [byName, setByName] = useState<boolean | null>(null);
  const [pattern, setPattern] = useState<string | null>(null);
  const [debounced, setDebounced] = useState<string | null>(null);
  const [sameAmount, setSameAmount] = useState(false);
  const [sameAccount, setSameAccount] = useState(false);
  const [applyPast, setApplyPast] = useState(true);
  const close = () => closeSheet("rule");

  const matchName = byName ?? !t?.merchant;
  const text = (pattern ?? t?.name ?? "").trim();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const conditions = useMemo<Condition[]>(() => {
    if (!t) return [];
    const list: Condition[] = [];
    if (matchName) {
      if (!debounced) return [];
      list.push({ condition_type: "transaction_name", operator: "like", value: debounced });
    } else list.push({ condition_type: "transaction_merchant", operator: "=", value: t.merchant!.id });
    if (sameAmount) list.push({ condition_type: "transaction_amount", operator: "=", value: Math.abs(Number(t.amount_decimal)).toString() });
    if (sameAccount) list.push({ condition_type: "transaction_account", operator: "=", value: t.account.id });
    return list;
  }, [t, matchName, debounced, sameAmount, sameAccount]);

  const preview = useQuery({
    queryKey: ["/rules/preview", conditions],
    queryFn: () => api<Preview>("/rules/preview", { method: "POST", body: { rule: { resource_type: "transaction", conditions_attributes: conditions } } }),
    enabled: conditions.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });

  // The transaction itself is a match; "past" means the others.
  const others = Math.max(0, (preview.data?.data.count ?? 0) - 1);

  const create = useMutation({
    mutationFn: async () => {
      const rule = await api<{ data: { id: string } }>("/rules", {
        method: "POST",
        body: {
          rule: {
            resource_type: "transaction",
            active: true,
            effective_date: applyPast ? undefined : isoDate(today()),
            conditions_attributes: conditions,
            actions_attributes: [{ action_type: "set_transaction_category", value: t!.category!.id }],
          },
        },
      });
      if (applyPast && others > 0) await api(`/rules/${rule.data.id}/apply`, { method: "POST" });
    },
    onSuccess: () => {
      offerRule(null);
      toast(applyPast && others > 0 ? `Rule created. Sorting ${others} past ${others === 1 ? "transaction" : "transactions"}…` : "Rule created");
      close();
      // The rule runs in the background; pick up its changes once it has had a moment.
      if (applyPast && others > 0) setTimeout(() => invalidate("/transactions", "/budget", "/budget_categories", "/cash_flow"), 2500);
    },
    onError: () => toast("Couldn't create the rule. Try again."),
  });

  const ready = !!t?.category && conditions.length > 0 && !create.isPending;

  return (
    <Sheet open={open} onClose={close} onExited={onExited} label="New rule" tall>
      <h2 className="sheet-title">New rule</h2>
      {!t ? (
        isError ? (
          <ErrorBlock what="this transaction" onRetry={() => refetch()} />
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={44} />
            ))}
          </div>
        )
      ) : (
        <>
          <section className="rule-block">
            <h3 className="day-head">When a transaction</h3>
            {t.merchant && (
              <div className="seg" role="radiogroup" aria-label="Match on">
                <button role="radio" aria-pressed={!matchName} aria-checked={!matchName} onClick={() => setByName(false)}>
                  Is from {t.merchant.name}
                </button>
                <button role="radio" aria-pressed={matchName} aria-checked={matchName} onClick={() => setByName(true)}>
                  Name contains
                </button>
              </div>
            )}
            <div className="fields">
              {matchName && (
                <label className="field-row">
                  <span className="field-label">Name contains</span>
                  <input className="field-input" value={pattern ?? t.name} onChange={(e) => setPattern(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
                </label>
              )}
              <div className="field-row">
                <span className="field-label grow">Only {money(t.amount_cents, t.currency)}</span>
                <Toggle on={sameAmount} label={`Only ${money(t.amount_cents, t.currency)}`} onChange={setSameAmount} />
              </div>
              <div className="field-row">
                <span className="field-label grow ellipsis">Only on {t.account.name}</span>
                <Toggle on={sameAccount} label={`Only on ${t.account.name}`} onChange={setSameAccount} />
              </div>
            </div>
          </section>

          <section className="rule-block">
            <h3 className="day-head">Then</h3>
            <button className="field-row pressable" onClick={() => openSheet({ pick: id })}>
              <span className="field-label">Set category</span>
              <span className="field-value">
                <CategoryChip category={t.category} />
                <ChevronRight size={18} color="var(--ink-4)" />
              </span>
            </button>
          </section>

          <section className="rule-block">
            <h3 className="day-head">
              <span>Matches today</span>
              {preview.data && <span className="num">{preview.data.data.count}</span>}
            </h3>
            {conditions.length === 0 ? (
              <p className="rule-note">Type part of the name to match.</p>
            ) : preview.isError ? (
              <ErrorBlock what="the matches" onRetry={() => preview.refetch()} />
            ) : !preview.data ? (
              <div style={{ display: "grid", gap: 12 }}>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} height={20} />
                ))}
              </div>
            ) : (
              <div className="rule-matches" style={{ opacity: preview.isPlaceholderData ? 0.5 : 1 }}>
                {preview.data.data.transactions.map((m) => (
                  <div key={m.id} className="row">
                    <span className="rule-date">{shortDate(m.date)}</span>
                    <span className="grow name">{m.merchant_name ?? m.name}</span>
                    <CategoryChip category={m.category} />
                    <span className="amt">{money(m.amount_cents, m.currency)}</span>
                  </div>
                ))}
                {preview.data.data.count > preview.data.data.transactions.length && (
                  <p className="rule-note">and {preview.data.data.count - preview.data.data.transactions.length} more</p>
                )}
              </div>
            )}
          </section>

          <div className="picker-foot rule-foot">
            {others > 0 && (
              <div className="field-row">
                <span className="field-label grow" style={{ color: "var(--ink)" }}>
                  Also recategorize {others} past {others === 1 ? "transaction" : "transactions"}
                </span>
                <Toggle on={applyPast} label="Also recategorize past transactions" onChange={setApplyPast} />
              </div>
            )}
            <button className="btn primary pressable" disabled={!ready} onClick={() => create.mutate()}>
              {create.isPending ? "Creating…" : t.category ? `Always use ${t.category.name}` : "Choose a category first"}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
