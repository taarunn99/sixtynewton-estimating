# Project status

Updated 1 Sep 2026, evening. App: Sixty Newton estimating workbench, live at https://sixtynewton-estimating.vercel.app (Vercel functions in sin1, next to the ap-southeast-1 database). Repo: https://github.com/taarunn99/sixtynewton-estimating

ATTENTION: the GitHub repo is public and contains client quotes and pricing. Make it private in GitHub settings (Settings, General, Danger zone, Change visibility), or run gh auth login and ask Claude Code to do it.

Verified live 1 Sep 2026: login protection on every route, cron 401 without secret, three-price ledger with crew cost reference, instant include ticks, PDF preview, issue guard blocking below-floor issue with admin reason field, new quote form, admin settings with labour reference and logistics fields, assistant answering the 15-day what-if from engine output.

## Phase 1: foundation (done)

- Next.js 15 scaffold, TypeScript strict, Tailwind 4, shadcn/ui, vitest, ESLint. A prebuild test fails the build if any em or en dash appears in src, scripts or supabase.
- Supabase schema live on project okfemqdtvpuzngwscpvt (ap-southeast-1): all spec section 3 tables, RLS (authenticated read, admin write on reference data, estimators write their own quotes), products_with_sn_cost view, quote_line_history materialised view. Migrations in supabase/migrations, applied with `npm run db:push`.
- Auth: email and password, profiles with admin and estimator roles, middleware blocks everything except /login. Users: Tarun (admin), Ashrat (estimator).
- Seed (`npm run seed`, idempotent): 93 stages, 217 product families, 50 observed rates, 7 labour tiers, 5 site profiles, 9 lump items from the workbook.
- Zoho Books sync: nightly cron route (02:00 Dubai) plus `npm run sync` for manual runs. First sync done: 6,515 items, pack parsing, zero-cost and duplicate flags (caught the Purtop 500 N 525 vs 5,670 pair), family linking, review queue.
- Admin screens: products, review queue, families with inline coverage editing, stages, labour tiers, site profiles, settings.

## Phase 2: engine and ledger (done, pending visual review)

- Pure engine in src/lib/engine: material by all 8 drivers, Mapei grout formula, back-butter rule, sealant joint geometry, labour with site multiplier and noise uplift, programme compression per spec 4.4, overhead, margin, cost floor, rounding per 4.6, VAT exclusive, rate-only lines, nudge rules.
- 105 tests pass, including reproduction of the analysed quotes (docs/quotes, 25 PDFs) within the spec section 8 tier bands, and floor blocks on the four known below-cost lines.
- Review queue cleanup: 238 auto-linked (Kerakoll, Weber, Fosroc, Laticrete, Awazel), 1,126 tools-brand items resolved not applicable, 4,500 remain.
- NOT IN BOOKS families folded to manual cost; four Kerakoll decorative lines priced from the Bugatti quote; 13 families await manual purchase prices (marked in admin).
- QT-000299 imported: R1 matches the issued PDF (286,125), R2 is the working draft.
- Workbench at /quotes/[id]: three-price ledger (floor, calculated, quoted), include and exclude ticks, expandable breakdowns, discipline-filtered stage picker and product swap, variables panel, programme row with crew arithmetic, before and after table, pocket calculator with x1.09 and use-as-quoted.

Pending in phase 2:

- Visual review of the ledger on QT-000299 (blocked only by the local machine hanging Node processes; a restart should clear it).
- New quote creation flow and the issue and revision flow.
- Equipment costs (table exists, no data yet).
- Manual purchase prices for the 13 unstocked families.

## Phase 3: assistant (built 1 Sep 2026, pending live test on the deployed URL)

- Context packet (src/lib/assistant/context.ts): quote header, compact lines with breakdowns and nudges, history matches per stage, stage catalogue, relevant settings. Assembled server side each turn.
- Streaming route at /api/assistant (SSE), one conversation per quote, persisted in assistant_messages with per-message token counts. Model and budget from settings (assistant_model, assistant_token_budget); warn at 80%, refuse at 100%.
- All nine spec tools (src/lib/assistant/tools.ts): recalc, add_line, update_line, remove_line, set_programme, set_site_profile, lookup_history, lookup_family, draft_note. Executors enforce draft-only mutations; the ledger refreshes after any mutating tool.
- Thread UI in the workbench right column: opening nudge summary by severity (composed from the engine, no tokens spent), streaming replies, tool chips, drafted notes as copyable cards, compose box with model name and budget percentage.
- Not yet done: per-nudge action buttons (Set to calculated, Keep and add reason), history comparison tables inside nudges, proactive what-if phrasing checks. Live round-trip untested locally because Node servers hang on this machine; test on the deployed URL.

