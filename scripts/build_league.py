#!/usr/bin/env python3
"""Validate screenshot-backed league results and build standings/statistics exports."""
import argparse
from copy import deepcopy
from datetime import date
import hashlib
import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
RULES = {'maxLegs': 12, 'winPoints': 2, 'drawPoints': 1, 'lossPoints': 0,
         'ranking': ['points', 'legDifference', 'legsWon'], 'format': 'best-of-12'}
COUNTS = {'dartsThrown', 'scores60', 'scores100', 'scores140', 'scores180', 'checkoutAttempts'}
PERCENTAGES = {'checkoutPct', 'hit20Pct', 'hit20or19Pct', 'hit60Pct', 'hit60or57Pct'}
AVERAGES = {'average', 'first9Average', 'bestLegAverage'}
METRICS = COUNTS | PERCENTAGES | AVERAGES | {'highestVisit', 'highestCheckout', 'bestLegDarts'}


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def source_path(root, path):
    if not isinstance(path, str) or not path.startswith('data/screenshots/'):
        raise ValueError('Sources must be stored in data/screenshots/.')
    result = (root / path).resolve()
    if not result.is_relative_to((root / 'data/screenshots').resolve()) or not result.is_file():
        raise ValueError(f'Missing or invalid source image: {path}')
    return result


def validate_source(source, root):
    if not isinstance(source, dict):
        raise ValueError('Each source needs a path and sha256.')
    path = source_path(root, source.get('path'))
    if hashlib.sha256(path.read_bytes()).hexdigest() != source.get('sha256'):
        raise ValueError(f'Source checksum mismatch: {source["path"]}')


def validate_archive(root):
    manifest = read(root / 'data/sources.json')
    if manifest.get('schemaVersion') != 1 or not isinstance(manifest.get('sources'), list):
        raise ValueError('Invalid source manifest.')
    seen = set()
    for item in manifest['sources']:
        validate_source(item, root)
        if item['path'] in seen:
            raise ValueError('Duplicate archived source.')
        seen.add(item['path'])
        extraction_path = (root / item['extraction']).resolve()
        if not extraction_path.is_relative_to((root / 'data/extractions').resolve()):
            raise ValueError('Extraction must be in data/extractions/.')
        extraction = read(extraction_path)
        if extraction.get('schemaVersion') != 1 or extraction.get('status') not in ('pending', 'example', 'confirmed'):
            raise ValueError('Extraction needs a review status.')
        if any(extraction['source'].get(k) != item[k] for k in ('path', 'sha256')):
            raise ValueError('Extraction and source manifest disagree.')


