import {
  mergePayloads, sanitisePayload, emptyPayload, handleSync, documentSize,
  MAX_DOCUMENT_BYTES, TOMBSTONE_RETENTION_MS, TABLES, TOLERATED_LEAD_MS, saveDocument, BACKUP_DAYS,
} from "./sync.js";

let failures = 0;
function check(label, condition, detail) {
  if (!condition) failures += 1;
  console.log(`${condition ? "OK  " : "FAIL"} ${label}${!condition && detail ? ` -> ${detail}` : ""}`);
}

const NOW = 1_700_000_000_000;
const payload = (extractions, tombstones) =>
  sanitisePayload({ tables: { extractions }, tombstones: { extractions: tombstones || {} } });
const ext = (id, updated_at, rating) => ({ id, updated_at, score_10: rating });
const ids = p => p.tables.extractions.map(r => r.id).sort();
const scoreOf = (p, id) => p.tables.extractions.find(r => r.id === id)?.score_10;

// 1. First sync: the server is empty, the device pushes everything
const local = payload([ext("e1", NOW, 7), ext("e2", NOW, 8)]);
const first = mergePayloads(emptyPayload(), local, NOW);
check("empty server adopts the local data", JSON.stringify(ids(first)) === '["e1","e2"]', ids(first).join());

// 2. New device, empty local: it receives everything, losing nothing
const newDevice = mergePayloads(first, emptyPayload(), NOW);
check("new device receives everything", JSON.stringify(ids(newDevice)) === '["e1","e2"]', ids(newDevice).join());

// 3. Union: each device logged a different extraction offline
const phone = payload([ext("e1", NOW, 7), ext("e3", NOW + 10, 9)]);
const desktop = payload([ext("e1", NOW, 7), ext("e4", NOW + 20, 6)]);
const union = mergePayloads(phone, desktop, NOW + 30);
check("both entries survive", JSON.stringify(ids(union)) === '["e1","e3","e4"]', ids(union).join());

// 4. The most recent updated_at wins on the same row
const older = payload([ext("e1", NOW, 5)]);
const recent = payload([ext("e1", NOW + 100, 9)]);
check("the most recent wins", scoreOf(mergePayloads(older, recent, NOW + 200), "e1") === 9);
check("the other way round too", scoreOf(mergePayloads(recent, older, NOW + 200), "e1") === 9);

// 5. Commutativity and idempotence: this is what guarantees convergence.
// The ORDER of rows in an array is NOT significant (the UI always sorts what
// it displays), so the comparison is canonical: we sort by id before
// comparing. Only the CONTENT must be commutative.
const canonical = p =>
  JSON.stringify({
    tables: Object.fromEntries(
      Object.entries(p.tables).map(([t, rows]) => [t, [...rows].sort((x, y) => x.id.localeCompare(y.id))])
    ),
    // The insertion order of an object's keys is no more significant than
    // that of the rows: we sort them too.
    tombstones: Object.fromEntries(
      Object.entries(p.tombstones).map(([t, marks]) => [
        t,
        Object.fromEntries(Object.entries(marks).sort(([x], [y]) => x.localeCompare(y))),
      ])
    ),
  });

const a = payload([ext("e1", NOW + 5, 7), ext("e2", NOW, 8)], { e9: NOW });
const b = payload([ext("e1", NOW, 3), ext("e3", NOW + 1, 4)], { e2: NOW + 50 });
const ab = mergePayloads(a, b, NOW + 100);
const ba = mergePayloads(b, a, NOW + 100);
check("merge is commutative on content", canonical(ab) === canonical(ba));
check("merge is idempotent", canonical(mergePayloads(ab, ab, NOW + 100)) === canonical(ab));

// In production the server document is ALWAYS the first operand, so the
// order is deterministic and both devices converge on the order as well.
const server = mergePayloads(emptyPayload(), a, NOW);
const fromPhone = mergePayloads(server, b, NOW + 100);
const fromDesktop = mergePayloads(server, b, NOW + 100);
check("deterministic order for the same server", JSON.stringify(fromPhone) === JSON.stringify(fromDesktop));

