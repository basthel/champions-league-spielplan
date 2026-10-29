/* Pure, replayable X01 rules. Shared by the browser and Node's rule tests. */
(function (root) {
  'use strict';
  const checkoutData = typeof module !== 'undefined' && module.exports ? require('./checkout-data.js') : root.DartsCheckoutData;
  const isFinish = (dart, rule) => rule === 'straight' || dart.multiplier === 2 || (rule === 'master' && dart.multiplier === 3);
  const validDart = dart => Number.isInteger(dart.field) && (dart.field >= 0 && dart.field <= 20 || dart.field === 25) && [1, 2, 3].includes(dart.multiplier) && !(dart.field === 25 && dart.multiplier === 3) && !(dart.field === 0 && dart.multiplier !== 1);
  const targets = [];
  for (const multiplier of [3, 2, 1]) for (let field = 20; field >= 1; field--) targets.push({field, multiplier, value: field * multiplier});
  targets.push({field: 25, multiplier: 2, value: 50}, {field: 25, multiplier: 1, value: 25});
  function calculatedCheckout(remaining, darts, rule) {
    if (remaining <= 0 || remaining > darts * 60) return null;
    const last = targets.find(d => d.value === remaining && isFinish(d, rule));
    if (last) return [last];
    if (darts <= 1) return null;
    for (const dart of targets) {
      if (dart.value >= remaining) continue;
      const tail = calculatedCheckout(remaining - dart.value, darts - 1, rule);
      if (tail) return [dart, ...tail];
    }
    return null;
  }
  function checkout(remaining, darts, rule = 'double') {
    if (!Number.isInteger(remaining) || !Number.isInteger(darts) || darts < 1 || darts > 3 || !['double', 'straight', 'master'].includes(rule)) return null;
    if (rule !== 'double') return calculatedCheckout(remaining, darts, rule);
    const route = checkoutData.byDarts[darts][remaining];
    if (!route) return null;
    return route.split(' ').map(token => {
      const field = token === 'Bull' ? 25 : Number(token.replace(/^[DT]/, ''));
      const multiplier = token === 'Bull' || token.startsWith('D') ? 2 : token.startsWith('T') ? 3 : 1;
      return {field, multiplier, value: field * multiplier};
    });
  }
  function validate(config) {
    if (!config || !Array.isArray(config.players) || config.players.length < 1 || config.players.length > 4) throw new Error('Bitte 1 bis 4 Spieler auswählen.');
    const names = config.players.map(p => String(p.name || '').trim());
    if (names.some(n => !n || n.length > 32) || new Set(names.map(n => n.toLocaleLowerCase())).size !== names.length) throw new Error('Bitte unterschiedliche Spielernamen eingeben (max. 32 Zeichen).');
    if (config.players.every(p => p.computer)) throw new Error('Mindestens ein menschlicher Spieler wird benötigt.');
    if (![101, 301, 501, 701, 1001].includes(config.start) || !['straight', 'double', 'master'].includes(config.out) || !['straight', 'double'].includes(config.in)) throw new Error('Ungültige X01-Einstellungen.');
    if (!['first', 'best'].includes(config.format) || !Number.isInteger(config.legs) || config.legs < 1 || config.legs > 15 || !Number.isInteger(config.sets) || config.sets < 1 || config.sets > 9) throw new Error('Ungültige Leg-/Set-Anzahl.');
    if (config.format === 'best' && (names.length > 2 || config.sets > 1 && (config.legs % 2 === 0 || config.sets % 2 === 0))) throw new Error('Best of: höchstens zwei Spieler; bei mehreren Sets nur ungerade Leg-/Set-Anzahlen.');
    const startingPlayer = config.startingPlayer === undefined ? 0 : config.startingPlayer;
    if (!Number.isInteger(startingPlayer) || startingPlayer < 0 || startingPlayer >= names.length) throw new Error('Bitte einen gültigen Spieler für den Anwurf auswählen.');
    return {...config, startingPlayer, players: config.players.map((p, i) => ({name: names[i], computer: Boolean(p.computer), level: ['easy', 'medium', 'hard'].includes(p.level) ? p.level : 'medium'}))};
  }
  function initial(config) {
    return {config, players: config.players.map(p => ({...p, remaining: config.start, opened: config.in === 'straight', legs: 0, sets: 0, totalLegs: 0})), active: config.startingPlayer, starter: config.startingPlayer, legNo: 1, setNo: 1, phase: 'playing', winner: null, draw: false, visits: [], legs: [], turn: null, notice: '', nextSet: false};
  }
  function startTurn(state) {
    const p = state.players[state.active];
    state.turn = {player: state.active, leg: state.legNo, set: state.setNo, start: p.remaining, openedBefore: p.opened, darts: [], score: 0, bust: false, checkout: false, remaining: p.remaining};
  }
  function target(count, format) { return format === 'best' ? Math.floor(count / 2) + 1 : count; }
  // A bust consumes a full statistical visit, even if it ends on dart 1 or 2.
  // Keep the actual dart records intact for field accuracy and provenance.
  function visitDartCount(visit) { return visit.bust ? 3 : visit.darts.length; }
  function statisticalDarts(visit) {
    const points = visit.darts.map(d => ({points: d.points}));
    while (points.length < visitDartCount(visit)) points.push({points: 0});
    return points;
  }
  function completeLeg(s, player) {
    const p = s.players[player];
    p.legs++; p.totalLegs++;
    s.legs.push({number: s.legNo, set: s.setNo, starter: s.starter, winner: player, players: s.players.map((p, i) => {
      const visits = s.visits.filter(v => v.leg === s.legNo && v.player === i);
      const darts = visits.reduce((n, v) => n + visitDartCount(v), 0);
      const recordedDarts = visits.reduce((n, v) => n + v.darts.length, 0);
      const score = visits.reduce((n, v) => n + v.score, 0);
      return {remaining: p.remaining, darts, recordedDarts, score, average: darts ? score / darts * 3 : null, checkout: i === player ? visits.at(-1).score : null};
    })});
    if (p.legs >= target(s.config.legs, s.config.format)) {
      p.sets++;
      if (p.sets >= target(s.config.sets, s.config.format)) { s.phase = 'finished'; s.winner = player; return; }
      s.nextSet = true;
    } else if (s.config.format === 'best' && s.config.sets === 1 && s.legs.length >= s.config.legs) {
      s.phase = 'finished'; s.draw = true; return;
    }
    s.phase = 'between';
  }
  function apply(s, event) {
    if (event.type === 'next') {
      if (s.phase !== 'between') throw new Error('Kein nächstes Leg verfügbar.');
      if (s.nextSet) { s.players.forEach(p => { p.legs = 0; }); s.setNo++; s.nextSet = false; }
      s.legNo++; s.starter = (s.config.startingPlayer + s.legNo - 1) % s.players.length; s.active = s.starter;
      s.players.forEach(p => { p.remaining = s.config.start; p.opened = s.config.in === 'straight'; });
      s.phase = 'playing'; s.notice = ''; startTurn(s); return;
    }
    if (event.type !== 'dart' || s.phase !== 'playing' || !validDart(event)) throw new Error('Ungültiger Dart.');
    const p = s.players[s.active];
    const dart = {field: event.field, multiplier: event.multiplier, value: event.field * event.multiplier, points: 0, checkinAttempt: !p.opened, checkinSuccess: false, checkoutAttempt: p.opened && Boolean(checkout(p.remaining, 1, s.config.out))};
    if (!p.opened && dart.multiplier === 2) { p.opened = true; dart.checkinSuccess = true; }
    let bust = false, won = false;
    if (p.opened) {
      const remaining = p.remaining - dart.value;
      won = remaining === 0 && isFinish(dart, s.config.out);
      bust = remaining < 0 || remaining === 0 && !won || s.config.out !== 'straight' && remaining === 1;
      if (!bust) { dart.points = dart.value; p.remaining = remaining; s.turn.score += dart.value; }
    }
    s.turn.darts.push(dart);
    s.notice = '';
    if (bust) {
      p.remaining = s.turn.start; p.opened = s.turn.openedBefore;
      s.turn.score = 0; s.turn.bust = true; s.turn.darts.forEach(d => { d.points = 0; });
      s.notice = `${p.name}: überworfen. Aufnahme zählt 0.`;
    }
    s.turn.remaining = p.remaining;
    if (bust || won || s.turn.darts.length === 3) {
      s.turn.checkout = won; s.visits.push(s.turn); s.turn = null;
      if (won) { completeLeg(s, s.active); return; }
      s.active = (s.active + 1) % s.players.length; startTurn(s);
    }
  }
  function replay(config, events = []) {
    const s = initial(validate(config)); startTurn(s);
    for (const event of events) apply(s, event);
    return s;
  }
  function statistics(s, player) {
    const visits = s.visits.filter(v => v.player === player);
    if (s.turn?.player === player && s.turn.darts.length) visits.push(s.turn);
    const darts = visits.flatMap(v => v.darts);
    const countedDarts = visits.reduce((n, v) => n + visitDartCount(v), 0);
    const scoringVisits = visits.map(v => ({leg: v.leg, darts: statisticalDarts(v)}));
    const total = visits.reduce((n, v) => n + v.score, 0);
    const completed = s.visits.filter(v => v.player === player);
    const legIds = [...new Set(visits.map(v => v.leg))];
    const first9 = legIds.flatMap(id => scoringVisits.filter(v => v.leg === id).flatMap(v => v.darts).slice(0, 9));
    const wins = s.legs.filter(l => l.winner === player);
    const rate = predicate => darts.length ? darts.filter(predicate).length / darts.length * 100 : null;
    const positional = [0, 1, 2].map(i => scoringVisits.map(v => v.darts[i]).filter(Boolean));
    const checkoutAttempts = darts.filter(d => d.checkoutAttempt).length;
    const checkinAttempts = darts.filter(d => d.checkinAttempt).length;
    const checkinSuccesses = darts.filter(d => d.checkinSuccess).length;
    const averages = s.legs.map(l => l.players[player].average).filter(v => v !== null);
    return {darts: countedDarts, recordedDarts: darts.length, total, average: countedDarts ? total / countedDarts * 3 : null, first9: first9.length ? first9.reduce((n, d) => n + d.points, 0) / first9.length * 3 : null,
      legsPlayed: s.legs.length, legsWon: wins.length, legWinRate: s.legs.length ? wins.length / s.legs.length * 100 : null, setsWon: s.players[player].sets,
      highestVisit: visits.length ? Math.max(...visits.map(v => v.score)) : null, bestLegAverage: averages.length ? Math.max(...averages) : null,
      positional: positional.map(ds => ds.length ? ds.reduce((n, d) => n + d.points, 0) / ds.length * 3 : null),
      hit20: rate(d => d.field === 20), hit2019: rate(d => [20, 19].includes(d.field)), hit60: rate(d => d.value === 60), hit6057: rate(d => [60, 57].includes(d.value)), tripleRate: rate(d => d.multiplier === 3),
      field1: rate(d => d.field === 1), field5: rate(d => d.field === 5), field20: rate(d => d.field === 20),
      // Mutually exclusive visit buckets: 60–99, 100–139, 140–179, exactly 180.
      high60: completed.filter(v => v.score >= 60 && v.score < 100).length, high100: completed.filter(v => v.score >= 100 && v.score < 140).length, high140: completed.filter(v => v.score >= 140 && v.score < 180).length, high180: completed.filter(v => v.score === 180).length,
      highestCheckout: wins.length ? Math.max(...wins.map(l => l.players[player].checkout)) : null, minDarts: wins.length ? Math.min(...wins.map(l => l.players[player].darts)) : null,
      checkoutAttempts, checkoutRate: checkoutAttempts ? wins.length / checkoutAttempts * 100 : null, checkinAttempts, checkinSuccesses, checkinRate: checkinAttempts ? checkinSuccesses / checkinAttempts * 100 : null};
  }
  function botDart(s, random = Math.random) {
    const p = s.players[s.active];
    let aim = !p.opened ? {field: 20, multiplier: 2} : checkout(p.remaining, 3 - s.turn.darts.length, s.config.out)?.[0] || {field: 20, multiplier: 3};
    const accuracy = {easy: .22, medium: .4, hard: .67}[p.level];
    if (random() < accuracy) return {type: 'dart', field: aim.field, multiplier: aim.multiplier};
    if (random() < .12) return {type: 'dart', field: 0, multiplier: 1};
    const ring = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
    const index = ring.indexOf(aim.field);
    const field = aim.field === 25 ? [25, 5, 1][Math.floor(random() * 3)] : random() < .6 ? aim.field : ring[(index + (random() < .5 ? 1 : 19)) % 20];
    return {type: 'dart', field, multiplier: 1};
  }
  const api = {validate, replay, statistics, checkout, botDart, visitDartCount, label: dart => dart.field === 0 ? '0' : dart.field === 25 && dart.multiplier === 2 ? 'Bull' : `${dart.multiplier === 3 ? 'T' : dart.multiplier === 2 ? 'D' : ''}${dart.field}`};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DartsEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
