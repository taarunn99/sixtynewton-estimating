# Update: working variables, full quotability and inputs, internal cash estimate

This replaces any earlier version of this instruction. Do only this. No em or en dashes anywhere.

## 1. Variables panel v2: variables must actually move numbers

The current panel is display-only. Rebuild it so every variable produces a visible, live effect.

- Each variable renders with its control AND its current effect in AED right beside it (e.g. "Deadline 15 days: +18,400"). Changing any value recalculates immediately.
- Effects are applied as named adjustment rows in the totals block, each with an (i) explaining the arithmetic, and they scale the per-line labour SUGGESTIONS. They never modify a labour value the user has typed; if the user has overridden labour on a line, the adjustment row still computes from the labour subtotal as entered, and the (i) says so.
- No nudges from variables, ever.

Built-in variables:
- Site hours per day, deadline calendar days, working days per week, base programme crew-days: drive the existing compression maths (crews needed, congestion, extra mobilisations, supervision days). Output one adjustment row "Programme compression" with the crew arithmetic sentence. This exists in the engine; wire it to totals and suggestions so it demonstrably works.
- Occupied building (toggle): productivity factor 0.85 by default (admin-editable), so labour suggestions on affected lines rise by about 18%. Adjustment row "Occupied building". Confidence L, source "Tarun, Sep 2026".
- Night work (toggle): default manual percent, prefilled +10% on labour subtotal, editable inline. Adjustment row "Night work".
- Margin stays as is.

Custom variables:
- "Add variable" opens name + effect type (percent on labour subtotal, percent on quote subtotal, fixed amount, amount per calendar day) + value. It appears as a normal adjustment row and persists on the quote. All manual, no engine intelligence.

Tests: changing site hours from 8 to 4 changes the total; occupied toggle changes labour suggestions but not user-entered labour; a custom +100/day variable over 15 days adds 1,500; all adjustment rows appear in the PDF breakdown ONLY as part of rates, never as visible rows (client sees rates, not our adjustments).

## 2. Full quotability and free inputs on every discipline

- Verify end to end that every stage of all 14 disciplines can be found and added in the stage picker. Known failure: microtopping (Ultratop Loft F base, Loft W finish, primer, sealer stages exist in seed data but cannot be found when quoting). Fix the picker: search matches stage name, discipline, family name and aliases ("micro", "loft", "microtopping" must all hit).
- Every numeric line input is a free-entry field, not a preset list: thickness (mm, decimals allowed; cm for screeds), coats, tile width and height, joint width, waste. Clamp softly to the family's plausible range with an inline note, but allow override.
- Microtopping line UX: base coat mm, number of base coats, finish coat mm, sealer coats, all editable, each changing material and the labour suggestion.
- Add a smoke test that programmatically adds one line from each of the 14 disciplines to a draft quote and asserts a nonzero material cost for each (except labour-only stages).

## 3. Internal cash estimate strip (calculator only, never on the PDF)

Under the totals block, visible to logged-in users only, clearly labelled "Internal":
- Payment terms selector, default 50/40/10, editable percentages summing to 100 (support 60/30/10).
- Shows each milestone amount computed on Your price total including VAT.
- Shows total material cost for the quote as its own figure, and the ratio line: "Material is X% of the quote. Advance covers material: yes" or "no, short by Y AED". Plain statement, no nudge, no colour alarm.
- Optional collection factor in settings (default 100%): a second line "At Z% collection: amounts". Internal only.
- Retention is out of scope; do not model it.
- Test: PDF render asserts none of these strings or figures appear.

## 4. Reference data corrections (admin, source "Tarun, Sep 2026")

- Visa: 700 AED per person PER MONTH across the 2-year contract (flag resolved). Salaried all-in: about 1,450 + 350 + 700 = 2,500/month, about 96/day. Crew of 5 mixed: 480 to 530/day; at 25 sqm/day about 19 to 21/sqm. Update all labour (i) tooltips.
- Tile ladder flag resolved: 60x120 and 120x60 one band, 50 to 75, midpoint 65; around 80x120 use 70 to 75. Keep 120x120 at 80 to 100 and 240x240 at 115; wall +10.
- Consumables: excluded from the floor. Reference note in the labour (i): blades, paddles, tape, sponges about 25 AED per crew-day, treated as covered inside the application rate.
- Equipment: owned, cost ignored in quotes. Remove any zero-value equipment warnings.
- Pickup cost: remove from settings pending; not part of quote calculation.

## 5. Assistant connected to quote history

The assistant must be able to answer pricing questions from the imported and issued quotes and propose numbers, using the structured quote_line_history, not PDF text.

- New assistant tool search_history(query): filters quote lines by stage, family, client, site, emirate, date range, unit; returns quote number, date, client, rate, qty, site profile. The model composes the answer from tool results only.
- "What did we charge Azizi for bitumen" must return the QT-000293 lines (20/sqm membrane, 17/sqm protection board) with date and quantities.
- New tool propose_labour(line_id): returns the engine's suggestion sources (history median with the matching quotes listed, ladder or tier fallback, crew cost reference) and a one-paragraph recommendation. On user acceptance the assistant writes it into the line's labour field via the existing update_line tool, marked "assistant proposed, accepted by user". Proposals never auto-apply.
- The assistant may reference adjustment rows and the cash strip when the user asks, since both are internal surfaces.
- Test: the Azizi question returns the two 293 rates; propose_labour on a 60x60 tiling line cites the ladder anchor 40 and at least one historical quote.

## 6. History and engine must both stand behind every suggestion, visibly

An accepted quote is evidence of what the market paid; the engine is evidence of what it costs. Every suggestion uses both.

- Every suggested number (per-line labour suggestion, job labour total suggestion, Suggested price) is computed BOTH ways whenever possible: (a) history: median of matching accepted quote lines from imported and issued quotes, retaining the matching quote numbers, dates and rates; (b) engine: cost build-up from material, references and ladders. The suggestion shown is history when at least 2 matches exist, engine otherwise, and the (i) always displays BOTH figures side by side, e.g. "Suggested 65: from 4 past quotes (median 65: QT-261, QT-269, ...); engine build-up gives 58", with the source used stated plainly.
- When history and engine disagree by more than 25%, do not nudge; add one grey informational line inside the (i): "Past quotes and cost build-up differ here; past quotes used." Information, never a warning colour.
- Matching rules for history: same stage and family first; widen to same stage any family; then same discipline; each widening stated in the (i) ("no exact match, using 3 quotes from the same discipline"). Thickness and tile size within a tolerance band count as matching inputs; outside the band the match is noted as approximate.
- Verification, not just wiring: tests must prove history drives live suggestions. A 60x120 tiling line must show a history-led suggestion citing QT-000261; a bitumen membrane line must cite QT-000293 at 20; an Ultraplan line at about 5 mm must cite QT-000298 or QT-000300. If any fall through to engine-only, the test fails.
- Admin page "Suggestion coverage": a table of all stages showing how many history points each has and the current median, so we can see where the database is thin and which stages are engine-only. Internal. Report which stages currently have zero history points.

## 7. Acceptance

Stop and report with screenshots: the variables panel showing per-variable AED effects and an adjustment row; a microtopping line fully built with custom thicknesses; the internal cash strip on a quote with material above and below the advance threshold (use QT-000299 R2 and any small quote). All tests green, calibration on QT-000299 R1 still within 15%, and the suggestion coverage report included (stages with zero history points).

Deferred, do not build: mail automation, retention modelling, overtime entry.
