/* Fusion des donnees entre appareils, et stockage Cloudflare D1.
 *
 * POURQUOI D1 ET PAS KV : KV est a coherence eventuelle, une lecture juste
 * apres une ecriture peut renvoyer l'etat precedent pendant une minute. Or le
 * geste type est exactement celui la : saisir une extraction sur le telephone
 * en cuisine puis regarder le tableau de bord sur le bureau. D1 est fortement
 * coherent.
 *
 * POURQUOI UN DOCUMENT JSON ET PAS DES TABLES SQL : le schema des donnees vit
 * dans le client (normaliserCafe, normaliserExtraction, migrerDonnees) et evolue
 * regulierement, avec des migrations idempotentes cote client. Le dupliquer en
 * SQL obligerait a une migration D1 a chaque colonne ajoutee. Ici le serveur ne
 * connait qu'une seule chose : chaque ligne a un `id` et un `maj_le`.
 *
 * MODELE DE FUSION : ligne par ligne, le plus recent `maj_le` gagne. Les
 * suppressions laissent une pierre tombale (`tombes`), sans quoi une ligne
 * supprimee sur un appareil ressusciterait a la premiere synchro de l'autre.
 * Les pierres tombales sont purgees passe TOMBSTONE_RETENTION_MS, sinon elles
 * grossiraient sans fin.
 */

export const TABLES = ["cafes", "extractions", "recettes", "tasses", "achats"];

// Trois mois : bien plus que le delai realiste entre deux synchros d'un meme
// appareil, ce qui est la seule chose que les pierres tombales doivent couvrir.
export const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

// Garde fou : un seul utilisateur, mais on refuse une charge absurde plutot que
// de faire exploser la limite de taille de D1.
const MAX_ROWS_PER_TABLE = 20000;

const timestamp = value => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/* Normalise ce qui arrive du reseau : on ne fait confiance ni a la forme ni aux
   types. Une ligne sans `id` utilisable est jetee, elle serait infusionnable. */
export function sanitisePayload(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const tables = {};
  const tombes = {};

  for (const name of TABLES) {
    const rows = Array.isArray(source.tables?.[name]) ? source.tables[name] : [];
    tables[name] = rows
      .filter(row => row && typeof row === "object" && typeof row.id === "string" && row.id !== "")
      .slice(0, MAX_ROWS_PER_TABLE)
      .map(row => ({ ...row, maj_le: timestamp(row.maj_le) }));

    const marks = source.tombes?.[name];
    tombes[name] = {};
    if (marks && typeof marks === "object") {
      for (const [id, ts] of Object.entries(marks)) {
        if (typeof id === "string" && id !== "") tombes[name][id] = timestamp(ts);
      }
    }
  }
  return { tables, tombes };
}

export function emptyPayload() {
  return sanitisePayload({});
}

function mergeRows(left, right) {
  const parId = new Map();
  for (const row of [...(left || []), ...(right || [])]) {
    const existant = parId.get(row.id);
    // A egalite de maj_le les deux versions sont censees etre identiques : on
    // garde la derniere vue, le resultat est stable dans les deux sens.
    if (!existant || timestamp(row.maj_le) >= timestamp(existant.maj_le)) parId.set(row.id, row);
  }
  return [...parId.values()];
}

function mergeTombstones(left, right) {
  const fusion = { ...(left || {}) };
  for (const [id, ts] of Object.entries(right || {})) {
    if (timestamp(ts) > timestamp(fusion[id])) fusion[id] = timestamp(ts);
  }
  return fusion;
}

/* Fusionne deux charges utiles. Commutatif et idempotent : synchroniser deux
   fois de suite, ou dans l'autre sens, donne le meme resultat. */
export function mergePayloads(left, right, now) {
  const tables = {};
  const tombes = {};

  for (const name of TABLES) {
    const marks = mergeTombstones(left.tombes?.[name], right.tombes?.[name]);

    // Une ligne ne survit que si aucune pierre tombale ne lui est POSTERIEURE.
    // Reecrire une ligne apres l'avoir supprimee la fait donc revenir, ce qui
    // est le comportement attendu.
    tables[name] = mergeRows(left.tables?.[name], right.tables?.[name])
      .filter(row => timestamp(marks[row.id]) <= timestamp(row.maj_le));

    tombes[name] = Object.fromEntries(
      Object.entries(marks).filter(([, ts]) => now - ts < TOMBSTONE_RETENTION_MS)
    );
  }
  return { tables, tombes };
}

/* ---------- Stockage D1 ---------- */

const DOCUMENT_NAME = "state";
let schemaReady = false;

/* Le schema est cree a la demande plutot que par une migration a lancer a la
   main : une seule table, une seule fois par isolat, et rien a faire cote
   utilisateur au dela de la creation de la base. */
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.exec(
    "CREATE TABLE IF NOT EXISTS documents (name TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)"
  );
  schemaReady = true;
}

async function readDocument(db) {
  const ligne = await db.prepare("SELECT payload FROM documents WHERE name = ?").bind(DOCUMENT_NAME).first();
  if (!ligne || !ligne.payload) return emptyPayload();
  try {
    return sanitisePayload(JSON.parse(ligne.payload));
  } catch (error) {
    // Document illisible : on repart d'un etat vide plutot que de tout bloquer.
    // La fusion qui suit reinjectera l'etat de l'appareil qui appelle.
    return emptyPayload();
  }
}

async function writeDocument(db, payload, now) {
  await db
    .prepare(
      "INSERT INTO documents (name, payload, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(name) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at"
    )
    .bind(DOCUMENT_NAME, JSON.stringify(payload), now)
    .run();
}

const json = (body, status) =>
  new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

function counts(payload) {
  return Object.fromEntries(TABLES.map(name => [name, payload.tables[name].length]));
}

/* GET renvoie l'etat serveur, POST fusionne l'etat envoye puis renvoie le
   resultat. Un seul aller retour suffit donc a converger. */
export async function handleSync(request, env) {
  const db = env.DB;
  if (!db) {
    return json(
      {
        erreur: "sync-non-configuree",
        message:
          "Aucune base D1 liee. Creer la base et le binding DB dans Cloudflare, " +
          "voir DOCUMENTATION.md section 10.",
      },
      503
    );
  }

  await ensureSchema(db);
  const now = Date.now();
  const stocke = await readDocument(db);

  if (request.method === "GET") return json({ ...stocke, serverTime: now });
  if (request.method !== "POST") return json({ erreur: "methode-non-permise" }, 405);

  let recu;
  try {
    recu = await request.json();
  } catch (error) {
    return json({ erreur: "json-illisible" }, 400);
  }

  const fusion = mergePayloads(stocke, sanitisePayload(recu), now);
  await writeDocument(db, fusion, now);
  return json({ ...fusion, serverTime: now, compte: counts(fusion) });
}
