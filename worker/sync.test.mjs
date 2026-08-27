import { mergePayloads, sanitisePayload, emptyPayload, TOMBSTONE_RETENTION_MS, TABLES } from "./sync.js";

let failures = 0;
function check(label, condition, detail) {
  if (!condition) failures += 1;
  console.log(`${condition ? "OK  " : "FAIL"} ${label}${!condition && detail ? ` -> ${detail}` : ""}`);
}

const NOW = 1_700_000_000_000;
const payload = (extractions, tombes) =>
  sanitisePayload({ tables: { extractions }, tombes: { extractions: tombes || {} } });
const ext = (id, maj_le, note) => ({ id, maj_le, note_sur_10: note });
const ids = p => p.tables.extractions.map(r => r.id).sort();
const noteDe = (p, id) => p.tables.extractions.find(r => r.id === id)?.note_sur_10;

// 1. Premiere synchro : le serveur est vide, l'appareil pousse tout
const local = payload([ext("e1", NOW, 7), ext("e2", NOW, 8)]);
const premiere = mergePayloads(emptyPayload(), local, NOW);
check("serveur vide adopte le local", JSON.stringify(ids(premiere)) === '["e1","e2"]', ids(premiere).join());

// 2. Appareil neuf, local vide : il recoit tout, sans rien perdre
const neuf = mergePayloads(premiere, emptyPayload(), NOW);
check("appareil neuf recoit tout", JSON.stringify(ids(neuf)) === '["e1","e2"]', ids(neuf).join());

// 3. Union : chaque appareil a saisi une extraction differente hors ligne
const telephone = payload([ext("e1", NOW, 7), ext("e3", NOW + 10, 9)]);
const bureau = payload([ext("e1", NOW, 7), ext("e4", NOW + 20, 6)]);
const union = mergePayloads(telephone, bureau, NOW + 30);
check("les deux saisies survivent", JSON.stringify(ids(union)) === '["e1","e3","e4"]', ids(union).join());

// 4. Le plus recent maj_le gagne sur la meme ligne
const ancien = payload([ext("e1", NOW, 5)]);
const recent = payload([ext("e1", NOW + 100, 9)]);
check("le plus recent gagne", noteDe(mergePayloads(ancien, recent, NOW + 200), "e1") === 9);
check("dans l'autre sens aussi", noteDe(mergePayloads(recent, ancien, NOW + 200), "e1") === 9);

// 5. Commutativite et idempotence : c'est ce qui garantit la convergence.
// L'ORDRE des lignes dans un tableau n'est PAS significatif (l'interface trie
// toujours ce qu'elle affiche), donc la comparaison est canonique : on trie par
// id avant de comparer. Seul le CONTENU doit etre commutatif.
const canonique = p =>
  JSON.stringify({
    tables: Object.fromEntries(
      Object.entries(p.tables).map(([t, rows]) => [t, [...rows].sort((x, y) => x.id.localeCompare(y.id))])
    ),
    // L'ordre d'insertion des cles d'un objet n'est pas plus significatif que
    // celui des lignes : on les trie aussi.
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
check("fusion commutative sur le contenu", canonique(ab) === canonique(ba));
check("fusion idempotente", canonique(mergePayloads(ab, ab, NOW + 100)) === canonique(ab));

// En production le document serveur est TOUJOURS le premier operande, donc
// l'ordre est deterministe et les deux appareils convergent aussi sur l'ordre.
const serveur = mergePayloads(emptyPayload(), a, NOW);
const depuisTelephone = mergePayloads(serveur, b, NOW + 100);
const depuisBureau = mergePayloads(serveur, b, NOW + 100);
check("ordre deterministe a serveur egal", JSON.stringify(depuisTelephone) === JSON.stringify(depuisBureau));

// 6. Suppression : la pierre tombale empeche la resurrection
const supprime = payload([], { e1: NOW + 50 });
const encoreLa = payload([ext("e1", NOW, 7)]);
const apresSuppression = mergePayloads(supprime, encoreLa, NOW + 60);
check("la ligne supprimee ne revient pas", ids(apresSuppression).length === 0, ids(apresSuppression).join());
check("la pierre tombale est conservee", apresSuppression.tombes.extractions.e1 === NOW + 50);

// 7. Une reecriture POSTERIEURE a la suppression fait bien revenir la ligne
const reecrite = payload([ext("e1", NOW + 99, 9)]);
const revenue = mergePayloads(supprime, reecrite, NOW + 100);
check("reecriture posterieure gagne sur la suppression", ids(revenue).join() === "e1");
check("et garde la nouvelle valeur", noteDe(revenue, "e1") === 9);

// 8. Purge des pierres tombales trop vieilles
const vieille = payload([], { e1: NOW });
const purge = mergePayloads(vieille, emptyPayload(), NOW + TOMBSTONE_RETENTION_MS + 1);
check("pierre tombale purgee passe le delai", Object.keys(purge.tombes.extractions).length === 0);
const fraiche = mergePayloads(vieille, emptyPayload(), NOW + 1000);
check("pierre tombale gardee avant le delai", Object.keys(fraiche.tombes.extractions).length === 1);

// 9. Robustesse : formes invalides venues du reseau
const sale = sanitisePayload({
  tables: { extractions: [{ id: "ok", maj_le: "123" }, { id: "" }, null, "texte", { pasDId: 1 }] },
  tombes: { extractions: { bon: "50", "": 10 } },
});
check("lignes sans id jetees", ids(sale).join() === "ok", ids(sale).join());
check("maj_le converti en nombre", sale.tables.extractions[0].maj_le === 123);
check("tombe sans id jetee", JSON.stringify(sale.tombes.extractions) === '{"bon":50}');
check("charge utile absurde toleree", JSON.stringify(sanitisePayload(null)) === JSON.stringify(emptyPayload()));
/* Pas de liste en dur : le compte suit TABLES, seule source de verite cote
   serveur. Une table oubliee ici ne se synchroniserait pas, en silence. */
check(
  "toutes les tables de TABLES sont presentes",
  Object.keys(emptyPayload().tables).sort().join() === [...TABLES].sort().join(),
  Object.keys(emptyPayload().tables).sort().join()
);

// 10. maj_le absent (donnees d'avant la synchro) : traite comme le plus ancien
const sansStamp = payload([{ id: "e1", note_sur_10: 5 }]);
check("maj_le absent vaut zero", sansStamp.tables.extractions[0].maj_le === 0);
const gagnantStampe = mergePayloads(sansStamp, payload([ext("e1", NOW, 9)]), NOW);
check("une ligne estampillee bat une ligne sans stamp", noteDe(gagnantStampe, "e1") === 9);

// 11. Les autres tables ne sont pas perdues au passage
const complet = sanitisePayload({
  tables: { cafes: [{ id: "c1", maj_le: NOW }], extractions: [], recettes: [{ id: "r1", maj_le: NOW }], tasses: [] },
});
const garde = mergePayloads(emptyPayload(), complet, NOW);
check("les cafes survivent", garde.tables.cafes.length === 1);
check("les recettes survivent", garde.tables.recettes.length === 1);

console.log(failures === 0 ? "\nTOUT PASSE" : `\n${failures} ECHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
