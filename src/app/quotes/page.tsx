import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function QuotesIndex() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("quotes")
    .select("id")
    .order("quote_date", { ascending: false })
    .order("revision", { ascending: false })
    .limit(1);
  if (data?.[0]) redirect(`/quotes/${data[0].id}`);
  redirect("/admin/products");
}
