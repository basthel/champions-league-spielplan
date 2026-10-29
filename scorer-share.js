/* JSON export and native sharing share one payload; no network upload. */
(function (root) {
  'use strict';
  function prepare(match, state, engine) {
    const data = {...match, status: state.phase === 'finished' ? 'finished' : 'in-progress',
      summary: {players: state.players, legs: state.legs, stats: state.players.map((_, i) => engine.statistics(state, i))}};
    return {
      filename: `haumdaucher-${match.createdAt.slice(0, 10)}-${match.id}.json`,
      json: JSON.stringify({schemaVersion: 1, app: 'haumdaucher-scorer', match: data}, null, 2)
    };
  }
  async function share(exported, environment = root) {
    const nav = environment.navigator;
    if (!environment.isSecureContext) return {status: 'download', reason: 'insecure'};
    if (typeof nav?.share !== 'function' || typeof nav?.canShare !== 'function' || typeof environment.File !== 'function') {
      return {status: 'download', reason: 'unsupported'};
    }
    let file;
    try {
      file = new environment.File([exported.json], exported.filename, {type: 'application/json'});
      if (!nav.canShare({files: [file]})) return {status: 'download', reason: 'file-unsupported'};
    } catch { return {status: 'download', reason: 'file-unsupported'}; }
    try {
      // Keep this call in the original tap's activation; no asynchronous preparation.
      await nav.share({files: [file]});
      return {status: 'shared'};
    } catch (error) {
      return error?.name === 'AbortError' ? {status: 'cancelled'} : {status: 'download', reason: 'failed'};
    }
  }
  const api = {prepare, share};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DartsShare = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