def validate(data, schedule, root):
    if data.get('schemaVersion') != 1 or data.get('rules') != RULES or not isinstance(data.get('matches'), list):
        raise ValueError('Invalid results schema or league rules.')
    roster = {p['name'] for p in schedule['players']}
    fixtures = {frozenset(pair): day['matchday']
                for day in schedule['rounds'] for pair in day['matches']}
    seen, ids, sources = set(), set(), set()
    for match in data['matches']:
        if not isinstance(match, dict) or match.get('status') != 'confirmed':
            raise ValueError('Only confirmed matches may enter league results.')
        if not isinstance(match.get('id'), str) or not match['id'].strip() or match['id'] in ids:
            raise ValueError('Every match needs a unique nonempty ID.')
        ids.add(match['id'])
        sides = match.get('players')
        if not isinstance(sides, list) or len(sides) != 2 or any(not isinstance(p, dict) for p in sides):
            raise ValueError('A result needs two player records.')
        names = [p.get('name') for p in sides]
        if any(not isinstance(n, str) or n not in roster for n in names) or names[0] == names[1]:
            raise ValueError('Unknown or duplicate player.')
        key = frozenset(names)
        if key not in fixtures or type(match.get('matchday')) is not int or fixtures[key] != match['matchday']:
            raise ValueError(f'No matching scheduled fixture: {names}.')
        if key in seen:
            raise ValueError(f'Duplicate result for {names}.')
        seen.add(key)
        legs = [p.get('legsWon') for p in sides]
        if any(type(x) is not int or x < 0 for x in legs):
            raise ValueError('Leg scores must be nonnegative integers.')
        if not (legs == [6, 6] or (max(legs) == 7 and min(legs) <= 5)):
            raise ValueError('Completed best-of-12 score must be 7:0–7:5 or 6:6.')
        if match.get('playedAt') is not None:
            date.fromisoformat(match['playedAt'])
        if not isinstance(match.get('sources'), list) or not match['sources']:
            raise ValueError('A confirmed result requires source images.')
        for source in match['sources']:
            validate_source(source, root)
            if source['sha256'] in sources:
                raise ValueError('A screenshot cannot count towards two separate matches.')
            sources.add(source['sha256'])
        for p in sides:
            stats = p.get('stats', {})
            if not isinstance(stats, dict) or set(stats) - METRICS:
                raise ValueError('Unknown statistic field.')
            for field, value in stats.items():
                if value is None:
                    continue
                if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
                    raise ValueError(f'Invalid value for {field}.')
                if field in COUNTS and type(value) is not int:
                    raise ValueError(f'{field} must be an integer.')
                maximum = 100 if field in PERCENTAGES else 170 if field == 'highestCheckout' else 180 if field in AVERAGES or field == 'highestVisit' else None
                if maximum is not None and value > maximum:
                    raise ValueError(f'{field} is above {maximum}.')
                if field == 'bestLegDarts' and (type(value) is not int or (value != 0 and value < 9)):
                    raise ValueError('Best leg must be at least nine darts or zero when absent.')
            attempts = stats.get('checkoutAttempts')
            if attempts is not None and (attempts < p['legsWon'] or (p['legsWon'] > 0 and attempts == 0)):
                raise ValueError('Checkout attempts cannot be lower than successful checkouts.')
            pct = stats.get('checkoutPct')
            if attempts and pct is not None and abs(pct - 100 * p['legsWon'] / attempts) > .02:
                raise ValueError('Checkout percentage disagrees with legs and attempts.')
    return data


def mean(values):
    values = [v for v in values if v is not None]
    return round(sum(values) / len(values), 4) if values else None


def metric_sum(records, field):
    vals = [r['stats'].get(field) for r in records if r['stats'].get(field) is not None]
    return sum(vals) if vals else None


def extreme(records, field, minimum=False):
    values = [r['stats'].get(field) for r in records if r['stats'].get(field) is not None]
    if minimum:
        values = [v for v in values if v > 0]
    return (min(values) if minimum else max(values)) if values else None


def aggregate(records):
    attempted = [r for r in records if r['stats'].get('checkoutAttempts') is not None]
    attempts = sum(r['stats']['checkoutAttempts'] for r in attempted)
    successes = sum(r['legsWon'] for r in attempted)
    avg_records = [r for r in records if r['stats'].get('average') is not None]
    # Do not mix weighted and unweighted means when any dart count is missing.
    weighted = (sum(r['stats']['average'] * r['stats']['dartsThrown'] for r in avg_records) /
                sum(r['stats']['dartsThrown'] for r in avg_records)
                if avg_records and all(r['stats'].get('dartsThrown', 0) for r in avg_records) else None)
    result = {
        'appearances': len(records),
        'played': len({r['matchId'] for r in records}),
        'wins': sum(r['legsWon'] > r['legsLost'] for r in records),
        'draws': sum(r['legsWon'] == r['legsLost'] for r in records),
        'losses': sum(r['legsWon'] < r['legsLost'] for r in records),
        'points': sum(2 if r['legsWon'] > r['legsLost'] else 1 if r['legsWon'] == r['legsLost'] else 0 for r in records),
        'legsWon': sum(r['legsWon'] for r in records), 'legsLost': sum(r['legsLost'] for r in records),
        'average': mean([r['stats'].get('average') for r in records]),
        'weightedAverage': round(weighted, 4) if weighted is not None else None,
        'first9Average': mean([r['stats'].get('first9Average') for r in records]),
        'checkoutPct': round(100 * successes / attempts, 4) if attempts else None,
        'checkoutAttempts': attempts if attempted else None,
        'bestLegDarts': extreme(records, 'bestLegDarts', True),
        'highestCheckout': extreme(records, 'highestCheckout'),
        'highestVisit': extreme(records, 'highestVisit'),
        'bestLegAverage': extreme(records, 'bestLegAverage'),
        'coverage': {field: sum(r['stats'].get(field) is not None for r in records) for field in sorted(METRICS)},
    }
    for field in sorted(COUNTS - {'checkoutAttempts'}):
        result[field] = metric_sum(records, field)
    for field in sorted(PERCENTAGES - {'checkoutPct'}):
        result[field] = mean([r['stats'].get(field) for r in records])
    result['legDifference'] = result['legsWon'] - result['legsLost']
    result['winPct'] = round(100 * result['wins'] / len(records), 4) if records else None
    return result


