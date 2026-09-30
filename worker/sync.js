/* Merging data between devices, and Cloudflare D1 storage.
 *
 * WHY D1 AND NOT KV: KV is eventually consistent, a read right after a write
 * can return the previous state for a minute. And the typical gesture is
 * exactly that one: entering a brew on the phone in the kitchen, then looking
 * at the dashboard on the desk computer. D1 is strongly consistent.
 *
 * WHY A JSON DOCUMENT AND NOT SQL TABLES: the data schema lives in the
 * client (normalizeCoffee, normalizeExtraction, migrateData) and evolves
 * regularly, with idempotent client-side migrations. Duplicating it in SQL
 * would require a D1 migration for every added column. Here the server
 * knows only one thing: each row has an `id` and an `updated_at`.
 *
 * MERGE MODEL: row by row, the most recent `updated_at` wins. Deletions leave a
 * tombstone (`tombstones`), otherwise a row deleted on one device would come
 * back to life on the other's first sync. Tombstones are purged after
 * TOMBSTONE_RETENTION_MS, otherwise they would grow forever.
 *
 * FRENCH NAMES (v9.06). Until v9.05 the document carried French names
 * (cafes, nom, maj_le, tombes...). The stored document, its daily backups and
 * the payload of a tab still open on an old version may still carry them:
 * sanitisePayload renames everything through legacy-names.js BEFORE
 * anything else, so the merge only ever sees English names and writes
 * English names only.
 */

import { renameDocument } from "./legacy-names.js";

export const TABLES = ["coffees", "extractions", "recipes", "cups", "purchases", "settings"];

/* The oldest client schema accepted, whatever the document says (v9.06). A
   tab from before the English names reads "cafes" and "maj_le": given the
   English document it would see an empty logbook and rows without dates. It
   is refused with the same 409 as any outdated tab, and offered a reload. */
export const MIN_CLIENT_SCHEMA = 21;

// Three months: far more than the realistic delay between two syncs of the
// same device, which is the only thing tombstones need to cover.
export const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

// Safeguard: a single user, but we refuse an absurd load rather than blow
// past D1's size limit.
const MAX_ROWS_PER_TABLE = 20000;

/* The whole state fits in ONE D1 row, as JSON, and D1 caps the size of a
   row: 2,000,000 bytes according to its documentation (to recheck if
   Cloudflare changes it). The day the document exceeds it, the write fails
   all at once, without warning, with the data safe on the client side but
   nothing converging any more. At 600 bytes per brew and a cup and a half a
   day, that is far off, but it is the kind of thing you forget: so the
   server returns the document size on every exchange, and the client warns
   past the halfway mark. */
export const MAX_DOCUMENT_BYTES = 2_000_000;
const encoder = new TextEncoder();
export function documentSize(payload) {
  return encoder.encode(JSON.stringify(payload)).length;
}

const timestamp = value => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/* BOUNDED CLOCKS (v8.71). updated_at and tombstones come from the device clock.
   A phone ten minutes fast won every merge for ten minutes, and a deletion
   dated in the future could no longer be undone. Any timestamp more than
   five minutes ahead of the server is brought back to the server time. */
export const TOLERATED_LEAD_MS = 5 * 60 * 1000;

/* Normalises what comes from the network: we trust neither the shape nor the
   types. A row without a usable `id` is dropped, it could not be merged.
   `now` is optional: without it, no clamping (rereading the document). */
export function sanitisePayload(raw, now) {
  const source = raw && typeof raw === "object" ? renameDocument(raw) : {};
  const tables = {};
  const tombstones = {};
  const clamp = ts => {
    const t = timestamp(ts);
    return now && t > now + TOLERATED_LEAD_MS ? now : t;
  };

  for (const name of TABLES) {
    const rows = Array.isArray(source.tables?.[name]) ? source.tables[name] : [];
    tables[name] = rows
      .filter(row => row && typeof row === "object" && typeof row.id === "string" && row.id !== "")
      .map(row => ({ ...row, updated_at: clamp(row.updated_at) }));

    const marks = source.tombstones?.[name];
    tombstones[name] = {};
    if (marks && typeof marks === "object") {
      for (const [id, ts] of Object.entries(marks)) {
        if (typeof id === "string" && id !== "") tombstones[name][id] = clamp(ts);
      }
    }
  }
  /* The device's schema version (v8.71). The document keeps the highest seen:
     a tab stuck on an old version, which does not know the recent columns,
     is refused instead of erasing them (see handleSync). */
  const schema = Number(source.schema);
  return { tables, tombstones, schema: Number.isFinite(schema) && schema > 0 ? Math.floor(schema) : 0 };
}

