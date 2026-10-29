const {test} = require('node:test');
const assert = require('node:assert/strict');
const E = require('../scorer-engine.js');
const dart = (field, multiplier = 1) => ({type: 'dart', field, multiplier});
const miss = dart(0), t20 = dart(20, 3), next = {type: 'next'};
const base = {players: [{name: 'A'}, {name: 'B'}], start: 501, in: 'straight', out: 'double', legs: 1, sets: 1, format: 'first'};
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message || ''}: ${actual} != ${expected}`);
// Hand-calculated examples. Each array is one visit by A; B misses between visits.
function alternate(visits, opponentStarts = false) {
  const events = opponentStarts ? [miss, miss, miss] : [];
  visits.forEach((visit, i) => { if (i) events.push(miss, miss, miss); events.push(...visit); });
  return events;
}
const nineDarter = [[t20, t20, t20], [t20, t20, t20], [t20, dart(19, 3), dart(12, 2)]];
const twentyDarter = [
  [t20, dart(20), dart(20)], [dart(20), dart(20), dart(20)],
  [dart(19), dart(19), dart(19)], [dart(20), dart(5), dart(1)],
  [t20, dart(20), dart(20)], [dart(20), dart(20), dart(18)], [t20, dart(20, 2)]
];

test('a nine-dart 501 has exactly two 180s and a 167 average', () => {
  const state = E.replay(base, alternate(nineDarter)), a = E.statistics(state, 0), b = E.statistics(state, 1);
  assert.equal(a.high180, 2); assert.equal(a.high140, 1); assert.equal(a.high100, 0); assert.equal(a.high60, 0);
  assert.equal(a.total, 501); assert.equal(a.darts, 9); assert.equal(a.average, 167); assert.equal(a.first9, 167);
  assert.equal(a.highestVisit, 180); assert.equal(a.highestCheckout, 141); assert.equal(a.minDarts, 9); assert.equal(a.bestLegAverage, 167);
  assert.deepEqual(a.positional, [180, 177, 144]); close(a.tripleRate, 800 / 9);
  assert.equal(a.checkoutAttempts, 1); assert.equal(a.checkoutRate, 100);
  assert.equal(a.legsWon, 1); assert.equal(a.legWinRate, 100); assert.equal(b.legsWon, 0);
  assert.equal(b.darts, 6); assert.equal(b.average, 0); assert.equal(b.high180, 0);
});

test('published 20-dart 501 example gives 75.15 and counts the two-dart finish correctly', () => {
  const a = E.statistics(E.replay(base, alternate(twentyDarter)), 0);
  assert.equal(a.total, 501); assert.equal(a.darts, 20); assert.equal(a.average, 75.15);
  close(a.first9, 217 / 3); assert.equal(a.minDarts, 20); assert.equal(a.highestCheckout, 100);
  assert.equal(a.high180, 0); assert.equal(a.high100, 3); assert.equal(a.high60, 1);
});

for (const [position, bust] of [[1, [t20]], [2, [dart(20), dart(20)]], [3, [dart(10), dart(10), dart(20)]]]) {
  test(`bust on dart ${position} counts three statistical darts, zero points and no invented hits`, () => {
    const config = {...base, start: 301};
    const visits = [[t20, t20, t20], [t20, dart(20), dart(1)], bust, [dart(20, 2)]];
    const state = E.replay(config, alternate(visits)), stats = E.statistics(state, 0);
    assert.equal(stats.total, 301); assert.equal(stats.darts, 10); assert.equal(stats.recordedDarts, 7 + position);
    close(stats.average, 90.3); assert.equal(stats.first9, 87);
    assert.equal(stats.minDarts, 10); close(stats.bestLegAverage, 90.3);
    assert.equal(state.legs[0].players[0].darts, 10); assert.equal(state.legs[0].players[0].recordedDarts, 7 + position);
    close(state.legs[0].players[0].average, 90.3);
    assert.equal(stats.high180, 1); assert.equal(stats.high60, 1); assert.equal(stats.high100, 0);
    assert.equal(stats.checkoutAttempts, 1 + (position === 3 ? 3 : position));
    assert.deepEqual(stats.positional, [120, 80, 61]);
    close(stats.hit20, (position === 3 ? 7 : 6 + position) / (7 + position) * 100);
  });
}

test('first-nine uses the first three visits even when a bust ends after one dart', () => {
  const config = {...base, start: 301, legs: 2};
  const state = E.replay(config, alternate([[t20, t20, t20], [t20, dart(20), dart(1)], [t20], [dart(20, 2)]]));
  assert.equal(E.statistics(state, 0).first9, 87); // (180 + 81 + bust 0) / 9 * 3
});

test('match average weights all darts and first-nine resets for each leg', () => {
  const config = {...base, legs: 2};
  const events = [...alternate(nineDarter), next, ...alternate(twentyDarter, true)];
  const a = E.statistics(E.replay(config, events), 0);
  assert.equal(a.total, 1002); assert.equal(a.darts, 29); close(a.average, 1002 / 29 * 3);
  close(a.first9, (501 + 217) / 18 * 3);
  assert.equal(a.high180, 2); assert.equal(a.high100, 3); assert.equal(a.high140, 1);
  assert.equal(a.minDarts, 9); assert.equal(a.bestLegAverage, 167); assert.equal(a.legsWon, 2);
});

test('180 counts once, disappears on undo and returns once on re-entry and reload', () => {
  const events = [t20, t20, t20];
  const full = E.replay(base, events);
  assert.equal(E.statistics(full, 0).high180, 1);
  const partial = E.replay(base, events.slice(0, -1));
  assert.equal(E.statistics(partial, 0).high180, 0); assert.equal(E.statistics(partial, 0).high100, 0);
  assert.equal(E.statistics(partial, 0).total, 120); assert.equal(E.statistics(partial, 0).average, 180);
  const reload = E.replay(JSON.parse(JSON.stringify(base)), JSON.parse(JSON.stringify(events)));
  assert.equal(E.statistics(reload, 0).high180, 1);
  const before = JSON.stringify(reload);
  for (let i = 0; i < 10; i++) assert.equal(E.statistics(reload, 0).high180, 1);
  assert.equal(JSON.stringify(reload), before, 'reading statistics must not mutate the match');
});

test('busted triple-20 visits and pre-double-in hits never become 180s', () => {
  const bust = E.replay({...base, start: 101}, [t20, t20]);
  assert.equal(E.statistics(bust, 0).high180, 0); assert.equal(E.statistics(bust, 0).total, 0);
  const unopened = E.replay({...base, in: 'double'}, [t20, t20, t20]);
  assert.equal(E.statistics(unopened, 0).high180, 0); assert.equal(E.statistics(unopened, 0).average, 0);
  assert.equal(E.statistics(unopened, 0).tripleRate, 100);
});

test('high-score boundaries are disjoint and never combine different visits', () => {
  const config = {...base, start: 1001};
  const visits = [[dart(19), dart(20), dart(20)], [dart(20), dart(20), dart(20)],
    [dart(19, 3), dart(14, 3), miss], [t20, dart(20), dart(20)],
    [t20, dart(19, 3), dart(11, 2)], [t20, t20, dart(20)],
    [t20, t20, dart(19, 3)], [t20, t20, t20]];
  // Totals: 59,60,99,100,139,140,177,180 = 954, leaves 47.
  const a = E.statistics(E.replay(config, alternate(visits)), 0);
  assert.equal(a.total, 954); assert.equal(a.high60, 2); assert.equal(a.high100, 2);
  assert.equal(a.high140, 2); assert.equal(a.high180, 1); assert.equal(a.highestVisit, 180);
});

test('partial visits update live average and hit rates without counting high rounds early', () => {
  const one = E.statistics(E.replay(base, [t20]), 0);
  assert.equal(one.average, 180); assert.equal(one.darts, 1); assert.equal(one.high60, 0);
  const two = E.statistics(E.replay(base, [t20, dart(20)]), 0);
  assert.equal(two.average, 120); assert.equal(two.high60, 0); assert.equal(two.high100, 0);
});

test('each player keeps their own counts across multiplayer rotation', () => {
  const config = {...base, players: [{name: 'A'}, {name: 'B'}, {name: 'C'}, {name: 'D'}]};
  const events = [t20, t20, t20, dart(20), dart(20), dart(20), miss, miss, miss, dart(25), dart(25), dart(25, 2)];
  const s = E.replay(config, events), stats = config.players.map((_, i) => E.statistics(s, i));
  assert.deepEqual(stats.map(s => s.high180), [1, 0, 0, 0]);
  assert.deepEqual(stats.map(s => s.average), [180, 60, 0, 100]);
  assert.deepEqual(stats.map(s => s.total), [180, 60, 0, 100]);
});

test('check-in counts ignored darts without giving them scoring points', () => {
  const a = E.statistics(E.replay({...base, in: 'double'}, [t20, dart(20, 2), dart(20)]), 0);
  assert.equal(a.total, 60); assert.equal(a.darts, 3); assert.equal(a.average, 60);
  assert.equal(a.checkinAttempts, 2); assert.equal(a.checkinSuccesses, 1); assert.equal(a.checkinRate, 50);
  assert.equal(a.hit20, 100); close(a.tripleRate, 100 / 3);
});

test('unplayed statistics stay unavailable rather than becoming zero averages', () => {
  const a = E.statistics(E.replay(base), 0);
  for (const key of ['average', 'first9', 'bestLegAverage', 'highestVisit', 'highestCheckout', 'minDarts', 'checkoutRate', 'checkinRate', 'tripleRate']) assert.equal(a[key], null, key);
  assert.deepEqual(a.positional, [null, null, null]); assert.equal(a.darts, 0); assert.equal(a.high180, 0);
});

test('all 250047 legal three-dart combinations produce correct totals, averages and high-score counts', () => {
  const targets = [miss, dart(25), dart(25, 2)];
  for (let field = 1; field <= 20; field++) for (let multiplier = 1; multiplier <= 3; multiplier++) targets.push(dart(field, multiplier));
  const config = {...base, start: 1001}; // Every combination is legal, with no possible checkout or bust.
  let combinations = 0, maxima = 0;
  for (const a of targets) for (const b of targets) for (const c of targets) {
    const expected = a.field * a.multiplier + b.field * b.multiplier + c.field * c.multiplier;
    const stats = E.statistics(E.replay(config, [a, b, c]), 0);
    assert.equal(stats.total, expected); assert.equal(stats.darts, 3); close(stats.average, expected);
    assert.equal(stats.high60, Number(expected >= 60 && expected < 100));
    assert.equal(stats.high100, Number(expected >= 100 && expected < 140));
    assert.equal(stats.high140, Number(expected >= 140 && expected < 180));
    assert.equal(stats.high180, Number(a.field === 20 && a.multiplier === 3 && b.field === 20 && b.multiplier === 3 && c.field === 20 && c.multiplier === 3));
    maxima += stats.high180; combinations++;
  }
  assert.equal(combinations, 250047); assert.equal(maxima, 1);
});
