'use strict';

const decimal = new Intl.NumberFormat('de-AT', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const formatStat = (value, kind = 'number') => value == null ? '—' : kind === 'decimal' ? decimal.format(value) : kind === 'percent' ? decimal.format(value) + ' %' : String(value);
const resultIndex = new Map(leagueData.matches.map(match => [match.players.map(p => p.name).sort().join('|'), match]));

function findResult(a, b) {
  return resultIndex.get([a, b].sort().join('|'));
}
function resultScore(match, name) {
  const own = match.players.find(p => p.name === name);
  const other = match.players.find(p => p.name !== name);
  return own.legsWon + ':' + other.legsWon;
}
const statisticsMetrics = {
  overview: [
    ['played', 'Erfasste Spiele'], ['points', 'Punkte'], ['wins', 'Siege'], ['draws', 'Remis'], ['losses', 'Niederlagen'],
    ['average', 'Game-Ø', 'decimal'], ['checkoutPct', 'Checkout', 'percent'], ['legsWon', 'Legs gewonnen'], ['legsLost', 'Legs verloren']
  ],
  scoring: [
    ['average', 'Game-Ø', 'decimal'], ['weightedAverage', '3-Dart-Ø (gewichtet)', 'decimal'],
    ['first9Average', 'First-9-Ø', 'decimal'], ['dartsThrown', 'Darts geworfen'],
    ['highestVisit', 'Höchste Aufnahme'], ['bestLegAverage', 'Bester Leg-Ø', 'decimal']
  ],
  checkout: [
    ['checkoutPct', 'Checkout', 'percent'], ['checkoutAttempts', 'Checkout-Versuche'],
    ['highestCheckout', 'Höchstes Checkout'], ['bestLegDarts', 'Bestes Leg · Darts']
  ],
  highlights: [
    ['scores180', '180er'], ['scores140', '140+'], ['scores100', '100+'], ['scores60', '60+'],
    ['highestCheckout', 'Höchstes Checkout'], ['bestLegDarts', 'Bestes Leg · Darts']
  ],
  accuracy: [
    ['hit20Pct', '20-Trefferquote', 'percent'], ['hit20or19Pct', '20/19-Trefferquote', 'percent'],
    ['hit60Pct', 'T20-Trefferquote', 'percent'], ['hit60or57Pct', 'T20/T19-Trefferquote', 'percent']
  ]
};

function renderStandings() {
  const ranked = leagueData.standings;
  document.querySelector('#standings-status').textContent = leagueData.recordedMatches ? leagueData.recordedMatches + ' / ' + leagueData.totalFixtures + ' Spiele' : 'Noch keine Ergebnisse';
  document.querySelector('#standings-body').innerHTML = ranked.map(p => `<tr>
    <td class="rank-column">${p.rank ?? '—'}</td>
    <th scope="row"><button type="button" data-player="${slug(p.name)}">${p.name}<span>Topf ${p.pot}</span></button></th>
    <td>${p.played}</td><td class="points-column">${p.points}</td><td>${p.legsWon}:${p.legsLost}</td>
    <td>${formatStat(p.average, 'decimal')}</td><td>${formatStat(p.checkoutPct, 'decimal')}</td>
  </tr>`).join('');
}

function renderStatistics(update = false) {
  const scope = document.querySelector('#stats-scope').value;
  const category = document.querySelector('#stats-category').value;
  const ranking = document.querySelector('#stats-ranking').value;
  const stats = leagueData.scopes[scope] || leagueData.scopes.overall;
  const content = document.querySelector('#statistics-content');
  document.querySelector('#ranking-filter').hidden = category !== 'ranking';
  const selectedPlayers = leagueData.standings.filter(p => scope === 'overall' || (scope.startsWith('pot-') ? p.pot === Number(scope.slice(4)) : 'player:' + p.name === scope));
  const availableFixtures = matchdays.flatMap(day => day.matches).filter(pair => pair.some(name => selectedPlayers.some(p => p.name === name))).length;
  const summary = `<div class="stats-summary"><span>${stats.played} / ${availableFixtures} Spiele erfasst</span><span>${selectedPlayers.length} Spieler</span></div>`;
  if (category === 'ranking') {
    const metricLabel = document.querySelector('#stats-ranking').selectedOptions[0].textContent;
    const rows = selectedPlayers.filter(p => p[ranking] != null).sort((a, b) => (ranking === 'bestLegDarts' ? a[ranking] - b[ranking] : b[ranking] - a[ranking]) || a.name.localeCompare(b.name, 'de'));
    let rank = 0, last = null;
    content.innerHTML = summary + (rows.length ? `<table class="statistics-ranking"><caption>${metricLabel}</caption><thead><tr><th scope="col">#</th><th scope="col">Spieler</th><th scope="col">${metricLabel}</th></tr></thead><tbody>${rows.map((p, i) => {
      if (p[ranking] !== last) rank = i + 1;
      last = p[ranking];
      return `<tr><td>${rank}</td><th scope="row"><button data-player="${slug(p.name)}" type="button">${p.name}</button></th><td>${formatStat(p[ranking], ranking === 'checkoutPct' ? 'percent' : ['average', 'first9Average'].includes(ranking) ? 'decimal' : 'number')}</td></tr>`;
    }).join('')}</tbody></table>` : '<p class="statistics-empty">Noch keine Werte für diese Rangliste.</p>');
  } else {
    const notes = stats.appearances ? '' : '<p class="statistics-empty">Noch keine Ergebnisse für diese Auswahl.</p>';
    content.innerHTML = summary + notes + '<dl class="stat-metrics">' + statisticsMetrics[category].map(([field, label, kind]) => {
      const coverage = stats.coverage[field];
      const hint = coverage != null && stats.appearances && coverage < stats.appearances ? `<small>${coverage} / ${stats.appearances} Spielerwerte erfasst</small>` : '';
      return `<div><dt>${label}</dt><dd>${formatStat(stats[field], kind)}</dd>${hint}</div>`;
    }).join('') + '</dl>';
  }
  if (update) updateURL({statistik: scope, kategorie: category, kennzahl: ranking}, 'statistik');
}

function restoreStatistics(params) {
  const setIfValid = (id, value) => {
    const control = document.querySelector(id);
    if ([...control.options].some(option => option.value === value)) control.value = value;
    else control.selectedIndex = 0;
  };
  setIfValid('#stats-scope', params.get('statistik'));
  setIfValid('#stats-category', params.get('kategorie'));
  setIfValid('#stats-ranking', params.get('kennzahl'));
  renderStatistics();
}

function initializeLeagueViews() {
  const scope = document.querySelector('#stats-scope');
  scope.innerHTML = '<option value="overall">Gesamte Liga</option><optgroup label="Lostöpfe">' +
    [1, 2, 3, 4].map(pot => `<option value="pot-${pot}">Lostopf ${pot}</option>`).join('') +
    '</optgroup><optgroup label="Spieler">' + [...players].sort((a, b) => a.name.localeCompare(b.name, 'de')).map(p => `<option value="player:${p.name}">${p.name}</option>`).join('') + '</optgroup>';
  for (const id of ['#stats-scope', '#stats-category', '#stats-ranking']) {
    document.querySelector(id).addEventListener('change', () => renderStatistics(true));
  }
  renderStandings();
}
