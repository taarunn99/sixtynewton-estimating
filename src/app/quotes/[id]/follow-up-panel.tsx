"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markFollowedUp, setQuoteOutcome } from "@/app/quotes/actions";

// Status control and follow-up log for issued quotations. The email deep
// links land on #follow-up; state changes always happen here, logged in.
export function FollowUpPanel({
  quoteId,
  status,
  followUps,
}: {
  quoteId: string;
  status: string;
  followUps: { at: string; note: string | null; by: string | null }[];
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!["issued", "followed_up", "expired", "won", "lost"].includes(status)) return null;

  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      setMessage(null);
      const result = await fn();
      if (result.error) setMessage(result.error);
      else {
        setNote("");
        router.refresh();
      }
    });

  const closed = status === "won" || status === "lost";

  return (
    <div id="follow-up" className="mx-auto mt-4 max-w-[980px] rounded-lg border border-[#DDD6C7] bg-white px-5 py-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-serif text-[15px] font-semibold">Follow-up</h3>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs ${
            status === "won"
              ? "bg-[#E4F0E2] text-[#3E6B3A]"
              : status === "lost"
                ? "bg-[#F1F2F4] text-[#5B636E]"
                : status === "expired"
                  ? "bg-[#F9E7E7] text-[#A83232]"
                  : "bg-[#F6F0DF] text-[#96772B]"
          }`}
        >
          {status === "followed_up" ? "followed up" : status}
        </span>
      </div>

      {!closed ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional one-line note (who you spoke to, what they said)"
            className="w-80 rounded border border-[#CFD4DA] px-2.5 py-1.5 text-sm focus:border-[#C2A05C] focus:outline-none"
          />
          <button
            onClick={() => run(() => markFollowedUp(quoteId, note))}
            disabled={pending}
            className="rounded-lg bg-[#C2A05C] px-3 py-1.5 text-sm font-medium text-[#1C1713] hover:bg-[#D0B172] disabled:opacity-50"
          >
            Followed up today
          </button>
          <button
            onClick={() => run(() => setQuoteOutcome(quoteId, "won"))}
            disabled={pending}
            className="rounded-lg border border-[#3E6B3A] px-3 py-1.5 text-sm font-medium text-[#3E6B3A] hover:bg-[#E4F0E2] disabled:opacity-50"
          >
            Won
          </button>
          <button
            onClick={() => run(() => setQuoteOutcome(quoteId, "lost"))}
            disabled={pending}
            className="rounded-lg border border-[#8A929C] px-3 py-1.5 text-sm font-medium text-[#5B636E] hover:bg-[#F1F2F4] disabled:opacity-50"
          >
            Lost
          </button>
          <span className="text-xs text-[#8A929C]">
            Reminders run at 3, 6, 9 and 12 days and stop on won or lost. Following up resets the clock.
          </span>
        </div>
      ) : null}
      {message ? <p className="mb-2 text-xs text-[#A83232]">{message}</p> : null}

      {followUps.length ? (
        <div className="text-sm">
          <div className="mb-1 text-xs text-[#8A929C]">Log</div>
          {followUps.map((f, i) => (
            <div key={i} className="border-b border-[#EEEAE0] py-1 last:border-b-0">
              <span className="tabular-nums text-[#5B636E]">{f.at.slice(0, 10)}</span>
              {f.note ? <span className="ml-3">{f.note}</span> : <span className="ml-3 text-[#8A929C]">followed up</span>}
              {f.by ? <span className="ml-2 text-xs text-[#8A929C]">({f.by})</span> : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[#8A929C]">No follow-ups logged yet.</p>
      )}
    </div>
  );
}
