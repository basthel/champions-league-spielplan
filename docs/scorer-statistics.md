# Scorer statistics verification

The local scorer recalculates statistics from the dart event log. It does not
reuse cached summary totals, round an average before aggregation, or rewrite
stored darts when formulas change.

## Statistical and recorded darts

[Darts Atlas's calculation guide](https://guides.dartsatlas.com/en-gb/basics/stats/)
defines the standard match average as total valid points divided by statistical
darts, multiplied by three. A bust is a full three-dart visit even when it ends
on the first or second dart; a successful checkout uses only its actual darts.
The guide was checked on 2026-10-29.

Previously the scorer counted only entered darts on an early bust. This made
the overall average too high, let fourth-visit points enter First-9, and could
misstate the leg dart record, best-leg average and dart-position averages.

The fix preserves actual dart records. Only scoring calculations use zeros for
the unused positions of a busted visit. Field rates and check-in/checkout
opportunities never gain fictional darts. `darts` is the statistical count;
`recordedDarts` preserves the number actually entered. Both appear in JSON
exports. The leg table and live dart count use the same statistical convention.

## 180s

A 180 is one completed, non-busted visit with 180 valid points. A partial visit,
an undone visit, points from separate visits, and triples before Double In do
not count. Three recorded T20s count once, regardless of how often statistics
are opened or the match is reloaded. Lower high-score buckets are disjoint.

The reported saved-match discrepancy has not been reproduced in the counter.
The affected phone's event log is required to compare its result with actual
entered visits; selecting Triple before each 20 was confirmed by the user.

## Regression checks

`tests/statistics.test.cjs` contains hand-calculated examples and an exhaustive
check of all 250,047 possible ordered three-dart combinations on a standard
board (including a miss). Each combination checks total points, the average,
high-score buckets, and whether it is the unique T20/T20/T20 maximum.

Other fixtures check a nine-dart 501 (two 180s, average 167), a twenty-dart 501
(average 75.15), early busts at all three positions, weighted multi-leg averages,
First-9 boundaries, short checkouts, multiplayer isolation, Double In, undo,
reload and repeated statistics reads. Expected numbers are hand calculations,
not snapshots of the production implementation.

The browser check enters Triple separately before each 20 and verifies the
rendered statistics and saved event log, then exercises bust correction and
reload. Saved games on another device are local to that device; they are not
accessible through the static HTTP server.
