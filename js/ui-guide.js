/* Écran guide : les recettes de référence, le mode pas à pas, le convertisseur
 * de mouture et les tables de plages.
 *
 * Les recettes affichées ici s'adaptent aux grammes d'eau réellement saisis : une
 * recette écrite pour 240 g montrée telle quelle à quelqu'un qui en verse 150
 * serait un piège, pas une référence. */
"use strict";

(() => {

  // Emprunté au noyau, chargé avant nous.
  const { $, $$, antiRebond, attrTitre, fmtTemps, recetteAvecVariantes, recettesVivantes, replis } = UI;

  // ---------- Référence : recettes ----------

  const tetsuChoix = { p40: "sucre", p60: "plein" };
  const familleSelection = {}; // famille -> id de la variante affichée

  function carteRecette(r, groupe) {
    const badges = (r.parDefaut ? '<span class="badge-defaut">' + I18N.t("badge_defaut") + "</span>" : "") +
      (r.avancee ? '<span class="badge-avancee">' + I18N.t("badge_avancee") + "</span>" : "");
    const params =
      '<span class="param-chip">' + r.dose + " g / " + r.eau + " g</span>" +
      '<span class="param-chip">' + r.ratioTexte + "</span>" +
      '<span class="param-chip">' + r.tempTexte + "</span>" +
      '<span class="param-chip">' + I18N.t("molette") + " " + r.dial + "</span>" +
      '<span class="param-chip">' + r.totalTexte + "</span>";
    let etapes = "";
    if (r.etapes.length) {
      etapes = '<ol class="recette-etapes">' + r.etapes.map(e =>
        "<li><span class=\"etape-temps\">" + (e.t === null ? "·" : fmtTemps(e.t)) + "</span><span>" + e.texte + "</span></li>"
      ).join("") + "</ol>";
    }
    const tetsu = r.variantes ? '<div class="tetsu-variantes" id="tetsu-bloc"></div>' : "";
    // Bascule de variante quand la recette appartient à une famille.
    let pilules = "";
    if (groupe && groupe.length > 1) {
      pilules = '<div class="variantes-recette">' + groupe.map(x =>
        '<button type="button" class="pilule' + (x.id === r.id ? " actif" : "") +
        '" data-var-fam="' + r.famille + '" data-var-id="' + x.id + '">' +
        I18N.tr(x.variante || x.nom) + "</button>").join("") + "</div>";
    }
    return '<article class="carte recette-carte ' + r.methode.toLowerCase() + '" data-recette="' + r.id + '">' +
      '<div class="recette-entete">' +
      (r.numero ? '<span class="recette-numero">' + r.numero + "</span>" : '<span class="recette-numero">' + r.methode + "</span>") +
      badges + "</div>" +
      "<h3>" + r.nom + "</h3>" +
      pilules +
      '<p class="recette-sous">' + r.sousTitre + "</p>" +
      '<div class="recette-params">' + params + "</div>" +
      etapes + tetsu +
      (r.pourQui ? '<p class="recette-pourqui"><b>' + I18N.t("r_pourqui") + "</b> " + r.pourQui + "</p>" : "") +
      (r.cafesAssocies.length ? '<p class="recette-cafes"><b>' + I18N.t("r_cafes") + "</b> " + r.cafesAssocies.join(", ") + "</p>" : "") +
      (r.note ? '<p class="recette-note">' + r.note + "</p>" : "") +
      '<div class="recette-actions">' +
      '<button class="btn btn-primaire btn-petit" data-pasapas="' + r.id + '">' + I18N.t("a_pap") + "</button>" +
      '<button class="btn btn-petit" data-recette-edit="' + r.id + '">' + I18N.t("btn_modifier") + "</button>" +
      "</div></article>";
  }

  function rendreRecettes() {
    const liste = recettesVivantes();
    const rendues = new Set();
    const cartes = [];
    liste.forEach(r => {
      if (rendues.has(r.id)) return;
      if (r.famille) {
        const groupe = liste.filter(x => x.famille === r.famille);
        if (groupe.length > 1) {
          groupe.forEach(x => rendues.add(x.id));
          const memo = familleSelection[r.famille];
          const sel = groupe.find(x => x.id === memo) || groupe[0];
          cartes.push(carteRecette(sel, groupe));
          return;
        }
      }
      rendues.add(r.id);
      cartes.push(carteRecette(r, null));
    });
    $("#grille-recettes").innerHTML = cartes.join("");

    rendreTetsu();

    $$("[data-var-fam]").forEach(b => b.addEventListener("click", () => {
      familleSelection[b.dataset.varFam] = b.dataset.varId;
      rendreRecettes();
    }));
    $$("[data-pasapas]").forEach(b => b.addEventListener("click", () => ouvrirPasAPas(b.dataset.pasapas)));
    $$("[data-recette-edit]").forEach(b => b.addEventListener("click", () => {
      UI.ouvrirModaleRecettes();
      UI.ouvrirFormRecette(b.dataset.recetteEdit);
    }));
  }

  function versementsTetsu() {
    const v40 = TETSU.premier40.find(v => v.id === tetsuChoix.p40);
    const v60 = TETSU.dernier60.find(v => v.id === tetsuChoix.p60);
    const r = recetteAvecVariantes();
    const eau = r ? r.eau : 300;
    return { pours: TETSU.versements(eau, v40, v60), v40, v60, eau };
  }

  function rendreTetsu() {
    const bloc = $("#tetsu-bloc");
    if (!bloc) return;
    const { pours, v40, v60, eau } = versementsTetsu();
    let cumul = 0;
    const lignes = pours.map((p, i) => {
      cumul += p;
      const phase = i < 2 ? "40 %" : "60 %";
      return "<li><span class=\"etape-temps\">" + (i + 1) + "</span><span>" +
        I18N.t("te_ligne", { p, c: cumul }) + " <small>(" + phase + ")</small></span></li>";
    }).join("");
    bloc.innerHTML =
      '<div class="tetsu-groupe"><span class="label">' + I18N.t("te_40") + "</span>" +
      '<div class="tetsu-options">' + TETSU.premier40.map(v =>
        '<button type="button" class="pilule' + (v.id === tetsuChoix.p40 ? " actif" : "") + '" data-t40="' + v.id + '">' + I18N.tr(v.nom) + "</button>").join("") +
      "</div></div>" +
      '<div class="tetsu-groupe"><span class="label">' + I18N.t("te_60") + "</span>" +
      '<div class="tetsu-options">' + TETSU.dernier60.map(v =>
        '<button type="button" class="pilule' + (v.id === tetsuChoix.p60 ? " actif" : "") + '" data-t60="' + v.id + '">' + I18N.tr(v.nom) + "</button>").join("") +
      "</div></div>" +
      '<ul class="tetsu-versements">' + lignes + "</ul>" +
      '<p class="tetsu-detail">' + I18N.tr(v40.detail) + " " + I18N.tr(v60.detail) + " " + I18N.t("te_fin") + "</p>";
    $$("[data-t40]").forEach(b => b.addEventListener("click", () => { tetsuChoix.p40 = b.dataset.t40; rendreTetsu(); }));
    $$("[data-t60]").forEach(b => b.addEventListener("click", () => { tetsuChoix.p60 = b.dataset.t60; rendreTetsu(); }));
  }

  // ---------- Mode pas à pas ----------

  const pap = { recette: null, etapes: [], index: -1, depart: null, interval: null };

  /* Le calcul vit dans recettes.js, sans DOM, pour être testable sans
     navigateur. Ici on ne fait que lire le champ. 1 veut dire "rien à mettre à
     l'échelle", et les textes restent alors intacts au caractère près. */
  function facteurEau(recette) {
    const eauVoulue = parseFloat($("#f-eau").value);
    if (!recette || !(recette.eau > 0) || !(eauVoulue > 0)) return 1;
    return eauVoulue / recette.eau;
  }

  function etapesPour(recette) {
    const f = facteurEau(recette);
    const mettreAEchelle = liste => f === 1 ? liste
      : liste.map(e => ({ ...e, texte: echelleVersements(e.texte, f) }));
    if (recette.variantes) {
      const { pours } = versementsTetsu();
      let cumul = 0;
      return mettreAEchelle(pours.map((p, i) => {
        cumul += p;
        return { t: null, texte: I18N.t("pap_verser", { p, c: cumul, b: i === 0 ? I18N.t("pap_bloom") : "" }) };
      }).concat([{ t: null, texte: I18N.t("pap_drain") }]));
    }
    return mettreAEchelle(recette.etapes);
  }

  function ouvrirPasAPas(idRecette) {
    const r = DATA.state.recettes.find(x => x.id === idRecette);
    if (!r) return;
    pap.recette = r;
    pap.etapes = etapesPour(r);
    pap.index = -1;
    clearInterval(pap.interval);
    pap.depart = null;
    $("#pap-titre").textContent = r.nom;
    $("#pap-chrono").textContent = "0:00";
    $("#pap-params").textContent = r.dose + " g / " + r.eau + " g, " + r.tempTexte + ", " + I18N.t("molette") + " " + r.dial + ", " + r.totalTexte;
    $("#pap-demarrer").textContent = I18N.t("pap_demarrer");
    $("#pap-suivant").disabled = true;
    rendrePapEtapes();
    $("#modale-pas-a-pas").showModal();
  }

  function rendrePapEtapes() {
    $("#pap-etapes").innerHTML = pap.etapes.map((e, i) =>
      '<li class="' + (i < pap.index ? "faite" : i === pap.index ? "courante" : "") + '">' +
      '<span class="etape-temps">' + (e.t === null ? "·" : fmtTemps(e.t)) + "</span><span>" + e.texte + "</span></li>"
    ).join("");
  }

  function papTic() {
    const s = Math.floor((Date.now() - pap.depart) / 1000);
    $("#pap-chrono").textContent = fmtTemps(s);
    // Avance automatique sur les étapes minutées.
    const prochaine = pap.index + 1;
    if (prochaine < pap.etapes.length && pap.etapes[prochaine].t !== null && s >= pap.etapes[prochaine].t) {
      pap.index = prochaine;
      rendrePapEtapes();
    }
  }

  function papDemarrer() {
    if (pap.depart) {
      clearInterval(pap.interval);
      pap.depart = null;
      $("#pap-demarrer").textContent = I18N.t("pap_reprendre");
      $("#pap-suivant").disabled = true;
      return;
    }
    pap.depart = Date.now();
    pap.index = 0;
    rendrePapEtapes();
    pap.interval = setInterval(papTic, 300);
    $("#pap-demarrer").textContent = I18N.t("pap_arreter");
    $("#pap-suivant").disabled = false;
  }

  function papSuivant() {
    if (pap.index < pap.etapes.length - 1) {
      pap.index++;
      rendrePapEtapes();
    }
  }

  // ---------- Référence : convertisseur et tables ----------

  /* Conseil vivant sous le curseur du moulin. Trois questions, dans cet ordre :
     est-ce que ça marche sur MES machines, quel goût ça donne si je bouge, et à
     quelle distance je suis de mon réglage enregistré. Rien d'inventé : les
     plages viennent de GRIND, l'écart se compte en crans. */
  function conseilMouture(p) {
    const brikkaOk = GRIND.verifierPlage("Brikka", GRIND.dialDepuisCrans(p.crans)).ok;
    const switchOk = GRIND.verifierPlage("Switch", GRIND.dialDepuisCrans(p.crans)).ok;
    const lignes = [];

    if (brikkaOk && switchOk) lignes.push("<b>" + I18N.t("cm_deux") + "</b>");
    else if (brikkaOk) lignes.push("<b>" + I18N.t("cm_brikka") + "</b>");
    else if (switchOk) lignes.push("<b>" + I18N.t("cm_switch") + "</b>");
    else lignes.push('<b class="conv-hors">' + I18N.t("cm_aucune") + "</b>");

    lignes.push(I18N.t("cm_plus_fin"));
    lignes.push(I18N.t("cm_plus_grossier"));

    // Écart au réglage enregistré, en crans, l'unité que la main comprend.
    const d = GRIND.parseDial(replis.molette);
    if (d) {
      const ecart = p.crans - d.crans;
      lignes.push(ecart === 0
        ? I18N.t("cm_actuel", { m: replis.molette })
        : I18N.t("cm_ecart", {
          n: Math.abs(ecart),
          sens: I18N.t(ecart > 0 ? "cm_ouvrir" : "cm_fermer"),
          m: replis.molette,
        }));
    }
    return lignes.map(x => "<p>" + x + "</p>").join("");
  }

  const rendreConvertisseurDifferee = antiRebond(() => rendreConvertisseur(), 90);

  function rendreConvertisseur() {
    const texte = $("#conv-dial").value.trim().replace(/,/g, ".");
    const zone = $("#conv-resultat");
    const p = GRIND.parseDial(texte);
    if (!p) {
      zone.innerHTML = '<span class="conv-erreur">' + I18N.t("cv_erreur") + "</span>";
      $("#conv-conseil").innerHTML = "";
      $("#conv-appliquer").disabled = true;
      CHARTS.diagramme("reglette", null, replis.molette);
      return;
    }
    // Le curseur suit toujours la valeur, y compris quand elle vient du texte.
    if (Number($("#conv-slider").value) !== p.crans) $("#conv-slider").value = p.crans;
    const compatibles = GRIND.methodesCompatibles(p.microns).map(m => I18N.methode(m.nom));
    zone.innerHTML =
      '<span class="conv-chip"><b>' + p.crans + "</b> " + I18N.t("cv_crans") + "</span>" +
      '<span class="conv-chip">' + I18N.t("cv_environ") + " <b>" + Math.round(p.microns) + "</b> " + I18N.t("cv_microns") + "</span>" +
      '<span class="conv-chip">' + I18N.t("cv_bande") + " <b>" + GRIND.bande(p.microns).nom + "</b></span>" +
      '<span class="conv-chip">' + (compatibles.length ? I18N.t("cv_compatible") + " <b>" + compatibles.join(", ") + "</b>" : "<b>" + I18N.t("cv_hors") + "</b>") + "</span>";
    $("#conv-conseil").innerHTML = conseilMouture(p);
    $("#conv-appliquer").disabled = texte === replis.molette;
    $("#conv-appliquer").textContent = texte === replis.molette
      ? I18N.t("cv_deja") : I18N.t("cv_appliquer");
    CHARTS.diagramme("reglette", texte, replis.molette);
  }

  // Repères sous le curseur : les positions de référence, cliquables.
  function rendreReperesMouture() {
    $("#conv-reperes").innerHTML = GRIND.REFERENCES.map(r =>
      '<button type="button" class="conv-repere" data-dial="' + r.dial + '" title="' +
      attrTitre(I18N.tr(r.usage)) + '">' + r.dial + "</button>").join("");
    $$("#conv-reperes .conv-repere").forEach(b => b.addEventListener("click", () => {
      $("#conv-dial").value = b.dataset.dial;
      rendreConvertisseur();
    }));
  }

  function rendreTablePlages() {
    $("#table-plages").innerHTML = GRIND.METHODES.map(m => {
      const fort = m.id === "brikka" || m.id === "switch";
      const nom = I18N.methode(m.nom);
      return "<tr" + (fort ? ' class="ligne-perso"' : "") + "><td>" + (fort ? "<b>" + nom + "</b>" : nom) + "</td>" +
        "<td>" + (m.minU === 0 ? I18N.t("plage_moins_u", { x: m.maxU }) : I18N.t("plage_a", { a: m.minU, b: m.maxU })) + "</td>" +
        "<td>" + (m.minC === 0 ? I18N.t("plage_moins_u", { x: m.maxC }) : I18N.t("plage_a", { a: m.minC, b: m.maxC })) + "</td>" +
        "<td><code>" + I18N.mol(m.molette) + "</code></td></tr>";
    }).join("");
  }

  // Mis à disposition des autres écrans.
  Object.assign(UI, {
    carteRecette, conseilMouture, etapesPour, facteurEau, familleSelection, ouvrirPasAPas,
    pap, papDemarrer, papSuivant, papTic, rendreConvertisseur, rendreConvertisseurDifferee,
    rendrePapEtapes, rendreRecettes, rendreReperesMouture, rendreTablePlages, rendreTetsu,
    tetsuChoix, versementsTetsu,
  });
})();