// A table bigger than the cap is REFUSED, no longer silently truncated.
export function tooManyRows(payload) {
  return TABLES.some(name => payload.tables[name].length > MAX_ROWS_PER_TABLE);
}

export function emptyPayload() {
  return sanitisePayload({});
}

/* ON EQUAL updated_at, FIELD BY FIELD MERGE (v8.71). The two versions were
   supposed to be identical, and the last one seen won. That is not true when
   a tab on an old version sends back a row WITHOUT the columns it does not
   know, at the same date: the truncated version won and spread. Now the
   union of fields is kept; on a field present on both sides with two
   values, the version whose JSON is larger wins, which keeps the merge
   commutative. */
export function mergeRow(a, b) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja === jb) return a;
  const [smaller, larger] = ja < jb ? [a, b] : [b, a];
  return { ...smaller, ...larger };
}

function mergeRows(left, right) {
  const byId = new Map();
  for (const row of [...(left || []), ...(right || [])]) {
    const existing = byId.get(row.id);
    if (!existing) { byId.set(row.id, row); continue; }
    const tr = timestamp(row.updated_at), te = timestamp(existing.updated_at);
    if (tr > te) byId.set(row.id, row);
    else if (tr === te) byId.set(row.id, mergeRow(existing, row));
  }
  return [...byId.values()];
}

function mergeTombstones(left, right) {
  const merged = { ...(left || {}) };
  for (const [id, ts] of Object.entries(right || {})) {
    if (timestamp(ts) > timestamp(merged[id])) merged[id] = timestamp(ts);
  }
  return merged;
}

/* Merges two payloads. Commutative and idempotent: syncing twice in a row,
   or in the other direction, gives the same result. */
export function mergePayloads(left, right, now) {
  // Already renamed when they come through sanitisePayload; free otherwise.
  left = renameDocument(left || {});
  right = renameDocument(right || {});
  const tables = {};
  const tombstones = {};

  for (const name of TABLES) {
    const marks = mergeTombstones(left.tombstones?.[name], right.tombstones?.[name]);

    // A row only survives if no tombstone is LATER than it.
    // Rewriting a row after deleting it therefore brings it back, which is
    // the expected behaviour.
    tables[name] = mergeRows(left.tables?.[name], right.tables?.[name])
      .filter(row => timestamp(marks[row.id]) <= timestamp(row.updated_at));

    tombstones[name] = Object.fromEntries(
      Object.entries(marks).filter(([, ts]) => now - ts < TOMBSTONE_RETENTION_MS)
    );
  }
  return { tables, tombstones, schema: Math.max(Number(left.schema) || 0, Number(right.schema) || 0) };
}

/* ---------- D1 storage ---------- */

const DOCUMENT_NAME = "state";
let schemaReady = false;

/* The schema is created on demand rather than by a migration run by hand:
   a single table, once per isolate, and nothing to do on the user side
   beyond creating the database. */
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.exec(
    "CREATE TABLE IF NOT EXISTS documents (name TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)"
  );
  schemaReady = true;
}

/* An UNREADABLE document is no longer replaced by an empty state (v8.71):
   that meant writing over the only server copy. The exchange fails with a
   clear code, the devices' data stays intact, and the daily copy (see
   saveDocument) makes it possible to start again. */
async function readDocument(db) {
  const row = await db.prepare("SELECT payload FROM documents WHERE name = ?").bind(DOCUMENT_NAME).first();
  if (!row || !row.payload) return emptyPayload();
  try {
    return sanitisePayload(JSON.parse(row.payload));
  } catch (error) {
    throw Object.assign(new Error("unreadable document"), { code: "unreadable-document" });
  }
}

