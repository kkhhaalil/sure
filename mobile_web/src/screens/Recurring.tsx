import { useApi } from "../lib/data";
import { isoDate, money, monthName, parseDate, today, LOCALE } from "../lib/format";
import type { Recurring as RecurringItem } from "../lib/types";
import { PullIndicator, Section, Skeleton, usePullToRefresh } from "../components/ui";

export function Recurring() {
  const { data, loading, reload } = useApi<{ recurring_transactions: RecurringItem[] }>("/recurring_transactions", { status: "active", per_page: 100 });
  const { pull, busy } = usePullToRefresh(reload);

  const now = today();
  const monthEnd = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const weekEnd = isoDate(new Date(now.getTime() + 7 * 86_400_000));
  const todayIso = isoDate(now);

  const items = (data?.recurring_transactions ?? []).filter((r) => r.next_expected_date).sort((a, b) => (a.next_expected_date! < b.next_expected_date! ? -1 : 1));
  const thisMonth = items.filter((r) => r.next_expected_date! >= todayIso && r.next_expected_date! <= monthEnd && r.amount_cents > 0);
  const leftToPay = thisMonth.reduce((sum, r) => sum + r.amount_cents, 0);
  const currency = items[0]?.currency ?? "USD";
  const thisWeek = items.filter((r) => r.next_expected_date! >= todayIso && r.next_expected_date! <= weekEnd);
  const later = items.filter((r) => r.next_expected_date! > weekEnd);
  const overdue = items.filter((r) => r.next_expected_date! < todayIso);

  return (
    <main className="page" style={{ gap: 16 }}>
      <PullIndicator pull={pull} busy={busy} />
      <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span className="eyebrow" style={{ color: "var(--ink-3)" }}>
          Left to pay in {monthName(todayIso)}
        </span>
        {loading ? (
          <Skeleton height={38} width="50%" />
        ) : (
          <span className="display" style={{ fontSize: 38 }}>
            {money(leftToPay, currency, { cents: false })}
          </span>
        )}
        <span className="muted" style={{ fontSize: 13 }}>
          {thisMonth.length} {thisMonth.length === 1 ? "bill" : "bills"} still due this month
        </span>
      </div>
      {overdue.length > 0 && <Group title="Overdue" items={overdue} tone="over" />}
      {thisWeek.length > 0 && <Group title="This week" items={thisWeek} />}
      {later.length > 0 && <Group title="Later" items={later} />}
      {!loading && items.length === 0 && <p className="muted" style={{ textAlign: "center" }}>No recurring bills detected yet.</p>}
    </main>
  );
}

function Group({ title, items, tone }: { title: string; items: RecurringItem[]; tone?: "over" }) {
  return (
    <Section title={title}>
      <div className="card list">
        {items.map((r) => {
          const date = parseDate(r.next_expected_date!);
          const varies = r.expected_amount_min_cents !== null && r.expected_amount_max_cents !== null && r.expected_amount_min_cents !== r.expected_amount_max_cents;
          return (
            <div key={r.id} className="row">
              <div style={{ width: 36, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: tone === "over" ? "var(--over)" : "var(--ink-3)" }}>{date.toLocaleDateString(LOCALE, { month: "short" }).toUpperCase()}</span>
                <span style={{ fontSize: 17, fontWeight: 700 }}>{date.getDate()}</span>
              </div>
              <div className="grow" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span className="name" style={{ fontWeight: 600 }}>
                  {r.merchant?.name ?? r.name}
                </span>
                <span className="sub">
                  {varies ? `Varies ${money(r.expected_amount_min_cents!, r.currency, { cents: false })}–${money(r.expected_amount_max_cents!, r.currency, { cents: false })}` : "Monthly"}
                  {r.autopay ? " · autopay" : ""}
                </span>
              </div>
              <span className="amt">
                {varies ? "~" : ""}
                {money(r.amount_cents, r.currency)}
              </span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
