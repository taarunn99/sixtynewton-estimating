// Admin download of the rate book PDF, generated fresh from the database.
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { collectRateBook } from "@/lib/ratebook/data";
import { RateBookPdf } from "@/lib/ratebook/template";

export const maxDuration = 120;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return new Response("Admins only", { status: 403 });

  const data = await collectRateBook(createServiceClient());
  const buffer = await renderToBuffer(RateBookPdf({ data }));
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="SixtyNewton-RateBook-${data.generated}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