// Returns the JSON written: it also serves for the size and the response,
// without reserialising the whole document three times.
async function writeDocument(db, payload, now) {
  const text = JSON.stringify(payload);
  await db
    .prepare(
      "INSERT INTO documents (name, payload, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(name) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at"
    )
    .bind(DOCUMENT_NAME, text, now)
    .run();
  return text;
}

/* DAILY BACKUP (v8.71). A faulty device spread its error everywhere in a
   single upload, and the only safety net was D1 Time Travel, which restores
   the whole database. Every day, the scheduled trigger copies the document
   under the name state@AAAA-MM-JJ and keeps the last BACKUP_DAYS.
   Restoring a copy: see DOCUMENTATION.md, sync section. */
export const BACKUP_DAYS = 30;
export async function saveDocument(db, now) {
  await ensureSchema(db);
  const row = await db.prepare("SELECT payload FROM documents WHERE name = ?").bind(DOCUMENT_NAME).first();
  if (!row || !row.payload) return null;
  const day = new Date(now).toISOString().slice(0, 10);
  const name = DOCUMENT_NAME + "@" + day;
  await db
    .prepare(
      "INSERT INTO documents (name, payload, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(name) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at"
    )
    .bind(name, row.payload, now)
    .run();
  const cutoff = new Date(now - BACKUP_DAYS * 86400000).toISOString().slice(0, 10);
  await db.prepare("DELETE FROM documents WHERE name LIKE ? AND name < ?")
    .bind(DOCUMENT_NAME + "@%", DOCUMENT_NAME + "@" + cutoff).run();
  return name;
}

const json = (body, status) =>
  new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

function counts(payload) {
  return Object.fromEntries(TABLES.map(name => [name, payload.tables[name].length]));
}

// A body bigger than this is not a coffee logbook, it is an error.
export const MAX_BODY_BYTES = 4_000_000;

/* GET returns the server state, POST merges the sent state then returns the
   result. A single round trip is therefore enough to converge. Any error
   returns a JSON code the client can read (v8.71), no longer a raw 500 page. */
export async function handleSync(request, env) {
  try {
    return await exchangeSync(request, env);
  } catch (error) {
    console.error("sync", error && error.code, error && error.message);
    return json({ error: (error && error.code) || "server" }, 500);
  }
}

async function exchangeSync(request, env) {
  const db = env.DB;
  if (!db) {
    return json(
      {
        error: "sync-not-configured",
        message:
          "No D1 database bound. Create the database and the DB binding in Cloudflare, " +
          "see DOCUMENTATION.md section 10.",
      },
      503
    );
  }

  await ensureSchema(db);
  const now = Date.now();
  const stored = await readDocument(db);

  if (request.method === "GET") {
    return json({ ...stored, serverTime: now, size: documentSize(stored), cap: MAX_DOCUMENT_BYTES });
  }
  if (request.method !== "POST") return json({ error: "method-not-allowed" }, 405);

  const length = Number(request.headers.get("content-length"));
  if (length > MAX_BODY_BYTES) return json({ error: "too-large" }, 413);
  let received;
  try {
    received = await request.json();
  } catch (error) {
    return json({ error: "unreadable-json" }, 400);
  }

  const incoming = sanitisePayload(received, now);
  if (tooManyRows(incoming)) return json({ error: "too-large" }, 413);
  /* A device older than the document does not know its columns: it is
     refused, and the client offers to reload the page. */
  if (incoming.schema < Math.max(stored.schema, MIN_CLIENT_SCHEMA)) {
    return json({ error: "outdated-version", schema: Math.max(stored.schema, MIN_CLIENT_SCHEMA) }, 409);
  }

  const merged = mergePayloads(stored, incoming, now);
  const text = await writeDocument(db, merged, now);
  const size = encoder.encode(text).length;
  // The response reuses the JSON already written, completed with the exchange fields.
  const extra = JSON.stringify({ serverTime: now, counts: counts(merged), size: size, cap: MAX_DOCUMENT_BYTES });
  return new Response(text.slice(0, -1) + "," + extra.slice(1), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
