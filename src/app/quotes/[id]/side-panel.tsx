"use client";

import { useCallback, useEffect, useState } from "react";

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

export function SidePanel() {
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

      <div className="flex-1 overflow-auto p-3.5 text-sm text-[#5B636E]">
        <div className="rounded-lg border border-dashed border-[#CFD4DA] p-3 text-xs text-[#8A929C]">
          The assistant thread arrives in phase 3. It will open each quote with the nudges by
          severity and apply changes through engine tools only.
        </div>
      </div>

      <div className="border-t border-[#E2E5E9] px-3.5 py-3">
        <div className="flex flex-col gap-1.5 rounded-xl border border-[#CFD4DA] px-2.5 py-2">
          <input
            disabled
            placeholder="Ask about this quote (phase 3)"
            className="w-full bg-transparent text-sm outline-none"
          />
          <div className="flex items-center justify-between text-xs text-[#8A929C]">
            <span>Assistant offline</span>
            <span className="grid h-6 w-6 place-items-center rounded-full bg-[#E4E7EB]">↑</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
