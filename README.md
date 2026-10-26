# Champions-League-Spielplan

Public, static German-language match-plan website for 16 players in four pots.

Website: https://basthel.github.io/champions-league-spielplan/

Arena is the selected design, with Club-style side-by-side match boxes.
Tabs: Tabelle (default), Spieltage, Spielplan, Statistik, Lostöpfe.
Standings and statistics are generated from screenshot-backed match results.
The four initial screenshots are archived as reference/pending evidence; they
are not silently counted as league results. The table shows games, points,
legs won:lost, game average and checkout percentage. Statistics can be filtered
by league, pot or player, with scoring, checkout, highlights, accuracy and leaderboards.
Legacy design links also open Arena. The matchday view shows all eight fixtures
for a selected day. Use its numbered day buttons or previous/next buttons;
direct links look like `?spieltag=4#spieltage`.
Personal player links continue to use `?spieler=abi#spielplan`.

## Generate and check a correct draw

Requires **Python 3.9+**, with no dependencies. Run from the repository root:

```sh
# Generate the published draw reproducibly; writes the three output files below.
python3 scripts/generate_schedule.py --seed 20261025

# Generate a different draw by choosing another integer seed.
python3 scripts/generate_schedule.py --seed 42

# Check the existing draw and verify every export is in sync, without writing.
python3 scripts/generate_schedule.py --check

# Validate another schedule without changing the website.
python3 scripts/generate_schedule.py --validate path/to/schedule.json

# Generate into a separate directory for review.
python3 scripts/generate_schedule.py --seed 42 --output-dir /tmp/cl-draw

python3 -m unittest discover -s tests -v
```

The generator preserves these pots:

1. Abi, Tom, Anderl, Hirschi
2. Bastl, Bachi, Hauslon, Schipfei
3. Hellei, Ginzei, Moser, Hofer Flo
4. More, Kaiser, Mäcci, 5er

Kaiser (formerly 5er Korbi) and 5er are separate players.

Every output is independently validated before writing:

- Exactly two opponents from **each** pot, including the player's own pot.
- Eight distinct opponents per player, with no self matches or repeat pairings.
- Eight matchdays of eight matches: every player plays exactly once each day.
- Both players see the same opponent on the same matchday.
- All 64 matches use known players; the roster has four players in each pot.

The algorithm constructs two rounds within pots, then two rounds for each of
three complementary pairings of pots. Different cyclic shifts between two
pots guarantee different opponents. Names, shifts, match order and round order
are randomized with a local seeded RNG. This construction always finishes; it
does not sample uniformly from every possible valid schedule. Home/away balance
and calendar dates are not assigned.

## Data and publishing

`schedule.json` is the authoritative generated fixture list. Each match appears
once; personal opponent lists for both players are derived from that one pair.
The same run writes `schedule-data.js` for the browser and `spielplaene.txt` for
the text download. Do not edit generated files separately. The CLI exits nonzero
if validation fails or `--check` finds an out-of-sync export.

The published schedule is a **new draw** replacing the invalid original; it does
not try to preserve the original opponents. `data/original-draw.json` archives
the original invalid lists for provenance and regression testing.

Open `index.html` through a static server:

```sh
python3 -m http.server 8092
```

No build or runtime dependencies are required. GitHub Pages serves the repository
root on `main`. After generating, run checks, review the new fixtures, then commit
and push the outputs together with any code changes. Google Fonts has local system
fallbacks. Personal links use `?spieler=abi#spielplan`; server-side routes are not
required.


## Screenshot results and statistics

Upload result screenshots in the conversation: the agent archives the originals,
transcribes them into JSON, checks the result against the fixture list, rebuilds
the site data and publishes the update. No user spreadsheet or API key is needed.
The website itself does not upload or OCR images; visual extraction happens in
the conversation. See [AGENTS.md](AGENTS.md) for the repeatable workflow.

- Original source images: `data/screenshots/`
- Every source's SHA-256 and extraction path: `data/sources.json`
- Visual transcriptions and review status: `data/extractions/`
- Confirmed league results: `data/results.json`
- Generated standings, aggregate scopes and results: `league-data.json`,
  `league-data.js` (do not edit directly)

Best of 12: first to seven, or a 6:6 draw. Win **2** points, draw **1** each,
loss **0**. Rank by points, leg difference, then legs won; ties share a rank.
The supplied historical/example screenshots show set-based games ending at
six legs, so their original scores and metrics are preserved separately.

```sh
python3 scripts/archive_image.py /path/to/image.png --id 2026-11-01-player-opponent
# Visually transcribe and review the generated extraction, then create a
# confirmed match JSON using the existing names and scheduled matchday.
python3 scripts/build_league.py --import-result /tmp/confirmed-match.json
# For an explicit correction, use the same ID:
python3 scripts/build_league.py --import-result /tmp/corrected-match.json --replace
python3 scripts/build_league.py --check
python3 -m unittest discover -s tests -v
```

Confirmed match shape (values below describe the schema, not a played match):
```json
{
  "id": "unique-match-id",
  "status": "confirmed",
  "matchday": 1,
  "playedAt": null,
  "sources": [{"path": "data/screenshots/source.png", "sha256": "actual-file-hash"}],
  "players": [
    {"name": "scheduled-player-a", "legsWon": 7, "stats": {"average": 52.2, "checkoutAttempts": 35, "checkoutPct": 20}},
    {"name": "scheduled-player-b", "legsWon": 3, "stats": {"average": null}}
  ]
}
```

All stats are optional; missing values stay blank. Game-Ø is the arithmetic
mean of the recorded match averages. Checkout rate is won legs divided by
reported attempts, weighted by attempts. Rates with missing attempt counts
are preserved in the source but excluded from aggregate checkout rate.
Scoring, high scores and checkout records are never inferred from absent data.
The optional weighted 3-dart average needs dart counts for every contributing
match. Leaderboards exclude unavailable values and share ranks on ties.
Statistic deep links preserve scope, category and leaderboard metric.
