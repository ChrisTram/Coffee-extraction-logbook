/* Écran d'historique : le tableau, ses filtres, son tri, son comparateur.
 *
 * Le tri et les lignes dépliées vivent ici et nulle part ailleurs : ce sont des
 * préférences d'affichage, elles ne se synchronisent pas et ne se rangent pas
 * dans les données. */
"use strict";

(() => {

  // Emprunté au noyau, chargé avant nous.
  const { $, $$, antiRebond, attrTitre, cleLocale, detailRatio, diagsAffiches, estRatee,
    extAnalysables, extAvecCalculs, fmtDateCourte, fmtDateHeure, fmtDecimal, fmtTemps, fmtVND,
    moyenne, supprimerExtractionAvecRetour, toast } = UI;

  // ---------- Historique ----------

  const tri = { colonne: "date_heure", sens: -1 };

  /* Retire les diacritiques pour que "brule" trouve "brûlé" et "cafe" trouve
     "café". Sans ça une recherche en français est inutilisable au clavier. */
  function sansAccents(s) {
    return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  /* Tout ce dans quoi une recherche a du sens : ce que Chris a ÉCRIT, plus ce
     qu'il a choisi. Pas les nombres, on a des filtres dédiés pour ça. */
  function texteCherchable(e) {
    const cafe = DATA.cafeDe(e);
    return sansAccents([
      e.commentaire, e.descripteurs, e.diagnostic, e.recette, e.methode,
      cafe ? cafe.nom : "",
    ].filter(Boolean).join(" ").toLowerCase());
  }

  function filtrerHistorique() {
    const exts = extAvecCalculs();
    const fCafe = $("#h-cafe").value;
    const fMethode = $("#h-methode").value;
    const fDiag = $("#h-diagnostic").value;
    const fNote = parseFloat($("#h-note-min").value);
    const fDu = $("#h-du").value;
    const fAu = $("#h-au").value;
    /* Recherche insensible à la casse ET aux accents : taper "brule" doit trouver
       "brûlé". normalize + suppression des diacritiques, c'est la seule façon
       correcte de le faire en français sans table de correspondance. */
    const q = sansAccents($("#h-recherche").value.trim().toLowerCase());
    /* "" toutes, "ok" les réussies, "ratee" les ratées. Le filtre vit ici et pas
       dans extAnalysables() : l'historique est le journal, il montre tout par
       défaut, et c'est Chris qui demande à ne voir qu'un camp. */
    const fRatee = $("#h-ratee").value;
    return exts.filter(e =>
      (!fRatee || (fRatee === "ratee" ? estRatee(e) : !estRatee(e))) &&
      (!q || texteCherchable(e).includes(q)) &&
      (!fCafe || e.cafe_id === fCafe) &&
      (!fMethode || e.methode === fMethode) &&
      (!fDiag || (e.diagnostic || "").split("|").includes(fDiag)) &&
      (isNaN(fNote) || (e.note_sur_10 !== "" && e.note_sur_10 >= fNote)) &&
      (!fDu || e.date_heure.slice(0, 10) >= fDu) &&
      (!fAu || e.date_heure.slice(0, 10) <= fAu)
    );
  }

  function valeurTri(e, col) {
    if (col === "cafe_nom") return e._c.cafe_nom;
    /* Les colonnes numériques vides doivent finir en BAS quel que soit le sens,
       d'où -1 plutôt que "" : une chaîne vide se comparerait comme du texte et
       remonterait en tête au tri croissant. */
    if (col === "dose_g" || col === "temps_total_s" || col === "temperature_c" || col === "puissance_feu") {
      return e[col] === "" || e[col] === undefined ? -1 : Number(e[col]);
    }
    if (col === "ratio") return e._c.ratio === "" ? -1 : e._c.ratio;
    if (col === "mouture") return e._c.crans === "" ? -1 : e._c.crans;
    if (col === "note_sur_10") return e.note_sur_10 === "" ? -1 : e.note_sur_10;
    return e[col] === "" ? -1 : e[col];
  }

  /* Version différée pour les FILTRES seulement. Les autres appels (suppression,
     tri, retour d'édition) restent immédiats : ils suivent un geste unique, il n'y
     a rien à regrouper. */
  const rendreHistoriqueDifferee = antiRebond(() => rendreHistorique());

  /* L'etat visible du controle segmente, aligne sur le <select> qui fait foi. */
  function majSegmentMethode() {
    const v = $("#h-methode") ? $("#h-methode").value : "";
    $$(".filtre-methode .seg").forEach(b =>
      b.setAttribute("aria-pressed", b.dataset.methode === v ? "true" : "false"));
  }

  /* EN CARTES ou en table : le seuil est celui du reste du site, 1024 px. */
  function enCartes() {
    return typeof matchMedia === "function" && matchMedia("(max-width: 1023px)").matches;
  }

  function rendreHistorique() {
    const liste = filtrerHistorique().sort((a, b) => {
      const va = valeurTri(a, tri.colonne), vb = valeurTri(b, tri.colonne);
      if (va < vb) return -tri.sens;
      if (va > vb) return tri.sens;
      return 0;
    });
    $("#h-compte").textContent = I18N.t("h_compte", {
      n: liste.length, s: liste.length > 1 ? "s" : "", t: DATA.state.extractions.length,
    });
    $("#h-vide").hidden = liste.length > 0;

    /* La surligne dit le TOTAL et depuis quand, pas le filtre : c'est
       l'identite de l'ecran, le filtre a son propre bandeau juste dessous. */
    const toutes = extAvecCalculs();
    const premiere = toutes.length
      ? toutes.reduce((a, e) => (a && a.date_heure < e.date_heure ? a : e)).date_heure : "";
    $("#h-surligne").textContent = toutes.length
      ? I18N.t("h_surligne", { n: toutes.length, s: toutes.length > 1 ? "s" : "",
          d: fmtDateCourte(String(premiere).slice(0, 10)) })
      : "";

    $$("#h-table th .tri").forEach(s => s.textContent = "");
    const th = $('#h-table th[data-tri="' + tri.colonne + '"] .tri');
    if (th) th.textContent = tri.sens > 0 ? "▲" : "▼";

    rendreResume(liste);

    /* GROUPEMENT PAR JOUR, mais seulement quand le tri est par date. Grouper un
       tableau trie par note ferait reapparaitre « Aujourd'hui » a trois endroits
       differents : deux ordres se disputeraient la meme liste. */
    /* Les cartes du telephone. On vide l'autre conteneur : deux rendus vivants
       en meme temps, ce sont deux fois les memes identifiants dans la page. */
    if (enCartes()) {
      $("#h-corps").innerHTML = "";
      $("#h-cartes").innerHTML = rendreCartes(liste);
      majBarreComparaison();
      return;
    }
    $("#h-cartes").innerHTML = "";

    if (tri.colonne !== "date_heure") {
      $("#h-corps").innerHTML = liste.map(e => ligneHistorique(e)).join("");
    } else {
      let jourCourant = null;
      $("#h-corps").innerHTML = liste.map(e => {
        const jour = String(e.date_heure).slice(0, 10);
        let tete = "";
        if (jour !== jourCourant) {
          jourCourant = jour;
          const duJour = liste.filter(x => String(x.date_heure).slice(0, 10) === jour).length;
          /* La date complete n'apparait que quand le titre ne la dit pas.
             « Aujourd'hui » et « Hier » ont besoin qu'on precise quel jour ;
             « dimanche 9 » suivi de « 9 aout 2026 » repetait le quantieme. */
          const nomme = titreDeJour(jour);
          const dateDite = nomme === I18N.t("h_aujourdhui") || nomme === I18N.t("h_hier");
          tete = '<tr class="ligne-jour"><td colspan="10">' +
            '<span class="jour-titre">' + nomme + "</span>" +
            '<span class="jour-detail">' +
            (dateDite ? fmtDateCourte(jour) + " · " : "") +
            I18N.t("h_jour_tasses", { n: duJour, s: duJour > 1 ? "s" : "" }) + "</span></td></tr>";
        }
        return tete + ligneHistorique(e);
      }).join("");
    }
    majBarreComparaison();
  }

  /* LES CARTES, groupees par jour comme la table. Les intertitres sont les
     memes, la regle aussi : on ne groupe que si le tri est par date, sinon deux
     ordres se disputent la meme liste. */
  function rendreCartes(liste) {
    if (tri.colonne !== "date_heure") return liste.map(carteExtraction).join("");
    let jour = null;
    return liste.map(e => {
      const j = String(e.date_heure).slice(0, 10);
      let tete = "";
      if (j !== jour) {
        jour = j;
        const n = liste.filter(x => String(x.date_heure).slice(0, 10) === j).length;
        const nomme = titreDeJour(j);
        const dateDite = nomme === I18N.t("h_aujourdhui") || nomme === I18N.t("h_hier");
        tete = '<h3 class="h-cartes-jour"><span class="jour-titre">' + nomme + "</span>" +
          '<span class="jour-detail">' + (dateDite ? fmtDateCourte(j) + " · " : "") +
          I18N.t("h_jour_tasses", { n, s: n > 1 ? "s" : "" }) + "</span></h3>";
      }
      return tete + carteExtraction(e);
    }).join("");
  }

  /* « Aujourd'hui », « Hier », puis le jour de la semaine. Un nom vaut mieux
     qu'une date quand la date est recente : on sait tout de suite si c'est la
     tasse de ce matin. */
  function titreDeJour(jour) {
    if (jour === cleLocale(new Date())) return I18N.t("h_aujourdhui");
    const hier = new Date();
    hier.setDate(hier.getDate() - 1);
    if (jour === cleLocale(hier)) return I18N.t("h_hier");
    return new Date(jour + "T12:00").toLocaleDateString(I18N.locale(),
      { weekday: "long", day: "numeric" });
  }

  /* LE BANDEAU RESUME : ce que le filtre courant raconte.

     Le compte seul disait « 12 sur 62 » sans jamais dire si ces douze etaient
     bonnes, ce qui est la question qu'on se pose en filtrant. Les ratees sont
     comptees a part : ce sont elles qui expliquent une moyenne basse, et la
     moyenne les ecarte pour la meme raison que les analyses le font. */
  function rendreResume(liste) {
    const cible = $("#h-resume");
    if (!liste.length) { cible.innerHTML = ""; cible.hidden = true; return; }
    cible.hidden = false;
    const notees = liste.filter(e => e.note_sur_10 !== "" && !estRatee(e));
    const meilleure = notees.slice().sort((a, b) => b.note_sur_10 - a.note_sur_10)[0];
    const ratees = liste.filter(estRatee).length;
    const bloc = (valeur, libelle, note) =>
      '<div class="resume-item"><span class="resume-valeur">' + valeur + "</span>" +
      '<span class="resume-libelle">' + libelle + "</span>" +
      (note ? '<span class="resume-note">' + note + "</span>" : "") + "</div>";
    cible.innerHTML =
      bloc(liste.length, I18N.t("h_res_tasses")) +
      bloc(notees.length ? fmtDecimal(moyenne(notees.map(e => e.note_sur_10)), 1) : I18N.t("h_res_aucune"),
        I18N.t("h_res_moyenne")) +
      (meilleure
        ? bloc(meilleure.note_sur_10, I18N.t("h_res_meilleure"),
            I18N.tr(meilleure._c.cafe_nom) + " · " + meilleure.methode)
        : bloc(I18N.t("h_res_aucune"), I18N.t("h_res_meilleure"))) +
      bloc(ratees, I18N.t("h_res_ratees"));
  }

  /* Le COMMENTAIRE dans la ligne, tronque. Il n'etait visible qu'en depliant,
     alors que c'est le seul champ qui dit POURQUOI une tasse etait bonne. La
     ligne porte deja une bulle avec le texte entier au survol. */
  /* Le commentaire sur sa PROPRE ligne, en pleine largeur. Mesure faite, les dix
     colonnes demandent 1741 px pour 992 disponibles : lui reserver une colonne
     revenait a lui donner trois mots. Ici il a toute la table, il n'est plus
     tronque du tout, et les colonnes chiffrees restent lisibles.

     Elle porte le meme data-id que sa ligne : cliquer dessus ouvre la meme
     extraction, sinon la moitie de la surface d'une tasse ne repond pas. */
  function commentaireHistorique(e) {
    const c = String(e.commentaire || "").trim();
    if (!c) return "";
    return '<tr class="ligne-commentaire" data-id="' + e.id + '"><td colspan="10">' +
      attrTitre(c) + "</td></tr>";
  }

  /* Les gouts de la ligne, trois au plus puis « +n », comme sur la carte des
     cinq dernieres : deux vues du meme objet doivent dire la meme chose. */
  const MAX_GOUTS_HISTO = 3;
  function goutsHistorique(e) {
    const tags = String(e.descripteurs || "").split("|").filter(Boolean);
    if (!tags.length) return "";
    const vus = tags.slice(0, MAX_GOUTS_HISTO).map(t => '<span class="derniere-tag">' + I18N.tag(t) + "</span>");
    const reste = tags.length - vus.length;
    return '<span class="h-gouts">' + vus.join("") +
      (reste > 0 ? '<span class="derniere-tag derniere-tag-plus">+' + reste + "</span>" : "") + "</span>";
  }

  /* Détail dépliable : le carnet stocke 22 champs par extraction et le tableau
     en montre 12. Le reste (commentaire, descripteurs, écoulement, tasse,
     volume, lait, agitation, coût) disparaissait à l'enregistrement. Le détail se
     rend dans une ligne en colspan, donc sans toucher aux largeurs de colonnes
     qui viennent d'être figées. */
  const detailsOuverts = new Set();
  const comparaison = new Set();

  /* Le detail, dans une ligne en colspan sous sa tasse. Son CONTENU vit dans
     detailContenu() : la carte du telephone le reutilise tel quel, dans un div. */
  function ligneDetail(e) {
    return '<tr class="ligne-detail" data-detail="' + e.id + '"><td colspan="10">' +
      detailContenu(e) + "</td></tr>";
  }

  /* Le CONTENU du detail, sans son enveloppe : la ligne le pose dans un <tr> en
     colspan, la carte du telephone dans un simple <div>. Deux enveloppes, un
     seul contenu, donc jamais deux versions du detail qui divergent. */
  function detailContenu(e) {
    const item = (cle, valeur) => valeur === "" || valeur === undefined || valeur === null
      ? "" : '<div class="detail-item"><span>' + I18N.t(cle) + "</span><b>" + valeur + "</b></div>";
    const cases = [
      item("d_temps", e.temps_total_s !== "" ? fmtTemps(e.temps_total_s) : ""),
      item("d_ecoulement", e.temps_ecoulement_s !== "" ? fmtTemps(e.temps_ecoulement_s) : ""),
      item("d_temp", e.temperature_c !== "" && e.temperature_c !== undefined ? e.temperature_c + " °C" : ""),
      item("d_feu", e.methode === "Brikka" && e.puissance_feu !== "" && e.puissance_feu !== undefined
        ? e.puissance_feu : ""),
      item("d_chauffe", e.chauffe_s !== "" && e.chauffe_s !== undefined ? fmtTemps(e.chauffe_s) : ""),
      item("d_volume", e.volume_extrait_ml !== "" ? e.volume_extrait_ml + " ml" : ""),
      item("d_eau_ajoutee", e.eau_ajoutee_ml !== "" ? e.eau_ajoutee_ml + " ml" : ""),
      item("d_lait", e.lait_ml !== "" ? e.lait_ml + " ml" : ""),
      item("d_agitation", e.agitation_nb !== "" ? e.agitation_nb : ""),
      item("d_tasse", e.tasse),
      item("d_prechauffee", Number(e.eau_prechauffee) === 1 ? I18N.t("oui") : ""),
      item("d_boisson", e._c.volume_boisson_ml !== "" ? e._c.volume_boisson_ml + " ml" : ""),
      item("d_cout", e._c.cout_tasse_vnd !== "" ? fmtVND(e._c.cout_tasse_vnd) : ""),
    ].filter(Boolean).join("");
    const tags = (e.descripteurs || "").split("|").filter(Boolean)
      .map(t => '<span class="detail-tag">' + I18N.tag(t) + "</span>").join("");
    return (cases ? '<div class="detail-grille">' + cases + "</div>" : "") +
      (tags ? '<div class="detail-tags">' + tags + "</div>" : "") +
      (e.commentaire ? '<p class="detail-commentaire">' + e.commentaire + "</p>" : "") +
      (cases || tags || e.commentaire ? "" : '<p class="detail-vide">' + I18N.t("d_rien") + "</p>");
  }

  function ligneHistorique(e) {
    const ouvert = detailsOuverts.has(e.id);
    const compare = comparaison.has(e.id);
    return '<tr data-id="' + e.id + '" class="ligne-histo' + (ouvert ? " ouverte" : "") +
      (compare ? " comparee" : "") + '">' +
      '<td><button type="button" class="btn-deplier" data-action="deplier" aria-expanded="' + ouvert +
      '" title="' + attrTitre(I18N.t("h_detail")) + '">' + (ouvert ? "▾" : "▸") + "</button> " +
      fmtDateHeure(e.date_heure) + "</td>" +
      '<td title="' + attrTitre(I18N.tr(e._c.cafe_nom)) + '">' + I18N.tr(e._c.cafe_nom) + "</td>" +
      '<td><span class="chip-methode ' + e.methode.toLowerCase() + '">' + e.methode + "</span></td>" +
      '<td title="' + attrTitre(e.recette) + '">' + (e.recette || "") + "</td>" +
      /* Dose et eau ensemble, comme sur la carte des cinq dernières : ce sont
         deux moitiés d'un même geste, et les séparer en deux colonnes aurait
         coûté de la largeur sans rien apprendre. */
      "<td>" + (e.dose_g !== "" && e.eau_g !== "" ? e.dose_g + " → " + e.eau_g + " <small>g</small>" : "") + "</td>" +
      "<td>" + (e.mouture_dial ? e.mouture_dial + " <small>(" + e._c.microns + " µm)</small>" : e._c.moulu ? "<small>" + I18N.t("paquet") + "</small>" : "") + "</td>" +
      '<td title="' + attrTitre(detailRatio(e._c.ratioBase, e.dose_g, e.eau_g)) + '">' +
      e._c.ratioTexte +
      (e._c.ratioTasseTexte ? ' <small>(' + I18N.t("rt_tasse_court") + " " + e._c.ratioTasseTexte + ")</small>" : "") +
      (e._c.ratioBoisson ? ' <small>(' + I18N.t("rt_boisson_court") + " " + e._c.ratioBoisson + ")</small>" : "") + "</td>" +
      '<td class="note-cellule">' + (estRatee(e)
        ? '<span class="badge-ratee" title="' + attrTitre(I18N.t("rt_badge_titre")) + '">' + I18N.t("rt_badge") + "</span>"
        : "") + (e.note_sur_10 !== "" ? e.note_sur_10 : "") + "</td>" +
      /* GOUTS ET DIAGNOSTIC dans la meme cellule, pas dans deux colonnes : une
         colonne de plus demande quatre retouches coordonnees (voir DECISIONS,
         « Le piege des largeurs figees ») et se decale en silence si on en
         oublie une. */
      '<td class="chip-diagnostic"' + (e.commentaire ? ' data-info="' + attrTitre(e.commentaire) + '"' : "") + ">" +
      (e.diagnostic ? '<span class="h-diag">' + diagsAffiches(e.diagnostic) + "</span>" : "") +
      goutsHistorique(e) + "</td>" +
      "<td>" + actionsExtraction(e) + "</td></tr>" +
      commentaireHistorique(e) + (ouvert ? ligneDetail(e) : "");
  }

  /* LES CINQ ACTIONS, ecrites UNE fois et rendues par la ligne comme par la
     carte. C'est ce qui garantit qu'un geste possible sur ordinateur l'est aussi
     sur telephone : deux listes separees divergent au premier ajout. Le clic est
     delegue sur data-action, donc rien d'autre n'a besoin de le savoir. */
  function actionsExtraction(e) {
    const compare = comparaison.has(e.id);
    return '<div class="actions-ligne">' +
      '<button class="btn-ligne' + (compare ? " actif" : "") + '" data-action="comparer" title="' +
      attrTitre(I18N.t("h_comparer")) + '">⇄</button>' +
      /* La bascule ratée, en PREMIER des actions d'écriture : c'est celle qui se
         clique le plus souvent après coup, et son état est visible sans survol. */
      '<button class="btn-ligne' + (estRatee(e) ? " actif-ratee" : "") + '" data-action="ratee" aria-pressed="' +
      estRatee(e) + '" title="' + attrTitre(I18N.t(estRatee(e) ? "h_derater" : "h_rater")) + '">⚠</button>' +
      '<button class="btn-ligne" data-action="dupliquer" title="Dupliquer pour refaire la même">⧉</button>' +
      '<button class="btn-ligne" data-action="modifier" title="Modifier">✎</button>' +
      '<button class="btn-ligne danger" data-action="supprimer" title="Supprimer">🗑</button>' +
      "</div>";
  }

  /* UNE TASSE EN CARTE, pour le telephone. Mêmes informations que la ligne, mais
     empilees : heure, machine, cafe, recette, dose et eau, ratio, note, gouts et
     diagnostic, commentaire, et les cinq mêmes actions. */
  function carteExtraction(e) {
    const ouvert = detailsOuverts.has(e.id);
    const chiffres = [];
    if (e.dose_g !== "" && e.eau_g !== "") chiffres.push(e.dose_g + " → " + e.eau_g + " g");
    if (e._c.ratioTexte) chiffres.push(e._c.ratioTexte);
    if (e.mouture_dial) chiffres.push(I18N.t("molette") + " " + e.mouture_dial);
    return '<article class="h-carte' + (ouvert ? " ouverte" : "") +
      (comparaison.has(e.id) ? " comparee" : "") + (estRatee(e) ? " ratee" : "") +
      '" data-id="' + e.id + '">' +
      '<div class="h-carte-tete">' +
        '<span class="h-carte-heure">' + fmtDateHeure(e.date_heure).replace(/^.*\s/, "") + "</span>" +
        '<span class="chip-methode ' + e.methode.toLowerCase() + '">' + e.methode + "</span>" +
        '<span class="h-carte-note">' + (e.note_sur_10 !== "" ? e.note_sur_10 : "") + "</span>" +
      "</div>" +
      '<p class="h-carte-cafe">' + I18N.tr(e._c.cafe_nom) +
        (estRatee(e) ? '<span class="mention-ratee">' + I18N.t("rt_badge") + "</span>" : "") + "</p>" +
      (e.recette ? '<p class="h-carte-recette">' + I18N.tr(e.recette) + "</p>" : "") +
      (chiffres.length ? '<p class="h-carte-chiffres">' + chiffres.join(" · ") + "</p>" : "") +
      ((e.diagnostic || e.descripteurs)
        ? '<p class="h-carte-gouts">' +
          (e.diagnostic ? '<span class="h-diag">' + diagsAffiches(e.diagnostic) + "</span>" : "") +
          goutsHistorique(e) + "</p>"
        : "") +
      (e.commentaire ? '<p class="h-carte-commentaire">' + attrTitre(e.commentaire) + "</p>" : "") +
      '<div class="h-carte-pied">' +
        '<button type="button" class="btn-deplier" data-action="deplier" aria-expanded="' + ouvert +
        '" title="' + attrTitre(I18N.t("h_detail")) + '">' + (ouvert ? "▾" : "▸") + "</button>" +
        actionsExtraction(e) +
      "</div>" +
      (ouvert ? '<div class="h-carte-detail">' + detailContenu(e) + "</div>" : "") +
      "</article>";
  }

  /* Comparateur : deux extractions côte à côte, différences surlignées. C'est le
     test croisé en version manuelle, celui que le guide recommande (même café
     dans les deux machines le même jour) et qui n'existait pas.

     La sélection passe par un bouton de la colonne Actions et PAS par une colonne
     de cases à cocher : le tableau vient d'être figé à neuf colonnes, en ajouter
     une casserait les largeurs. */
  function basculerComparaison(id) {
    if (comparaison.has(id)) comparaison.delete(id);
    else {
      // Au delà de deux, la plus ancienne sélection cède sa place : plus simple
      // que de refuser le clic, et ça permet d'enchaîner les comparaisons.
      if (comparaison.size >= 2) comparaison.delete([...comparaison][0]);
      comparaison.add(id);
    }
    rendreHistorique();
    if (comparaison.size === 2) ouvrirComparaison();
  }

  function majBarreComparaison() {
    const barre = $("#barre-comparaison");
    if (!barre) return;
    barre.hidden = comparaison.size === 0;
    $("#comparaison-compte").textContent = I18N.t(
      comparaison.size === 1 ? "cmp_une" : "cmp_deux", { n: comparaison.size });
    $("#comparaison-ouvrir").disabled = comparaison.size !== 2;
  }

  // Lignes du tableau de comparaison. Chaque entrée sait lire sa valeur affichable.
  function champsComparaison() {
    return [
      { cle: "d_cafe", lire: e => I18N.tr(e._c.cafe_nom) },
      { cle: "d_methode", lire: e => e.methode },
      { cle: "d_recette", lire: e => e.recette },
      { cle: "d_dose", lire: e => e.dose_g !== "" ? e.dose_g + " g" : "" },
      { cle: "d_eau", lire: e => e.eau_g !== "" ? e.eau_g + " g" : "" },
      { cle: "d_ratio", lire: e => e._c.ratioTexte },
      { cle: "d_ouvert", lire: e => e._c.jours_ouvert === "" ? "" : e._c.jours_ouvert },
      { cle: "d_mouture", lire: e => e.mouture_dial || (e._c.moulu ? I18N.t("paquet") : "") },
      { cle: "d_temp", lire: e => e.temperature_c !== "" ? e.temperature_c + " °C" : "" },
      { cle: "d_puissance", lire: e => e.puissance_feu !== "" ? e.puissance_feu + " / 10" : "" },
      { cle: "d_prechauffee", lire: e => Number(e.eau_prechauffee) === 1 ? I18N.t("oui") : I18N.t("non") },
      { cle: "d_total", lire: e => e.temps_total_s !== "" ? fmtTemps(e.temps_total_s) : "" },
      { cle: "d_ecoulement", lire: e => e.temps_ecoulement_s !== "" ? fmtTemps(e.temps_ecoulement_s) : "" },
      { cle: "d_volume", lire: e => e.volume_extrait_ml !== "" ? e.volume_extrait_ml + " ml" : "" },
      { cle: "d_tasse", lire: e => e.tasse },
      { cle: "d_note", lire: e => e.note_sur_10 !== "" ? e.note_sur_10 + " / 10" : "" },
      { cle: "d_diagnostic", lire: e => e.diagnostic ? diagsAffiches(e.diagnostic) : "" },
      { cle: "d_descripteurs", lire: e => (e.descripteurs || "").split("|").filter(Boolean).map(t => I18N.tag(t)).join(", ") },
      { cle: "d_commentaire", lire: e => e.commentaire },
    ];
  }

  function ouvrirComparaison() {
    const ids = [...comparaison];
    const exts = extAvecCalculs().filter(e => ids.includes(e.id))
      .sort((x, y) => String(x.date_heure).localeCompare(String(y.date_heure)));
    if (exts.length !== 2) return;
    const [a, b] = exts;

    $("#comparaison-titres").innerHTML = "<th></th><th>" + fmtDateHeure(a.date_heure) +
      "</th><th>" + fmtDateHeure(b.date_heure) + "</th>";
    $("#comparaison-corps").innerHTML = champsComparaison().map(c => {
      const va = String(c.lire(a) || ""), vb = String(c.lire(b) || "");
      if (!va && !vb) return "";
      // Surligner UNIQUEMENT ce qui diffère : c'est là que se trouve l'explication
      // de l'écart de note, le reste est du bruit visuel.
      const differe = va !== vb;
      return '<tr' + (differe ? ' class="differe"' : "") + "><th>" + I18N.t(c.cle) + "</th>" +
        "<td>" + va + "</td><td>" + vb + "</td></tr>";
    }).join("");

    const ecart = a.note_sur_10 !== "" && b.note_sur_10 !== ""
      ? I18N.t("cmp_ecart", { x: fmtDecimal(Math.abs(a.note_sur_10 - b.note_sur_10), 1) })
      : I18N.t("cmp_sans_note");
    $("#comparaison-resume").textContent = ecart;
    $("#modale-comparaison").showModal();
  }

  /* ---------- Mes meilleurs réglages ----------
     Le calcul vit dans js/reglages.js, sans DOM, pour être testable sans
     navigateur. Ici, uniquement l'affichage. */
  function carteReglage(bilan) {
    const c = bilan.cafe;
    const entete = '<div class="reglage-entete"><b>' + c.nom + "</b>" +
      (c.actif === 0 ? ' <span class="cafe-meta">' + I18N.t("li_inactif") + "</span>" : "") +
      (bilan.moyenne !== null
        ? '<span class="reglage-moyenne">' + I18N.t("rg_moyenne", { m: fmtDecimal(bilan.moyenne, 1), n: bilan.total }) + "</span>"
        : "") + "</div>";

    if (!bilan.meilleure) {
      const cle = bilan.raison === "aucune" ? "rg_aucune"
        : bilan.raison === "pas_assez" ? "rg_pas_assez" : "rg_eparpille";
      return '<article class="carte reglage' + (c.actif === 0 ? " inactif" : "") + '">' + entete +
        '<p class="carte-vide">' + I18N.t(cle, { n: bilan.manque, s: REGLAGES.MIN_TASSES }) + "</p></article>";
    }

    const m = bilan.meilleure;
    // Écart entre la combinaison gagnante et la moyenne du café : c'est lui qui
    // dit si le réglage vaut vraiment le coup ou si tout se vaut.
    const ecart = m.moyenne - bilan.moyenne;
    const chips = [
      m.recette ? '<span class="reglage-chip">' + I18N.tr(m.recette) + "</span>" : "",
      m.mouture ? '<span class="reglage-chip">' + I18N.t("molette") + " " + m.mouture + "</span>"
        : '<span class="reglage-chip">' + I18N.t("paquet") + "</span>",
      m.puissance ? '<span class="reglage-chip">' + I18N.t("rg_feu", { f: m.puissance }) + "</span>" : "",
      m.prechauffe ? '<span class="reglage-chip">' + I18N.t("d_prechauffee") + "</span>" : "",
    ].filter(Boolean).join("");

    return '<article class="carte reglage' + (c.actif === 0 ? " inactif" : "") + '">' + entete +
      '<div class="reglage-note"><b>' + fmtDecimal(m.moyenne, 1) + "</b><small> / 10</small>" +
      '<span>' + I18N.t("rg_sur", { n: m.n }) +
      (Math.abs(ecart) >= 0.2 ? ", " + I18N.t(ecart > 0 ? "rg_mieux" : "rg_moins",
        { x: fmtDecimal(Math.abs(ecart), 1) }) : "") + "</span></div>" +
      '<div class="reglage-chips">' + chips + "</div>" +
      '<button type="button" class="btn btn-petit" data-refaire="' + m.referenceId + '">' +
      I18N.t("rg_refaire") + "</button></article>";
  }

  function rendreReglages() {
    /* Un conseil, donc le jeu analysable : une tasse ratée décrit un geste
       manqué et ferait condamner un réglage correct. */
    const exts = extAnalysables();
    const bilans = REGLAGES.tous(DATA.state.cafes, exts);
    $("#reglages-liste").innerHTML = bilans.length
      ? bilans.map(carteReglage).join("")
      : '<p class="carte-vide">' + I18N.t("rg_sans_cafe") + "</p>";
    $$("[data-refaire]").forEach(b => b.addEventListener("click", () => {
      const ext = DATA.state.extractions.find(e => e.id === b.dataset.refaire);
      if (!ext) return;
      UI.chargerExtractionDansSaisie(ext, true);
      toast(I18N.t("rg_preremplie"));
    }));
  }

  function remplirFiltres() {
    const selCafe = $("#h-cafe");
    const v = selCafe.value;
    selCafe.innerHTML = '<option value="">' + I18N.t("tous") + "</option>" +
      DATA.state.cafes.map(c => '<option value="' + c.id + '">' + c.nom + "</option>").join("");
    selCafe.value = v;
    const selDiag = $("#h-diagnostic");
    const vd = selDiag.value;
    selDiag.innerHTML = '<option value="">' + I18N.t("tous") + "</option>" +
      DIAGNOSTICS.map(d => '<option value="' + d + '">' + I18N.diag(d) + "</option>").join("");
    selDiag.value = vd;
  }

  // Mis à disposition des autres écrans.
  /* Câblage des contrôles de l'historique. Appelé une fois par app.js. */
  const FILTRES = ["h-recherche", "h-cafe", "h-methode", "h-diagnostic", "h-note-min", "h-du", "h-au", "h-ratee"];

  function cablerHistorique() {
    FILTRES.forEach(id => $("#" + id).addEventListener("input", rendreHistoriqueDifferee));
    $("#h-reinitialiser").addEventListener("click", () => {
      FILTRES.forEach(id => { $("#" + id).value = ""; });
      rendreHistorique();
    });
    $("#h-exporter").addEventListener("click", () => {
      DATA.exporterExtractions(filtrerHistorique().map(e => { const { _c, ...reste } = e; return reste; }));
      toast(I18N.t("t_export_filtre"));
    });
    $$("#h-table th[data-tri]").forEach(th => th.addEventListener("click", () => {
      if (tri.colonne === th.dataset.tri) tri.sens = -tri.sens;
      else { tri.colonne = th.dataset.tri; tri.sens = -1; }
      rendreHistorique();
    }));
    /* LES DEUX CONTENEURS, table et cartes : le meme gestionnaire sert les deux
       rendus. Attache au seul #h-corps, il laissait les six actions des cartes
       rendues mais mortes. */
    const surClicHistorique = async ev => {
      const btn = ev.target.closest("[data-action]");
      if (!btn) {
        /* Cliquer la LIGNE ouvre l'extraction en édition, comme les cinq
           dernières du tableau de bord. Sans ça, seul le crayon fonctionnait :
           une cible de 24 px pour une ligne qui a l'air cliquable entière. */
        const ligne = ev.target.closest("[data-id]");
        if (!ligne) return;
        /* Une sélection de texte n'est pas un clic. Sans ce test, copier un
           commentaire depuis le détail déplié ouvrirait l'édition. */
        const selection = window.getSelection ? String(window.getSelection()) : "";
        if (selection.trim()) return;
        const extLigne = DATA.state.extractions.find(e => e.id === ligne.dataset.id);
        if (extLigne) UI.chargerExtractionDansSaisie(extLigne, false);
        return;
      }
      const id = btn.closest("[data-id]").dataset.id;
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
        if (detailsOuverts.has(id)) detailsOuverts.delete(id);
        else detailsOuverts.add(id);
        rendreHistorique();
      } else if (btn.dataset.action === "comparer") {
        basculerComparaison(id);
      } else if (btn.dataset.action === "ratee") {
        /* Un clic écrit. Pas de confirmation : le geste est réversible du même
           bouton, et demander confirmation pour une bascule serait plus lourd
           que la bascule elle-même. */
        await DATA.modifierExtraction(id, { ...ext, ratee: Number(ext.ratee) === 1 ? "" : 1 });
        toast(I18N.t(Number(ext.ratee) === 1 ? "t_deratee" : "t_ratee"));
      }
    };
    [$("#h-corps"), $("#h-cartes")].forEach(z => z.addEventListener("click", surClicHistorique));

    /* Le controle segmente de la machine PILOTE le <select>, qui reste la source
       de verite : tout le filtrage, la reinitialisation et l'export lisent lui.
       Deux sources pour un meme filtre, c'est deux etats qui divergent. */
    $$(".filtre-methode .seg").forEach(b => b.addEventListener("click", () => {
      const sel = $("#h-methode");
      sel.value = b.dataset.methode;
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      majSegmentMethode();
    }));
    /* La reinitialisation passe par le select : le segment doit suivre. */
    $("#h-reinitialiser").addEventListener("click", () => setTimeout(majSegmentMethode, 0));
    $("#comparaison-ouvrir").addEventListener("click", ouvrirComparaison);
    $("#comparaison-vider").addEventListener("click", () => { comparaison.clear(); rendreHistorique(); });
  }

  Object.assign(UI, {
    FILTRES, basculerComparaison, cablerHistorique, carteReglage, champsComparaison, comparaison, detailsOuverts,
    filtrerHistorique, ligneDetail, ligneHistorique, majBarreComparaison, ouvrirComparaison,
    actionsExtraction, carteExtraction, commentaireHistorique, detailContenu, enCartes,
    majSegmentMethode,
    rendreCartes,
    goutsHistorique, remplirFiltres, rendreHistorique, rendreHistoriqueDifferee, rendreReglages,
    rendreResume, sansAccents, texteCherchable, titreDeJour, tri, valeurTri,
  });
})();
