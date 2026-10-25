#!/usr/bin/env python3
"""Generate a reproducible 16-player draw and validate it before writing exports.

Run from any directory; output defaults to the website repository root.
Requires Python 3.9+ and only the standard library.
"""

import argparse
from collections import Counter
import json
from pathlib import Path
import random
import sys


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SEED = 20261025
POTS = (
    ('Abi', 'Tom', 'Anderl', 'Hirschi'),
    ('Bastl', 'Bachi', 'Hauslon', 'Schipfei'),
    ('Hellei', 'Ginzei', 'Moser', 'Hofer Flo'),
    ('More', 'Kaiser', 'Mäcci', '5er'),
)


def generate(seed):
    """Construct eight perfect matchings with exactly two opponents per pot.

    Two rounds pair players inside their own pot. For every pair of different
    pots, two distinct cyclic shifts give each player two distinct opponents.
    Complementary pot pairs run together, so all 16 players play each round.
    Shuffle the names, shifts, match order and round order using a local RNG.
    No search, retries, solver dependency or possibility of a partial schedule.
    """
    rng = random.Random(seed)
    pots = [list(pot) for pot in POTS]
    for pot in pots:
        rng.shuffle(pot)

    rounds = []
    for pairing in (((0, 1), (2, 3)), ((0, 2), (1, 3))):
        rounds.append([[pot[a], pot[b]] for pot in pots for a, b in pairing])

    for pot_pairs in (((0, 1), (2, 3)), ((0, 2), (1, 3)), ((0, 3), (1, 2))):
        shifts = [rng.sample(range(4), 2) for _ in pot_pairs]
        for repeat in range(2):
            matches = []
            for (a, b), offsets in zip(pot_pairs, shifts):
                matches.extend([pots[a][i], pots[b][(i + offsets[repeat]) % 4]]
                               for i in range(4))
            rounds.append(matches)

    rng.shuffle(rounds)
    for matches in rounds:
        rng.shuffle(matches)
    result = {
        'schemaVersion': 1,
        'seed': seed,
        'players': [{'name': name, 'pot': pot}
                    for pot, names in enumerate(POTS, 1) for name in names],
        'rounds': [{'matchday': day, 'matches': matches}
                   for day, matches in enumerate(rounds, 1)],
    }
    validate(result)
    return result


def validate(schedule):
    """Check actual fixtures independently of the construction algorithm.

    Raise ValueError on invalid data. Each match is recorded once; both personal
    opponent lists are derived from that same pair when exporting.
    """
    if not isinstance(schedule, dict) or schedule.get('schemaVersion') != 1:
        raise ValueError('Expected a schedule with schemaVersion 1.')
    if type(schedule.get('seed')) is not int:
        raise ValueError('The seed must be an integer.')
    roster = schedule.get('players')
    if not isinstance(roster, list) or len(roster) != 16:
        raise ValueError('Expected exactly 16 players.')
    if any(not isinstance(p, dict) or not isinstance(p.get('name'), str)
           or not p['name'].strip() or type(p.get('pot')) is not int
           for p in roster):
        raise ValueError('Every player needs a nonempty name and an integer pot.')
    pots = {p['name']: p['pot'] for p in roster}
    if len(pots) != 16:
        raise ValueError('Player names must be unique.')
    if Counter(pots.values()) != Counter({1: 4, 2: 4, 3: 4, 4: 4}):
        raise ValueError('Expected four players in each of pots 1, 2, 3 and 4.')
    rounds = schedule.get('rounds')
    if not isinstance(rounds, list) or len(rounds) != 8:
        raise ValueError('Expected exactly eight matchdays.')

    seen_pairs = set()
    opponent_pots = {name: Counter() for name in pots}
    for day, round_ in enumerate(rounds, 1):
        if not isinstance(round_, dict) or round_.get('matchday') != day:
            raise ValueError('Matchdays must be ordered and numbered 1–8.')
        matches = round_.get('matches')
        if not isinstance(matches, list) or len(matches) != 8:
            raise ValueError(f'Matchday {day}: expected eight matches.')
        appearances = Counter()
        for pair in matches:
            if not isinstance(pair, list) or len(pair) != 2:
                raise ValueError(f'Matchday {day}: every match needs two players.')
            if any(not isinstance(name, str) or name not in pots for name in pair):
                raise ValueError(f'Matchday {day}: unknown player in {pair!r}.')
            a, b = pair
            if a == b:
                raise ValueError(f'Matchday {day}: {a} cannot play themselves.')
            appearances.update(pair)
            key = frozenset(pair)
            if key in seen_pairs:
                raise ValueError(f'Repeated match: {a} vs. {b}.')
            seen_pairs.add(key)
            opponent_pots[a][pots[b]] += 1
            opponent_pots[b][pots[a]] += 1
        if appearances != Counter({name: 1 for name in pots}):
            raise ValueError(f'Matchday {day}: every player must play exactly once.')

    for name, counts in opponent_pots.items():
        if counts != Counter({1: 2, 2: 2, 3: 2, 4: 2}):
            actual = [counts[pot] for pot in range(1, 5)]
            raise ValueError(f'{name}: opponent counts by pot are {actual}, expected [2, 2, 2, 2].')
    return {'players': 16, 'matchdays': 8, 'matches': len(seen_pairs)}


