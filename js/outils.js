/* Outils PURS, partagés par toutes les couches.
 *
 * Premier script de la page : rien ici ne dépend du DOM, des données ni d'un
 * autre fichier, et tout s'exécute tel quel dans Node pour les tests.
 *
 * Pourquoi ce fichier existe : moyenne() vivait dans reglages.js ET dans le
 * noyau de l'interface, cleLocale() dans charts.js ET dans le noyau, et la même
 * date locale était recalculée une troisième fois dans data.js. Trois copies
 * d'une fonction de calcul divergent un jour, en silence, et deux écrans
 * affichent alors deux chiffres pour la même chose. Une seule définition, ici.
 *
 * Règle d'admission : une fonction entre ici si au moins deux couches (données,
 * graphiques, interface) en ont besoin ET qu'elle ne touche ni au DOM ni à
 * l'état. Sinon elle reste chez elle. */
"use strict";

const OUTILS = (() => {

  /* Moyenne arithmétique, ou null sur une liste vide. Null et pas NaN : NaN se
     propage sans bruit jusqu'à l'affichage et finit en "NaN / 10" à l'écran,
     null se teste en un mot à l'endroit où on décide quoi montrer. */
  function moyenne(liste) {
    if (!liste || !liste.length) return null;
    return liste.reduce((a, b) => a + b, 0) / liste.length;
  }

  /* Clé de jour en heure LOCALE, "2026-09-06". Jamais toISOString : elle
     travaille en UTC et, à UTC+7, une tasse du soir tomberait sur le lendemain. */
  function cleLocale(d) {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const j = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + j;
  }

  /* Version du site, lue UNE fois dans <meta name="app-version"> d'index.html.
     C'est la seule source : le pied de page l'affiche, et chaque fichier chargé
     à la demande (Chart.js, le paquet anglais, la démo) l'ajoute en paramètre
     d'URL pour que le navigateur puisse le garder en cache tant que la version
     ne change pas. Hors navigateur (tests Node) il n'y a pas de meta : "" et les
     URL restent nues. */
  let versionLue = null;
  function versionSite() {
    if (versionLue !== null) return versionLue;
    let v = "";
    try {
      const meta = typeof document !== "undefined" && document.querySelector
        ? document.querySelector('meta[name="app-version"]') : null;
      v = meta && typeof meta.content === "string" ? meta.content.trim() : "";
    } catch (e) { v = ""; }
    versionLue = v;
    return v;
  }

  function urlVersionnee(chemin) {
    const v = versionSite();
    return v ? chemin + "?v=" + encodeURIComponent(v) : chemin;
  }

  /* UN SEUL ÉCHAPPEMENT (v8.73). Il en existait six copies inégales (celle du
     mode Brassage n'échappait pas les guillemets). Pour tout texte qui entre
     dans du HTML, contenu comme attribut. */
  function echap(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  return { moyenne, cleLocale, versionSite, urlVersionnee, echap };
})();
