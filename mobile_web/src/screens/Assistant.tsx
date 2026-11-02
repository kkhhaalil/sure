import { ArrowUp, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useApi } from "../lib/data";
import { back } from "../lib/router";
import type { Chat, Insight, Message } from "../lib/types";

const STARTERS = ["What were my biggest expenses this month?", "Which subscriptions could I cancel?", "Am I on track with my budget?"];

// Chat with Sure's assistant. Replies are generated server-side; the app
// polls the chat until the assistant message's status is complete.
export function Assistant() {
  const insights = useApi<{ insights: Insight[] }>("/insights");
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Block body: scrollIntoView returns a Promise in newer browsers, and an
    // effect must not return anything but a cleanup function.
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, waiting]);

  useEffect(() => {
    if (!waiting || !chatId) return;
    let stop = false;
    const poll = async () => {
      while (!stop) {
        await new Promise((r) => setTimeout(r, 1200));
        const chat = await api<Chat>(`/chats/${chatId}`).catch(() => null);
        if (!chat?.messages) continue;
        setMessages(chat.messages);
        const lastAssistant = [...chat.messages].reverse().find((m) => m.role === "assistant");
        if (lastAssistant && lastAssistant.status !== "pending") {
          setWaiting(false);
          return;
        }
      }
    };
    poll();
    return () => {
      stop = true;
    };
  }, [waiting, chatId]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || waiting) return;
    setDraft("");
    setError(null);
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "user", type: "user_message", content, status: "complete", created_at: new Date().toISOString() }]);
    setWaiting(true);
    try {
      if (chatId) await api(`/chats/${chatId}/messages`, { method: "POST", body: { content } });
      else {
        const chat = await api<Chat>("/chats", { method: "POST", body: { title: content.slice(0, 60), message: content } });
        setChatId(chat.id);
      }
    } catch (e) {
      setWaiting(false);
      setError(e instanceof ApiError && e.status === 403 ? "The assistant is turned off for your account. Enable AI in Settings on the web." : "Couldn't send. Try again.");
    }
  };

  const insight = insights.data?.insights.find((i) => i.status === "active") ?? insights.data?.insights[0];

  useEffect(() => {
    if (insight && insight.status === "active") api(`/insights/${insight.id}`, { method: "PATCH", body: { status: "read" } }).catch(() => {});
  }, [insight?.id]);

  return (
    <main className="page plain" style={{ gap: 14, minHeight: "100dvh" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 44 }}>
        <button className="icon-btn pressable" style={{ color: "var(--ink)" }} aria-label="Close" onClick={() => back()}>
          <X size={24} />
        </button>
        <span style={{ fontWeight: 600 }}>Assistant</span>
        <span style={{ width: 44 }} />
      </div>

      {insight && messages.length === 0 && (
        <div style={{ background: "var(--brand)", color: "#fff", borderRadius: 20, padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="eyebrow" style={{ color: "rgb(255 255 255 / 0.7)" }}>
            Insight
          </span>
          <span style={{ fontSize: 16, lineHeight: "22px", fontWeight: 600 }}>{insight.title}</span>
          <span style={{ fontSize: 14, lineHeight: "20px", opacity: 0.85 }}>{insight.body}</span>
          <button className="pressable" style={{ alignSelf: "flex-start", fontSize: 14, fontWeight: 600, color: "#bfe0cb", paddingTop: 4 }} onClick={() => send(`Tell me more about this: ${insight.title}`)}>
            Ask about this →
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} style={{ alignSelf: "flex-end", maxWidth: "80%", background: "var(--ink)", color: "var(--surface)", borderRadius: "18px 18px 4px 18px", padding: "11px 14px", fontSize: 15, lineHeight: "21px" }}>
              {m.content}
            </div>
          ) : m.content ? (
            <div key={m.id} style={{ alignSelf: "flex-start", maxWidth: "88%", background: "var(--surface)", borderRadius: "18px 18px 18px 4px", padding: "12px 14px", fontSize: 15, lineHeight: "22px", whiteSpace: "pre-wrap" }}>
              {m.content}
              {!!m.tool_calls?.length && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingTop: 8 }}>
                  {m.tool_calls.map((c, i) => (
                    <span key={i} style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-2)", background: "var(--surface-sunk)", padding: "4px 7px", borderRadius: 6 }}>
                      {c.function_name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : null,
        )}
        {waiting && (
          <div style={{ alignSelf: "flex-start", background: "var(--surface)", borderRadius: 18, padding: "12px 16px", display: "flex", gap: 5 }} aria-label="Thinking">
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ width: 7, height: 7, borderRadius: 4, background: "var(--ink-4)", animation: `blink 1.2s ${i * 0.2}s infinite` }} />
            ))}
            <style>{"@keyframes blink{0%,80%,100%{opacity:.25}40%{opacity:1}}"}</style>
          </div>
        )}
        {error && <div style={{ color: "var(--over)", fontSize: 14 }}>{error}</div>}
        <div ref={endRef} />
      </div>

      {messages.length === 0 && (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none" }} data-noswipe>
          {STARTERS.map((s) => (
            <button key={s} className="pressable" onClick={() => send(s)} style={{ flexShrink: 0, padding: "8px 12px", borderRadius: 14, border: "1.5px solid var(--line)", fontSize: 14 }}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        style={{ position: "sticky", bottom: "calc(12px + var(--safe-bottom))", height: 52, borderRadius: 26, background: "var(--surface)", display: "flex", alignItems: "center", padding: "0 6px 0 18px", gap: 10, boxShadow: "var(--shadow-lift)" }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask about your money…" style={{ flex: 1, border: 0, outline: "none", background: "transparent", minWidth: 0 }} />
        <button type="submit" className="pressable" aria-label="Send" disabled={!draft.trim() || waiting} style={{ width: 40, height: 40, borderRadius: 20, background: "var(--brand)", color: "#fff", display: "grid", placeItems: "center", opacity: draft.trim() ? 1 : 0.4 }}>
          <ArrowUp size={18} strokeWidth={2.4} />
        </button>
      </form>
    </main>
  );
}
