/* Écran de saisie : le panneau latéral (la recette et le café choisis, sous les
 * yeux) et les tasses jumelles. Sortis de ui-saisie.js en v8.78. */
"use strict";

(() => {

  // Emprunté au noyau et à ui-saisie.js, chargés avant nous.
  const { $, attrTitre, fmtTemps, fmtDecimal, fmtVND, trouverRecette, saisie, cafeCourantMoulu } = UI;

  // Panneau latéral de la saisie : la recette et le café sélectionnés, sous les yeux.
  function majAsideSaisie() {
    const zoneR = $("#aside-recette");
    const zoneC = $("#aside-cafe");
    if (!zoneR || !zoneC) return;

    const r = trouverRecette($("#f-recette").value);
    UI.majVideoAside(r);
    if (!r) {
      zoneR.innerHTML = '<p class="aside-vide">' + I18N.t("a_choisir_recette") + "</p>";
    } else {
      const etapes = UI.etapesPour(r);
      zoneR.innerHTML =
        '<div class="aside-titre"><span class="pastille-methode ' + r.methode.toLowerCase() + '"></span><h4>' + r.nom + "</h4></div>" +
        (r.sousTitre ? '<p class="aside-sous">' + attrTitre(I18N.tr(r.sousTitre)) + "</p>" : "") +
        '<div class="recette-params">' +
        '<span class="param-chip">' + r.dose + " g / " + r.eau + " g</span>" +
        (UI.facteurEau(r) !== 1
          ? '<span class="param-chip param-chip-adapte">' + I18N.t("a_adapte", { e: $("#f-eau").value }) + "</span>"
          : "") +
        (r.ratioTexte ? '<span class="param-chip">' + attrTitre(I18N.tr(r.ratioTexte)) + "</span>" : "") +
        (r.tempTexte ? '<span class="param-chip">' + attrTitre(I18N.tr(r.tempTexte)) + "</span>" : "") +
        '<span class="param-chip">' + I18N.t("molette") + " " + r.dial + "</span>" +
        (r.totalTexte ? '<span class="param-chip">' + attrTitre(I18N.tr(r.totalTexte)) + "</span>" : "") +
        "</div>" +
        (etapes.length ? '<ol class="recette-etapes">' + etapes.map(e =>
          "<li><span class=\"etape-temps\">" + (e.t === null ? "·" : fmtTemps(e.t)) + "</span><span>" + e.texte + "</span></li>"
        ).join("") + "</ol>" : "") +
        (r.pourQui ? '<p class="aside-pourqui"><b>' + I18N.t("r_pourqui") + "</b> " + attrTitre(I18N.tr(r.pourQui)) + "</p>" : "") +
        (r.cafesAssocies.length ? '<p class="aside-cafes"><b>' + I18N.t("r_cafes") + "</b> " + r.cafesAssocies.join(", ") + "</p>" : "") +
        (r.note ? '<p class="aside-note-recette">' + attrTitre(I18N.tr(r.note)) + "</p>" : "") +
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

  Object.assign(UI, { majAsideSaisie, majJumelles });
})();
