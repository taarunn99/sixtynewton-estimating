"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const KEYS: { label: string; k?: string; cls?: string; id?: string }[] = [
  { label: "7", k: "7" }, { label: "8", k: "8" }, { label: "9", k: "9" },
  { label: "÷", k: "/", cls: "op" }, { label: "(", k: "(", cls: "op" }, { label: ")", k: ")", cls: "op" },
  { label: "4", k: "4" }, { label: "5", k: "5" }, { label: "6", k: "6" },
  { label: "×", k: "*", cls: "op" }, { label: "%", k: "%", cls: "op" }, { label: "C", id: "clr", cls: "op" },
  { label: "1", k: "1" }, { label: "2", k: "2" }, { label: "3", k: "3" },
  { label: "−", k: "-", cls: "op" }, { label: "⌫", id: "back", cls: "op" }, { label: "=", id: "eq", cls: "eq" },
  { label: "0", k: "0" }, { label: ".", k: "." }, { label: "×1.09", k: "*1.09", cls: "op" },
  { label: "+", k: "+", cls: "op" },
];

function evaluate(expr: string): number | null {
  const safe = expr.replace(/%/g, "/100");
  if (!/^[\d+\-*/().\s]+$/.test(safe)) return null;
  try {
    const value = new Function(`"use strict"; return (${safe});`)() as number;
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

type ThreadMessage = {
  id: string;
  role: "user" | "assistant" | "note";
  content: string;
  purpose?: string;
  tools?: string[];
  streaming?: boolean;
};

const TOOL_LABELS: Record<string, string> = {
  recalc: "Recalculated",
  add_line: "Added a line",
  update_line: "Updated a line",
  remove_line: "Removed a line",
  set_programme: "Set the programme",
  set_site_profile: "Changed the site profile",
  lookup_history: "Looked up history",
  lookup_family: "Searched products",
};

function AssistantThread({
  quoteId,
  openingNudges,
}: {
  quoteId: string;
  openingNudges: { severity: string; message: string }[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<{ model: string; used: number; budget: number }>({
    model: "",
    used: 0,
    budget: 200000,
  });
  const [warn, setWarn] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/assistant?quoteId=${quoteId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setMessages(
          (data.messages as { id: string; role: string; content: string; tool_calls: { name: string }[] | null }[])
            .filter((m) => m.content || m.tool_calls?.length)
            .map((m) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              tools: m.tool_calls?.map((t) => t.name),
            }))
        );
        setMeta({ model: data.model, used: data.tokensUsed, budget: data.tokenBudget });
      })
      .catch(() => {});
  }, [quoteId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || busy) return;
      setBusy(true);
      setWarn(null);
      const localId = `local-${Date.now()}`;
      setMessages((m) => [
        ...m,
        { id: `${localId}-u`, role: "user", content: text },
        { id: localId, role: "assistant", content: "", streaming: true },
      ]);
      setInput("");
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ quoteId, message: text }),
        });
        if (!res.ok || !res.body) {
          const detail = res.status === 402 ? (await res.json()).error : "The assistant did not respond.";
          setMessages((m) =>
            m.map((x) => (x.id === localId ? { ...x, content: detail, streaming: false } : x))
          );
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let mutated = false;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const raw of events) {
            if (!raw.startsWith("data: ")) continue;
            const ev = JSON.parse(raw.slice(6));
            if (ev.type === "text") {
              setMessages((m) =>
                m.map((x) => (x.id === localId ? { ...x, content: x.content + ev.delta } : x))
              );
            } else if (ev.type === "tool") {
              setMessages((m) =>
                m.map((x) =>
                  x.id === localId ? { ...x, tools: [...(x.tools ?? []), ev.name] } : x
                )
              );
            } else if (ev.type === "note") {
              setMessages((m) => [
                ...m.filter((x) => x.id !== localId),
                { id: `note-${Date.now()}-${Math.random()}`, role: "note", purpose: ev.purpose, content: ev.text },
                m.find((x) => x.id === localId)!,
              ]);
            } else if (ev.type === "warn") {
              setWarn(ev.message);
            } else if (ev.type === "error") {
              setMessages((m) =>
                m.map((x) =>
                  x.id === localId
                    ? { ...x, content: x.content || ev.message, streaming: false }
                    : x
                )
              );
            } else if (ev.type === "done") {
              mutated = ev.mutated;
              setMeta((prev) => ({ ...prev, used: ev.tokensUsed, budget: ev.tokenBudget }));
            }
          }
        }
        setMessages((m) => m.map((x) => (x.id === localId ? { ...x, streaming: false } : x)));
        if (mutated) router.refresh();
      } catch {
        setMessages((m) =>
          m.map((x) =>
            x.id === localId
              ? { ...x, content: x.content || "The connection dropped. Try again.", streaming: false }
              : x
          )
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, quoteId, router]
  );

  const bySeverity = { block: [] as string[], warn: [] as string[], info: [] as string[] };
  for (const n of openingNudges) {
    (bySeverity[n.severity as keyof typeof bySeverity] ?? bySeverity.info).push(n.message);
  }
  const pct = meta.budget ? Math.round((meta.used / meta.budget) * 100) : 0;

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-auto p-3.5 text-sm">
        <div className="mb-3 rounded-lg border border-[#E2E5E9] bg-[#FAFAFB] p-3 text-xs">
          <div className="mb-1.5 font-medium text-[#1F2328]">On open: nudges by severity</div>
          {openingNudges.length === 0 ? (
            <div className="text-[#5B636E]">No nudges. The quote is clean.</div>
          ) : (
            <div className="flex flex-col gap-1">
              {bySeverity.block.map((msg, i) => (
                <div key={`b${i}`} className="text-[#A83232]">{msg}</div>
              ))}
              {bySeverity.warn.map((msg, i) => (
                <div key={`w${i}`} className="text-[#B8741A]">{msg}</div>
              ))}
              {bySeverity.info.map((msg, i) => (
                <div key={`i${i}`} className="text-[#4A6B8A]">{msg}</div>
              ))}
            </div>
          )}
          {openingNudges.length > 0 ? (
            <button
              onClick={() => send("Explain the current nudges and what you propose for each.")}
              disabled={busy}
              className="mt-2 rounded border border-[#CFD4DA] bg-white px-2 py-1 text-[11px] hover:border-[#5B636E] disabled:opacity-50"
            >
              Explain and propose fixes
            </button>
          ) : null}
        </div>

        {messages.map((m) =>
          m.role === "note" ? (
            <div key={m.id} className="mb-2.5 rounded-lg border border-[#B8953F] bg-[#F6F0DF] p-2.5 text-xs">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium text-[#B8741A]">{m.purpose ?? "Drafted note"}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(m.content)}
                  className="rounded border border-[#B8953F] px-1.5 py-0.5 text-[10px] text-[#B8741A]"
                >
                  Copy
                </button>
              </div>
              <div className="whitespace-pre-wrap text-[#1F2328]">{m.content}</div>
            </div>
          ) : (
            <div key={m.id} className={`mb-2.5 ${m.role === "user" ? "text-right" : ""}`}>
              {m.tools?.length ? (
                <div className="mb-1 flex flex-wrap gap-1">
                  {m.tools.map((t, i) => (
                    <span key={i} className="rounded-full bg-[#E4E7EB] px-2 py-0.5 text-[10px] text-[#5B636E]">
                      {TOOL_LABELS[t] ?? t}
                    </span>
                  ))}
                </div>
              ) : null}
              {m.content ? (
                <div
                  className={`inline-block max-w-full whitespace-pre-wrap rounded-lg px-2.5 py-1.5 text-left text-xs ${
                    m.role === "user" ? "bg-[#1F2328] text-white" : "bg-[#F1F2F4] text-[#1F2328]"
                  }`}
                >
                  {m.content}
                  {m.streaming ? <span className="animate-pulse"> ...</span> : null}
                </div>
              ) : m.streaming ? (
                <div className="inline-block rounded-lg bg-[#F1F2F4] px-2.5 py-1.5 text-xs text-[#8A929C]">
                  Thinking
                  <span className="animate-pulse"> ...</span>
                </div>
              ) : null}
            </div>
          )
        )}
        {warn ? <div className="mb-2 text-[11px] text-[#B8741A]">{warn}</div> : null}
      </div>

      <div className="border-t border-[#E2E5E9] px-3.5 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex flex-col gap-1.5 rounded-xl border border-[#CFD4DA] px-2.5 py-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder="Ask about this quote"
            className="w-full bg-transparent text-sm outline-none disabled:opacity-50"
          />
          <div className="flex items-center justify-between text-xs text-[#8A929C]">
            <span>
              {meta.model || "Assistant"}, {pct}% of token budget
            </span>
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="grid h-6 w-6 place-items-center rounded-full bg-[#1F2328] text-white disabled:bg-[#E4E7EB] disabled:text-[#8A929C]"
            >
              ↑
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

export function SidePanel({
  quoteId,
  openingNudges,
}: {
  quoteId: string;
  openingNudges: { severity: string; message: string }[];
}) {
  const [expr, setExpr] = useState("");
  const [display, setDisplay] = useState("0");

  const press = useCallback(
    (key: { k?: string; id?: string }) => {
      if (key.id === "clr") {
        setExpr("");
        setDisplay("0");
      } else if (key.id === "back") {
        setExpr((e) => e.slice(0, -1));
      } else if (key.id === "eq") {
        const v = evaluate(expr);
        if (v !== null) {
          setDisplay(v.toLocaleString("en-US", { maximumFractionDigits: 2 }));
          setExpr(String(Math.round(v * 100) / 100));
        }
      } else if (key.k) {
        setExpr((e) => e + key.k);
      }
    },
    [expr]
  );

  useEffect(() => {
    const v = evaluate(expr);
    if (expr && v !== null) setDisplay(v.toLocaleString("en-US", { maximumFractionDigits: 2 }));
    else if (!expr) setDisplay("0");
  }, [expr]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (/^[\d+\-*/().%]$/.test(e.key)) {
        setExpr((x) => x + e.key);
      } else if (e.key === "Enter") {
        press({ id: "eq" });
      } else if (e.key === "Backspace") {
        setExpr((x) => x.slice(0, -1));
      } else if (e.key === "Escape") {
        setExpr("");
        setDisplay("0");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  const useAsQuoted = () => {
    const v = evaluate(expr || display.replace(/,/g, ""));
    if (v !== null) {
      window.dispatchEvent(new CustomEvent("sn-use-quoted", { detail: Math.round(v * 100) / 100 }));
    }
  };

  return (
    <aside className="flex flex-col overflow-hidden border-l border-[#CFD4DA] bg-white">
      <div className="border-b border-[#E2E5E9] px-3.5 pb-2.5 pt-3">
        <div className="mb-1.5 flex justify-between text-[11px] text-[#8A929C]">
          <span>Pocket calculator</span>
          <span>Enter to equals</span>
        </div>
        <div className="rounded-lg border border-[#CFD4DA] bg-[#F1F2F4] px-2.5 py-2 text-right">
          <div className="min-h-[14px] text-[11px] text-[#8A929C]">{expr || " "}</div>
          <div className="text-xl font-medium tabular-nums">{display}</div>
        </div>
        <div className="mt-1.5 grid grid-cols-6 gap-1">
          {KEYS.map((key) => (
            <button
              key={key.label}
              onClick={() => press(key)}
              className={`rounded-md border py-1.5 text-[13px] ${
                key.cls === "eq"
                  ? "border-[#1F2328] bg-[#1F2328] text-white"
                  : key.cls === "op"
                    ? "border-[#E2E5E9] bg-[#F1F2F4] hover:border-[#5B636E]"
                    : "border-[#E2E5E9] bg-white hover:border-[#5B636E]"
              }`}
            >
              {key.label}
            </button>
          ))}
          <button
            onClick={useAsQuoted}
            className="col-span-2 rounded-md border border-[#B8953F] bg-[#F6F0DF] py-1.5 text-[13px] text-[#B8953F]"
          >
            Use as quoted rate
          </button>
        </div>
      </div>

      <AssistantThread quoteId={quoteId} openingNudges={openingNudges} />
    </aside>
  );
}
