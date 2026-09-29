/* Sync between devices, client side.
 *
 * This file ONLY talks to the network and merges locally. It does not touch
 * the application state: data.js decides when to sync and adopts the
 * result.
 *
 * Under file:// there is no server: disponible() returns false and the whole
 * rest of the site works exactly as before, each device with its own data.
 * That is also the behaviour when the D1 database is not bound.
 *
 * The merge model is described in worker/sync.js. In short: each row carries
 * a `maj_le`, the most recent wins, and deletions leave a tombstone so they
 * do not come back to life at the next exchange.
 */

const SYNC = (() => {
  const ENDPOINT = "api/sync";
  // Any new table MUST be added here AND in worker/sync.js, otherwise it
  // does not sync, silently and without an error.
  const TABLES = ["cafes", "extractions", "recettes", "tasses", "achats", "reglages"];
  const TIMEOUT_MS = 15000;

  // No server under file://: no point trying, and the fetch would fail
  // anyway on a null origin.
  function disponible() {
    return typeof location !== "undefined" && String(location.protocol).startsWith("http");
  }

  function tombesVides() {
    return Object.fromEntries(TABLES.map(name => [name, {}]));
  }

  /* THE SAME MERGE AS THE SERVER, CLIENT SIDE (v8.71). A sync response used
     to replace the local state: a cup added, or restored by "Annuler", during
     the exchange (up to 15 s) disappeared. Now the response is MERGED with
     the state as it is on return, with exactly the rule of worker/sync.js:
     row by row the most recent wins, fields are unioned on a tie, and a later
     tombstone deletes. A test compares the two merges. No purge here: the
     server is the one that purges. */
  const stamp = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
  function fusionnerLigne(a, b) {
    const ja = JSON.stringify(a), jb = JSON.stringify(b);
    if (ja === jb) return a;
    const [smaller, larger] = ja < jb ? [a, b] : [b, a];
    return { ...smaller, ...larger };
  }
  function fusionner(left, right) {
    const tables = {}, tombs = {};
    for (const name of TABLES) {
      const marks = { ...((left.tombes || {})[name] || {}) };
      for (const [id, ts] of Object.entries((right.tombes || {})[name] || {})) {
        if (stamp(ts) > stamp(marks[id])) marks[id] = stamp(ts);
      }
      const byId = new Map();
      for (const row of [...((left.tables || {})[name] || []), ...((right.tables || {})[name] || [])]) {
        if (!row || !row.id) continue;
        const ex = byId.get(row.id);
        if (!ex) { byId.set(row.id, row); continue; }
        const tl = stamp(row.maj_le), te = stamp(ex.maj_le);
        if (tl > te) byId.set(row.id, row);
        else if (tl === te) byId.set(row.id, fusionnerLigne(ex, row));
      }
      tables[name] = [...byId.values()].filter(l => stamp(marks[l.id]) <= stamp(l.maj_le));
      tombs[name] = marks;
    }
    return { tables, tombes: tombs };
  }

  /* Exchange in a single round trip: we send the local state, the server
     merges and returns the result, which becomes the truth on both sides.
     Errors are typed so the caller knows what to show. */
  async function echanger(payload) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    let response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin",
        cache: "no-store",
        signal: abort.signal,
      });
    } catch (error) {
      throw Object.assign(new Error("reseau"), { code: "hors-ligne" });
    } finally {
      clearTimeout(timer);
    }

    // The front door answers 401 in JSON on /api/sync, but if one day it
    // redirected, we certainly do not want to parse the login page as
    // data.
    if (response.status === 401 || response.redirected) {
      throw Object.assign(new Error("session"), { code: "session-expiree" });
    }
    if (response.status === 503) {
      throw Object.assign(new Error("non configuree"), { code: "non-configuree" });
    }
    // The server knows a more recent version of the logbook than this tab (v8.71).
    if (response.status === 409) {
      throw Object.assign(new Error("version perimee"), { code: "version-perimee" });
    }
    if (!response.ok) {
      throw Object.assign(new Error("http " + response.status), { code: "erreur" });
    }

    const received = await response.json();
    if (!received || typeof received !== "object" || !received.tables) {
      throw Object.assign(new Error("reponse inattendue"), { code: "erreur" });
    }
    return received;
  }

  return { disponible, echanger, fusionner, tombesVides, TABLES };
})();
