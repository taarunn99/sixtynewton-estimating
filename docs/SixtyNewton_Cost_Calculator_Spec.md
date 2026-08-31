# Sixty Newton Cost Calculator: Engine and App Specification

Version 0.1, 31 Aug 2026. Owner: Tarun. Build target: Claude Code.

## 1. Purpose and principles

A private web app that prices Sixty Newton applicator work from first principles (material at Sixty Newton cost, labour by tier, site factors, programme compression, lump sums, margin) and produces a branded quotation. A Claude-powered assistant sits beside the quote to explain, nudge, cross-check against history and answer what-ifs.

Non-negotiable rules:

1. The calculation engine is deterministic TypeScript. The language model never performs arithmetic and never writes a price into the quote. It reads engine output and history, then reasons, explains and proposes. Every proposal is applied by the engine after the user accepts it.
2. Every price has a visible breakdown: material, labour, consumables and equipment, site factor, programme uplift, lump sums, overhead, margin, VAT. No black-box rates.
3. Every stored rate carries a source and a confidence: `books` (Zoho Books cost), `tds` (manufacturer datasheet default), `quote` (derived from a past quotation), `manual` (entered by user), with confidence H / M / L. The UI shows low-confidence inputs in amber.
4. Confidential. Cost data never leaves the server. Auth required for every route.
5. Quotes are immutable once issued. Changes create a new revision with a suffix (QT-000288-R2). The current Zoho practice of overwriting the same number is not reproduced.

## 2. Stack

- Next.js 15, App Router, TypeScript, Tailwind, shadcn/ui. Deployed on Vercel under the Sixty Newton team, separate project from sixty-newton-website. Not linked from 60newton.com.
- Supabase: Postgres, Auth (email + password, magic link optional), Row Level Security. Two roles: `admin` (Tarun) and `estimator` (Ashrat). Service role key only in server actions and route handlers.
- Anthropic API via `@anthropic-ai/sdk`, server side only. Default model `claude-sonnet-4-6` for the assistant. `claude-haiku-4-5` for background nudges and history summarisation. Model is a settings value, not hardcoded.
- Zoho Books API (OAuth client credentials or refresh token stored in Supabase Vault) for nightly item sync from org `719219457` (Lapiz Blue General Trading LLC).
- PDF generation server side with `@react-pdf/renderer` (branded quotation). Optional push of the issued quote to Zoho Books via Estimates API in phase 3.

## 3. Data model

All tables have `id uuid`, `created_at`, `updated_at`, `created_by`. RLS: authenticated users read everything; only admin writes to settings, tiers, factors and products.

### 3.1 Reference data

**settings** (single row)
- `intercompany_factor` numeric default 1.09
- `vat_rate` numeric default 0.05
- `default_margin` numeric default 0.25
- `default_overhead` numeric default 0.12
- `default_waste` numeric default 0.05
- `working_hours_per_day` numeric default 8
- `working_days_per_week` int default 6
- `congestion_loss_per_extra_crew` numeric default 0.10
- `assistant_model`, `nudge_model` text
- `company_address` text (Shop 12, 14 Street, Al Quoz Industrial Area 4, Dubai)

**products** (synced from Books, one row per Books item)
- `books_item_id` text unique, `name`, `sku`, `brand`, `unit_raw`
- `pack_qty` numeric, `pack_unit` enum(kg, L, sqm, lm, pcs)
- `books_cost` numeric (purchase_rate), `books_sell` numeric (rate), `stock_on_hand` numeric
- `sn_cost` generated: `books_cost * settings.intercompany_factor` (computed in a view, not stored)
- `family_id` fk to product_families, nullable
- `is_colour_variant` bool, `active` bool, `last_synced_at`
- `cost_flag` enum(ok, zero_cost, duplicate_suspect) set by sync rules

**product_families** (curated, seeded from workbook tab "Coverage")
- `name` (e.g. "Mapei Keraflex Maxi S1 Zero Grey (25 kg)"), `brand`, `discipline`, `stage_group`
- `driver` enum(coverage, thickness, roll, board, linear, each, bought_in, labour_only)
- `representative_product_id` fk products
- `coverage_value` numeric, `coverage_unit` text, `default_multiplier` numeric (coats or mm or cm), `waste_pct` numeric
- `coverage_source` enum(tds, quote, manual), `coverage_confidence` enum(H, M, L), `coverage_note` text
- `manual_cost` numeric, `manual_pack_qty`, `manual_pack_unit` (for families not stocked in Books)

