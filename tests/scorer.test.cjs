const {test} = require('node:test');
const assert = require('node:assert/strict');
const E = require('../scorer-engine.js');
const base = {players: [{name: 'Bastl'}, {name: 'Ginzei'}], start: 101, in: 'straight', out: 'double', legs: 1, sets: 1, format: 'first'};
const dart = (field, multiplier = 1) => ({type: 'dart', field, multiplier});
const miss = dart(0);
const win101 = [dart(20, 3), dart(1), dart(20, 2)];

test('checkout requires the selected out rule and counts only actual darts', () => {
  const s = E.replay(base, win101);
  assert.equal(s.phase, 'finished'); assert.equal(s.winner, 0);
  const stats = E.statistics(s, 0);
  assert.equal(stats.darts, 3); assert.equal(stats.total, 101); assert.equal(stats.average, 101);
  assert.equal(stats.checkoutAttempts, 1); assert.equal(stats.checkoutRate, 100);
  assert.equal(stats.highestCheckout, 101); assert.equal(stats.minDarts, 3);
  assert.equal(E.statistics(s, 1).average, null);
});
test('a bust restores the entire visit, zeros credited points, and switches player', () => {
  const s = E.replay(base, [dart(20, 3), dart(20, 2)]);
  assert.equal(s.players[0].remaining, 101); assert.equal(s.active, 1);
  assert.equal(s.visits[0].bust, true); assert.equal(s.visits[0].score, 0);
  assert.equal(E.statistics(s, 0).total, 0); assert.equal(E.statistics(s, 0).darts, 3);
  assert.equal(E.statistics(s, 0).recordedDarts, 2);
  assert.equal(E.statistics(s, 0).hit20, 100);
});
test('invalid checkout busts, while bull is a legal double finish', () => {
  const s = E.replay(base, [dart(20, 3), dart(20), dart(7, 3)]);
  assert.equal(s.visits[0].bust, true);
  const bull = E.replay(base, [dart(17, 3), dart(25, 2)]);
  assert.equal(bull.phase, 'finished'); assert.equal(E.statistics(bull, 0).darts, 2);
  assert.throws(() => E.replay(base, [dart(25, 3)]), /Ungültiger Dart/);
});
test('double in ignores single scores and tracks entry attempts', () => {
  const s = E.replay({...base, in: 'double'}, [dart(20), dart(20, 2), dart(20, 3)]);
  assert.equal(s.players[0].remaining, 101); // remaining one busts the visit
  assert.equal(s.players[0].opened, false);
  const partial = E.replay({...base, in: 'double'}, [dart(20), dart(10, 2)]);
  assert.equal(partial.players[0].remaining, 81);
  assert.equal(E.statistics(partial, 0).checkinAttempts, 2);
  assert.equal(E.statistics(partial, 0).checkinSuccesses, 1);
});
test('straight and master out enforce distinct finish rules', () => {
  assert.equal(E.replay({...base, out: 'straight'}, [dart(20, 3), dart(20, 2), dart(1)]).phase, 'finished');
  assert.equal(E.replay({...base, out: 'master'}, [dart(20, 2), dart(1), dart(20, 3)]).phase, 'finished');
  assert.equal(E.replay({...base, out: 'master'}, [dart(20, 3), dart(20, 2)]).visits[0].bust, true);
});
test('alternating starters, set resets and first-to match completion', () => {
  const config = {...base, legs: 1, sets: 2};
  const events = [...win101, {type: 'next'}, ...win101];
  let s = E.replay(config, events);
  assert.equal(s.phase, 'between'); assert.equal(s.setNo, 2);
  assert.deepEqual(s.players.map(p => p.sets), [1, 1]);
  events.push({type: 'next'}, ...win101); s = E.replay(config, events);
  assert.equal(s.phase, 'finished'); assert.equal(s.winner, 0);
  assert.deepEqual(s.players.map(p => p.totalLegs), [2, 1]);
  assert.equal(s.legs[1].winner, 1); assert.equal(s.legs[2].set, 3);
});
test('league Best of 12 finishes at seven wins or six-all', () => {
  const config = {...base, format: 'best', legs: 12};
  const drawEvents = [];
  for (let i = 0; i < 12; i++) { if (i) drawEvents.push({type: 'next'}); drawEvents.push(...win101); }
  const draw = E.replay(config, drawEvents);
  assert.equal(draw.phase, 'finished'); assert.equal(draw.draw, true);
  assert.deepEqual(draw.players.map(p => p.totalLegs), [6, 6]);
  const winEvents = [];
  for (let i = 0; i < 7; i++) { if (i) winEvents.push({type: 'next'}); if (i % 2) winEvents.push(miss, miss, miss); winEvents.push(...win101); }
  const win = E.replay(config, winEvents);
  assert.equal(win.winner, 0); assert.equal(win.phase, 'finished');
  assert.deepEqual(win.players.map(p => p.totalLegs), [7, 0]);
});
test('undo by truncating the event log restores the unfinished winning visit', () => {
  const events = [...win101, {type: 'next'}];
  const config = {...base, legs: 2};
  assert.equal(E.replay(config, events).legNo, 2);
  assert.equal(E.replay(config, events.slice(0, -1)).phase, 'between');
  const s = E.replay(config, events.slice(0, -2));
  assert.equal(s.phase, 'playing'); assert.equal(s.players[0].remaining, 40);
  assert.equal(s.players[0].totalLegs, 0); assert.equal(s.turn.darts.length, 2);
});
test('high-visit buckets are disjoint and first-nine resets each leg', () => {
  const config = {...base, start: 501};
  const events = [dart(20, 3), dart(20, 3), dart(20, 3), miss, miss, miss, dart(20, 3), dart(20, 3), dart(20), miss, miss, miss, dart(20, 3), dart(20), dart(20)];
  const stats = E.statistics(E.replay(config, events), 0);
  assert.equal(stats.high180, 1); assert.equal(stats.high140, 1); assert.equal(stats.high100, 1); assert.equal(stats.high60, 0);
  assert.equal(stats.first9, 140);
});
test('all checkout hints are legal and sum to the remaining score', () => {
  for (const rule of ['straight', 'double', 'master']) {
    for (let rest = 1; rest <= 180; rest++) {
      const path = E.checkout(rest, 3, rule); if (!path) continue;
      assert.ok(path.length <= 3); assert.equal(path.reduce((n, d) => n + d.value, 0), rest);
      const last = path.at(-1);
      assert.ok(rule === 'straight' || last.multiplier === 2 || rule === 'master' && last.multiplier === 3);
    }
  }
  assert.equal(E.checkout(169, 3), null); assert.equal(E.checkout(170, 3).length, 3);
});
test('invalid setup, impossible events and finished-match darts are rejected', () => {
  assert.throws(() => E.replay({...base, players: [{name: 'A'}, {name: 'a'}]}));
  assert.throws(() => E.replay({...base, players: [{name: 'A', computer: true}, {name: 'B', computer: true}]}));
  assert.throws(() => E.replay({...base, format: 'best', legs: 12, sets: 3}));
  assert.throws(() => E.replay(base, [{type: 'next'}]));
  assert.throws(() => E.replay(base, [...win101, miss]));
});
test('three-player turn rotation and bot darts remain valid', () => {
  const config = {...base, players: [...base.players, {name: 'Computer', computer: true, level: 'easy'}]};
  let events = [miss, miss, miss, miss, miss, miss];
  let s = E.replay(config, events); assert.equal(s.active, 2);
  for (let i = 0; i < 12; i++) { const d = E.botDart(s); events.push(d); s = E.replay(config, events); if (s.phase !== 'playing') break; }
  assert.ok(s.players.every(p => p.remaining >= 0));
});

