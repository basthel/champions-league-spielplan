# Champions-League-Spielplan

Public, static German-language match-plan website for 16 players in four pots.

Website: https://basthel.github.io/champions-league-spielplan/

The matchday view shows all eight fixtures for a selected day. Use its dropdown
or previous/next buttons; direct links look like `?spieltag=4#spieltage`.
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
