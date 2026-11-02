import { useState } from "react";
import { Empty, ErrorBlock, LineChart, Skeleton } from "../components/ui";
import { initials, money } from "../lib/format";
import { openSheet } from "../lib/nav";
import { useApi } from "../lib/query";
import { PERIODS } from "./Accounts";

type Overview = {
  currency: string;
  period: string;
  total_cents: number;
  change_cents: number;
  change_percent: string | null;
  series: { date: string; value_cents: number }[];
  accounts: { id: string; name: string; account_type: string; subtype: string | null; institution_name: string | null; balance_cents: number; change_cents: number; change_percent: string | null }[];
  allocation: { key: string; label: string; value_cents: number; percent: string }[];
  holdings: { security: { id: string; ticker: string; name: string }; qty: string; value_cents: number; price_cents: number; day_change_percent: string | null; spark: number[] }[];
};

type Period = (typeof PERIODS)[number][0];

export function Investments() {
  const [period, setPeriod] = useState<Period>("last_30_days");
  const { data, isPending, isError, refetch, isPlaceholderData } = useApi<Overview>("/investments", { period }, { keepPrevious: true });
  // Captions follow the data shown, which lags the selection while it loads.
  const [, short, span] = PERIODS.find(([key]) => key === (data?.period ?? period))!;

  if (isError && !data) {
    return (
      <main className="page">
        <div className="card pad lead">
          <ErrorBlock what="your investments" onRetry={() => refetch()} />
        </div>
      </main>
    );
  }

  const currency = data?.currency ?? "USD";
  const accounts = (data?.accounts ?? []).filter((a) => a.balance_cents !== 0 || a.change_cents !== 0);
  const movers = [...(data?.holdings ?? [])].filter((h) => h.day_change_percent !== null).sort((a, b) => Math.abs(Number(b.day_change_percent)) - Math.abs(Number(a.day_change_percent))).slice(0, 6);

  if (data && accounts.length === 0) {
    return (
      <main className="page">
        <div className="card list">
          <Empty action="Add an investment account on the web" onAction={() => location.assign("/accounts")}>
            No investment accounts yet.
          </Empty>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="card pad lead invest-lead">
        {data ? (
          <>
            <Change percent={data.change_percent} />
            <span className="display lead-figure">{money(data.total_cents, currency, { cents: false })}</span>
            <span className="lead-sub">
              {data.change_cents === 0 ? `No change ${span}` : `${data.change_cents > 0 ? "+" : "−"}${money(Math.abs(data.change_cents), currency, { cents: false })} ${span}`}
            </span>
          </>
        ) : (
          <>
            <Skeleton height={22} width={70} radius={11} />
            <Skeleton height={38} width="55%" />
            <Skeleton height={16} width="35%" />
          </>
        )}
        <div style={{ opacity: isPlaceholderData ? 0.5 : 1, transition: "opacity 160ms" }}>
          <LineChart
            values={(data?.series ?? []).map((p) => p.value_cents)}
            height={96}
            color={(data?.change_cents ?? 0) < 0 ? "var(--over)" : "var(--good)"}
            fill={(data?.change_cents ?? 0) < 0 ? "var(--over-tint)" : "var(--good-tint)"}
          />
        </div>
        <div className="seg" role="radiogroup" aria-label="Period">
          {PERIODS.map(([key, text]) => (
            <button key={key} role="radio" aria-checked={key === period} aria-pressed={key === period} className="pressable" onClick={() => setPeriod(key)}>
              {text}
            </button>
          ))}
        </div>
      </div>

      {(isPending || movers.length > 0) && (
        <section className="section">
          <div className="section-head">
            <h2>Top movers today</h2>
          </div>
          <div className="rail" data-noswipe>
            {isPending
              ? [0, 1, 2].map((i) => (
                  <div key={i} className="card mover">
                    <Skeleton height={86} />
                  </div>
                ))
              : movers.map((h) => (
                  <div key={h.security.id} className="card mover">
                    <span className="mover-ticker">{h.security.ticker}</span>
                    <span className="mover-name">{h.security.name}</span>
                    <Spark values={h.spark} up={Number(h.day_change_percent) >= 0} height={34} />
                    <Change percent={h.day_change_percent} />
                  </div>
                ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>Accounts</h2>
          <span className="section-note">{short} change</span>
        </div>
        <div className="card list">
          {isPending
            ? [0, 1, 2].map((i) => (
                <div key={i} className="row">
                  <Skeleton height={36} width={36} radius={10} />
                  <Skeleton height={18} />
                </div>
              ))
            : accounts.map((a) => (
                <button key={a.id} className="row pressable" onClick={() => openSheet({ account: a.id })}>
                  <span className="avatar" aria-hidden>
                    {initials(a.institution_name ?? a.name)}
                  </span>
                  <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                    <span className="name">{a.name}</span>
                    <span className="sub">{a.institution_name ?? (a.subtype ?? a.account_type).replace(/_/g, " ")}</span>
                  </span>
                  <span className="stack-end">
                    <span className="amt">{money(a.balance_cents, currency, { cents: false })}</span>
                    <Delta cents={a.change_cents} currency={currency} />
                  </span>
                </button>
              ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Allocation</h2>
        </div>
        <div className="card pad alloc">
          {isPending
            ? [0, 1, 2].map((i) => (
                <div key={i} style={{ gridColumn: "1 / -1" }}>
                  <Skeleton height={18} />
                </div>
              ))
            : data!.allocation.map((a, i) => (
                <div key={a.key} className="alloc-row">
                  <span className="alloc-label">{a.label}</span>
                  <span className="alloc-track">
                    <span className="alloc-bar" style={{ width: `${Math.max(2, Number(a.percent))}%`, background: i === 0 ? "var(--ink)" : "var(--ink-4)" }} />
                  </span>
                  <span className="alloc-pct num">{Number(a.percent).toFixed(1)}%</span>
                </div>
              ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Holdings</h2>
          <span className="section-note">Value</span>
        </div>
        <div className="card list">
          {isPending &&
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="row">
                <Skeleton height={18} />
              </div>
            ))}
          {data && data.holdings.length === 0 && <Empty>No holdings yet. Trades you record on the web show up here.</Empty>}
          {data?.holdings.map((h) => (
            <div key={h.security.id} className="row">
              <span className="ticker">{h.security.ticker}</span>
              <span className="grow name holding-name">{h.security.name}</span>
              <span className="holding-spark">
                <Spark values={h.spark} up={(h.spark.at(-1) ?? 0) >= (h.spark[0] ?? 0)} height={24} />
              </span>
              <span className="amt">{money(h.value_cents, currency, { cents: false })}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Change({ percent }: { percent: string | null }) {
  if (percent === null) return null;
  const value = Number(percent);
  const tone = value > 0 ? "up" : value < 0 ? "down" : "flat";
  return (
    <span className={`change ${tone}`}>
      {value > 0 ? "↗" : value < 0 ? "↘" : "→"} {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function Delta({ cents, currency }: { cents: number; currency: string }) {
  if (cents === 0) return <span className="delta">No change</span>;
  return (
    <span className="delta" style={{ color: cents > 0 ? "var(--good-ink)" : "var(--over)" }}>
      {cents > 0 ? "↗" : "↘"} {money(Math.abs(cents), currency, { cents: false })}
    </span>
  );
}

function Spark({ values, up, height }: { values: number[]; up: boolean; height: number }) {
  return <LineChart values={values} height={height} color={up ? "var(--good)" : "var(--over)"} />;
}
