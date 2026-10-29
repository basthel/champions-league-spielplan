const {test} = require('node:test');
const assert = require('node:assert/strict');
const E = require('../scorer-engine.js');
const data = require('../checkout-data.js');
const labels = (score, darts) => E.checkout(score, darts)?.map(E.label).join(' ') ?? null;

test('lookup covers exactly every reachable Double Out score for each dart budget', () => {
  const values = new Set([0, 25, 50]);
  for (let field = 1; field <= 20; field++) for (let multiplier = 1; multiplier <= 3; multiplier++) values.add(field * multiplier);
  const doubles = Array.from({length: 20}, (_, i) => 2 * (i + 1)).concat(50);
  let prefixes = new Set([0]);
  for (let budget = 1; budget <= 3; budget++) {
    const reachable = new Set([...prefixes].flatMap(prefix => doubles.map(value => prefix + value)));
    const stored = Object.keys(data.byDarts[budget]).map(Number).sort((a, b) => a - b);
    assert.deepEqual(stored, [...reachable].sort((a, b) => a - b), `${budget} darts`);
    prefixes = new Set([...prefixes].flatMap(prefix => [...values].map(value => prefix + value)));
  }
  assert.equal(Object.keys(data.byDarts[3]).length, 162);
});

test('every listed route uses legal targets, fits its budget, sums exactly and ends on a double', () => {
  for (const budget of [1, 2, 3]) for (const [score, route] of Object.entries(data.byDarts[budget])) {
    assert.match(route, /^(?:[DT]?(?:[1-9]|1\d|20|25)|Bull)(?: (?:[DT]?(?:[1-9]|1\d|20|25)|Bull))*$/);
    const darts = E.checkout(Number(score), budget);
    assert.ok(darts.length >= 1 && darts.length <= budget);
    assert.equal(darts.reduce((sum, d) => sum + d.value, 0), Number(score), route);
    for (const d of darts) assert.ok(d.field === 25 ? d.multiplier <= 2 : d.field >= 1 && d.field <= 20);
    assert.equal(darts.at(-1).multiplier, 2);
  }
});

test('standard routes favor practical singles and doubles instead of first-found triples', () => {
  const examples = {41: '9 D16', 48: '16 D16', 60: '20 D20', 64: 'T16 D8', 70: 'T10 D20', 77: 'T19 D10', 79: 'T13 D20', 90: 'T18 D18', 100: 'T20 D20', 101: 'T20 9 D16', 125: '25 T20 D20', 170: 'T20 T20 Bull'};
  for (const [score, route] of Object.entries(examples)) assert.equal(labels(Number(score), 3), route);
});

test('routes change when fewer darts force a bull finish or different first target', () => {
  assert.equal(labels(50, 3), '10 D20'); assert.equal(labels(50, 2), '10 D20'); assert.equal(labels(50, 1), 'Bull');
  assert.equal(labels(82, 3), 'Bull D16'); assert.equal(labels(82, 2), 'T14 D20'); assert.equal(labels(82, 1), null);
  for (const [score, triple] of [[101, 17], [104, 18], [107, 19], [110, 20]]) {
    assert.equal(labels(score, 2), `T${triple} Bull`); assert.equal(E.checkout(score, 3).length, 3);
  }
  assert.equal(labels(99, 2), null); assert.equal(labels(99, 3), 'T19 10 D16');
});

test('bogeys, impossible last darts and invalid inputs have no recommendation', () => {
  for (const score of [159, 162, 163, 165, 166, 168, 169, 171, 180, 501, 1, 0, -2, 40.5, NaN, Infinity]) assert.equal(E.checkout(score, 3), null);
  for (const darts of [0, -1, 4, 1.5, NaN]) assert.equal(E.checkout(40, darts), null);
  assert.equal(E.checkout(41, 1), null); assert.equal(E.checkout(40, 2, 'unknown'), null);
});

test('every three-dart recommendation wins a leg when replayed through the scorer', () => {
  const config = {players: [{name: 'A'}, {name: 'B'}], start: 501, in: 'straight', out: 'double', format: 'first', legs: 1, sets: 1};
  const miss = {type: 'dart', field: 0, multiplier: 1};
  for (const score of Object.keys(data.byDarts[3]).map(Number)) {
    const events = []; let reduction = 501 - score, count = 0;
    while (reduction > 0) {
      const field = Math.min(20, reduction); events.push({type: 'dart', field, multiplier: 1}); reduction -= field;
      if (++count % 3 === 0) events.push(miss, miss, miss);
    }
    while (count % 3 !== 0) { events.push(miss); if (++count % 3 === 0) events.push(miss, miss, miss); }
    const before = E.replay(config, events);
    assert.equal(before.active, 0); assert.equal(before.players[0].remaining, score);
    for (const d of E.checkout(score, 3)) events.push({type: 'dart', field: d.field, multiplier: d.multiplier});
    const after = E.replay(config, events);
    assert.equal(after.phase, 'finished', String(score)); assert.equal(after.winner, 0);
  }
});

test('lookup recommendations are immutable and callers cannot corrupt later hints', () => {
  const route = E.checkout(101, 3); route[0].field = 1;
  assert.equal(labels(101, 3), 'T20 9 D16');
  assert.ok(Object.isFrozen(data.byDarts[3]));
});

test('the computer aims at the same standard route and adapts after each hit', () => {
  const config = {players: [{name: 'A', computer: true}, {name: 'B'}], start: 101, in: 'straight', out: 'double', format: 'first', legs: 1, sets: 1};
  const events = [];
  for (const [field, multiplier] of [[20, 3], [9, 1], [16, 2]]) {
    const d = E.botDart(E.replay(config, events), () => 0);
    assert.deepEqual(d, {type: 'dart', field, multiplier}); events.push(d);
  }
  assert.equal(E.replay(config, events).phase, 'finished');
});
