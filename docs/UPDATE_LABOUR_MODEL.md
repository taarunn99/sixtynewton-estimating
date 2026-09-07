# Update: labour model redesign plus thickness and tile-size inputs

This replaces any earlier version of this instruction. Do only this; the deferred list at the end is not in scope. The 11 new quote PDFs referenced in section 5 are in docs/quotes/.

## 1. Labour becomes a manual field with a suggestion, never a nudge

- Per line, labour per unit is an editable input, prefilled with the engine suggestion, marked "suggested" until edited. Once edited, the user's value flows to Suggested price, totals and PDF breakdown; the suggestion stays greyed beside it with an (i) showing its source.
- Suggestion order: median of matching quote lines (same stage, similar inputs) first; else the application-only rate table; else the labour tier rate. Name the source used.
- No nudges ever fire on labour. Remove labour from the floor: "Our cost" = material + consumables + logistics share only. Red below-floor compares Your price to that. History-deviation nudges on the whole rate stay but must never mention labour.
- Per-line toggle "absorb labour in margin": zeroes the line's labour, keeps the stage on the quote, grey note "labour absorbed". Default ON for prep stages (grinding, priming, surface prep) when a main application stage of the same discipline is included; OFF otherwise.
- QUOTE-LEVEL LABOUR TOTAL: a box at the totals area, "Total labour for this job", holding the head contractor's verbal figure. Engine shows a suggested total (sum of line suggestions) greyed beside it. When the user enters a figure, distribute it across labour-bearing lines pro rata to their suggestions and mark each line's labour "from job total"; per-line edits after that override their share. No nudges on this number either.

## 2. Labour cost reference data (admin-editable, source "Tarun, Sep 2026", internal only)

- Salaried staff: average salary 1,400 to 1,500/month; accommodation 350/month per person (3,500 apartment across 10); visa per 2-year contract recorded as 700 per person as stated (flag in admin: confirm if monthly amortisation or total across the contract). All company-paid, never deducted from salary. All-in about 70 to 80 per day.
- Daily wage: 90 to 95/day general labour; masons 160 to 180/day.
- Overtime: paid at plain hourly rate, salary divided by monthly hours, no multiplier.
- Piece-rate reference, CONFIDENTIAL, internal only, never on client-facing surfaces or PDFs: Al Wathba paid to crew 50/sqm with 25 to 30 sqm/day target, linear work paid 16/lm (normal linear charge-out 12 to 13/lm).
- Crew reference: 5-person mixed crew about 430 to 480/day; at 25 sqm/day about 17 to 19/sqm. Show in the labour (i) tooltip.

## 3. Tile-size labour ladder (application labour per sqm, floor install; seed at confidence M)

- 60x60: 40, band 40 to 60
- 60x120 / 120x60: band 50 to 75, midpoint 65 (FLAG in admin: Tarun gave 50 to 70 and 70 to 75 for the two orientations, confirm one band)
- 120x120: 80 to 100, midpoint 90
- Oversize slabs above 120 cm side, up to 240x240: interpolate to 115 at 240x240
- Wall installation: +10 on the labour figure
- Interpolate on tile area between anchors; show the interpolation and any flag in the (i). These drive the tiling labour suggestion; adhesive and grout material still come from tile dimensions via the consumption formulas.

## 4. Thickness and tile size as line inputs, wired to the engine

- Every thickness-driver line gets a thickness input (mm; cm for screeds), defaulted from the family, editable, changing material consumption and the labour suggestion (thicker = slower via speed weights). An Ultraplan line at 2 mm vs 10 mm must show materially different numbers.
- Every tiling line gets tile width and height in cm, driving adhesive kg/sqm (back-butter at 60x60 and larger), grout kg/sqm (Mapei formula), and the ladder suggestion. Wall/floor toggle applies the +10.

## 5. New quotes into history

- 11 new PDFs in docs/quotes (QT-000168, 184, 191, 237, 250, 256, 263, 291, 293, 295, 304): import to imported_quotes, map lines to stages and families where identifiable. New rate points to capture: screed application-only 60 (237) and 100 for 1 to 3.5 cm with Eporip (168); screed supply-and-apply 115 at 12 cm Vetotop CS536 on 9,273 sqm (304), 165 at 15 cm (250); screed+WP bundle 550 at 10 cm (184) and 900 incl tile (191); WP supply-and-apply 85 to 90 (250, 256); bitumen application-only one layer 20/sqm and protection board 17/sqm (293); Mapefloor parking ED system 130 (291); joint repair 150/lm, backer-rod sealant 20/lm (291); microtopping 7-layer 209 (295), lump 11,000 (263); tile 60x60 supply and install 209 (295). Refresh history medians used by suggestions.
- Add Saveto Vetotop CS536 family if missing and link its Books items via the review queue.

## 6. Tests and acceptance

- Engine tests: labour excluded from floor; per-line override flows through; job-total distribution pro rata then per-line override; absorb toggle; thickness changes material live; tile size changes adhesive, grout and suggestion; wall +10.
- Calibration: QT-000299 R1 still reproduces within 15% under the new floor definition; report the new floor number.
- Confidential piece-rate data must not appear in any client-facing view or PDF; add a test that renders the PDF and asserts its absence.
- No em or en dashes. Stop and report with screenshots: one SL line at 2 mm vs 10 mm, one tiling line at 60x60 floor vs 120x120 wall, and the job-total labour box in use.

## Deferred, do not build now

Mail automation, RAG over quote PDFs, variables panel rework, payment-terms calculator, overtime entry, further microtopping families.