// 6. Deletion: the tombstone prevents resurrection
const deleted = payload([], { e1: NOW + 50 });
const stillThere = payload([ext("e1", NOW, 7)]);
const afterDelete = mergePayloads(deleted, stillThere, NOW + 60);
check("the deleted row does not come back", ids(afterDelete).length === 0, ids(afterDelete).join());
check("the tombstone is kept", afterDelete.tombstones.extractions.e1 === NOW + 50);

// 7. A rewrite LATER than the deletion does bring the row back
const rewritten = payload([ext("e1", NOW + 99, 9)]);
const revived = mergePayloads(deleted, rewritten, NOW + 100);
check("a later rewrite wins over the deletion", ids(revived).join() === "e1");
check("and keeps the new value", scoreOf(revived, "e1") === 9);

// 8. Purging tombstones that are too old
const oldTomb = payload([], { e1: NOW });
const purged = mergePayloads(oldTomb, emptyPayload(), NOW + TOMBSTONE_RETENTION_MS + 1);
check("tombstone purged past the delay", Object.keys(purged.tombstones.extractions).length === 0);
const freshTomb = mergePayloads(oldTomb, emptyPayload(), NOW + 1000);
check("tombstone kept before the delay", Object.keys(freshTomb.tombstones.extractions).length === 1);

// 9. Robustness: invalid shapes coming from the network
const dirty = sanitisePayload({
  tables: { extractions: [{ id: "ok", updated_at: "123" }, { id: "" }, null, "text", { noId: 1 }] },
  tombstones: { extractions: { bon: "50", "": 10 } },
});
check("rows without an id dropped", ids(dirty).join() === "ok", ids(dirty).join());
check("updated_at converted to a number", dirty.tables.extractions[0].updated_at === 123);
check("tombstone without an id dropped", JSON.stringify(dirty.tombstones.extractions) === '{"bon":50}');
check("absurd payload tolerated", JSON.stringify(sanitisePayload(null)) === JSON.stringify(emptyPayload()));
/* No hard-coded list: the count follows TABLES, the only source of truth on
   the server side. A table forgotten here would not sync, silently. */
check(
  "every table in TABLES is present",
  Object.keys(emptyPayload().tables).sort().join() === [...TABLES].sort().join(),
  Object.keys(emptyPayload().tables).sort().join()
);

// 10. Missing updated_at (data from before sync): treated as the oldest
const unstamped = payload([{ id: "e1", score_10: 5 }]);
check("missing updated_at equals zero", unstamped.tables.extractions[0].updated_at === 0);
const stampedWinner = mergePayloads(unstamped, payload([ext("e1", NOW, 9)]), NOW);
check("a stamped row beats an unstamped row", scoreOf(stampedWinner, "e1") === 9);

// 11. The other tables are not lost along the way
const full = sanitisePayload({
  tables: { coffees: [{ id: "c1", updated_at: NOW }], extractions: [], recipes: [{ id: "r1", updated_at: NOW }], cups: [] },
});
const kept = mergePayloads(emptyPayload(), full, NOW);
check("coffees survive", kept.tables.coffees.length === 1);
check("recipes survive", kept.tables.recipes.length === 1);

// 12. Document size: the server measures it and returns it with its cap,
//     so the client warns BEFORE D1 refuses to write. A fake one-row
//     database is enough to exercise all of handleSync.
{
  const fakeDb = () => {
    let doc = null;
    return {
      exec: async () => {},
      prepare: () => ({
        bind: (...args) => ({
          first: async () => (doc === null ? null : { payload: doc }),
          run: async () => { doc = args[1]; },
        }),
      }),
    };
  };
  const env = { DB: fakeDb() };
  const request = body => new Request("https://site.test/api/sync", {
    method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
  });

  const res = await handleSync(request({ schema: 21, tables: { extractions: [ext("e1", NOW, 7)] } }), env);
  const body = await res.json();
  check("the response carries the document size", Number.isInteger(body.size) && body.size > 0, String(body.size));
  check("and the cap the server accepts", body.cap === MAX_DOCUMENT_BYTES);
  check("the size is that of the merged document, in bytes",
    body.size === documentSize({ tables: body.tables, tombstones: body.tombstones, schema: body.schema }));
  check("the cap is D1's, two million bytes per row", MAX_DOCUMENT_BYTES === 2_000_000);

  const read = await handleSync(new Request("https://site.test/api/sync"), env);
  const readBody = await read.json();
  check("GET also returns the size", Number.isInteger(readBody.size) && readBody.size === body.size,
    readBody.size + " vs " + body.size);

  // Accents count in bytes, not characters: that is the unit of the cap.
  check("the measure is in UTF-8 bytes", documentSize({ a: "é" }) === JSON.stringify({ a: "é" }).length + 1);
}