**stages** (seeded from workbook tab "Stage Catalogue", 92 rows)
- `discipline`, `name`, `driver`, `unit_of_sale` enum(sqm, lm, nos, lump)
- `default_family_id` fk product_families nullable
- `secondary_family_ids` uuid[] (e.g. mesh with membrane, primer with SL)
- `labour_tier_id` fk labour_tiers
- `default_productivity_sqm_per_crew_day` numeric, `productivity_confidence`
- `cure_days` numeric (calendar days, no labour, blocks the next stage)
- `equipment_ids` uuid[]
- `notes` text

**labour_tiers**
- `name` (e.g. "Thin coating", "Heavy application", "Demolition", "Skilled finishing", "Machine operator")
- `crew_size` int, `crew_day_cost` numeric (all-in daily cost of the crew: wages, transport, PPE, visa amortisation)
- `derived_application_rate_per_sqm` numeric (from quote back-solve, informational)

**equipment**
- `name`, `daily_hire_cost`, `mobilisation_cost`, `owned` bool, `consumable_per_sqm` numeric

**site_profiles**
- `name` (e.g. "Standard Dubai commercial", "Gated community villa", "Island / restricted", "Abu Dhabi", "Occupied hotel")
- `allowed_hours_per_day` numeric, `allowed_days_per_week` int, `noise_restricted` bool, `night_work_allowed` bool
- `mobilisation_multiplier` numeric, `transport_per_trip` numeric, `permit_lump` numeric, `parking_per_day` numeric
- `labour_multiplier` numeric (default 1.0; Jumeirah Bay evidence suggests up to 2.0 on tiling)
- `protection_required` bool, `garbage_disposal_included` bool

**lump_items**
- `name` (Site survey, NDT report, Method statement, Scaffolding provision, Garbage disposal and protection, Mobilisation, Permits and NOC, Flood test, Handover documentation)
- `default_amount`, `pricing_rule` enum(fixed, per_day, per_trip, per_sqm)

### 3.2 Transactional data

**clients** `name`, `trn`, `address`, `type` enum(main_contractor, developer, villa_owner, hotel, consultant)

**sites** `name`, `client_id`, `emirate`, `community`, `is_island`, `site_profile_id`, `bill_to_client_id` (allows Police HQ site billed to Arabian Furniture)

**quotes**
- `number` text (QT-000xxx), `revision` int, `status` enum(draft, issued, revised, won, lost)
- `site_id`, `client_id`, `quote_date`, `valid_days` int default 15
- `tax_mode` enum(exclusive) fixed; inclusive pricing is not allowed (Abu Dhabi quotes were tax-inclusive, this is a compliance risk)
- `payment_terms` text default "50% advance, 40% at half completion, 10% on completion"
- `programme_days_requested` numeric nullable, `programme_hours_per_day` numeric nullable
- `totals` jsonb (engine output snapshot at issue time), `pdf_url`

**quote_lines**
- `quote_id`, `sort`, `stage_id`, `family_id` (product actually used), `description` text (client-facing)
- `qty` numeric, `unit` enum(sqm, lm, nos, lump)
- `inputs` jsonb (thickness_mm, tile_format, joint_mm, coats, waste_pct, productivity override, tier override, bought_in_cost, markup)
- `breakdown` jsonb (material, labour, consumables, equipment, site_factor, programme_uplift, overhead, margin, unit_price, line_total)
- `unit_price` numeric (final quoted rate), `line_total`
- `is_rate_only` bool (qty shown as TBC, no total)
- `nudges` jsonb[] (assistant flags at issue time, for audit)

**quote_line_history** (materialised view over issued quotes) `stage_id`, `family_id`, `unit`, `unit_price`, `qty`, `site_profile_id`, `emirate`, `quote_number`, `quote_date`. Indexed on (stage_id, family_id). This is the assistant's lookup table for "what did we charge last time".

**imported_quotes** Past quotations imported from PDF/Zoho for history (the 19 already analysed). Same shape as quotes with `imported = true`.

