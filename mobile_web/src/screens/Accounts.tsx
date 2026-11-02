import { useMutation } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";
import { PushedScreen } from "../components/Screen";
import { Sheet } from "../components/Sheet";
import { Empty, ErrorBlock, LineChart, Section, Skeleton, toast } from "../components/ui";
import { api } from "../lib/api";
import { decimalToCents, initials, isoDate, LOCALE, money } from "../lib/format";
import { closeSheet, go, openSheet } from "../lib/nav";
import { useApi } from "../lib/query";
import type { Account, Holding } from "../lib/types";

const PERIODS = [
  ["last_7_days", "1W", "this week"],
  ["last_30_days", "1M", "this month"],
  ["last_90_days", "3M", "in 3 months"],
  ["current_year", "YTD", "this year"],
  ["last_365_days", "1Y", "in a year"],
] as const;

const GROUPS: { label: string; types: string[] }[] = [
  { label: "Cash", types: ["depository"] },
  { label: "Credit cards", types: ["credit_card"] },
  { label: "Investments", types: ["investment", "crypto"] },
  { label: "Property & vehicles", types: ["property", "vehicle", "other_asset"] },
  { label: "Loans", types: ["loan", "other_liability"] },
];

type Series = { currency: string; points: { date: string; net_worth_cents: number }[] };
type BalanceSheet = { currency: string; net_worth: { amount: string }; assets: { amount: string }; liabilities: { amount: string } };