// 13. v8.71: on equal updated_at, the union of fields; the merge stays commutative.
{
  const complete = payload([{ id: "e1", updated_at: NOW, score_10: 7, heating_s: 90 }]);
  const truncated = payload([{ id: "e1", updated_at: NOW, score_10: 7 }]);
  const ab = mergePayloads(complete, truncated, NOW), ba = mergePayloads(truncated, complete, NOW);
  check("an old tab no longer erases a recent column at the same date",
    ab.tables.extractions[0].heating_s === 90 && ba.tables.extractions[0].heating_s === 90);
  const x = payload([{ id: "e1", updated_at: NOW, score_10: 7 }]), y = payload([{ id: "e1", updated_at: NOW, score_10: 8 }]);
  check("two different values at the same date give the same winner both ways",
    JSON.stringify(mergePayloads(x, y, NOW)) === JSON.stringify(mergePayloads(y, x, NOW)));
}

// 14. v8.71: a timestamp from the future is brought back to server time.
{
  const future = sanitisePayload({ tables: { extractions: [ext("e1", NOW + TOLERATED_LEAD_MS + 60000, 7)] },
    tombstones: { extractions: { e2: NOW + 3600000 } } }, NOW);
  check("a row dated in the future comes back to now", future.tables.extractions[0].updated_at === NOW);
  check("a tombstone too", future.tombstones.extractions.e2 === NOW);
  const near = sanitisePayload({ tables: { extractions: [ext("e1", NOW + 60000, 7)] } }, NOW);
  check("a small lead is still tolerated", near.tables.extractions[0].updated_at === NOW + 60000);
}

