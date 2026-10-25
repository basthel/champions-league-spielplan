'use strict';

// Player data is generated and validated by scripts/generate_schedule.py.
const slug = name => name.toLowerCase().replaceAll('ä', 'ae').replaceAll(' ', '-');
const select = document.querySelector('#player-select');
const plan = document.querySelector('#personal-plan');
const status = document.querySelector('#share-status');
document.querySelector('#draw-seed').textContent = drawMetadata.seed;

for (let pot = 1; pot <= 4; pot++) {
  const group = document.createElement('optgroup');
  group.label = `Lostopf ${pot}`;
  const section = document.createElement('section');
  section.className = 'pot';
  section.setAttribute('aria-labelledby', `pot-${pot}`);
  section.innerHTML = `<div class="pot-heading"><h3 id="pot-${pot}">Lostopf ${pot}</h3><span>04 SPIELER</span></div><ul></ul>`;
  for (const player of players.filter(player => player.pot === pot)) {
    const id = slug(player.name);
    const option = document.createElement('option');
    option.value = id;
    option.textContent = player.name;
    group.append(option);
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'player-link';
    button.dataset.player = id;
    button.setAttribute('aria-label', `Spielplan von ${player.name} ansehen`);
    button.innerHTML = `<span>${player.name}</span><span aria-hidden="true">↗</span>`;
    button.addEventListener('click', () => {
      choose(id, true);
      document.querySelector('#spielplan').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      select.focus({ preventScroll: true });
    });
    item.append(button);
    section.querySelector('ul').append(item);
  }
  select.append(group);
  document.querySelector('#pots').append(section);
}

function choose(id, updateURL = false) {
  const player = players.find(player => slug(player.name) === id) || players[0];
  select.value = slug(player.name);
  status.textContent = '';
  plan.innerHTML = `<div class="plan-title"><h3>${player.name}s Spielplan</h3><span class="pot-tag">LOSTOPF ${player.pot}</span></div><ol class="fixtures">${player.opponents.map((name, index) => `<li class="fixture"><div class="fixture-top"><span>SPIELTAG ${index + 1}</span><span class="fixture-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span></div><p class="fixture-opponent">${name}</p><p class="fixture-bottom"><span>vs. ${player.name}</span> · Lostopf ${players.find(opponent => opponent.name === name).pot}</p></li>`).join('')}</ol>`;
  const summary = document.createElement('p');
  summary.className = 'schedule-caption';
  summary.textContent = [1, 2, 3, 4].map(pot => `Lostopf ${pot}: ${player.opponents.filter(name => players.find(opponent => opponent.name === name).pot === pot).length} Gegner`).join(' · ');
  plan.append(summary);
  document.querySelectorAll('.player-link').forEach(button => {
    if (button.dataset.player === select.value) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  });
  if (updateURL) {
    const url = new URL(location.href);
    url.searchParams.set('spieler', select.value);
    history.replaceState(null, '', url);
  }
}

select.addEventListener('change', () => choose(select.value, true));
window.addEventListener('popstate', () => {
  const params = new URL(location.href).searchParams;
  choose(params.get('spieler'));
  chooseMatchday(params.get('spieltag'));
});
choose(new URL(location.href).searchParams.get('spieler'));

const matchdaySelect = document.querySelector('#matchday-select');
const matchdayPlan = document.querySelector('#matchday-plan');
const matchdayStatus = document.querySelector('#matchday-share-status');
const previousMatchday = document.querySelector('#previous-matchday');
const nextMatchday = document.querySelector('#next-matchday');

for (const day of matchdays) {
  const option = document.createElement('option');
  option.value = day.matchday;
  option.textContent = `Spieltag ${day.matchday}`;
  matchdaySelect.append(option);
}

function chooseMatchday(value, updateURL = false) {
  const day = matchdays.find(day => String(day.matchday) === String(value)) || matchdays[0];
  matchdaySelect.value = String(day.matchday);
  matchdayStatus.textContent = '';
  previousMatchday.disabled = day.matchday === matchdays[0].matchday;
  nextMatchday.disabled = day.matchday === matchdays[matchdays.length - 1].matchday;
  matchdayPlan.innerHTML = `<div class="plan-title"><h3>Spieltag ${day.matchday}</h3><span class="pot-tag">${day.matches.length} BEGEGNUNGEN</span></div><ol class="matchday-fixtures">${day.matches.map(([a, b], index) => `<li class="matchday-fixture"><span class="match-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><div class="match-player"><span>${a}</span><small>Lostopf ${players.find(player => player.name === a).pot}</small></div><span class="match-versus">vs.</span><div class="match-player"><span>${b}</span><small>Lostopf ${players.find(player => player.name === b).pot}</small></div></li>`).join('')}</ol>`;
  if (updateURL) {
    const url = new URL(location.href);
    url.searchParams.set('spieltag', day.matchday);
    history.replaceState(null, '', url);
  }
}

matchdaySelect.addEventListener('change', () => chooseMatchday(matchdaySelect.value, true));
previousMatchday.addEventListener('click', () => chooseMatchday(Number(matchdaySelect.value) - 1, true));
nextMatchday.addEventListener('click', () => chooseMatchday(Number(matchdaySelect.value) + 1, true));
chooseMatchday(new URL(location.href).searchParams.get('spieltag'));

const tbody = document.querySelector('#all-plans-table tbody');
for (const player of players) {
  const row = document.createElement('tr');
  row.innerHTML = `<th scope="row">${player.name}</th><td>${player.pot}</td>${player.opponents.map(name => `<td>${name}</td>`).join('')}`;
  tbody.append(row);
}

async function copyPlanLink(url, feedback) {
  try {
    await navigator.clipboard.writeText(url.href);
    feedback.textContent = 'Link kopiert – bereit zum Teilen!';
  } catch {
    feedback.replaceChildren(document.createTextNode('Kopiere diesen Link: '));
    const link = document.createElement('a');
    link.href = url.href;
    link.textContent = url.href;
    link.style.overflowWrap = 'anywhere';
    feedback.append(link);
  }
}

document.querySelector('#share-button').addEventListener('click', () => {
  const url = new URL(location.href);
  url.searchParams.delete('spieltag');
  url.searchParams.set('spieler', select.value);
  url.hash = 'spielplan';
  copyPlanLink(url, status);
});

document.querySelector('#matchday-share-button').addEventListener('click', () => {
  const url = new URL(location.href);
  url.searchParams.delete('spieler');
  url.searchParams.set('spieltag', matchdaySelect.value);
  url.hash = 'spieltage';
  copyPlanLink(url, matchdayStatus);
});
