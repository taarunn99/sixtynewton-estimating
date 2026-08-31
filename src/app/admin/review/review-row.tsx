"use client";

import { useState, useTransition } from "react";
import { resolveReviewItem } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";

type Props = {
  item: { id: string; books_item_id: string; item_name: string; reason: string };
  familyOptions: { value: string; label: string }[];
};

export function ReviewRow({ item, familyOptions }: Props) {
  const [familyId, setFamilyId] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) return null;

  const resolve = (assign: boolean) => {
    startTransition(async () => {
      const result = await resolveReviewItem(item.id, item.books_item_id, assign ? familyId || null : null);
      if (result.error) setError(result.error);
      else setDone(true);
    });
  };

  return (
    <tr className="border-b border-neutral-100">
      <td className="px-3 py-1.5">{item.item_name}</td>
      <td className="px-3 py-1.5 text-neutral-500">{item.reason}</td>
      <td className="px-3 py-1.5">
        <select
          className="w-64 rounded border border-neutral-300 bg-white px-2 py-1 text-sm"
          value={familyId}
          onChange={(e) => setFamilyId(e.target.value)}
        >
          <option value="">Choose a family</option>
          {familyOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-1.5">
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!familyId || pending} onClick={() => resolve(true)}>
            Assign
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => resolve(false)}>
            Dismiss
          </Button>
        </div>
        {error ? <div className="text-xs text-red-700">{error}</div> : null}
      </td>
    </tr>
  );
}
