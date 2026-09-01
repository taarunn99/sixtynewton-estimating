# Project status

Updated 1 Sep 2026. App: Sixty Newton estimating workbench. Repo: https://github.com/taarunn99/sixtynewton-estimating

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

## Phase 4: output (not started)

Branded PDF via @react-pdf/renderer, issue flow with immutable revisions, optional Zoho Estimates push, import of remaining past quotes.

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
