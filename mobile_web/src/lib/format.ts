// Follow the server's locale (the shell sets <html lang>), so dates match
// the app's own language rather than the phone's.
export const LOCALE = document.documentElement.lang || undefined;

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, cents: boolean) {
  const key = `${currency}:${cents}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : 0,
    });
    formatters.set(key, f);
  }
  return f;
}

// Whole units for headline numbers, cents for rows.
export function money(cents: number | null | undefined, currency = "USD", opts: { cents?: boolean; sign?: boolean } = {}) {
  const value = (cents ?? 0) / 100;
  const text = formatter(currency, opts.cents ?? true).format(Math.abs(value));
  if (opts.sign && value > 0) return `+${text}`;
  if (value < 0) return `−${text}`;
  return text;
}

export function decimalToCents(value: string | null | undefined) {
  return Math.round(Number(value ?? 0) * 100);
}

export function parseDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function today() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dayLabel(iso: string) {
  const date = parseDate(iso);
  const diff = Math.round((today().getTime() - date.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString(LOCALE, { weekday: "short", month: "short", day: "numeric" });
}

export function shortDate(iso: string) {
  return parseDate(iso).toLocaleDateString(LOCALE, { month: "short", day: "numeric" });
}

export function inDays(iso: string) {
  const diff = Math.round((parseDate(iso).getTime() - today().getTime()) / 86_400_000);
  if (diff <= 0) return "today";
  if (diff === 1) return "tomorrow";
  return `in ${diff} days`;
}

export function monthName(iso: string, style: "long" | "short" = "long") {
  return parseDate(iso).toLocaleDateString(LOCALE, { month: style });
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}
