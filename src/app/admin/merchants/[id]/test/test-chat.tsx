"use client";

import { useEffect, useRef, useState } from "react";
import type { TraceEntry } from "@/lib/ai/engine";
import type { Collected } from "@/lib/types";
import { sendTestMessage } from "../../../actions";

type Bubble = { role: "user" | "assistant"; content: string; trace?: TraceEntry[] };

export function TestChat({
  merchantId,
  questionLabels,
  calendarConnected,
}: {
  merchantId: string;
  questionLabels: Record<string, string>;
  calendarConnected: boolean;
}) {
  const [log, setLog] = useState<Bubble[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [collected, setCollected] = useState<Collected>({});
  const [status, setStatus] = useState("open");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [log, busy]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = text.trim();
    if (!message || busy) return;
    setText("");
    setError(null);
    setBusy(true);
    setLog((l) => [...l, { role: "user", content: message }]);
    try {
      const r = await sendTestMessage(merchantId, conversationId, message);
      setConversationId(r.conversationId);
      setCollected(r.collected);
      setStatus(r.status);
      setLog((l) => [...l, { role: "assistant", content: r.reply, trace: r.trace }]);
    } catch {
      setError("The test message failed. Check that OPENAI_API_KEY is set, then try again.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setLog([]);
    setConversationId(null);
    setCollected({});
    setStatus("open");
    setError(null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <section className="card flex h-[34rem] flex-col p-0">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 text-sm">
          <span className="text-slate-600">
            You play the lead, texting as SMS. Nothing is sent to a phone and bookings are simulated.
          </span>
          <button type="button" className="btn-secondary" onClick={reset}>New conversation</button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
          {log.length === 0 && (
            <p className="text-sm text-slate-500">Send a first message, e.g. &ldquo;Hi, I filled out the form about a quote.&rdquo;</p>
          )}
          {log.map((b, i) => (
            <div key={i} className={b.role === "user" ? "flex justify-end" : ""}>
              <div className="max-w-[85%]">
                <div className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  b.role === "user" ? "bg-blue-600 text-white" : "border border-slate-200 bg-white"}`}>
                  {b.content}
                </div>
                {b.trace && b.trace.length > 0 && (
                  <details className="mt-1 text-xs text-slate-500">
                    <summary className="cursor-pointer">{b.trace.map((t) => t.tool).join(" → ")}</summary>
                    <pre className="mt-1 overflow-x-auto rounded bg-slate-900 p-2 text-slate-100">{JSON.stringify(b.trace, null, 2)}</pre>
                  </details>
                )}
              </div>
            </div>
          ))}
          {busy && <p className="text-sm text-slate-500">Assistant is typing…</p>}
          <div ref={end} />
        </div>
        {error && <p className="px-4 py-2 text-sm text-red-600">{error}</p>}
        <form onSubmit={send} className="flex gap-2 border-t border-slate-200 p-3">
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type as the lead…" aria-label="Message" />
          <button className="btn" disabled={busy || !text.trim()}>Send</button>
        </form>
      </section>
      <aside className="card space-y-3 text-sm">
        <h2 className="font-semibold">What the AI has captured</h2>
        <p>Status: <b>{status}</b></p>
        <dl className="space-y-2">
          {(["name", "phone", "email", "address"] as const).map((k) => (
            <div key={k}>
              <dt className="text-xs text-slate-500 capitalize">{k}</dt>
              <dd>{collected[k] ?? "—"}</dd>
            </div>
          ))}
          {Object.entries(collected.answers ?? {}).map(([qid, a]) => (
            <div key={qid}>
              <dt className="text-xs text-slate-500">{questionLabels[qid] ?? "Question"}</dt>
              <dd>{a}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-slate-500">
          {calendarConnected
            ? "Times offered come from the connected calendar. Test bookings are not written to it."
            : "No calendar connected: times offered are sample weekday slots."}
        </p>
      </aside>
    </div>
  );
}