def personal_plans(schedule):
    validate(schedule)
    opponents = {p['name']: [] for p in schedule['players']}
    for round_ in schedule['rounds']:
        for a, b in round_['matches']:
            opponents[a].append(b)
            opponents[b].append(a)
    return [dict(player, opponents=opponents[player['name']])
            for player in schedule['players']]


def exports(schedule):
    players = personal_plans(schedule)
    encode = lambda value: json.dumps(value, ensure_ascii=False, indent=2)
    javascript = ('// Generated by scripts/generate_schedule.py. Do not edit by hand.\n'
                  "'use strict';\n\nconst players = " + encode(players) + ';\n'
                  'const drawMetadata = ' + encode({'seed': schedule['seed']}) + ';\n'
                  'const matchdays = ' + encode(schedule['rounds']) + ';\n')
    lines = ['CHAMPIONS-LEAGUE-AUSLOSUNG – KORRIGIERT', 'AUTOMATISCH GEPRÜFTER SPIELPLAN',
             '', f"Auslosungs-Seed: {schedule['seed']}",
             'Neu erzeugte Auslosung; ersetzt den fehlerhaften ursprünglichen Entwurf.',
             '16 Spieler, 8 Spieltage, 64 unterschiedliche Begegnungen.',
             'Jeder Spieler: genau 2 Gegner aus jedem der 4 Lostöpfe.',
             'Jeder Spieler tritt pro Spieltag genau einmal an.',
             'Kaiser (vormals 5er Korbi) und 5er sind getrennte Spieler.',
             'Die Reihenfolge der Namen legt kein Heimrecht fest.',
             'Es sind noch keine Termine festgelegt.']
    for pot in range(1, 5):
        lines += ['', f'LOSTOPF {pot}']
        for player in players:
            if player['pot'] == pot:
                lines += ['', player['name']] + [
                    f'Spieltag {day}: {name}'
                    for day, name in enumerate(player['opponents'], 1)]
    lines += ['', 'ALLE BEGEGNUNGEN NACH SPIELTAG']
    for round_ in schedule['rounds']:
        lines += ['', f"Spieltag {round_['matchday']}"]
        lines += [f'{a} – {b}' for a, b in round_['matches']]
    return {'schedule.json': encode(schedule) + '\n',
            'schedule-data.js': javascript, 'spielplaene.txt': '\n'.join(lines) + '\n'}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--seed', type=int, help=f'Random seed (default: {DEFAULT_SEED}).')
    mode.add_argument('--check', action='store_true', help='Validate existing schedule and all exports without writing.')
    mode.add_argument('--validate', type=Path, metavar='JSON', help='Validate a schedule JSON file without writing.')
    parser.add_argument('--output-dir', type=Path, default=ROOT, help='Output directory (default: repository root).')
    args = parser.parse_args(argv)
    try:
        if args.validate:
            schedule = json.loads(args.validate.read_text(encoding='utf-8'))
            validate(schedule)
        elif args.check:
            schedule = json.loads((args.output_dir / 'schedule.json').read_text(encoding='utf-8'))
            validate(schedule)
            for filename, expected in exports(schedule).items():
                if (args.output_dir / filename).read_text(encoding='utf-8') != expected:
                    raise ValueError(f'{filename} is out of sync. Regenerate the exports.')
        else:
            schedule = generate(DEFAULT_SEED if args.seed is None else args.seed)
            # Validation and serialization finish before any files are written.
            files = exports(schedule)
            args.output_dir.mkdir(parents=True, exist_ok=True)
            for filename, content in files.items():
                (args.output_dir / filename).write_text(content, encoding='utf-8')
        print(f"Valid draw (seed {schedule['seed']}): 16 players, 8 matchdays, 64 matches; "
              'exactly two opponents from every pot, no repeats, one match per player per day.')
        return 0
    except (OSError, ValueError, TypeError) as error:
        print(f'Invalid schedule: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
