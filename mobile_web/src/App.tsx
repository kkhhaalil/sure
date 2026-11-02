import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Header, TABS, useTabSwipe } from "./components/Header";
import { Toaster } from "./components/ui";
import { exchangeWebSession, getSession, onSessionChange } from "./lib/api";
import { useOnline } from "./lib/data";
import { match, useRoute } from "./lib/router";
import { AccountSheet, Accounts, Holdings } from "./screens/Accounts";
import { Assistant } from "./screens/Assistant";
import { Home } from "./screens/Home";
import { InstallPrompt, isStandalone, SignIn } from "./screens/Onboarding";
import { Recurring } from "./screens/Recurring";
import { Review } from "./screens/Review";
import { Settings } from "./screens/Settings";
import { CategoryDetail, Spending } from "./screens/Spending";
import { CategoryPicker, TransactionSheet } from "./screens/TransactionSheet";
import { Transactions } from "./screens/Transactions";

const TAB_SCREENS: Record<string, () => JSX.Element> = {
  "/": Home,
  "/transactions": Transactions,
  "/spending": Spending,
  "/accounts": Accounts,
  "/recurring": Recurring,
};

function useSignedIn() {
  return useSyncExternalStore(onSessionChange, () => !!getSession());
}

export function App() {
  const signedIn = useSignedIn();
  const route = useRoute();
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
  if (!signedIn) return checkedWebSession ? <SignIn /> : null;

  return (
    <>
      {!online && <div className="offline">Offline — showing your last synced data</div>}
      <Routes route={route} />
      <Toaster />
    </>
  );
}

function Routes({ route }: { route: string }) {
  const path = route.split("?")[0];
  // Sheets and pushed screens render over the tab the user came from.
  const lastTab = useRef("/");
  if (TAB_SCREENS[path]) lastTab.current = path;

  let params: Record<string, string> | null;
  if (path === "/review") return <Review />;
  if (path === "/assistant") return <Assistant />;
  if (path === "/settings") return <Settings />;
  if ((params = match("/categories/:id", path))) return <CategoryDetail id={params.id} />;
  if ((params = match("/accounts/:id/holdings", path))) return <Holdings id={params.id} />;

  let overlay: JSX.Element | null = null;
  if ((params = match("/transactions/:id/category", path))) overlay = <CategoryPicker id={params.id} />;
  else if ((params = match("/transactions/:id", path)) && params.id !== "new") overlay = <TransactionSheet id={params.id} />;
  else if ((params = match("/accounts/:id", path))) {
    overlay = <AccountSheet id={params.id} />;
    lastTab.current = "/accounts";
  }

  const tab = TAB_SCREENS[path] ? path : lastTab.current;
  return <TabShell tab={tab} overlay={overlay} />;
}

function TabShell({ tab, overlay }: { tab: string; overlay: JSX.Element | null }) {
  useTabSwipe(tab);
  const Screen = TAB_SCREENS[tab] ?? TAB_SCREENS["/"];
  const active = TABS.find((t) => t.path === tab)?.path ?? "/";
  return (
    <div className="app">
      <Header active={active} />
      <Screen key={tab} />
      {overlay}
    </div>
  );
}
