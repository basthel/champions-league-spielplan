# Double Out lookup

`checkout-data.js` is the offline lookup used by both the live scorer and the
computer opponent. It covers every Double Out finish from 2 to 170 and selects
recommendations separately for one, two, and three darts in hand. The seven
three-dart bogeys (159, 162, 163, 165, 166, 168, 169) have no entry.

Sources checked on 2026-10-29:

- [Darts-UK's printed checkout chart](https://www.darts-uk.co.uk/downloads/Darts-UK_Darts_Checkout_Chart.pdf):
  the main reference for the 60–170 combinations.
- [Darts501's chart and strategy notes](https://darts501.com/Check.html):
  cross-checks combinations and explains why a single miss should leave another
  finish where possible (for example, starting 77 on the 19 segment).
- [The Darts App's checkout chart](https://thedarts.app/guides/checkout-chart):
  low-score combinations, 101 via T20 / 9 / D16, 90 via T18 / D18, and the
  distinction between a spare-dart route and a forced bull checkout.
- [DartsOn's chart](https://dartson.app/tools/darts-checkouts/): the bull-first
  three-dart option on 82 and cross-checks of standard bull finishes.

These are curated recommendations, rather than a unique mathematical optimum.
Charts differ, and a player's preferred double and match situation can change
the choice. We favor conventional routes and ordinary doubles with darts to
spare. Examples: 50 is 10 / D20 with two or three darts, but Bull with one;
101 is T20 / 9 / D16 with three, but T17 / Bull with two; 82 is Bull / D16 with
three, but T14 / D20 with two. Each entered dart performs a fresh lookup for the
actual remaining score and dart budget.

Notation: a bare number is single; `T` is triple; `D` is double; `25` is outer
bull; `Bull` is the 50-point inner bull (double 25). The table contains dart
combinations only, not source prose or chart artwork. Tests independently
enumerate reachable Double Out scores for each dart budget, check every stored
route, reject bogeys, and replay representative routes through the scoring rules.

Straight Out and Master Out continue to use the mathematical search with their
own finishing rules; this standard Double Out list does not describe those
variants. There is no network lookup during a match.
