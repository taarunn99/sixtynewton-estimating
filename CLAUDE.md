# Sixty Newton estimating workbench

Private quoting app for Sixty Newton Technical Services (UAE specialist applicator, part of the Lapiz Blue Group). Owner: Tarun. Users: Tarun (admin), Ashrat (estimator).

## Read first, in this order
1. docs/SixtyNewton_Cost_Calculator_Spec.md  (data model, engine, nudges, assistant, sync, UI)
2. docs/SixtyNewton_Workbench_Mockup.html    (the target layout, open it in a browser)
3. docs/SixtyNewton_Stage_Catalogue_and_Coverage_Capture.xlsx  (seed data: 92 stages, 219 product families with TDS coverage, 50 observed rates)

## Stack
Next.js 15 App Router, TypeScript strict, Tailwind, shadcn/ui, Supabase (Postgres + Auth + RLS), Vercel, @anthropic-ai/sdk, @react-pdf/renderer, vitest.

## Rules that do not bend
- The engine in lib/engine is pure TypeScript with no I/O. The language model never does arithmetic and never writes a price. It proposes; the engine applies through tool calls the user accepts.
- Every rate carries source (books | tds | quote | manual) and confidence (H | M | L).
- Issued quotes are immutable. Changes create a new revision (R2, R3). Never overwrite.
- Tax is always exclusive. Refuse tax-inclusive input.
- No em dashes or en dashes in any UI string, generated description, note, PDF or commit message. Use commas, colons or full stops.
- Sentence case everywhere. No all-caps labels.
- Cost data stays server side. Service role key only in server actions and route handlers.
- Numbers: tabular figures, AED with thousands separators, unit rates rounded per spec 4.6.
- Colour carries meaning only: slate = cost floor, ink = calculated, gold = quoted, amber = warn, red = block, green = won.

## Environment (in .env.local, never committed)
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
ANTHROPIC_API_KEY, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID=719219457,
CRON_SECRET

## Working style
- Flag problems before building. If the spec is ambiguous or wrong, say so and propose a fix, then proceed.
- Small commits, one concern each. Run `npm run typecheck && npm run test` before each commit.
- Do not add features that are not in the spec without asking.
- When touching the engine, add or update a test first.
