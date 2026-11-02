import { createRootRoute, createRoute, createRouter, Outlet, useLocation, useSearch } from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Header, TABS, useTabSwipe } from "./components/Header";
import { Scroller } from "./components/Screen";
import { usePresence } from "./components/Sheet";
import { Toaster } from "./components/ui";
import { exchangeWebSession, getSession, onSessionChange } from "./lib/api";
import { bindRouter, type SheetSearch } from "./lib/nav";
import { useOnline } from "./lib/query";
import { AccountSheet, Accounts, Holdings } from "./screens/Accounts";
import { Assistant } from "./screens/Assistant";
import { Home } from "./screens/Home";
import { NewTransactionSheet } from "./screens/NewTransaction";
import { InstallPrompt, isStandalone, SignIn } from "./screens/Onboarding";
import { Recurring } from "./screens/Recurring";
import { Review } from "./screens/Review";
import { RuleSheet } from "./screens/RuleSheet";
import { Settings } from "./screens/Settings";
import { CategoryDetail, Spending } from "./screens/Spending";
import { CategoryPicker, TransactionSheet } from "./screens/TransactionSheet";
import { Transactions } from "./screens/Transactions";

const text = (value: unknown) => (typeof value === "string" && value ? value : undefined);

// Sheets are search params on any route: ?txn=<id>, ?pick=<id> (category
// picker), ?rule=<id> (rule from a transaction), ?account=<id>, ?add=true (new transaction).
const rootRoute = createRootRoute({
  component: Root,
  validateSearch: (search: Record<string, unknown>): SheetSearch => ({
    txn: text(search.txn),
    pick: text(search.pick),
    rule: text(search.rule),
    account: text(search.account),
    add: search.add === true || search.add === "true" ? true : undefined,
  }),
});

const tabsRoute = createRoute({ getParentRoute: () => rootRoute, id: "tabs", component: TabShell });
const tab = (path: string, component: () => JSX.Element) => createRoute({ getParentRoute: () => tabsRoute, path, component });

export type TransactionsSearch = { in?: string; filter?: "month" | "uncategorized" };
const transactionsRoute = createRoute({
  getParentRoute: () => tabsRoute,
  path: "/transactions",
  component: Transactions,
  validateSearch: (search: Record<string, unknown>): TransactionsSearch => ({
    in: text(search.in),
    filter: search.filter === "month" || search.filter === "uncategorized" ? search.filter : undefined,
  }),
});

const pushed = <P extends string>(path: P, component: () => JSX.Element) => createRoute({ getParentRoute: () => rootRoute, path, component });

const routeTree = rootRoute.addChildren([
  tabsRoute.addChildren([tab("/", Home), transactionsRoute, tab("/spending", Spending), tab("/accounts", Accounts), tab("/recurring", Recurring)]),
  pushed("/review", Review),
  pushed("/assistant", Assistant),
  pushed("/settings", Settings),
  pushed("/categories/$id", CategoryDetail),
  pushed("/accounts/$id/holdings", Holdings),
]);

export const router = createRouter({ routeTree, basepath: "/m", defaultPreload: false, scrollRestoration: false });
bindRouter(router);

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function useSignedIn() {
  return useSyncExternalStore(onSessionChange, () => !!getSession());
}

function Root() {
  const signedIn = useSignedIn();
  const online = useOnline();
  const [checkedWebSession, setCheckedWebSession] = useState(signedIn);
  const [skipInstall, setSkipInstall] = useState(() => isStandalone() || sessionStorage.getItem("sure.skipInstall") === "1" || !/Mobi|Android|iPhone/.test(navigator.userAgent));

  // A web session (passkey/SSO/MFA on the web sign-in page) signs the app in
  // without asking again.
  useEffect(() => {
    if (signedIn) return;
    exchangeWebSession()
      .catch(() => false)
      .finally(() => setCheckedWebSession(true));
  }, [signedIn]);

  if (!skipInstall)
    return (
      <InstallPrompt
        onSkip={() => {
          sessionStorage.setItem("sure.skipInstall", "1");
          setSkipInstall(true);
        }}
      />
    );
  if (!signedIn) return checkedWebSession ? <SignIn /> : <div className="app" />;

  return (
    <>
      {!online && <div className="offline">Offline. Showing your last synced data.</div>}
      <Outlet />
      <Sheets />
      <Toaster />
    </>
  );
}

function Sheets() {
  const search = useSearch({ strict: false }) as SheetSearch;
  const txn = usePresence(search.txn);
  const pick = usePresence(search.pick);
  const rule = usePresence(search.rule);
  const account = usePresence(search.account);
  const add = usePresence(search.add);
  return (
    <>
      {account.value && <AccountSheet id={account.value} open={account.open} onExited={account.onExited} />}
      {add.value && <NewTransactionSheet open={add.open} onExited={add.onExited} />}
      {txn.value && <TransactionSheet id={txn.value} open={txn.open} onExited={txn.onExited} />}
      {rule.value && <RuleSheet id={rule.value} open={rule.open} onExited={rule.onExited} />}
      {pick.value && <CategoryPicker id={pick.value} open={pick.open} onExited={pick.onExited} />}
    </>
  );
}

function TabShell() {
  const pathname = useLocation({ select: (l) => l.pathname.replace(/^\/m/, "") || "/" });
  const active = TABS.find((t) => t.path === pathname)?.path ?? "/";
  useTabSwipe(active);
  return (
    <div className="app">
      <Header active={active} />
      <Scroller id={active} key={active}>
        <Outlet />
      </Scroller>
    </div>
  );
}
