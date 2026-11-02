import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { Sheet } from "../components/Sheet";
import { LineChart, PullIndicator, Section, Skeleton, toast, usePullToRefresh } from "../components/ui";
import { api } from "../lib/api";
import { useApi } from "../lib/data";
import { decimalToCents, initials, isoDate, money, LOCALE } from "../lib/format";
import { back, navigate } from "../lib/router";
import type { Account, Holding } from "../lib/types";

const PERIODS = [
  ["last_7_days", "1W"],
  ["last_30_days", "1M"],
  ["last_90_days", "3M"],
  ["current_year", "YTD"],
  ["last_365_days", "1Y"],
] as const;

const GROUPS: { label: string; types: string[] }[] = [
  { label: "Cash", types: ["depository"] },
  { label: "Credit cards", types: ["credit_card"] },
  { label: "Investments", types: ["investment", "crypto"] },
  { label: "Property & vehicles", types: ["property", "vehicle", "other_asset"] },
  { label: "Loans", types: ["loan", "other_liability"] },
];

type Series = { currency: string; points: { date: string; net_worth_cents: number }[] };

export function Accounts() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number][0]>("last_90_days");
  const series = useApi<Series>("/balance_sheet/series", { period });
  const sheet = useApi<{ currency: string; net_worth: { amount: string }; assets: { amount: string }; liabilities: { amount: string } }>("/balance_sheet");
  const accounts = useApi<{ accounts: Account[] }>("/accounts", { per_page: 100 });
  const { pull, busy } = usePullToRefresh(() => Promise.all([series.reload(), sheet.reload(), accounts.reload()]));

  const points = series.data?.points ?? [];
  const first = points[0]?.net_worth_cents ?? 0;
  const last = points.at(-1)?.net_worth_cents ?? decimalToCents(sheet.data?.net_worth.amount);
  const change = first ? ((last - first) / Math.abs(first)) * 100 : 0;
  const currency = sheet.data?.currency ?? series.data?.currency ?? "USD";
  const label = PERIODS.find(([key]) => key === period)![1];

  return (
    <main className="page" style={{ gap: 16 }}>
      <PullIndicator pull={pull} busy={busy} />
      <div className="card" style={{ padding: "18px 18px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="eyebrow" style={{ color: "var(--ink-3)" }}>
          Net worth
        </span>
        {sheet.data ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span className="display" style={{ fontSize: 38 }}>
                {money(last, currency, { cents: false })}
              </span>
              {points.length > 1 && (
                <span style={{ fontSize: 14, fontWeight: 600, color: change >= 0 ? "var(--good)" : "var(--over)" }}>
                  {change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}% {label}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: 13 }} className="muted">
              <span>
                <span style={{ color: "var(--good)" }}>●</span> Assets {money(decimalToCents(sheet.data.assets.amount), currency, { cents: false })}
              </span>
              <span>
                <span style={{ color: "var(--over)" }}>●</span> Debt {money(decimalToCents(sheet.data.liabilities.amount), currency, { cents: false })}
              </span>
            </div>
          </>
        ) : (
          <Skeleton height={38} width="60%" />
        )}
        <LineChart values={points.map((p) => p.net_worth_cents)} fill="var(--good-tint)" />
        <div className="seg">
          {PERIODS.map(([key, text]) => (
            <button key={key} aria-pressed={key === period} className="pressable" onClick={() => setPeriod(key)}>
              {text}
            </button>
          ))}
        </div>
      </div>

      {GROUPS.map((group) => {
        const items = (accounts.data?.accounts ?? []).filter((a) => group.types.includes(a.account_type));
        if (!items.length) return null;
        // Balances are in each account's own currency; only total a group
        // that shares one.
        const sameCurrency = items.every((a) => a.currency === items[0].currency);
        const total = items.reduce((sum, a) => sum + a.balance_cents, 0);
        return (
          <Section key={group.label} title={sameCurrency ? `${group.label} · ${money(total, items[0].currency, { cents: false })}` : group.label}>
            <div className="card list">
              {items.map((a) => (
                <AccountRow key={a.id} account={a} />
              ))}
            </div>
          </Section>
        );
      })}
    </main>
  );
}

