const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const base = 'https://basthel.github.io/champions-league-spielplan/';

function workerHarness() {
  const events = {}, stores = new Map();
  let online = true, revision = 'old', claimed = false;
  const normalize = request => typeof request === 'string' ? request : request.url;
  const fetch = async request => {
    if (!online) throw new Error('offline');
    return new Response(revision + ':' + normalize(request), {status: 200});
  };
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async key => stores.delete(key),
    open: async name => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        addAll: async requests => {
          const values = await Promise.all(requests.map(async request => [normalize(request), await fetch(request)]));
          for (const [key, value] of values) store.set(key, value);
        },
        put: async (key, value) => store.set(normalize(key), value.clone()),
        match: async key => store.get(normalize(key))?.clone()
      };
    }
  };
  const context = {
    URL, Request, Response, AbortController, setTimeout, clearTimeout, caches, fetch,
    self: {location: {href: base + 'service-worker.js'}, skipWaiting: async () => {},
      clients: {claim: async () => { claimed = true; }},
      addEventListener: (type, callback) => { events[type] = callback; }}
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8'), context);
  return {
    stores, caches, online: value => { online = value; }, revision: value => { revision = value; },
    claimed: () => claimed,
    event: async type => {
      let promise;
      events[type]({waitUntil: value => { promise = value; }});
      await promise;
    },
    request: async (url, mode = 'cors', method = 'GET') => {
      let promise;
      events.fetch({request: {url, mode, method}, respondWith: value => { promise = value; }});
      return promise;
    }
  };
}

test('manifest installs within the GitHub Pages project and has correctly sized PNG icons', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest')));
  const url = base + 'manifest.webmanifest';
  assert.equal(manifest.display, 'standalone');
  assert.equal(new URL(manifest.start_url, url).href, base);
  assert.equal(new URL(manifest.scope, url).href, base);
  assert.equal(new URL(manifest.id, url).href, base);
  for (const size of [192, 512]) {
    const icon = manifest.icons.find(icon => icon.sizes === size + 'x' + size && icon.purpose === 'any');
    assert.ok(icon);
    const png = fs.readFileSync(path.join(root, icon.src));
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});

test('precache supports offline deep links, data and versioned script requests', async () => {
  const worker = workerHarness();
  await worker.event('install');
  await worker.event('activate');
  assert.equal(worker.claimed(), true);
  worker.online(false);
  const page = await worker.request(base + '?spieler=abi', 'navigate');
  assert.match(await page.text(), /old:/);
  const script = await worker.request(base + 'app.js?v=new-query');
  assert.match(await script.text(), /app.js/);
  const data = await worker.request(base + 'league-data.js?v=results-2');
  assert.match(await data.text(), /league-data.js/);
  const scorer = await worker.request(base + 'scorer.html?preview=1#live/saved-game', 'navigate');
  assert.match(await scorer.text(), /scorer.html/);
  for (const file of ['scorer.css', 'checkout-data.js', 'scorer-engine.js', 'scorer-share.js', 'scorer.js']) {
    assert.match(await (await worker.request(base + file + '?v=1')).text(), new RegExp(file.replace('.', '\\.')));
  }
});

test('every precached app asset exists on disk', async () => {
  const worker = workerHarness();
  await worker.event('install');
  for (const cache of worker.stores.values()) {
    for (const url of cache.keys()) assert.ok(fs.existsSync(path.join(root, new URL(url).pathname.slice(new URL(base).pathname.length))), url);
  }
});

test('online requests refresh cached league data rather than keeping stale results', async () => {
  const worker = workerHarness();
  await worker.event('install');
  worker.revision('updated');
  assert.match(await (await worker.request(base + 'league-data.js?v=next')).text(), /^updated:/);
  worker.online(false);
  assert.match(await (await worker.request(base + 'league-data.js?v=next')).text(), /^updated:/);
});

test('activation removes only this app caches and leaves unrelated site caches alone', async () => {
  const worker = workerHarness();
  await worker.caches.open('haumdaucher-champions-league-v0');
  await worker.caches.open('unrelated-app');
  await worker.event('install');
  await worker.event('activate');
  assert.equal(worker.stores.has('haumdaucher-champions-league-v0'), false);
  assert.equal(worker.stores.has('unrelated-app'), true);
});

test('worker ignores other GitHub Pages projects, external hosts and non-GET requests', async () => {
  const worker = workerHarness();
  assert.equal(await worker.request('https://basthel.github.io/other-project/app.js'), undefined);
  assert.equal(await worker.request('https://example.com/app.js'), undefined);
  assert.equal(await worker.request(base + 'app.js', 'cors', 'POST'), undefined);
});

test('install prompt is shown only after a user click and hidden once installed', async () => {
  const events = {}, handlers = {}, button = {hidden: true, addEventListener: (type, fn) => { handlers[type] = fn; }};
  const status = {hidden: true};
  let prompts = 0, registered = null;
  const navigator = {onLine: true, serviceWorker: {register: async (url, options) => { registered = {url, options}; }}};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'pwa.js'), 'utf8'), {
    document: {querySelector: selector => selector === '#install-app' ? button : status},
    navigator, console,
    window: {matchMedia: () => ({matches: false}), addEventListener: (type, fn) => { events[type] = fn; }}
  });
  events.beforeinstallprompt({preventDefault() {}, prompt: async () => { prompts++; }, userChoice: Promise.resolve({outcome: 'accepted'})});
  assert.equal(button.hidden, false);
  assert.equal(prompts, 0);
  await handlers.click();
  assert.equal(prompts, 1);
  assert.equal(button.hidden, true);
  events.appinstalled();
  assert.equal(button.hidden, true);
  navigator.onLine = false;
  events.offline();
  assert.equal(status.hidden, false);
  navigator.onLine = true;
  events.online();
  assert.equal(status.hidden, true);
  events.load();
  await Promise.resolve();
  assert.equal(registered.url, './service-worker.js');
  assert.equal(registered.options.scope, './');
});
