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

export const TABLES = ["cafes", "extractions", "recettes", "tasses", "achats", "reglages"];

// Trois mois : bien plus que le delai realiste entre deux synchros d'un meme
// appareil, ce qui est la seule chose que les pierres tombales doivent couvrir.
export const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

// Garde fou : un seul utilisateur, mais on refuse une charge absurde plutot que
// de faire exploser la limite de taille de D1.
const MAX_ROWS_PER_TABLE = 20000;

/* Tout l'etat tient dans UNE ligne D1, en JSON, et D1 plafonne la taille d'une
   ligne : 2 000 000 octets d'apres sa documentation (a revalider si Cloudflare
   la change). Le jour ou le document depasse, l'ecriture echoue d'un coup, sans
   avertissement, avec les donnees en securite cote client mais plus rien qui
   converge. A 600 octets par extraction et une tasse et demie par jour, c'est
   loin, mais c'est le genre de chose qu'on oublie : le serveur renvoie donc la
   taille du document a chaque echange, et le client previent passe la moitie. */
export const MAX_DOCUMENT_BYTES = 2_000_000;
const encoder = new TextEncoder();
export function documentSize(payload) {
  return encoder.encode(JSON.stringify(payload)).length;
}

const timestamp = value => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/* HORLOGES BORNEES (v8.71). maj_le et les pierres tombales viennent de l'horloge
   de l'appareil. Un telephone en avance de dix minutes gagnait toutes les
   fusions pendant dix minutes, et une suppression datee du futur ne pouvait plus
   etre annulee. Tout horodatage plus de cinq minutes dans le futur du serveur est
   ramene a l'heure du serveur. */
export const AVANCE_TOLEREE_MS = 5 * 60 * 1000;

/* Normalise ce qui arrive du reseau : on ne fait confiance ni a la forme ni aux
   types. Une ligne sans `id` utilisable est jetee, elle serait infusionnable.
   `now` est facultatif : sans lui, pas de bornage (relecture du document). */
export function sanitisePayload(raw, now) {
  const source = raw && typeof raw === "object" ? raw : {};
  const tables = {};
  const tombes = {};
  const borne = ts => {
    const t = timestamp(ts);
    return now && t > now + AVANCE_TOLEREE_MS ? now : t;
  };

  for (const name of TABLES) {
    const rows = Array.isArray(source.tables?.[name]) ? source.tables[name] : [];
    tables[name] = rows
      .filter(row => row && typeof row === "object" && typeof row.id === "string" && row.id !== "")
      .map(row => ({ ...row, maj_le: borne(row.maj_le) }));

    const marks = source.tombes?.[name];
    tombes[name] = {};
    if (marks && typeof marks === "object") {
      for (const [id, ts] of Object.entries(marks)) {
        if (typeof id === "string" && id !== "") tombes[name][id] = borne(ts);
      }
    }
  }
  /* La version du schema de l'appareil (v8.71). Le document garde la plus haute
     vue : un onglet reste sur une ancienne version, qui ne connait pas les
     colonnes recentes, est refuse au lieu de les effacer (voir handleSync). */
  const schema = Number(source.schema);
  return { tables, tombes, schema: Number.isFinite(schema) && schema > 0 ? Math.floor(schema) : 0 };
}

// Une table plus grosse que le plafond est REFUSEE, plus tronquee en silence.
export function tropDeLignes(payload) {
  return TABLES.some(name => payload.tables[name].length > MAX_ROWS_PER_TABLE);
}

export function emptyPayload() {
  return sanitisePayload({});
}

/* A EGALITE DE maj_le, FUSION CHAMP PAR CHAMP (v8.71). Les deux versions etaient
   censees etre identiques, et la derniere vue gagnait. Ce n'est pas vrai quand
   un onglet sur une ancienne version renvoie une ligne SANS les colonnes qu'il ne
   connait pas, a la meme date : la version amputee gagnait et se propageait.
   Maintenant l'union des champs est gardee ; sur un champ present des deux cotes
   avec deux valeurs, la version dont le JSON est le plus grand l'emporte, ce qui
   garde la fusion commutative. */
export function fusionnerLigne(a, b) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja === jb) return a;
  const [petite, grande] = ja < jb ? [a, b] : [b, a];
  return { ...petite, ...grande };
}

