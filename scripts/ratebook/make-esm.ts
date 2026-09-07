// ESM entry for the rate book, bundled by esbuild (npm run ratebook) so the
// renderer loads once, as its ESM build, which is the path that works.
import { renderToFile } from "@react-pdf/renderer";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { collectRateBook } from "../../src/lib/ratebook/data";
import { RateBookPdf } from "../../src/lib/ratebook/template";

config({ path: ".env.local" });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const data = await collectRateBook(supabase);
  await renderToFile(RateBookPdf({ data }), "docs/RateBook.pdf");
  const withHistory = data.rows.filter((r) => r.historyPoints > 0).length;
  const byConf: Record<string, number> = {};
  for (const r of data.rows) byConf[r.confidence || "none"] = (byConf[r.confidence || "none"] ?? 0) + 1;
  console.log("docs/RateBook.pdf written");
  console.log("rows:", data.rows.length, "| history-backed:", withHistory, "| engine-only:", data.rows.length - withHistory);
  console.log("by confidence:", JSON.stringify(byConf));
  console.log("review-shaded rows:", data.rows.filter((r) => r.review).length);
}
main();