test('solo play immediately starts the same player’s next visit with correct statistics', () => {
  const config = {...base, start: 501, players: [{name: 'Bastl'}]};
  const events = [dart(20, 3), dart(20, 3), dart(20, 3)];
  const state = E.replay(config, events), stats = E.statistics(state, 0);
  assert.equal(state.phase, 'playing'); assert.equal(state.active, 0);
  assert.equal(state.players[0].remaining, 321); assert.equal(state.turn.darts.length, 0);
  assert.equal(stats.high180, 1); assert.equal(stats.average, 180);
  const reload = E.replay(config, JSON.parse(JSON.stringify(events)));
  assert.equal(reload.players.length, 1); assert.equal(E.statistics(reload, 0).high180, 1);
});

test('solo busts keep the same player and consume a full statistical visit', () => {
  const config = {...base, players: [{name: 'Bastl'}]};
  const events = [dart(20, 3), dart(20, 3)];
  const state = E.replay(config, events);
  assert.equal(state.active, 0); assert.equal(state.players[0].remaining, 101);
  assert.equal(state.visits[0].bust, true); assert.equal(state.turn.darts.length, 0);
  assert.equal(E.statistics(state, 0).darts, 3); assert.equal(E.statistics(state, 0).average, 0);
  const corrected = E.replay(config, events.slice(0, -1));
  assert.equal(corrected.players[0].remaining, 41); assert.equal(corrected.turn.darts.length, 1);
});

