"use client";

import { useState, useTransition } from "react";
import { createQuote } from "@/app/quotes/actions";

export function NewQuoteForm({
  profiles,
  clientNames,
}: {
  profiles: { id: string; name: string }[];
  clientNames: string[];
}) {
  const [clientName, setClientName] = useState("");
  const [siteName, setSiteName] = useState("");
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [terms, setTerms] = useState("50% advance, 40% at half completion, 10% on completion");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await createQuote({
        clientName,
        siteName,
        siteProfileId: profileId,
        paymentTerms: terms,
      });
      if (result?.error) setError(result.error);
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-[#5B636E]">Client</label>
        <input
          list="sn-clients"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          required
          placeholder="Existing or new client name"
          className="rounded-lg border border-[#CFD4DA] px-3 py-2 text-sm focus:border-[#B8953F] focus:outline-none"
        />
        <datalist id="sn-clients">
          {clientNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-[#5B636E]">Site</label>
        <input
          value={siteName}
          onChange={(e) => setSiteName(e.target.value)}
          required
          placeholder="Site or project name"
          className="rounded-lg border border-[#CFD4DA] px-3 py-2 text-sm focus:border-[#B8953F] focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-[#5B636E]">Site profile</label>
        <select
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
          className="rounded-lg border border-[#CFD4DA] bg-white px-3 py-2 text-sm focus:border-[#B8953F] focus:outline-none"
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm text-[#5B636E]">Payment terms</label>
        <input
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          className="rounded-lg border border-[#CFD4DA] px-3 py-2 text-sm focus:border-[#B8953F] focus:outline-none"
        />
      </div>
      {error ? <p className="text-sm text-[#A83232]">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[#1F2328] px-3 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
      >
        {pending ? "Creating" : "Create draft quote"}
      </button>
      <p className="text-xs text-[#8A929C]">
        The quote starts as an empty R1 draft. Add stages from the catalogue in the workbench.
      </p>
    </form>
  );
}
