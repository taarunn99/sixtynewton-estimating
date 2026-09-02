"use client";

import { useState, useTransition } from "react";
import { deleteClient, deleteQuote } from "@/app/quotes/actions";

// Two-step deletes, admin only: first click arms the confirm, second click
// deletes. Deleting a quote removes all its revisions; deleting a client
// removes the client with every site and quote under them.
export function DeleteControls({
  quoteId,
  quoteNumber,
  clientId,
  clientName,
}: {
  quoteId: string;
  quoteNumber: string;
  clientId: string | null;
  clientName: string;
}) {
  const [arm, setArm] = useState<"quote" | "client" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (kind: "quote" | "client") =>
    startTransition(async () => {
      setMessage(null);
      const result =
        kind === "quote" ? await deleteQuote(quoteId) : await deleteClient(clientId!);
      if (result?.error) {
        setMessage(result.error);
        setArm(null);
      }
    });

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      {arm === null ? (
        <>
          <button onClick={() => setArm("quote")} className="text-[#A83232] hover:underline">
            Delete quote
          </button>
          {clientId ? (
            <button onClick={() => setArm("client")} className="text-[#A83232] hover:underline">
              Delete client
            </button>
          ) : null}
        </>
      ) : (
        <span className="flex items-center gap-2 rounded border border-[#A83232] bg-[#FDF3F3] px-2 py-1">
          <span className="text-[#A83232]">
            {arm === "quote"
              ? `Are you sure? This deletes ${quoteNumber} with all its revisions.`
              : `Are you sure? This deletes ${clientName} with every site and quote.`}
          </span>
          <button
            onClick={() => run(arm)}
            disabled={pending}
            className="rounded bg-[#A83232] px-2 py-0.5 font-medium text-white disabled:opacity-50"
          >
            {pending ? "Deleting" : "Yes, delete"}
          </button>
          <button onClick={() => setArm(null)} className="text-[#5B636E] hover:underline">
            Cancel
          </button>
        </span>
      )}
      {message ? <span className="text-[#A83232]">{message}</span> : null}
    </div>
  );
}
