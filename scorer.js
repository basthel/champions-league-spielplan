(function () {
  'use strict';
  const E = window.DartsEngine;
  const KEY = 'haumdaucher-scorer-v1';
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const number = (value, digits = 2) => value === null || value === undefined ? '–' : value.toLocaleString('de-DE', {minimumFractionDigits: digits, maximumFractionDigits: digits});
  const date = value => new Date(value).toLocaleString('de-DE', {dateStyle: 'short', timeStyle: 'short'});
  const ruleName = rule => ({straight: 'Straight', double: 'Double', master: 'Master'}[rule]);
  const description = c => `${c.start} · ${ruleName(c.out)} Out · ${c.format === 'best' ? 'Best of' : 'First to'} ${c.legs} Legs${c.sets > 1 ? ` · ${c.sets} Sets` : ''}`;
  const button = (action, text, cls = '', extra = '') => `<button type="button" class="scorer-button ${cls}" data-action="${action}" ${extra}>${text}</button>`;
  const view = $('#scorer-view');
  let matches = [], currentId = null, state = null, multiplier = 1, botTimer = null, storageBlocked = false, externalChange = false;
  let route = 'setup', statsCategory = 'all', focusAfterRender = false;
  let sharing = false, shareFeedback = {id: null, text: ''};
  let draft = {players: [{name: 'Bastl', computer: false}, {name: 'Ginzei', computer: false}], start: 501, in: 'straight', out: 'double', legs: 3, sets: 1, format: 'first', random: false, startingPlayer: ''};
  function announce(text) { $('#scorer-message').textContent = text; }
  function warning(text) { const el = $('#storage-warning'); el.hidden = !text; el.textContent = text; }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.version !== 1 || !Array.isArray(data.matches)) throw new Error('Unbekanntes Speicherformat.');
      for (const match of data.matches) {
        if (typeof match.id !== 'string' || !Array.isArray(match.events) || !Number.isFinite(Date.parse(match.createdAt)) || !Number.isFinite(Date.parse(match.updatedAt))) throw new Error('Ungültiges gespeichertes Spiel.');
        E.replay(match.config, match.events);
      }
      matches = data.matches;
    } catch {
      storageBlocked = true;
      warning('Der lokale Speicher ist nicht verfügbar oder enthält unlesbare Daten. Neue Spiele bleiben nur in dieser Sitzung erhalten. Bestehende Speicherdaten werden nicht überschrieben; exportiere wichtige Spiele.');
    }
  }
  function save() {
    if (externalChange) return false;
    if (storageBlocked) return true;
    try { localStorage.setItem(KEY, JSON.stringify({version: 1, matches})); }
    catch { storageBlocked = true; warning('Speichern auf diesem Gerät fehlgeschlagen. Das Spiel bleibt in dieser Sitzung erhalten. Bitte als JSON exportieren, bevor du die Seite schließt.'); }
    return true;
  }
  function current() { return matches.find(m => m.id === currentId); }
  function selectMatch(id) {
    const match = matches.find(m => m.id === id);
    if (!match) return false;
    currentId = id; state = E.replay(match.config, match.events); return true;
  }
  function go(next, id = currentId) {
    const hash = `#${next}${id && !['setup', 'games'].includes(next) ? '/' + encodeURIComponent(id) : ''}`;
    if (location.hash === hash) render(); else location.hash = hash;
  }
  function readRoute() {
    const [page, id] = location.hash.slice(1).split('/');
    if (page === 'scorer-content') return;
    route = ['setup', 'games', 'live', 'summary', 'stats'].includes(page) ? page : 'setup';
    if (id) {
      try { if (!selectMatch(decodeURIComponent(id))) route = 'games'; }
      catch { route = 'games'; }
    }
    if (['live', 'summary', 'stats'].includes(route) && !current()) route = 'games';
    multiplier = 1; focusAfterRender = true; render(); window.scrollTo(0, 0);
  }
  function title(kicker, heading, right = '') { return `<div class="scorer-title"><div><p class="scorer-eyebrow">${kicker}</p><h1 tabindex="-1">${heading}<em>.</em></h1></div>${right}</div>`; }
  function options(values, selected) { return values.map(value => { const [id, label] = Array.isArray(value) ? value : [value, value]; return `<option value="${id}" ${String(id) === String(selected) ? 'selected' : ''}>${label}</option>`; }).join(''); }
  function field(name, text, values) { return `<label class="scorer-field"><span>${text}</span><select name="${name}">${options(values, draft[name])}</select></label>`; }
  function readDraft() {
    const form = $('#setup-form'); if (!form) return;
    draft.players = draft.players.map((p, i) => ({...p, name: form.elements[`player-${i}`].value, level: form.elements[`level-${i}`]?.value || p.level}));
    for (const key of ['start', 'legs', 'sets']) draft[key] = Number(form.elements[key].value);
    for (const key of ['in', 'out', 'format']) draft[key] = form.elements[key].value;
    draft.random = form.elements.random.checked;
    draft.startingPlayer = form.querySelector('[name="startingPlayer"]:checked')?.value || '';
  }
  function syncStarterOptions(selected) {
    const form = $('#setup-form'); if (!form) return;
    if (selected === undefined) selected = form.querySelector('[name="startingPlayer"]:checked')?.value || '';
    if (draft.players.length === 1) selected = '0';
    const choices = draft.players.map((p, i) => [String(i), form.elements[`player-${i}`].value.trim() || `Spieler ${i + 1}`]);
    if (draft.players.length > 1) choices.push(['random', 'Zufällig bestimmen']);
    $('#starter-options').replaceChildren(...choices.map(([value, name]) => {
      const label = document.createElement('label'); label.className = 'starter-choice';
      const input = document.createElement('input');
      input.type = 'radio'; input.name = 'startingPlayer'; input.value = value;
      input.required = draft.players.length > 1; input.disabled = draft.players.length === 1;
      input.checked = value === selected;
      const text = document.createElement('span'); text.textContent = name;
      label.append(input, text); return label;
    }));
  }
  function setup() {
    const resumable = matches.filter(m => E.replay(m.config, m.events).phase !== 'finished');
    return `${title('DAS BOARD GEHÖRT EUCH', 'Scorer', button('preset', 'Liga-Preset'))}
      ${resumable.length ? `<p class="scorer-hint" style="margin:0 0 20px">${resumable.length} laufende${resumable.length === 1 ? 's Spiel' : ' Spiele'} · <a href="#games">Weiterspielen</a></p>` : ''}
      <form id="setup-form"><div id="setup-error" class="scorer-error" role="alert" hidden></div><div class="scorer-layout">
      <section class="scorer-panel" aria-labelledby="players-title"><div class="panel-heading"><h2 id="players-title">Spieler</h2><span class="panel-number">01</span></div>
      ${draft.players.map((p, i) => `<div class="scorer-player"><span class="scorer-player-num">${String(i + 1).padStart(2, '0')}</span><input aria-label="Name Spieler ${i + 1}" name="player-${i}" value="${escape(p.name)}" maxlength="32" list="league-players" autocomplete="off" required><div class="scorer-player-tools"><button type="button" data-action="up" data-index="${i}" aria-label="Spieler ${i + 1} nach oben" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" data-action="remove" data-index="${i}" aria-label="Spieler ${i + 1} entfernen">×</button></div>${p.computer ? `<label class="visually-hidden" for="bot-level-${i}">Computer-Stärke Spieler ${i + 1}</label><select id="bot-level-${i}" class="bot-level" name="level-${i}">${options([['easy', 'Computer · Einfach'], ['medium', 'Computer · Mittel'], ['hard', 'Computer · Stark']], p.level || 'medium')}</select>` : ''}</div>`).join('')}
      <datalist id="league-players">${players.map(p => `<option value="${escape(p.name)}"></option>`).join('')}</datalist>
      <div class="scorer-add">${button('add', '+ Spieler', '', draft.players.length >= 4 ? 'disabled' : '')}${button('bot', '+ Computer', '', draft.players.length >= 4 ? 'disabled' : '')}</div>
      <fieldset id="starter-field" class="starter-field" aria-describedby="starter-error starter-hint"><legend id="starter-label" tabindex="-1">Anwurf</legend><div id="starter-options" class="starter-options"></div><p id="starter-error" class="scorer-field-error" role="alert" hidden>Bitte den Gewinner des Ausbullens oder einen zufälligen Anwurf auswählen.</p><p id="starter-hint" class="scorer-hint">Gewinner des Ausbullens wählen. Danach wechselt der Anwurf je Leg.</p></fieldset>
      <label class="scorer-check"><input type="checkbox" name="random" ${draft.random ? 'checked' : ''}> Zufällige Reihenfolge</label><p class="scorer-hint">${draft.players.length === 0 ? 'Füge einen Spieler hinzu, um zu starten.' : draft.players.length === 1 ? 'Solotraining · Du wirfst jede Aufnahme selbst.' : '1–4 Spieler · Allein trainieren oder gegeneinander spielen.'}</p></section>
      <section class="scorer-panel" aria-labelledby="rules-title"><div class="panel-heading"><h2 id="rules-title">X01 · Spielmodus</h2><span class="panel-number">02</span></div>
      ${field('start', 'Startpunkte', [101, 301, 501, 701, 1001])}${field('out', 'Check-out', [['double', 'Double Out'], ['straight', 'Straight Out'], ['master', 'Master Out']])}${field('legs', 'Legs', [1, 2, 3, 4, 5, 6, 7, 9, 11, 12, 15])}${field('sets', 'Sets', [1, 2, 3, 5, 7, 9])}
      <details><summary>Erweiterte Optionen</summary>${field('in', 'Check-in', [['straight', 'Straight In'], ['double', 'Double In']])}${field('format', 'Set-/Leg-Modus', [['first', 'First to'], ['best', 'Best of']])}<p class="scorer-hint">First to: benötigte Siege. Best of: maximale Anzahl; bei gerader Leg-Anzahl und einem Set ist ein Remis möglich. Master Out: letzter Dart auf Double oder Triple.</p></details>
      </section></div><div class="scorer-start"><p>Jeden Dart einzeln eingeben. Dein Spiel wird nach jedem Wurf auf diesem Gerät gesichert.</p><button class="scorer-button primary" type="submit" ${draft.players.length === 0 ? 'disabled' : ''}>Spiel starten <span aria-hidden="true">→</span></button></div></form>`;
  }
  function scoreCards() {
    return state.players.map((p, i) => {
      const stats = E.statistics(state, i);
      const visits = state.visits.filter(v => v.player === i && v.leg === state.legNo);
      const turn = state.turn?.player === i ? state.turn : null;
      const visit = turn || visits.at(-1);
      const darts = visits.reduce((n, v) => n + E.visitDartCount(v), 0) + (turn?.darts.length || 0);
      const active = state.active === i && state.phase === 'playing';
      const visitNumber = visits.length + (turn ? 1 : 0);
      const slots = visit?.darts || [];
      return `<article class="score-player ${active ? 'active' : ''}" aria-label="${escape(p.name)}, ${p.remaining} Restpunkte${active ? ', am Wurf' : ''}"><div class="score-player-top"><div class="score-player-identity"><h2 class="score-player-name">${escape(p.name)}</h2><span class="score-player-status">${visitNumber ? `Aufnahme ${visitNumber}` : 'Noch keine Aufnahme'}${active ? ' · AM WURF' : p.computer ? ' · COMPUTER' : ''}</span></div><div class="score-player-visit" role="group" aria-label="${escape(p.name)}, ${turn ? 'aktuelle' : 'letzte'} Aufnahme${visit?.bust ? ', überworfen' : ''}">${[0, 1, 2].map(n => `<span class="score-dart ${slots[n] ? 'filled' : ''}">${slots[n] ? E.label(slots[n]) : '–'}</span>`).join('')}<strong class="score-visit-total ${visit?.bust ? 'bust' : ''}" aria-label="${visit?.score || 0} Punkte in der Aufnahme">${visit?.score || 0}</strong></div></div><div class="score-player-body"><strong class="score-remaining">${p.remaining}</strong><div class="score-metrics"><span><strong>${p.legs}</strong>LEGS</span>${state.config.sets > 1 ? `<span><strong>${p.sets}</strong>SETS</span>` : ''}<span><strong>${number(stats.average, 1)}</strong>Ø 3 DARTS</span></div></div><div class="score-player-bottom"><span>${darts} Darts im Leg</span><span>${visit?.bust ? 'ÜBERWORFEN' : p.opened ? 'RESTPUNKTE' : 'DOUBLE IN AUSSTEHEND'}</span></div></article>`;
    }).join('');
  }
  function live() {
    const p = state.players[state.active], turn = state.turn;
    const bot = p.computer;
    const active = state.phase === 'playing';
    const dartsLeft = active ? 3 - turn.darts.length : 0;
    const suggestion = active && p.opened ? E.checkout(p.remaining, dartsLeft, state.config.out) : null;
    const dartCount = `${dartsLeft} Dart${dartsLeft === 1 ? '' : 's'} übrig`;
    return `<div class="scorer-game-surface">${title(`SET ${String(state.setNo).padStart(2, '0')} / LEG ${String(state.legNo).padStart(2, '0')}`, 'Game on', button('games', 'Pausieren'))}<p class="scorer-subtitle" style="margin:-8px 0 18px">${description(state.config)}</p>
      <div class="scorer-live-layout"><div><div class="scoreboard" style="--score-players:${state.players.length}">${scoreCards()}</div>
      </div>
      <section class="scorer-input ${active && p.opened && !suggestion ? 'compact-hint' : ''}" aria-label="Darteingabe für ${escape(p.name)}">
      <p class="checkout-hint" role="status" aria-live="polite" aria-atomic="true">${suggestion ? `<span>Checkout · ${p.remaining} Rest · ${dartCount}</span><strong class="checkout-route">${suggestion.map(E.label).join(' <span aria-hidden="true">→</span> ')}</strong>` : !active ? 'Der nächste Anwurf wechselt.' : !p.opened ? `<span>${dartCount} · Double In</span>Double treffen, um ins Spiel einzusteigen.` : `<span>${p.remaining} Rest · ${dartCount}</span>`}</p>
      <div class="dart-keypad" role="group" aria-label="Getroffenes Feld und Multiplikator">${Array.from({length: 20}, (_, i) => i + 1).concat(25).map(n => `<button type="button" data-field="${n}" aria-label="${multiplier === 3 ? 'Triple' : multiplier === 2 ? 'Double' : 'Single'} ${n}" ${!active || bot || externalChange || n === 25 && multiplier === 3 ? 'disabled' : ''}>${n}</button>`).join('')}<button type="button" class="dart-miss" data-field="0" aria-label="0 · Daneben" ${!active || bot || externalChange ? 'disabled' : ''}>0</button>${[2, 3].map(m => `<button type="button" class="dart-multiplier" data-multiplier="${m}" aria-label="${m === 2 ? 'Double' : 'Triple'} für den nächsten Dart, erneut tippen für Single" aria-pressed="${m === multiplier}" ${!active || bot || externalChange ? 'disabled' : ''}><span>${m === 2 ? 'DOUBLE' : 'TRIPLE'}</span>${m === multiplier ? '<small aria-hidden="true">✓</small>' : ''}</button>`).join('')}<button type="button" class="dart-undo" data-action="undo" ${!current().events.length || externalChange ? 'disabled' : ''}>↶ Zurück</button></div>
      <p class="input-notice" role="status">${escape(state.notice || (bot && active ? 'Der Computer wirft automatisch. Pausieren hält das Spiel an.' : ''))}</p></section></div></div>
      <div class="scorer-live-tools">${button('stats', 'Statistik')}${button('summary', 'Leg-Übersicht')}${button('export', 'JSON exportieren')}</div>
      <details class="scorer-detail"><summary>Wurfverlauf · ${state.visits.length} Aufnahmen</summary>${visitList()}</details>`;
  }
  function visitList() {
    return state.visits.length ? `<ol class="visit-list" reversed>${[...state.visits].reverse().map(v => `<li><span>L${v.leg}</span><b>${escape(state.players[v.player].name)}</b><span class="${v.bust ? 'visit-bust' : ''}">${v.bust ? 'BUST · ' : ''}${v.darts.map(E.label).join(' · ')}</span><span>${v.score}</span></li>`).join('')}</ol>` : '<p class="scorer-hint">Noch keine abgeschlossene Aufnahme.</p>';
  }
  function games() {
    return `${title('AUF DIESEM GERÄT', 'Alle Spiele', button('setup', '+ Neues Spiel', 'primary'))}${matches.length ? [...matches].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(m => { const s = E.replay(m.config, m.events); return `<article class="saved-game"><div><span class="scorer-tag">${s.phase === 'finished' ? s.draw ? 'Unentschieden' : 'Beendet' : 'Laufend · fortsetzen'}</span><h2>${m.config.players.map(p => escape(p.name)).join(' <span style="color:var(--muted)">/</span> ')} <span style="color:var(--accent)">${s.players.map(p => p.totalLegs).join(':')}</span></h2><p>${date(m.createdAt)} · ${description(m.config)}</p></div><div class="scorer-actions">${button('open', s.phase === 'finished' ? 'Zusammenfassung' : 'Weiterspielen', 'primary', `data-id="${escape(m.id)}"`)}${button('delete', 'Löschen', '', `data-id="${escape(m.id)}"`)}</div></article>`; }).join('') : `<div class="scorer-empty"><h2>Das erste Leg wartet.</h2><p>Deine laufenden und beendeten Spiele findest du hier.</p>${button('setup', 'Neues Spiel', 'primary')}</div>`}`;
  }
  function legOverview() {
    if (!state.legs.length) return '<p class="scorer-hint">Die Leg-Übersicht erscheint nach dem ersten Checkout.</p>';
    return `<section class="leg-overview" aria-labelledby="leg-overview-title"><h2 id="leg-overview-title">Leg-Übersicht</h2><p class="scorer-hint">✓ Leg gewonnen · Ø pro 3 Darts</p><div class="leg-overview-grid">${state.legs.map(l => `<article class="leg-card"><table><caption><span>${state.config.sets > 1 ? `Set ${l.set} · ` : ''}Leg ${l.number}</span><span class="leg-checkout">Checkout <strong>${l.players[l.winner].checkout}</strong></span></caption><thead><tr><th scope="col">Spieler</th><th scope="col">Darts</th><th scope="col">3-Dart-Ø</th><th scope="col">Rest</th></tr></thead><tbody>${state.players.map((p, i) => `<tr class="${l.winner === i ? 'leg-winner' : ''}"><th scope="row">${escape(p.name)}${l.winner === i ? ' <span aria-label="Leg gewonnen">✓</span>' : ''}</th><td>${l.players[i].darts}</td><td>${number(l.players[i].average)}</td><td>${l.players[i].remaining}</td></tr>`).join('')}</tbody></table></article>`).join('')}</div></section>`;
  }
  function shareButton() { return button('share', sharing ? 'Teilen …' : 'Teilen', '', sharing ? 'disabled' : ''); }
  function shareStatus() {
    const text = shareFeedback.id === currentId ? shareFeedback.text : '';
    return `<p class="scorer-share-status" data-share-feedback role="status" ${text ? '' : 'hidden'}>${escape(text)}</p>`;
  }
  function summary() {
    const m = current(), finished = state.phase === 'finished';
    const winner = state.winner === null ? null : state.players[state.winner];
    const heading = finished ? state.draw ? 'Unentschieden' : `${escape(winner.name)} gewinnt.` : 'Spiel läuft.';
    return `${title(finished ? 'SPIELZUSAMMENFASSUNG' : 'ZWISCHENSTAND', 'Dein Spiel')}
      <div class="summary-result"><div><span class="scorer-tag">${finished ? 'Beendet' : 'Laufend'} · ${date(m.createdAt)}</span><h2>${heading}</h2><p>${description(state.config)}</p>${state.config.sets > 1 ? `<p>Sets ${state.players.map(p => `${escape(p.name)} ${p.sets}`).join(' : ')}</p>` : ''}</div><strong class="summary-score" aria-label="Leg-Ergebnis">${state.players.map(p => p.totalLegs).join(':')}</strong></div>
      ${legOverview()}
      <details class="scorer-detail"><summary>Wurfverlauf</summary>${visitList()}</details><p class="scorer-hint">Dieses Spiel ist lokal gespeichert. Es wird nicht in die Ligatabelle übernommen.</p>
      <div class="summary-actions" role="group" aria-label="Spielaktionen">${button('stats', 'Statistiken', 'primary')}${!finished ? button('live', 'Weiterspielen') : button('setup', 'Neues Spiel')}${button('games', 'Alle Spiele')}${button('export', 'JSON exportieren')}${finished ? shareButton() + button('undo', '↶ Letzten Dart korrigieren') : ''}</div>${finished ? shareStatus() : ''}`;
  }
  const groups = [
    ['wins', 'Set-/Leg-Siegstatistiken', [['Legs gespielt', 'legsPlayed', 0], ['Legs gewonnen', 'legsWon', 0], ['Leg-Siegrate', 'legWinRate', 2, '%'], ['Sets gewonnen', 'setsWon', 0]]],
    ['scoring', 'Wurfstatistiken', [['Darts geworfen', 'darts', 0], ['3-Dart-Ø', 'average'], ['First-9-Ø', 'first9'], ['Höchste Runde', 'highestVisit', 0], ['Bester Leg-Ø', 'bestLegAverage'], ['Erzielte Punkte', 'total', 0], ['Dart 1 Ø', 'position0'], ['Dart 2 Ø', 'position1'], ['Dart 3 Ø', 'position2']]],
    ['accuracy', 'Trefferraten', [['20 Trefferrate', 'hit20', 2, '%'], ['20/19 Trefferrate', 'hit2019', 2, '%'], ['60 Trefferrate', 'hit60', 2, '%'], ['60/57 Trefferrate', 'hit6057', 2, '%'], ['Triple-Rate', 'tripleRate', 2, '%']]],
    ['highs', 'Hohe Runden', [['60–99', 'high60', 0], ['100–139', 'high100', 0], ['140–179', 'high140', 0], ['180', 'high180', 0]]],
    ['accuracy', 'Felder-Statistiken', [['1 Rate', 'field1', 2, '%'], ['5 Rate', 'field5', 2, '%'], ['20 Rate', 'field20', 2, '%']]],
    ['checkout', 'Checkout-Statistiken', [['Höchstes Checkout', 'highestCheckout', 0], ['Minimum Darts', 'minDarts', 0, '', 'min'], ['Möglichkeiten', 'checkoutAttempts', 0], ['Rate', 'checkoutRate', 2, '%']]],
    ['checkout', 'Check-in-Statistiken', [['Möglichkeiten', 'checkinAttempts', 0], ['Erfolge', 'checkinSuccesses', 0], ['Rate', 'checkinRate', 2, '%']]]
  ];
  function stats() {
    const stats = state.players.map((_, i) => E.statistics(state, i));
    stats.forEach(s => s.positional.forEach((value, i) => { s[`position${i}`] = value; }));
    return `${title('JEDER DART ZÄHLT', 'Statistiken', button('summary', 'Zurück'))}<p class="scorer-subtitle">${description(state.config)}</p>
      <div class="stats-sticky"><label for="scorer-stat-filter">Kategorie</label><select id="scorer-stat-filter">${options([['all', 'Alle Statistiken'], ['wins', 'Siege'], ['scoring', 'Scoring'], ['accuracy', 'Trefferraten'], ['highs', 'Hohe Runden'], ['checkout', 'Check-in & Checkout']], statsCategory)}</select>${button(state.phase === 'finished' ? 'summary' : 'live', state.phase === 'finished' ? 'Ergebnis' : 'Zum Spiel')}</div>
      ${groups.filter(([id]) => statsCategory === 'all' || id === statsCategory).map(([, heading, rows]) => `<div class="scorer-table-scroll stats-group"><table class="scorer-table stats-table" role="table"><caption>${heading}</caption><thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Kennzahl</th>${state.players.map(p => `<th scope="col" role="columnheader">${escape(p.name)}</th>`).join('')}</tr></thead><tbody role="rowgroup">${rows.map(([label, key, digits = 2, suffix = '', direction]) => {
        const values = stats.map(s => s[key]); const available = values.filter(v => v !== null); const best = available.length ? Math[direction === 'min' ? 'min' : 'max'](...available) : null;
        return `<tr role="row"><th scope="row" role="rowheader">${label}</th>${values.map((value, i) => `<td role="cell" data-player="${escape(state.players[i].name)}" class="${value !== null && value === best ? 'stat-best' : ''}">${number(value, digits)}${value === null ? '' : suffix ? ' ' + suffix : ''}</td>`).join('')}</tr>`;
      }).join('')}</tbody></table></div>`).join('')}
      <details class="scorer-detail"><summary>So wird gerechnet</summary><p class="scorer-hint">3-Dart-Ø = gültige Punkte / gewertete Darts × 3. Ein Bust zählt 0 Punkte und immer 3 Darts, auch wenn früher überworfen wurde. Ein Checkout zählt nur die tatsächlich geworfenen Darts. First-9 und Dart-Positionen zählen ungenutzte Bust-Darts als 0 Punkte. Der Match-Ø verwendet alle Punkte und Darts, keinen Mittelwert der Leg-Averages.</p><p class="scorer-hint">Trefferquoten und Checkout-Möglichkeiten zählen nur eingegebene Darts, keine ungeworfenen Bust-Darts. Checkout-Möglichkeiten zählen jeden Dart, vor dem ein Finish mit einem Dart möglich war. Die Rate ist gewonnene Legs / Möglichkeiten. Beim Check-in zählt jeder Dart vor dem ersten gültigen Double. 180er zählen nur abgeschlossene, gültige Aufnahmen mit genau 180 Punkten. Hohe Runden verwenden getrennte Bereiche ohne Doppelzählung. Fehlende Werte erscheinen als –.</p></details>`;
  }
  function syncLegDialog() {
    const dialog = $('#leg-dialog');
    const show = route === 'live' && state && state.phase !== 'playing' && !externalChange;
    document.body.classList.toggle('leg-result-open', Boolean(show));
    if (!show) {
      if (dialog.open) dialog.close();
      dialog.dataset.result = '';
      return;
    }
    const key = `${currentId}:${state.legNo}:${state.phase}`;
    if (dialog.dataset.result !== key) {
      const last = state.legs.at(-1);
      const winner = state.players[last.winner];
      const finished = state.phase === 'finished';
      const nextStarter = state.players[(state.starter + 1) % state.players.length];
      dialog.innerHTML = `<p class="scorer-eyebrow">GAME SHOT</p><h2 id="leg-result-title">${finished ? state.draw ? 'Unentschieden.' : 'Spiel gewonnen.' : state.nextSet ? 'Set gewonnen.' : 'Leg gewonnen.'}</h2>
        <p class="leg-result-winner">${escape(winner.name)} checkt aus.</p>
        <div class="leg-result-scores">${state.players.map(p => `<div><span>${escape(p.name)}</span><strong>${p.totalLegs}</strong><small>Legs</small></div>`).join('')}</div>
        <p class="leg-result-note">${finished ? 'Das Spiel ist gespeichert.' : `${escape(nextStarter.name)} beginnt das nächste ${state.nextSet ? 'Set' : 'Leg'}.`}</p>
        <div class="leg-result-actions">${button(finished ? 'summary' : 'next', finished ? 'Zum Ergebnis →' : state.nextSet ? 'Nächstes Set →' : 'Nächstes Leg →', 'primary')}${finished ? shareButton() : ''}${button('undo', '↶ Zurück / korrigieren', '', 'autofocus aria-describedby="leg-result-help"')}</div>${finished ? shareStatus() : ''}
        <p id="leg-result-help" class="leg-result-help">Falsch eingegeben? Zurück nimmt die letzte Eingabe zurück.</p>`;
      dialog.dataset.result = key;
    }
    if (!dialog.open) dialog.showModal();
  }
  $('#leg-dialog').addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target || target.disabled || externalChange) return;
    if (target.dataset.action === 'undo') undo();
    else if (target.dataset.action === 'next') record({type: 'next'});
    else if (target.dataset.action === 'summary') go('summary');
    else if (target.dataset.action === 'share') shareMatch();
  });
  $('#leg-dialog').addEventListener('cancel', event => { event.preventDefault(); undo(); });
  function sizeScoringSurface() {
    const surface = view.querySelector('.scorer-game-surface');
    if (surface) view.style.setProperty('--scoring-top', `${surface.getBoundingClientRect().top + window.scrollY}px`);
  }
  window.addEventListener('resize', sizeScoringSurface);
  document.fonts?.ready.then(sizeScoringSurface);
  function render() {
    clearTimeout(botTimer);
    const focused = document.activeElement;
    const restoreFocus = focused?.matches('#scorer-view button') ? ['field', 'multiplier', 'action'].find(key => focused.dataset[key] !== undefined) : null;
    const focusValue = restoreFocus ? focused.dataset[restoreFocus] : null;
    document.body.classList.toggle('scorer-live-page', route === 'live');
    $('#game-count').textContent = matches.length;
    $('#live-link').hidden = !current() || state.phase === 'finished';
    document.querySelectorAll('[data-route]').forEach(a => { if (a.dataset.route === route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    view.innerHTML = ({setup, games, live, summary, stats}[route] || setup)();
    if (route === 'setup') syncStarterOptions(draft.startingPlayer);
    sizeScoringSurface();
    if (focusAfterRender) { view.querySelector('h1')?.focus({preventScroll: true}); focusAfterRender = false; }
    else if (restoreFocus) view.querySelector(`button[data-${restoreFocus}="${CSS.escape(focusValue)}"]:not(:disabled)`)?.focus({preventScroll: true});
    syncLegDialog();
    syncShareUI();
    if (route === 'live' && state.phase === 'playing' && state.players[state.active].computer && !externalChange && !document.hidden) {
      const matchId = currentId;
      botTimer = setTimeout(() => { if (currentId === matchId && route === 'live') record(E.botDart(state)); }, 850);
    }
  }
  function record(event) {
    if (externalChange) return;
    const m = current();
    try {
      const next = E.replay(m.config, [...m.events, event]);
      m.events.push(event); m.updatedAt = new Date().toISOString();
      m.finishedAt = next.phase === 'finished' ? m.updatedAt : null;
      state = next; multiplier = 1; save();
      if (state.phase === 'finished') { render(); announce(state.draw ? 'Unentschieden.' : state.players[state.winner].name + ' gewinnt das Spiel.'); }
      else { render(); announce(state.phase === 'between' ? state.players[state.active].name + ' gewinnt das Leg.' : `${state.notice} ${state.players[state.active].name}: ${state.players[state.active].remaining} Rest.`); }
    } catch (error) { announce(error.message); }
  }
  function undo() {
    if (externalChange || !current()?.events.length) return;
    clearTimeout(botTimer);
    const m = current();
    // Undo the latest human dart together with any following automatic bot darts.
    let index = m.events.length - 1;
    if (m.events[index].type !== 'next') {
      while (index > 0) {
        const before = E.replay(m.config, m.events.slice(0, index));
        if (!before.players[before.active].computer) break;
        index--;
      }
    }
    m.events.splice(index); m.updatedAt = new Date().toISOString(); m.finishedAt = null;
    state = E.replay(m.config, m.events); multiplier = 1; save(); announce('Letzte Eingabe zurückgenommen.');
    if (route !== 'live') go('live'); else render();
  }
  function downloadExport(exported) {
    const blob = new Blob([exported.json], {type: 'application/json'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = exported.filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportMatch() { downloadExport(window.DartsShare.prepare(current(), state, E)); }
  function syncShareUI() {
    document.querySelectorAll('button[data-action="share"]').forEach(b => { b.disabled = sharing; b.textContent = sharing ? 'Teilen …' : 'Teilen'; });
    const text = shareFeedback.id === currentId ? shareFeedback.text : '';
    document.querySelectorAll('[data-share-feedback]').forEach(el => { el.textContent = text; el.hidden = !text; });
  }
  async function shareMatch() {
    if (sharing || !current() || state.phase !== 'finished') return;
    const matchId = currentId;
    const exported = window.DartsShare.prepare(current(), state, E);
    sharing = true; shareFeedback = {id: matchId, text: ''}; syncShareUI();
    try {
      const result = await window.DartsShare.share(exported);
      if (result.status === 'download') {
        downloadExport(exported);
        const reason = result.reason === 'insecure' ? 'Direktes Teilen ist hier nur über HTTPS verfügbar.' : result.reason === 'failed' ? 'Direktes Teilen hat nicht geklappt.' : 'Dein Browser kann diese JSON-Datei nicht direkt teilen.';
        shareFeedback = {id: matchId, text: `${reason} Der JSON-Download wurde gestartet. Öffne die Datei in Downloads und teile sie über WhatsApp, oder hänge sie dort als Dokument an.`};
      } else if (result.status === 'shared') {
        shareFeedback = {id: matchId, text: 'Datei an das Teilen-Menü übergeben. Empfänger und Versand bestätigst du in der gewählten App.'};
      }
    } catch {
      shareFeedback = {id: matchId, text: 'Teilen ist gerade nicht möglich. Nutze „JSON exportieren“ und hänge die Datei in WhatsApp als Dokument an.'};
    } finally { sharing = false; syncShareUI(); }
  }
  function focusMissingStarter() {
    const field = $('#starter-field');
    $('#starter-error').hidden = false;
    field.setAttribute('aria-invalid', 'true');
    field.scrollIntoView({block: 'center', behavior: 'instant'});
    $('#starter-label').focus({preventScroll: true});
  }
  // Required fields are checked before submit; catch native validation as well.
  view.addEventListener('invalid', event => {
    if (event.target.name !== 'startingPlayer') return;
    event.preventDefault();
    focusMissingStarter();
  }, true);
  view.addEventListener('submit', event => {
    if (event.target.id !== 'setup-form') return;
    event.preventDefault(); readDraft();
    if (externalChange) return;
    try {
      if (draft.players.length > 1 && draft.startingPlayer === '') { focusMissingStarter(); return; }
      const startingPlayer = draft.players.length === 1 ? 0 : draft.startingPlayer === 'random' ? Math.floor(Math.random() * draft.players.length) : Number(draft.startingPlayer);
      let config = E.validate({...draft, startingPlayer});
      if (draft.random) {
        const starter = config.players[config.startingPlayer];
        config = {...config, players: [...config.players]};
        for (let i = config.players.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [config.players[i], config.players[j]] = [config.players[j], config.players[i]]; }
        config.startingPlayer = config.players.indexOf(starter);
      }
      const now = new Date().toISOString();
      const match = {id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`, createdAt: now, updatedAt: now, finishedAt: null, config, events: []};
      matches.push(match); selectMatch(match.id); save(); go('live');
    } catch (error) { const el = $('#setup-error'); el.textContent = error.message; el.hidden = false; el.scrollIntoView({block: 'nearest'}); }
  });
  view.addEventListener('change', event => {
    if (event.target.id === 'scorer-stat-filter') { statsCategory = event.target.value; render(); $('#scorer-stat-filter').focus(); }
    if (event.target.name === 'startingPlayer' && event.target.value !== '') {
      $('#starter-field').removeAttribute('aria-invalid');
      $('#starter-error').hidden = true;
    }
  });
  view.addEventListener('input', event => {
    if (event.target.name?.startsWith('player-')) syncStarterOptions();
  });
  view.addEventListener('click', async event => {
    const target = event.target.closest('button'); if (!target || target.disabled) return;
    if (target.dataset.field !== undefined) { record({type: 'dart', field: Number(target.dataset.field), multiplier: Number(target.dataset.field) === 0 ? 1 : multiplier}); return; }
    if (target.dataset.multiplier) { const selected = Number(target.dataset.multiplier); multiplier = multiplier === selected ? 1 : selected; render(); $(`[data-multiplier="${selected}"]`).focus({preventScroll: true}); return; }
    const action = target.dataset.action;
    if (['setup', 'games', 'live', 'stats', 'summary'].includes(action)) { go(action); return; }
    if (['add', 'bot', 'remove', 'up', 'preset'].includes(action)) {
      readDraft(); const i = Number(target.dataset.index);
      if (action === 'add' && draft.players.length < 4) draft.players.push({name: '', computer: false});
      if (action === 'bot' && draft.players.length < 4) { let n = 1; while (draft.players.some(p => p.name === `Computer ${n}`)) n++; draft.players.push({name: `Computer ${n}`, computer: true, level: 'medium'}); }
      if (action === 'remove') {
        draft.players.splice(i, 1);
        if (draft.startingPlayer !== '' && draft.startingPlayer !== 'random') {
          const selected = Number(draft.startingPlayer);
          draft.startingPlayer = selected === i ? '' : String(selected > i ? selected - 1 : selected);
        }
      }
      if (action === 'up' && i > 0) {
        [draft.players[i - 1], draft.players[i]] = [draft.players[i], draft.players[i - 1]];
        if (draft.startingPlayer === String(i)) draft.startingPlayer = String(i - 1);
        else if (draft.startingPlayer === String(i - 1)) draft.startingPlayer = String(i);
      }
      if (action === 'preset') { draft = {...draft, start: 501, in: 'straight', out: 'double', format: 'best', legs: 12, sets: 1, players: draft.players.slice(0, 2)}; announce('Liga-Preset: 501, Double Out, Best of 12.'); }
      if (draft.startingPlayer !== 'random' && Number(draft.startingPlayer) >= draft.players.length) draft.startingPlayer = '';
      render(); if (action === 'add' || action === 'bot') $(`[name="player-${draft.players.length - 1}"]`).focus();
      if (action === 'remove') (view.querySelector('input[name^="player-"]') || view.querySelector('[data-action="add"]')).focus();
    }
    if (action === 'next') record({type: 'next'});
    if (action === 'undo') undo();
    if (action === 'export') exportMatch();
    if (action === 'share') await shareMatch();
    if (action === 'open' && selectMatch(target.dataset.id)) go(state.phase === 'finished' ? 'summary' : 'live');
    if (action === 'delete' && !externalChange) {
      const id = target.dataset.id, dialog = $('#delete-dialog'); dialog.returnValue = ''; dialog.showModal();
      dialog.addEventListener('close', () => { if (dialog.returnValue !== 'delete' || externalChange) return; matches = matches.filter(m => m.id !== id); if (currentId === id) { currentId = null; state = null; } save(); render(); announce('Spiel gelöscht.'); }, {once: true});
    }
  });
  window.addEventListener('hashchange', readRoute);
  document.querySelector('.scorer-nav').addEventListener('click', () => { if (route === 'setup') readDraft(); });
  window.addEventListener('storage', event => {
    if (event.key === KEY || event.key === null) {
      externalChange = true; clearTimeout(botTimer);
      warning('Die gespeicherten Spiele wurden in einem anderen Tab geändert. Lade diese Seite neu, um mit dem aktuellen Stand weiterzuspielen.');
      const reload = document.createElement('button'); reload.className = 'scorer-button'; reload.textContent = 'Neu laden'; reload.addEventListener('click', () => location.reload()); $('#storage-warning').append(reload); render();
    }
  });
  document.addEventListener('visibilitychange', () => { if (route === 'live') render(); });
  document.addEventListener('keydown', event => {
    if (route !== 'live' || event.ctrlKey || event.metaKey || event.altKey || /INPUT|SELECT|TEXTAREA|BUTTON/.test(event.target.tagName)) return;
    if (event.key === 'Backspace') { event.preventDefault(); undo(); }
    if (['s', 'd', 't'].includes(event.key.toLowerCase()) && state.phase === 'playing' && !state.players[state.active].computer) { multiplier = {s: 1, d: 2, t: 3}[event.key.toLowerCase()]; render(); }
  });
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js', {scope: './'}).catch(() => {}));
  load();
  const lastMatch = [...matches].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).find(m => E.replay(m.config, m.events).phase !== 'finished');
  if (lastMatch) selectMatch(lastMatch.id);
  readRoute();
})();