**assistant_messages** `quote_id`, `role`, `content`, `tool_calls` jsonb, `tokens_in`, `tokens_out`, `model`.

## 4. Calculation engine

Module `lib/engine/`. Pure functions, unit-tested. Input: quote + lines + reference data. Output: per-line breakdown and quote totals. Runs on every edit (debounced) and on assistant tool calls.

### 4.1 Material cost per output unit

`sn_cost_per_pack = books_cost × intercompany_factor` (or `manual_cost` for unstocked families).

By driver:

- **coverage**: `material = sn_cost_per_pack / pack_qty × coverage_value × coats × (1 + waste)`
- **thickness**: `material = sn_cost_per_pack / pack_qty × coverage_value × thickness × (1 + waste)` where coverage_value is kg/sqm/mm (or per cm for screeds) and thickness is in the matching unit
- **roll, board**: `material = sn_cost_per_pack / net_units_per_pack × (1 + waste)` where net_units_per_pack is sqm actually covered after laps and cuts
- **linear**: `material = sn_cost_per_pack / lm_per_pack × (1 + waste)`; for sealants `lm_per_pack = pack_ml / (joint_width_mm × joint_depth_mm)`
- **each**: `material = sn_cost_per_pack / pcs_per_pack × pcs_per_output_unit`
- **bought_in**: `material = supplier_cost × (1 + cutting_waste) × (1 + markup)`; labour still applies from tier
- **labour_only**: material = 0

Secondary families on a stage (primer under SL, mesh in membrane, spacers with adhesive) are summed into the same line's material.

Grout consumption formula (Mapei), used when the family is a grout and the line has tile inputs:
`kg_per_sqm = (A + B) / (A × B) × C × D × density` with A, B tile sides in mm, C joint width mm, D tile thickness mm, density 1.6 for cementitious and 1.55 for epoxy. Overrides the family default when tile inputs exist.

Adhesive consumption rule: base TDS value for the trowel; add back-butter allowance (+1.5 kg/sqm) when tile format ≥ 60x60 or stone.

### 4.2 Labour

`crew_days = qty / productivity` (productivity in output units per crew-day, from stage default or line override).

`labour = crew_days × tier.crew_day_cost × site_profile.labour_multiplier`.

`labour_per_unit = labour / qty`.

Productivity defaults are seeded from the quote back-solve (Section 8) and marked confidence M until timesheets exist.

### 4.3 Consumables and equipment

`consumables = qty × stage.consumable_per_sqm` (blades, pads, tape, rollers, mixing).
`equipment = Σ (equipment.daily_hire × working_days_on_site) + equipment.mobilisation` for hired items. Owned items contribute `consumable_per_sqm` only.

### 4.4 Programme and compression

Base programme per stage: `working_days = crew_days / crews` (crews default 1), plus `cure_days` calendar time before the dependent stage can start. Stages within a discipline are sequential; disciplines can overlap if `parallel_ok`.

Effective site hours: `site_hours_per_day = min(settings.working_hours_per_day, site_profile.allowed_hours_per_day)`; `site_days_per_week = site_profile.allowed_days_per_week`.

Hours needed: `crew_hours = crew_days × settings.working_hours_per_day`.

If the quote has `programme_days_requested`:
- `available_hours_per_crew = programme_days_requested × site_hours_per_day × (site_days_per_week / 7)` (calendar days to working days)
- `crews_required = ceil(crew_hours_total_on_critical_path / available_hours_per_crew)`
- If `crews_required > 1`: apply congestion: `labour × (1 + congestion_loss × (crews_required − 1))`; multiply mobilisation, tools and equipment by `crews_required`; supervision = supervisor_day_cost × programme_days_requested.
- If cure days alone exceed the programme, return an infeasibility flag; the assistant explains that the deadline cannot be met regardless of crew size.
- `programme_uplift = compressed_total − base_total`, shown as its own row so the client-facing note can justify it.

