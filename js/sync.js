/* Synchronisation entre appareils, cote client.
 *
 * Ce fichier ne fait QUE parler au reseau et fusionner localement. Il ne touche
 * pas a l'etat de l'application : c'est data.js qui decide quand synchroniser
 * et qui adopte le resultat.
 *
 * En file:// il n'y a pas de serveur : disponible() renvoie false et tout le
 * reste du site fonctionne exactement comme avant, chaque appareil avec ses
 * propres donnees. C'est aussi le comportement quand la base D1 n'est pas liee.
 *
 * Le modele de fusion est decrit dans worker/sync.js. En resume : chaque ligne
 * porte un `maj_le`, le plus recent gagne, et les suppressions laissent une
 * pierre tombale pour ne pas ressusciter au prochain echange.
 */

const SYNC = (() => {
  const ENDPOINT = "api/sync";
  // Toute nouvelle table DOIT etre ajoutee ici ET dans worker/sync.js, sinon
  // elle ne se synchronise pas, en silence et sans erreur.
  const TABLES = ["cafes", "extractions", "recettes", "tasses", "achats", "reglages"];
  const TIMEOUT_MS = 15000;

  // Pas de serveur en file:// : inutile d'essayer, et le fetch echouerait de
  // toute facon sur une origine nulle.
  function disponible() {
    return typeof location !== "undefined" && String(location.protocol).startsWith("http");
  }

  function tombesVides() {
    return Object.fromEntries(TABLES.map(name => [name, {}]));
  }

  /* LA MÊME FUSION QUE LE SERVEUR, CÔTÉ CLIENT (v8.71). La réponse d'une synchro
     remplaçait l'état local : une tasse ajoutée, ou restaurée par « Annuler »,
     pendant l'échange (jusqu'à 15 s) disparaissait. Maintenant la réponse est
     FUSIONNÉE avec l'état tel qu'il est au retour, avec exactement la règle de
     worker/sync.js : ligne par ligne le plus récent gagne, union des champs à
     égalité, et une pierre tombale postérieure supprime. Un test compare les
     deux fusions. Pas de purge ici : c'est le serveur qui purge. */
  const horo = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
  function fusionnerLigne(a, b) {
    const ja = JSON.stringify(a), jb = JSON.stringify(b);
    if (ja === jb) return a;
    const [petite, grande] = ja < jb ? [a, b] : [b, a];
    return { ...petite, ...grande };
  }
  function fusionner(gauche, droite) {
    const tables = {}, tombes = {};
    for (const nom of TABLES) {
      const marques = { ...((gauche.tombes || {})[nom] || {}) };
      for (const [id, ts] of Object.entries((droite.tombes || {})[nom] || {})) {
        if (horo(ts) > horo(marques[id])) marques[id] = horo(ts);
      }
      const parId = new Map();
      for (const ligne of [...((gauche.tables || {})[nom] || []), ...((droite.tables || {})[nom] || [])]) {
        if (!ligne || !ligne.id) continue;
        const ex = parId.get(ligne.id);
        if (!ex) { parId.set(ligne.id, ligne); continue; }
        const tl = horo(ligne.maj_le), te = horo(ex.maj_le);
        if (tl > te) parId.set(ligne.id, ligne);
        else if (tl === te) parId.set(ligne.id, fusionnerLigne(ex, ligne));
      }
      tables[nom] = [...parId.values()].filter(l => horo(marques[l.id]) <= horo(l.maj_le));
      tombes[nom] = marques;
    }
    return { tables, tombes };
  }

  /* Echange en un seul aller retour : on envoie l'etat local, le serveur
     fusionne et renvoie le resultat, qui devient la verite des deux cotes.
     Les erreurs sont typees pour que l'appelant sache quoi afficher. */
  async function echanger(payload) {
    const abort = new AbortController();
    const minuteur = setTimeout(() => abort.abort(), TIMEOUT_MS);
    let reponse;
    try {
      reponse = await fetch(ENDPOINT, {
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
      clearTimeout(minuteur);
    }

    // La porte d'entree repond 401 en JSON sur /api/sync, mais si un jour elle
    // redirigeait, on ne veut surtout pas parser la page de connexion comme des
    // donnees.
    if (reponse.status === 401 || reponse.redirected) {
      throw Object.assign(new Error("session"), { code: "session-expiree" });
    }
    if (reponse.status === 503) {
      throw Object.assign(new Error("non configuree"), { code: "non-configuree" });
    }
    // Le serveur connaît une version plus récente du carnet que cet onglet (v8.71).
    if (reponse.status === 409) {
      throw Object.assign(new Error("version perimee"), { code: "version-perimee" });
    }
    if (!reponse.ok) {
      throw Object.assign(new Error("http " + reponse.status), { code: "erreur" });
    }

    const recu = await reponse.json();
    if (!recu || typeof recu !== "object" || !recu.tables) {
      throw Object.assign(new Error("reponse inattendue"), { code: "erreur" });
    }
    return recu;
  }

  return { disponible, echanger, fusionner, tombesVides, TABLES };
})();
