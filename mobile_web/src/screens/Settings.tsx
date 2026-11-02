import { ExternalLink, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Section, Toggle, toast } from "../components/ui";
import { api, getSession, signOut } from "../lib/api";
import { clearCache, useApi } from "../lib/data";
import { initials } from "../lib/format";
import { back } from "../lib/router";
import { pushState, subscribeToPush, unsubscribeFromPush } from "../lib/push";
import type { ProviderConnection } from "../lib/types";

export function Settings() {
  const user = getSession()?.user;
  const family = useApi<{ name: string; currency: string }>("/family_settings");
  const connections = useApi<{ data?: ProviderConnection[]; provider_connections?: ProviderConnection[] }>("/provider_connections");
  const [push, setPush] = useState<"unsupported" | "denied" | "off" | "on">("off");

  useEffect(() => {
    pushState().then(setPush);
  }, []);

  const togglePush = async (on: boolean) => {
    try {
      if (on) await subscribeToPush();
      else await unsubscribeFromPush();
      setPush(await pushState());
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't change notifications");
    }
  };

  const exportData = async () => {
    await api("/family_exports", { method: "POST" });
    toast("Export started — we'll have it ready on the web");
  };

  const list = connections.data?.provider_connections ?? connections.data?.data ?? [];

  return (
    <main className="page plain" style={{ gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 44 }}>
        <button className="icon-btn pressable" style={{ color: "var(--ink)" }} aria-label="Close" onClick={() => back()}>
          <X size={24} />
        </button>
        <span style={{ fontWeight: 600 }}>Settings</span>
        <span style={{ width: 44 }} />
      </div>

      <div className="card pad" style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ width: 48, height: 48, borderRadius: 24, background: "var(--brand-tint)", color: "var(--brand)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 18 }}>
          {initials(`${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim() || user?.email || "?")}
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontWeight: 600 }}>{[user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email}</span>
          <span className="muted" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {family.data ? `${family.data.name} · ${family.data.currency} · ` : ""}
            {location.host}
          </span>
        </span>
      </div>

      {list.length > 0 && (
        <Section title="Connections">
          <div className="card list">
            {list.map((c) => {
              const bad = c.requires_update || c.status === "error";
              return (
                <div key={c.id} className="row">
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: bad ? "var(--over)" : "var(--good)", flexShrink: 0 }} />
                  <span className="grow name" style={{ fontSize: 15 }}>
                    {c.name}
                  </span>
                  {bad ? (
                    <a href="/settings/providers" style={{ fontSize: 13, fontWeight: 600, color: "var(--over)", textDecoration: "none" }}>
                      Fix on web ↗
                    </a>
                  ) : (
                    <span className="muted" style={{ fontSize: 13 }}>
                      {c.status}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="App">
        <div className="card list">
          <div className="row">
            <span className="grow">Notifications</span>
            {push === "unsupported" ? (
              <span className="muted" style={{ fontSize: 13 }}>
                Add to Home Screen first
              </span>
            ) : push === "denied" ? (
              <span className="muted" style={{ fontSize: 13 }}>
                Blocked in system settings
              </span>
            ) : (
              <Toggle on={push === "on"} label="Notifications" onChange={togglePush} />
            )}
          </div>
          <button className="row pressable" onClick={exportData}>
            <span className="grow">Export my data</span>
            <span className="muted">CSV</span>
          </button>
          <a className="row" href="/" style={{ color: "inherit", textDecoration: "none" }}>
            <span className="grow">Open full web app</span>
            <ExternalLink size={16} color="var(--ink-3)" />
          </a>
          <button
            className="row pressable"
            onClick={() => {
              signOut();
              clearCache();
            }}
          >
            <span className="grow" style={{ color: "var(--over)", fontWeight: 500 }}>
              Sign out
            </span>
          </button>
        </div>
      </Section>
    </main>
  );
}