def build(data, schedule):
    roster = schedule['players']
    pots = {p['name']: p['pot'] for p in roster}
    records = []
    matches = sorted(data['matches'], key=lambda m: (m['matchday'], m['id']))
    for match in matches:
        for i, p in enumerate(match['players']):
            records.append(dict(p, stats=p.get('stats', {}), legsLost=match['players'][1-i]['legsWon'],
                                matchId=match['id'], matchday=match['matchday'], pot=pots[p['name']]))
    rows = [dict(p, **aggregate([r for r in records if r['name'] == p['name']])) for p in roster]
    rows.sort(key=lambda p: (-p['points'], -p['legDifference'], -p['legsWon'], p['name'].casefold()))
    last_score, rank = None, None
    for index, row in enumerate(rows, 1):
        score = tuple(row[field] for field in RULES['ranking'])
        if score != last_score:
            rank = index
        row['rank'] = rank if matches else None
        last_score = score
    scopes = {'overall': aggregate(records)}
    for pot in range(1, 5):
        scopes[f'pot-{pot}'] = aggregate([r for r in records if r['pot'] == pot])
    for p in roster:
        scopes['player:' + p['name']] = aggregate([r for r in records if r['name'] == p['name']])
    return {'schemaVersion': 1, 'rules': data['rules'], 'totalFixtures': sum(len(d['matches']) for d in schedule['rounds']),
            'recordedMatches': len(matches), 'standings': rows, 'scopes': scopes, 'matches': matches}


def exports(data, schedule):
    result = build(data, schedule)
    encoded = json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False)
    return {'league-data.json': encoded + '\n',
            'league-data.js': "// Generated by scripts/build_league.py. Do not edit.\n'use strict';\nconst leagueData = " + encoded + ';\n'}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--import-result', type=Path, metavar='JSON', help='Add a visually reviewed confirmed result.')
    parser.add_argument('--replace', action='store_true', help='Explicitly replace an existing result with the same ID.')
    args = parser.parse_args(argv)
    try:
        schedule = read(ROOT / 'schedule.json')
        data = read(ROOT / 'data/results.json')
        validate_archive(ROOT)
        if args.replace and not args.import_result:
            raise ValueError('--replace requires --import-result.')
        if args.import_result:
            result = read(args.import_result)
            previous = next((m for m in data['matches'] if m['id'] == result.get('id')), None)
            if previous:
                if not args.replace:
                    raise ValueError('Result ID already exists. Use --replace for a deliberate correction.')
                data['matches'].remove(previous)
            data['matches'].append(result)
        validate(data, schedule, ROOT)
        outputs = exports(data, schedule)
        if args.check:
            for name, content in outputs.items():
                if (ROOT / name).read_text(encoding='utf-8') != content:
                    raise ValueError(f'{name} is out of sync.')
        else:
            # All validation completes before the canonical data or exports are changed.
            if args.import_result:
                (ROOT / 'data/results.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            for name, content in outputs.items():
                (ROOT / name).write_text(content, encoding='utf-8')
        print(f"Validated {len(data['matches'])} league results; standings and statistics are in sync.")
        return 0
    except (OSError, ValueError, TypeError, KeyError) as error:
        print(f'Invalid league data: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
