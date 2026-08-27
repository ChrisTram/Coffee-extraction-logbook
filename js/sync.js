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
    if (!reponse.ok) {
      throw Object.assign(new Error("http " + reponse.status), { code: "erreur" });
    }

    const recu = await reponse.json();
    if (!recu || typeof recu !== "object" || !recu.tables) {
      throw Object.assign(new Error("reponse inattendue"), { code: "erreur" });
    }
    return recu;
  }

  return { disponible, echanger, tombesVides, TABLES };
})();