export function Accounts() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number][0]>("last_90_days");
  const series = useApi<Series>("/balance_sheet/series", { period }, { keepPrevious: true });
  const sheet = useApi<BalanceSheet>("/balance_sheet");
  const accounts = useApi<{ accounts: Account[] }>("/accounts", { per_page: 100 });

  const points = series.data?.points ?? [];
  const first = points[0]?.net_worth_cents ?? 0;
  const last = points.at(-1)?.net_worth_cents ?? decimalToCents(sheet.data?.net_worth.amount);
  const change = first ? ((last - first) / Math.abs(first)) * 100 : 0;
  const currency = sheet.data?.currency ?? series.data?.currency ?? "USD";
  const [, , span] = PERIODS.find(([key]) => key === period)!;

  return (
    <main className="page">
      <div className="card pad lead">
        <span className="label">Net worth</span>
        {sheet.isError ? (
          <ErrorBlock what="your net worth" onRetry={() => sheet.refetch()} />
        ) : sheet.data ? (
          <>
            <span className="display lead-figure">{money(last, currency, { cents: false })}</span>
            <span className="lead-sub">
              {points.length > 1 && Math.abs(change) >= 0.05 ? (
                <b style={{ color: change > 0 ? "var(--good-ink)" : "var(--over)" }}>
                  {change > 0 ? "Up" : "Down"} {Math.abs(change).toFixed(1)}% {span}
                </b>
              ) : (
                `No change ${span}`
              )}
            </span>
            <div className="legend">
              <span>
                Assets <b className="num">{money(decimalToCents(sheet.data.assets.amount), currency, { cents: false })}</b>
              </span>
              <span>
                Debts <b className="num">{money(decimalToCents(sheet.data.liabilities.amount), currency, { cents: false })}</b>
              </span>
            </div>
          </>
        ) : (
          <>
            <Skeleton height={38} width="60%" />
            <Skeleton height={16} width="40%" />
          </>
        )}
        <div style={{ opacity: series.isPlaceholderData ? 0.5 : 1, transition: "opacity 160ms" }}>
          {series.isError ? <ErrorBlock what="the chart" onRetry={() => series.refetch()} /> : <LineChart values={points.map((p) => p.net_worth_cents)} fill="var(--brand-tint)" />}
        </div>
        <div className="seg" role="radiogroup" aria-label="Period">
          {PERIODS.map(([key, text]) => (
            <button key={key} role="radio" aria-checked={key === period} aria-pressed={key === period} className="pressable" onClick={() => setPeriod(key)}>
              {text}
            </button>
          ))}
        </div>
      </div>

      {accounts.isError && <ErrorBlock what="your accounts" onRetry={() => accounts.refetch()} />}
      {accounts.isPending && (
        <Section title="Accounts">
          <div className="card list">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="row">
                <Skeleton height={34} width={34} radius={10} />
                <Skeleton height={18} />
              </div>
            ))}
          </div>
        </Section>
      )}
      {accounts.isSuccess && accounts.data.accounts.length === 0 && (
        <div className="card list">
          <Empty action="Add an account on the web" onAction={() => location.assign("/accounts")}>
            No accounts yet.
          </Empty>
        </div>
      )}

      {GROUPS.map((group) => {
        const items = (accounts.data?.accounts ?? []).filter((a) => group.types.includes(a.account_type));
        if (!items.length) return null;
        // Balances are in each account's own currency; only total a group
        // that shares one.
        const sameCurrency = items.every((a) => a.currency === items[0].currency);
        const total = items.reduce((sum, a) => sum + a.balance_cents, 0);
        return (
          <section key={group.label} className="section">
            <div className="section-head">
              <h2>{group.label}</h2>
              {sameCurrency && <span className="num section-total">{money(total, items[0].currency, { cents: false })}</span>}
            </div>
            <div className="card list">
              {items.map((a) => (
                <AccountRow key={a.id} account={a} />
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}

function AccountRow({ account }: { account: Account }) {
  return (
    <button className="row pressable" onClick={() => openSheet({ account: account.id })}>
      {account.logo_url ? (
        <img
          className="avatar"
          src={account.logo_url}
          alt=""
          width={36}
          height={36}
          loading="lazy"
          style={{ objectFit: "contain", background: "#fff" }}
        />
      ) : (
        <span className="avatar" aria-hidden>
          {initials(account.institution_name ?? account.name)}
        </span>
      )}
      <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
        <span className="name">{account.name}</span>
        <span className="sub">{account.institution_name ?? (account.subtype ?? account.account_type).replace(/_/g, " ")}</span>
      </span>
      <span className="amt" style={{ color: account.classification === "liability" ? "var(--over)" : undefined }}>
        {money(account.balance_cents, account.currency, { cents: false })}
      </span>
    </button>
  );
}

export function AccountSheet({ id, open, onExited }: { id: string; open: boolean; onExited: () => void }) {
  const account = useApi<Account>(`/accounts/${id}`);
  const start = isoDate(new Date(Date.now() - 90 * 86_400_000));
  const balances = useApi<{ balances: { date: string; end_balance_cents: number }[] }>("/balances", { account_id: id, start_date: start, per_page: 100 });
  const sync = useMutation({
    mutationFn: () => api(`/accounts/${id}/sync`, { method: "POST" }),
    onSuccess: () => toast("Sync started"),
    onError: () => toast("Couldn't start a sync"),
  });
  const close = () => closeSheet("account");

  const values = [...(balances.data?.balances ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1)).map((b) => b.end_balance_cents);
  const change = values.length > 1 ? values.at(-1)! - values[0] : 0;
  const a = account.data;
  const liability = a?.classification === "liability";

  // Leave the sheet, then push the next screen: one motion at a time.
  const open_ = (to: string, search?: Record<string, unknown>) => {
    close();
    setTimeout(() => go(to, { search, push: !search }), 280);
  };

  return (
    <Sheet open={open} onClose={close} onExited={onExited} label="Account">
      {account.isError ? (
        <ErrorBlock what="this account" onRetry={() => account.refetch()} />
      ) : !a ? (
        <div className="txn-head">
          <Skeleton height={14} width="30%" />
          <Skeleton height={30} width="60%" />
          <Skeleton height={96} />
        </div>
      ) : (
        <>
          <div className="txn-head">
            <span className="review-meta">{a.institution_name ?? (a.subtype ?? a.account_type).replace(/_/g, " ")}</span>
            <span className="review-name" style={{ fontSize: 22 }}>
              {a.name}
            </span>
            <span className="display txn-amount">{money(a.balance_cents, a.currency)}</span>
            <span className="lead-sub">
              {values.length > 1 && change !== 0 ? (
                // A falling debt is good news.
                <b style={{ color: change > 0 !== liability ? "var(--good-ink)" : "var(--over)" }}>
                  {money(change, a.currency, { cents: false, sign: true })} in 3 months
                </b>
              ) : (
                "No change in 3 months"
              )}
            </span>
          </div>
          <LineChart values={values} fill="var(--brand-tint)" height={96} />
          <div className="sheet-actions">
            <button className="btn soft pressable" style={{ flex: 1 }} onClick={() => (a.account_type === "investment" ? open_(`/accounts/${id}/holdings`) : open_("/transactions", { in: id }))}>
              {a.account_type === "investment" ? "Holdings" : "Transactions"}
            </button>
            <button className="btn soft pressable" style={{ flex: 1 }} disabled={sync.isPending} onClick={() => sync.mutate()}>
              {sync.isPending ? "Syncing…" : "Sync now"}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

export function Holdings() {
  const { id } = useParams({ from: "/accounts/$id/holdings" });
  const account = useApi<Account>(`/accounts/${id}`);
  const holdings = useApi<{ holdings: Holding[] }>("/holdings", { account_id: id, per_page: 100 });
  const latest = new Map<string, Holding>();
  for (const h of holdings.data?.holdings ?? []) if (!latest.has(h.security.id)) latest.set(h.security.id, h);

  return (
    <PushedScreen id={`holdings-${id}`} title={account.data?.name ?? "Holdings"} fallback="/accounts">
      <div className="card pad lead">
        <span className="label">Value</span>
        {account.data ? <span className="display lead-figure">{money(account.data.balance_cents, account.data.currency, { cents: false })}</span> : <Skeleton height={38} width="50%" />}
      </div>
      <Section title="Holdings">
        <div className="card list">
          {holdings.isError && <ErrorBlock what="holdings" onRetry={() => holdings.refetch()} />}
          {holdings.isPending &&
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="row">
                <Skeleton height={18} />
              </div>
            ))}
          {holdings.isSuccess && latest.size === 0 && <Empty>No holdings in this account.</Empty>}
          {[...latest.values()].map((h) => (
            <div key={h.security.id} className="row">
              <span className="ticker">{h.security.ticker}</span>
              <span className="grow" style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span className="name" style={{ fontSize: 15 }}>
                  {h.security.name}
                </span>
                <span className="sub num">
                  {Number(h.qty).toLocaleString(LOCALE, { maximumFractionDigits: 4 })} at {h.price}
                </span>
              </span>
              <span className="amt">{h.amount}</span>
            </div>
          ))}
        </div>
      </Section>
    </PushedScreen>
  );
}
