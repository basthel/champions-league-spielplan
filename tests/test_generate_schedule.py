import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from scripts.generate_schedule import DEFAULT_SEED, POTS, exports, generate, personal_plans, validate


class ScheduleTests(unittest.TestCase):
    def test_100_seeds_satisfy_all_rules(self):
        for seed in range(100):
            with self.subTest(seed=seed):
                schedule = generate(seed)
                self.assertEqual(validate(schedule)['matches'], 64)
                plans = {p['name']: p for p in personal_plans(schedule)}
                for player in plans.values():
                    self.assertEqual(len(set(player['opponents'])), 8)
                    self.assertNotIn(player['name'], player['opponents'])
                    self.assertEqual([sum(plans[n]['pot'] == pot for n in player['opponents'])
                                      for pot in range(1, 5)], [2, 2, 2, 2])
                    for day, name in enumerate(player['opponents']):
                        self.assertEqual(plans[name]['opponents'][day], player['name'])

    def test_seed_is_reproducible_and_changes_draw(self):
        self.assertEqual(exports(generate(42)), exports(generate(42)))
        self.assertNotEqual(generate(42)['rounds'], generate(43)['rounds'])

    def test_original_pot_assignments_are_preserved(self):
        original = json.loads((Path(__file__).resolve().parents[1] / 'data/original-draw.json').read_text())
        self.assertEqual([(p['name'], p['pot']) for p in original['players']],
                         [(p['name'], p['pot']) for p in generate(1)['players']])
        self.assertTrue(any([sum(next(q['pot'] for q in original['players'] if q['name'] == n) == pot
                                 for n in p['opponents']) for pot in range(1, 5)] != [2, 2, 2, 2]
                            for p in original['players']))

    def test_duplicate_match_rejected(self):
        schedule = generate(1)
        schedule['rounds'][1]['matches'] = copy.deepcopy(schedule['rounds'][0]['matches'])
        with self.assertRaisesRegex(ValueError, 'Repeated match'):
            validate(schedule)

    def test_missing_player_unknown_player_and_self_match_rejected(self):
        original = generate(1)
        for name, message in [('Unknown', 'unknown player'),
                              (original['rounds'][0]['matches'][0][0], 'cannot play themselves'),
                              (original['rounds'][0]['matches'][1][0], 'exactly once')]:
            with self.subTest(name=name):
                schedule = copy.deepcopy(original)
                schedule['rounds'][0]['matches'][0][1] = name
                with self.assertRaisesRegex(ValueError, message):
                    validate(schedule)

    def test_valid_round_robin_with_wrong_pot_distribution_rejected(self):
        schedule = generate(1)
        ring = [name for pot in POTS for name in pot]
        for round_ in schedule['rounds']:
            round_['matches'] = [[ring[i], ring[-i - 1]] for i in range(8)]
            ring = [ring[0], ring[-1], *ring[1:-1]]
        with self.assertRaisesRegex(ValueError, 'opponent counts by pot'):
            validate(schedule)

    def test_invalid_roster_and_matchday_rejected(self):
        for mutate in (lambda s: s['players'][0].update(pot=2),
                       lambda s: s['players'][0].update(name=s['players'][1]['name']),
                       lambda s: s['rounds'][0].update(matchday=8),
                       lambda s: s['rounds'][0]['matches'].pop()):
            schedule = generate(1)
            mutate(schedule)
            with self.assertRaises(ValueError):
                validate(schedule)

    def test_cli_exports_check_and_stale_export_failure(self):
        script = Path(__file__).resolve().parents[1] / 'scripts/generate_schedule.py'
        with tempfile.TemporaryDirectory() as directory:
            base = [sys.executable, str(script), '--output-dir', directory]
            result = subprocess.run(base + ['--seed', str(DEFAULT_SEED)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            before = {p.name: p.read_bytes() for p in Path(directory).iterdir()}
            result = subprocess.run(base + ['--check'], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(before, {p.name: p.read_bytes() for p in Path(directory).iterdir()})
            (Path(directory) / 'schedule-data.js').write_text('stale')
            result = subprocess.run(base + ['--check'], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('out of sync', result.stderr)


if __name__ == '__main__':
    unittest.main()