## Phase 4: output (built 1 Sep 2026)

- Branded PDF at /quotes/[id]/pdf via @react-pdf/renderer: TRN, address, spec 9 columns, quoted rates (calculated fills gaps), rate-only lines as TBC, notes and fixed terms. Preview PDF button opens it.
- Issue flow: drafts become issued and immutable, totals snapshotted. Lines below the cost floor block the issue; an admin can issue with a written reason (stored in the snapshot).
- Revisions: New revision R+1 copies the quote and lines to a fresh draft; issued sources become revised. Never overwritten.
- New quote flow at /quotes/new: client (existing or new), site, site profile, payment terms; takes the next QT number; starts as an empty R1 draft.
- Not done: Zoho Estimates push (spec marks it optional), import of the remaining 24 past quote PDFs (tooling pattern exists in scripts/import-qt299.ts).

## Rate book and follow-up automation (7 Sep 2026, docs/UPDATE_FINAL_RATEBOOK_MAIL.md)

- The Sixty Newton Rate Book: npm run ratebook writes docs/RateBook.pdf (21 pages, A4 landscape, INTERNAL on every page); admins also get Download rate book in the admin nav. 93 rows by discipline, stage, family: product and pack with Sixty Newton cost, coverage and defaults with source and confidence, material derivation, labour both ways (history median with citations vs engine, leader stated, no past quotes printed where none), supply-and-apply and application-only rates, tiling ladder at six sizes floor and wall, SL and screed at three thicknesses, up to three evidence quotes per row, review shading where history and engine differ over 25% (26 rows), a blank contractor correction column, cover with sources and reviewer instructions, variables page, coverage table (engine-only stages first), confidential piece rates on the marked final page. Counts: 21 rows history-backed, 72 engine-only; confidence H 21, M 6, none 66.
- Follow-up automation: quote lifecycle Issued, Followed up (repeatable, logged with notes), Won, Lost, Expired; status control and log on the quote page at #follow-up (email links land there; no unauthenticated state changes). Daily cron 08:00 Dubai: reminders at 3, 6, 9, 12 days since issue or last follow-up, validity warning at day 14, auto-expiry after day 15, stop on won or lost, one digest email per day at most, oldest first, every send logged (quote, day mark, anchor date, resend id), a failed send retries next day. Recipients in settings (reminder_recipients, seeded ashrat@60newton.com). Emails show the quote total, never internal build-up figures (test-asserted). Test digest sent 7 Sep to the seeded recipient. MAIL_REPLY_TO tarun.s@lapizblue.com.

## Mail automation (7 Sep 2026)

Weekly digest mail via Resend from quotes@60newton.com (domain verified), Mondays 08:00 Dubai through /api/cron/weekly-digest behind CRON_SECRET, to every app user. Content, internal only: quotes issued in the window with your-price totals, drafts in motion with below-our-cost line counts, drafts older than 14 days, Zoho sync additions and review queue size, suggestion coverage. No our-cost build-ups, nothing from the labour reference, no em or en dashes. Manual send: npx tsx scripts/send-digest.ts [email ...]. Test digest sent 7 Sep to both users. RESEND_API_KEY is set locally and in Vercel; MAIL_FROM defaults to quotes@60newton.com in code.

## Variables, quotability, cash, history (2 Sep 2026, docs/UPDATE_VARIABLES_CASH.md)

