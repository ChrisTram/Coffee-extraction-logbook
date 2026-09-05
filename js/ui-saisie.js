/* Écran de saisie : le formulaire, le chronomètre, le brouillon, et le panneau
 * rapide qui flotte par-dessus.
 *
 * C'est le fichier le plus long, et pour une bonne raison : c'est là que Chris
 * passe son temps, souvent d'une main, au téléphone, pendant une extraction. Le
 * brouillon existe parce que quitter l'onglet suffit à ce qu'un téléphone
 * décharge la page pour récupérer de la mémoire. */
"use strict";

(() => {

  // Emprunté au noyau, chargé avant nous.
  const { $, $$, $f, activerEcran, attrTitre, basculerEtat, detailRatio, fmtTemps, fmtVND,
    maintenantLocal, nav, poser, poserTexte, recettesDeMethode, replis, toast,
    trouverRecette } = UI;

  // ---------- Saisie ----------

  /* ---------- Brouillon de saisie ----------
     Sur téléphone, quitter l'onglet pendant une extraction suffit à ce que le
     navigateur décharge la page pour récupérer de la mémoire. Sans brouillon,
     tout ce qui était tapé disparaît, et c'est justement pendant l'extraction
     qu'on sort de l'appli.

     Volontairement en localStorage et PAS dans les données synchronisées : un
     brouillon est propre à un appareil, l'envoyer sur le serveur ferait
     apparaître une saisie fantôme sur l'autre. */
  const CLE_BROUILLON = "brouillon-saisie";
  const BROUILLON_MAX_MS = 24 * 60 * 60 * 1000;
  /* La DATE du brouillon a sa propre durée de validité, bien plus courte. Le
     brouillon existe pour survivre au déchargement de la page pendant une
     extraction, ce qui se compte en minutes ; garder son horodatage 24 h faisait
     réapparaître la date de la veille sur une saisie neuve. Deux heures couvrent
     largement une séance, interruptions comprises. */
  const DATE_BROUILLON_MAX_MS = 2 * 60 * 60 * 1000;
  const CHAMPS_BROUILLON = [
    "f-date", "f-cafe", "f-recette", "f-dose", "f-eau", "f-mouture", "f-temp",
    "f-volume", "f-eau-ajoutee", "f-lait", "f-agitation", "f-tasse", "f-note",
    "f-commentaire", "f-total-min", "f-total-sec", "f-ecoulement-min", "f-ecoulement-sec",
    "f-puissance",
  ];
  const CASES_BROUILLON = ["f-prechauffe", "f-ajout-eau-oui"];
  let brouillonMinuteur = null;

  function ecrireBrouillon() {
    // On ne sauvegarde JAMAIS pendant l'édition d'une extraction existante :
    // le brouillon écraserait le formulaire au prochain démarrage avec des
    // valeurs qui appartiennent à une ligne déjà enregistrée.
    if (saisie.editId) return;
    const valeurs = {};
    CHAMPS_BROUILLON.forEach(id => { const el = $("#" + id); if (el) valeurs[id] = el.value; });
    CASES_BROUILLON.forEach(id => { const el = $("#" + id); if (el) valeurs[id] = el.checked; });
    try {
      localStorage.setItem(CLE_BROUILLON, JSON.stringify({
        le: Date.now(),
        methode: saisie.methode,
        diagnostics: [...saisie.diagnostics],
        descripteurs: [...saisie.descripteurs],
        valeurs,
      }));
    } catch (e) { /* stockage plein ou refusé, tant pis */ }
  }

  function planifierBrouillon() {
    clearTimeout(brouillonMinuteur);
    brouillonMinuteur = setTimeout(ecrireBrouillon, 400);
  }

  function effacerBrouillon() {
    clearTimeout(brouillonMinuteur);
    try { localStorage.removeItem(CLE_BROUILLON); } catch (e) { /* tant pis */ }
  }

  /* Ne restaure que si le brouillon dit quelque chose : sans ce test, le
     formulaire vierge sauvegardé au premier chargement déclencherait un message
     "brouillon repris" à chaque ouverture, ce qui serait absurde. */
  function brouillonUtile(b) {
    const v = b.valeurs || {};
    return Boolean(v["f-cafe"] || (v["f-commentaire"] || "").trim() ||
      b.diagnostics.length || b.descripteurs.length ||
      v["f-total-min"] || v["f-total-sec"] || v["f-volume"] || v["f-eau"]);
  }

  function restaurerBrouillon() {
    let b;
    try { b = JSON.parse(localStorage.getItem(CLE_BROUILLON) || "null"); } catch (e) { return false; }
    if (!b || !b.valeurs) return false;
    if (Date.now() - (b.le || 0) > BROUILLON_MAX_MS) { effacerBrouillon(); return false; }
    if (!brouillonUtile(b)) return false;

    if (b.methode) choisirMethode(b.methode, true);
    const dateFraiche = Date.now() - (b.le || 0) <= DATE_BROUILLON_MAX_MS;
    Object.entries(b.valeurs).forEach(([id, valeur]) => {
      // Une date périmée ne remplace pas l'heure qu'il est.
      if (id === "f-date" && !dateFraiche) return;
      const el = $("#" + id);
      if (el && valeur !== undefined && valeur !== null) el.value = valeur;
    });
    /* Une date reprise d'un brouillon frais vient de Chris, pas d'un défaut :
       l'arrivée sur l'écran ne doit donc pas la remplacer. */
    if (dateFraiche && b.valeurs["f-date"]) saisie.dateTouchee = true;
    CASES_BROUILLON.forEach(id => { const el = $("#" + id); if (el) el.checked = !!b.valeurs[id]; });

    saisie.diagnostics = new Set(b.diagnostics || []);
    saisie.descripteurs = new Set(b.descripteurs || []);
    $$("#f-diagnostic .pilule").forEach(x => basculerEtat(x, saisie.diagnostics.has(x.dataset.diag)));
    $$("#f-descripteurs .tag").forEach(x => basculerEtat(x, saisie.descripteurs.has(x.dataset.tag)));

    $("#note-affichee").textContent = $("#f-note").value;
    $("#f-eau-ajoutee").hidden = !$("#f-ajout-eau-oui").checked;
    majCorrectionDiagnostic();
    majAvertissements();
    majLive();
    majAsideSaisie();
    return true;
  }

  /* Durées saisies en minutes ET secondes, stockées en secondes.
     Taper "4 min 18" est plus rapide et moins risqué que convertir 258 de tête,
     surtout sur téléphone. Le stockage ne change pas : les CSV gardent des
     secondes, donc l'historique reste lisible et rien à migrer. */
  function lireDuree(prefixe) {
    const min = parseInt($("#" + prefixe + "-min").value, 10);
    const sec = parseInt($("#" + prefixe + "-sec").value, 10);
    const m = Number.isFinite(min) ? min : 0;
    const s = Number.isFinite(sec) ? sec : 0;
    // Les deux champs vides veulent dire "pas de temps", pas "zéro seconde".
    if (!Number.isFinite(min) && !Number.isFinite(sec)) return "";
    return m * 60 + s;
  }

  function ecrireDuree(prefixe, secondes) {
    const total = Number(secondes);
    if (secondes === "" || secondes === null || secondes === undefined || !Number.isFinite(total)) {
      $("#" + prefixe + "-min").value = "";
      $("#" + prefixe + "-sec").value = "";
      return;
    }
    $("#" + prefixe + "-min").value = Math.floor(total / 60);
    $("#" + prefixe + "-sec").value = total % 60;
  }

  const saisie = {
    methode: "Brikka",
    descripteurs: new Set(),
    diagnostics: new Set(),
    editId: null,
    /* Vrai dès que la date vient de Chris plutôt que d'un défaut. Sans lui,
       rafraîchir la date à l'arrivée sur l'écran écraserait la tasse d'hier soir
       qu'il est justement en train de noter. */
    dateTouchee: false,
  };

  function cafesSelectionnables() {
    return DATA.state.cafes.filter(c => c.actif !== 0);
  }

  function cafeCourantMoulu() {
    const c = DATA.state.cafes.find(x => x.id === $("#f-cafe").value);
    return !!(c && Number(c.deja_moulu) === 1);
  }

  function remplirSelectCafes(garderId) {
    // Les cafés désactivés n'apparaissent PAS en saisie. Seule exception :
    // l'édition d'une ancienne extraction dont le café a été désactivé depuis
    // (l'option est réinjectée pour que la valeur reste affichable).
    const sel = $("#f-cafe");
    const valeur = garderId || sel.value;
    const inactifGarde = DATA.state.cafes.find(c => c.id === valeur && c.actif === 0);
    sel.innerHTML = '<option value="">' + I18N.t("choisir_cafe") + "</option>" +
      cafesSelectionnables().map(c => '<option value="' + c.id + '">' + c.nom + "</option>").join("") +
      (inactifGarde ? '<option value="' + inactifGarde.id + '">' + inactifGarde.nom + " " + I18N.t("inactif") + "</option>" : "");
    if (valeur) sel.value = valeur;
  }

  function remplirSelectRecettes() {
    const sel = $("#f-recette");
    const valeur = sel.value;
    const liste = recettesDeMethode(saisie.methode);
    sel.innerHTML = liste.map(r => "<option>" + r.nom + "</option>").join("");
    if (liste.some(r => r.nom === valeur)) sel.value = valeur;
    else {
      /* Repli sur la PREMIÈRE recette quand aucune n'est marquée par défaut, ce
         qui est le cas de toutes les Brikka. Le navigateur sélectionne déjà la
         première option tout seul, mais le code ne le savait pas : sel.value
         restait vide de son point de vue, donc prefillDepuisRecette repartait
         sans rien faire et l'eau à 150 g n'arrivait jamais. */
      const defaut = liste.find(r => r.parDefaut) || liste[0];
      if (defaut) sel.value = defaut.nom;
    }
  }

  function choisirMethode(m, garderRecette) {
    saisie.methode = m;
    $$(".btn-methode").forEach(b => basculerEtat(b, b.dataset.methode === m));
    // Champs propres à chaque méthode.
    $("#champ-ajout-eau").hidden = m !== "Brikka";
    $("#champ-puissance").hidden = m !== "Brikka";
    $("#champ-agitation").hidden = m !== "Switch";
    // Tasse par défaut : Flat White Egg en Brikka, Classic Mug en Switch.
    const defauts = { "Brikka": "Loveramics Flat White Egg", "Switch": "Classic Mug" };
    const tasseActuelle = $("#f-tasse").value;
    if ((tasseActuelle === "" || Object.values(defauts).includes(tasseActuelle)) &&
        DATA.state.tasses.some(t => t.nom === defauts[m])) {
      $("#f-tasse").value = defauts[m];
    }
    if (!garderRecette) remplirSelectRecettes();
    majChampPrechauffe();
    majAvertissements();
    majLive();
  }

  /* La case "eau préchauffée" n'a de sens que quand la recette ne tranche pas
     déjà la question. Sur la famille brikka-classique, c'est LA différence entre
     les deux variantes : afficher la case en plus laisserait enregistrer une
     contradiction, du genre recette préchauffée avec la case décochée.
     On masque donc la case et on déduit la valeur de la recette. */
  function majChampPrechauffe() {
    const r = trouverRecette($("#f-recette").value);
    const familleTranche = !!r && FAMILLES_PRECHAUFFAGE.includes(r.famille || "");
    $("#champ-prechauffe").hidden = saisie.methode !== "Brikka" || familleTranche;
    if (familleTranche) $("#f-prechauffe").checked = RECETTES_EAU_PRECHAUFFEE.includes(r.id);
  }

  // La recette demande-t-elle de remuer ? Coche l'agitation par défaut.
  function majAgitationDepuisRecette() {
    const r = trouverRecette($("#f-recette").value);
    if (!r || r.methode !== "Switch") return;
    const remue = UI.etapesPour(r).some(e => /remuer/i.test(e.texte));
    $("#f-agitation-oui").checked = remue;
    $("#ligne-agitation").hidden = !remue;
    if (remue && !$("#f-agitation").value) $("#f-agitation").value = 1;
  }

  // Champ lait : visible quand la recette le prévoit, prérempli depuis la tasse.
  function majLait() {
    const r = trouverRecette($("#f-recette").value);
    const visible = !!(r && r.lait);
    $("#champ-lait").hidden = !visible;
    if (!visible) return;
    const tasse = DATA.state.tasses.find(t => t.nom === $("#f-tasse").value);
    /* Le volume de café MESURÉ, jamais estimé sur une Brikka : c'est la même
       raison que dans volumeEstime, et un lait calculé sur un volume faux est un
       lait faux. Sans mesure on ne préremplit rien et on le dit. */
    const volCafe = parseFloat($("#f-volume").value) ||
      volumeEstime(parseFloat($("#f-dose").value), parseFloat($("#f-eau").value));
    if (!tasse) {
      $("#lait-hint").textContent = I18N.t("lait_choisir_tasse");
      return;
    }
    if (!(volCafe > 0)) {
      $("#lait-hint").textContent = I18N.t("lait_sans_volume");
      return;
    }
    const lait = Math.max(0, tasse.contenance_ml - volCafe);
    $("#f-lait").value = lait;
    $("#lait-hint").textContent = lait === 0
      ? I18N.t("lait_trop_petit")
      : I18N.t("lait_calc", { l: lait, t: tasse.contenance_ml, v: volCafe });
  }

  // Tasses : liste déroulante, avertissement de contenance, mini éditeur.
  function remplirSelectTasses() {
    const sel = $("#f-tasse");
    const v = sel.value;
    sel.innerHTML = '<option value=""></option>' + DATA.state.tasses.map(t =>
      '<option value="' + t.nom + '">' + t.nom + " · " + t.contenance_ml + " ml</option>").join("");
    if (v && DATA.state.tasses.some(t => t.nom === v)) sel.value = v;
  }

  /* L'avertissement de débordement de tasse a été RETIRÉ. Il comparait le volume
     attendu à la contenance et criait au débordement, en supposant qu'on sert
     tout d'un coup. Or on peut très bien verser en deux fois, ce qui rend
     l'avertissement faux dans un usage parfaitement normal. Un avertissement qui
     se trompe apprend surtout à ignorer les avertissements.
     La contenance des tasses reste utile : elle sert au calcul du lait. */


  function rendreTassesEditeur() {
    $("#tasses-liste").innerHTML = DATA.state.tasses.map(t =>
      '<div class="tasse-ligne"><span>' + t.nom + " · " + t.contenance_ml + ' ml</span>' +
      '<button type="button" class="btn-ligne danger" data-tasse-suppr="' + t.id + '" title="' + I18N.t("btn_supprimer") + '">✕</button></div>'
    ).join("");
    $$("[data-tasse-suppr]").forEach(b => b.addEventListener("click", async () => {
      await DATA.supprimerTasse(b.dataset.tasseSuppr);
      rendreTassesEditeur();
      remplirSelectTasses();
    }));
  }

  function prefillDepuisRecette(nomRecette) {
    const r = trouverRecette(nomRecette);
    if (!r) return;
    /* Le formulaire suit désormais la RECETTE, y compris pour l'eau et la
       température, au lieu de valeurs codées en dur qui l'écrasaient. C'est ce
       qui fait de "Gérer les recettes" le vrai endroit où régler ses défauts :
       une seule source de vérité, éditable, et déjà synchronisée entre appareils.
       Une recette sans cible de température laisse le champ VIDE, ce qui est le
       cas des Brikka : la température y dépend de la puissance du feu, la fixer
       d'avance n'aurait aucun sens. */
    $("#f-dose").value = r.dose || replis.dose;
    $("#f-eau").value = r.eau || "";
    $("#f-temp").value = r.temp === "" || r.temp === undefined ? "" : r.temp;
    razPresetTemp();
    // Le RÉGLAGE du broyeur, pas la cible de la recette : voir MOLETTE_REPLI_USINE.
    $("#f-mouture").value = cafeCourantMoulu() ? "" : replis.molette;
    if (r.methode === "Brikka") $("#f-puissance").value = r.puissance_feu || replis.feu;
    majAgitationDepuisRecette();
    majChampPrechauffe();
    majLait();
    majLive();
    majAvertissements();
    // Le libelle "pas encore notee" est genere : il ne suit pas le TreeWalker.
    majAffichageNote();
  }

  function surChoixCafe() {
    const cafe = DATA.state.cafes.find(c => c.id === $("#f-cafe").value);
    if (!cafe) { majAvertissements(); return; }
    // Présélectionne la machine et la recette recommandées, tout reste modifiable.
    const rReco = trouverRecette(cafe.recette_recommandee);
    if (rReco) {
      choisirMethode(rReco.methode, true);
      remplirSelectRecettes();
      $("#f-recette").value = rReco.nom;
      prefillDepuisRecette(rReco.nom);
    } else if (cafe.machine_recommandee === "Brikka" || cafe.machine_recommandee === "Switch") {
      choisirMethode(cafe.machine_recommandee);
      prefillDepuisRecette($("#f-recette").value);
    }
    majAvertissements();
    majLive();
  }

  /* Le select de température est une aide de saisie : il écrit dans le champ
     nombre puis se remet à zéro. Il ne doit JAMAIS rester sur un choix qui ne
     correspond plus au nombre affiché, sinon il ment. */
  function razPresetTemp() {
    const sel = $("#f-temp-preset");
    if (sel) sel.value = "";
  }

  /* La note est facultative. Le curseur ne peut pas être vide, donc l'absence de
     note vit dans une case à cocher : cochée, on enregistre "" et l'extraction
     compte comme non notée partout (moyennes, insights, meilleurs réglages, qui
     filtrent déjà sur note_sur_10 !== ""). Toucher le curseur décoche la case,
     y compris quand il ne bouge pas, d'où le pointerdown en plus de l'input. */
  function majAffichageNote() {
    const vide = $("#f-note-vide").checked;
    $("#note-affichee").textContent = vide
      ? I18N.t("n_pas_notee")
      : $("#f-note").value + " / 10";
    $("#f-note").classList.toggle("curseur-inactif", vide);
  }

  function noteSaisie() {
    return $("#f-note-vide").checked ? "" : $("#f-note").value;
  }

  /* Âge du paquet au moment de la tasse, affiché sous le choix du café. En
     lecture seule : il se DÉDUIT de la date d'ouverture du sachet, le saisir à la
     main serait une deuxième vérité. Muet tant qu'aucune date d'ouverture n'est
     renseignée, plutôt que d'afficher un zéro faux. */
  function majAgePaquet() {
    const zone = $("#age-paquet");
    if (!zone) return;
    const c = DATA.calculs({
      cafe_id: $("#f-cafe").value,
      date_heure: $("#f-date").value || maintenantLocal(),
    });
    if (c.jours_ouvert === "") { zone.hidden = true; zone.textContent = ""; return; }
    zone.hidden = false;
    zone.textContent = I18N.t("ap_jours", { n: c.jours_ouvert });
  }

  function majAvertissements() {
    const zone = $("#avertissements");
    const cafe = DATA.state.cafes.find(c => c.id === $("#f-cafe").value);
    const av = avertissementsCombinaison(cafe, saisie.methode, $("#f-recette").value, DATA.state.recettes);
    const msgs = av.msgs.slice();
    const dial = $("#f-mouture").value.trim();
    if (dial && !cafeCourantMoulu()) {
      const v = GRIND.verifierPlage(saisie.methode, dial);
      if (!v.ok) msgs.push(v.message);
    }
    zone.innerHTML = msgs.map(m => '<div class="avertissement">' + m + "</div>").join("");
    majAgePaquet();
    majAsideSaisie();
  }

  // Panneau latéral de la saisie : la recette et le café sélectionnés, sous les yeux.
  function majAsideSaisie() {
    const zoneR = $("#aside-recette");
    const zoneC = $("#aside-cafe");
    if (!zoneR || !zoneC) return;

    const r = trouverRecette($("#f-recette").value);
    if (!r) {
      zoneR.innerHTML = '<p class="aside-vide">' + I18N.t("a_choisir_recette") + "</p>";
    } else {
      const etapes = UI.etapesPour(r);
      zoneR.innerHTML =
        '<div class="aside-titre"><span class="pastille-methode ' + r.methode.toLowerCase() + '"></span><h4>' + r.nom + "</h4></div>" +
        (r.sousTitre ? '<p class="aside-sous">' + r.sousTitre + "</p>" : "") +
        '<div class="recette-params">' +
        '<span class="param-chip">' + r.dose + " g / " + r.eau + " g</span>" +
        (UI.facteurEau(r) !== 1
          ? '<span class="param-chip param-chip-adapte">' + I18N.t("a_adapte", { e: $("#f-eau").value }) + "</span>"
          : "") +
        (r.ratioTexte ? '<span class="param-chip">' + r.ratioTexte + "</span>" : "") +
        (r.tempTexte ? '<span class="param-chip">' + r.tempTexte + "</span>" : "") +
        '<span class="param-chip">' + I18N.t("molette") + " " + r.dial + "</span>" +
        (r.totalTexte ? '<span class="param-chip">' + r.totalTexte + "</span>" : "") +
        "</div>" +
        (etapes.length ? '<ol class="recette-etapes">' + etapes.map(e =>
          "<li><span class=\"etape-temps\">" + (e.t === null ? "·" : fmtTemps(e.t)) + "</span><span>" + e.texte + "</span></li>"
        ).join("") + "</ol>" : "") +
        (r.pourQui ? '<p class="aside-pourqui"><b>' + I18N.t("r_pourqui") + "</b> " + r.pourQui + "</p>" : "") +
        (r.cafesAssocies.length ? '<p class="aside-cafes"><b>' + I18N.t("r_cafes") + "</b> " + r.cafesAssocies.join(", ") + "</p>" : "") +
        (r.note ? '<p class="aside-note-recette">' + r.note + "</p>" : "") +
        '<button type="button" class="btn btn-petit" id="aside-pap" data-r="' + r.id + '">' + I18N.t("a_pap") + "</button>";
      const btn = $("#aside-pap");
      if (btn) btn.addEventListener("click", () => UI.ouvrirPasAPas(btn.dataset.r));
    }

    const cafe = DATA.state.cafes.find(c => c.id === $("#f-cafe").value);
    if (!cafe) {
      zoneC.innerHTML = '<p class="aside-vide">' + I18N.t("a_choisir_cafe") + "</p>";
    } else {
      const lignes = [];
      const pct = cafe.pourcentage_cafe_reel === "" || cafe.pourcentage_cafe_reel === undefined ? 100 : Number(cafe.pourcentage_cafe_reel);
      let pastille = "";
      if (pct < 100) pastille = '<span class="badge-nonpur">' + pct + " % " + I18N.t("pct_cafe") + "</span>";
      else if ((cafe.tag || "").includes("référence")) pastille = '<span class="badge-reference">' + I18N.t("badge_etalon") + "</span>";
      const identite = [cafe.torrefacteur, cafe.origine].filter(Boolean).join(" · ");
      const profil = [cafe.espece, cafe.procede,
        cafe.torrefaction ? I18N.t("a_torref", { t: cafe.torrefaction.toLowerCase() }) : ""].filter(Boolean).join(" · ");
      if (identite) lignes.push('<p class="aside-sous">' + identite + "</p>");
      if (profil) lignes.push("<p>" + profil + "</p>");
      if (cafe.notes_annoncees) lignes.push('<p class="aside-notes">' + cafe.notes_annoncees + "</p>");
      if (Number(cafe.deja_moulu) === 1) lignes.push('<p class="aside-reco">' + I18N.t("paquet_aside") + "</p>");
      const reco = [cafe.machine_recommandee ? I18N.t("a_machine", { m: I18N.machine(cafe.machine_recommandee) }) : "",
        cafe.recette_recommandee ? I18N.t("a_recette", { r: cafe.recette_recommandee }) : ""].filter(Boolean).join(", ");
      if (reco) lignes.push('<p class="aside-reco">' + I18N.t("a_reco") + reco + "</p>");
      if (cafe.prix_vnd && cafe.format_grammes) {
        let prixLigne = I18N.t("a_prix", {
          p: fmtVND(cafe.prix_vnd), g: cafe.format_grammes,
          pg: Math.round(cafe.prix_vnd / cafe.format_grammes).toLocaleString(I18N.locale()),
        });
        if (pct < 100) {
          prixLigne += " " + I18N.t("a_prix_reel", {
            pr: Math.round(cafe.prix_vnd / (cafe.format_grammes * pct / 100)).toLocaleString(I18N.locale()),
          });
        }
        lignes.push("<p>" + prixLigne + "</p>");
      }
      if (cafe.date_torrefaction) {
        const jours = Math.floor((new Date() - new Date(cafe.date_torrefaction + "T00:00")) / 86400000);
        if (!isNaN(jours) && jours >= 0) {
          let fraicheur;
          if (jours < 3) fraicheur = I18N.t("f_degaz");
          else if (jours <= 42) fraicheur = I18N.t("f_ok");
          else fraicheur = I18N.t("f_vieux");
          lignes.push('<p class="aside-age">' + I18N.t("a_age", { j: jours, s: jours > 1 ? "s" : "", f: fraicheur }) + "</p>");
        }
      }
      zoneC.innerHTML = '<div class="aside-titre"><h4>' + cafe.nom + "</h4>" + pastille + "</div>" + lignes.join("");
    }
    majEtapesChrono(false);
  }

  /* Explique le ratio affiché : quelle formule a servi, et pourquoi. Le calcul
     diffère selon la machine et personne ne peut le deviner en regardant un
     "1:5,6". Voir DATA.calculs pour la logique. */
  /* Volume en tasse ESTIMÉ, quand Chris ne l'a pas mesuré.

     SWITCH : le papier et le marc retiennent environ 2,1 g d'eau par gramme de
     café. Le reste passe, donc `eau - 2,1 x dose` est une bonne approximation.

     BRIKKA : PAS D'ESTIMATION, volontairement. La formule était `eau - 0,7 x
     dose`, soit 139 ml annoncés pour 150 g de chaudière et 16 g de café. Chris
     mesure 90 à 115 ml. L'erreur venait du modèle : sur une moka la chaudière ne
     se vide pas, une partie de l'eau reste sous l'embouchure du tube et une autre
     part en vapeur, et ces deux pertes dépendent de la flamme et du moment où on
     retire du feu, pas de la dose. Un chiffre faux est pire que pas de chiffre :
     il alimentait le ratio, le volume de boisson et le bouton "reprendre".
     Ne pas remettre de formule Brikka sans données mesurées. */
  function volumeEstime(dose, eau) {
    if (saisie.methode === "Brikka") return 0;
    if (!(dose > 0) || !(eau > 0)) return 0;
    return Math.max(0, Math.round((eau - 2.1 * dose) / 5) * 5);
  }

  function majLive() {
    majCurseurs();
    const dose = parseFloat($f("#f-dose").value);
    const eau = parseFloat($f("#f-eau").value);
    /* Même logique que DATA.calculs : le ratio principal est EAU sur DOSE sur les
       deux machines, c'est la convention universelle et la seule comparable à une
       recette. Le ratio en tasse suit en second, et seulement s'il est mesuré. */
    const volume = parseFloat($f("#f-volume").value);
    const brikka = saisie.methode === "Brikka";
    let ratio = "…", base = "";
    if (dose > 0 && eau > 0) {
      ratio = "1:" + (eau / dose).toFixed(1);
      base = brikka ? "chaudiere" : "infusion";
    }
    const enTasse = dose > 0 && volume > 0 ? "1:" + (volume / dose).toFixed(1) : "";
    const explication = base ? detailRatio(base, dose, eau) : I18N.t("rt_rien");
    poser($f("#live-ratio"), I18N.t("lv_ratio") +
      ' <b class="aide-ratio" tabindex="0" data-info="' + attrTitre(explication) + '">' + ratio + "</b>" +
      (enTasse ? ' <small>(' + I18N.t("rt_tasse_court") + " " + enTasse + ")</small>" : ""));

    // Café déjà moulu : la molette ne s'applique pas, mouture par défaut du paquet.
    const moulu = cafeCourantMoulu();
    const champMouture = $f("#f-mouture");
    champMouture.disabled = moulu;
    if (moulu && champMouture.value) champMouture.value = "";
    champMouture.placeholder = moulu ? I18N.t("paquet") : "1.5.0";

    const dial = champMouture.value.trim();
    const p = GRIND.parseDial(dial);
    const horsPlage = !moulu && p && !GRIND.verifierPlage(saisie.methode, dial).ok;
    poser($f("#live-mouture"), I18N.t("lv_mouture") + " <b>" +
      (moulu ? I18N.t("paquet")
        : p ? I18N.t("lv_detail", { c: p.crans, u: Math.round(p.microns) })
        : dial ? I18N.t("lv_invalide") : "…") + "</b>");
    $f("#live-mouture").classList.toggle("hors-plage", !!horsPlage || (!moulu && dial !== "" && !p));
    // Détail affiché juste sous le champ molette.
    const detailMouture = $f("#mouture-detail");
    if (moulu) {
      poserTexte(detailMouture, I18N.t("paquet"));
      detailMouture.classList.remove("hint-alerte");
    } else if (p) {
      poserTexte(detailMouture, I18N.t("lv_detail", { c: p.crans, u: Math.round(p.microns) }) + " · " + GRIND.bande(p.microns).nom);
      detailMouture.classList.toggle("hint-alerte", !!horsPlage);
    } else {
      poserTexte(detailMouture, dial ? I18N.t("lv_invalide") : "");
      detailMouture.classList.toggle("hint-alerte", !!dial);
    }

    const cafe = DATA.state.cafes.find(c => c.id === $f("#f-cafe").value);
    let cout = "…";
    if (cafe && cafe.prix_vnd && cafe.format_grammes && dose > 0) {
      cout = fmtVND(cafe.prix_vnd / cafe.format_grammes * dose);
      // Café non pur : seconde valeur, le coût rapporté au café réel.
      const pct = cafe.pourcentage_cafe_reel === "" || cafe.pourcentage_cafe_reel === undefined ? 100 : Number(cafe.pourcentage_cafe_reel);
      if (pct < 100 && pct > 0) {
        cout += " <small>(" + I18N.t("lv_cout_reel", { v: fmtVND(cafe.prix_vnd / (cafe.format_grammes * pct / 100) * dose) }) + ")</small>";
      }
    }
    poser($f("#live-cout"), I18N.t("lv_cout") + " <b>" + cout + "</b>");

    // Volume de la boisson : extraction plus eau ajoutée plus lait, en direct.
    const volBase = parseFloat($f("#f-volume").value) || volumeEstime(dose, eau) || 0;
    const ajoutEau = !$f("#champ-ajout-eau").hidden && $f("#f-ajout-eau-oui").checked ? (parseFloat($f("#f-eau-ajoutee").value) || 0) : 0;
    const laitMl = !$f("#champ-lait").hidden ? (parseFloat($f("#f-lait").value) || 0) : 0;
    const spanBoisson = $f("#live-boisson");
    if (volBase > 0 && (ajoutEau > 0 || laitMl > 0)) {
      const parts = [];
      if (ajoutEau > 0) parts.push("+" + ajoutEau + " ml");
      if (laitMl > 0) parts.push("+" + laitMl + " ml " + I18N.t("lv_lait"));
      spanBoisson.hidden = false;
      poser(spanBoisson, I18N.t("lv_boisson") + " <b>" + volBase + " ml (" + parts.join(", ") + ") = " + (volBase + ajoutEau + laitMl) + " ml</b>");
    } else {
      spanBoisson.hidden = true;
    }

    const btnVol = $f("#volume-estime");
    const estime = volumeEstime(dose, eau);
    if (estime) {
      btnVol.hidden = false;
      btnVol.textContent = I18N.t("vol_estime", { v: estime });
      btnVol.title = I18N.t("vol_titre", { m: saisie.methode });
      btnVol.dataset.valeur = estime;
    } else {
      btnVol.hidden = true;
      delete btnVol.dataset.valeur;
    }
  }

  // Chronomètre unique : Démarrer, Pause, Reprendre, Arrêter, Reset.
  // Les paliers viennent de la recette sélectionnée, avec bip discret à chacun.
  // L'écoulement se déduit : du palier "ouvrir" à l'arrêt du chrono.
  const chrono = { etat: "arrete", accumule: 0, departTs: null, interval: null, passes: new Set() };
  let audioCtx = null;

  // Verrou d'écran pendant le chrono : l'écran du téléphone ne doit pas se
  // verrouiller au milieu d'une extraction, les mains sont mouillées.
  // L'API n'existe qu'en contexte sécurisé (https), donc PAS en file:// : on
  // échoue en silence, ce n'est pas une fonction critique. Le système relâche
  // le verrou dès que l'onglet passe en arrière plan, d'où la reprise sur
  // visibilitychange.
  let screenWakeLock = null;

  async function acquireWakeLock() {
    if (screenWakeLock || !("wakeLock" in navigator)) return;
    try {
      const lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => { if (screenWakeLock === lock) screenWakeLock = null; });
      screenWakeLock = lock;
    } catch (e) { /* refusé, ou onglet caché : tant pis */ }
  }

  function releaseWakeLock() {
    if (!screenWakeLock) return;
    const lock = screenWakeLock;
    screenWakeLock = null;
    lock.release().catch(() => { /* déjà relâché */ });
  }

  // Un seul point de vérité : le verrou suit l'état du chrono.
  function syncWakeLock() {
    if (chrono.etat === "encours") acquireWakeLock();
    else releaseWakeLock();
  }

  function chronoEcoule() {
    return (chrono.accumule + (chrono.etat === "encours" ? Date.now() - chrono.departTs : 0)) / 1000;
  }

  function paliersCourants() {
    const r = trouverRecette($("#f-recette").value);
    if (!r) return [];
    return UI.etapesPour(r).filter(e => e.t !== null && e.t !== undefined);
  }

  function tOuverture() {
    const pal = paliersCourants().find(e => /ouvr|open/i.test(e.texte));
    return pal ? pal.t : null;
  }

  function jouerBip() {
    if (!$("#chrono-bip").checked) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.07, audioCtx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.28);
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + 0.3);
    } catch (e) { /* audio indisponible */ }
  }

  function majEtapesChrono(avecBips) {
    const s = chronoEcoule();
    const paliers = paliersCourants();
    const zone = $("#chrono-etapes");
    if (!paliers.length) { zone.hidden = true; return; }
    zone.hidden = false;
    let courante = null, suivante = null;
    paliers.forEach(pal => { if (pal.t <= s) courante = pal; else if (!suivante) suivante = pal; });
    $("#chrono-courante").textContent = courante
      ? fmtTemps(courante.t) + " · " + courante.texte
      : I18N.t("ch_pret");
    if (suivante) {
      $("#chrono-suivante").textContent = I18N.t("ch_suivante", {
        t: fmtTemps(suivante.t), d: Math.max(0, Math.ceil(suivante.t - s)), texte: suivante.texte,
      });
    } else {
      $("#chrono-suivante").textContent = courante ? I18N.t("ch_derniere") : "";
    }
    if (avecBips && chrono.etat === "encours") {
      paliers.forEach(pal => {
        if (pal.t > 0 && pal.t <= s && !chrono.passes.has(pal.t)) {
          chrono.passes.add(pal.t);
          jouerBip();
        }
      });
    }
  }

  function chronoTic() {
    $("#chrono-total").textContent = fmtTemps(Math.floor(chronoEcoule()));
    majEtapesChrono(true);
  }

  function majBoutonsChrono() {
    const b = $("#btn-chrono");
    if (chrono.etat === "arrete") b.textContent = I18N.t("ch_demarrer");
    else if (chrono.etat === "encours") b.textContent = I18N.t("ch_pause");
    else b.textContent = I18N.t("ch_reprendre");
    $("#btn-chrono-stop").hidden = chrono.etat === "arrete";
    $("#btn-chrono-raz").hidden = chrono.etat === "arrete" && chronoEcoule() === 0;
    $(".chrono").classList.toggle("en-cours", chrono.etat === "encours");
    // Appelée à chaque transition du chrono, c'est le bon endroit pour aligner
    // le verrou d'écran sans risque d'oubli dans une branche.
    syncWakeLock();
  }

  function chronoPrincipal() {
    if (chrono.etat === "arrete") {
      chrono.accumule = 0;
      chrono.passes.clear();
      chrono.departTs = Date.now();
      chrono.etat = "encours";
      chrono.interval = setInterval(chronoTic, 200);
    } else if (chrono.etat === "encours") {
      chrono.accumule += Date.now() - chrono.departTs;
      chrono.etat = "pause";
      clearInterval(chrono.interval);
    } else {
      chrono.departTs = Date.now();
      chrono.etat = "encours";
      chrono.interval = setInterval(chronoTic, 200);
    }
    majBoutonsChrono();
  }

  function chronoArreter() {
    if (chrono.etat === "arrete") return;
    if (chrono.etat === "encours") chrono.accumule += Date.now() - chrono.departTs;
    clearInterval(chrono.interval);
    const total = Math.round(chrono.accumule / 1000);
    chrono.etat = "arrete";
    ecrireDuree("f-total", total);
    const tOuv = tOuverture();
    if (tOuv !== null && total > tOuv) ecrireDuree("f-ecoulement", total - tOuv);
    majBoutonsChrono();
    toast(I18N.t("t_temps"));
  }

  function chronoRaz() {
    clearInterval(chrono.interval);
    chrono.etat = "arrete";
    chrono.accumule = 0;
    chrono.departTs = null;
    chrono.passes.clear();
    $("#chrono-total").textContent = "0:00";
    majEtapesChrono(false);
    majBoutonsChrono();
  }

  // Corrections des diagnostics cochés, une ligne chacune, sous les pilules.
  // Familles opposées de l'axe d'extraction : cocher une de chaque empile deux
  // corrections qui s'annulent (moudre plus fin ET plus grossier). C'est le signe
  // d'une extraction inégale, qui a sa propre valeur.
  const DIAGS_SOUS_EXTRAIT = ["Un peu acide", "Sous-extrait (acide)"];
  const DIAGS_SUR_EXTRAIT = ["Un peu amer", "Sur-extrait (amer)", "Un peu astringent", "Astringent"];
  const DIAG_INEGALE = DIAGNOSTIC_DERIVE;

  function majCorrectionDiagnostic() {
    const lignes = DIAGNOSTICS
      .filter(d => saisie.diagnostics.has(d))
      .map(d => I18N.tr(DIAGNOSTIC_CORRECTIONS[d] || ""))
      .filter(Boolean);

    /* Acide ET amer ensemble : le site CONCLUT au lieu de demander à Chris de
       cocher une troisième pilule. Les deux corrections d'origine s'annulent
       (moudre plus fin ET plus grossier), donc on les remplace au lieu de les
       empiler, sinon il lit deux conseils opposés sans savoir lequel suivre. */
    const inegale = DIAGS_SOUS_EXTRAIT.some(d => saisie.diagnostics.has(d)) &&
      DIAGS_SUR_EXTRAIT.some(d => saisie.diagnostics.has(d));
    if (inegale) {
      $("#diagnostic-correction").innerHTML =
        '<b class="diag-alerte">' + I18N.diag(DIAG_INEGALE) + "</b><br>" +
        I18N.tr(DIAGNOSTIC_CORRECTIONS[DIAG_INEGALE] || "");
      return;
    }

    $("#diagnostic-correction").innerHTML = lignes.join("<br>");
  }

  /* Bulle d'un diagnostic : QUAND le cocher, puis QUOI faire. Deux lignes, la
     CSS de la bulle est en white-space pre-line. La correction seule laissait
     deviner dans quel cas on se trouve, et une bonne correction appliquée au
     mauvais diagnostic empire la tasse suivante. */
  function infoDiagnostic(d) {
    const quand = I18N.tr(DIAGNOSTIC_QUAND[d] || "");
    const corr = I18N.tr(DIAGNOSTIC_CORRECTIONS[d] || "");
    return [quand, corr].filter(Boolean).join("\n");
  }

  /* Un écouteur par CONTENEUR, posé une seule fois au câblage. Les conteneurs ne
     sont jamais remplacés, seul leur contenu l'est : la délégation survit donc à
     toutes les reconstructions, et construirePilules() n'a plus rien à
     réattacher. 85 écouteurs économisés à chaque bascule de langue. */
  function brancherPilules() {
    $("#f-diagnostic").addEventListener("click", ev => {
      const b = ev.target.closest(".pilule");
      if (!b || !b.dataset.diag) return;
      const d = b.dataset.diag;
      if (saisie.diagnostics.has(d)) saisie.diagnostics.delete(d);
      else saisie.diagnostics.add(d);
      basculerEtat(b, saisie.diagnostics.has(d));
      planifierBrouillon();
      majCorrectionDiagnostic();
    });
    $("#f-descripteurs").addEventListener("click", ev => {
      const b = ev.target.closest(".tag");
      if (!b || !b.dataset.tag) return;
      const t = b.dataset.tag;
      if (saisie.descripteurs.has(t)) saisie.descripteurs.delete(t);
      else saisie.descripteurs.add(t);
      basculerEtat(b, saisie.descripteurs.has(t));
    });
  }

  function construirePilules() {
    // Diagnostics à choix MULTIPLE (une tasse peut être un peu amère ET
    // astringente). Chaque pilule porte sa correction en infobulle (data-info,
    // bulle CSS au survol).
    // Groupés par ce qu'il faut corriger : réglage, ratio, ou le café lui même.
    // Une liste à plat de seize entrées se lit mal et pousse à cocher au hasard.
    $("#f-diagnostic").innerHTML = DIAGNOSTICS_GROUPES.map(g =>
      '<div class="tags-groupe"><span class="tags-groupe-nom">' + I18N.groupe(g.nom) + "</span>" +
      '<div class="tags">' + g.diags.map(d =>
        '<button type="button" class="pilule" aria-pressed="false" data-diag="' + d + '" data-info="' +
        infoDiagnostic(d) + '">' + I18N.diag(d) + "</button>").join("") +
      "</div></div>").join("");
    // Les clics sont délégués une fois pour toutes, voir brancherPilules().

    // Descripteurs groupés par famille de la roue des saveurs. Chaque tag
    // porte sa définition en infobulle (data-info, bulle CSS au survol).
    $("#f-descripteurs").innerHTML = DESCRIPTEURS_GROUPES.map(g =>
      '<div class="tags-groupe"><span class="tags-groupe-nom">' + I18N.groupe(g.nom) + "</span>" +
      '<div class="tags">' + g.tags.map(d =>
        '<button type="button" class="tag" aria-pressed="false" data-tag="' + d + '" data-info="' +
        I18N.tagInfo(d) + '">' + I18N.tag(d) + "</button>").join("") +
      "</div></div>").join("");

  }

  /* Appelée à CHAQUE arrivée sur l'écran Saisie pour une nouvelle tasse. La date
     n'était posée qu'à la remise à zéro du formulaire, c'est-à-dire au démarrage
     et après un enregistrement : sur un téléphone où la page reste ouverte, elle
     affichait donc l'heure de la tasse précédente. */
  function rafraichirDateSaisie() {
    if (saisie.dateTouchee) return;
    $("#f-date").value = maintenantLocal();
  }

  // La date vient de Chris dès qu'il y touche, et plus d'un défaut.
  function marquerDateTouchee() { saisie.dateTouchee = true; }

  /* Les couples curseur / champ. Le CHAMP reste la source de vérité, le curseur
     le pilote : tout le reste du code lit le champ, le brouillon l'enregistre,
     l'édition le remplit. Inverser les rôles aurait demandé de toucher partout.

     La mouture est le seul cas particulier : son champ porte un cadran
     rotation.numéro.cran, pas un nombre, donc le curseur court sur les CRANS et
     la conversion passe par le moteur de mouture, comme le convertisseur du
     guide. */
  const COUPLES_CURSEUR = [
    { curseur: "f-dose-curseur", champ: "f-dose" },
    { curseur: "f-eau-curseur", champ: "f-eau" },
    { curseur: "f-puissance-curseur", champ: "f-puissance" },
    { curseur: "f-agitation-curseur", champ: "f-agitation" },
    {
      curseur: "f-mouture-curseur", champ: "f-mouture",
      versChamp: crans => GRIND.dialDepuisCrans(Number(crans)),
      versCurseur: dial => { const p = GRIND.parseDial(dial); return p ? p.crans : null; },
    },
  ];

  function brancherCurseurs() {
    COUPLES_CURSEUR.forEach(c => {
      const curseur = $("#" + c.curseur), champ = $("#" + c.champ);
      if (!curseur || !champ) return;
      curseur.addEventListener("input", () => {
        champ.value = c.versChamp ? c.versChamp(curseur.value) : curseur.value;
        /* On rejoue l'événement du CHAMP : c'est lui que le reste du formulaire
           écoute, pour la ligne live, le brouillon et les avertissements.
           L'appeler à la main ici les oublierait un jour ou l'autre. */
        champ.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
  }

  /* Remet les curseurs en face de leurs champs. Appelée depuis majLive(), donc
     après chaque remise à zéro, chaque préremplissage de recette et chaque
     ouverture d'extraction : ce sont les moments où le champ change SANS que le
     curseur soit touché. */
  function majCurseurs() {
    COUPLES_CURSEUR.forEach(c => {
      const curseur = $("#" + c.curseur), champ = $("#" + c.champ);
      if (!curseur || !champ) return;
      const v = c.versCurseur ? c.versCurseur(champ.value) : champ.value;
      // Une valeur vide ou illisible laisse le curseur où il est : le déplacer
      // au minimum donnerait à croire à un réglage que Chris n'a pas fait.
      if (v === null || v === "" || isNaN(Number(v))) return;
      if (String(curseur.value) !== String(v)) curseur.value = v;
    });
  }

  function reinitialiserSaisie(garderCafe) {
    saisie.editId = null;
    saisie.dateTouchee = false;
    saisie.diagnostics.clear();
    saisie.descripteurs.clear();
    $("#saisie-titre").textContent = I18N.t("s_nouvelle");
    $("#btn-enregistrer").textContent = I18N.t("s_enregistrer");
    $("#btn-annuler-edition").hidden = true;
    $("#f-date").value = maintenantLocal();
    $("#f-dose").value = replis.dose;
    /* Le café n'est plus laissé vide. Chris n'a en général qu'un seul café actif
       à la fois, et le choisir à chaque tasse est un clic pour rien. On prend le
       premier de la liste, celui que le menu propose déjà en tête.

       Volontairement SANS surChoixCafe() : choisir un café à la main applique
       aussi sa machine et sa recette recommandées, et faire basculer la machine
       à chaque nouvelle saisie serait bien plus qu'un champ prérempli. */
    if (!garderCafe) {
      const premierCafe = cafesSelectionnables()[0];
      $("#f-cafe").value = premierCafe ? premierCafe.id : "";
    }
    $("#f-commentaire").value = "";
    // Milieu de course et case cochée : le curseur ne doit suggérer aucune note.
    $("#f-note").value = 5;
    $("#f-note-vide").checked = true;
    majAffichageNote();
    ecrireDuree("f-total", "");
    ecrireDuree("f-ecoulement", "");
    $("#f-volume").value = "";
    $("#f-eau").value = "";
    $("#f-temp").value = "";
    $("#f-puissance").value = replis.feu;
    $("#f-prechauffe").checked = false;
    $("#f-ratee").checked = false;
    $("#f-ajout-eau-oui").checked = false;
    $("#f-eau-ajoutee").hidden = true;
    $("#f-eau-ajoutee").value = "";
    $("#f-lait").value = "";
    majAgitationDepuisRecette();
    majLait();
    $$("#f-diagnostic .pilule").forEach(x => basculerEtat(x, false));
    $$("#f-descripteurs .tag").forEach(x => basculerEtat(x, false));
    $("#diagnostic-correction").textContent = "";
    chronoRaz();
    /* EN DERNIER, et c'est le point important : les lignes ci-dessus posent les
       replis, la recette a le dernier mot. Sans cet appel le formulaire vierge
       restait vide, et les valeurs par défaut réglées dans Paramètres
       n'arrivaient que si on rechangeait de recette à la main. Placé plus haut,
       il se ferait écraser par la remise à zéro du préchauffage.
       prefillDepuisRecette termine par majAvertissements et majLive. */
    prefillDepuisRecette($("#f-recette").value);
  }

  function chargerExtractionDansSaisie(ext, duplication) {
    remplirSelectCafes(ext.cafe_id);
    saisie.editId = duplication ? null : ext.id;
    $("#f-date").value = duplication ? maintenantLocal() : ext.date_heure;
    // Elle vient de l'extraction ouverte, pas d'un défaut : on n'y retouche pas.
    saisie.dateTouchee = !duplication;
    $("#f-cafe").value = ext.cafe_id;
    choisirMethode(ext.methode || "Brikka", true);
    remplirSelectRecettes();
    if (ext.recette) $("#f-recette").value = ext.recette;
    $("#f-dose").value = ext.dose_g;
    $("#f-eau").value = ext.eau_g;
    $("#f-temp").value = ext.temperature_c;
    $("#f-mouture").value = ext.mouture_dial;
    $("#f-volume").value = ext.volume_extrait_ml;
    $("#f-ajout-eau-oui").checked = ext.eau_ajoutee_ml !== "" && ext.eau_ajoutee_ml !== undefined;
    $("#f-eau-ajoutee").hidden = !$("#f-ajout-eau-oui").checked;
    $("#f-eau-ajoutee").value = ext.eau_ajoutee_ml !== undefined ? ext.eau_ajoutee_ml : "";
    $("#f-prechauffe").checked = Number(ext.eau_prechauffee) === 1;
    $("#f-ratee").checked = Number(ext.ratee) === 1;
    majChampPrechauffe();
    $("#f-puissance").value = ext.puissance_feu || "";
    $("#f-agitation-oui").checked = ext.agitation_nb !== "" && ext.agitation_nb !== undefined;
    $("#ligne-agitation").hidden = !$("#f-agitation-oui").checked;
    $("#f-agitation").value = ext.agitation_nb !== undefined && ext.agitation_nb !== "" ? ext.agitation_nb : 1;
    $("#f-tasse").value = ext.tasse || "";
    $("#f-lait").value = ext.lait_ml !== undefined ? ext.lait_ml : "";
    $("#champ-lait").hidden = !(trouverRecette(ext.recette) || {}).lait;
    ecrireDuree("f-total", ext.temps_total_s);
    ecrireDuree("f-ecoulement", ext.temps_ecoulement_s);
    $("#f-note").value = ext.note_sur_10 === "" ? 5 : ext.note_sur_10;
    $("#f-note-vide").checked = ext.note_sur_10 === "";
    majAffichageNote();
    $("#f-commentaire").value = ext.commentaire;
    saisie.diagnostics = new Set((ext.diagnostic || "").split("|").filter(Boolean));
    $$("#f-diagnostic .pilule").forEach(x => x.classList.toggle("actif", saisie.diagnostics.has(x.dataset.diag)));
    majCorrectionDiagnostic();
    saisie.descripteurs = new Set((ext.descripteurs || "").split("|").filter(Boolean));
    $$("#f-descripteurs .tag").forEach(x => x.classList.toggle("actif", saisie.descripteurs.has(x.dataset.tag)));
    $("#saisie-titre").textContent = duplication ? I18N.t("s_dupliquee") : I18N.t("s_modifier");
    $("#btn-enregistrer").textContent = duplication ? I18N.t("s_enregistrer") : I18N.t("s_enregistrer_modif");
    $("#btn-annuler-edition").hidden = duplication;
    majAvertissements();
    majLive();
    // Le second argument dit à l'écran Saisie que cette bascule EST l'ouverture
    // d'une édition, et qu'il ne doit donc pas l'abandonner en arrivant.
    activerEcran("saisie", true);
  }

  async function enregistrerSaisie(ev) {
    ev.preventDefault();
    if (!$("#f-dose").value) { toast(I18N.t("t_dose")); return; }
    const ext = {
      date_heure: $("#f-date").value || maintenantLocal(),
      cafe_id: $("#f-cafe").value,
      methode: saisie.methode,
      recette: $("#f-recette").value,
      dose_g: $("#f-dose").value,
      eau_g: $("#f-eau").value,
      mouture_dial: $("#f-mouture").value.trim().replace(/,/g, "."),
      temperature_c: $("#f-temp").value,
      temps_total_s: lireDuree("f-total"),
      temps_ecoulement_s: lireDuree("f-ecoulement"),
      volume_extrait_ml: $("#f-volume").value,
      eau_ajoutee_ml: saisie.methode === "Brikka" && $("#f-ajout-eau-oui").checked ? $("#f-eau-ajoutee").value : "",
      lait_ml: !$("#champ-lait").hidden ? $("#f-lait").value : "",
      agitation_nb: saisie.methode === "Switch" && $("#f-agitation-oui").checked ? ($("#f-agitation").value || 1) : "",
      tasse: $("#f-tasse").value,
      eau_prechauffee: saisie.methode === "Brikka" && $("#f-prechauffe").checked ? 1 : "",
      ratee: $("#f-ratee").checked ? 1 : "",
      puissance_feu: saisie.methode === "Brikka" ? $("#f-puissance").value : "",
      note_sur_10: noteSaisie(),
      diagnostic: DIAGNOSTICS.filter(d => saisie.diagnostics.has(d)).join("|"),
      descripteurs: Array.from(saisie.descripteurs).join("|"),
      commentaire: $("#f-commentaire").value.trim(),
    };
    if (saisie.editId) {
      await DATA.modifierExtraction(saisie.editId, ext);
      effacerBrouillon();
      toast(I18N.t("t_modifiee"));
      reinitialiserSaisie();
      activerEcran("historique");
    } else {
      await DATA.ajouterExtraction(ext);
      effacerBrouillon();
      toast(I18N.t("t_enregistree"));
      reinitialiserSaisie(true);
      activerEcran("tableau");
    }
  }

  // ---------- Saisie rapide flottante ----------

  let rapideOuvert = false;

  // Le câblage a besoin de savoir si le panneau est ouvert, pas de pouvoir
  // l'ouvrir en écrivant dans une variable.
  function rapideEstOuvert() { return rapideOuvert; }

  function basculerRapide(forcer) {
    rapideOuvert = forcer !== undefined ? forcer : !rapideOuvert;
    $("#panneau-rapide").classList.toggle("ouvert", rapideOuvert);
    $("#fab-rapide").classList.toggle("ouvert", rapideOuvert);
    if (rapideEstOuvert()) majPanneauRapide();
  }

  function majPanneauRapide() {
    const selCafe = $("#q-cafe");
    const v = selCafe.value;
    selCafe.innerHTML = '<option value="">' + I18N.t("choisir_cafe") + "</option>" +
      cafesSelectionnables().map(c => '<option value="' + c.id + '">' + c.nom + "</option>").join("");
    if (v && cafesSelectionnables().some(c => c.id === v)) selCafe.value = v;
    /* Même défaut que le formulaire complet : le panneau rapide REFUSE
       d'enregistrer sans café, donc l'ouvrir sur un champ vide garantissait un
       aller-retour. On ne préremplit que si rien n'est déjà choisi, pour ne pas
       écraser une sélection en cours. */
    if (!selCafe.value) {
      const premierCafe = cafesSelectionnables()[0];
      if (premierCafe) selCafe.value = premierCafe.id;
    }
    majRecettesRapide();
  }

  function majRecettesRapide() {
    const sel = $("#q-recette");
    const v = sel.value;
    const groupes = ["Brikka", "Switch"].map(m => {
      const liste = recettesDeMethode(m);
      if (!liste.length) return "";
      return '<optgroup label="' + m + '">' +
        liste.map(r => "<option>" + r.nom + "</option>").join("") + "</optgroup>";
    }).join("");
    sel.innerHTML = groupes;
    if (v && trouverRecette(v)) sel.value = v;
    majAvertRapide();
  }

  function surChoixCafeRapide() {
    const cafe = DATA.state.cafes.find(c => c.id === $("#q-cafe").value);
    if (cafe) {
      const r = trouverRecette(cafe.recette_recommandee);
      if (r && r.actif !== 0) $("#q-recette").value = r.nom;
    }
    majAvertRapide();
  }

  function majAvertRapide() {
    const cafe = DATA.state.cafes.find(c => c.id === $("#q-cafe").value);
    const r = trouverRecette($("#q-recette").value);
    const av = r ? avertissementsCombinaison(cafe, r.methode, r.nom, DATA.state.recettes) : { msgs: [] };
    $("#q-avert").textContent = av.msgs.length ? "⚠ " + av.msgs[0] : "";
  }

  async function enregistrerRapide() {
    const cafeId = $("#q-cafe").value;
    const r = trouverRecette($("#q-recette").value);
    if (!cafeId) { toast(I18N.t("t_choisis_cafe")); return; }
    if (!r) { toast(I18N.t("t_choisis_recette")); return; }
    // Le café choisi dans le panneau. Un café déjà moulu n'a pas de réglage de
    // molette à enregistrer : la valeur de la recette serait une invention.
    const cafeQ = DATA.state.cafes.find(c => c.id === cafeId);
    await DATA.ajouterExtraction({
      date_heure: maintenantLocal(),
      cafe_id: cafeId,
      methode: r.methode,
      recette: r.nom,
      dose_g: r.dose || replis.dose,
      eau_g: r.eau,
      mouture_dial: cafeQ && Number(cafeQ.deja_moulu) === 1 ? "" : r.dial,
      temperature_c: r.temp,
      temps_total_s: "",
      temps_ecoulement_s: "",
      volume_extrait_ml: "",
      tasse: (DATA.state.tasses.find(t => t.nom === (r.methode === "Brikka" ? "Loveramics Flat White Egg" : "Classic Mug")) || { nom: "" }).nom,
      note_sur_10: $("#q-note").value,
      diagnostic: "",
      descripteurs: "",
      commentaire: "",
    });
    toast(I18N.t("t_rapide", { r: r.nom, n: $("#q-note").value }));
    basculerRapide(false);
  }

  // Mis à disposition des autres écrans.
  Object.assign(UI, {
    BROUILLON_MAX_MS, CASES_BROUILLON, CHAMPS_BROUILLON, CLE_BROUILLON, DIAGS_SOUS_EXTRAIT,
    DIAGS_SUR_EXTRAIT, DIAG_INEGALE, acquireWakeLock, audioCtx, basculerRapide,
    brancherPilules, brouillonMinuteur, brouillonUtile, cafeCourantMoulu,
    cafesSelectionnables, chargerExtractionDansSaisie, choisirMethode, chrono, chronoArreter,
    chronoEcoule, chronoPrincipal, chronoRaz, chronoTic, construirePilules, ecrireBrouillon,
    ecrireDuree, effacerBrouillon, enregistrerRapide, enregistrerSaisie, infoDiagnostic,
    jouerBip, lireDuree, majAffichageNote, majAgePaquet, majAgitationDepuisRecette,
    majAsideSaisie, majAvertRapide, majAvertissements, majBoutonsChrono, majChampPrechauffe,
    majCorrectionDiagnostic, majEtapesChrono, majLait, majLive, majPanneauRapide,
    majRecettesRapide, noteSaisie, paliersCourants, planifierBrouillon, prefillDepuisRecette,
    brancherCurseurs, majCurseurs, marquerDateTouchee, rafraichirDateSaisie,
    rapideEstOuvert, rapideOuvert, razPresetTemp, reinitialiserSaisie, releaseWakeLock,
    remplirSelectCafes, remplirSelectRecettes, remplirSelectTasses, rendreTassesEditeur,
    restaurerBrouillon, saisie, screenWakeLock, surChoixCafe, surChoixCafeRapide,
    syncWakeLock, tOuverture, volumeEstime,
  });
})();
