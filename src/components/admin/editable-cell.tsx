"use client";

import { useState, useTransition } from "react";
import { updateField } from "@/app/admin/actions";

type Props = {
  table: string;
  id: string;
  column: string;
  value: string | number | null;
  kind?: "text" | "number";
  options?: { value: string; label: string }[];
  width?: string;
};

// One editable value: input or select, saved on blur or Enter.
export function EditableCell({ table, id, column, value, kind = "text", options, width }: Props) {
  const [current, setCurrent] = useState(value === null ? "" : String(value));
  const [saved, setSaved] = useState(value === null ? "" : String(value));
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const save = (next: string) => {
    if (next === saved) return;
    startTransition(async () => {
      const parsed = kind === "number" ? (next === "" ? null : Number(next)) : next;
      if (kind === "number" && parsed !== null && !Number.isFinite(parsed)) {
        setError("Not a number");
        return;
      }
      const result = await updateField(table, id, column, parsed);
      if (result.error) {
        setError(result.error);
      } else {
        setError(null);
        setSaved(next);
      }
    });
  };

  if (options) {
    return (
      <select
        className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-neutral-300 focus:border-neutral-400 focus:outline-none"
        value={current}
        onChange={(e) => {
          setCurrent(e.target.value);
          save(e.target.value);
        }}
      >
        <option value="">.</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <span className="inline-flex flex-col">
      <input
        className={`rounded border border-transparent bg-transparent px-1 py-0.5 text-sm tabular-nums hover:border-neutral-300 focus:border-neutral-400 focus:bg-white focus:outline-none ${
          kind === "number" ? "text-right" : ""
        } ${width ?? "w-24"}`}
        value={current}
        inputMode={kind === "number" ? "decimal" : undefined}
        onChange={(e) => setCurrent(e.target.value)}
        onBlur={(e) => save(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setCurrent(saved);
        }}
      />
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </span>
  );
}
