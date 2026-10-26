# Haumdaucher league updates

The user updates this static GitHub Pages site by uploading match-stat screenshots
in chat. Do the transcription, validation, data update and publication for them;
do not require manual spreadsheet entry or an on-site upload form.

## Screenshot workflow

1. Inspect every uploaded image visually. Use player names printed in the scoring
   app, not messaging contact names. Do not infer a match date from a screenshot's
   phone clock. Keep unreadable or absent metrics null.
2. Archive each original with:
   `python3 scripts/archive_image.py /path/to/upload.png --id UNIQUE_SOURCE_ID`.
   The script preserves the original bytes, checks for duplicates, records SHA-256,
   and creates a pending JSON in `data/extractions/`.
3. Transcribe both players, legs and every legible statistic into that extraction.
   Keep original source values, including sets and reported percentages; do not
   rewrite evidence to fit the league. Mark examples as `example`. A conflicting
   score, player or matchday stays `pending` until clarified.
4. Match the pair to the **existing** `schedule.json`; never regenerate the draw to
   accommodate a result. Only confirmed results enter `data/results.json`.
   Best of 12 ends at 7:0 through 7:5, or 6:6. Win 2 points, draw 1 each, loss 0.
   The screenshot examples supplied on 2026-10-26 end at six won legs and are
   reference evidence, not valid best-of-12 league results.
5. Make a confirmed JSON record with:
   `id`, `status: "confirmed"`, scheduled `matchday`, `playedAt` (ISO date or null),
   `sources: [{path, sha256}]`, and two `players: [{name, legsWon, stats}]`.
   Supported stats are listed in `scripts/build_league.py`'s METRICS.
   Source-only fields such as `setsWon` stay in extraction JSON.
   Import with `python3 scripts/build_league.py --import-result /tmp/result.json`.
   The script rejects duplicates, mismatched fixtures, unfinished scores, corrupt
   sources and inconsistent checkout percentages. A deliberate correction uses
   the existing ID and `--replace`; do not create a second result for one fixture.
6. Run:
   `python3 scripts/build_league.py --check`
   `python3 scripts/generate_schedule.py --check`
   `python3 -m unittest discover -s tests -v`
   Check the table, statistic filters and the affected matchday/player cards
   using T3 browser tools at a narrow mobile width.
7. Cache-bust `league-data.js` in `index.html` after changing results. Commit the
   original images, extraction JSON, source manifest, canonical results and both
   generated league-data exports together. Publish to main when requested or
   covered by the continuing publication instructions in the conversation.
   Verify the GitHub Pages build and finish with the website link.

## Calculations

Table: Sp, Pkt, legs won:lost, Game-Ø and CO %. Ranking: points, leg difference,
legs won; identical scores share a place. Alphabetical order only breaks display
order of tied rows. Game-Ø is the mean of available per-game averages. Checkout %
uses total successful legs divided by total reported checkout attempts, **not**
the mean of match percentages. Missing data is not zero. Counts sum, records
take maxima/minima. A separate dart-weighted 3-dart average is available only
when all contributing averages have dart counts. Source high-round buckets
are preserved as reported, not added together. Overall/pot statistics count each
match once but aggregate player appearances from the selected scope.

## Design

Arena only. Keep descriptions short, player cards compact, SVG icons minimal,
and mobile navigation thin and translucent. Tab order:
Tabelle, Spieltage, Spielplan, Statistik, Lostöpfe.
