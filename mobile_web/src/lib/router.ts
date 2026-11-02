import { useSyncExternalStore } from "react";

// History-backed routing under /m. Sheets are routes too, so the system
// back gesture closes them the way it would in a native app.
const BASE = "/m";
const listeners = new Set<() => void>();

addEventListener("popstate", () => listeners.forEach((fn) => fn()));

function current() {
  const path = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) || "/" : "/";
  return path + location.search;
}

export function navigate(to: string, { replace = false } = {}) {
  const url = BASE + (to === "/" ? "" : to);
  if (url === location.pathname + location.search) return;
  const go = () => {
    if (replace) history.replaceState(null, "", url);
    else history.pushState(null, "", url);
    listeners.forEach((fn) => fn());
  };
  // Cross-fade between routes where the browser supports it.
  const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
  if (doc.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) doc.startViewTransition(go);
  else go();
}

export function back(fallback = "/") {
  if (history.state !== null || history.length > 1) history.back();
  else navigate(fallback, { replace: true });
}

export function useRoute() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    current,
  );
}

export function match(pattern: string, path: string): Record<string, string> | null {
  const [pathname] = path.split("?");
  const a = pattern.split("/").filter(Boolean);
  const b = pathname.split("/").filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(":")) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

export function queryParam(path: string, key: string) {
  return new URLSearchParams(path.split("?")[1] ?? "").get(key);
}
