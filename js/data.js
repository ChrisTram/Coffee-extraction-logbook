/* Couche de données : l'état, les mutations, la synchro et le démarrage.
 *
 * Principe : la vérité vit dans les CSV du dossier lié, IndexedDB garde en
 * permanence une copie de travail pour ne rien perdre, et le serveur D1 fait
 * converger les appareils. Ce fichier POSSÈDE l'état et le fait évoluer ; ce
 * qui n'a pas besoin de l'état vit à côté :
 *
 *   data-csv.js         lire et écrire le format CSV
 *   data-schema.js      colonnes, normalisation, semences
 *   data-store.js       IndexedDB, File System Access, téléchargement
 *   data-calculs.js     champs dérivés et lecture des sachets (lecture seule)
 *   data-migrations.js  version de schéma et rattrapages de l'existant
 *
 * La façade DATA rendue en bas expose le même nom qu'avant pour chaque
 * fonction, où qu'elle vive : le reste du site n'a pas bougé. */
"use strict";

const DATA = (() => {

  const { csvParse, csvSerialiser } = DATA_CSV;
  const { CAFE_COLS, EXT_COLS, REGLAGE_ID, REGLAGE_COLS, RECETTE_COLS, TASSE_COLS, ACHAT_COLS,
    estampiller, reporterHorodatage, nouvelId, dateLocaleAujourdhui,
    normaliserCafe, normaliserExtraction, normaliserReglages, normaliserRecette, normaliserAchat,
    normaliserTasse, recetteVersLigne, recettesDefaut, tassesDefaut } = DATA_SCHEMA;
  const { ouvrirDB, kvGet, kvSet, verifierPermission, ecrireFichier, lireFichier, telecharger } = DATA_STORE;

  const state = {
    cafes: [],
    extractions: [],
    recettes: [],
    tasses: [],
    // Un achat = un sachet. Sans cette table, un café racheté gardait UNE seule
    // date de torréfaction, donc la fraîcheur mentait dès le deuxième sachet, et
    // le stock restant n'était pas calculable.
    achats: [],
    reglages: [],
    dirHandle: null,
    fsDisponible: typeof window !== "undefined" && "showDirectoryPicker" in window,
    demoActive: false,

    // Synchronisation entre appareils. `tombes` retient les suppressions
    // ({table: {id: horodatage}}) : sans elles, une ligne supprimée sur le
    // téléphone reviendrait au prochain échange avec le bureau, qui l'a encore.
    // Hors des CSV, c'est de la mécanique de synchro, pas de la donnée café.
    tombes: typeof SYNC === "undefined" ? {} : SYNC.tombesVides(),
    syncEtat: "inconnu",
    syncLe: null,
    // Taille du document sur le serveur et plafond qu'il accepte, en octets.
    // Renvoyés à chaque échange ; le panneau Données prévient passé la moitié.
    syncTaille: 0,
    syncPlafond: 0,
  };

  /* Lecture seule et rattrapages, liés à l'état ci-dessus. Les fonctions
     passées en aides sont des déclarations, donc déjà hissées à ce point. */
  const { cafeDe, calculs, sachetALaDate, sachetCourant, stockSachet } = DATA_CALCULS.pour(state);
  const { migrerDonnees, appliquerSchema, SCHEMA_ACTUEL } =
    DATA_MIGRATIONS.pour(state, { marquerSupprime, reglagesCourants });

  /* Pose une pierre tombale. La date sert à trancher contre une éventuelle
     réécriture de la même ligne sur l'autre appareil. */
  function marquerSupprime(table, id) {
    if (!state.tombes[table]) state.tombes[table] = {};
    state.tombes[table][id] = Date.now();
  }

  const abonnes = [];
  function abonner(fn) { abonnes.push(fn); }
  function notifier() { abonnes.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }

  function reglagesCourants() {
    return state.reglages[0] || normaliserReglages({});
  }

  /* Écrit les réglages et les fait voyager. Comme toute mutation, ça estampille :
     l'appareil qui règle en dernier gagne la fusion, ce qui est exactement ce
     qu'on veut pour une préférence. */
  async function majReglages(partiel) {
    const fusion = estampiller(normaliserReglages({ ...reglagesCourants(), ...partiel }));
    state.reglages = [fusion];
    await persister();
    return fusion;
  }

  function csvRecettes() {
    return csvSerialiser(state.recettes.map(recetteVersLigne), RECETTE_COLS);
  }

  async function ajouterAchat(achat) {
    const a = estampiller(normaliserAchat(achat));
    a.id = nouvelId("a", state.achats);
    state.achats.push(a);
    // La fiche café suit le dernier sachet : format, prix et date de
    // torréfaction affichés ailleurs doivent rester cohérents avec lui.
    const cafe = state.cafes.find(c => c.id === a.cafe_id);
    if (cafe) {
      if (a.format_grammes !== "") cafe.format_grammes = a.format_grammes;
      if (a.prix_vnd !== "") cafe.prix_vnd = a.prix_vnd;
      cafe.date_torrefaction = a.date_torrefaction;
      estampiller(cafe);
    }
    await persister();
    return a;
  }

  async function supprimerAchat(id) {
    marquerSupprime("achats", id);
    state.achats = state.achats.filter(x => x.id !== id);
    await persister();
  }

  async function sauverLocal() {
    await kvSet("cafes", state.cafes);
    await kvSet("extractions", state.extractions);
    await kvSet("recettes", state.recettes);
    await kvSet("tasses", state.tasses);
    await kvSet("demoActive", state.demoActive);
    await kvSet("achats", state.achats);
    await kvSet("reglages", state.reglages);
    await kvSet("tombes", state.tombes);
  }

  // ---------- File System Access ----------

  let ecritureEnAttente = null;
  async function sauverFichiers() {
    if (!state.dirHandle) return false;
    // Regroupe les écritures rapprochées.
    if (ecritureEnAttente) clearTimeout(ecritureEnAttente);
    return new Promise(resolve => {
      ecritureEnAttente = setTimeout(async () => {
        try {
          if (!await verifierPermission(state.dirHandle)) { resolve(false); return; }
          await ecrireFichier(state.dirHandle, "cafes.csv", csvSerialiser(state.cafes, CAFE_COLS));
          await ecrireFichier(state.dirHandle, "extractions.csv", csvSerialiser(state.extractions, EXT_COLS));
          await ecrireFichier(state.dirHandle, "recettes.csv", csvRecettes());
          await ecrireFichier(state.dirHandle, "tasses.csv", csvSerialiser(state.tasses, TASSE_COLS));
          await ecrireFichier(state.dirHandle, "achats.csv", csvSerialiser(state.achats, ACHAT_COLS));
          await ecrireFichier(state.dirHandle, "reglages.csv", csvSerialiser(state.reglages, REGLAGE_COLS));
          resolve(true);
        } catch (e) {
          console.error("Écriture fichier impossible", e);
          resolve(false);
        }
      }, 400);
    });
  }

  async function lierDossier(creer) {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    if (!await verifierPermission(handle)) throw new Error("Permission refusée");
    state.dirHandle = handle;
    if (creer) {
      if (!state.cafes.length) state.cafes = CAFES_DEPART.map(normaliserCafe);
      if (!state.recettes.length) state.recettes = recettesDefaut();
      if (!state.tasses.length) state.tasses = tassesDefaut();
      state.demoActive = false;
      await ecrireFichier(state.dirHandle, "cafes.csv", csvSerialiser(state.cafes, CAFE_COLS));
      await ecrireFichier(state.dirHandle, "extractions.csv", csvSerialiser(state.extractions, EXT_COLS));
      await ecrireFichier(state.dirHandle, "recettes.csv", csvRecettes());
      await ecrireFichier(state.dirHandle, "tasses.csv", csvSerialiser(state.tasses, TASSE_COLS));
      await ecrireFichier(state.dirHandle, "achats.csv", csvSerialiser(state.achats, ACHAT_COLS));
      await ecrireFichier(state.dirHandle, "reglages.csv", csvSerialiser(state.reglages, REGLAGE_COLS));
    } else {
      const tc = await lireFichier(state.dirHandle, "cafes.csv");
      const te = await lireFichier(state.dirHandle, "extractions.csv");
      const tr = await lireFichier(state.dirHandle, "recettes.csv");
      const tt = await lireFichier(state.dirHandle, "tasses.csv");
      const ta = await lireFichier(state.dirHandle, "achats.csv");
      const tg = await lireFichier(state.dirHandle, "reglages.csv");
      if (tc === null && te === null) {
        throw new Error("Ce dossier ne contient ni cafes.csv ni extractions.csv.");
      }
      if (tc !== null) state.cafes = reporterHorodatage(csvParse(tc).map(normaliserCafe), state.cafes, CAFE_COLS);
      if (te !== null) state.extractions = reporterHorodatage(csvParse(te).map(normaliserExtraction), state.extractions, EXT_COLS);
      if (tr !== null) state.recettes = reporterHorodatage(csvParse(tr).map(normaliserRecette), state.recettes, RECETTE_COLS);
      else if (!state.recettes.length) state.recettes = recettesDefaut();
      if (tt !== null) state.tasses = reporterHorodatage(csvParse(tt).map(normaliserTasse), state.tasses, TASSE_COLS);
      if (ta !== null) state.achats = reporterHorodatage(csvParse(ta).map(normaliserAchat), state.achats, ACHAT_COLS);
      if (tg !== null) state.reglages = reporterHorodatage(csvParse(tg).map(normaliserReglages), state.reglages, REGLAGE_COLS).slice(0, 1);
      migrerDonnees();
      await ecrireFichier(state.dirHandle, "recettes.csv", csvRecettes());
      state.demoActive = false;
    }
    await kvSet("dirHandle", handle);
    await sauverLocal();
    notifier();
    return handle.name;
  }

  async function delierDossier() {
    state.dirHandle = null;
    await kvSet("dirHandle", null);
    notifier();
  }

  // ---------- Import et export ----------

  function detecterTable(rows) {
    if (!rows.length) return null;
    const cles = Object.keys(rows[0]);
    if (cles.includes("date_achat")) return "achats";
    if (cles.includes("contenance_ml")) return "tasses";
    if (cles.includes("pour_qui") || cles.includes("sous_titre")) return "recettes";
    if (cles.includes("cafe_id") || cles.includes("diagnostic")) return "extractions";
    if (cles.includes("torrefacteur") || cles.includes("machine_recommandee")) return "cafes";
    return null;
  }

  async function importerTexteCSV(texte) {
    const rows = csvParse(texte);
    const table = detecterTable(rows);
    if (!table) throw new Error("Colonnes non reconnues : ni une table cafés, ni extractions, ni recettes.");
    // Un import est un geste DÉLIBÉRÉ : les lignes sont estampillées maintenant
    // pour qu'elles gagnent la fusion contre la version du serveur. Sans ça, un
    // import serait annulé par la synchro suivante.
    const importees = normaliser => rows.map(r => estampiller(normaliser(r)));
    if (table === "cafes") state.cafes = importees(normaliserCafe);
    else if (table === "recettes") state.recettes = importees(normaliserRecette);
    else if (table === "tasses") state.tasses = importees(normaliserTasse);
    else state.extractions = importees(normaliserExtraction);
    migrerDonnees();
    state.demoActive = false;
    await persister();
    return { table, n: rows.length };
  }

  function exporterCafes() { telecharger("cafes.csv", csvSerialiser(state.cafes, CAFE_COLS)); }
  function exporterExtractions(liste) {
    telecharger("extractions.csv", csvSerialiser(liste || state.extractions, EXT_COLS));
  }
  function exporterRecettes() { telecharger("recettes.csv", csvRecettes()); }

  // ---------- Démo ----------

  /* Le jeu de démonstration est chargé À LA DEMANDE : il ne sert qu'au bouton de
     la modale d'accueil, que Chris ne reverra jamais puisqu'il a ses données.
     Précaché quand même, pour que la démo marche hors ligne comme le reste. */
  function chargerScriptDemo() {
    if (typeof DEMO_CAFES_CSV !== "undefined") return Promise.resolve(true);
    return new Promise(resolve => {
      const s = document.createElement("script");
      s.src = OUTILS.urlVersionnee("js/demo-data.js");
      s.onload = () => resolve(typeof DEMO_CAFES_CSV !== "undefined");
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  async function chargerDemo() {
    // Un échec laisse les données en place plutôt que de vider l'état à moitié.
    if (!await chargerScriptDemo()) throw new Error("Jeu de démonstration indisponible.");
    state.cafes = csvParse(DEMO_CAFES_CSV).map(normaliserCafe);
    state.extractions = csvParse(DEMO_EXTRACTIONS_CSV).map(normaliserExtraction);
    state.recettes = recettesDefaut();
    state.tasses = tassesDefaut();
    // La demo n'a pas de fichier d'achats : la migration en fabrique un sachet
    // implicite par cafe, ce qui suffit a faire vivre le stock en demonstration.
    state.achats = [];
    migrerDonnees();
    state.demoActive = true;
    await sauverLocal();
    notifier();
  }

  async function viderDonnees() {
    state.extractions = [];
    state.cafes = CAFES_DEPART.map(normaliserCafe);
    state.recettes = recettesDefaut();
    state.tasses = tassesDefaut();
    state.achats = [];
    state.demoActive = false;
    await persister();
  }

  // ---------- Mutations ----------

  // ---------- Synchronisation entre appareils ----------

  // Une rafale de modifications (édition d'une recette, saisie enchaînée) ne
  // doit pas produire une rafale de requêtes.
  const SYNC_DEBOUNCE_MS = 1500;
  let syncMinuteur = null;
  let syncEnCours = false;

  function chargeUtileLocale() {
    return {
      tables: {
        cafes: state.cafes,
        extractions: state.extractions,
        recettes: state.recettes,
        tasses: state.tasses,
        achats: state.achats,
        reglages: state.reglages,
      },
      tombes: state.tombes,
    };
  }

  function syncPossible() {
    // JAMAIS en démo : sans ce garde fou, charger la démonstration sur un
    // appareil enverrait 62 fausses extractions dans les vraies données.
    return typeof SYNC !== "undefined" && SYNC.disponible() && !state.demoActive;
  }

  /* Échange avec le serveur et ADOPTE le résultat fusionné. Ne passe pas par
     persister() : cela relancerait une synchro en boucle. */
  async function synchroniser(manuelle) {
    if (!syncPossible()) {
      state.syncEtat = typeof SYNC === "undefined" || !SYNC.disponible() ? "local" : "demo";
      if (manuelle) notifier();
      return state.syncEtat;
    }
    if (syncEnCours) return state.syncEtat;
    syncEnCours = true;
    state.syncEtat = "encours";
    notifier();

    try {
      const fusion = await SYNC.echanger(chargeUtileLocale());
      state.cafes = (fusion.tables.cafes || []).map(normaliserCafe);
      state.extractions = (fusion.tables.extractions || []).map(normaliserExtraction);
      state.recettes = (fusion.tables.recettes || []).map(normaliserRecette);
      state.tasses = (fusion.tables.tasses || []).map(normaliserTasse);
      state.achats = (fusion.tables.achats || []).map(normaliserAchat);
      state.reglages = (fusion.tables.reglages || []).map(normaliserReglages).slice(0, 1);
      state.tombes = fusion.tombes || SYNC.tombesVides();
      state.syncTaille = Number(fusion.taille) || 0;
      state.syncPlafond = Number(fusion.plafond) || 0;
      if (!state.recettes.length) state.recettes = recettesDefaut();
      if (!state.tasses.length) state.tasses = tassesDefaut();
      migrerDonnees();
      await sauverLocal();
      sauverFichiers();
      state.syncEtat = "ok";
      state.syncLe = Date.now();
    } catch (error) {
      // On garde les données locales telles quelles : une synchro ratée ne doit
      // jamais faire perdre une saisie. Le prochain échange rattrapera.
      state.syncEtat = error && error.code ? error.code : "erreur";
    } finally {
      syncEnCours = false;
      notifier();
    }
    return state.syncEtat;
  }

  function planifierSync() {
    if (!syncPossible()) return;
    clearTimeout(syncMinuteur);
    syncMinuteur = setTimeout(() => { synchroniser(false); }, SYNC_DEBOUNCE_MS);
  }

  async function persister() {
    await sauverLocal();
    sauverFichiers();
    notifier();
    planifierSync();
  }

  /* Réinsère une extraction supprimée SOUS SON ID D'ORIGINE. Sert à l'annulation
     de suppression : la ligne est déjà partie, tombstone comprise, et cette
     écriture postérieure la fait revenir partout, y compris sur les autres
     appareils. */
  async function restaurerExtraction(ext) {
    if (!ext || !ext.id) return null;
    const e = estampiller(normaliserExtraction(ext));
    e.id = ext.id;
    const i = state.extractions.findIndex(x => x.id === e.id);
    if (i >= 0) state.extractions[i] = e;
    else state.extractions.push(e);
    await persister();
    return e;
  }

  async function ajouterExtraction(ext) {
    const e = estampiller(normaliserExtraction(ext));
    e.id = nouvelId("e", state.extractions);
    state.extractions.push(e);
    await persister();
    return e;
  }

  async function modifierExtraction(id, ext) {
    const idx = state.extractions.findIndex(x => x.id === id);
    if (idx < 0) return null;
    const e = estampiller(normaliserExtraction(ext));
    e.id = id;
    state.extractions[idx] = e;
    await persister();
    return e;
  }

  async function supprimerExtraction(id) {
    marquerSupprime("extractions", id);
    state.extractions = state.extractions.filter(x => x.id !== id);
    await persister();
  }

  async function ajouterCafe(cafe) {
    const c = estampiller(normaliserCafe(cafe));
    c.id = nouvelId("c", state.cafes);
    if (!c.date_ajout) c.date_ajout = dateLocaleAujourdhui();
    state.cafes.push(c);
    await persister();
    return c;
  }

  async function modifierCafe(id, cafe) {
    const idx = state.cafes.findIndex(x => x.id === id);
    if (idx < 0) return null;
    const c = estampiller(normaliserCafe(cafe));
    c.id = id;
    // La date d'ajout ne s'édite pas : on conserve celle en place.
    if (!c.date_ajout) c.date_ajout = state.cafes[idx].date_ajout || "";
    state.cafes[idx] = c;
    await persister();
    return c;
  }

  // ---------- Recettes : mutations ----------

  function estRecetteDorigine(id) {
    return RECETTES_DEPART.some(r => r.id === id);
  }

  async function ajouterRecette(recette) {
    const r = estampiller(normaliserRecette(recette));
    let n = 1;
    let id = "r" + n;
    while (state.recettes.some(x => x.id === id)) { n++; id = "r" + n; }
    r.id = id;
    state.recettes.push(r);
    await persister();
    return r;
  }

  async function modifierRecette(id, recette) {
    const idx = state.recettes.findIndex(x => x.id === id);
    if (idx < 0) return null;
    const ancienNom = state.recettes[idx].nom;
    const r = estampiller(normaliserRecette(recette));
    r.id = id;
    // Une recette d'origine garde ses marqueurs structurels (variantes du 4:6).
    if (estRecetteDorigine(id)) {
      const origine = RECETTES_DEPART.find(x => x.id === id);
      r.variantes = origine.variantes;
    }
    state.recettes[idx] = r;
    // Si le nom change, suit dans les extractions et les cafés.
    if (ancienNom && r.nom !== ancienNom) {
      state.extractions.forEach(e => { if (e.recette === ancienNom) e.recette = r.nom; });
      state.cafes.forEach(c => { if (c.recette_recommandee === ancienNom) c.recette_recommandee = r.nom; });
    }
    await persister();
    return r;
  }

  async function reinitialiserRecette(id) {
    const origine = RECETTES_DEPART.find(x => x.id === id);
    if (!origine) return null;
    const idx = state.recettes.findIndex(x => x.id === id);
    const r = normaliserRecette({
      ...origine,
      etapes: origine.etapes.map(e => ({ ...e })),
      cafesAssocies: [...origine.cafesAssocies],
    });
    estampiller(r);
    if (idx < 0) state.recettes.push(r);
    else {
      const ancienNom = state.recettes[idx].nom;
      state.recettes[idx] = r;
      if (ancienNom && ancienNom !== r.nom) {
        state.extractions.forEach(e => { if (e.recette === ancienNom) e.recette = r.nom; });
        state.cafes.forEach(c => { if (c.recette_recommandee === ancienNom) c.recette_recommandee = r.nom; });
      }
    }
    await persister();
    return r;
  }

  async function supprimerRecette(id) {
    if (estRecetteDorigine(id)) return false;
    marquerSupprime("recettes", id);
    state.recettes = state.recettes.filter(x => x.id !== id);
    await persister();
    return true;
  }

  // ---------- Tasses : mutations ----------

  async function ajouterTasse(nom, contenance) {
    let n = 1, id = "tp" + n;
    while (state.tasses.some(x => x.id === id)) { n++; id = "tp" + n; }
    state.tasses.push(estampiller(normaliserTasse({ id, nom, contenance_ml: contenance })));
    await persister();
  }

  async function supprimerTasse(id) {
    marquerSupprime("tasses", id);
    state.tasses = state.tasses.filter(x => x.id !== id);
    if (!state.tasses.length) state.tasses = tassesDefaut();
    await persister();
  }

  // ---------- Initialisation ----------

  async function init() {
    await ouvrirDB();
    const cafes = await kvGet("cafes");
    const extractions = await kvGet("extractions");
    const recettes = await kvGet("recettes");
    const tasses = await kvGet("tasses");
    const achats = await kvGet("achats");
    const reglages = await kvGet("reglages");
    const demoActive = await kvGet("demoActive");
    if (Array.isArray(cafes)) state.cafes = cafes.map(normaliserCafe);
    if (Array.isArray(extractions)) state.extractions = extractions.map(normaliserExtraction);
    if (Array.isArray(recettes) && recettes.length) state.recettes = recettes;
    else state.recettes = recettesDefaut();
    if (Array.isArray(tasses) && tasses.length) state.tasses = tasses;
    else state.tasses = tassesDefaut();
    if (Array.isArray(achats)) state.achats = achats.map(normaliserAchat);
    if (Array.isArray(reglages)) state.reglages = reglages.map(normaliserReglages).slice(0, 1);
    state.demoActive = !!demoActive;
    const handle = await kvGet("dirHandle");
    if (handle) {
      state.dirHandle = handle;
      // La permission sera demandée au premier geste utilisateur, on tente une
      // relecture silencieuse si elle est déjà accordée.
      try {
        if (await handle.queryPermission({ mode: "readwrite" }) === "granted") {
          const tc = await lireFichier(state.dirHandle, "cafes.csv");
          const te = await lireFichier(state.dirHandle, "extractions.csv");
          const tr = await lireFichier(state.dirHandle, "recettes.csv");
          const tt = await lireFichier(state.dirHandle, "tasses.csv");
          const ta = await lireFichier(state.dirHandle, "achats.csv");
          const tg = await lireFichier(state.dirHandle, "reglages.csv");
          if (tc !== null) state.cafes = reporterHorodatage(csvParse(tc).map(normaliserCafe), state.cafes, CAFE_COLS);
          if (te !== null) state.extractions = reporterHorodatage(csvParse(te).map(normaliserExtraction), state.extractions, EXT_COLS);
          if (tr !== null) state.recettes = reporterHorodatage(csvParse(tr).map(normaliserRecette), state.recettes, RECETTE_COLS);
          if (tt !== null) state.tasses = reporterHorodatage(csvParse(tt).map(normaliserTasse), state.tasses, TASSE_COLS);
          if (ta !== null) state.achats = reporterHorodatage(csvParse(ta).map(normaliserAchat), state.achats, ACHAT_COLS);
          if (tg !== null) state.reglages = reporterHorodatage(csvParse(tg).map(normaliserReglages), state.reglages, REGLAGE_COLS).slice(0, 1);
        }
      } catch (e) { console.warn("Relecture du dossier lié impossible", e); }
    }
    const tombes = await kvGet("tombes");
    if (tombes && typeof tombes === "object") state.tombes = tombes;

    migrerDonnees();
    await sauverLocal();

    // Synchro AVANT de conclure qu'il n'y a pas de données : sur un appareil
    // neuf (le téléphone), tout est encore vide en local et c'est le serveur qui
    // détient les données. Sans cet ordre, la modale d'accueil s'ouvrirait et
    // proposerait la démo alors que les vraies données arrivent juste après.
    if (syncPossible()) await synchroniser(false);

    return state.cafes.length > 0 || state.extractions.length > 0;
  }

  return {
    state, abonner, notifier, init,
    synchroniser, syncPossible, reporterHorodatage,
    /* csvRecettes est exposee pour que l aller-retour CSV soit testable sur le
       VRAI chemin d export : c est lui qui perdait puissance_feu. */
    csvParse, csvSerialiser, csvRecettes, CAFE_COLS, EXT_COLS, RECETTE_COLS, ACHAT_COLS,
    sachetCourant, stockSachet, ajouterAchat, supprimerAchat,
    calculs, cafeDe,
    lierDossier, delierDossier, sauverFichiers,
    importerTexteCSV, exporterCafes, exporterExtractions, exporterRecettes,
    chargerDemo, viderDonnees,
    ajouterExtraction, modifierExtraction, supprimerExtraction, restaurerExtraction,
    ajouterCafe, modifierCafe,
    ajouterRecette, modifierRecette, reinitialiserRecette, supprimerRecette, estRecetteDorigine,
    // Exposée pour les tests : c'est elle qui décide qu'une température vide
    // reste vide au lieu de tomber à 0, et qu'une puissance de feu survit.
    sachetALaDate,
    normaliserRecette, normaliserReglages,
    reglagesCourants, majReglages, REGLAGE_COLS, REGLAGE_ID,
    // Exposée pour les tests : c'est elle qui rattrape les recettes STOCKÉES
    // quand les valeurs semées changent, et ce rattrapage est marqué une fois.
    migrerDonnees,
    ajouterTasse, supprimerTasse,
    kvGet, kvSet,
  };
})();
