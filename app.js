'use strict';

// Original opponent order supplied by the organizer. Do not auto-correct the draw.
const players = [
  { name: 'Abi', pot: 1, opponents: ['Mäcci', 'Bastl', 'Hirschi', 'Moser', 'Tom', 'Schipfei', 'More', 'Hellei'] },
  { name: 'Tom', pot: 1, opponents: ['Ginzei', 'Bachi', 'Anderl', 'Kaiser', 'Abi', 'Hauslon', 'Hofer Flo', 'Mäcci'] },
  { name: 'Anderl', pot: 1, opponents: ['5er', 'More', 'Tom', 'Hellei', 'Hirschi', 'Bastl', 'Moser', 'Bachi'] },
  { name: 'Hirschi', pot: 1, opponents: ['Abi', 'Kaiser', 'Anderl', 'Hauslon', 'More', 'Ginzei', 'Schipfei', 'Hofer Flo'] },
  { name: 'Bastl', pot: 2, opponents: ['Abi', 'Mäcci', 'Hofer Flo', 'More', 'Schipfei', 'Anderl', 'Bachi', 'Kaiser'] },
  { name: 'Bachi', pot: 2, opponents: ['Tom', 'Ginzei', 'Kaiser', 'Schipfei', 'Hauslon', '5er', 'Anderl', 'More'] },
  { name: 'Hauslon', pot: 2, opponents: ['Schipfei', 'Hofer Flo', 'Kaiser', 'Hirschi', 'Bachi', 'Tom', 'Mäcci', 'Hellei'] },
  { name: 'Schipfei', pot: 2, opponents: ['Hauslon', 'Moser', 'More', 'Bachi', 'Bastl', 'Abi', 'Hirschi', 'Ginzei'] },
  { name: 'Hellei', pot: 3, opponents: ['Moser', 'Kaiser', 'Anderl', 'More', 'Ginzei', '5er', 'Hauslon', 'Abi'] },
  { name: 'Ginzei', pot: 3, opponents: ['Tom', 'Bachi', 'Moser', 'Mäcci', 'Hellei', 'Hirschi', 'Schipfei', 'Kaiser'] },
  { name: 'Moser', pot: 3, opponents: ['Hellei', 'Schipfei', 'Ginzei', 'Abi', 'Anderl', 'Bastl', '5er', 'More'] },
  { name: 'Hofer Flo', pot: 3, opponents: ['Bastl', 'Hauslon', 'Kaiser', 'Mäcci', 'Tom', 'Hirschi', '5er', 'More'] },
  { name: 'More', pot: 4, opponents: ['Anderl', 'Bachi', 'Schipfei', 'Hellei', 'Hirschi', 'Moser', 'Abi', 'Hofer Flo'] },
  { name: 'Kaiser', pot: 4, opponents: ['Hirschi', 'Hellei', 'Hauslon', 'Tom', 'Hofer Flo', 'Bastl', 'Ginzei', '5er'] },
  { name: 'Mäcci', pot: 4, opponents: ['Abi', 'Bastl', 'Ginzei', 'Hofer Flo', '5er', 'Tom', 'Hauslon', 'Anderl'] },
  { name: '5er', pot: 4, opponents: ['Anderl', 'Bachi', 'Moser', 'Hofer Flo', 'Mäcci', 'Hellei', 'Kaiser', 'Bastl'] }
];

const slug = name => name.toLowerCase().replaceAll('ä', 'ae').replaceAll(' ', '-');
const select = document.querySelector('#player-select');
const plan = document.querySelector('#personal-plan');
const status = document.querySelector('#share-status');

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
window.addEventListener('popstate', () => choose(new URL(location.href).searchParams.get('spieler')));
choose(new URL(location.href).searchParams.get('spieler'));

const tbody = document.querySelector('#all-plans-table tbody');
for (const player of players) {
  const row = document.createElement('tr');
  row.innerHTML = `<th scope="row">${player.name}</th><td>${player.pot}</td>${player.opponents.map(name => `<td>${name}</td>`).join('')}`;
  tbody.append(row);
}

document.querySelector('#share-button').addEventListener('click', async () => {
  const url = new URL(location.href);
  url.searchParams.set('spieler', select.value);
  url.hash = 'spielplan';
  try {
    await navigator.clipboard.writeText(url.href);
    status.textContent = 'Link kopiert – bereit zum Teilen!';
  } catch {
    status.replaceChildren(document.createTextNode('Kopiere diesen Link: '));
    const link = document.createElement('a');
    link.href = url.href;
    link.textContent = url.href;
    link.style.overflowWrap = 'anywhere';
    status.append(link);
  }
});