test('solo legs, correction and match completion work without an opponent', () => {
  const config = {...base, players: [{name: 'Bastl'}], legs: 2};
  const leg = E.replay(config, win101);
  assert.equal(leg.phase, 'between'); assert.equal(leg.players[0].totalLegs, 1);
  const nextLeg = E.replay(config, [...win101, {type: 'next'}]);
  assert.equal(nextLeg.legNo, 2); assert.equal(nextLeg.starter, 0); assert.equal(nextLeg.active, 0);
  const finished = E.replay(config, [...win101, {type: 'next'}, ...win101]);
  assert.equal(finished.phase, 'finished'); assert.equal(finished.winner, 0);
  assert.equal(finished.draw, false); assert.equal(E.statistics(finished, 0).legsWon, 2);
  assert.equal(E.statistics(finished, 0).average, 101);
  const corrected = E.replay(config, [...win101, {type: 'next'}, ...win101.slice(0, -1)]);
  assert.equal(corrected.phase, 'playing'); assert.equal(corrected.players[0].totalLegs, 1);
  assert.equal(corrected.players[0].remaining, 40);
});

test('solo sets and best-of targets retain their configured winning threshold', () => {
  const config = {...base, players: [{name: 'Bastl'}], format: 'best', legs: 3, sets: 3};
  const events = [];
  for (let i = 0; i < 4; i++) { if (i) events.push({type: 'next'}); events.push(...win101); }
  const state = E.replay(config, events);
  assert.equal(state.phase, 'finished'); assert.equal(state.players[0].sets, 2);
  assert.equal(state.players[0].totalLegs, 4); assert.equal(state.winner, 0);
  assert.equal(state.setNo, 2);
});

test('empty games and computer-only solo games are rejected', () => {
  assert.throws(() => E.replay({...base, players: []}), /1 bis 4/);
  assert.throws(() => E.replay({...base, players: [{name: 'Computer', computer: true}]}), /menschlicher Spieler/);
});

test('a selected second player starts without changing the name order or statistics attribution', () => {
  const config = {...base, start: 501, startingPlayer: 1};
  const initial = E.replay(config);
  assert.equal(initial.active, 1); assert.equal(initial.starter, 1); assert.equal(initial.turn.player, 1);
  assert.deepEqual(initial.players.map(p => p.name), ['Bastl', 'Ginzei']);
  const scored = E.replay(config, [dart(20, 3), dart(20, 3), dart(20, 3)]);
  assert.equal(scored.active, 0); assert.equal(scored.players[1].remaining, 321);
  assert.equal(scored.players[0].remaining, 501);
  assert.equal(E.statistics(scored, 1).high180, 1); assert.equal(E.statistics(scored, 0).high180, 0);
});

test('leg starters alternate from the bull winner rather than the leg winner', () => {
  const config = {...base, startingPlayer: 1, legs: 3};
  const events = [miss, miss, miss, ...win101]; // Ginzei starts; Bastl wins.
  const first = E.replay(config, events);
  assert.equal(first.legs[0].starter, 1); assert.equal(first.legs[0].winner, 0);
  events.push({type: 'next'});
  const second = E.replay(config, events);
  assert.equal(second.active, 0); assert.equal(second.starter, 0);
  events.push(...win101, {type: 'next'});
  assert.equal(E.replay(config, events).starter, 1);
  const corrected = E.replay(config, events.slice(0, -1));
  assert.equal(corrected.phase, 'between'); assert.equal(corrected.starter, 0);
});

test('selected starter persists through set changes and JSON reloads', () => {
  const config = {...base, startingPlayer: 1, legs: 1, sets: 2};
  const events = [...win101, {type: 'next'}, ...win101, {type: 'next'}, ...win101];
  const s = E.replay(JSON.parse(JSON.stringify(config)), JSON.parse(JSON.stringify(events)));
  assert.equal(s.phase, 'finished'); assert.equal(s.winner, 1);
  assert.deepEqual(s.legs.map(l => l.starter), [1, 0, 1]);
  assert.deepEqual(s.players.map(p => p.sets), [1, 2]);
});

test('multiplayer turn rotation begins at the selected index and wraps around', () => {
  const config = {...base, startingPlayer: 2, players: [{name: 'A'}, {name: 'B'}, {name: 'C'}, {name: 'D'}]};
  const events = [];
  for (const expected of [2, 3, 0, 1, 2]) {
    assert.equal(E.replay(config, events).active, expected);
    events.push(miss, miss, miss);
  }
});

test('legacy games default to index zero and invalid starter indices are rejected', () => {
  assert.equal(E.replay(base).starter, 0);
  for (const startingPlayer of [-1, 2, 1.5, '1', null, NaN]) assert.throws(() => E.replay({...base, startingPlayer}), /Anwurf/);
  assert.equal(E.replay({...base, players: [{name: 'Solo'}], startingPlayer: 0}).starter, 0);
});
