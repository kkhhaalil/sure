import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Sheet } from "../components/Sheet";
import { ErrorBlock, Skeleton, toast } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { isoDate, today } from "../lib/format";
import { closeSheet, openSheet } from "../lib/nav";
import { invalidate, useApi } from "../lib/query";
import type { Account, Transaction } from "../lib/types";

// Manual entry: cash, a split, anything a bank feed misses. Manual
// transactions land in an account the user can write to; linked accounts
// pick theirs up on the next sync.
const MANUAL_TYPES = ["depository", "credit_card", "other_asset", "other_liability", "loan"];

export function NewTransactionSheet({ open, onExited }: { open: boolean; onExited: () => void }) {
  const accounts = useApi<{ accounts: Account[] }>("/accounts", { per_page: 100 });
  const choices = (accounts.data?.accounts ?? []).filter((a) => MANUAL_TYPES.includes(a.account_type));
  const [nature, setNature] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");
  const [date, setDate] = useState(isoDate(today()));
  const [accountId, setAccountId] = useState("");
  const close = () => closeSheet("add");

  useEffect(() => {
    if (!accountId && choices[0]) setAccountId(choices[0].id);
  }, [choices.length]);

  const value = Number(amount.replace(",", "."));
  const valid = value > 0 && name.trim() && accountId && date;

  const create = useMutation({
    mutationFn: () =>
      api<Transaction>("/transactions", {
        method: "POST",
        body: { transaction: { account_id: accountId, amount: value, nature, name: name.trim(), date, currency: choices.find((a) => a.id === accountId)?.currency } },
      }),
    onSuccess: (t) => {
      invalidate("/transactions", "/budget", "/cash_flow", "/accounts", "/balance");
      toast("Transaction added");
      // Swap this sheet for the new transaction, to pick its category.
      closeSheet("add");
      setTimeout(() => openSheet({ txn: t.id }), 300);
    },
  });

  return (
    <Sheet open={open} onClose={close} onExited={onExited} label="New transaction">
      <h2 className="sheet-title">New transaction</h2>
      {accounts.isError ? (
        <ErrorBlock what="your accounts" onRetry={() => accounts.refetch()} />
      ) : accounts.isPending ? (
        <div style={{ display: "grid", gap: 12 }}>
          <Skeleton height={64} />
          <Skeleton height={54} />
          <Skeleton height={54} />
        </div>
      ) : choices.length === 0 ? (
        <p className="state">Manual transactions need a cash, card or loan account. Add one on the web first.</p>
      ) : (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) create.mutate();
          }}
        >
          <div className="seg wide" role="radiogroup" aria-label="Type">
            {(["expense", "income"] as const).map((n) => (
              <button key={n} type="button" role="radio" aria-checked={nature === n} aria-pressed={nature === n} className="pressable" onClick={() => setNature(n)}>
                {n === "expense" ? "Expense" : "Income"}
              </button>
            ))}
          </div>
          <label className="amount-input">
            <span className="visually-hidden">Amount</span>
            <input autoFocus inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} className="display" />
          </label>
          <label className="stack">
            <span className="label">Name</span>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="What was it?" autoComplete="off" />
          </label>
          <div className="pair">
            <label className="stack">
              <span className="label">Account</span>
              <select className="field" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {choices.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="stack">
              <span className="label">Date</span>
              <input className="field" type="date" value={date} max={isoDate(today())} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
          {create.isError && (
            <p role="alert" className="error">
              {create.error instanceof ApiError ? create.error.message : "Couldn't add it. Try again."}
            </p>
          )}
          <button className="btn primary pressable" disabled={!valid || create.isPending}>
            {create.isPending ? "Adding…" : "Add transaction"}
          </button>
        </form>
      )}
    </Sheet>
  );
}
