import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { assistant } from "../lib/api";
import PageHeader from "../components/layout/PageHeader";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import ErrorState from "../components/ui/ErrorState";

const EXAMPLES = [
  "Show my highest-risk borrowers.",
  "Which recovery cases should I prioritize today?",
  "Show overdue grievances.",
  "Which borrowers in my city are most likely to default?",
];

function RichText({ text }) {
  // Minimal rich text: **bold** + bullet lines. No markdown library needed.
  const lines = String(text || "").split("\n");
  return (
    <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.65 }}>
      {lines.map((ln, i) => {
        const m = ln.match(/^\s*[-*]\s+(.*)$/);
        const body = m ? m[1] : ln;
        const parts = body.split(/(\*\*[^*]+\*\*)/g);
        return (
          <div key={i} style={m ? { paddingLeft: 16, position: "relative" } : undefined}>
            {m && <span style={{ position: "absolute", left: 2 }}>•</span>}
            {parts.map((p, j) =>
              p.startsWith("**") && p.endsWith("**") && p.length > 4
                ? <b key={j}>{p.slice(2, -2)}</b>
                : <span key={j}>{p}</span>
            )}
            {ln === "" && <br />}
          </div>
        );
      })}
    </div>
  );
}

/** AI Recovery Intelligence — real LLM grounded in live platform data.
 *  Every number in every answer comes from a backend tool call, and tools
 *  enforce the same role permissions as the REST API. Nothing is mocked. */
export default function Assistant() {
  const { session } = useAuth();
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [toolsLine, setToolsLine] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    assistant.status(session?.token)
      .then(setStatus)
      .catch((e) => setStatusError(e.message));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput("");
    setToolsLine("");
    const history = [...messages.slice(-8).map((m) => ({ role: m.role, content: m.text })), { role: "user", content: message }];
    setMessages((ms) => [...ms, { role: "user", text: message }]);
    setBusy(true);
    try {
      const r = await assistant.chat(message, history.slice(0, -1), session?.token);
      if (r.tools_used?.length) setToolsLine(`Consulted live data: ${r.tools_used.join(", ")}`);
      setMessages((ms) => [...ms, { role: "assistant", text: r.reply, model: r.model }]);
    } catch (e) {
      setMessages((ms) => [...ms, { role: "error", text: e.message }]);
    } finally {
      setBusy(false);
    }
  };

  if (statusError) return <ErrorState message={statusError} onRetry={() => window.location.reload()} />;

  return (
    <div>
      <PageHeader
        title="AI Recovery Intelligence"
        description={status
          ? `Live analyst over your authorized data · ${status.model} on ${status.provider}`
          : "Live analyst over your authorized data"}
      />
      {status && !status.configured && (
        <Card style={{ marginBottom: 16, borderColor: "var(--warning)" }}>
          <div style={{ padding: 4, fontSize: 14 }}>
            <b>AI provider not configured.</b> This page never fakes answers, so chat is disabled until an
            administrator sets <code>LLM_API_KEY</code> (and optionally <code>LLM_PROVIDER</code> /{" "}
            <code>LLM_MODEL</code>) in the backend environment and restarts.
          </div>
        </Card>
      )}
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 320 }}>
          {!messages.length && (
            <div>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 12px" }}>
                Ask about borrowers, risk, recovery queues, grievances or policy — answers are computed
                from live records you are allowed to see, explained in plain words.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {EXAMPLES.map((ex) => (
                  <Button key={ex} variant="secondary" size="sm" disabled={!status?.configured} onClick={() => send(ex)}>
                    {ex}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              background: m.role === "user" ? "var(--pv-ink, #191a23)" : "var(--surface-hover)",
              color: m.role === "user" ? "#fff" : "var(--text-primary)",
              border: m.role === "user" ? "1px solid var(--pv-ink, #191a23)" : "1px solid var(--border)",
              borderRadius: 14,
              padding: "10px 14px",
            }}>
              {m.role === "error"
                ? <span style={{ fontSize: 13, color: "var(--danger)" }}>{m.text}</span>
                : <RichText text={m.text} />}
              {m.model && <div style={{ fontSize: 10, color: m.role === "user" ? "rgba(255,255,255,.6)" : "var(--text-muted)", marginTop: 6 }}>{m.model}</div>}
            </div>
          ))}
          {busy && (
            <div style={{ alignSelf: "flex-start", fontSize: 13, color: "var(--text-muted)" }}>
              <span className="loading-spinner" style={{ width: 14, height: 14, display: "inline-block", verticalAlign: "-2px", marginRight: 8 }} />
              Analyzing live records…
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        {toolsLine && !busy && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10 }}>{toolsLine}</div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            placeholder={status?.configured ? "Ask about risk, recovery, grievances…" : "AI provider not configured"}
            aria-label="Ask the AI recovery analyst"
            className="filter-search-input"
            style={{ flex: 1 }}
            disabled={busy || !status?.configured}
          />
          <Button variant="primary" onClick={() => send()} disabled={busy || !input.trim() || !status?.configured}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="sparkles" size={14} /> {busy ? "Thinking…" : "Ask"}
            </span>
          </Button>
        </div>
      </Card>
    </div>
  );
}