Worked example (Tarun's case): scope needs 30 crew-days at 8 h = 240 crew-hours. Site allows 6 h/day, deadline 15 calendar days, 6-day week → 15 × 6 × 6/7 = 77 available hours per crew → ceil(240 / 77) = 4 crews. Congestion 10% × 3 = +30% on labour, 4× mobilisation and tools, supervisor 15 days. Engine shows base and compressed side by side.

### 4.5 Site factors and lump sums

Per quote: `mobilisation = trips × transport_per_trip × mobilisation_multiplier`, `permits`, `parking × working_days`, `protection` if required and not by client, `garbage_disposal` if not by main contractor, `scaffolding` if not by client (hire × programme_days). Each is a lump line the estimator can toggle "by client" which zeroes it and adds the corresponding clause to Terms.

### 4.6 Overhead, margin, rounding, VAT

`cost = material + labour + consumables + equipment + share_of_lumps`
`price = cost × (1 + overhead) × (1 + margin)` per line; margin can be overridden per line (e.g. bought-in items at lower margin).
Rounding: unit rates to nearest 1 AED for rates ≥ 50, nearest 0.5 below; lump sums to nearest 500.
`cost_floor = cost × (1 + overhead)`: the price below which the line loses money. Always visible. The assistant nudges when `unit_price < cost_floor` and blocks issue below `cost` unless admin overrides with a reason.
VAT 5% applied on the quote subtotal, always exclusive.

### 4.7 Rate-only lines

`is_rate_only = true` shows the unit rate with qty "TBC", excluded from totals, with the note "Final area measured after completion". Replaces the current practice of Qty 1 placeholders.

## 5. Cross-check and nudge rules

Run by the engine on every recalc; results attached to lines as `nudges` with severity info / warn / block. The assistant narrates them; the UI shows them as chips.

1. **Below cost floor** (block): unit_price < cost_floor.
2. **History deviation** (warn): same stage_id + family_id issued in the last 12 months; deviation > 15% from median. Message includes the last three quotes and rates.
3. **History deviation by site profile** (info): as above but compared within the same site_profile.
4. **Missing dependent stage** (warn): tile or stone in a wet area with no waterproofing stage; epoxy or SL with no primer; bitumen with no protection; LFT with substrate verdict SR2/SR3 and no SL stage; any resin floor with no surface preparation.
5. **Programme infeasible** (block): cure days > programme_days_requested.
6. **Low-confidence input** (info): any coverage or productivity at confidence L feeding the line.
7. **Product data flag** (warn): family's representative product has cost_flag zero_cost or duplicate_suspect.
8. **Client-supplied contradictions** (warn): a "supply and apply" description with tile marked client-supplied, or scaffolding lump present while T&C says by client.
9. **Location premium unused** (info): site is island or gated and labour_multiplier is 1.0.
10. **Tax mode** (block): any attempt to enter tax-inclusive rates.

## 6. Assistant

Route handler `app/api/assistant/route.ts`, streaming. One conversation per quote.

**Context packet** assembled server side on each turn (target under 6k tokens):
- Quote header, site profile, programme inputs
- Every line with breakdown and nudges (compact JSON)
- History matches for each line (up to 3 per line: quote number, date, rate, qty, site)
- Relevant stage catalogue rows and their default products
- Settings that matter (margin, overhead, VAT)
- Last 10 messages

**System prompt** (outline): You are the estimating assistant for Sixty Newton Technical Services, a UAE specialist applicator. You never calculate prices yourself; you read the engine's breakdown and history and explain, compare, flag and propose. When the user asks for a change, call a tool; do not state a new number as if applied. Be direct. Flag problems before praise. Use AED. No em or en dashes. When writing client-facing text, keep Sixty Newton's register: brand-certified, spec-driven, plain English.

**Tools** (function calling; engine executes, result returns to the model):
- `recalc(quote_id)`
- `add_line(stage_id, family_id, qty, unit, inputs)`
- `update_line(line_id, patch)`
- `remove_line(line_id)`
- `set_programme(days_requested, hours_per_day)`
- `set_site_profile(site_profile_id)`
- `lookup_history(stage_id, family_id, limit)`
- `lookup_family(query)` (search product families and Books items)
- `draft_note(purpose)` (returns text for quote notes; user pastes or accepts)

**Behaviours**
- On quote open: one summary message listing nudges by severity, nothing else.
- Proactive nudges from rules 1, 2, 4, 5 only; the rest on request.
- What-ifs ("what if they only allow 6 hours a day and want it in 15 days") call `set_programme`, then explain base vs compressed in one paragraph with the uplift percentage and its causes.
- Explanations for clients are written from the breakdown, never from memory.
- Token guard: per-quote budget in settings (default 200k tokens); warn at 80%.

## 7. Zoho Books sync

Nightly cron (Vercel Cron → route handler). `GET /books/v3/items?organization_id=719219457&filter_by=Status.Active&per_page=200&page=n` until `has_more_page = false` (33 pages today, 6,505 items).

Mapping: `item_id → books_item_id`, `purchase_rate → books_cost`, `rate → books_sell`, `stock_on_hand`, `brand`, `sku`, `unit`. Parse `pack_qty` and `pack_unit` from name with the regex set from the seed script; unmatched go to a review queue.

Rules: `zero_cost` flag when purchase_rate ≤ 1. `duplicate_suspect` when two active items share a normalised name (colour and pack tokens stripped) and costs differ by more than 5x (catches Purtop 500 N at 525 vs 5,670). Family assignment by the curated regex table (seeded), then manual in the review queue. Colour variants inherit the family's coverage.

## 8. Seed data and derived defaults

Import from `SixtyNewton_Stage_Catalogue_and_Coverage_Capture.xlsx`:
- Tab "Stage Catalogue" → stages (92)
- Tab "Coverage (TDS defaults)" → product_families (219) with coverage, multiplier, waste, source, confidence
- Tab "Observed Rates" → imported_quotes summary (50 rate points, 19 quotes)

Labour tier defaults derived by back-solving `quoted_rate − material` on the 19 quotes (Aug 2026 analysis):

| Tier | Implied application AED/sqm | Evidence |
|---|---|---|
| Thin coating (grout, cementitious WP, SL skim, sealant per lm) | 35 to 40 | Kerapoxy 34 to 39, CM210 36.5, Ultraplan 37 to 40, PU45 34/lm |
| Heavy application (tiling, screed, multi-coat WP system) | 70 to 80 | Keraflex tiling 74, Topcem screed 70 to 80, Mapelastic system 77 |
| Surface preparation (grinding) | 15 | QT-296, 298 |
| Demolition | 75 to 86 | QT-269, 299 |
| Roll membranes (torch) | 14 to 40 | Awazel 14, anti-root 40 |
| Island / gated premium multiplier | ~2.0 on heavy application | Jumeirah Bay tiling 147 vs 74 |

Convert to `crew_day_cost` and `productivity` once Ashrat confirms crew sizes and daily costs; until then store application_rate_per_sqm directly with confidence M and let the engine use `labour = qty × application_rate × labour_multiplier`.

Known below-cost lines to preload as history warnings: SL 18 mm at 85 (material 108 with Ultraplan Maxi), epoxy at 45 (material 65 with Mapefloor I 300 SL), screed 10 cm at 120 to 130 (only viable with site-mixed Topcem, not Pronto), water-based primer at 4 (material 3.4).

## 9. Quotation output

Branded PDF matching the current Sixty Newton layout (logo, TRN 104670113000003, address Shop 12, 14 Street, Al Quoz Industrial Area 4). Line descriptions in sentence case. Columns: #, Description, Qty, Unit, Rate, Amount. VAT 5% shown once on subtotal. Revision suffix in the number. Notes section generated from toggles (tiles by client, scaffolding by client, garbage by main contractor, final measurement, WP test, warranty). Terms fixed and corrected: "Force Majeure", "null and void", validity 15 days, payment terms from quote.

## 10. Build phases

1. **Foundation** (week 1): Supabase schema, auth, Books sync, seed import, products and families admin screens, review queue.
2. **Engine** (week 2): engine module with tests against the 19 imported quotes (target: reproduce each quoted rate within the documented tier ranges); quote builder UI with live breakdown; nudges as chips.
3. **Assistant** (week 3): context packet, tools, streaming UI, proactive nudges, client-note drafting.
4. **Output** (week 4): PDF, revisions, issue flow, optional Zoho Estimate push, history import of remaining past quotes.

## 11. Open items

- Crew sizes and all-in daily costs per tier (Ashrat or payroll). Until then the engine uses application rates per sqm from Section 8.
- Which SL product was used at 18 mm and which epoxy system at 45; determines whether those were losses.
- Whether spray PU foam insulation is own-rig or subcontract.
- Kerakoll decorative line (Microresina, Wallcrete, Absolute, Decor KK72) has no Books cost; the Bugatti quote gives 55 and 53 AED/sqm material and 45 and 62.5 sqm per unit for Absolute and Universal Primer. Store as manual with source quote.
- Zoho Books quote number sequence: app generates its own numbers or reserves from Books.

## 12. Interface

Reference mockup: `SixtyNewton_Workbench_Mockup.html` (clickable, static data from QT-000299). The layout mirrors the Claude desktop app: a left rail of clients and quotes, the working document in the centre, the assistant on the right. Password-protected; no public routes.

### 12.1 Left rail (260 px)

- Brand mark, "New quote" (shortcut N), search across quotes, sites, products.
- Clients as collapsible groups. Under each client, quotes listed like conversations: number and revision, short title, date, status pill (Draft, Issued, Revised, Superseded, Won, Lost, Below floor).
- Selecting a quote loads its document and its assistant thread. The thread is per quote, persisted in `assistant_messages`.
- Footer: signed-in user, last Books sync time.

### 12.2 Centre: the quote document

The quote is rendered as a single document, not a form. Top: title, bill-to, site, area, date and validity, then chips for the things that change the whole quote (site profile, labour multiplier, client-supplied items, tax mode, payment terms). Actions: Preview PDF, Issue.

**Three-price ledger.** Every line shows three numbers side by side, always in the same order and colour: cost floor (slate), calculated (ink), quoted (gold, editable). Quoted is the only number the estimator types. A flag appears when quoted is below calculated (amber) or below floor (red). Hovering or clicking a line expands its breakdown (material, labour, consumables, equipment, site factor, overhead, margin).

**Stages grouped by discipline.** Each discipline section lists its stages with a tick to include or exclude. Unticked stages stay visible but greyed, so alternatives considered (Mapelastic vs Purtop) remain on the record. "Add a stage" at the foot of each section opens a searchable picker from the stage catalogue; picking a stage pulls its default product, TDS coverage and labour tier.

**Variables.** A dashed panel below the lines holds the quote-level functions: site hours per day, deadline in calendar days, base programme in crew-days, working days per week, noise restriction, scaffolding by client, margin. Each is a small control with its effect stated beside it. "Add variable" lets admin add a new factor (name, type, formula hook) without a code change. Every variable feeds the engine's programme and site-factor modules and updates the calculated column live.

**Totals.** Base total, programme compression as its own row with a one-sentence explanation of the crew arithmetic, VAT, total. Below it a plain-language delta: how far quoted sits from calculated and what margin over floor that leaves.

**Before and after.** Every revision of this quote in a table: what changed, floor, calculated, quoted. The current draft is the last row and updates live. This is the "how much was calculated before and after" view.

### 12.3 Right column (380 px)

**Pocket calculator**, pinned to the top so it stays visible while the document scrolls. Standard keys plus ×1.09 (intercompany), %, and "Use as quoted rate" which writes the display value into the focused or first included quoted cell. Keyboard-driven when no input has focus.

**Assistant thread** below it. On open, one message listing the nudges by severity, each with action buttons that call engine tools (Set to calculated, Show breakdown, Keep and add reason, Explain to client). History comparisons render as compact tables inside the nudge. Free-text questions go to the model with the context packet from Section 6; changes the model proposes are applied only through tool calls and appear as edits in the document with the changed number briefly highlighted.

**Compose box** at the bottom with model name and token usage for this quote.

### 12.4 Rules

- Numbers use tabular figures; AED with thousands separators; unit rates to 1 or 0.5 as per Section 4.6.
- Colour carries meaning only: slate floor, ink calculated, gold quoted, amber warn, red block, green won. No decorative colour.
- No em or en dashes anywhere in the interface or generated documents.
- Sentence case throughout, including generated line descriptions.
- Keyboard: N new quote, / search, Enter in calculator equals, Escape clears.
- Responsive floor is 1180 px wide; below that the right column collapses to a drawer. Mobile is read-only review of issued quotes.
