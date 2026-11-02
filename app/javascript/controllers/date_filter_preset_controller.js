import { Controller } from "@hotwired/stimulus";

// Fills the start/end date filters from a relative preset (today, yesterday,
// week to date, month to date, last 30 days).
//
// Dates are computed in the browser so "today" is the account owner's today,
// not the server's: the app renders for viewers in several timezones, and a
// server-side "today" would be off by a day around midnight.
export default class extends Controller {
  static targets = ["start", "end"];

  apply(event) {
    const range = this.#range(event.params.preset, new Date());
    if (!range) return;

    this.startTarget.value = range.start;
    this.endTarget.value = range.end;
  }

  #range(preset, now) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (preset) {
      case "today":
        return { start: isoDate(today), end: isoDate(today) };
      case "yesterday": {
        const day = addDays(today, -1);
        return { start: isoDate(day), end: isoDate(day) };
      }
      case "week_to_date":
        // Monday-based, matching ISO weeks.
        return { start: isoDate(addDays(today, -((today.getDay() + 6) % 7))), end: isoDate(today) };
      case "month_to_date":
        return { start: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)), end: isoDate(today) };
      case "last_30_days":
        return { start: isoDate(addDays(today, -29)), end: isoDate(today) };
      default:
        return null;
    }
  }
}

function addDays(date, days) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function isoDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
