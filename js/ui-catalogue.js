/* Les modales de gestion : cafés, sachets, recettes, et l'écran Paramètres.
 *
 * Elles partagent une même règle : chaque modale possède SON état d'édition et ne
 * le publie pas. Le câblage dit "rétablis la recette courante", il ne lit pas
 * l'identifiant pour le repasser à la couche de données. */
"use strict";

(() => {

  // Emprunté au noyau, chargé avant nous.
  const { $, $$, attrTitre, basculerRatees, confirmer, ecrireReplis, extAnalysables, extAvecCalculs,
    fmtDateCourte, fmtDecimal, fmtVND, inclureRatees, maintenantLocal, moyenne, recettesDeMethode,
    replis, toast } = UI;

  // ---------- Gestion des cafés ----------

  let cafeEditId = null;

  function ouvrirModaleCafes() {
    rendreListeCafes();
    $("#form-cafe").hidden = true;
    $("#form-sachet").hidden = true;
    const m = $("#modale-cafes");
    if (!m.open) m.showModal();
  }

  /* Coût d'une tasse de ce café, à la dose donnée. Muet si le prix ou le format
     manquent : un coût inventé serait pire qu'un coût absent.

     Second chiffre pour les cafés NON PURS. Le Sáng Tạo est à 82 % de café, donc
     à 534 ₫ le gramme de vrai café contre 348 pour le G4 : il paraît 26 % plus
     cher au gramme, il l'est de 53 %. Le champ pourcentage_cafe_reel ne servait
     jusqu'ici qu'au calcul de caféine. */
  function coutParTasse(cafe, dose) {
    if (!cafe.prix_vnd || !cafe.format_grammes || !(dose > 0)) return "";
    const parGramme = cafe.prix_vnd / cafe.format_grammes;
    const base = I18N.t("cout_tasse", { v: fmtVND(parGramme * dose), d: fmtDecimal(dose, 1) });
    const pct = cafe.pourcentage_cafe_reel === "" || cafe.pourcentage_cafe_reel === undefined
      ? 100 : Number(cafe.pourcentage_cafe_reel);
    if (!(pct > 0) || pct >= 100) return base;
    return base + " " + I18N.t("cout_reel", { v: fmtVND(parGramme / (pct / 100) * dose) });
  }

  function rendreListeCafes() {
    // Actifs d'abord (ordre d'origine conservé), désactivés toujours en fin
    // de liste. Chaque café porte un badge de note moyenne (sur ses
    // extractions notées) et sa date d'ajout dans le système.
    const ordonnes = [...DATA.state.cafes].sort((a, b) => (a.actif === 0 ? 1 : 0) - (b.actif === 0 ? 1 : 0));
    $("#cafes-liste").innerHTML = ordonnes.map(c => {
      const notes = DATA.state.extractions
        .filter(e => e.cafe_id === c.id && e.note_sur_10 !== "")
        .map(e => Number(e.note_sur_10));
      const badgeNote = notes.length
        ? ' <span class="badge-note" title="' + I18N.t("b_extractions", { n: notes.length }) + '">★ ' +
          fmtDecimal(moyenne(notes), 1) + "</span>"
        : "";
      // Stock du sachet en cours. Une dose manquante compte pour la dose par
      // défaut, sinon un oubli de saisie ferait croire à un sachet intact.
      const stock = DATA.stockSachet(c.id, replis.dose);
      let badgeStock = "";
      // Dose retenue pour le coût, la même que pour les tasses restantes.
      let coutTasse = replis.dose;
      if (stock) {
        /* Le reste se compte avec la dose MOYENNE de ce café, pas la dose de
           repli : Chris dose 16 g sur le G4 et 14 sur un autre, un chiffre unique
           surestimerait les tasses restantes de presque 10 %. Repli sur la dose
           par défaut tant que le café n'a aucune extraction. */
        const doses = DATA.state.extractions
          .filter(e => e.cafe_id === c.id && Number(e.dose_g) > 0)
          .map(e => Number(e.dose_g));
        const doseTypique = doses.length ? moyenne(doses) : replis.dose;
        coutTasse = doseTypique;
        const tasses = Math.max(0, Math.floor(stock.restant / doseTypique));
        const classe = stock.restant <= 0 ? "vide" : tasses <= 3 ? "bas" : "ok";
        const libelle = stock.restant <= 0
          ? I18N.t("stock_vide")
          : I18N.t("stock_reste", { g: fmtDecimal(stock.restant, 0), n: tasses });
        badgeStock = ' <span class="badge-stock badge-stock-' + classe + '" title="' +
          I18N.t("stock_titre", {
            f: stock.format,
            c: fmtDecimal(stock.consomme, 0),
            r: fmtDecimal(Math.max(0, stock.restant), 0),
            d: fmtDecimal(doseTypique, 1),
            src: I18N.t(doses.length ? "stock_dose_moy" : "stock_dose_defaut"),
          }) + '">' + libelle + "</span>";
      }
      return '<div class="cafe-ligne' + (c.actif === 0 ? " inactif" : "") +
      (stock && stock.restant <= 0 ? " epuise" : "") + '">' +
      "<div><b>" + c.nom + "</b>" + badgeNote + badgeStock +
      (Number(c.pourcentage_cafe_reel) < 100 ? ' <span class="badge-nonpur">' + c.pourcentage_cafe_reel + " % " + I18N.t("pct_cafe") + "</span>" : "") +
      ((c.tag || "").includes("référence") ? ' <span class="badge-reference">' + I18N.t("badge_etalon") + "</span>" : "") +
      "<div class=\"cafe-meta\">" +
      [c.torrefacteur, c.espece, c.procede,
        c.machine_recommandee ? I18N.t("li_machine", { m: I18N.machine(c.machine_recommandee) }) : "",
        c.prix_vnd ? fmtVND(c.prix_vnd) + " / " + c.format_grammes + " g" : "",
        /* Coût d'UNE tasse, à la dose moyenne de ce café. C'est le seul chiffre
           de prix qui se compare d'un sachet à l'autre : le prix au sachet dépend
           du format, le prix au gramme ne dit rien tant qu'on ne sait pas combien
           on en met. */
        coutParTasse(c, coutTasse),
        c.date_ajout ? I18N.t("li_ajoute", { d: fmtDateCourte(c.date_ajout) }) : ""].filter(Boolean).join(" · ") +
      "</div></div>" +
      '<span class="cafe-meta">' + (c.actif === 0 ? I18N.t("li_inactif") : "") + "</span>" +
      '<button class="btn btn-petit" data-fiche="' + c.id + '">' + I18N.t("fi_voir") + "</button>" +
      '<button class="btn btn-petit" data-cafe-sachet="' + c.id + '">' + I18N.t("btn_sachet") + "</button>" +
      '<button class="btn btn-petit" data-cafe-edit="' + c.id + '">' + I18N.t("btn_modifier") + "</button></div>";
    }).join("");
    $$("[data-cafe-edit]").forEach(b => b.addEventListener("click", () => ouvrirFormCafe(b.dataset.cafeEdit)));
    $$("[data-cafe-sachet]").forEach(b => b.addEventListener("click", () => ouvrirFormSachet(b.dataset.cafeSachet)));
  }

  // ---------- Nouveau sachet ----------
  // Enregistrer un rachat remet le compteur de stock à zéro ET donne au café une
  // date de torréfaction à jour. C'est ce second effet qui corrige un vrai
  // mensonge de l'ancien modèle : un café racheté gardait la date du tout premier
  // paquet, donc la fraîcheur affichée était fausse pour toujours.
  let sachetCafeId = null;

  function ouvrirFormSachet(cafeId) {
    const c = DATA.state.cafes.find(x => x.id === cafeId);
    if (!c) return;
    sachetCafeId = cafeId;
    $("#form-sachet-titre").textContent = I18N.t("sachet_titre", { n: c.nom });
    $("#s-date").value = maintenantLocal().slice(0, 10);
    $("#s-format").value = c.format_grammes || "";
    $("#s-prix").value = c.prix_vnd || "";
    // Le cas courant est d'ouvrir le sachet le jour où on l'enregistre. Chris
    // peut vider le champ si le paquet part au placard.
    $("#s-ouverture").value = maintenantLocal().slice(0, 10);
    $("#s-torref").value = "";
    $("#form-sachet").hidden = false;
    $("#s-date").focus();
  }

  // Fermer le formulaire, c'est aussi oublier le café visé : les deux allaient
  // déjà ensemble, ils tenaient juste dans deux fichiers différents.
  function fermerFormSachet() {
    $("#form-sachet").hidden = true;
    sachetCafeId = null;
  }

  async function enregistrerSachet(ev) {
    ev.preventDefault();
    if (!sachetCafeId) return;
    await DATA.ajouterAchat({
      cafe_id: sachetCafeId,
      date_achat: $("#s-date").value || maintenantLocal().slice(0, 10),
      format_grammes: $("#s-format").value,
      prix_vnd: $("#s-prix").value,
      date_torrefaction: $("#s-torref").value,
      date_ouverture: $("#s-ouverture").value,
    });
    $("#form-sachet").hidden = true;
    sachetCafeId = null;
    rendreListeCafes();
    toast(I18N.t("t_sachet"));
  }

  function ouvrirFormCafe(id) {
    cafeEditId = id || null;
    const c = id ? DATA.state.cafes.find(x => x.id === id) : null;
    $("#form-cafe-titre").textContent = c ? I18N.t("f_modif", { n: c.nom }) : I18N.t("fc_nouveau");
    $("#c-nom").value = c ? c.nom : "";
    $("#c-torrefacteur").value = c ? c.torrefacteur : "";
    $("#c-origine").value = c ? c.origine : "";
    $("#c-espece").value = c ? c.espece : "";
    $("#c-procede").value = c ? c.procede : "";
    $("#c-torrefaction").value = c ? c.torrefaction : "";
    $("#c-format").value = c ? c.format_grammes : "";
    $("#c-prix").value = c ? c.prix_vnd : "";
    $("#c-date-torref").value = c ? c.date_torrefaction : "";
    $("#c-machine").value = c ? c.machine_recommandee : "";
    $("#c-recette").value = c ? c.recette_recommandee : "";
    $("#c-notes").value = c ? c.notes_annoncees : "";
    $("#c-pct").value = c ? (c.pourcentage_cafe_reel === "" || c.pourcentage_cafe_reel === undefined ? 100 : c.pourcentage_cafe_reel) : 100;
    $("#c-moulu").checked = c ? Number(c.deja_moulu) === 1 : false;
    $("#c-actif").checked = c ? c.actif !== 0 : true;
    $("#form-cafe").hidden = false;
    $("#c-nom").focus();
  }

  async function enregistrerCafe(ev) {
    ev.preventDefault();
    const cafe = {
      nom: $("#c-nom").value.trim(),
      torrefacteur: $("#c-torrefacteur").value.trim(),
      origine: $("#c-origine").value.trim(),
      espece: $("#c-espece").value.trim(),
      procede: $("#c-procede").value.trim(),
      torrefaction: $("#c-torrefaction").value,
      format_grammes: $("#c-format").value,
      prix_vnd: $("#c-prix").value,
      date_torrefaction: $("#c-date-torref").value,
      machine_recommandee: $("#c-machine").value,
      recette_recommandee: $("#c-recette").value,
      notes_annoncees: $("#c-notes").value.trim(),
      pourcentage_cafe_reel: $("#c-pct").value || 100,
      tag: (cafeEditId && (DATA.state.cafes.find(x => x.id === cafeEditId) || {}).tag) || "",
      deja_moulu: $("#c-moulu").checked ? 1 : 0,
      actif: $("#c-actif").checked ? 1 : 0,
    };
    if (Number(cafe.pourcentage_cafe_reel) < 100 && !cafe.tag) cafe.tag = "café aromatisé";
    if (cafeEditId) await DATA.modifierCafe(cafeEditId, cafe);
    else await DATA.ajouterCafe(cafe);
    $("#form-cafe").hidden = true;
    rendreListeCafes();
    UI.remplirSelectCafes();
    UI.remplirFiltres();
    toast(I18N.t("t_cafe"));
  }

  // ---------- Gestion des recettes ----------

  let recetteEditId = null;

  function ouvrirModaleRecettes() {
    rendreListeRecettes();
    $("#form-recette").hidden = true;
    const m = $("#modale-recettes");
    if (!m.open) m.showModal();
  }

  function rendreListeRecettes() {
    $("#recettes-liste").innerHTML = DATA.state.recettes.map(r =>
      '<div class="cafe-ligne' + (r.actif === 0 ? " inactif" : "") + '">' +
      '<span class="chip-methode ' + r.methode.toLowerCase() + '">' + r.methode + "</span>" +
      "<div><b>" + r.nom + "</b><div class=\"cafe-meta\">" +
      [r.numero, r.dose + " g / " + r.eau + " g", I18N.t("molette") + " " + r.dial,
        DATA.estRecetteDorigine(r.id) ? "" : I18N.t("li_perso"),
        r.actif === 0 ? I18N.t("li_masquee") : ""].filter(Boolean).join(" · ") +
      "</div></div>" +
      '<button class="btn btn-petit" data-recette-form="' + r.id + '">' + I18N.t("btn_modifier") + "</button></div>"
    ).join("");
    $$("[data-recette-form]").forEach(b => b.addEventListener("click", () => ouvrirFormRecette(b.dataset.recetteForm)));
  }

  function ouvrirFormRecette(id) {
    recetteEditId = id || null;
    const r = id ? DATA.state.recettes.find(x => x.id === id) : null;
    $("#form-recette-titre").textContent = r ? I18N.t("f_modif", { n: r.nom }) : I18N.t("fr_nouvelle");
    $("#r-nom").value = r ? r.nom : "";
    $("#r-methode").value = r ? r.methode : "Switch";
    $("#r-numero").value = r ? r.numero : "";
    $("#r-sous-titre").value = r ? r.sousTitre : "";
    $("#r-dose").value = r ? r.dose : 15;
    $("#r-eau").value = r ? r.eau : 225;
    $("#r-temp").value = r ? r.temp : 92;
    $("#r-feu").value = r ? r.puissance_feu : "";
    $("#r-temp-texte").value = r ? r.tempTexte : "";
    $("#r-dial").value = r ? r.dial : "1.5.0";
    $("#r-ratio-texte").value = r ? r.ratioTexte : "";
    $("#r-total-texte").value = r ? r.totalTexte : "";
    $("#r-etapes").value = r ? etapesVersTexte(r.etapes) : "";
    $("#r-pourqui").value = r ? r.pourQui : "";
    $("#r-cafes").value = r ? r.cafesAssocies.join("\n") : "";
    $("#r-note").value = r ? r.note : "";
    $("#r-video").value = r ? r.video || "" : "";
    $("#r-defaut").checked = r ? !!r.parDefaut : false;
    $("#r-avancee").checked = r ? !!r.avancee : false;
    $("#r-actif").checked = r ? r.actif !== 0 : true;
    const origine = r && DATA.estRecetteDorigine(r.id);
    $("#recette-retablir").hidden = !origine;
    $("#recette-supprimer").hidden = !r || origine;
    $("#form-recette").hidden = false;
    $("#r-nom").focus();
  }

  function lireFormRecette() {
    return {
      nom: $("#r-nom").value.trim(),
      methode: $("#r-methode").value,
      numero: $("#r-numero").value.trim(),
      sousTitre: $("#r-sous-titre").value.trim(),
      dose: $("#r-dose").value,
      eau: $("#r-eau").value,
      temp: $("#r-temp").value,
      puissance_feu: $("#r-feu").value,
      // Sans cible de température, pas de texte inventé : " °C" tout seul n'a aucun sens.
      tempTexte: $("#r-temp-texte").value.trim() ||
        ($("#r-temp").value ? $("#r-temp").value + " °C" : ""),
      dial: $("#r-dial").value.trim().replace(/,/g, "."),
      ratioTexte: $("#r-ratio-texte").value.trim(),
      totalTexte: $("#r-total-texte").value.trim(),
      etapes: texteVersEtapes($("#r-etapes").value),
      pourQui: $("#r-pourqui").value.trim(),
      cafesAssocies: $("#r-cafes").value.split("\n").map(s => s.trim()).filter(Boolean),
      note: $("#r-note").value.trim(),
      video: $("#r-video").value.trim(),
      parDefaut: $("#r-defaut").checked,
      avancee: $("#r-avancee").checked,
      actif: $("#r-actif").checked ? 1 : 0,
    };
  }

  /* Rétablir et supprimer agissent sur la recette OUVERTE, celle que le
     formulaire connaît. Le câblage se contentait de lire cet identifiant pour le
     repasser à DATA, ce qui obligeait la modale à publier son état interne. */
  async function retablirRecetteCourante() {
    if (!recetteEditId) return;
    if (!await confirmer(I18N.t("c_retablir"))) return;
    await DATA.reinitialiserRecette(recetteEditId);
    $("#form-recette").hidden = true;
    rendreListeRecettes();
    toast(I18N.t("t_retablie"));
  }

  async function supprimerRecetteCourante() {
    if (!recetteEditId) return;
    if (!await confirmer(I18N.t("c_suppr_recette"), { danger: true })) return;
    await DATA.supprimerRecette(recetteEditId);
    $("#form-recette").hidden = true;
    rendreListeRecettes();
    toast(I18N.t("t_recette_supprimee"));
  }

  async function enregistrerRecette(ev) {
    ev.preventDefault();
    const donnees = lireFormRecette();
    if (!donnees.nom) { toast(I18N.t("t_nom_recette")); return; }
    const dial = GRIND.parseDial(donnees.dial);
    if (donnees.dial && !dial) { toast(I18N.t("t_mouture_invalide")); return; }
    if (recetteEditId) await DATA.modifierRecette(recetteEditId, donnees);
    else await DATA.ajouterRecette(donnees);
    $("#form-recette").hidden = true;
    rendreListeRecettes();
    toast(I18N.t("t_recette"));
  }

  // ---------- Écran Paramètres ----------
  /* Cet écran ne stocke rien de son côté. Chaque ligne du tableau édite la RECETTE
     elle-même, la même fiche que "Gérer les recettes" : une seule source de vérité,
     déjà synchronisée. Les seuls réglages propres à l'écran sont les deux replis,
     locaux à l'appareil. */

  function rendreParametres() {
    const lignes = ["Brikka", "Switch"].map(m => {
      const liste = recettesDeMethode(m);
      if (!liste.length) return "";
      return '<tr class="param-groupe"><td colspan="6">' + m + "</td></tr>" +
        liste.map(r =>
          '<tr data-param-recette="' + r.id + '">' +
          "<td>" + I18N.tr(r.nom) + "</td>" +
          '<td><input type="number" step="0.5" min="1" data-champ="dose" value="' + (r.dose || "") + '"></td>' +
          '<td><input type="number" step="1" min="10" data-champ="eau" value="' + (r.eau || "") + '"></td>' +
          '<td><input type="number" step="1" min="60" max="100" data-champ="temp" value="' + (r.temp === "" ? "" : r.temp) +
            '" placeholder="' + I18N.t("param_vide") + '"></td>' +
          "<td>" + (r.methode === "Brikka"
            ? '<input type="number" step="1" min="1" max="10" data-champ="puissance_feu" value="' + (r.puissance_feu || "") + '">'
            : '<span class="param-sans">&middot;</span>') + "</td>" +
          '<td><input type="text" data-champ="dial" value="' + attrTitre(r.dial || "") + '"></td>' +
          "</tr>").join("");
    }).join("");
    $("#param-recettes").innerHTML = lignes;
    $("#param-dose-defaut").value = replis.dose;
    $("#param-feu-defaut").value = replis.feu;
    $("#param-molette").value = replis.molette;
    UI.ecrireDuree("param-ebullition", replis.ebullition);
    UI.ecrireDuree("param-bulles", replis.bulles);
    PAS_PARAM.forEach(([id, cle]) => { $("#" + id).value = (replis.pas || {})[cle]; });
    majDetailMolette();
    $("#param-bips").checked = $("#chrono-bip").checked;
    majRatees();
  }

  /* La bascule d'inclusion des tasses ratées, et le compte de ce qu'elle
     écarte aujourd'hui. Préférence de lecture, locale comme les bips. */
  function majRatees() {
    const exclues = extAvecCalculs().length - extAnalysables().length;
    $("#param-ratees").checked = inclureRatees();
    $("#compte-ratees").textContent = I18N.t("rt_exclues", { n: exclues });
  }

  // Crans et microns sous le champ, pour vérifier qu'on a tapé le bon réglage.
  function majDetailMolette() {
    const p = GRIND.parseDial($("#param-molette").value.trim().replace(/,/g, "."));
    $("#param-molette-detail").textContent = p
      ? I18N.t("param_molette_detail", { c: p.crans, m: Math.round(p.microns) })
      : "";
  }

  // Les champs de la carte « Mes pas de correction » et leur colonne de réglages.
  const PAS_PARAM = [["param-pas-crans", "pas_crans"], ["param-pas-degres", "pas_degres"],
    ["param-pas-feu", "pas_feu"], ["param-pas-eau", "pas_eau_g"], ["param-pas-dose", "pas_dose_g"]];

  async function enregistrerParametres() {
    const dose = Number($("#param-dose-defaut").value);
    const feu = Number($("#param-feu-defaut").value);
    const molette = $("#param-molette").value.trim().replace(/,/g, ".");
    if (!(dose > 0)) { toast(I18N.t("t_param_dose")); return; }
    if (!(feu >= 1 && feu <= 10)) { toast(I18N.t("t_param_feu")); return; }
    if (!GRIND.parseDial(molette)) { toast(I18N.t("t_mouture_invalide")); return; }
    const ebullition = UI.lireDuree("param-ebullition");
    if (ebullition === "" || !(ebullition >= 30 && ebullition <= 1800)) { toast(I18N.t("t_param_ebullition")); return; }
    // Les premières bulles viennent AVANT le gros bouillon, sinon la courbe n'a pas de sens.
    const bulles = UI.lireDuree("param-bulles");
    if (bulles === "" || !(bulles >= 10 && bulles < ebullition)) { toast(I18N.t("t_param_bulles")); return; }
    replis.dose = dose;
    replis.feu = Math.round(feu);
    replis.molette = molette;
    replis.ebullition = ebullition;
    replis.bulles = bulles;
    /* Les pas de correction : une valeur hors bornes ne se refuse pas, la
       normalisation la ramène au défaut, comme pour le feu d'une recette. */
    replis.pas = Object.fromEntries(PAS_PARAM.map(([id, cle]) => [cle, Number($("#" + id).value)]));
    await ecrireReplis();
    UI.chargerReplis();

    /* On ne réécrit que les recettes réellement touchées : chaque écriture
       estampille maj_le et gagnerait la fusion contre un autre appareil. */
    let touchees = 0;
    for (const tr of $$("[data-param-recette]")) {
      const r = DATA.state.recettes.find(x => x.id === tr.dataset.paramRecette);
      if (!r) continue;
      const lu = {};
      tr.querySelectorAll("[data-champ]").forEach(i => { lu[i.dataset.champ] = i.value.trim(); });
      const change =
        String(r.dose || "") !== lu.dose ||
        String(r.eau || "") !== lu.eau ||
        String(r.temp === "" ? "" : r.temp) !== lu.temp ||
        String(r.dial || "") !== lu.dial ||
        (r.methode === "Brikka" && String(r.puissance_feu || "") !== lu.puissance_feu);
      if (!change) continue;
      if (lu.dial && !GRIND.parseDial(lu.dial.replace(/,/g, "."))) { toast(I18N.t("t_mouture_invalide")); return; }
      // Le tableau ne montre que ces champs : on repart de la recette entière pour
      // ne rien perdre au passage (étapes, texte, café associés…).
      await DATA.modifierRecette(r.id, {
        ...r,
        dose: lu.dose,
        eau: lu.eau,
        temp: lu.temp,
        dial: lu.dial.replace(/,/g, "."),
        puissance_feu: r.methode === "Brikka" ? lu.puissance_feu : "",
        // Le texte affiché suivait l'ancienne cible, il devient faux sans ça.
        tempTexte: lu.temp ? lu.temp + " °C" : (r.methode === "Brikka" ? I18N.t("param_temp_feu") : ""),
      });
      touchees++;
    }
    rendreParametres();
    UI.remplirSelectRecettes();
    toast(touchees ? I18N.t("t_param_ok", { n: touchees }) : I18N.t("t_param_replis"));
  }

  // Mis à disposition des autres écrans.
  /* Câblage des modales cafés, sachets, recettes et de l'écran Paramètres.
     Appelé une fois par app.js. */
  function cablerCatalogue() {
    /* Les deux raccourcis d'entête ont disparu avec l'entête (refonte
       Comptoir, étape 2). Les modales restent atteignables là où on en a besoin :
       #btn-gerer-cafes sur l'écran Saisie, #btn-gerer-recettes dans le Guide.
       Ces deux boutons là existent toujours et sont câblés par leurs écrans. */

    // Café : formulaire, et sachets
    $("#cafe-nouveau").addEventListener("click", () => ouvrirFormCafe(null));
    $("#cafe-annuler").addEventListener("click", () => { $("#form-cafe").hidden = true; });
    $("#form-cafe").addEventListener("submit", enregistrerCafe);
    $("#form-sachet").addEventListener("submit", enregistrerSachet);
    $("#sachet-annuler").addEventListener("click", fermerFormSachet);

    // Recettes : formulaire
    $("#recette-nouvelle").addEventListener("click", () => ouvrirFormRecette(null));
    $("#recette-annuler").addEventListener("click", () => { $("#form-recette").hidden = true; });
    $("#form-recette").addEventListener("submit", enregistrerRecette);
    $("#recette-retablir").addEventListener("click", retablirRecetteCourante);
    $("#recette-supprimer").addEventListener("click", supprimerRecetteCourante);

    // Paramètres
    $("#param-enregistrer").addEventListener("click", enregistrerParametres);
    $("#param-annuler").addEventListener("click", rendreParametres);
    $("#param-molette").addEventListener("input", majDetailMolette);
    // La case de l'écran Paramètres et celle du chrono pilotent le même réglage.
    $("#param-bips").addEventListener("change", () => {
      $("#chrono-bip").checked = $("#param-bips").checked;
      $("#chrono-bip").dispatchEvent(new Event("change"));
    });
    /* Le tableau de bord se redessine de lui-même à la prochaine arrivée sur
       l'écran : c'est là que la bascule change ce que les chiffres racontent. */
    $("#param-ratees").addEventListener("change", () => {
      basculerRatees($("#param-ratees").checked);
      majRatees();
    });
  }

  Object.assign(UI, {
    cablerCatalogue, cafeEditId, coutParTasse, enregistrerCafe, enregistrerParametres, enregistrerRecette,
    majRatees,
    enregistrerSachet, fermerFormSachet, lireFormRecette, majDetailMolette, ouvrirFormCafe,
    ouvrirFormRecette, ouvrirFormSachet, ouvrirModaleCafes, ouvrirModaleRecettes,
    recetteEditId, rendreListeCafes, rendreListeRecettes, rendreParametres,
    retablirRecetteCourante, sachetCafeId, supprimerRecetteCourante,
  });
})();
