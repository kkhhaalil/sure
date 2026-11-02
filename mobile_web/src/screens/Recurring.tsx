import { ErrorBlock, Section, Skeleton } from "../components/ui";
import { isoDate, money, monthName, parseDate, shortMonth, today } from "../lib/format";
import { useApi } from "../lib/query";
import type { Recurring as RecurringItem } from "../lib/types";

export function Recurring() {
  const { data, isPending, isError, refetch } = useApi<{ recurring_transactions: RecurringItem[] }>("/recurring_transactions", { status: "active", per_page: 100 });

  const now = today();
  const monthEnd = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const weekEnd = isoDate(new Date(now.getTime() + 7 * 86_400_000));
  const todayIso = isoDate(now);

  const items = (data?.recurring_transactions ?? []).filter((r) => r.next_expected_date).sort((a, b) => (a.next_expected_date! < b.next_expected_date! ? -1 : 1));
  const thisMonth = items.filter((r) => r.next_expected_date! >= todayIso && r.next_expected_date! <= monthEnd && r.amount_cents > 0);
  const leftToPay = thisMonth.reduce((sum, r) => sum + r.amount_cents, 0);
  const currency = items[0]?.currency ?? "USD";
  const overdue = items.filter((r) => r.next_expected_date! < todayIso);
  const thisWeek = items.filter((r) => r.next_expected_date! >= todayIso && r.next_expected_date! <= weekEnd);
  const later = items.filter((r) => r.next_expected_date! > weekEnd);

  return (
    <main className="page">
      <div className="card pad lead">
        <span className="label">Left to pay in {monthName(todayIso)}</span>
        {isError ? (
          <ErrorBlock what="your bills" onRetry={() => refetch()} />
        ) : isPending ? (
          <>
            <Skeleton height={38} width="50%" />
            <Skeleton height={16} width="40%" />
          </>
        ) : items.length === 0 ? (
          <>
            <span className="display lead-figure">—</span>
            <span className="lead-sub">No recurring bills found yet. They appear after a few months of matching transactions.</span>
          </>
        ) : (
          <>
            <span className="display lead-figure">{money(leftToPay, currency, { cents: false })}</span>
            <span className="lead-sub">
              {thisMonth.length === 0 ? "Nothing else due this month" : `${thisMonth.length} ${thisMonth.length === 1 ? "bill" : "bills"} still due this month`}
            </span>
          </>
        )}
      </div>
      {isPending && (
        <Section title="This week">
          <div className="card list">
            {[0, 1, 2].map((i) => (
              <div key={i} className="row">
                <Skeleton height={36} width={36} />
                <Skeleton height={18} />
              </div>
            ))}
          </div>
        </Section>
      )}
      {overdue.length > 0 && <Group title="Expected, not seen yet" items={overdue} late />}
      {thisWeek.length > 0 && <Group title="This week" items={thisWeek} />}
      {later.length > 0 && <Group title="Later" items={later} />}
    </main>
  );
}

function Group({ title, items, late }: { title: string; items: RecurringItem[]; late?: boolean }) {
  return (
    <Section title={title}>
      <div className="card list">
        {items.map((r) => {
          const date = parseDate(r.next_expected_date!);
          const varies = r.expected_amount_min_cents !== null && r.expected_amount_max_cents !== null && r.expected_amount_min_cents !== r.expected_amount_max_cents;
          return (
            <div key={r.id} className="row">
              <span className="date-tile" style={{ color: late ? "var(--over)" : undefined }}>
                <span>{shortMonth(date)}</span>
                <b>{date.getDate()}</b>
              </span>
              <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span className="name">{r.merchant?.name ?? r.name}</span>
                <span className="sub">
                  {varies ? `Usually ${money(r.expected_amount_min_cents!, r.currency, { cents: false })}–${money(r.expected_amount_max_cents!, r.currency, { cents: false })}` : "Same amount each month"}
                  {r.autopay ? " · autopay" : ""}
                </span>
              </span>
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
