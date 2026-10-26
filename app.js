'use strict';

// Arena uses the validated fixtures for every view.
const chevron = '<svg class="action-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 4 4 4-4 4"/></svg>';
const slug = name => name.toLowerCase().replaceAll('ä', 'ae').replaceAll(' ', '-');
const byName = new Map(players.map(player => [player.name, player]));
const viewNames = ['spieltage', 'spielplan', 'lostoepfe'];
let currentDay = 1;
let currentPlayer = players[0];
let currentView = 'spieltage';

function updateURL(changes, view, push = false) {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries(changes)) url.searchParams.set(key, value);
  if (view) url.hash = view;
  history[push ? 'pushState' : 'replaceState'](null, '', url);
}

function showView(view, update = false) {
  currentView = viewNames.includes(view) ? view : 'spieltage';
  document.querySelectorAll('.view').forEach(section => { section.hidden = section.id !== currentView; });
  document.querySelectorAll('[data-view]').forEach(link => {
    if (link.dataset.view === currentView) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (update) {
    updateURL({}, currentView, true);
  }
}

function renderMatchday(value, update = false) {
  const day = matchdays.find(day => String(day.matchday) === String(value)) || matchdays[0];
  currentDay = day.matchday;
  document.querySelector('#day-number').textContent = String(currentDay).padStart(2, '0');
  document.querySelector('#previous-matchday').disabled = currentDay === 1;
  document.querySelector('#next-matchday').disabled = currentDay === matchdays.length;
  document.querySelectorAll('[data-day]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.day) === currentDay)));
  document.querySelector('#matchday-fixtures').innerHTML = day.matches.map(([a, b], index) => `<li class="matchday-fixture"><div class="match-meta"><span>${String(index + 1).padStart(2, '0')}</span><span>BEGEGNUNG</span></div><div class="match-pair"><button class="match-player" data-player="${slug(a)}" aria-label="Spielplan von ${a} ansehen" type="button"><strong>${a}</strong><small>Lostopf ${byName.get(a).pot}</small></button><span class="versus">vs.</span><button class="match-player" data-player="${slug(b)}" aria-label="Spielplan von ${b} ansehen" type="button"><strong>${b}</strong><small>Lostopf ${byName.get(b).pot}</small></button></div><span class="match-arrow" aria-hidden="true">${chevron}</span></li>`).join('');
  if (update) updateURL({spieltag: currentDay}, 'spieltage');
}

function renderPlayer(id, update = false) {
  currentPlayer = players.find(player => slug(player.name) === id) || players[0];
  document.querySelector('#player-select').value = slug(currentPlayer.name);
  document.querySelector('#player-pot').textContent = `Lostopf ${currentPlayer.pot}`;
  document.querySelector('#personal-plan').innerHTML = currentPlayer.opponents.map((name, index) => `<li><button type="button" class="personal-fixture" data-open-day="${index + 1}" aria-label="Spieltag ${index + 1}: ${currentPlayer.name} gegen ${name} ansehen"><span class="personal-day">ST <strong>${String(index + 1).padStart(2, '0')}</strong></span><span class="personal-opponent"><strong>${name}</strong><small>Lostopf ${byName.get(name).pot}</small></span><span class="personal-arrow" aria-hidden="true">${chevron}</span></button></li>`).join('');
  document.querySelector('#pot-summary').innerHTML = [1, 2, 3, 4].map(pot => `<span>Topf ${pot}<strong>${currentPlayer.opponents.filter(name => byName.get(name).pot === pot).length} Gegner</strong></span>`).join('');
  if (update) updateURL({spieler: slug(currentPlayer.name)}, 'spielplan');
}

for (const day of matchdays) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.day = day.matchday;
  button.setAttribute('aria-label', `Spieltag ${day.matchday}`);
  button.setAttribute('aria-controls', 'matchday-fixtures');
  button.innerHTML = `<span>Spieltag</span><strong>${String(day.matchday).padStart(2, '0')}</strong>`;
  button.addEventListener('click', () => renderMatchday(day.matchday, true));
  document.querySelector('#round-selector').append(button);
}

for (let pot = 1; pot <= 4; pot++) {
  const group = document.createElement('optgroup');
  group.label = `Lostopf ${pot}`;
  const members = players.filter(player => player.pot === pot);
  for (const player of members) {
    const option = document.createElement('option');
    option.value = slug(player.name);
    option.textContent = player.name;
    group.append(option);
  }
  document.querySelector('#player-select').append(group);
  const section = document.createElement('section');
  section.className = 'pot';
  section.innerHTML = `<div class="pot-heading"><h3>Lostopf</h3><span>0${pot}</span></div><ul>${members.map(player => `<li><button type="button" data-player="${slug(player.name)}"><span>${player.name}</span><span aria-hidden="true">${chevron}</span></button></li>`).join('')}</ul>`;
  document.querySelector('#pots').append(section);
}

for (const player of players) {
  const row = document.createElement('tr');
  row.innerHTML = `<th scope="row">${player.name}</th><td>${player.pot}</td>${player.opponents.map(name => `<td>${name}</td>`).join('')}`;
  document.querySelector('#all-plans-table tbody').append(row);
}

document.querySelector('#draw-seed').textContent = drawMetadata.seed;
document.querySelectorAll('[data-view], .logo-link').forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  showView(link.dataset.view || 'spieltage', true);
}));
document.querySelector('#previous-matchday').addEventListener('click', () => renderMatchday(currentDay - 1, true));
document.querySelector('#next-matchday').addEventListener('click', () => renderMatchday(currentDay + 1, true));
document.querySelector('#player-select').addEventListener('change', event => renderPlayer(event.target.value, true));
document.querySelector('main').addEventListener('click', event => {
  const playerButton = event.target.closest('[data-player]');
  const dayButton = event.target.closest('[data-open-day]');
  if (playerButton) {
    renderPlayer(playerButton.dataset.player, true);
    showView('spielplan');
    document.querySelector('#content').scrollIntoView({behavior: 'instant', block: 'start'});
    document.querySelector('#player-select').focus({preventScroll: true});
  } else if (dayButton) {
    renderMatchday(dayButton.dataset.openDay, true);
    showView('spieltage');
    document.querySelector('#content').scrollIntoView({behavior: 'instant', block: 'start'});
    document.querySelector(`[data-day="${currentDay}"]`).focus({preventScroll: true});
  }
});

function restoreLocation() {
  const params = new URL(location.href).searchParams;
  renderMatchday(params.get('spieltag'));
  renderPlayer(params.get('spieler'));
  const hash = location.hash.slice(1);
  showView(viewNames.includes(hash) ? hash : params.has('spieler') && !params.has('spieltag') ? 'spielplan' : 'spieltage');
  if (hash === 'hinweis') document.querySelector('#hinweis').open = true;
}
window.addEventListener('popstate', restoreLocation);
window.addEventListener('hashchange', restoreLocation);
restoreLocation();