function AccountRow({ account }: { account: Account }) {
  const hue = [...account.name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <button className="row pressable" onClick={() => navigate(`/accounts/${account.id}`)}>
      <span style={{ width: 34, height: 34, borderRadius: 10, background: `oklch(0.45 0.09 ${hue})`, color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
        {initials(account.institution_name ?? account.name)}
      </span>
      <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span className="name" style={{ fontSize: 15, fontWeight: 600 }}>
          {account.name}
        </span>
        <span className="sub">{account.institution_name ?? account.subtype?.replace(/_/g, " ") ?? account.account_type.replace(/_/g, " ")}</span>
      </span>
      <span className="amt" style={{ fontSize: 15, color: account.classification === "liability" ? "var(--over)" : undefined }}>
        {money(account.balance_cents, account.currency, { cents: false })}
      </span>
    </button>
  );
}

export function AccountSheet({ id }: { id: string }) {
  const { data: account } = useApi<Account>(`/accounts/${id}`);
  const start = isoDate(new Date(Date.now() - 90 * 86_400_000));
  const balances = useApi<{ balances: { date: string; end_balance_cents: number }[] }>("/balances", { account_id: id, start_date: start, per_page: 100 });
  const [syncing, setSyncing] = useState(false);

  const values = [...(balances.data?.balances ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1)).map((b) => b.end_balance_cents);
  const change = values.length > 1 ? values.at(-1)! - values[0] : 0;

  const sync = async () => {
    setSyncing(true);
    try {
      await api(`/accounts/${id}/sync`, { method: "POST" });
      toast("Sync started");
    } catch {
      toast("Couldn't start a sync");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Sheet onClose={() => back("/accounts")} label="Account">
      {!account ? (
        <Skeleton height={240} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <span className="eyebrow" style={{ color: "var(--ink-3)", paddingTop: 8 }}>
            {(account.subtype ?? account.account_type).replace(/_/g, " ")}
          </span>
          <span className="display" style={{ fontSize: 26, paddingTop: 6, textAlign: "center" }}>
            {account.name}
          </span>
          {account.institution_name && <span className="muted">{account.institution_name}</span>}
          <div style={{ display: "flex", justifyContent: "space-around", alignSelf: "stretch", padding: "14px 0" }}>
            <Metric label="Balance" value={money(account.balance_cents, account.currency)} />
            <Metric label="3M change" value={money(change, account.currency, { cents: false, sign: true })} tone={change >= 0 ? "var(--good)" : "var(--over)"} />
          </div>
          <div style={{ alignSelf: "stretch" }}>
            <LineChart values={values} color="var(--brand)" fill="var(--brand-tint)" height={96} />
          </div>
          <div style={{ display: "flex", gap: 10, alignSelf: "stretch", paddingTop: 18 }}>
            <button className="btn soft pressable" style={{ flex: 1, fontSize: 15 }} onClick={() => navigate(account.account_type === "investment" ? `/accounts/${id}/holdings` : `/transactions?account=${id}`)}>
              {account.account_type === "investment" ? "Holdings" : "Transactions"}
            </button>
            <button className="btn soft pressable" style={{ flex: 1, fontSize: 15 }} disabled={syncing} onClick={sync}>
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <span className="eyebrow" style={{ fontSize: 11, color: "var(--ink-3)" }}>
        {label}
      </span>
      <span className="num" style={{ fontSize: 18, fontWeight: 700, color: tone }}>
        {value}
      </span>
    </div>
  );
}

export function Holdings({ id }: { id: string }) {
  const { data: account } = useApi<Account>(`/accounts/${id}`);
  const { data, loading } = useApi<{ holdings: Holding[] }>("/holdings", { account_id: id, per_page: 100 });
  const latest = new Map<string, Holding>();
  for (const h of data?.holdings ?? []) if (!latest.has(h.security.id)) latest.set(h.security.id, h);

  return (
    <main className="page plain" style={{ gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 44 }}>
        <button className="icon-btn pressable" style={{ color: "var(--ink)" }} aria-label="Back" onClick={() => back("/accounts")}>
          <ChevronLeft size={26} />
        </button>
        <span style={{ fontWeight: 600 }}>{account?.name ?? "Holdings"}</span>
        <span style={{ width: 44 }} />
      </div>
      {account && (
        <span className="display" style={{ fontSize: 40 }}>
          {money(account.balance_cents, account.currency, { cents: false })}
        </span>
      )}
      <Section title="Holdings">
        <div className="card list">
          {loading && <Skeleton height={120} />}
          {[...latest.values()].map((h) => (
            <div key={h.security.id} className="row">
              <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, width: 56, flexShrink: 0 }}>{h.security.ticker}</span>
              <span className="grow" style={{ display: "flex", flexDirection: "column" }}>
                <span className="name" style={{ fontSize: 14 }}>
                  {h.security.name}
                </span>
                <span className="sub">
                  {Number(h.qty).toLocaleString(LOCALE, { maximumFractionDigits: 4 })} sh · {h.price}
                </span>
              </span>
              <span className="amt" style={{ fontSize: 15 }}>
                {h.amount}
              </span>
            </div>
          ))}
        </div>
      </Section>
    </main>
  );
}