- Variables panel v2: every variable shows its live AED effect and lands as a named adjustment row in totals with an (i). Built in: programme compression (site hours, deadline, days per week, crew-days), occupied building (productivity 0.85, suggestions +18%, typed labour untouched), night work (+10% on labour subtotal, editable), custom variables (percent on labour, percent on quote, fixed, per calendar day). No nudges from variables; nothing reaches the PDF as a row.
- Quotability: stage picker searches name, discipline, default family and trade aliases (micro, loft, ultratop all hit microtopping). Free-entry thickness (decimals), coats, waste, tile size, microtopping build-up (base mm x coats, finish mm, sealer coats). Default families linked for microtopping, SL, screed, repair and design concrete stages that had none. Cross-discipline, vinyl and polishing stages are labour-only by data.
- Internal cash strip under totals, never on the PDF: payment split editor (50/40/10 default, 60/30/10 preset), milestone amounts on your price total including VAT, material cost and the advance-covers-material line, collection factor from settings.
- References corrected: visa 700 per person per month (flag resolved), salaried all-in about 2,500 per month or 96 per day, crew 480 to 530 per day (19 to 21 per sqm), tile band 60x120 resolved at 50 to 75 midpoint 65, consumables noted at about 25 per crew-day and covered inside the application rate (out of the floor and the price build-up), equipment owned and ignored, pickup cost removed from settings.
- History and engine both stand behind every suggestion: suggested price is the median of matching past quotes when at least 2 matches exist (stage and family, widening to stage then discipline, approximations noted), engine build-up otherwise, both always in the (i) with quote numbers. The original 50 imported rates are now stage-mapped (54 of 67 points mapped; the rest are lumps and bundles). Live tests pin QT-000261 behind tiling, QT-000293 behind bitumen, QT-000298/300 behind SL.
- Assistant: search_history answers what we charged anyone from structured history (Azizi bitumen returns the two QT-000293 rates); propose_labour returns the suggestion with cited quotes and writes the line only after the user accepts. Admin, Suggestion coverage shows history points per stage: 21 of 93 stages covered, 72 at zero.

## Labour model redesign (2 Sep 2026, docs/UPDATE_LABOUR_MODEL.md)

- Labour is a per-line editable input prefilled with a suggestion (greyed until edited, source named in the (i)): past quote-line labour medians first, then the tile ladder or application-only rate table, then the labour tier. No nudges ever fire on labour.
- Our cost = material + consumables + overhead only. Labour left the floor. New R1 floors: screed 36, waterproofing 39.5, tile 19.5, grout 18 per sqm (floor subtotal 39,550 before VAT); zero lines below floor, calculated total 272,528 including VAT, within 4.8% of the issued 286,125.
- Absorb labour in margin toggle per line, default on for prep stages (grinding, priming, surface prep; demolition excluded) when a main application stage of the same discipline is included.
- Total labour for this job box in the variables panel: head contractor figure distributes pro rata to suggestions, lines mark "from job total", later per-line edits override their share.
- Labour cost reference (admin, Labour reference): salaries, accommodation, visa (flag: monthly or per contract), daily wages, overtime rule, crew reference, and the confidential Al Wathba piece rates (admin only; a test asserts the table is referenced nowhere client-facing).
- Tile labour ladder (admin editable, confidence M): 60x60 at 40, 60x120 at 65 (flag: two orientation bands given, midpoint used), 120x120 at 90, 240x240 at 115, linear on tile area, wall +10 (settings). Drives the tiling labour suggestion; adhesive and grout still come from tile dimensions.
- Thickness (mm) input on thickness-driver lines; tile size and wall toggle on tiling lines.
- 11 new quotes imported to history (67 observed rates now): 168, 184, 191, 237, 250, 256, 263, 291, 293, 295, 304, all rate points verified against the PDFs. Saveto Vetotop CS536 family added, Books linking via review queue.

## Calibration (1 Sep 2026, evening)

Factors that stack on a line: material (waste, intercompany 1.09), labour tier rate x site labour multiplier (x noise 1.08 only when a profile sets it, off by default; upper floor factor off by default), consumables, overhead 12% to our cost, margin 25% to the suggested price, rounding per 4.6. Fixes: island multiplier 1.55 (was 2.0, single-comparison evidence), island profile noise off, demolition tier 75 (the 85.7 island observation was double counting with the multiplier), manual lumps pass through as suggested price. Live test in tests/calibration-live.test.ts: R1 all ticked prices to +12.8% of issued 286,125 with one line below our cost (the grout throw-in); R2 all ticked sums to 248,005.

## Phase 6: language, clarity, application-only (1 Sep 2026)

