/* Guide screen: the reference recipes, the step-by-step mode, the grind
 * converter and the range tables.
 *
 * The recipes shown here adapt to the grams of water actually entered: a
 * recipe written for 240 g shown as-is to someone pouring 150 would be a
 * trap, not a reference. */
"use strict";

(() => {

  // Borrowed from the core, loaded before us.
  const { $, $$, antiRebond, attrTitre, basculerEtat, ecrireReplis, extAnalysables, fmtDecimal, fmtTemps, moyenne,
    peindreCurseur, recetteAvecVariantes, recettesVivantes, replis, toast } = UI;

  // ---------- Reference: recipes ----------

  const tetsuChoix = { p40: "sucre", p60: "plein" };
  const familleSelection = {}; // family -> id of the displayed variant

  /* THE GUIDE AS A LIBRARY (v8.52). Two new things on each recipe, both
     computed, nothing written by hand:

     - its coffee PROFILES, for the filters: washed or fermented, read from its
       "Who it's for" text, the first sentence first (« Les lavés propres… »,
       « Les fermentés, natural, honey… »), the whole text otherwise. A recipe
       that targets no profile (the Brikkas) applies to all and shows under both.
       Linked coffees were tried and dropped: the Balanced, washed, appears in
       almost every list and made everything "washed". Changing a recipe's
       text changes its filter;
     - "At home": the average of your rated cups on THIS recipe. */
  const WASHED = /lav|wash/i, FERMENTED = /natur|honey|ana[eé]ro|ferment/i;
  function profilsRecette(r) {
    const text = String(r.pourQui || "");
    const readProfiles = t => [WASHED.test(t) ? "lave" : "", FERMENTED.test(t) ? "fermente" : ""].filter(Boolean);
    const firstSentence = readProfiles(text.split(/[.:]/)[0]);
    const p = firstSentence.length ? firstSentence : readProfiles(text);
    return p.length ? p : ["lave", "fermente"];
  }
  /* A6 (v8.85): RECIPES COLLAPSE. Sixteen phone screens to scroll down the
     Guide, every recipe expanded while you are looking for one. Collapsed, a
     recipe fits on one line: brewer, dose and water, temperature, your rating
     at home. The ones you open stay open from one visit to the next. */
  const OPEN_KEY = "guide-recettes-ouvertes";
  const openRecipes = new Set();
  try { JSON.parse(localStorage.getItem(OPEN_KEY) || "[]").forEach(id => openRecipes.add(id)); } catch (e) { /* without storage, everything collapsed */ }
  function basculerRecette(id, expand) {
    if (expand) openRecipes.add(id); else openRecipes.delete(id);
    try { localStorage.setItem(OPEN_KEY, JSON.stringify([...openRecipes])); } catch (e) { /* same */ }
  }
  function homeRating(r) {
    const ratings = extAnalysables().filter(e => e.recette === r.nom && e.note_sur_10 !== "").map(e => Number(e.note_sur_10));
    return ratings.length ? fmtDecimal(moyenne(ratings), 1) : "";
  }
  function chezToi(r) {
    const ratings = extAnalysables().filter(e => e.recette === r.nom && e.note_sur_10 !== "").map(e => Number(e.note_sur_10));
    return '<p class="recette-chez-toi">' + (ratings.length
      ? I18N.t("bi_chez_toi", { m: fmtDecimal(moyenne(ratings), 1), n: ratings.length })
      : I18N.t("bi_pas_essayee")) + "</p>";
  }
  const filtre = { valeur: "tout" };
  try { filtre.valeur = localStorage.getItem("guide-filtre") || "tout"; } catch (e) { /* without storage, all */ }
  function applyFilter() {
    $$("#grille-recettes .recette-carte").forEach(c => {
      const v = filtre.valeur;
      c.hidden = !(v === "tout" || c.classList.contains(v.toLowerCase()) || (c.dataset.profils || "").split(" ").includes(v));
    });
    $$("#biblio-filtres [data-filtre]").forEach(b => basculerEtat(b, b.dataset.filtre === filtre.valeur));
    const vide = $("#biblio-vide");
    if (vide) vide.hidden = $$("#grille-recettes .recette-carte").some(c => !c.hidden);
  }

  /* THE GUIDE TABS (v8.52). The table of contents shows ONE panel at a time,
     the one holding the link target; anchors remain, and a target that is not
     at the top of its panel (What to buy, Buying rules) scrolls into view.
     Recipes first, and the chosen tab is remembered. */
  function montrerGuide(target) {
    const el = target ? document.getElementById(target) : null;
    const panel = el ? el.closest(".guide-panneau") : $("#gp-" + (target || "recettes"));
    if (!panel) return;
    $$(".guide-panneau").forEach(p => { p.hidden = p !== panel; });
    $$(".guide-onglets [data-guide]").forEach(a => {
      const active = a.dataset.guide === panel.dataset.panneau;
      a.classList.toggle("courant", active);
      if (active) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
    try { localStorage.setItem("guide-onglet", panel.dataset.panneau); } catch (e) { /* never mind */ }
    if (el && el !== panel.querySelector("h2, .ref-titre-ligne h2")) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* Opens ONE recipe in the Guide (v8.53, the dashboard podium): its displayed
     variant if it belongs to a family, the filter reset to "All" so it is not
     hidden, then the card centred, briefly highlighted. */
  function montrerRecette(id) {
    const r = DATA.state.recettes.find(x => x.id === id);
    if (!r) { montrerGuide("ref-recettes"); return; }
    if (r.famille) familleSelection[r.famille] = r.id;
    basculerRecette(id, true);
    filtre.valeur = "tout";
    rendreRecettes();
    montrerGuide("ref-recettes");
    const card = $('#grille-recettes [data-recette="' + id + '"]');
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("recette-montree");
    setTimeout(() => card.classList.remove("recette-montree"), 1800);
  }

  /* THE RECIPE VIDEO (v8.64). A YouTube link becomes "Watch the video": the
     player only loads on click, inside the card, from youtube-nocookie (no
     cookie until something is played, and no surprise sound when the Guide
     opens). Any other link stays a link. */
  const youtubeId = url => (String(url || "").match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/) || [])[1] || "";
  const attr = OUTILS.echap;
  function videoBlock(r) {
    if (!r.video) return "";
    const id = youtubeId(r.video);
    return '<div class="recette-video">' +
      (id ? '<button type="button" class="btn btn-petit" data-video="' + id + '">' + I18N.t("bi_video") + "</button>" : "") +
      '<a class="recette-video-lien" href="' + attr(r.video) + '" target="_blank" rel="noopener">' +
      I18N.t(id ? "bi_youtube" : "bi_source") + "</a></div>";
  }
  function startVideo(button) {
    const frame = document.createElement("iframe");
    frame.className = "recette-lecteur";
    frame.src = "https://www.youtube-nocookie.com/embed/" + button.dataset.video + "?autoplay=1&rel=0";
    frame.title = I18N.t("bi_video");
    frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    frame.allowFullscreen = true;
    button.replaceWith(frame);
  }

  /* THE VIDEO IN THE ENTRY FORM (v8.69), under the recipe card of the right panel.
     Its own card, not inside the recipe card: that card redraws on every
     keystroke, and a playing video would have been cut off. It is only rebuilt
     when the recipe or its link changes. */
  function majVideoAside(r) {
    const zone = $("#aside-video");
    if (!zone) return;
    const key = r ? r.id + "|" + (r.video || "") : "";
    if (zone.dataset.pour === key) return;
    zone.dataset.pour = key;
    const block = r ? videoBlock(r) : "";
    zone.hidden = !block;
    zone.innerHTML = block;
    const b = zone.querySelector("[data-video]");
    if (b) b.addEventListener("click", () => startVideo(b));
  }

  /* WHICH COFFEE, WHICH RECIPE (v8.74). The table from recettes.js, and in each
     cell what your cups say: your average with the recommended recipe on the
     coffees of that profile, and your best recipe here when another one does
     better over at least three cups. */
  function rendreMatrice() {
    const table = $("#matrice-recettes");
    if (!table || typeof MATRICE_CAFE_RECETTE === "undefined") return;
    const M = MATRICE_CAFE_RECETTE;
    const recette = id => DATA.state.recettes.find(r => r.id === id);
    const profiles = new Map(DATA.state.cafes.map(c => [c.id, profilCafe(c)]));
    const cups = extAnalysables().filter(e => e.note_sur_10 !== "");
    const cellStats = (l, c) => {
      const byRecipe = {};
      cups.forEach(e => {
        const p = profiles.get(e.cafe_id);
        if (!p || p.ligne !== l || p.colonne !== c) return;
        (byRecipe[e.recette] = byRecipe[e.recette] || []).push(Number(e.note_sur_10));
      });
      return byRecipe;
    };
    const recipeLink = r => '<button type="button" class="lien-recette" data-matrice="' + attr(r.id) + '">' + attr(I18N.tr(r.nom)) + "</button>";
    const fmt1 = n => fmtDecimal(n, 1);
    let html = "<thead><tr><th></th>" + M.colonnes.map(c => "<th>" + attr(I18N.tr(c.nom)) + "</th>").join("") + "</tr></thead><tbody>";
    M.lignes.forEach(l => {
      html += '<tr><th scope="row">' + attr(I18N.tr(l.nom)) + "</th>";
      M.colonnes.forEach(c => {
        const k = M.cases[l.id + "|" + c.id];
        const r = k && recette(k.recette);
        if (!r) { html += '<td class="m-vide"></td>'; return; }
        const stats = cellStats(l.id, c.id);
        const mine = stats[r.nom] || [];
        const best = Object.entries(stats).filter(([name, n]) => name !== r.nom && n.length >= 3)
          .map(([name, n]) => ({ nom: name, moy: moyenne(n), n: n.length })).sort((a, b) => b.moy - a.moy)[0];
        const alt = k.autre && recette(k.autre);
        html += '<td data-col="' + attr(I18N.tr(c.nom)) + '">' + recipeLink(r) +
          (k.temp ? '<span class="m-temp">' + attr(k.temp) + "</span>" : "") +
          (alt ? '<span class="m-autre">' + I18N.t("mx_autre") + " " + recipeLink(alt) + "</span>" : "") +
          (mine.length ? '<span class="m-chez-toi">' + I18N.t("mx_chez_toi", { m: fmt1(moyenne(mine)), n: mine.length }) + "</span>" : "") +
          (best && (mine.length < 3 || best.moy > moyenne(mine))
            ? '<span class="m-meilleure">' + I18N.t("mx_meilleure", { r: attr(I18N.tr(best.nom)), m: fmt1(best.moy) }) + "</span>" : "") +
          "</td>";
      });
      html += "</tr>";
    });
    table.innerHTML = html + "</tbody>";
    if (!table.dataset.cable) {
      table.dataset.cable = "1";
      table.addEventListener("click", ev => {
        const b = ev.target.closest("[data-matrice]");
        if (b) UI.montrerRecette(b.dataset.matrice);
      });
    }
  }

  function carteRecette(r, group) {
    const badges = (r.parDefaut ? '<span class="badge-defaut">' + I18N.t("badge_defaut") + "</span>" : "") +
      (r.avancee ? '<span class="badge-avancee">' + I18N.t("badge_avancee") + "</span>" : "");
    const params =
      '<span class="param-chip">' + r.dose + " g / " + r.eau + " g</span>" +
      '<span class="param-chip">' + attr(I18N.tr(r.ratioTexte)) + "</span>" +
      '<span class="param-chip">' + attr(I18N.tr(r.tempTexte)) + "</span>" +
      '<span class="param-chip">' + I18N.t("molette") + " " + r.dial + "</span>" +
      '<span class="param-chip">' + attr(I18N.tr(r.totalTexte)) + "</span>";
    let steps = "";
    if (r.etapes.length) {
      steps = '<ol class="recette-etapes">' + r.etapes.map(e =>
        "<li><span class=\"etape-temps\">" + (e.t === null ? "·" : fmtTemps(e.t)) + "</span><span>" + attr(I18N.tr(e.texte)) + "</span></li>"
      ).join("") + "</ol>";
    }
    const tetsuBlock = r.variantes ? '<div class="tetsu-variantes" id="tetsu-bloc"></div>' : "";
    // Variant toggle when the recipe belongs to a family.
    let pills = "";
    if (group && group.length > 1) {
      pills = '<div class="variantes-recette">' + group.map(x =>
        '<button type="button" class="pilule' + (x.id === r.id ? " actif" : "") +
        '" data-var-fam="' + r.famille + '" data-var-id="' + x.id + '">' +
        I18N.tr(x.variante || x.nom) + "</button>").join("") + "</div>";
    }
    const isOpen = openRecipes.has(r.id);
    const rating = homeRating(r);
    const summary = [r.methode, r.dose + " g / " + r.eau + " g", r.temp ? r.temp + " °C" : ""].filter(Boolean).join(" · ");
    return '<article class="carte recette-carte ' + r.methode.toLowerCase() + (isOpen ? "" : " repliee") + '" data-recette="' + r.id + '" data-profils="' +
      profilsRecette(r).join(" ") + '">' +
      '<div class="recette-entete">' +
      (r.numero ? '<span class="recette-numero">' + r.numero + "</span>" : '<span class="recette-numero">' + r.methode + "</span>") +
      badges + "</div>" +
      '<h3><button type="button" class="recette-bascule" data-bascule="' + r.id + '" aria-expanded="' + isOpen + '" aria-controls="corps-' + r.id + '">' +
        '<span class="rb-nom">' + r.nom + "</span>" +
        '<span class="rb-resume">' + attr(summary) + "</span>" +
        '<span class="rb-note">' + (rating ? rating : I18N.t("rb_jamais")) + "</span>" +
      "</button></h3>" +
      '<div class="recette-corps" id="corps-' + r.id + '">' +
      pills +
      '<p class="recette-sous">' + attr(I18N.tr(r.sousTitre)) + "</p>" +
      '<div class="recette-params">' + params + "</div>" +
      videoBlock(r) +
      chezToi(r) +
      steps + tetsuBlock +
      (r.pourQui ? '<p class="recette-pourqui"><b>' + I18N.t("r_pourqui") + "</b> " + attr(I18N.tr(r.pourQui)) + "</p>" : "") +
      (r.cafesAssocies.length ? '<p class="recette-cafes"><b>' + I18N.t("r_cafes") + "</b> " + r.cafesAssocies.join(", ") + "</p>" : "") +
      (r.note ? '<p class="recette-note">' + attr(I18N.tr(r.note)) + "</p>" : "") +
      '<div class="recette-actions">' +
      '<button class="btn btn-primaire btn-petit" data-brasser="' + r.id + '">' + I18N.t("g_brasser") + "</button>" +
      '<button class="btn btn-petit" data-pasapas="' + r.id + '">' + I18N.t("a_pap") + "</button>" +
      '<button class="btn btn-petit" data-recette-edit="' + r.id + '">' + I18N.t("btn_modifier") + "</button>" +
      "</div></div></article>";
  }

  /* L5 (v8.94): BREW A RECIPE from the Guide. The entry form opens with the
     chosen brewer and recipe, and its values already filled in. */
  function brasserRecette(id) {
    const r = DATA.state.recettes.find(x => x.id === id);
    if (!r) return;
    UI.reinitialiserSaisie(true);
    UI.choisirMethode(r.methode);
    const sel = $("#f-recette");
    sel.value = r.nom;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    UI.activerEcran("saisie");
  }

  /* THE GUIDE HOME (L5). The doors: one per section of the table of contents,
     with what you find there. "For your coffee": the coffee of your last cup,
     its cell in the coffee and recipe table, and your rating on the two
     recipes it suggests. */
  const DOORS = { recettes: "g_p_recettes", moulin: "g_p_moulin", diagnostic: "g_p_diagnostic", regles: "g_p_regles",
    vocabulaire: "g_p_vocabulaire", boutiques: "g_p_boutiques", materiel: "g_p_materiel", messages: "g_p_messages" };
  function renderGuideHome() {
    const doors = $("#guide-portes");
    if (!doors) return;
    const counts = { recettes: recettesVivantes().length, vocabulaire: $$("#fiches-vocabulaire .fiche").length };
    doors.innerHTML = $$(".guide-onglets [data-guide]").filter(a => a.dataset.guide !== "accueil").map(a =>
      '<button type="button" class="ga-porte" data-porte="' + attr(a.getAttribute("href").slice(1)) + '"><b>' + attr(a.textContent.trim()) + "</b><span>" +
      attr(I18N.t(DOORS[a.dataset.guide] || "g_p_autre", { n: counts[a.dataset.guide] || 0 })) + "</span></button>").join("");
    const zone = $("#guide-pour-toi");
    const lastCup = DATA.state.extractions.slice().sort((a, b) => String(b.date_heure).localeCompare(String(a.date_heure)))[0];
    const coffee = lastCup ? DATA.cafeDe(lastCup) : null;
    const p = coffee && typeof profilCafe === "function" ? profilCafe(coffee) : null;
    const k = p && p.ligne && p.colonne ? MATRICE_CAFE_RECETTE.cases[p.ligne + "|" + p.colonne] : null;
    const suggested = k ? [k.recette, k.autre].filter(Boolean).map(id => DATA.state.recettes.find(r => r.id === id)).filter(Boolean) : [];
    zone.hidden = !suggested.length;
    if (!suggested.length) { zone.innerHTML = ""; return; }
    zone.innerHTML = '<h3 id="guide-pour-toi-titre" class="ga-h">' + attr(I18N.t("g_pour_toi", { c: I18N.tr(coffee.nom) })) + "</h3>" +
      '<div class="ga-cartes">' + suggested.map((r, i) => {
        const rating = homeRating(r);
        return '<button type="button" class="ga-carte' + (i === 0 ? " premiere" : "") + '" data-pour-toi="' + r.id + '">' +
          '<span class="ga-sur">' + attr(I18N.t(i === 0 ? "g_depart" : "g_essayer")) + "</span>" +
          "<b>" + attr(I18N.tr(r.nom)) + "</b>" +
          '<span class="ga-params">' + attr([r.methode, i === 0 && k.temp ? k.temp : r.temp ? r.temp + " °C" : ""].filter(Boolean).join(" · ")) + "</span>" +
          '<span class="ga-note">' + (rating ? I18N.t("g_chez_toi", { m: rating }) : I18N.t("rb_jamais")) + "</span></button>";
      }).join("") + "</div>";
  }

  /* THE GUIDE SEARCH (L5). An index built once, on the first character: the
     recipes, the vocabulary cards and the headings of each section. Accents
     do not count: "cafe" finds "café". */
  let guideIndex = null;
  const stripAccents = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  function buildIndex() {
    const idx = [];
    recettesVivantes().forEach(r => idx.push({ type: "g_t_recette", titre: I18N.tr(r.nom), detail: [r.methode, I18N.tr(r.sousTitre || "")].filter(Boolean).join(" · "), recette: r.id }));
    $$("#fiches-vocabulaire .fiche").forEach(f => {
      const s = f.querySelector("summary");
      if (s) idx.push({ type: "g_t_mot", titre: s.textContent.trim(), detail: (f.querySelector(".fiche-corps") || f).textContent.trim().replace(/\s+/g, " ").slice(0, 90), el: f });
    });
    $$(".guide-panneau").forEach(p => {
      if (p.id === "gp-accueil" || p.id === "gp-recettes" || p.id === "gp-vocabulaire") return;
      p.querySelectorAll("h2, h3, h4").forEach(h => {
        const nextEl = h.nextElementSibling;
        idx.push({ type: "g_t_conseil", titre: h.textContent.trim(), detail: nextEl ? nextEl.textContent.trim().replace(/\s+/g, " ").slice(0, 90) : "", el: h });
      });
    });
    return idx.map(x => ({ ...x, cle: stripAccents(x.titre + " " + x.detail) }));
  }
  let matches = [];
  function searchGuide() {
    const q = stripAccents($("#guide-recherche").value.trim());
    const zone = $("#guide-resultats");
    if (!q) { zone.innerHTML = ""; return; }
    if (!guideIndex) guideIndex = buildIndex();
    // Title first: a word found in the title ranks above a word found in the text.
    matches = guideIndex.filter(x => x.cle.includes(q))
      .sort((a, b) => Number(!stripAccents(a.titre).includes(q)) - Number(!stripAccents(b.titre).includes(q))).slice(0, 8);
    zone.innerHTML = matches.length
      ? matches.map((x, i) => '<button type="button" class="ga-resultat" data-resultat="' + i + '"><span class="ga-type">' + attr(I18N.t(x.type)) + "</span><b>" +
          attr(x.titre) + "</b><span>" + attr(x.detail) + "</span></button>").join("")
      : '<p class="ga-rien">' + attr(I18N.t("g_rien", { q: $("#guide-recherche").value.trim() })) + "</p>";
  }
  function goToResult(i) {
    const x = matches[i];
    if (!x) return;
    if (x.recette) { montrerRecette(x.recette); return; }
    const panel = x.el.closest(".guide-panneau");
    if (!panel) return;
    const heading = panel.querySelector("h2");
    montrerGuide(heading && heading.id ? heading.id : null);
    if (x.el.tagName === "DETAILS") x.el.open = true;
    x.el.scrollIntoView({ behavior: "smooth", block: "start" });
    x.el.classList.add("recette-montree");
    setTimeout(() => x.el.classList.remove("recette-montree"), 1800);
  }

  function rendreRecettes() {
    rendreMatrice();
    renderGuideHome();
    guideIndex = null;
    const list = recettesVivantes();
    const rendered = new Set();
    const cards = [];
    list.forEach(r => {
      if (rendered.has(r.id)) return;
      if (r.famille) {
        const group = list.filter(x => x.famille === r.famille);
        if (group.length > 1) {
          group.forEach(x => rendered.add(x.id));
          const memo = familleSelection[r.famille];
          const sel = group.find(x => x.id === memo) || group[0];
          cards.push(carteRecette(sel, group));
          return;
        }
      }
      rendered.add(r.id);
      cards.push(carteRecette(r, null));
    });
    $("#grille-recettes").innerHTML = cards.join("");
    applyFilter();

    rendreTetsu();

    $$("[data-var-fam]").forEach(b => b.addEventListener("click", () => {
      familleSelection[b.dataset.varFam] = b.dataset.varId;
      rendreRecettes();
    }));
    $$("[data-bascule]").forEach(b => b.addEventListener("click", () => {
      const card = b.closest(".recette-carte");
      const expand = card.classList.contains("repliee");
      card.classList.toggle("repliee", !expand);
      b.setAttribute("aria-expanded", String(expand));
      basculerRecette(b.dataset.bascule, expand);
    }));
    $$("[data-brasser]").forEach(b => b.addEventListener("click", () => brasserRecette(b.dataset.brasser)));
    $$("[data-pasapas]").forEach(b => b.addEventListener("click", () => ouvrirPasAPas(b.dataset.pasapas)));
    $$("#grille-recettes [data-video]").forEach(b => b.addEventListener("click", () => startVideo(b)));
    $$("[data-recette-edit]").forEach(b => b.addEventListener("click", () => {
      UI.ouvrirModaleRecettes();
      UI.ouvrirFormRecette(b.dataset.recetteEdit);
    }));
  }

  function versementsTetsu() {
    const v40 = TETSU.premier40.find(v => v.id === tetsuChoix.p40);
    const v60 = TETSU.dernier60.find(v => v.id === tetsuChoix.p60);
    const r = recetteAvecVariantes();
    const water = r ? r.eau : 300;
    return { pours: TETSU.versements(water, v40, v60), v40, v60, eau: water };
  }

  function rendreTetsu() {
    const block = $("#tetsu-bloc");
    if (!block) return;
    const { pours, v40, v60, eau: water } = versementsTetsu();
    let total = 0;
    const lines = pours.map((p, i) => {
      total += p;
      const phase = i < 2 ? "40 %" : "60 %";
      return "<li><span class=\"etape-temps\">" + (i + 1) + "</span><span>" +
        I18N.t("te_ligne", { p, c: total }) + " <small>(" + phase + ")</small></span></li>";
    }).join("");
    block.innerHTML =
      '<div class="tetsu-groupe"><span class="label">' + I18N.t("te_40") + "</span>" +
      '<div class="tetsu-options">' + TETSU.premier40.map(v =>
        '<button type="button" class="pilule' + (v.id === tetsuChoix.p40 ? " actif" : "") + '" data-t40="' + v.id + '">' + I18N.tr(v.nom) + "</button>").join("") +
      "</div></div>" +
      '<div class="tetsu-groupe"><span class="label">' + I18N.t("te_60") + "</span>" +
      '<div class="tetsu-options">' + TETSU.dernier60.map(v =>
        '<button type="button" class="pilule' + (v.id === tetsuChoix.p60 ? " actif" : "") + '" data-t60="' + v.id + '">' + I18N.tr(v.nom) + "</button>").join("") +
      "</div></div>" +
      '<ul class="tetsu-versements">' + lines + "</ul>" +
      '<p class="tetsu-detail">' + I18N.tr(v40.detail) + " " + I18N.tr(v60.detail) + " " + I18N.t("te_fin") + "</p>";
    $$("[data-t40]").forEach(b => b.addEventListener("click", () => { tetsuChoix.p40 = b.dataset.t40; rendreTetsu(); }));
    $$("[data-t60]").forEach(b => b.addEventListener("click", () => { tetsuChoix.p60 = b.dataset.t60; rendreTetsu(); }));
  }

  // ---------- Step-by-step mode ----------

  const pap = { recette: null, etapes: [], index: -1, depart: null, interval: null };

  /* The computation lives in recettes.js, without DOM, so it is testable
     without a browser. Here we only read the field. 1 means "nothing to
     scale", and the texts then stay intact down to the character. */
  function facteurEau(recette) {
    const targetWater = parseFloat($("#f-eau").value);
    if (!recette || !(recette.eau > 0) || !(targetWater > 0)) return 1;
    return targetWater / recette.eau;
  }

  function etapesPour(recette) {
    const f = facteurEau(recette);
    const mettreAEchelle = list => f === 1 ? list
      : list.map(e => ({ ...e, texte: echelleVersements(e.texte, f) }));
    // Translated BEFORE scaling (v8.77): the original sentence is the key.
    const traduire = list => list.map(e => ({ ...e, texte: I18N.tr(e.texte) }));
    if (recette.variantes) {
      const { pours } = versementsTetsu();
      let total = 0;
      /* The TOTAL first, like every other recipe (« jusqu'à 90 g »): the pour
         alone (30, 60, then 45) could not be read on the scale, and the Brew
         mode, which looks for « à X g », showed 60 instead of 90. */
      /* BY EYE, no schedule (v8.99): Tetsu pours when the water has almost all
         drained, and his 45 seconds hold for 20 g and 60 g pours. At 15 g
         the bed is thinner, it empties sooner, and the timer made you wait
         over a dry bed. The Brew mode advances with a tap. */
      return mettreAEchelle(pours.map((p, i) => {
        total += p;
        return { t: null, texte: i === 0
          ? I18N.t("pap_premier", { c: total, b: I18N.t("pap_bloom") })
          : I18N.t("pap_verser", { p, c: total, b: I18N.t("pap_lit") }) };
      }).concat([{ t: null, texte: I18N.t("pap_drain") }]));
    }
    return mettreAEchelle(traduire(recette.etapes));
  }

  function ouvrirPasAPas(recipeId) {
    const r = DATA.state.recettes.find(x => x.id === recipeId);
    if (!r) return;
    pap.recette = r;
    pap.etapes = etapesPour(r);
    pap.index = -1;
    clearInterval(pap.interval);
    pap.depart = null;
    $("#pap-titre").textContent = r.nom;
    $("#pap-chrono").textContent = "0:00";
    $("#pap-params").textContent = r.dose + " g / " + r.eau + " g, " + I18N.tr(r.tempTexte) + ", " + I18N.t("molette") + " " + r.dial + ", " + I18N.tr(r.totalTexte);
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
    // Automatic advance on timed steps.
    const nextIdx = pap.index + 1;
    if (nextIdx < pap.etapes.length && pap.etapes[nextIdx].t !== null && s >= pap.etapes[nextIdx].t) {
      pap.index = nextIdx;
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

  // ---------- Reference: converter and tables ----------

  /* Live advice under the grinder slider. Three questions, in this order:
     does it work on MY brewers, what taste does it give if I move, and how
     far am I from my saved setting. Nothing invented: the ranges come from
     GRIND, the gap is counted in clicks. */
  function conseilMouture(p) {
    const brikkaOk = GRIND.verifierPlage("Brikka", GRIND.dialDepuisCrans(p.crans)).ok;
    const switchOk = GRIND.verifierPlage("Switch", GRIND.dialDepuisCrans(p.crans)).ok;
    const lines = [];

    if (brikkaOk && switchOk) lines.push("<b>" + I18N.t("cm_deux") + "</b>");
    else if (brikkaOk) lines.push("<b>" + I18N.t("cm_brikka") + "</b>");
    else if (switchOk) lines.push("<b>" + I18N.t("cm_switch") + "</b>");
    else lines.push('<b class="conv-hors">' + I18N.t("cm_aucune") + "</b>");

    lines.push(I18N.t("cm_plus_fin"));
    lines.push(I18N.t("cm_plus_grossier"));

    // Gap to the saved setting, in clicks, the unit the hand understands.
    const d = GRIND.parseDial(replis.molette);
    if (d) {
      const gap = p.crans - d.crans;
      lines.push(gap === 0
        ? I18N.t("cm_actuel", { m: replis.molette })
        : I18N.t("cm_ecart", {
          n: Math.abs(gap),
          sens: I18N.t(gap > 0 ? "cm_ouvrir" : "cm_fermer"),
          m: replis.molette,
        }));
    }
    return lines.map(x => "<p>" + x + "</p>").join("");
  }

  const rendreConvertisseurDifferee = antiRebond(() => rendreConvertisseur(), 90);

  function rendreConvertisseur() {
    const text = $("#conv-dial").value.trim().replace(/,/g, ".");
    const zone = $("#conv-resultat");
    const p = GRIND.parseDial(text);
    if (!p) {
      zone.innerHTML = '<span class="conv-erreur">' + I18N.t("cv_erreur") + "</span>";
      $("#conv-conseil").innerHTML = "";
      $("#conv-appliquer").disabled = true;
      CHARTS.diagramme("reglette", null, replis.molette);
      return;
    }
    // The slider always follows the value, including when it comes from the text.
    if (Number($("#conv-slider").value) !== p.crans) $("#conv-slider").value = p.crans;
    peindreCurseur($("#conv-slider"));
    const compatible = GRIND.methodesCompatibles(p.microns).map(m => I18N.methode(m.nom));
    zone.innerHTML =
      '<span class="conv-chip"><b>' + p.crans + "</b> " + I18N.t("cv_crans") + "</span>" +
      '<span class="conv-chip">' + I18N.t("cv_environ") + " <b>" + Math.round(p.microns) + "</b> " + I18N.t("cv_microns") + "</span>" +
      '<span class="conv-chip">' + I18N.t("cv_bande") + " <b>" + GRIND.bande(p.microns).nom + "</b></span>" +
      '<span class="conv-chip">' + (compatible.length ? I18N.t("cv_compatible") + " <b>" + compatible.join(", ") + "</b>" : "<b>" + I18N.t("cv_hors") + "</b>") + "</span>";
    $("#conv-conseil").innerHTML = conseilMouture(p);
    $("#conv-appliquer").disabled = text === replis.molette;
    $("#conv-appliquer").textContent = text === replis.molette
      ? I18N.t("cv_deja") : I18N.t("cv_appliquer");
    CHARTS.diagramme("reglette", text, replis.molette);
  }

  // Marks under the slider: the reference positions, clickable.
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
      const highlight = m.id === "brikka" || m.id === "switch";
      const name = I18N.methode(m.nom);
      return "<tr" + (highlight ? ' class="ligne-perso"' : "") + "><td>" + (highlight ? "<b>" + name + "</b>" : name) + "</td>" +
        "<td>" + (m.minU === 0 ? I18N.t("plage_moins_u", { x: m.maxU }) : I18N.t("plage_a", { a: m.minU, b: m.maxU })) + "</td>" +
        "<td>" + (m.minC === 0 ? I18N.t("plage_moins_u", { x: m.maxC }) : I18N.t("plage_a", { a: m.minC, b: m.maxC })) + "</td>" +
        "<td><code>" + I18N.mol(m.molette) + "</code></td></tr>";
    }).join("");
  }

  // Made available to the other screens.
  /* Wiring of the Guide controls: grinder, step by step, copy buttons.
     Called once by app.js. */
  function cablerGuide() {
    $("#conv-dial").addEventListener("input", rendreConvertisseurDifferee);
    $("#conv-slider").addEventListener("input", () => {
      $("#conv-dial").value = GRIND.dialDepuisCrans(Number($("#conv-slider").value));
      /* IMMEDIATE, and it is a deliberate change. The debounce added in v7.57
         covered a full SVG redraw on each click; since the ruler skeleton
         is built only once, only two attributes are left to move. Keeping
         the 90 ms wait would mean paying the cost without the benefit, on
         the only control of the site that is handled continuously. The text
         field keeps its debounce. */
      rendreConvertisseur();
    });
    /* The only path that really changes a setting from this screen. It writes
       the same fallback as the Settings screen, so there is only one source. */
    $("#conv-appliquer").addEventListener("click", async () => {
      const dial = $("#conv-dial").value.trim().replace(/,/g, ".");
      if (!GRIND.parseDial(dial)) { toast(I18N.t("t_mouture_invalide")); return; }
      replis.molette = dial;
      await ecrireReplis();
      rendreConvertisseur();
      if ($("#param-molette")) $("#param-molette").value = dial;
      toast(I18N.t("t_molette_appliquee", { m: dial }));
    });
    $("#pap-demarrer").addEventListener("click", papDemarrer);
    $("#pap-suivant").addEventListener("click", papSuivant);
    $("#modale-pas-a-pas").addEventListener("close", () => clearInterval(pap.interval));
    $("#btn-gerer-recettes").addEventListener("click", () => UI.ouvrirModaleRecettes());
    $$("#biblio-filtres [data-filtre]").forEach(b => b.addEventListener("click", () => {
      filtre.valeur = b.dataset.filtre;
      try { localStorage.setItem("guide-filtre", filtre.valeur); } catch (e) { /* never mind */ }
      applyFilter();
    }));
    $$(".guide-onglets [data-guide]").forEach(a => a.addEventListener("click", ev => {
      ev.preventDefault();
      montrerGuide(a.getAttribute("href").slice(1));
    }));
    // At startup: the remembered tab, otherwise the Guide home (L5).
    let tab = "accueil";
    try { tab = localStorage.getItem("guide-onglet") || "accueil"; } catch (e) { /* home */ }
    const panel = $("#gp-" + tab) || $("#gp-accueil");
    $("#guide-recherche").addEventListener("input", searchGuide);
    $("#guide-resultats").addEventListener("click", ev => {
      const b = ev.target.closest("[data-resultat]");
      if (b) goToResult(Number(b.dataset.resultat));
    });
    $("#guide-portes").addEventListener("click", ev => {
      const b = ev.target.closest("[data-porte]");
      if (b) montrerGuide(b.dataset.porte);
    });
    $("#guide-pour-toi").addEventListener("click", ev => {
      const b = ev.target.closest("[data-pour-toi]");
      if (b) montrerRecette(b.dataset.pourToi);
    });
    const heading = panel && panel.querySelector("h2");
    montrerGuide(heading && heading.id ? heading.id : null);

    // Copy buttons for the Vietnamese messages
    $$("[data-copier]").forEach(b => b.addEventListener("click", async () => {
      const block = document.getElementById(b.dataset.copier);
      const text = block ? block.textContent.trim() : "";
      try {
        await navigator.clipboard.writeText(text);
        toast(I18N.t("t_copie"));
      } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        toast(I18N.t("t_copie"));
      }
    }));
  }

  Object.assign(UI, { majVideoAside,
    cablerGuide, carteRecette, chezToi, conseilMouture, montrerGuide, montrerRecette, profilsRecette, etapesPour, facteurEau, familleSelection, ouvrirPasAPas,
    pap, papDemarrer, papSuivant, papTic, rendreConvertisseur, rendreConvertisseurDifferee,
    rendrePapEtapes, rendreRecettes, rendreReperesMouture, rendreTablePlages, rendreTetsu,
    tetsuChoix, versementsTetsu,
  });
})();