// 15. v8.71: stale version refused, unreadable document never overwritten, oversized body refused,
//     daily backup.
{
  const makeDb = () => {
    const docs = new Map();
    return {
      docs,
      exec: async () => {},
      prepare: sql => ({
        bind: (...args) => ({
          first: async () => (docs.has(args[0]) ? { payload: docs.get(args[0]) } : null),
          run: async () => {
            if (/^INSERT/.test(sql)) docs.set(args[0], args[1]);
            else if (/^DELETE/.test(sql)) for (const k of [...docs.keys()]) if (k.startsWith("state@") && k < args[1]) docs.delete(k);
          },
        }),
      }),
    };
  };
  const req = body => new Request("https://site.test/api/sync", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
  const db = makeDb();
  await handleSync(req({ schema: 22, tables: { extractions: [ext("e1", NOW, 7)] } }), { DB: db });
  const stale = await handleSync(req({ schema: 21, tables: { extractions: [ext("e1", NOW + 1, 2)] } }), { DB: db });
  check("a device older than the document is refused with 409", stale.status === 409);
  check("and the document has not moved", JSON.parse(db.docs.get("state")).tables.extractions[0].score_10 === 7);

  const broken = makeDb(); broken.docs.set("state", "{pas du json");
  const r = await handleSync(req({ tables: { extractions: [ext("e1", NOW, 7)] } }), { DB: broken });
  check("an unreadable document returns a clear error", r.status === 500 && (await r.json()).error === "unreadable-document");
  check("and is not overwritten", broken.docs.get("state") === "{pas du json");

  const huge = await handleSync(new Request("https://site.test/api/sync", { method: "POST", body: "{}",
    headers: { "Content-Type": "application/json", "Content-Length": "9000000" } }), { DB: makeDb() });
  check("an oversized body is refused with 413", huge.status === 413);

  const backup = makeDb(); backup.docs.set("state", '{"tables":{}}'); backup.docs.set("state@2000-01-01", "{}");
  const name = await saveDocument(backup, NOW);
  check("the daily backup copies the document",
    name === "state@" + new Date(NOW).toISOString().slice(0, 10) && backup.docs.get(name) === backup.docs.get("state"));
  check("and copies older than " + BACKUP_DAYS + " days are deleted", !backup.docs.has("state@2000-01-01"));
}

// 16. v9.06: THE FRENCH NAMES. The stored document, its daily backups and the
//     payload of a tab still on v9.05 may carry the names used until then
//     (cafes, nom, maj_le, tombes...). Everything is renamed before merging.
{
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const clientSource = readFileSync(join(root, "js/legacy-names.js"), "utf8");
  const CLIENT = new Function("localStorage", clientSource + "\nreturn LEGACY;")(undefined);
  const WORKER = await import("./legacy-names.js");
  // Real time here: the endpoint purges tombstones older than three months from now.
  const T = Date.now();

  // The two copies of the alias tables are the same, key for key.
  for (const name of ["TABLES", "DOCUMENT", "FIELDS", "STEP_FIELDS", "DRAWINGS"]) {
    check("client and worker alias maps are identical: " + name,
      JSON.stringify(CLIENT[name]) === JSON.stringify(WORKER[name]),
      JSON.stringify(CLIENT[name]).slice(0, 80) + " / " + JSON.stringify(WORKER[name]).slice(0, 80));
  }
  check("every table of TABLES has its alias map", TABLES.every(t => WORKER.FIELDS[t]), TABLES.join());
  check("every old table name lands on a synced table",
    Object.values(WORKER.TABLES).every(t => TABLES.includes(t)));

  // An old v9.05 document: every table, several fields, tombstones.
  const OLD_KEYS = [...new Set([...Object.keys(WORKER.TABLES), ...Object.keys(WORKER.DOCUMENT),
    ...Object.values(WORKER.FIELDS).flatMap(Object.keys), "texte", "sousTitre"])];
  const oldDocument = {
    schema: 20,
    tables: {
      cafes: [{ id: "c1", maj_le: T - 5000, nom: "Là Việt Balanced", torrefaction: "Medium", format_grammes: 250, actif: 1 },
        { id: "c2", maj_le: T - 5000, nom: "Bana Cofe G4", torrefaction: "Foncée", deja_moulu: 1 }],
      extractions: [{ id: "e1", maj_le: T - 5000, cafe_id: "c1", methode: "Switch", note_sur_10: 7, commentaire: "rond" },
        { id: "e2", maj_le: T - 5000, cafe_id: "c2", methode: "Brikka", note_sur_10: 5, puissance_feu: 3 },
        { id: "e3", maj_le: T - 9000, cafe_id: "c2", methode: "Brikka", note_sur_10: 2 }],
      recettes: [{ id: "perso", maj_le: T - 5000, nom: "Ma recette", methode: "Switch", eau: 240,
        etapes: [{ t: 0, texte: "Bloom" }], pourQui: "Tous", cafesAssocies: ["Bana Cofe G4"] }],
      tasses: [{ id: "t1", maj_le: T - 5000, nom: "Classic Mug", contenance_ml: 330 }],
      achats: [{ id: "a1", maj_le: T - 5000, cafe_id: "c1", date_achat: "2026-09-01", restant_g: 120, restant_le: "2026-09-20T08:00" }],
      reglages: [{ id: "moi", maj_le: T - 5000, schema_version: 20, ebullition_s: 120, bulles_s: 90, pas_crans: 2,
        dessins: "etagere,!horloge,podium" }],
    },
    tombes: { extractions: { e3: T - 7000 }, cafes: { gone: T - 7000 } },
  };
  const renamed = sanitisePayload(oldDocument);
  const keysOf = doc => {
    const found = new Set();
    JSON.stringify(doc, (k, v) => { found.add(k); return v; });
    return found;
  };
  const leftovers = doc => OLD_KEYS.filter(k => keysOf(doc).has(k) && !["extractions"].includes(k));
  check("an old document is read under the new names only", leftovers(renamed).length === 0, leftovers(renamed).join());
  check("with the same row counts", renamed.tables.coffees.length === 2 && renamed.tables.extractions.length === 3 &&
    renamed.tables.recipes.length === 1 && renamed.tables.cups.length === 1 && renamed.tables.purchases.length === 1 &&
    renamed.tables.settings.length === 1);
  check("every value under its new key",
    renamed.tables.coffees[0].name === "Là Việt Balanced" && renamed.tables.coffees[0].bag_size_g === 250 &&
    renamed.tables.coffees[1].pre_ground === 1 && renamed.tables.extractions[0].score_10 === 7 &&
    renamed.tables.extractions[0].coffee_id === "c1" && renamed.tables.extractions[1].heat_level === 3 &&
    renamed.tables.recipes[0].water === 240 && renamed.tables.recipes[0].steps[0].text === "Bloom" &&
    renamed.tables.recipes[0].bestFor === "Tous" && renamed.tables.cups[0].capacity_ml === 330 &&
    renamed.tables.purchases[0].remaining_g === 120 && renamed.tables.settings[0].boil_s === 120,
    JSON.stringify(renamed.tables.coffees[0]));
  check("the stamps survive the renaming", renamed.tables.coffees[0].updated_at === T - 5000);
  check("the drawing names of the settings are translated", renamed.tables.settings[0].drawings === "shelf,!clock,podium",
    renamed.tables.settings[0].drawings);
  check("tombstones too, under the new table names",
    renamed.tombstones.extractions.e3 === T - 7000 && renamed.tombstones.coffees.gone === T - 7000);
  check("and the document schema is kept", renamed.schema === 20);

  // A row carrying both names: the new key wins, the old one disappears.
  const both = sanitisePayload({ tables: { extractions: [{ id: "x", maj_le: 1, updated_at: 2, note_sur_10: 3, score_10: 9 }] } });
  check("a row with both names keeps the new value", both.tables.extractions[0].updated_at === 2 &&
    both.tables.extractions[0].score_10 === 9 && !("note_sur_10" in both.tables.extractions[0]) && !("maj_le" in both.tables.extractions[0]));
  const twoOld = WORKER.renameRow("extractions", { id: "x", volume_extrait_ml: "", volume_tasse_ml: 180 });
  check("the name before v8 (volume_tasse_ml) still fills the yield", twoOld.yield_ml === 180, JSON.stringify(twoOld));
  const current = { id: "x", updated_at: 1, score_10: 8 };
  check("an up-to-date row is returned as is", WORKER.renameRow("extractions", current) === current);
  check("the same document gives the same result on both sides",
    JSON.stringify(CLIENT.renameDocument(oldDocument)) === JSON.stringify(WORKER.renameDocument(oldDocument)));

  // Stored OLD document + NEW payload, through the real endpoint.
  const docs = new Map([["state", JSON.stringify(oldDocument)]]);
  const db = {
    exec: async () => {},
    prepare: sql => ({
      bind: (...args) => ({
        first: async () => (docs.has(args[0]) ? { payload: docs.get(args[0]) } : null),
        run: async () => { if (/^INSERT/.test(sql)) docs.set(args[0], args[1]); },
      }),
    }),
  };
  const post = body => handleSync(new Request("https://site.test/api/sync", { method: "POST", body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" } }), { DB: db });
  const res = await post({
    schema: 21,
    tables: {
      // e1 edited on the new tab (newer), e2 unchanged there (older than the server), e4 new.
      extractions: [{ id: "e1", updated_at: T - 1000, coffee_id: "c1", method: "Switch", score_10: 9 },
        { id: "e2", updated_at: T - 8000, coffee_id: "c2", method: "Brikka", score_10: 1 },
        { id: "e3", updated_at: T - 9000, coffee_id: "c2", method: "Brikka", score_10: 2 },
        { id: "e4", updated_at: T - 500, coffee_id: "c1", method: "Switch", score_10: 8 }],
      coffees: [{ id: "c3", updated_at: T - 500, name: "Nouveau" }],
    },
    tombstones: { cups: { t1: T - 100 } },
  });
  check("an old stored document merged with a new payload is accepted", res.status === 200, String(res.status));
  const stored = JSON.parse(docs.get("state"));
  check("the stored document is written under the new names only", leftovers(stored).length === 0, leftovers(stored).join());
  const byId = (t, id) => stored.tables[t].find(r => r.id === id);
  check("the union of the rows",
    stored.tables.coffees.length === 3 && ["e1", "e2", "e4"].every(id => byId("extractions", id)), stored.tables.coffees.length + "");
  check("the newer payload row wins", byId("extractions", "e1").score_10 === 9);
  check("the newer stored row wins, read under its old names", byId("extractions", "e2").score_10 === 5 &&
    byId("extractions", "e2").heat_level === 3);
  check("an old tombstone still deletes the row it covers", !byId("extractions", "e3") && stored.tombstones.extractions.e3 === T - 7000);
  check("a new tombstone deletes a row stored under the old table name", stored.tables.cups.length === 0 && stored.tombstones.cups.t1 === T - 100);
  check("the other old tombstones are kept", stored.tombstones.coffees.gone === T - 7000);
  check("the stored document moves to schema 21", stored.schema === 21, String(stored.schema));
  check("no duplicated old key in any row", stored.tables.extractions.every(r => !("maj_le" in r) && !("note_sur_10" in r)));

  // OLD payload merged into a NEW document: works too, gives new names.
  const newDoc = sanitisePayload({ schema: 21, tables: { extractions: [{ id: "e1", updated_at: T - 1000, score_10: 9 }] } });
  const oldPayload = sanitisePayload({ schema: 20, tables: { extractions: [{ id: "e1", maj_le: T - 2000, note_sur_10: 4 },
    { id: "e9", maj_le: T - 2000, note_sur_10: 6, commentaire: "vieux" }] }, tombes: { tasses: { t9: T - 3000 } } });
  const mergedOld = mergePayloads(newDoc, oldPayload, T);
  check("an old payload merged into a new document gives new names only", leftovers(mergedOld).length === 0, leftovers(mergedOld).join());
  check("with its rows and its stamps resolved",
    mergedOld.tables.extractions.find(r => r.id === "e1").score_10 === 9 &&
    mergedOld.tables.extractions.find(r => r.id === "e9").comment === "vieux");
  check("and its tombstones", mergedOld.tombstones.cups.t9 === T - 3000);
  const direct = mergePayloads({ tables: { cafes: [{ id: "c1", maj_le: 5, nom: "A" }] } }, { tables: { coffees: [{ id: "c1", updated_at: 6, name: "B" }] } }, T);
  check("mergePayloads renames an unsanitised old document too", direct.tables.coffees.length === 1 && direct.tables.coffees[0].name === "B");

  // An old daily backup restored as is reads the same way.
  const backup = sanitisePayload(JSON.parse(JSON.stringify(oldDocument)));
  check("an old daily backup is read under the new names", leftovers(backup).length === 0 && backup.tables.coffees.length === 2);

  // The schema gate: a tab from before v9.06 is refused even if the document is old.
  const oldDocs = new Map([["state", JSON.stringify(oldDocument)]]);
  const oldDb = { ...db, prepare: sql => ({ bind: (...args) => ({
    first: async () => (oldDocs.has(args[0]) ? { payload: oldDocs.get(args[0]) } : null),
    run: async () => { if (/^INSERT/.test(sql)) oldDocs.set(args[0], args[1]); },
  }) }) };
  const staleTab = await handleSync(new Request("https://site.test/api/sync", { method: "POST",
    body: JSON.stringify({ schema: 20, tables: { cafes: [{ id: "c9", maj_le: T, nom: "x" }] } }),
    headers: { "Content-Type": "application/json" } }), { DB: oldDb });
  check("a v9.05 tab is refused with 409, even on a document still at 20", staleTab.status === 409, String(staleTab.status));
  check("and the old document is not touched", oldDocs.get("state") === JSON.stringify(oldDocument));
  const noSchema = await handleSync(new Request("https://site.test/api/sync", { method: "POST",
    body: JSON.stringify({ tables: {} }), headers: { "Content-Type": "application/json" } }), { DB: oldDb });
  check("a payload without a schema is refused as well", noSchema.status === 409);
  const getOld = await handleSync(new Request("https://site.test/api/sync"), { DB: oldDb });
  const got = await getOld.json();
  check("GET returns an old document under the new names", !!got.tables.coffees && !got.tables.cafes && !!got.tombstones && !got.tombes);
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
