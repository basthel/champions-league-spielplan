const {test} = require('node:test');
const assert = require('node:assert/strict');
const {File} = require('node:buffer');
const E = require('../scorer-engine.js');
const S = require('../scorer-share.js');
const config = {players: [{name: 'Bastl'}, {name: 'Ginzei'}], start: 101, in: 'straight', out: 'double', legs: 1, sets: 1, format: 'first'};
const win = [{type: 'dart', field: 20, multiplier: 3}, {type: 'dart', field: 9, multiplier: 1}, {type: 'dart', field: 16, multiplier: 2}];
function match(events = win, rules = config) {
  return {id: 'share-test', createdAt: '2026-10-30T12:30:00.000Z', updatedAt: '2026-10-30T12:31:00.000Z', finishedAt: events === win ? '2026-10-30T12:31:00.000Z' : null, config: rules, events};
}
function exported(m = match()) { return S.prepare(m, E.replay(m.config, m.events), E); }
function environment(overrides = {}) {
  return {isSecureContext: true, File, navigator: {canShare: () => true, share: async () => {}}, ...overrides};
}

test('shared export preserves the complete existing JSON schema, statistics, event log and starter', () => {
  const m = match(), state = E.replay(m.config, m.events), before = JSON.stringify({m, state});
  const result = S.prepare(m, state, E), data = JSON.parse(result.json);
  assert.equal(result.filename, 'haumdaucher-2026-10-30-share-test.json');
  assert.equal(data.schemaVersion, 1); assert.equal(data.app, 'haumdaucher-scorer');
  assert.equal(data.match.status, 'finished'); assert.deepEqual(data.match.events, win);
  assert.deepEqual(data.match.config, config);
  assert.deepEqual(data.match.summary.players, state.players);
  assert.deepEqual(data.match.summary.legs, state.legs);
  assert.deepEqual(data.match.summary.stats, state.players.map((_, i) => E.statistics(state, i)));
  assert.equal(data.match.summary.stats[1].average, null);
  assert.equal(JSON.stringify({m, state}), before);
  assert.equal(E.replay(data.match.config, data.match.events).winner, 0);
});

test('running, corrected and drawn games export their actual status rather than assuming a winner', () => {
  const corrected = JSON.parse(exported(match(win.slice(0, -1))).json);
  assert.equal(corrected.match.status, 'in-progress');
  assert.equal(corrected.match.summary.stats[0].legsWon, 0);
  const drawn = JSON.parse(exported(match([...win, {type: 'next'}, ...win], {...config, legs: 2, format: 'best'})).json);
  assert.equal(drawn.match.status, 'finished');
  assert.deepEqual(drawn.match.summary.players.map(p => p.totalLegs), [1, 1]);
});

test('native sharing receives exactly the exported JSON file and is invoked in the original tap', async () => {
  const data = exported(); let calls = 0, checked, sent, resolve;
  const pending = new Promise(done => { resolve = done; });
  const result = S.share(data, environment({navigator: {
    canShare: value => { checked = value; return true; },
    share: value => { calls++; sent = value; return pending; }
  }}));
  assert.equal(calls, 1, 'share must be invoked synchronously before activation expires');
  assert.deepEqual(Object.keys(sent), ['files']); assert.equal(sent.files.length, 1);
  assert.equal(sent.files[0], checked.files[0]);
  assert.equal(sent.files[0].name, data.filename); assert.equal(sent.files[0].type, 'application/json');
  assert.equal(await sent.files[0].text(), data.json);
  resolve(); assert.deepEqual(await result, {status: 'shared'});
});

test('HTTP and missing APIs return a download fallback without trying to open another app', async () => {
  let called = false;
  const nav = {canShare: () => { called = true; }, share: () => { called = true; }};
  assert.deepEqual(await S.share(exported(), environment({isSecureContext: false, navigator: nav})), {status: 'download', reason: 'insecure'});
  assert.equal(called, false);
  for (const overrides of [{navigator: {}}, {navigator: {share: () => { called = true; }}}, {File: undefined}]) {
    assert.deepEqual(await S.share(exported(), environment(overrides)), {status: 'download', reason: 'unsupported'});
  }
  assert.equal(called, false);
});

test('unsupported JSON files and capability errors fall back without opening the share menu', async () => {
  for (const canShare of [() => false, () => { throw new TypeError('blocked type'); }]) {
    let calls = 0;
    assert.deepEqual(await S.share(exported(), environment({navigator: {canShare, share: () => { calls++; }}})), {status: 'download', reason: 'file-unsupported'});
    assert.equal(calls, 0);
  }
});

test('cancelling is a quiet result, while blocked or failed sharing offers download without retrying', async () => {
  for (const name of ['AbortError', 'NotAllowedError', 'DataError']) {
    let calls = 0;
    const result = await S.share(exported(), environment({navigator: {
      canShare: () => true, share: async () => { calls++; throw Object.assign(new Error(name), {name}); }
    }}));
    assert.deepEqual(result, name === 'AbortError' ? {status: 'cancelled'} : {status: 'download', reason: 'failed'});
    assert.equal(calls, 1);
  }
});

test('prepared files remain a snapshot if another game is selected or corrected while sharing', async () => {
  const m = match(), state = E.replay(m.config, m.events), data = S.prepare(m, state, E);
  m.events = []; state.players[0].totalLegs = 0;
  let sent;
  await S.share(data, environment({navigator: {canShare: () => true, share: async value => { sent = value.files[0]; }}}));
  const received = JSON.parse(await sent.text());
  assert.deepEqual(received.match.events, win);
  assert.equal(received.match.summary.players[0].totalLegs, 1);
});
