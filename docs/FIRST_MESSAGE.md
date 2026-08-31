Read CLAUDE.md, then the three files in docs/ in the order listed. Open the mockup HTML in a browser and describe back to me, in ten lines or fewer, the layout and the three-price ledger so I know you have it.

Then build Phase 1 from spec section 10, in this order, committing after each step:

1. Scaffold: Next.js 15 App Router, TypeScript strict, Tailwind, shadcn/ui, vitest, ESLint. Add a lint rule or test that fails the build if any string in src/ or in generated output contains an em dash or en dash.

2. Supabase schema as SQL migrations under supabase/migrations, matching spec section 3 exactly: settings, products, product_families, stages, labour_tiers, equipment, site_profiles, lump_items, clients, sites, quotes, quote_lines, quote_line_history (materialised view), imported_quotes, assistant_messages. Add RLS: authenticated read on reference tables, admin-only write, users write their own quotes. Add the sn_cost view (books_cost * settings.intercompany_factor).

3. Auth: Supabase email and password, two roles via a profiles table, middleware that blocks every route except /login for unauthenticated users.

4. Seed script (scripts/seed.ts) that reads docs/SixtyNewton_Stage_Catalogue_and_Coverage_Capture.xlsx with SheetJS and loads: tab "Stage Catalogue" into stages, tab "Coverage (TDS defaults)" into product_families (with representative Books item name, pack qty and unit, coverage, multiplier, waste, source, confidence, note), tab "Observed Rates" into imported_quotes. Idempotent: re-running updates rather than duplicates.

5. Zoho Books sync (app/api/cron/books-sync/route.ts, protected by CRON_SECRET, plus vercel.json cron at 02:00 Asia/Dubai): pages through /books/v3/items for org 719219457 with filter_by=Status.Active and per_page=200 until has_more_page is false, upserts products, parses pack qty and unit from the item name with the regex set described in spec section 7, sets cost_flag zero_cost when purchase_rate <= 1 and duplicate_suspect when two active items share a normalised name and differ in cost by more than 5x. Links products to product_families by the representative item name from the seed, then by a curated regex table in lib/sync/families.ts. Unmatched items go to a review queue table.

6. Admin screens: products with the review queue, product families with inline editing of coverage fields, stages, labour tiers, site profiles, settings.

Stop after step 6 and give me a short status: what works, what you flagged, what you need from me. Do not start the engine or the UI ledger until I say go.

Two facts you will need and will not find in the docs: the company address on all documents is Shop 12, 14 Street, Al Quoz Industrial Area 4, Dubai (the old quotes say Warehouse 11, that is wrong). Sixty Newton is a labour company with no premises of its own, so overhead is supervision and vehicles, not rent.
