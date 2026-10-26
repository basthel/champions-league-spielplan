"""Regression checks for scoring, missing data, duplicates and aggregation."""
from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import shutil
from unittest.mock import patch
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('build_league', ROOT / 'scripts/build_league.py')
league = importlib.util.module_from_spec(spec)
spec.loader.exec_module(league)


class LeagueTests(unittest.TestCase):
    def setUp(self):
        self.schedule = league.read(ROOT / 'schedule.json')
        self.data = {'schemaVersion': 1, 'rules': deepcopy(league.RULES), 'matches': []}
        self.source = league.read(ROOT / 'data/sources.json')['sources'][0]

    def match(self, fixture=0, legs=(7, 3), stats=None, source=None):
        pair = self.schedule['rounds'][0]['matches'][fixture]
        return {'id': f'match-1-{fixture}', 'status': 'confirmed', 'matchday': 1,
                'sources': [{k: (source or self.source)[k] for k in ('path', 'sha256')}],
                'players': [{'name': name, 'legsWon': legs[i], 'stats': (stats or [{}, {}])[i]}
                            for i, name in enumerate(pair)]}

    def test_win_and_loss_points_and_legs(self):
        match = self.match()
        self.data['matches'] = [match]
        league.validate(self.data, self.schedule, ROOT)
        output = league.build(self.data, self.schedule)
        rows = {p['name']: p for p in output['standings']}
        a, b = [p['name'] for p in match['players']]
        self.assertEqual((rows[a]['points'], rows[a]['played'], rows[a]['wins']), (2, 1, 1))
        self.assertEqual((rows[b]['points'], rows[b]['losses']), (0, 1))
        self.assertEqual((rows[a]['legsWon'], rows[a]['legsLost'], rows[b]['legDifference']), (7, 3, -4))
        self.assertEqual(output['scopes']['overall']['played'], 1)

    def test_draw_awards_one_each_and_shared_rank(self):
        self.data['matches'] = [self.match(legs=(6, 6))]
        league.validate(self.data, self.schedule, ROOT)
        output = league.build(self.data, self.schedule)
        leaders = output['standings'][:2]
        self.assertEqual([p['points'] for p in leaders], [1, 1])
        self.assertEqual([p['rank'] for p in leaders], [1, 1])
        self.assertEqual([p['draws'] for p in leaders], [1, 1])

    def test_only_completed_best_of_twelve_scores(self):
        for legs in ((6, 2), (0, 0), (7, 6), (8, 4), (6, 5), (True, 6), (-1, 7)):
            with self.subTest(legs=legs), self.assertRaises(ValueError):
                self.data['matches'] = [self.match(legs=legs)]
                league.validate(self.data, self.schedule, ROOT)
        for legs in ((7, 0), (0, 7), (7, 5), (5, 7), (6, 6)):
            self.data['matches'] = [self.match(legs=legs)]
            league.validate(self.data, self.schedule, ROOT)

    def test_duplicate_reversed_pair_and_wrong_matchday_rejected(self):
        match = self.match()
        second = deepcopy(match)
        second['id'] = 'other'
        second['players'].reverse()
        self.data['matches'] = [match, second]
        with self.assertRaises(ValueError):
            league.validate(self.data, self.schedule, ROOT)
        match['matchday'] = 2
        self.data['matches'] = [match]
        with self.assertRaises(ValueError):
            league.validate(self.data, self.schedule, ROOT)

    def test_pending_result_or_missing_source_rejected(self):
        self.data['matches'] = [self.match()]
        self.data['matches'][0]['status'] = 'pending'
        with self.assertRaises(ValueError):
            league.validate(self.data, self.schedule, ROOT)
        self.data['matches'][0]['status'] = 'confirmed'
        self.data['matches'][0]['sources'] = []
        with self.assertRaises(ValueError):
            league.validate(self.data, self.schedule, ROOT)

    def test_source_integrity_and_reuse(self):
        match = self.match()
        match['sources'][0]['sha256'] = 'bad'
        self.data['matches'] = [match]
        with self.assertRaises(ValueError):
            league.validate(self.data, self.schedule, ROOT)
        self.data['matches'] = [self.match(), self.match(fixture=1)]
        with self.assertRaises(ValueError):
            league.validate(self.data, self.schedule, ROOT)

    def test_checkout_ratio_uses_counts_not_mean_percentages(self):
        records = [
            {'matchId': 'a', 'legsWon': 7, 'legsLost': 3, 'stats': {'checkoutAttempts': 10, 'checkoutPct': 70}},
            {'matchId': 'b', 'legsWon': 7, 'legsLost': 4, 'stats': {'checkoutAttempts': 100, 'checkoutPct': 7}}]
        self.assertAlmostEqual(league.aggregate(records)['checkoutPct'], 100 * 14 / 110, places=4)

    def test_game_average_and_dart_weighted_average_differ(self):
        records = [
            {'matchId': 'a', 'legsWon': 7, 'legsLost': 3, 'stats': {'average': 60, 'dartsThrown': 100}},
            {'matchId': 'b', 'legsWon': 7, 'legsLost': 4, 'stats': {'average': 40, 'dartsThrown': 300}}]
        result = league.aggregate(records)
        self.assertEqual(result['average'], 50)
        self.assertEqual(result['weightedAverage'], 45)
        records[1]['stats'].pop('dartsThrown')
        self.assertIsNone(league.aggregate(records)['weightedAverage'])

    def test_unknown_values_are_not_zeros(self):
        records = [{'matchId': 'a', 'legsWon': 0, 'legsLost': 7, 'stats': {}}]
        result = league.aggregate(records)
        for field in ('average', 'checkoutPct', 'scores180', 'bestLegDarts', 'highestCheckout'):
            self.assertIsNone(result[field])
        records[0]['stats'] = {'average': 0, 'scores180': 0, 'highestCheckout': 0, 'bestLegDarts': 0, 'checkoutAttempts': 3}
        result = league.aggregate(records)
        self.assertEqual(result['scores180'], 0)
        self.assertEqual(result['checkoutPct'], 0)
        self.assertEqual(result['coverage']['checkoutPct'], 1)
        self.assertIsNone(result['bestLegDarts'])

    def test_invalid_stats_and_checkout_disagreement(self):
        for stats in ({'average': float('nan')}, {'average': 181}, {'checkoutAttempts': 1},
                      {'checkoutAttempts': 10, 'checkoutPct': 20}, {'unknown': 1}):
            self.data['matches'] = [self.match(stats=[stats, {}])]
            with self.subTest(stats=stats), self.assertRaises(ValueError):
                league.validate(self.data, self.schedule, ROOT)

    def test_pot_filter_and_missing_data_coverage(self):
        match = self.match(stats=[{'average': 52}, {}])
        self.data['matches'] = [match]
        output = league.build(self.data, self.schedule)
        pot = next(p['pot'] for p in self.schedule['players'] if p['name'] == match['players'][0]['name'])
        stats = output['scopes'][f'pot-{pot}']
        self.assertEqual(stats['played'], 1)
        self.assertEqual(stats['average'], 52)
        self.assertEqual(output['scopes']['overall']['coverage']['average'], 1)

    def test_cli_import_duplicate_and_explicit_correction(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            shutil.copytree(ROOT / 'data', root / 'data')
            shutil.copyfile(ROOT / 'schedule.json', root / 'schedule.json')
            (root / 'data/results.json').write_text(json.dumps(self.data))
            result = root / 'incoming.json'
            result.write_text(json.dumps(self.match()))
            with patch.object(league, 'ROOT', root):
                self.assertEqual(league.main(['--import-result', str(result)]), 0)
                self.assertEqual(league.main(['--check']), 0)
                before = (root / 'data/results.json').read_bytes()
                self.assertEqual(league.main(['--import-result', str(result)]), 1)
                self.assertEqual((root / 'data/results.json').read_bytes(), before)
                correction = self.match(legs=(6, 6))
                result.write_text(json.dumps(correction))
                self.assertEqual(league.main(['--import-result', str(result), '--replace']), 0)
                self.assertEqual(len(league.read(root / 'data/results.json')['matches']), 1)
                self.assertEqual(league.main(['--check']), 0)

    def test_empty_standings_exports_reproducible_and_archive_valid(self):
        output = league.build(self.data, self.schedule)
        self.assertEqual(len(output['standings']), 16)
        self.assertTrue(all(p['rank'] is None and p['points'] == 0 for p in output['standings']))
        self.assertEqual(league.exports(self.data, self.schedule), league.exports(self.data, self.schedule))
        league.validate_archive(ROOT)


if __name__ == '__main__':
    unittest.main()
