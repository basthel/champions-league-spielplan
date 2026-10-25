# Champions-League-Spielplan

Public, static German-language match-plan website for 16 players in four pots.

The opponent lists in `app.js` reproduce the organizer's supplied draw without corrections. They are **an unverified draft**, not a validated reciprocal fixture schedule. Kaiser (formerly 5er Korbi) and 5er are separate participants.

Open `index.html` through any static server, for example:

```sh
python3 -m http.server 8092
```

No build or dependencies are required. GitHub Pages serves the repository root on `main`. Fonts use Google Fonts with local system fallbacks. Player links use `?spieler=abi#spielplan`; no server-side routes are required.

To update the draw, edit the player records in `app.js` and keep the downloadable `spielplaene.txt` in sync. Do not remove the draft notice until the complete draw has been confirmed.
