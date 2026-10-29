# Champions-League-Spielplan

Public, static German-language match-plan website for 16 players in four pots.

Website: https://basthel.github.io/champions-league-spielplan/

Arena is the selected design, with Club-style side-by-side match boxes.
Tabs: Tabelle (default), Spieltage, Spielplan, Statistik, Lostöpfe.
Standings and statistics are generated from screenshot-backed match results.
The four initial screenshots are archived as user-confirmed examples; they
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

## Installable app (PWA)

The HTTPS GitHub Pages site includes a web app manifest with project-relative
identity, start URL and scope, standalone display, PNG launcher icons and a
maskable icon. iPhone home-screen metadata and a 180px Apple icon are included.

- Android Chrome: use the browser menu's install action, or the footer's
  **App installieren** button when Chrome offers an install prompt.
- iPhone Safari: Share → Add to Home Screen; leave **Open as Web App** enabled.
- Installation is completed by the user through their browser; no app store is
  involved. Browser-specific prompt availability is controlled by the browser.

After the first successful visit, a service worker caches the app shell,
scripts, styles, logo, fixture/results data and text download. Network-first
requests keep online users current and fall back to cached content when the
network fails (after at most four seconds). Offline deep links preserve selected
players, matchdays and statistic filters. Google Fonts retains system fallbacks.
Original screenshot evidence is not bulk-downloaded for offline use.

The worker is scoped to this project's directory and never clears another app's
caches. Its canonical cache keys ignore query-string version tags so cached
scripts also work for offline deep links. It does not intercept external sites.

When adding a new essential file, add it to `CORE_FILES` in `service-worker.js`
and bump `CACHE_NAME`'s version. Normal changes to existing files and results use
network-first refresh automatically. Keep `manifest.webmanifest` and the icons
in the repository; do not change the manifest's app ID on routine updates.

Additional checks (Node 20+):
```sh
node --test tests/pwa.test.cjs
node --check service-worker.js
node --check pwa.js
```

Browser verification includes a subdirectory deployment matching GitHub Pages,
worker activation, cached player/fixture/data loading after stopping the local
server, and returning to online network-first requests. Actual installation
confirmation remains on the user's phone.

## Hidden Dart Scorer preview

Open `scorer.html`, or expand **Regeln & Auslosung** in the league footer and
follow **Dart Scorer · Vorschau**. The five league tabs stay unchanged. This is
an unlisted preview with `noindex`; anyone with the URL can open it.

The scorer runs entirely in the browser, with no account, API, or backend:

- X01 (101/301/501/701/1001), 1–4 players with league-name suggestions, optional
  computer opponents at three strengths, reorder and random starting order.
  Remove players down to one for solo practice, or clear the list and add yourself.
  Solo play advances directly to your next visit, with the same saved statistics.
  Choose **Anwurf** after bulling up, independently of the name order, or select
  a random starter. Subsequent leg starters rotate from that selected player.
  The choice is preserved when renaming, reordering, shuffling or resuming a game.
- Straight/Double In; Straight/Double/Master Out; First to or Best of legs and
  sets. Best of supports solo practice or two players; multiple sets require odd Best of counts.
  The league preset is 501, Double Out, Best of 12 (first to seven, or 6:6).
- Dart-by-dart single/double/triple entry, bull, misses, bust handling, checkout
  suggestions, alternating leg starters, and undo across leg/set boundaries.
  Leg/set/match checkouts open an overlay with an explicit continue action and
  **Zurück / korrigieren** to undo an accidental checkout; reloading restores it.
  Undo after a computer turn also rewinds its automatic darts to the last human
  input. The computer pauses when leaving the scoring view or hiding the tab.
- Saved running/completed games, leg overview, visit history, comparative
  statistics with category filters, deletion, and per-game JSON export.
- **Teilen** in the final-game overlay and summary shares the same JSON file
  through the phone's native share menu. Select WhatsApp and the recipient there;
  the scorer does not select an app or send messages automatically. File sharing
  requires HTTPS and support for JSON attachments on the device. If unavailable
  (including the LAN HTTP preview), the file downloads with instructions for
  attaching it manually. Cancelling the share menu does not download a file.

Each dart is saved in `localStorage` under `haumdaucher-scorer-v1`. Reloading
replays the event log, including partial visits. Open **Alle Spiele** to resume.
Storage failure displays a warning and preserves the game in memory for export.
Concurrent changes from another tab pause edits and offer a reload. Browser
storage is specific to that browser, device and origin; clearing it removes
saved games. JSON exports are readable backups, with no import UI at present.
Scorer matches never write to canonical league results or the fixture draw.

Statistics use credited points and standard statistical dart counts: a bust
zeros its entire visit and counts three darts; a checkout or current partial
visit counts only the darts entered. First-nine and dart-position scoring use
zero points for the unused darts of a busted visit. Actual entered dart records
remain unchanged; field hit rates and checkout opportunities use only those
records. JSON exports retain both `darts` (statistical) and `recordedDarts`
(entered). Existing saved matches recalculate from their original event logs.
See [statistics verification](docs/scorer-statistics.md).
Checkout opportunities count darts with a valid one-dart finish
available before the throw, not inferred attempts at a particular double.
High-round buckets are disjoint: 60–99, 100–139, 140–179, and 180. The in-app
calculation note explains these conventions. Screenshot references from
2026-10-29 are archived as examples, separate from league results.

The service worker caches the scorer shell, styles and scripts for offline play
after the app has loaded successfully online.

Double Out checkout hints use the researched, offline `checkout-data.js` lookup
for 2–170, with separate recommendations for one, two or three darts remaining.
The computer opponent uses the same table. See [sources and route choices](docs/checkout-routes.md).
Straight Out and Master Out retain their mathematical search.

Validate scoring, checkout routes, JSON sharing, and PWA behavior:

```sh
node --test tests/*.test.cjs
node --check scorer.js
node --check scorer-engine.js
node --check scorer-share.js
```