function mergeRows(left, right) {
  const parId = new Map();
  for (const row of [...(left || []), ...(right || [])]) {
    const existant = parId.get(row.id);
    if (!existant) { parId.set(row.id, row); continue; }
    const tr = timestamp(row.maj_le), te = timestamp(existant.maj_le);
    if (tr > te) parId.set(row.id, row);
    else if (tr === te) parId.set(row.id, fusionnerLigne(existant, row));
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
  return { tables, tombes, schema: Math.max(Number(left.schema) || 0, Number(right.schema) || 0) };
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

/* Un document ILLISIBLE n'est plus remplace par un etat vide (v8.71) : c'etait
   ecrire par-dessus la seule copie serveur. L'echange echoue avec un code clair,
   les donnees des appareils restent intactes, et la copie du jour (voir
   sauvegarderDocument) permet de repartir. */
async function readDocument(db) {
  const ligne = await db.prepare("SELECT payload FROM documents WHERE name = ?").bind(DOCUMENT_NAME).first();
  if (!ligne || !ligne.payload) return emptyPayload();
  try {
    return sanitisePayload(JSON.parse(ligne.payload));
  } catch (error) {
    throw Object.assign(new Error("document illisible"), { code: "document-illisible" });
  }
}

// Renvoie le JSON ecrit : il sert aussi a la taille et a la reponse, sans
// reserialiser trois fois le document entier.
async function writeDocument(db, payload, now) {
  const texte = JSON.stringify(payload);
  await db
    .prepare(
      "INSERT INTO documents (name, payload, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(name) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at"
    )
    .bind(DOCUMENT_NAME, texte, now)
    .run();
  return texte;
}

/* SAUVEGARDE QUOTIDIENNE (v8.71). Un appareil fautif propageait son erreur
   partout en un seul envoi, et le seul filet etait Time Travel de D1, qui
   restaure toute la base. Chaque jour, le declencheur planifie copie le document
   sous le nom state@AAAA-MM-JJ et garde les JOURS_DE_SAUVEGARDE derniers.
   Restaurer une copie : voir DOCUMENTATION.md, section synchronisation. */
export const JOURS_DE_SAUVEGARDE = 30;
export async function sauvegarderDocument(db, now) {
  await ensureSchema(db);
  const ligne = await db.prepare("SELECT payload FROM documents WHERE name = ?").bind(DOCUMENT_NAME).first();
  if (!ligne || !ligne.payload) return null;
  const jour = new Date(now).toISOString().slice(0, 10);
  const nom = DOCUMENT_NAME + "@" + jour;
  await db
    .prepare(
      "INSERT INTO documents (name, payload, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(name) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at"
    )
    .bind(nom, ligne.payload, now)
    .run();
  const limite = new Date(now - JOURS_DE_SAUVEGARDE * 86400000).toISOString().slice(0, 10);
  await db.prepare("DELETE FROM documents WHERE name LIKE ? AND name < ?")
    .bind(DOCUMENT_NAME + "@%", DOCUMENT_NAME + "@" + limite).run();
  return nom;
}

const json = (body, status) =>
  new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

function counts(payload) {
  return Object.fromEntries(TABLES.map(name => [name, payload.tables[name].length]));
}

// Un corps plus gros que ca n'est pas un carnet de cafe, c'est une erreur.
export const MAX_CORPS_OCTETS = 4_000_000;

/* GET renvoie l'etat serveur, POST fusionne l'etat envoye puis renvoie le
   resultat. Un seul aller retour suffit donc a converger. Toute erreur rend un
   code JSON lisible par le client (v8.71), plus une page 500 brute. */
export async function handleSync(request, env) {
  try {
    return await echangerSync(request, env);
  } catch (error) {
    console.error("sync", error && error.code, error && error.message);
    return json({ erreur: (error && error.code) || "serveur" }, 500);
  }
}

async function echangerSync(request, env) {
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

  if (request.method === "GET") {
    return json({ ...stocke, serverTime: now, taille: documentSize(stocke), plafond: MAX_DOCUMENT_BYTES });
  }
  if (request.method !== "POST") return json({ erreur: "methode-non-permise" }, 405);

  const longueur = Number(request.headers.get("content-length"));
  if (longueur > MAX_CORPS_OCTETS) return json({ erreur: "trop-gros" }, 413);
  let recu;
  try {
    recu = await request.json();
  } catch (error) {
    return json({ erreur: "json-illisible" }, 400);
  }

  const entrant = sanitisePayload(recu, now);
  if (tropDeLignes(entrant)) return json({ erreur: "trop-gros" }, 413);
  /* Un appareil plus ancien que le document ne connait pas ses colonnes : il
     est refuse, et le client propose de recharger la page. */
  if (entrant.schema < stocke.schema) {
    return json({ erreur: "version-perimee", schema: stocke.schema }, 409);
  }

  const fusion = mergePayloads(stocke, entrant, now);
  const texte = await writeDocument(db, fusion, now);
  const taille = encoder.encode(texte).length;
  // La reponse reprend le JSON deja ecrit, complete des champs d'echange.
  const extra = JSON.stringify({ serverTime: now, compte: counts(fusion), taille, plafond: MAX_DOCUMENT_BYTES });
  return new Response(texte.slice(0, -1) + "," + extra.slice(1), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
