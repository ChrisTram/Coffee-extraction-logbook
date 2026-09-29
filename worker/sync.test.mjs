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
  sanitisePayload({ tables: { extractions }, tombes: { extractions: tombstones || {} } });
const ext = (id, maj_le, rating) => ({ id, maj_le, note_sur_10: rating });
const ids = p => p.tables.extractions.map(r => r.id).sort();
const scoreOf = (p, id) => p.tables.extractions.find(r => r.id === id)?.note_sur_10;

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

// 4. The most recent maj_le wins on the same row
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
    tombes: Object.fromEntries(
      Object.entries(p.tombes).map(([t, marks]) => [
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
check("the tombstone is kept", afterDelete.tombes.extractions.e1 === NOW + 50);

// 7. A rewrite LATER than the deletion does bring the row back
const rewritten = payload([ext("e1", NOW + 99, 9)]);
const revived = mergePayloads(deleted, rewritten, NOW + 100);
check("a later rewrite wins over the deletion", ids(revived).join() === "e1");
check("and keeps the new value", scoreOf(revived, "e1") === 9);

// 8. Purging tombstones that are too old
const oldTomb = payload([], { e1: NOW });
const purged = mergePayloads(oldTomb, emptyPayload(), NOW + TOMBSTONE_RETENTION_MS + 1);
check("tombstone purged past the delay", Object.keys(purged.tombes.extractions).length === 0);
const freshTomb = mergePayloads(oldTomb, emptyPayload(), NOW + 1000);
check("tombstone kept before the delay", Object.keys(freshTomb.tombes.extractions).length === 1);

// 9. Robustness: invalid shapes coming from the network
const dirty = sanitisePayload({
  tables: { extractions: [{ id: "ok", maj_le: "123" }, { id: "" }, null, "texte", { noId: 1 }] },
  tombes: { extractions: { bon: "50", "": 10 } },
});
check("rows without an id dropped", ids(dirty).join() === "ok", ids(dirty).join());
check("maj_le converted to a number", dirty.tables.extractions[0].maj_le === 123);
check("tombstone without an id dropped", JSON.stringify(dirty.tombes.extractions) === '{"bon":50}');
check("absurd payload tolerated", JSON.stringify(sanitisePayload(null)) === JSON.stringify(emptyPayload()));
/* No hard-coded list: the count follows TABLES, the only source of truth on
   the server side. A table forgotten here would not sync, silently. */
check(
  "every table in TABLES is present",
  Object.keys(emptyPayload().tables).sort().join() === [...TABLES].sort().join(),
  Object.keys(emptyPayload().tables).sort().join()
);

// 10. Missing maj_le (data from before sync): treated as the oldest
const unstamped = payload([{ id: "e1", note_sur_10: 5 }]);
check("missing maj_le equals zero", unstamped.tables.extractions[0].maj_le === 0);
const stampedWinner = mergePayloads(unstamped, payload([ext("e1", NOW, 9)]), NOW);
check("a stamped row beats an unstamped row", scoreOf(stampedWinner, "e1") === 9);

// 11. The other tables are not lost along the way
const full = sanitisePayload({
  tables: { cafes: [{ id: "c1", maj_le: NOW }], extractions: [], recettes: [{ id: "r1", maj_le: NOW }], tasses: [] },
});
const kept = mergePayloads(emptyPayload(), full, NOW);
check("coffees survive", kept.tables.cafes.length === 1);
check("recipes survive", kept.tables.recettes.length === 1);

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

  const res = await handleSync(request({ tables: { extractions: [ext("e1", NOW, 7)] } }), env);
  const body = await res.json();
  check("the response carries the document size", Number.isInteger(body.size) && body.size > 0, String(body.size));
  check("and the cap the server accepts", body.cap === MAX_DOCUMENT_BYTES);
  check("the size is that of the merged document, in bytes",
    body.size === documentSize({ tables: body.tables, tombes: body.tombes, schema: body.schema }));
  check("the cap is D1's, two million bytes per row", MAX_DOCUMENT_BYTES === 2_000_000);

  const read = await handleSync(new Request("https://site.test/api/sync"), env);
  const readBody = await read.json();
  check("GET also returns the size", Number.isInteger(readBody.size) && readBody.size === body.size,
    readBody.size + " vs " + body.size);

  // Accents count in bytes, not characters: that is the unit of the cap.
  check("the measure is in UTF-8 bytes", documentSize({ a: "é" }) === JSON.stringify({ a: "é" }).length + 1);
}

// 13. v8.71: on equal maj_le, the union of fields; the merge stays commutative.
{
  const complete = payload([{ id: "e1", maj_le: NOW, note_sur_10: 7, chauffe_s: 90 }]);
  const truncated = payload([{ id: "e1", maj_le: NOW, note_sur_10: 7 }]);
  const ab = mergePayloads(complete, truncated, NOW), ba = mergePayloads(truncated, complete, NOW);
  check("an old tab no longer erases a recent column at the same date",
    ab.tables.extractions[0].chauffe_s === 90 && ba.tables.extractions[0].chauffe_s === 90);
  const x = payload([{ id: "e1", maj_le: NOW, note_sur_10: 7 }]), y = payload([{ id: "e1", maj_le: NOW, note_sur_10: 8 }]);
  check("two different values at the same date give the same winner both ways",
    JSON.stringify(mergePayloads(x, y, NOW)) === JSON.stringify(mergePayloads(y, x, NOW)));
}

// 14. v8.71: a timestamp from the future is brought back to server time.
{
  const future = sanitisePayload({ tables: { extractions: [ext("e1", NOW + TOLERATED_LEAD_MS + 60000, 7)] },
    tombes: { extractions: { e2: NOW + 3600000 } } }, NOW);
  check("a row dated in the future comes back to now", future.tables.extractions[0].maj_le === NOW);
  check("a tombstone too", future.tombes.extractions.e2 === NOW);
  const near = sanitisePayload({ tables: { extractions: [ext("e1", NOW + 60000, 7)] } }, NOW);
  check("a small lead is still tolerated", near.tables.extractions[0].maj_le === NOW + 60000);
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
  await handleSync(req({ schema: 17, tables: { extractions: [ext("e1", NOW, 7)] } }), { DB: db });
  const stale = await handleSync(req({ schema: 15, tables: { extractions: [ext("e1", NOW + 1, 2)] } }), { DB: db });
  check("a device older than the document is refused with 409", stale.status === 409);
  check("and the document has not moved", JSON.parse(db.docs.get("state")).tables.extractions[0].note_sur_10 === 7);

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

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
