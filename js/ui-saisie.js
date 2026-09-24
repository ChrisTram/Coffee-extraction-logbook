/* Écran de saisie : le formulaire et le chronomètre. Le brouillon vit dans
 * ui-brouillon.js, le panneau rapide qui flotte par-dessus dans ui-rapide.js.
 *
 * C'est le fichier le plus long, et pour une bonne raison : c'est là que Chris
 * passe son temps, souvent d'une main, au téléphone, pendant une extraction. Le
 * brouillon existe parce que quitter l'onglet suffit à ce qu'un téléphone
 * décharge la page pour récupérer de la mémoire. */
"use strict";

(() => {

  // Emprunté au noyau, chargé avant nous.
  const { $, $$, $f, activerAppuiLong, activerEcran, attrTitre, basculerEtat, detailRatio, fmtTemps,
    fmtDecimal, fmtVND, icone, maintenantLocal, brancherDictee, brancherNote, marquerNote, nav, noteVide, peindreCurseur, poser, poserTexte, recettesDeMethode, replis, toast,
    trouverRecette } = UI;

  // ---------- Saisie ----------

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
    /* La température entière est un champ du SWITCH. Sur la Brikka l'eau chauffe
       dans la chaudière, il n'y a rien à mesurer avant : la seule question est
       la case « eau préchauffée », et elle a son propre champ. */
    $("#champ-temp").hidden = m !== "Switch";
    if ($("#ligne-chauffe")) $("#ligne-chauffe").hidden = m !== "Switch";
    majTempHint();
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
    /* TOUJOURS visible sur la Brikka (v7.95, demande de Chris) : c'est la seule
       question que la Brikka pose sur l'eau. Sur la famille brikka-classique la
       case et la variante de recette disent la même chose, alors elles restent
       d'accord dans les deux sens : la recette coche la case, et cocher la case
       change la recette (surPrechauffe). */
    $("#champ-prechauffe").hidden = saisie.methode !== "Brikka";
    if (familleTranche) $("#f-prechauffe").checked = RECETTES_EAU_PRECHAUFFEE.includes(r.id);
  }

  /* Cocher ou décocher « eau préchauffée » quand la recette est une des deux
     Brikka classique bascule sur l'autre variante, pour qu'on ne puisse pas
     enregistrer une recette préchauffée avec la case décochée. Sur les autres
     recettes Brikka, la case est une simple donnée de la tasse. */
  function surPrechauffe() {
    const r = trouverRecette($("#f-recette").value);
    if (!r || !FAMILLES_PRECHAUFFAGE.includes(r.famille || "")) return;
    const voulue = $("#f-prechauffe").checked;
    const cible = recettesDeMethode("Brikka").find(x =>
      x.famille === r.famille && RECETTES_EAU_PRECHAUFFEE.includes(x.id) === voulue);
    if (!cible || cible.nom === r.nom) return;
    $("#f-recette").value = cible.nom;
    prefillDepuisRecette(cible.nom);
    majAvertissements();
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

  /* De combien le lait GONFLE en moussant, selon la texture visée. Le vide à
     remplir divisé par ce facteur donne le lait FROID à mesurer dans le pot.
     Un flat white est une texture lisse, à peine aérée. Un cappuccino vise un
     tiers de mousse, soit environ la moitié de volume en plus : c'est pourquoi
     il part de moins de lait tout en remplissant la même tasse. */
  const GONFLE_FLAT = 1.1;
  const GONFLE_CAPPU = 1.5;

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
    const mesure = parseFloat($("#f-volume").value) ||
      volumeEstime(parseFloat($("#f-dose").value), parseFloat($("#f-eau").value));
    /* Repli sur le rendement DÉCLARÉ de la recette. Ce n'est pas une estimation
       calculée, c'est un chiffre mesuré et écrit dans la recette : sur une
       Brikka, volumeEstime() rend 0 exprès, l'ancienne formule annonçait 139 ml
       là où Chris en mesure 90 à 115. Sans ce repli, le lait ne se calculait
       jamais sur les recettes Brikka, qui sont précisément celles au lait. */
    const volCafe = mesure > 0 ? mesure : (r.volumeTypique || 0);
    const declare = !(mesure > 0) && volCafe > 0;
    if (!tasse) {
      $("#lait-hint").textContent = I18N.t("lait_choisir_tasse");
      return;
    }
    if (!(volCafe > 0)) {
      $("#lait-hint").textContent = I18N.t("lait_sans_volume");
      return;
    }
    /* Le VIDE à remplir, pas encore le lait à verser : voir plus bas. */
    const lait = Math.max(0, tasse.contenance_ml - volCafe);
    if (lait === 0) {
      $("#lait-hint").textContent = I18N.t("lait_trop_petit");
      return;
    }
    /* LES DEUX BOISSONS d'un coup, comptées sur la MÊME base : du lait froid à
       verser dans le pot. Le lait gonfle en moussant, donc on en verse moins que
       le vide à remplir, et d'autant moins qu'on le mousse. */
    const flat = Math.round(lait / GONFLE_FLAT);
    const cappu = Math.round(lait / GONFLE_CAPPU);
    $("#f-lait").value = flat;
    $("#lait-hint").textContent =
      I18N.t("lait_deux", { e: lait, l: flat, c: cappu, t: tasse.contenance_ml, v: volCafe }) +
      (declare ? " " + I18N.t("lait_declare") : "");
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
      '<button type="button" class="btn-ligne danger" data-tasse-suppr="' + t.id + '" title="' + I18N.t("btn_supprimer") + '">' + icone("croix") + "</button></div>"
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
    // Une nouvelle recette repart sans temps de chauffe : c'est une mesure de la
    // tasse en cours, pas une valeur de la recette. L'aide dit combien viser.
    ecrireDuree("f-chauffe", "");
    majTempHint();
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

  /* TEMPÉRATURE PAR LE TEMPS DE CHAUFFE, Switch seulement. Chris tape le temps
     que la bouilloire a passé sur le feu ; le degré s'en déduit (modèle dans
     recettes.js, temps d'ébullition dans Paramètres) et s'écrit dans le champ
     température, qui reste modifiable à la main et reste la valeur stockée.
     Sans temps saisi mais avec une cible de recette, l'aide dit combien de temps
     viser. La Brikka ne voit rien de tout ça : sa ligne est masquée. */
  function surChauffe() {
    const s = lireDuree("f-chauffe");
    if (s !== "") {
      const t = temperatureDepuisChauffe(s, replis.ebullition);
      if (t !== "") $("#f-temp").value = t;
    }
    majTempHint();
    majAvertissements();
  }

  function majTempHint() {
    const hint = $("#temp-hint");
    if (!hint) return;
    if (saisie.methode !== "Switch") { poserTexte(hint, ""); return; }
    const e = replis.ebullition;
    const s = lireDuree("f-chauffe");
    const t = $("#f-temp").value;
    /* Sans temps d'ébullition il n'y a rien à dire : le repli d'usine en pose
       un, et Paramètres permet de le corriger. L'ancien paragraphe qui demandait
       d'aller chronométrer sa bouilloire déformait la mise en page pour un
       réglage qu'on fait une fois. */
    if (!(e > 0)) { poserTexte(hint, ""); return; }
    if (s !== "") {
      poserTexte(hint, I18N.t("temp_estimee", { d: fmtTemps(s), t: temperatureDepuisChauffe(s, e) }));
    } else if (t !== "") {
      poserTexte(hint, I18N.t("temp_conseil", { t, d: fmtTemps(chauffePourTemperature(t, e)) }));
    } else {
      poserTexte(hint, "");
    }
  }

  /* La note est facultative. Tant que le curseur n'a pas été touché, il n'a
     pas de pouce (noteVide, dans le noyau) : on enregistre "" et l'extraction
     compte comme non notée partout (moyennes, insights, meilleurs réglages, qui
     filtrent déjà sur note_sur_10 !== ""). Le bouton Effacer ramène à cet état. */
  function majAffichageNote() {
    const curseur = $("#f-note");
    const vide = noteVide(curseur);
    const dit = vide ? I18N.t("n_pas_notee") : curseur.value + " / 10";
    $("#note-affichee").textContent = dit;
    curseur.setAttribute("aria-valuetext", dit);
    $("#f-note-aide").hidden = !vide;
    $("#f-note-effacer").hidden = vide;
    peindreCurseur(curseur);
  }

  /* Ce qui part en base : une chaine vide quand la tasse n est pas notee, pour
     que les moyennes, les insights et les meilleurs reglages l ecartent tous de
     la meme facon. Ils filtrent deja sur note_sur_10 !== "". */
  function noteSaisie() {
    return noteVide($("#f-note")) ? "" : $("#f-note").value;
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
    majJumelles();
    UI.majEtapesChrono(false);
  }

  /* LES TASSES JUMELLES (v8.44) : ce que ce réglage a donné les fois d'avant.
     Le calcul est dans REGLAGES.jumelles (même recette, molette à trois crans
     près). Chaque ligne dit en quoi elle DIFFÈRE du formulaire, et seulement
     ça : même café et même molette ne s'écrivent pas. Sous deux jumelles, la
     carte se cache, une seule tasse n'est pas un repère. */
  function majJumelles() {
    const zone = $("#aside-jumelles");
    if (!zone) return;
    const cible = {
      cafe_id: $("#f-cafe").value, recette: $("#f-recette").value,
      mouture_dial: $("#f-mouture").value.trim(), moulu: cafeCourantMoulu(),
    };
    const exts = UI.extAnalysables().filter(e => e.id !== saisie.editId);
    const liste = REGLAGES.jumelles(exts, cible, 3);
    if (liste.length < 2) { zone.hidden = true; zone.innerHTML = ""; return; }
    const temp = $("#f-temp").value, feu = $("#f-puissance").value;
    const lignes = liste.map(j => {
      const e = j.ext;
      const ecarts = [];
      if (!j.memeCafe) {
        const autre = DATA.state.cafes.find(c => c.id === e.cafe_id);
        ecarts.push(autre ? autre.nom : I18N.t("j_autre_cafe"));
      }
      if (j.ecart) {
        ecarts.push(I18N.t("j_molette", {
          d: e.mouture_dial,
          c: I18N.t(Math.abs(j.ecart) > 1 ? "j_crans" : "j_cran", { n: (j.ecart > 0 ? "+" : "") + j.ecart }),
        }));
      }
      if (e.methode === "Switch" && e.temperature_c !== "" && String(e.temperature_c) !== String(temp)) {
        ecarts.push(e.temperature_c + " °C");
      }
      if (e.methode === "Brikka" && e.puissance_feu !== "" && e.puissance_feu !== undefined &&
        String(e.puissance_feu) !== String(feu)) ecarts.push(I18N.t("j_feu", { f: e.puissance_feu }));
      const [a, m, jour] = String(e.date_heure).slice(0, 10).split("-").map(Number);
      const date = new Date(a, m - 1, jour).toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" });
      return '<li><span class="j-date">' + date + '</span><span class="j-ecart' + (ecarts.length ? "" : " j-meme") + '">' +
        (ecarts.length ? ecarts.join(" · ") : I18N.t(cible.moulu ? "j_meme_moulu" : "j_meme")) + '</span><b class="j-note">' +
        fmtDecimal(Number(e.note_sur_10), 1) + "</b></li>";
    });
    const moy = liste.reduce((s, j) => s + Number(j.ext.note_sur_10), 0) / liste.length;
    zone.hidden = false;
    zone.innerHTML = '<div class="aside-titre"><h4>' + I18N.t("j_titre") + "</h4></div>" +
      '<p class="aside-sous">' + I18N.t(cible.moulu ? "j_regle_moulu" : "j_regle", { c: REGLAGES.JUMELLE_CRANS }) +
      "</p>" +
      '<ol class="jumelles">' + lignes.join("") + "</ol>" +
      '<p class="j-moyenne">' + I18N.t("j_moyenne", { m: fmtDecimal(moy, 1), n: liste.length }) + "</p>";
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
      UI.planifierBrouillon();
      majCorrectionDiagnostic();
    });
    /* Apres chaque clic sur une pastille, on recalcule : voir majFamillesVisibles. */
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
      '<div class="tags-groupe" data-groupe="' + g.nom + '"><span class="tags-groupe-nom">' +
      I18N.groupe(g.nom) + "</span>" +
      '<div class="tags">' + g.tags.map(d =>
        '<button type="button" class="tag" aria-pressed="false" data-tag="' + d + '" data-info="' +
        I18N.tagInfo(d) + '">' + I18N.tag(d) + "</button>").join("") +
      "</div></div>").join("");
    majFamillesVisibles();
  }

  /* COMBIEN DE FAMILLES RESTENT VISIBLES quand tout est replie. Deux, comme le
     brief : assez pour comprendre qu'il y en a d'autres, assez peu pour que le
     bloc tienne dans l'ecran. */
  const FAMILLES_VISIBLES = 2;
  const CLE_FAMILLES = "gouts-toutes-familles";

  /* OUVERT PAR DEFAUT. Le repli reste, mais il se choisit : Chris ne veut pas
     avoir a cliquer pour voir sa propre liste. Seul un « 0 » explicitement
     enregistre replie les familles. */
  function toutesFamilles() {
    try { return localStorage.getItem(CLE_FAMILLES) !== "0"; } catch (e) { return true; }
  }

  function basculerFamilles(ouvrir) {
    const veut = ouvrir === undefined ? !toutesFamilles() : !!ouvrir;
    try { localStorage.setItem(CLE_FAMILLES, veut ? "1" : "0"); } catch (e) { /* navigation privee */ }
    majFamillesVisibles();
  }

  /* QUELLES FAMILLES SE VOIENT. Une famille qui contient un gout coche reste
     visible quoi qu'il arrive : cacher une pastille cochee, c'est faire croire
     qu'elle ne l'est pas, et l'enregistrement suivant la garde pourtant. Les
     deux premieres sont toujours la, le reste suit le bouton.

     Appelee a chaque changement de selection, et pas seulement au premier
     rendu : l'edition d'une tasse ancienne coche des gouts APRES la
     construction des pastilles. */
  function majFamillesVisibles() {
    const zone = $("#f-descripteurs");
    if (!zone) return;
    const tout = toutesFamilles();
    let caches = 0;
    $$("#f-descripteurs .tags-groupe").forEach((g, i) => {
      const coche = !!g.querySelector(".tag.actif");
      const visible = tout || coche || i < FAMILLES_VISIBLES;
      g.hidden = !visible;
      if (!visible) caches++;
    });
    const b = $("#gouts-plus");
    if (!b) return;
    b.hidden = !tout && caches === 0;
    b.textContent = tout ? I18N.t("gouts_moins") : I18N.t("gouts_plus", { n: caches });
    b.setAttribute("aria-expanded", tout ? "true" : "false");
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

  /* LES BOUTONS HAUT ET BAS des champs nombre (v8.35). Chrome masque ses
     propres fleches sous une certaine largeur : la Temperature, 66 px, n'en
     avait pas. stepUp/stepDown font le travail, y compris les bornes min et max
     du champ ; on rejoue ensuite son evenement input, que le reste du
     formulaire ecoute pour la ligne live, le brouillon et les avertissements.

     Maintenir le bouton repete, comme une vraie fleche de systeme : 400 ms
     avant le premier repeat, puis un pas toutes les 90 ms. Sans ca, passer de
     92 a 100 demande huit clics. */
  function brancherPas() {
    let minuteur = null, repete = null;
    const arreter = () => { clearTimeout(minuteur); clearInterval(repete); minuteur = repete = null; };
    $$("[data-pas]").forEach(b => {
      const champ = $("#" + b.dataset.pasChamp);
      if (!champ) return;
      const pas = () => {
        if (champ.value === "") champ.value = champ.min || 0;
        else if (Number(b.dataset.pas) > 0) champ.stepUp();
        else champ.stepDown();
        champ.dispatchEvent(new Event("input", { bubbles: true }));
      };
      b.addEventListener("pointerdown", ev => {
        // Bouton gauche seulement : un clic droit ouvre le menu, il ne compte pas.
        if (ev.button !== 0) return;
        ev.preventDefault();
        pas();
        minuteur = setTimeout(() => { repete = setInterval(pas, 90); }, 400);
      });
      ["pointerup", "pointerleave", "pointercancel"].forEach(e => b.addEventListener(e, arreter));
    });
    window.addEventListener("blur", arreter);
  }

  function brancherCurseurs() {
    COUPLES_CURSEUR.forEach(c => {
      const curseur = $("#" + c.curseur), champ = $("#" + c.champ);
      if (!curseur || !champ) return;
      curseur.addEventListener("input", () => {
        peindreCurseur(curseur);
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
      if (v === null || v === "" || isNaN(Number(v))) { peindreCurseur(curseur); return; }
      if (String(curseur.value) !== String(v)) curseur.value = v;
      peindreCurseur(curseur);
    });
    peindreCurseur($("#f-note"));
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
    // Sans pouce : le curseur ne doit suggérer aucune note.
    $("#f-note").value = 5;
    marquerNote($("#f-note"), true);
    majAffichageNote();
    ecrireDuree("f-total", "");
    ecrireDuree("f-ecoulement", "");
    $("#f-volume").value = "";
    $("#f-eau").value = "";
    $("#f-temp").value = "";
    ecrireDuree("f-chauffe", "");
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
    majFamillesVisibles();
    $("#diagnostic-correction").textContent = "";
    UI.chronoRaz();
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
    ecrireDuree("f-chauffe", ext.chauffe_s === undefined ? "" : ext.chauffe_s);
    majTempHint();
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
    marquerNote($("#f-note"), ext.note_sur_10 === "");
    majAffichageNote();
    $("#f-commentaire").value = ext.commentaire;
    saisie.diagnostics = new Set((ext.diagnostic || "").split("|").filter(Boolean));
    $$("#f-diagnostic .pilule").forEach(x => x.classList.toggle("actif", saisie.diagnostics.has(x.dataset.diag)));
    majCorrectionDiagnostic();
    saisie.descripteurs = new Set((ext.descripteurs || "").split("|").filter(Boolean));
    $$("#f-descripteurs .tag").forEach(x => x.classList.toggle("actif", saisie.descripteurs.has(x.dataset.tag)));
    /* Une famille qui vient de recevoir un gout coche doit reapparaitre. */
    majFamillesVisibles();
    $("#saisie-titre").textContent = duplication ? I18N.t("s_dupliquee") : I18N.t("s_modifier");
    $("#btn-enregistrer").textContent = duplication ? I18N.t("s_enregistrer") : I18N.t("s_enregistrer_modif");
    $("#btn-annuler-edition").hidden = duplication;
    majAvertissements();
    majLive();
    // Le second argument dit à l'écran Saisie que cette bascule EST l'ouverture
    // d'une édition, et qu'il ne doit donc pas l'abandonner en arrivant.
    activerEcran("saisie", true);
  }

  /* REFAIRE UNE TASSE, c'est reprendre ses RÉGLAGES, pas son résultat (v8.41).
     La duplication recopiait aussi la note, les goûts, les diagnostics, le
     commentaire et les temps mesurés : une tasse pas encore brassée arrivait
     avec le 7 de la veille, exactement la note inventée que « pas encore
     notée » existe pour empêcher. Sert au bouton Dupliquer de l'historique et
     au raccourci « Refaire ma dernière tasse » de l'icône. */
  function reglagesSeuls(ext) {
    return {
      ...ext, note_sur_10: "", commentaire: "", diagnostic: "", descripteurs: "", ratee: "",
      temps_total_s: "", temps_ecoulement_s: "", volume_extrait_ml: "",
    };
  }
  function refaireTasse(ext) {
    chargerExtractionDansSaisie(reglagesSeuls(ext), true);
  }
  /* La plus récente par date, pas la dernière du tableau : une tasse ajoutée
     après coup avec une date passée arrive en fin de liste. */
  function refaireDerniere() {
    const derniere = DATA.state.extractions.reduce(
      (a, e) => (!a || String(e.date_heure) > String(a.date_heure) ? e : a), null);
    if (!derniere) { activerEcran("saisie"); return false; }
    refaireTasse(derniere);
    return true;
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
      // Brikka : ni température ni temps de chauffe, l'eau chauffe dans la chaudière.
      temperature_c: saisie.methode === "Switch" ? $("#f-temp").value : "",
      chauffe_s: saisie.methode === "Switch" ? lireDuree("f-chauffe") : "",
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
      UI.effacerBrouillon();
      toast(I18N.t("t_modifiee"));
      reinitialiserSaisie();
      activerEcran("historique");
    } else {
      await DATA.ajouterExtraction(ext);
      UI.effacerBrouillon();
      toast(I18N.t("t_enregistree"));
      reinitialiserSaisie(true);
      activerEcran("tableau");
    }
  }

  /* Câblage des contrôles de l'écran. Appelé une fois par app.js, au démarrage.
     Chaque écran câble ce qui lui appartient : le formulaire, le chrono, les
     options et l'éditeur de tasses vivent ici, et une fonction de câblage de
     quatre cents lignes dans app.js n'existe plus. */

  function cablerSaisie() {
    brancherDictee($("#f-dicter"), $("#f-commentaire"), $("#f-dicter-texte"));
    $$(".btn-methode").forEach(b => b.addEventListener("click", () => {
      choisirMethode(b.dataset.methode);
      prefillDepuisRecette($("#f-recette").value);
    }));
    $("#f-cafe").addEventListener("change", surChoixCafe);
    /* Dès que Chris touche la date, elle est SIENNE : l'arrivée sur l'écran ne
       la remplacera plus. Il note parfois une tasse d'hier soir. "input" autant
       que "change" : sur un champ datetime-local, chaque partie modifiée émet
       "input", et "change" n'arrive qu'à la validation. */
    ["input", "change"].forEach(ev => $("#f-date").addEventListener(ev, marquerDateTouchee));
    $("#f-date").addEventListener("change", majAgePaquet);
    $("#f-recette").addEventListener("change", () => { prefillDepuisRecette($("#f-recette").value); majAvertissements(); });
    ["f-temp", "f-puissance"].forEach(id => $("#" + id).addEventListener("input", majJumelles));
    ["f-dose", "f-eau", "f-mouture", "f-volume"].forEach(id =>
      $("#" + id).addEventListener("input", () => { majLive(); majAvertissements(); }));
    // majAvertissements redessine le panneau latéral, le chrono a besoin d'un
    // rappel explicite : ses paliers sont mis à l'échelle de l'eau saisie.
    $("#f-eau").addEventListener("input", () => UI.majEtapesChrono(false));
    // Le volume extrait pilote le préremplissage du lait, il doit le rafraîchir.
    $("#f-volume").addEventListener("input", majLait);
    ["f-chauffe-min", "f-chauffe-sec"].forEach(id => $("#" + id).addEventListener("input", surChauffe));
    $("#f-prechauffe").addEventListener("change", surPrechauffe);
    // Une saisie manuelle du degré a toujours le dernier mot ; l'aide suit.
    $("#f-temp").addEventListener("input", majTempHint);
    brancherNote($("#f-note"), majAffichageNote);
    $("#f-note-effacer").addEventListener("click", () => {
      $("#f-note").value = 5;
      marquerNote($("#f-note"), true);
      majAffichageNote();
      UI.planifierBrouillon();
      $("#f-note").focus();
    });
    $("#chrono-basculer").addEventListener("click", () => UI.basculerChrono());
    /* Demarrer OUVRE le chrono : on vient de lancer une extraction, les paliers
       et le bouton d'arret doivent etre sous la main sans un clic de plus. */
    $("#btn-chrono").addEventListener("click", () => { UI.basculerChrono(true); });
    $("#btn-chrono").addEventListener("click", UI.chronoPrincipal);
    $("#btn-chrono-stop").addEventListener("click", UI.chronoArreter);
    $("#btn-chrono-raz").addEventListener("click", UI.chronoRaz);
    // UNE SEULE FOIS : les conteneurs survivent aux reconstructions de pilules,
    // les attacher depuis construirePilules empilerait un jeu par bascule de langue.
    brancherPilules();
    brancherCurseurs();
    brancherPas();
    activerAppuiLong($("#f-diagnostic"));
    activerAppuiLong($("#f-descripteurs"));
    $("#gouts-plus").addEventListener("click", () => basculerFamilles());
    $("#chrono-bip").addEventListener("change", () => {
      try { localStorage.setItem("bips", $("#chrono-bip").checked ? "1" : "0"); } catch (e) { /* tant pis */ }
    });
    $("#form-saisie").addEventListener("submit", enregistrerSaisie);
    $("#form-saisie").addEventListener("input", UI.planifierBrouillon);
    $("#form-saisie").addEventListener("change", UI.planifierBrouillon);
    // visibilitychange est le dernier evenement fiable avant qu'un navigateur
    // mobile decharge la page : on ecrit tout de suite, sans attendre le debounce.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") UI.ecrireBrouillon();
    });
    $("#btn-annuler-edition").addEventListener("click", () => { reinitialiserSaisie(); activerEcran("historique"); });
    $("#btn-gerer-cafes").addEventListener("click", () => UI.ouvrirModaleCafes());
    $("#volume-estime").addEventListener("click", () => {
      const v = $("#volume-estime").dataset.valeur;
      if (v !== undefined) { $("#f-volume").value = v; majLive(); }
    });

    // Ajout d'eau, agitation, lait, tasse
    $("#f-ajout-eau-oui").addEventListener("change", () => {
      $("#f-eau-ajoutee").hidden = !$("#f-ajout-eau-oui").checked;
      majLive();
    });
    $("#f-eau-ajoutee").addEventListener("input", majLive);
    $("#f-agitation-oui").addEventListener("change", () => {
      $("#ligne-agitation").hidden = !$("#f-agitation-oui").checked;
      if ($("#f-agitation-oui").checked && !$("#f-agitation").value) $("#f-agitation").value = 1;
    });
    $("#f-lait").addEventListener("input", majLive);
    $("#f-tasse").addEventListener("change", () => { majLait(); majLive(); });
    $("#btn-tasses").addEventListener("click", () => {
      const ed = $("#tasses-editeur");
      ed.hidden = !ed.hidden;
      if (!ed.hidden) rendreTassesEditeur();
    });
    $("#tasse-ajouter").addEventListener("click", async () => {
      const nom = $("#tasse-nom").value.trim();
      const ml = parseFloat($("#tasse-ml").value);
      if (!nom || !(ml > 0)) { toast(I18N.t("t_tasse_invalide")); return; }
      await DATA.ajouterTasse(nom, ml);
      $("#tasse-nom").value = "";
      $("#tasse-ml").value = "";
      rendreTassesEditeur();
      remplirSelectTasses();
      $("#f-tasse").value = nom;
      majLait();
      majLive();
    });
  }

  // Mis à disposition des autres écrans.
  Object.assign(UI, {
    basculerFamilles, brancherCurseurs, brancherPilules, cablerSaisie, cafeCourantMoulu,
    cafesSelectionnables, chargerExtractionDansSaisie, choisirMethode, construirePilules,
    DIAG_INEGALE, DIAGS_SOUS_EXTRAIT, DIAGS_SUR_EXTRAIT, ecrireDuree, enregistrerSaisie,
    infoDiagnostic, lireDuree, majAffichageNote, refaireDerniere, refaireTasse, majAgePaquet, majAgitationDepuisRecette,
    majAsideSaisie, majAvertissements, majChampPrechauffe, majCorrectionDiagnostic,
    majCurseurs, majFamillesVisibles, majLait, majLive, majTempHint, marquerDateTouchee,
    noteSaisie, prefillDepuisRecette, rafraichirDateSaisie, reinitialiserSaisie,
    remplirSelectCafes, remplirSelectRecettes, remplirSelectTasses, rendreTassesEditeur,
    saisie, surChauffe, surChoixCafe, surPrechauffe, volumeEstime,
  });
})();
