// Branded quotation PDF, spec section 9. Columns #, Description, Qty, Unit,
// Rate, Amount; quoted rates (calculated fills in when nothing is quoted);
// rate-only lines show qty TBC and are excluded from totals; VAT once on the
// subtotal; fixed terms with Force Majeure and null and void wording.
import { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { computeLedger } from "@/lib/engine-server";
import { QuotePdf } from "./template";

export const maxDuration = 60;

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const ledger = await computeLedger(id);
  if (!ledger) return new Response("Not found", { status: 404 });

  const service = createServiceClient();
  const { data: settings } = await service.from("settings").select("company_address").single();

  const buffer = await renderToBuffer(
    QuotePdf({
      ledger,
      companyAddress: settings?.company_address ?? "Shop 12, 14 Street, Al Quoz Industrial Area 4, Dubai",
    })
  );

  const filename = `${ledger.quote.number}-R${ledger.quote.revision}.pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
