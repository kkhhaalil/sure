import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { PushedScreen } from "../components/Screen";
import { ErrorBlock, Section, Skeleton, Toggle, toast } from "../components/ui";
import { api, getSession, signOut } from "../lib/api";
import { initials } from "../lib/format";
import { go } from "../lib/nav";
import { pushState, subscribeToPush, unsubscribeFromPush } from "../lib/push";
import { queryClient, useApi } from "../lib/query";
import type { ProviderConnection } from "../lib/types";

export function Settings() {
  const user = getSession()?.user;
  const family = useApi<{ name: string; currency: string }>("/family_settings");
  const connections = useApi<{ data?: ProviderConnection[]; provider_connections?: ProviderConnection[] }>("/provider_connections");
  const [push, setPush] = useState<"unsupported" | "denied" | "off" | "on" | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    pushState().then(setPush);
  }, []);

  const togglePush = async (on: boolean) => {
    setPushBusy(true);
    try {
      if (on) await subscribeToPush();
      else await unsubscribeFromPush();
      setPush(await pushState());
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't change notifications");
    } finally {
      setPushBusy(false);
    }
  };

  const exportData = async () => {
    try {
      await api("/family_exports", { method: "POST" });
      toast("Export started. Download it from the web app.");
    } catch {
      toast("Couldn't start the export");
    }
  };

  const list = connections.data?.provider_connections ?? connections.data?.data ?? [];

  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ");

  return (
    <PushedScreen id="settings" title="Settings" close>
      <div className="card pad profile">
        <span className="avatar large" aria-hidden>
          {initials(name || user?.email || "?")}
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span className="name">{name || user?.email}</span>
          <span className="sub ellipsis">{family.data ? `${family.data.name} · ${family.data.currency}` : user?.email}</span>
          <span className="sub ellipsis">{location.host}</span>
        </span>
      </div>

      <Section title="Connections">
        <div className="card list">
          {connections.isError && <ErrorBlock what="connections" onRetry={() => connections.refetch()} />}
          {connections.isPending && (
            <div className="row">
              <Skeleton height={18} />
            </div>
          )}
          {connections.isSuccess && list.length === 0 && (
            <a className="row" href="/settings/providers">
              <span className="grow sub" style={{ fontSize: 15 }}>
                No bank connections. Accounts are updated by hand or import.
              </span>
              <ExternalLink size={16} color="var(--ink-3)" />
            </a>
          )}
          {list.map((c) => {
            const bad = c.requires_update || c.status === "error";
            return (
              <div key={c.id} className="row">
                <span className="grow" style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span className="name">{c.name}</span>
                  <span className="sub" style={{ color: bad ? "var(--over)" : undefined }}>
                    {bad ? "Needs attention" : c.status.replace(/_/g, " ").replace(/^./, (ch) => ch.toUpperCase())}
                  </span>
                </span>
                {bad && (
                  <a className="link" href="/settings/providers">
                    Fix on web
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="This device">
        <div className="card list">
          <div className="row">
            <span className="grow" style={{ display: "flex", flexDirection: "column" }}>
              <span>Notifications</span>
              {push === "unsupported" && <span className="sub">Open Sure from your Home Screen to turn these on</span>}
              {push === "denied" && <span className="sub">Blocked. Allow them in the system Settings app.</span>}
            </span>
            {push === null ? <Skeleton height={31} width={51} radius={16} /> : push === "on" || push === "off" ? <Toggle on={push === "on"} label="Notifications" disabled={pushBusy} onChange={togglePush} /> : null}
          </div>
          <button className="row pressable" onClick={exportData}>
            <span className="grow">Export my data</span>
            <span className="sub">CSV</span>
          </button>
          <a className="row" href="/">
            <span className="grow">Open the full web app</span>
            <ExternalLink size={16} color="var(--ink-3)" />
          </a>
        </div>
      </Section>

      <button
        className="btn soft pressable"
        style={{ color: "var(--over)" }}
        onClick={() => {
          signOut();
          queryClient.clear();
          go("/", { replace: true });
        }}
      >
        Sign out
      </button>
    </PushedScreen>
  );
}
