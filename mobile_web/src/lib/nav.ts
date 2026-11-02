import type { AnyRouter } from "@tanstack/react-router";

// Navigation helpers for event handlers. Screens import these instead of the
// route tree, which imports the screens.
let router: AnyRouter;

export function bindRouter(instance: AnyRouter) {
  router = instance;
}

export type SheetSearch = { txn?: string; pick?: string; rule?: string; account?: string; add?: boolean };
type Search = Record<string, unknown>;

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Tabs cross-fade; pushed screens slide in from the right.
export function go(to: string, opts: { replace?: boolean; search?: Search; push?: boolean } = {}) {
  router.navigate({
    to,
    search: opts.search ?? {},
    replace: opts.replace,
    viewTransition: reduceMotion() ? false : { types: [opts.push ? "push" : "fade"] },
  });
}

export function back(fallback = "/") {
  if (router.history.canGoBack()) router.history.back();
  else go(fallback, { replace: true });
}

// Sheets live in the search string so the system back gesture closes them.
// Remember which history entries opened one: closing those goes back,
// closing a sheet that came from a link just drops the parameter.
const opened = new Set<string>();

export function openSheets(): SheetSearch {
  return router.state.location.search as SheetSearch;
}

export function openSheet(search: SheetSearch) {
  router
    .navigate({ to: ".", search: (prev: Search) => ({ ...prev, ...search }) })
    .then(() => opened.add(router.state.location.state.__TSR_key ?? ""));
}

export function closeSheet(...keys: (keyof SheetSearch)[]) {
  const key = router.state.location.state.__TSR_key ?? "";
  if (opened.has(key)) {
    opened.delete(key);
    router.history.back();
    return;
  }
  router.navigate({
    to: ".",
    replace: true,
    search: (prev: Search) => Object.fromEntries(Object.entries(prev).filter(([k]) => !keys.includes(k as keyof SheetSearch))),
  });
}
