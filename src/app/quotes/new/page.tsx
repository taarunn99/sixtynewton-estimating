import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewQuoteForm } from "./form";

export default async function NewQuotePage() {
  await getProfile();
  const supabase = await createClient();
  const [{ data: profiles }, { data: clients }] = await Promise.all([
    supabase.from("site_profiles").select("id, name").order("name"),
    supabase.from("clients").select("name").order("name"),
  ]);

  return (
    <main className="flex min-h-screen items-start justify-center bg-[#F1F2F4] p-8">
      <div className="w-full max-w-lg rounded-xl border border-[#CFD4DA] bg-white p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h1 className="font-serif text-xl font-semibold">New quote</h1>
          <Link href="/quotes" className="text-sm text-[#8A929C] hover:text-[#1F2328]">
            Back to quotes
          </Link>
        </div>
        <NewQuoteForm
          profiles={(profiles ?? []).map((p) => ({ id: p.id, name: p.name }))}
          clientNames={(clients ?? []).map((c) => c.name)}
        />
      </div>
    </main>
  );
}
