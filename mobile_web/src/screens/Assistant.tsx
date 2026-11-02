import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PushedScreen } from "../components/Screen";
import { api, ApiError } from "../lib/api";
import { useApi } from "../lib/query";
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
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
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

  const composer = (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        send(draft);
      }}
    >
      <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask about your money" aria-label="Message" enterKeyHint="send" />
      <button type="submit" className="pressable" aria-label="Send" disabled={!draft.trim() || waiting}>
        <ArrowUp size={18} strokeWidth={2.4} />
      </button>
    </form>
  );

  return (
    <PushedScreen id="assistant" title="Assistant" close footer={composer}>
      {insight && messages.length === 0 && (
        <div className="insight">
          <span className="insight-title">{insight.title}</span>
          <span className="insight-body">{insight.body}</span>
          <button className="pressable" onClick={() => send(`Tell me more about this: ${insight.title}`)}>
            Ask about this
          </button>
        </div>
      )}

      {messages.length === 0 && (
        <div className="starters" data-noswipe>
          <span className="label">Try asking</span>
          {STARTERS.map((s) => (
            <button key={s} className="starter pressable" onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="thread">
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="bubble mine">
              {m.content}
            </div>
          ) : m.content ? (
            <div key={m.id} className="bubble theirs">
              {m.content}
              {!!m.tool_calls?.length && (
                <div className="tools">
                  {m.tool_calls.map((c, i) => (
                    <code key={i}>{c.function_name}</code>
                  ))}
                </div>
              )}
            </div>
          ) : null,
        )}
        {waiting && (
          <div className="bubble theirs typing" aria-label="Thinking">
            <span />
            <span />
            <span />
          </div>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div ref={endRef} />
      </div>
    </PushedScreen>
  );
}
