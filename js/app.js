/* Application : liaison des données, câblage des écouteurs, démarrage.
 *
 * Ce fichier se charge en DERNIER et ne définit presque rien : il branche des
 * fonctions définies ailleurs sur des éléments du document, puis lance le
 * démarrage. S'il se met à contenir de la logique d'écran, c'est qu'elle est au
 * mauvais endroit. */
"use strict";

(() => {

  // Emprunté au noyau, chargé avant nous.
  const { $, $$, ECRANS, activerAppuiLong, activerEcran, appliquerTheme, basculerEtat,
    chargerReplis, ecrireReplis, nav, normaliserEcran, oublierSignatures, recettesVivantes,
    rendreEcranCourant, replis, reprendreReplisLocaux, siChange,
    supprimerExtractionAvecRetour, toast, trouverRecette } = UI;

  // ---------- Données : liaison, import, export ----------

  function majBadges() {
    $("#badge-demo").hidden = !DATA.state.demoActive;
    const lie = !!DATA.state.dirHandle;
    $("#badge-fichier").hidden = !lie;
    if (lie) $("#badge-fichier-nom").textContent = DATA.state.dirHandle.name;
  }

  function majStatutDonnees() {
    let s;
    if (DATA.state.dirHandle) s = I18N.t("statut_lie", { n: DATA.state.dirHandle.name });
    else if (DATA.state.demoActive) s = I18N.t("statut_demo");
    else s = I18N.t("statut_nav");
    $("#donnees-statut").textContent = s +
      I18N.t("statut_compte", { c: DATA.state.cafes.length, e: DATA.state.extractions.length });
    majStatutSync();
  }

  // Une ligne d'état pour la synchro entre appareils. Le bouton manuel n'apparaît
  // que là où la synchro a un sens, donc pas en file:// ni en démo.
  const LIBELLES_SYNC = {
    local: "sync_local",
    demo: "sync_demo",
    encours: "sync_encours",
    "hors-ligne": "sync_horsligne",
    "session-expiree": "sync_session",
    "non-configuree": "sync_nonconf",
    erreur: "sync_erreur",
  };

  function majStatutSync() {
    const etat = DATA.state.syncEtat;
    let texte;
    if (etat === "ok") {
      texte = I18N.t("sync_ok", {
        h: new Date(DATA.state.syncLe).toLocaleTimeString(I18N.locale(), { hour: "2-digit", minute: "2-digit" }),
      });
    } else {
      texte = I18N.t(LIBELLES_SYNC[etat] || "sync_jamais");
    }
    $("#sync-statut").textContent = texte;
    $("#don-sync").hidden = !DATA.syncPossible();
  }

  async function actionLier(creer) {
    if (!DATA.state.fsDisponible) {
      toast(I18N.t("t_fs"));
      $("#don-note-fs").hidden = false;
      return;
    }
    try {
      const nom = await DATA.lierDossier(creer);
      toast(I18N.t("t_dossier", { n: nom }));
      $("#modale-donnees").close();
      $("#modale-accueil").close();
    } catch (e) {
      if (e && e.name === "AbortError") return;
      toast(e.message || I18N.t("t_liaison"));
    }
  }

  // ---------- Câblage ----------

  function cabler() {
    // Navigation
    $$(".nav-btn").forEach(b => b.addEventListener("click", () => activerEcran(b.dataset.ecran)));

    // L'entete ramene au tableau de bord. On garde le href pour le clavier et
    // l'ouverture dans un onglet, mais un clic simple bascule d'ecran.
    const lienMarque = $(".marque-lien");
    if (lienMarque) {
      lienMarque.addEventListener("click", ev => {
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
        ev.preventDefault();
        activerEcran("tableau");
      });
    }
    $$("[data-va]").forEach(b => b.addEventListener("click", () => activerEcran(b.dataset.va)));
    window.addEventListener("hashchange", () => {
      const h = location.hash.slice(1);
      const cible = normaliserEcran(h);
      if (ECRANS.includes(cible) && cible !== nav.ecran) activerEcran(cible);
    });

    // Thème
    $("#btn-theme").addEventListener("click", () => {
      const courant = document.documentElement.getAttribute("data-theme");
      appliquerTheme(courant === "sombre" ? "clair" : "sombre");
    });

    // Langue
    $("#btn-lang").addEventListener("click", () => I18N.basculer());
    I18N.abonner(rafraichirLangue);

    // Saisie
    $$(".btn-methode").forEach(b => b.addEventListener("click", () => {
      UI.choisirMethode(b.dataset.methode);
      UI.prefillDepuisRecette($("#f-recette").value);
    }));
    $("#f-cafe").addEventListener("change", UI.surChoixCafe);
    $("#f-date").addEventListener("change", UI.majAgePaquet);
    $("#f-recette").addEventListener("change", () => { UI.prefillDepuisRecette($("#f-recette").value); UI.majAvertissements(); });
    ["f-dose", "f-eau", "f-mouture", "f-volume"].forEach(id =>
      $("#" + id).addEventListener("input", () => { UI.majLive(); UI.majAvertissements(); }));
    // majAvertissements redessine le panneau latéral, le chrono a besoin d'un
    // rappel explicite : ses paliers sont mis à l'échelle de l'eau saisie.
    $("#f-eau").addEventListener("input", () => UI.majEtapesChrono(false));
    // Le volume extrait pilote le préremplissage du lait, il doit le rafraîchir.
    $("#f-volume").addEventListener("input", UI.majLait);
    $("#f-temp-preset").addEventListener("change", () => {
      const v = $("#f-temp-preset").value;
      if (!v) return;
      $("#f-temp").value = v;
      UI.razPresetTemp();
      UI.majAvertissements();
    });
    // Une saisie manuelle a toujours le dernier mot sur l'estimation.
    $("#f-temp").addEventListener("input", UI.razPresetTemp);
    /* pointerdown en plus d'input : poser le doigt sur le curseur là où il est
       déjà ne déclenche aucun input, la note serait restée vide sans le savoir. */
    ["input", "pointerdown", "keydown"].forEach(ev =>
      $("#f-note").addEventListener(ev, () => {
        $("#f-note-vide").checked = false;
        UI.majAffichageNote();
      }));
    $("#f-note-vide").addEventListener("change", UI.majAffichageNote);
    $("#btn-chrono").addEventListener("click", UI.chronoPrincipal);
    $("#btn-chrono-stop").addEventListener("click", UI.chronoArreter);
    $("#btn-chrono-raz").addEventListener("click", UI.chronoRaz);
    $("#param-enregistrer").addEventListener("click", UI.enregistrerParametres);
    // UNE SEULE FOIS : les conteneurs survivent aux reconstructions de pilules,
    // les attacher depuis construirePilules empilerait un jeu par bascule de langue.
    UI.brancherPilules();
    activerAppuiLong($("#f-diagnostic"));
    activerAppuiLong($("#f-descripteurs"));
    $("#param-molette").addEventListener("input", UI.majDetailMolette);
    $("#conv-slider").addEventListener("input", () => {
      $("#conv-dial").value = GRIND.dialDepuisCrans(Number($("#conv-slider").value));
      /* IMMÉDIAT, et c'est un changement assumé. L'anti-rebond posé en v7.57
         couvrait un redessin complet du SVG à chaque cran ; depuis que le
         squelette de la réglette est construit une seule fois, il ne reste que
         deux attributs à déplacer. Garder les 90 ms d'attente reviendrait à
         payer le défaut sans le bénéfice, sur le seul contrôle du site qu'on
         manipule en continu. Le champ texte, lui, garde son anti-rebond. */
      UI.rendreConvertisseur();
    });
    /* Le seul chemin qui change vraiment un réglage depuis cet écran. Il écrit
       le même repli que l'écran Paramètres, il n'y a donc qu'une source. */
    $("#conv-appliquer").addEventListener("click", async () => {
      const dial = $("#conv-dial").value.trim().replace(/,/g, ".");
      if (!GRIND.parseDial(dial)) { toast(I18N.t("t_mouture_invalide")); return; }
      replis.molette = dial;
      await ecrireReplis();
      UI.rendreConvertisseur();
      if ($("#param-molette")) $("#param-molette").value = dial;
      toast(I18N.t("t_molette_appliquee", { m: dial }));
    });
    $("#param-annuler").addEventListener("click", UI.rendreParametres);
    // La case de l'écran Paramètres et celle du chrono pilotent le même réglage.
    $("#param-bips").addEventListener("change", () => {
      $("#chrono-bip").checked = $("#param-bips").checked;
      $("#chrono-bip").dispatchEvent(new Event("change"));
    });
    $("#chrono-bip").addEventListener("change", () => {
      try { localStorage.setItem("bips", $("#chrono-bip").checked ? "1" : "0"); } catch (e) { /* tant pis */ }
    });
    $("#form-saisie").addEventListener("submit", UI.enregistrerSaisie);
    $("#form-saisie").addEventListener("input", UI.planifierBrouillon);
    $("#form-saisie").addEventListener("change", UI.planifierBrouillon);
    // visibilitychange est le dernier evenement fiable avant qu'un navigateur
    // mobile decharge la page : on ecrit tout de suite, sans attendre le debounce.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") UI.ecrireBrouillon();
    });
    $("#btn-annuler-edition").addEventListener("click", () => { UI.reinitialiserSaisie(); activerEcran("historique"); });
    $("#btn-gerer-cafes").addEventListener("click", UI.ouvrirModaleCafes);
    $("#btn-cafes-entete").addEventListener("click", UI.ouvrirModaleCafes);
    $("#btn-recettes-entete").addEventListener("click", UI.ouvrirModaleRecettes);
    $("#volume-estime").addEventListener("click", () => {
      const v = $("#volume-estime").dataset.valeur;
      if (v !== undefined) { $("#f-volume").value = v; UI.majLive(); }
    });

    // Ajout d'eau, agitation, lait, tasse
    $("#f-ajout-eau-oui").addEventListener("change", () => {
      $("#f-eau-ajoutee").hidden = !$("#f-ajout-eau-oui").checked;
      UI.majLive();
    });
    $("#f-eau-ajoutee").addEventListener("input", UI.majLive);
    $("#f-agitation-oui").addEventListener("change", () => {
      $("#f-agitation").hidden = !$("#f-agitation-oui").checked;
      if ($("#f-agitation-oui").checked && !$("#f-agitation").value) $("#f-agitation").value = 1;
    });
    $("#f-lait").addEventListener("input", UI.majLive);
    $("#f-tasse").addEventListener("change", () => { UI.majLait(); UI.majLive(); });
    $("#btn-tasses").addEventListener("click", () => {
      const ed = $("#tasses-editeur");
      ed.hidden = !ed.hidden;
      if (!ed.hidden) UI.rendreTassesEditeur();
    });
    $("#tasse-ajouter").addEventListener("click", async () => {
      const nom = $("#tasse-nom").value.trim();
      const ml = parseFloat($("#tasse-ml").value);
      if (!nom || !(ml > 0)) { toast(I18N.t("t_tasse_invalide")); return; }
      await DATA.ajouterTasse(nom, ml);
      $("#tasse-nom").value = "";
      $("#tasse-ml").value = "";
      UI.rendreTassesEditeur();
      UI.remplirSelectTasses();
      $("#f-tasse").value = nom;
      UI.majLait();
      UI.majLive();
    });

    // Historique
    ["h-recherche", "h-cafe", "h-methode", "h-diagnostic", "h-note-min", "h-du", "h-au"].forEach(id =>
      $("#" + id).addEventListener("input", UI.rendreHistoriqueDifferee));
    /* REPRISE QUAND LE RÉSEAU REVIENT. Une synchro ratée attendait le prochain
       geste de Chris : en cuisine, il enregistre sa tasse, range son téléphone, et
       la synchro ne repartait qu'à l'ouverture suivante. Le navigateur sait dire
       quand la connexion revient, autant l'écouter.

       DATA.synchroniser gère déjà le cas où une synchro est en cours, il n'y a pas
       de course à craindre. */
    window.addEventListener("online", () => {
      if (DATA.syncPossible()) DATA.synchroniser(false);
    });

    /* ÉCHAP ferme ce qui est ouvert. Les <dialog> natifs le font tout seuls, mais
       le panneau de saisie rapide et les formulaires dépliés ne sont pas des
       dialogues : ils restaient ouverts et il fallait viser leur bouton. */
    document.addEventListener("keydown", ev => {
      if (ev.key !== "Escape") return;
      if (UI.rapideEstOuvert()) { UI.basculerRapide(false); return; }
      const ouverts = ["#form-cafe", "#form-sachet", "#form-recette"]
        .map(s => $(s)).filter(x => x && !x.hidden);
      if (ouverts.length) { ouverts.forEach(x => { x.hidden = true; }); return; }
      // Une bulle d'aide ouverte au doigt se ferme aussi, avant tout le reste.
      $$(".info-ouverte").forEach(x => x.classList.remove("info-ouverte"));
    });

    $("#h-reinitialiser").addEventListener("click", () => {
      ["h-recherche", "h-cafe", "h-methode", "h-diagnostic", "h-note-min", "h-du", "h-au"].forEach(id => $("#" + id).value = "");
      UI.rendreHistorique();
    });
    $("#h-exporter").addEventListener("click", () => {
      DATA.exporterExtractions(UI.filtrerHistorique().map(e => { const { _c, ...reste } = e; return reste; }));
      toast(I18N.t("t_export_filtre"));
    });
    $$("#h-table th[data-tri]").forEach(th => th.addEventListener("click", () => {
      if (UI.tri.colonne === th.dataset.tri) UI.tri.sens = -UI.tri.sens;
      else { UI.tri.colonne = th.dataset.tri; UI.tri.sens = -1; }
      UI.rendreHistorique();
    }));
    $("#h-corps").addEventListener("click", async ev => {
      const btn = ev.target.closest("[data-action]");
      if (!btn) return;
      const id = btn.closest("tr").dataset.id;
      const ext = DATA.state.extractions.find(e => e.id === id);
      if (!ext) return;
      if (btn.dataset.action === "supprimer") {
        // Plus de confirm() natif : le retour arrière remplace la question. Une
        // boîte système sur téléphone casse l'impression d'application, et elle
        // ne passe pas par la couche i18n.
        await supprimerExtractionAvecRetour(ext);
      } else if (btn.dataset.action === "modifier") {
        UI.chargerExtractionDansSaisie(ext, false);
      } else if (btn.dataset.action === "dupliquer") {
        UI.chargerExtractionDansSaisie(ext, true);
        toast(I18N.t("t_dupliquee"));
      } else if (btn.dataset.action === "deplier") {
        if (UI.detailsOuverts.has(id)) UI.detailsOuverts.delete(id);
        else UI.detailsOuverts.add(id);
        UI.rendreHistorique();
      } else if (btn.dataset.action === "comparer") {
        UI.basculerComparaison(id);
      }
    });

    // Délégué sur la liste : son contenu est réécrit à chaque rendu, un handler
    // par ligne fuirait à chaque rafraîchissement du tableau de bord.
    const ouvrirDerniere = cible => {
      const li = cible.closest("[data-ext]");
      if (!li) return;
      const ext = DATA.state.extractions.find(x => x.id === li.dataset.ext);
      if (!ext) return;
      UI.chargerExtractionDansSaisie(ext, false);
    };
    $("#dernieres-liste").addEventListener("click", ev => ouvrirDerniere(ev.target));
    $("#dernieres-liste").addEventListener("keydown", ev => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault();
      ouvrirDerniere(ev.target);
    });

    $("#comparaison-ouvrir").addEventListener("click", UI.ouvrirComparaison);
    $("#comparaison-vider").addEventListener("click", () => { UI.comparaison.clear(); UI.rendreHistorique(); });

    // Référence
    $("#conv-dial").addEventListener("input", UI.rendreConvertisseurDifferee);
    $("#pap-demarrer").addEventListener("click", UI.papDemarrer);
    $("#pap-suivant").addEventListener("click", UI.papSuivant);
    $("#btn-gerer-recettes").addEventListener("click", UI.ouvrirModaleRecettes);

    // Recettes : formulaire
    $("#recette-nouvelle").addEventListener("click", () => UI.ouvrirFormRecette(null));
    $("#recette-annuler").addEventListener("click", () => $("#form-recette").hidden = true);
    $("#form-recette").addEventListener("submit", UI.enregistrerRecette);
    $("#recette-retablir").addEventListener("click", UI.retablirRecetteCourante);
    $("#recette-supprimer").addEventListener("click", UI.supprimerRecetteCourante);

    // Saisie rapide flottante
    $("#fab-rapide").addEventListener("click", () => UI.basculerRapide());
    $("#q-fermer").addEventListener("click", () => UI.basculerRapide(false));
    $("#q-cafe").addEventListener("change", UI.surChoixCafeRapide);
    $("#q-recette").addEventListener("change", UI.majAvertRapide);
    $("#q-note").addEventListener("input", () => $("#q-note-affichee").textContent = $("#q-note").value);
    $("#q-enregistrer").addEventListener("click", UI.enregistrerRapide);
    $("#q-complet").addEventListener("click", () => { UI.basculerRapide(false); activerEcran("saisie"); });

    // Guide : boutons de copie des messages
    $$("[data-copier]").forEach(b => b.addEventListener("click", async () => {
      const bloc = document.getElementById(b.dataset.copier);
      const texte = bloc ? bloc.textContent.trim() : "";
      try {
        await navigator.clipboard.writeText(texte);
        toast(I18N.t("t_copie"));
      } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = texte;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        toast(I18N.t("t_copie"));
      }
    }));

    // Modales génériques
    $$(".modale-fermer[data-ferme]").forEach(b => b.addEventListener("click", () => $("#" + b.dataset.ferme).close()));
    $("#modale-pas-a-pas").addEventListener("close", () => clearInterval(UI.pap.interval));

    // Accueil
    $("#acc-creer").addEventListener("click", () => actionLier(true));
    $("#acc-ouvrir").addEventListener("click", () => actionLier(false));
    $("#acc-demo").addEventListener("click", async () => {
      await DATA.chargerDemo();
      $("#modale-accueil").close();
      toast(I18N.t("t_demo"));
    });
    $("#acc-plus-tard").addEventListener("click", () => $("#modale-accueil").close());

    // Données
    $("#btn-donnees").addEventListener("click", () => {
      majStatutDonnees();
      const fsOk = DATA.state.fsDisponible;
      $("#don-note-fs").hidden = fsOk;
      $("#don-lier").disabled = !fsOk;
      $("#don-ouvrir").disabled = !fsOk;
      $("#modale-donnees").showModal();
    });
    $("#don-lier").addEventListener("click", () => actionLier(true));
    $("#don-ouvrir").addEventListener("click", () => actionLier(false));
    $("#don-importer").addEventListener("click", () => $("#don-fichier").click());
    $("#don-fichier").addEventListener("change", async ev => {
      const f = ev.target.files[0];
      if (!f) return;
      try {
        const res = await DATA.importerTexteCSV(await f.text());
        const nomTable = res.table === "cafes" ? I18N.t("tbl_cafes") : res.table === "recettes" ? I18N.t("tbl_recettes") : I18N.t("tbl_extractions");
        toast(I18N.t("t_import", { n: res.n, t: nomTable }));
        majStatutDonnees();
      } catch (e) { toast(e.message); }
      ev.target.value = "";
    });
    $("#don-exporter").addEventListener("click", () => {
      DATA.exporterCafes();
      DATA.exporterExtractions();
      DATA.exporterRecettes();
      toast(I18N.t("t_export_tout"));
    });
    $("#don-demo").addEventListener("click", async () => {
      if (DATA.state.extractions.length && !confirm(I18N.t("c_demo"))) return;
      await DATA.chargerDemo();
      majStatutDonnees();
      toast(I18N.t("t_demo"));
    });
    $("#don-vider").addEventListener("click", async () => {
      if (!confirm(I18N.t("c_vider"))) return;
      await DATA.viderDonnees();
      majStatutDonnees();
      toast(I18N.t("t_reinit"));
    });

    // Café : formulaire
    $("#cafe-nouveau").addEventListener("click", () => UI.ouvrirFormCafe(null));
    $("#cafe-annuler").addEventListener("click", () => $("#form-cafe").hidden = true);
    $("#form-cafe").addEventListener("submit", UI.enregistrerCafe);

    // Les changements de données rafraîchissent l'interface.
    $("#form-sachet").addEventListener("submit", UI.enregistrerSachet);
    $("#sachet-annuler").addEventListener("click", UI.fermerFormSachet);

    $("#don-sync").addEventListener("click", async () => {
      const etat = await DATA.synchroniser(true);
      toast(I18N.t(etat === "ok" ? "t_sync_ok" : "t_sync_ko"));
    });

    DATA.abonner(() => {
      // Les réglages peuvent arriver d'un autre appareil : on relit avant de rendre.
      chargerReplis();
      // Toujours : ces deux là sont minuscules et reflètent l'état courant.
      majBadges();
      majStatutSync();
      /* Le reste ne se refait que si sa table a bougé. Enregistrer une tasse ne
         change ni les cafés, ni les recettes, ni les tasses : les reconstruire
         était du travail pur perte, et le coût grossit avec le catalogue. */
      const cafes = DATA.state.cafes, recettes = DATA.state.recettes;
      siChange("cafes", cafes, () => { UI.remplirSelectCafes(); remplirSelectRecetteReco(); });
      siChange("filtres", DATA.state.extractions, UI.remplirFiltres);
      siChange("recettes", recettes, () => {
        UI.remplirSelectRecettes();
        UI.rendreRecettes();
      });
      siChange("tasses", DATA.state.tasses, UI.remplirSelectTasses);
      if (UI.rapideEstOuvert()) UI.majPanneauRapide();
      rendreEcranCourant();
    });
  }

  function remplirSelectRecetteReco() {
    const sel = $("#c-recette");
    const v = sel.value;
    sel.innerHTML = '<option value="">' + I18N.t("aucune") + "</option>" +
      recettesVivantes().map(r => "<option>" + r.nom + "</option>").join("");
    if (v && trouverRecette(v)) sel.value = v;
  }

  // Bascule de langue : re-rend tout ce qui est généré en JavaScript.
  function rafraichirLangue() {
    // Les données n'ont pas bougé, tout le TEXTE si : on invalide les mémoires.
    oublierSignatures();
    $("#btn-lang").textContent = I18N.lang() === "fr" ? "EN" : "FR";
    $("#btn-lang").title = I18N.lang() === "fr" ? "Switch to English" : "Passer en français";
    UI.construirePilules();
    $$("#f-diagnostic .pilule").forEach(x => basculerEtat(x, UI.saisie.diagnostics.has(x.dataset.diag)));
    $$("#f-descripteurs .tag").forEach(x => basculerEtat(x, UI.saisie.descripteurs.has(x.dataset.tag)));
    UI.majCorrectionDiagnostic();
    UI.majBoutonsChrono();
    UI.majEtapesChrono(false);
    $("#saisie-titre").textContent = UI.saisie.editId ? I18N.t("s_modifier") : I18N.t("s_nouvelle");
    $("#btn-enregistrer").textContent = UI.saisie.editId ? I18N.t("s_enregistrer_modif") : I18N.t("s_enregistrer");
    UI.remplirSelectCafes();
    UI.remplirFiltres();
    UI.remplirSelectRecettes();
    remplirSelectRecetteReco();
    UI.remplirSelectTasses();
    UI.rendreRecettes();
    UI.rendreTablePlages();
    UI.rendreConvertisseur();
    majBadges();
    UI.majLait();
    UI.majLive();
    UI.majAvertissements();
    // Le libelle "pas encore notee" est genere : il ne suit pas le TreeWalker.
    UI.majAffichageNote();
    if (UI.rapideEstOuvert()) UI.majPanneauRapide();
    rendreEcranCourant(true);
  }

  // ---------- Démarrage ----------

  // Version affichée dans le pied de page. À INCRÉMENTER en même temps que le
  // changelog de DOCUMENTATION.md. Sert à savoir d'un coup d'oeil quelle version
  // tourne sur un appareil donné, ce qui devient indispensable depuis qu'un
  // service worker met des fichiers en cache : sans elle, "mon téléphone affiche
  // l'ancienne version" n'est pas diagnosticable.
  const VERSION = "7.66";

  async function demarrer() {
    /* AVANT tout rendu : si Chris avait laissé le site en anglais, le paquet de
       traduction doit être là, sinon la page s'afficherait en français puis
       clignoterait. Ne fait rien du tout en français, le cas normal. */
    await I18N.preparer(I18N.langueSouhaitee());
    I18N.appliquerStatique();
    $("#version-site").textContent = "v" + VERSION;
    $("#btn-lang").textContent = I18N.lang() === "fr" ? "EN" : "FR";
    $("#btn-lang").title = I18N.lang() === "fr" ? "Switch to English" : "Passer en français";
    CHARTS.appliquerDefauts();
    UI.construirePilules();
    cabler();
    UI.rendreTablePlages();

    const aDesDonnees = await DATA.init();
    majBadges();
    UI.remplirSelectCafes();
    UI.remplirFiltres();
    UI.remplirSelectRecettes();
    remplirSelectRecetteReco();
    UI.remplirSelectTasses();
    UI.rendreRecettes();
    try { $("#chrono-bip").checked = localStorage.getItem("bips") !== "0"; } catch (e) { /* tant pis */ }
    // AVANT tout ce qui lit replis : le convertisseur et la saisie en dependent.
    await reprendreReplisLocaux();
    chargerReplis();
    UI.rendreReperesMouture();
    UI.rendreConvertisseur();
    UI.choisirMethode("Brikka");
    UI.reinitialiserSaisie();
    if (UI.restaurerBrouillon()) toast(I18N.t("t_brouillon"));

    const h = location.hash.slice(1);
    activerEcran(ECRANS.includes(normaliserEcran(h)) ? normaliserEcran(h) : "tableau");

    // Le premier écran est rendu : le voile de chargement n'a plus de raison d'être.
    const voile = $("#chargement");
    if (voile) voile.remove();

    // Le système relâche le verrou d'écran quand l'onglet part en arrière plan.
    // Au retour, si le chrono tourne toujours, on le reprend.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") UI.syncWakeLock();
    });

    // Service worker : uniquement en http(s). En file:// l'enregistrement lève
    // une exception, et c'est très bien : le double clic n'a pas besoin de lui.
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("sw.js").catch(() => { /* pas critique */ });
    }

    if (!aDesDonnees) {
      if (!DATA.state.fsDisponible) {
        $("#acc-note-fs").hidden = false;
        $("#acc-creer").disabled = true;
        $("#acc-ouvrir").disabled = true;
      }
      $("#modale-accueil").showModal();
    }
  }

  document.addEventListener("DOMContentLoaded", demarrer);

  // Mis à disposition des autres écrans.
  Object.assign(UI, {
    LIBELLES_SYNC, VERSION, actionLier, cabler, demarrer, majBadges, majStatutDonnees,
    majStatutSync, rafraichirLangue, remplirSelectRecetteReco,
  });
})();