- Columns renamed everywhere: our cost, suggested price, your price, with (i) tooltips on headers and per-line derivation sentences on the numbers.
- Typography: larger and heavier tabular figures, more row spacing, lighter labels. Rail header Clients and quotes, revisions nested with a caption.
- Application-only mode: per-line Material by client toggle zeroes material, our cost becomes the crew cost reference, suggested price comes from the application-only rate table (admin screen, source Tarun Sep 2026, confidence H) times the site labour multiplier, description reads Application of, T&C gains the client-material clause. Tiling interpolates on tile area between 60x60 at 55 and large slabs at 120; other stages fall back to the tier rate. History for application-only pricing already seeded (Bugatti QT-000288, Foyer QT-000303).
- Tile size (cm) is a line input on tiling stages, driving adhesive, grout and the application-only rate.
- Assistant on claude-fable-5, consequence-first prompt, no asterisk emphasis, thread renders markdown.

## Phase 5: aesthetic design (first pass 1 Sep 2026)

Brand palette from sixtynewton.com applied: dark warm rail (#1C1713) with gold accents (#C2A05C), cream page ground, gold Issue button, dark totals band with light figures, tinted three-price column headers, row hover, readable darker gold for quoted text. Colour meaning rules unchanged. Further polish welcome after Tarun reviews.

## Labour model (corrected 1 Sep 2026)

Pricing never switches to crew-day mode. The calculated price is always material plus the tier application rate, plus site factors and margin. Rates back-solved from the 19 quotes at confidence M: thin coating 37.5, heavy application 75, surface preparation 15, demolition 80, roll membranes 27.

Crew-day maths is reference only: line breakdowns show "crew cost reference: X per sqm" and it feeds programme crew-day estimates, never a price. All the following are suggestions, source Tarun 1 Sep 2026, confidence L, editable in admin:

- Crew reference: crew of 5, 12,200 AED per month all in (wages 8,200 plus 800 per head for visa, insurance, accommodation), 26 working days, 470 per crew-day. Baseline productivity 25 sqm per crew-day, about 19 AED per sqm at weight 1.0.
- Per-stage speed weights (programme estimates only): waterproofing 0.8, self-levelling 0.9, tiling 1.0, grinding 1.1, epoxy 1.2 per coat. Subsequent coats take 0.4 of first-coat time for epoxy, 1.0 for waterproofing.
- Site factor upper floor or roof: calculated price of affected lines x1.15, editable up to 1.20 (settings).
- Logistics suggestion from tonnage: under 1 ton a pickup (cost in settings, currently 0, set it); otherwise ceil(tonnage / 4) trucks at 2,000. Island profiles add a barge at 200 per ton (Al Maya Island 2026, 16,000 for 80 t); mainland trucks only.

Raise confidences once timesheets confirm. Tests in tests/labour-reference.test.ts.

## Deploy to Vercel (manual, Tarun)

The repo is deploy-ready: vercel.json schedules the nightly sync at 22:00 UTC (02:00 Dubai), the cron route checks CRON_SECRET, and middleware protects every route except static assets and the secret-guarded cron path.

1. vercel.com, Add new project, import taarunn99/sixtynewton-estimating from GitHub. Framework preset Next.js, project name sixtynewton-estimating, defaults otherwise.
2. Before the first deploy (or in Settings, Environment variables, then redeploy), add every variable from .env.local for Production: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, ZOHO_ORG_ID, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, CRON_SECRET. SUPABASE_DB_PASSWORD is only for local migrations, skip it.
3. Deploy. Vercel reads the cron from vercel.json and, because CRON_SECRET is set, calls the route with it as a bearer token automatically.
4. Verify on the deployed URL: the root and /quotes redirect to /login when signed out; /api/cron/books-sync without the bearer token returns 401; sign in works and /account/password changes a password.
5. In Settings, Deployment protection: leave Vercel authentication off, the app has its own login. Or keep it on for extra cover, both users would then also need Vercel access.

## Bring the dev server up

```
cd ~/Desktop/sixtynewton-estimating
npm install          # only after a fresh clone
npm run dev          # starts on port 3000; use PORT=3001 npm run dev if Lapiz Blue is on 3000
```

Then open http://localhost:3001 (or 3000), sign in, and the latest quote loads. Useful scripts: `npm run test`, `npm run typecheck`, `npm run db:push`, `npm run seed`, `npm run sync` (Zoho, needs .env.local), `npm run fixtures` (refresh engine test fixtures after price changes).

.env.local holds all keys and is not committed. The Supabase database connects via the ap-southeast-1 pooler (scripts/db-push.ts handles this automatically).
