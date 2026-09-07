# Final update: rate book PDF and follow-up mail automation

This replaces any earlier version of this instruction. Two parts. No em or en dashes anywhere. Confidential data rules from earlier updates still apply.

## Part 1. The Sixty Newton Rate Book

A generated PDF of every number the system holds, for line-by-line review by the head contractor. Script plus route: `npm run ratebook` writes docs/RateBook.pdf, and an admin button "Download rate book" generates the same. Marked INTERNAL on every page.

Structure, grouped by discipline (all 14), then stage, then product family, one row per family:

1. Product and pack: family name, brand, representative Books item, pack size, Sixty Newton cost per pack (Books cost x 1.09) and per kg/L/unit.
2. Coverage: consumption value and unit, coats or default thickness, waste %, source (tds, quote, manual, contractor) and confidence (H/M/L). State the default inputs in plain words, e.g. "at 2 mm, 2 coats" or "60x120 tile, 3 mm joint".
3. Material cost per output unit (sqm, lm, each) at those defaults, with the one-line derivation exactly as the (i) tooltips show it.
4. Labour: the current suggestion showing BOTH figures where they exist: history median with citing quote numbers and dates, and engine build-up; state which leads. Where only engine exists, print "no past quotes".
5. Rates, both modes: Supply and application suggested price per unit at current settings, and Application only (material by client). For tiling, print the full ladder: 30x30, 60x60, 60x120, 80x120, 120x120, 240x240, floor and wall.
6. Evidence: up to 3 matching past quote rates with QT number, date, client, site type. Shade rows where history and engine differ by more than 25% and mark them "review".
7. A wide blank column headed "Contractor correction" for handwriting.

Also include:
- Cover page: date, data sources (Zoho Books org 719219457 with sync date, 36 quotations imported, TDS defaults, Tarun's references Sep 2026), settings used (intercompany 1.09, overhead, margin, VAT), and a 5-line note for the contractor: correct wrong numbers, cross out work we never do, add missing work in the margin.
- Thickness-driven stages at 3 representative thicknesses (SL at 3, 5, 10 mm; screed at 5, 10, 15 cm) so the slope can be judged, not one point.
- Variables and adjustments page: compression example, occupied building, night work, island logistics with the Al Maya numbers, upper floor factor.
- Suggestion coverage table: every stage with its history point count; zero-history stages listed first under "These numbers are engine-only, check hardest here".
- Confidential piece-rate references (Al Wathba 50/sqm, 16/lm) on one clearly marked internal page at the end.

Layout: A4 landscape, compact tabular figures, discipline sections with headers, page numbers, footer "SixtyNewton internal rate book, generated <date>". Legibility over density; break tables cleanly.

## Part 2. Follow-up mail automation (Resend)

Purpose: nobody forgets a live quotation. The system emails reminders about issued quotes until they are closed.

Setup:
- Use the Resend API. Env vars: RESEND_API_KEY, MAIL_FROM (use quotes@60newton.com once the domain is verified in Resend; fall back to Resend's onboarding sender until then), MAIL_REPLY_TO tarun.s@lapizblue.com.
- Recipients live in settings as a list, seeded with ashrat@60newton.com; admin can add more (Tarun may add himself). Never hardcode addresses.

Quote status, prerequisite for the reminders:
- Add a status control on issued quotes: Issued, Followed up (with date auto-set), Won, Lost, Expired. One click from the quote page and from a link in the email (deep link to the quote, user logs in and clicks; no unauthenticated state changes).
- "Followed up" can be set repeatedly; store a small follow-up log (date, optional one-line note).

Reminder engine, daily cron 08:00 Asia/Dubai (extend the existing cron route, same CRON_SECRET pattern):
- For every quote in status Issued or Followed up: send a reminder when days since issue (or days since last follow-up, whichever is later) reaches 3, then 6, then 9, then 12; at day 14 send a validity warning ("expires tomorrow, quotation is valid 15 days"); after day 15 mark Expired automatically and send one final note. Stop all reminders the moment status becomes Won or Lost.
- One email per day maximum: if several quotes are due, send a single digest listing them all, oldest first.
- Email content per quote: QT number and revision, client and site, issued date and days open, total AED, current status, last follow-up date and note if any, and three links: Open quote, Mark followed up, Mark won / lost. Subject like "Follow up: QT-000299 R2 Jumeirah Bay, day 6, 249,000 AED". Plain, compact, no images beyond the wordmark. Internal figures only visible after login; the email itself may show quote total but never cost, floor, labour or margin.
- Log every send in the database (quote, day mark, sent_at, resend id). Never send twice for the same day mark. If Resend fails, log and retry next day; do not crash the cron.
- Tests: cadence maths (3, 6, 9, 12, 14, expiry), digest grouping, stop on Won/Lost, no duplicate sends, and an email render test asserting no cost, floor, labour or margin strings appear.

Stop and report: the generated RateBook.pdf with row counts by confidence and by history-backed vs engine-only, a screenshot of the status control and follow-up log, and one example digest email (send a test to the seeded recipient and include the content in the report, minus any secrets).
