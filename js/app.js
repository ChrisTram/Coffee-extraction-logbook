// Application : navigation, tableau de bord, saisie, historique, référence.
"use strict";

(() => {

  // ---------- Petits outils ----------

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  function toast(message) {
    const t = $("#toast");
    t.textContent = message;
    t.removeAttribute("hidden");
    clearTimeout(toast._h);
    toast._h = setTimeout(() => t.setAttribute("hidden", ""), 2600);
  }

  function fmtTemps(s) {
    if (s === "" || s === null || s === undefined || isNaN(s)) return "";
    const m = Math.floor(s / 60), sec = Math.round(s % 60);
    return m + ":" + String(sec).padStart(2, "0");
  }

  function fmtVND(n) {
    if (n === "" || n === null || isNaN(n)) return "";
    return Math.round(n).toLocaleString("fr-FR") + " ₫";
  }

  function cleLocale(d) {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const j = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + j;
  }

  function maintenantLocal() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  function fmtDateHeure(dh) {
    const d = new Date(dh);
    if (isNaN(d)) return dh;
    return d.toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" }) + " " +
      d.toLocaleTimeString(I18N.locale(), { hour: "2-digit", minute: "2-digit" });
  }

  // "2026-08-12" vers "12 août 2026", en construisant la date en LOCAL
  // (new Date("2026-08-12") serait interprété en UTC).
  function fmtDateCourte(s) {
    const [a, m, j] = String(s).split("-").map(Number);
    if (!a || !m || !j) return s;
    return new Date(a, m - 1, j).toLocaleDateString(I18N.locale(), { day: "numeric", month: "short", year: "numeric" });
  }

  function fmtDecimal(n, dec) {
    return Number(n.toFixed(dec)).toLocaleString(I18N.locale(), { maximumFractionDigits: dec });
  }

  function animerCompteur(el, cible, decimales, suffixe) {
    const duree = 750, depart = performance.now();
    const dec = decimales || 0;
    function pas(t) {
      const p = Math.min(1, (t - depart) / duree);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = cible * eased;
      el.textContent = v.toLocaleString(I18N.locale(), { minimumFractionDigits: dec, maximumFractionDigits: dec }) + (suffixe || "");
      if (p < 1) requestAnimationFrame(pas);
    }
    requestAnimationFrame(pas);
  }

  function moyenne(liste) {
    if (!liste.length) return null;
    return liste.reduce((a, b) => a + b, 0) / liste.length;
  }

  // Recettes vivantes (éditables, stockées avec les données).
  function recettesVivantes() { return DATA.state.recettes.filter(r => r.actif !== 0); }
  function recettesDeMethode(m) { return recettesVivantes().filter(r => r.methode === m); }
  function trouverRecette(nom) { return DATA.state.recettes.find(r => r.nom === nom); }
  function recetteAvecVariantes() { return recettesVivantes().find(r => r.variantes); }

  // ---------- Thème ----------

  function appliquerTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("theme", theme); } catch (e) { /* indisponible, tant pis */ }
    if (typeof Chart !== "undefined") {
      CHARTS.appliquerDefauts();
      rendreEcranCourant(true);
    }
  }

  try {
    const t = localStorage.getItem("theme");
    if (t) document.documentElement.setAttribute("data-theme", t);
  } catch (e) { /* indisponible */ }

  // ---------- Navigation ----------

  let ecranCourant = "tableau";

  function activerEcran(nom) {
    ecranCourant = nom;
    $$(".ecran").forEach(e => e.classList.remove("actif"));
    $$(".nav-btn").forEach(b => b.classList.toggle("actif", b.dataset.ecran === nom));
    const sec = $("#ecran-" + nom);
    if (sec) sec.classList.add("actif");
    if (location.hash !== "#" + nom) history.replaceState(null, "", "#" + nom);
    rendreEcranCourant();
    window.scrollTo({ top: 0 });
  }

  function rendreEcranCourant(force) {
    if (ecranCourant === "tableau") rendreTableau();
    else if (ecranCourant === "historique") rendreHistorique();
    else if (ecranCourant === "reference" && force) rendreConvertisseur();
  }

  // ---------- Tableau de bord ----------

  function extAvecCalculs() {
    return DATA.state.extractions.map(e => ({ ...e, _c: DATA.calculs(e) }));
  }

  // ---------- Insights automatiques ----------
  // Des phrases calculées, pas des graphiques en plus. Les règles sont
  // volontairement simples ET prudentes : il faut au moins MIN_SAMPLE
  // extractions notées dans CHACUN des groupes comparés, et au moins MIN_GAP
  // point d'écart, sinon on se tait. Avec une poignée d'extractions, n'importe
  // quelle corrélation est du bruit, et une phrase affirmative serait un
  // mensonge. Chaque règle retourne une chaîne déjà traduite, ou null.

  const MIN_SAMPLE = 3;
  const MIN_GAP = 0.4;
  const note1 = n => fmtDecimal(n, 1);

  // Compare des groupes nommés {cle: [notes]} et oppose le MEILLEUR au RESTE MIS
  // EN COMMUN, pas au deuxième.
  //
  // Pourquoi : la mouille se découpe en beaucoup de groupes fins (13 réglages de
  // molette sur le Switch dans la démo). Entre le premier et le deuxième l'écart
  // est alors toujours minuscule, même quand l'écart entre le meilleur et tout
  // le reste dépasse le point. Tester premier contre deuxième reviendrait à ne
  // jamais rien dire. Mettre le reste en commun donne en plus un effectif de
  // comparaison bien plus grand, donc une moyenne moins bruitée.
  //
  // Retourne null si moins de deux groupes atteignent MIN_SAMPLE, ou si l'écart
  // reste sous MIN_GAP.
  function bestOfGroups(groups) {
    const classes = Object.entries(groups)
      .filter(([, notes]) => notes.length >= MIN_SAMPLE)
      .map(([cle, notes]) => ({ cle, notes, moy: moyenne(notes) }))
      .sort((a, b) => b.moy - a.moy);
    if (classes.length < 2) return null;

    const gagnant = classes[0];
    const reste = classes.slice(1).flatMap(c => c.notes);
    const moyReste = moyenne(reste);
    if (gagnant.moy - moyReste < MIN_GAP) return null;
    return { gagnant, moyReste, nReste: reste.length };
  }

  function insightFraicheur(notees) {
    const groupes = { ins_frais_tot: [], ins_frais_median: [], ins_frais_tard: [] };
    notees.forEach(e => {
      const j = e._c.age_jours;
      if (j === "" || j < 0) return;
      if (j <= 7) groupes.ins_frais_tot.push(e.note_sur_10);
      else if (j <= 21) groupes.ins_frais_median.push(e.note_sur_10);
      else groupes.ins_frais_tard.push(e.note_sur_10);
    });
    const res = bestOfGroups(groupes);
    if (!res) return null;
    return I18N.t("ins_fraicheur", {
      quand: I18N.t(res.gagnant.cle),
      haut: note1(res.gagnant.moy),
      bas: note1(res.moyReste),
    });
  }

  function insightMouture(notees, methode) {
    const groupes = {};
    notees
      .filter(e => e.methode === methode && e.mouture_dial)
      .forEach(e => (groupes[e.mouture_dial] = groupes[e.mouture_dial] || []).push(e.note_sur_10));
    const res = bestOfGroups(groupes);
    if (!res) return null;
    return I18N.t("ins_mouture", {
      machine: methode,
      dial: res.gagnant.cle,
      haut: note1(res.gagnant.moy),
      bas: note1(res.moyReste),
    });
  }

  // Duel entre recettes d'une même famille : c'est la comparaison qui a du sens
  // (même méthode, même intention), contrairement à un classement global.
  function insightRecettes(notees) {
    const parFamille = {};
    notees.forEach(e => {
      const r = trouverRecette(e.recette);
      if (!r || !r.famille) return;
      const f = (parFamille[r.famille] = parFamille[r.famille] || {});
      (f[r.nom] = f[r.nom] || []).push(e.note_sur_10);
    });
    // Vrai duel, donc on ne parle QUE des familles où exactement deux recettes
    // ont assez d'extractions notées. À trois recettes ou plus, nommer une
    // perdante serait faux (elle n'est peut-être que deuxième).
    for (const famille of Object.keys(parFamille)) {
      const classes = Object.entries(parFamille[famille])
        .filter(([, notes]) => notes.length >= MIN_SAMPLE)
        .map(([nom, notes]) => ({ nom, moy: moyenne(notes) }))
        .sort((a, b) => b.moy - a.moy);
      if (classes.length !== 2) continue;
      if (classes[0].moy - classes[1].moy < MIN_GAP) continue;
      return I18N.t("ins_recettes", {
        gagnante: I18N.tr(classes[0].nom),
        perdante: I18N.tr(classes[1].nom),
        haut: note1(classes[0].moy),
        bas: note1(classes[1].moy),
      });
    }
    return null;
  }

  function insightPrechauffage(notees) {
    const avec = [], sans = [];
    notees
      .filter(e => e.methode === "Brikka")
      .forEach(e => (Number(e.eau_prechauffee) === 1 ? avec : sans).push(e.note_sur_10));
    if (avec.length < MIN_SAMPLE || sans.length < MIN_SAMPLE) return null;
    const mAvec = moyenne(avec), mSans = moyenne(sans);
    if (Math.abs(mAvec - mSans) < MIN_GAP) return null;
    const pour = mAvec > mSans;
    return I18N.t(pour ? "ins_prechauffe_pour" : "ins_prechauffe_contre", {
      haut: note1(pour ? mAvec : mSans),
      bas: note1(pour ? mSans : mAvec),
    });
  }

  function computeInsights(exts) {
    const notees = exts.filter(e => e.note_sur_10 !== "");
    const phrases = [
      insightFraicheur(notees),
      insightMouture(notees, "Brikka"),
      insightMouture(notees, "Switch"),
      insightRecettes(notees),
      insightPrechauffage(notees),
    ].filter(Boolean);

    if (phrases.length) return phrases;

    // Rien à dire : on explique POURQUOI plutôt que de laisser un cadre vide.
    // C'est la différence entre "pas assez de données" et "le site est cassé".
    const messages = [I18N.t("ins_vide", { n: MIN_SAMPLE })];
    if (!notees.some(e => e._c.age_jours !== "" && e._c.age_jours >= 0)) {
      messages.push(I18N.t("ins_vide_age"));
    }
    return messages;
  }

  function rendreInsights(exts) {
    $("#insights").innerHTML = computeInsights(exts)
      .map(p => "<li>" + p + "</li>")
      .join("");
  }

  // ---------- Calendrier d'activité ----------
  // 18 semaines et pas 26 : à raison d'une ou deux tasses par jour, six mois de
  // grille sont surtout six mois de cases vides, ce qui donne l'impression que
  // le calendrier ne marche pas.
  const SEMAINES_HEATMAP = 18;

  /* Résume la période affichée, sinon la grille ne dit rien de chiffré : nombre
     de tasses, jours actifs, et la plus longue série de jours consécutifs, qui
     est la seule chose vraiment motivante dans un calendrier d'habitude. */
  function resumeHeatmap(parJour) {
    const debut = new Date();
    debut.setHours(0, 0, 0, 0);
    debut.setDate(debut.getDate() - (SEMAINES_HEATMAP * 7 - 1));

    let tasses = 0, joursActifs = 0, serie = 0, meilleureSerie = 0;
    const jour = new Date(debut);
    const fin = new Date();
    fin.setHours(0, 0, 0, 0);
    while (jour <= fin) {
      const n = parJour[cleLocale(jour)] || 0;
      if (n > 0) {
        tasses += n;
        joursActifs += 1;
        serie += 1;
        if (serie > meilleureSerie) meilleureSerie = serie;
      } else {
        serie = 0;
      }
      jour.setDate(jour.getDate() + 1);
    }

    if (!tasses) return I18N.t("hm_resume_vide", { s: SEMAINES_HEATMAP });
    return I18N.t("hm_resume", {
      t: tasses,
      j: joursActifs,
      s: SEMAINES_HEATMAP,
      serie: meilleureSerie,
    });
  }

  function rendreTableau() {
    const exts = extAvecCalculs();
    const vide = exts.length === 0;
    $("#tableau-vide").hidden = !vide;
    $("#tableau-contenu").hidden = vide;
    if (vide) return;

    const auj = cleLocale(new Date());
    const maintenant = new Date();
    const lundi = new Date(maintenant);
    lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7));
    const cleLundi = cleLocale(lundi);
    const moisCourant = auj.slice(0, 7);
    const il7j = new Date(maintenant); il7j.setDate(il7j.getDate() - 7);

    const notes = exts.filter(e => e.note_sur_10 !== "").map(e => e.note_sur_10);
    const notes7j = exts.filter(e => e.note_sur_10 !== "" && new Date(e.date_heure) >= il7j).map(e => e.note_sur_10);

    // Caféine estimée par jour sur les 7 derniers jours.
    const mgCafeine = e => {
      const cafe = DATA.cafeDe(e);
      return cafeineMg(e.dose_g || 0, cafe ? cafe.espece : "", cafe ? cafe.pourcentage_cafe_reel : 100);
    };
    const cafeine7j = exts.filter(e => new Date(e.date_heure) >= il7j).reduce((a, e) => a + mgCafeine(e), 0);

    const kpis = [
      { valeur: exts.filter(e => e.date_heure.slice(0, 10) === auj).length, label: I18N.t("kpi_auj"), dec: 0 },
      { valeur: exts.filter(e => e.date_heure.slice(0, 10) >= cleLundi).length, label: I18N.t("kpi_semaine"), dec: 0 },
      { valeur: exts.length, label: I18N.t("kpi_total"), dec: 0 },
      { valeur: moyenne(notes) || 0, label: I18N.t("kpi_note"), dec: 1, sur10: true },
      { valeur: moyenne(notes7j) || 0, label: I18N.t("kpi_note7"), dec: 1, sur10: true },
      { valeur: Math.round(cafeine7j / 7), label: I18N.t("kpi_cafeine"), dec: 0, mg: true },
    ];
    $("#kpis").innerHTML = kpis.map(k =>
      '<div class="kpi"><div class="kpi-valeur"><span class="kpi-nombre"></span>' +
      (k.sur10 ? "<small> / 10</small>" : k.mg ? "<small> mg</small>" : "") +
      '</div><div class="kpi-label">' + k.label + "</div></div>"
    ).join("");
    $$("#kpis .kpi-nombre").forEach((el, i) => animerCompteur(el, kpis[i].valeur, kpis[i].dec));

    rendreInsights(exts);

    // 30 derniers jours : barres, note, grammes, caféine dans le tooltip
    const labels = [], comptes = [], moyennes = [], grammes = [], details = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const cle = cleLocale(d);
      const duJour = exts.filter(e => e.date_heure.slice(0, 10) === cle);
      labels.push(d.toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" }));
      comptes.push(duJour.length);
      const nJour = duJour.filter(e => e.note_sur_10 !== "").map(e => e.note_sur_10);
      moyennes.push(nJour.length ? +moyenne(nJour).toFixed(1) : null);
      const g = duJour.reduce((a, e) => a + (e.dose_g || 0), 0);
      grammes.push(duJour.length ? Math.round(g * 10) / 10 : null);
      if (!duJour.length) { details.push(""); continue; }
      const mg = duJour.reduce((a, e) => a + mgCafeine(e), 0);
      const nomsCafes = [...new Set(duJour.map(e => (DATA.cafeDe(e) || {}).nom).filter(Boolean))];
      details.push(I18N.t("tip_cafeine", { mg }) + "\n" + nomsCafes.join(", "));
    }
    CHARTS.barresEtLigne30j("g-30jours", labels, comptes, moyennes, grammes, details);

    // Heatmap
    const parJour = {}, infoParJour = {};
    exts.forEach(e => {
      const cle = e.date_heure.slice(0, 10);
      parJour[cle] = (parJour[cle] || 0) + 1;
    });
    Object.keys(parJour).forEach(cle => {
      const nJour = exts.filter(e => e.date_heure.slice(0, 10) === cle && e.note_sur_10 !== "").map(e => e.note_sur_10);
      if (nJour.length) infoParJour[cle] = "note moyenne " + moyenne(nJour).toFixed(1);
    });
    CHARTS.heatmap("g-heatmap", parJour, infoParJour, SEMAINES_HEATMAP);
    $("#heatmap-resume").textContent = resumeHeatmap(parJour);

    // Note moyenne par café
    const parCafe = {};
    exts.forEach(e => {
      if (e.note_sur_10 === "") return;
      (parCafe[e._c.cafe_nom] = parCafe[e._c.cafe_nom] || []).push(e.note_sur_10);
    });
    const itemsCafes = Object.entries(parCafe)
      .map(([nom, ns]) => ({ label: I18N.tr(nom), value: +moyenne(ns).toFixed(1), extra: I18N.t("b_extractions", { n: ns.length }), nomBrut: nom }))
      .sort((a, b) => b.value - a.value);
    // Le café de référence (étalon) ressort en vert.
    const couleursCafes = itemsCafes.map(i => {
      const c = DATA.state.cafes.find(x => x.nom === i.nomBrut);
      return c && (c.tag || "").includes("référence") ? CHARTS.C_DEUX : undefined;
    });
    const accentCafes = couleursCafes.some(Boolean) ? couleursCafes.map(c => c || getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()) : null;
    CHARTS.barresHorizontales("g-cafes", itemsCafes, accentCafes, I18N.t("axe_note_moy"), 10);

    // Duel Brikka contre Switch
    const brikka = exts.filter(e => e.methode === "Brikka");
    const swtch = exts.filter(e => e.methode === "Switch");
    const nB = brikka.filter(e => e.note_sur_10 !== "").map(e => e.note_sur_10);
    const nS = swtch.filter(e => e.note_sur_10 !== "").map(e => e.note_sur_10);
    $("#duel-machines").innerHTML =
      '<div class="duel-col brikka"><b>' + brikka.length + "</b><span>" + I18N.t("d_ext_brikka") + "</span><b>" +
      (nB.length ? moyenne(nB).toFixed(1) : "...") + "</b><span>" + I18N.t("d_note") + "</span></div>" +
      '<div class="duel-col switch"><b>' + swtch.length + "</b><span>" + I18N.t("d_ext_switch") + "</span><b>" +
      (nS.length ? moyenne(nS).toFixed(1) : "...") + "</b><span>" + I18N.t("d_note") + "</span></div>";

    // Cafés passés dans les deux machines
    const cafesDeux = DATA.state.cafes.filter(c => {
      const eb = exts.some(e => e.cafe_id === c.id && e.methode === "Brikka" && e.note_sur_10 !== "");
      const es = exts.some(e => e.cafe_id === c.id && e.methode === "Switch" && e.note_sur_10 !== "");
      return eb && es;
    });
    CHARTS.comparatifMachines("g-duel",
      cafesDeux.map(c => c.nom),
      cafesDeux.map(c => +moyenne(exts.filter(e => e.cafe_id === c.id && e.methode === "Brikka" && e.note_sur_10 !== "").map(e => e.note_sur_10)).toFixed(1)),
      cafesDeux.map(c => +moyenne(exts.filter(e => e.cafe_id === c.id && e.methode === "Switch" && e.note_sur_10 !== "").map(e => e.note_sur_10)).toFixed(1)));

    // Nuages
    const pts = m => exts
      .filter(e => e.methode === m && e.note_sur_10 !== "" && e._c.microns !== "")
      .map(e => ({ x: e._c.microns, y: e.note_sur_10, nom: e._c.cafe_nom + ", " + e.mouture_dial }));
    CHARTS.nuage("g-mouture", pts("Brikka"), pts("Switch"), I18N.t("axe_mouture"), "µm");

    const ptsAge = m => exts
      .filter(e => e.methode === m && e.note_sur_10 !== "" && e._c.age_jours !== "" && e._c.age_jours >= 0)
      .map(e => ({ x: e._c.age_jours, y: e.note_sur_10, nom: e._c.cafe_nom }));
    CHARTS.nuage("g-age", ptsAge("Brikka"), ptsAge("Switch"), I18N.t("axe_age"), I18N.t("unite_jours"));

    // Diagnostics
    const parDiag = {};
    exts.forEach(e => (e.diagnostic || "").split("|").filter(Boolean).forEach(d => {
      parDiag[d] = (parDiag[d] || 0) + 1;
    }));
    const diagLabels = DIAGNOSTICS.filter(d => parDiag[d]);
    CHARTS.anneauDiagnostics("g-diagnostics", diagLabels, diagLabels.map(d => parDiag[d]));

    // Note par recette
    const parRecette = {};
    exts.forEach(e => {
      if (e.note_sur_10 === "" || !e.recette) return;
      (parRecette[e.recette] = parRecette[e.recette] || []).push(e.note_sur_10);
    });
    const itemsRecettes = Object.entries(parRecette)
      .map(([nom, ns]) => ({ label: nom, value: +moyenne(ns).toFixed(1), extra: I18N.t("b_extractions", { n: ns.length }) }))
      .sort((a, b) => b.value - a.value);
    const couleursRecettes = itemsRecettes.map(i => {
      const r = trouverRecette(i.label);
      return r ? (r.methode === "Brikka" ? CHARTS.C_BRIKKA : CHARTS.C_SWITCH) : CHARTS.C_DEUX;
    });
    CHARTS.barresHorizontales("g-recettes", itemsRecettes, couleursRecettes, I18N.t("axe_note_moy"), 10);

    // 5 dernières
    const dernieres = [...exts].sort((a, b) => b.date_heure.localeCompare(a.date_heure)).slice(0, 5);
    $("#dernieres-liste").innerHTML = dernieres.map(e =>
      "<li><span class=\"pastille-methode " + e.methode.toLowerCase() + "\"></span>" +
      "<div><span class=\"derniere-cafe\">" + I18N.tr(e._c.cafe_nom) + "</span>" +
      "<div class=\"derniere-infos\">" + fmtDateHeure(e.date_heure) + " · " + e.methode +
      (e.recette ? " · " + e.recette : "") + (e.mouture_dial ? " · " + I18N.t("molette") + " " + e.mouture_dial : "") +
      (e.diagnostic ? " · " + diagsAffiches(e.diagnostic) : "") + "</div></div>" +
      "<span class=\"derniere-note\">" + (e.note_sur_10 !== "" ? e.note_sur_10 + "<small>/10</small>" : "") + "</span></li>"
    ).join("");
  }

  // ---------- Saisie ----------

  // Dose prise quand rien ne la preremplit (recette sans dose, formulaire
  // vierge). 15 g est la dose de toutes les recettes Switch d'origine.
  const DEFAULT_DOSE_G = 15;

  const saisie = {
    methode: "Brikka",
    descripteurs: new Set(),
    diagnostics: new Set(),
    editId: null,
  };

  // "Sous-extrait (acide)|Astringent" vers un affichage traduit "Under-extracted (sour), Astringent".
  function diagsAffiches(s) {
    return (s || "").split("|").filter(Boolean).map(d => I18N.diag(d)).join(", ");
  }

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
      const defaut = liste.find(r => r.parDefaut);
      if (defaut) sel.value = defaut.nom;
    }
  }

  function choisirMethode(m, garderRecette) {
    saisie.methode = m;
    $$(".btn-methode").forEach(b => b.classList.toggle("actif", b.dataset.methode === m));
    // Champs propres à chaque méthode.
    $("#champ-ajout-eau").hidden = m !== "Brikka";
    $("#champ-prechauffe").hidden = m !== "Brikka";
    $("#champ-agitation").hidden = m !== "Switch";
    // Tasse par défaut : Flat White Egg en Brikka, Classic Mug en Switch.
    const defauts = { "Brikka": "Loveramics Flat White Egg", "Switch": "Classic Mug" };
    const tasseActuelle = $("#f-tasse").value;
    if ((tasseActuelle === "" || Object.values(defauts).includes(tasseActuelle)) &&
        DATA.state.tasses.some(t => t.nom === defauts[m])) {
      $("#f-tasse").value = defauts[m];
    }
    if (!garderRecette) remplirSelectRecettes();
    majAvertissements();
    majLive();
  }

  // La recette demande-t-elle de remuer ? Coche l'agitation par défaut.
  function majAgitationDepuisRecette() {
    const r = trouverRecette($("#f-recette").value);
    if (!r || r.methode !== "Switch") return;
    const remue = etapesPour(r).some(e => /remuer/i.test(e.texte));
    $("#f-agitation-oui").checked = remue;
    $("#f-agitation").hidden = !remue;
    if (remue && !$("#f-agitation").value) $("#f-agitation").value = 1;
  }

  // Champ lait : visible quand la recette le prévoit, prérempli depuis la tasse.
  function majLait() {
    const r = trouverRecette($("#f-recette").value);
    const visible = !!(r && r.lait);
    $("#champ-lait").hidden = !visible;
    if (!visible) return;
    const tasse = DATA.state.tasses.find(t => t.nom === $("#f-tasse").value);
    const dose = parseFloat($("#f-dose").value) || 14;
    const eau = parseFloat($("#f-eau").value) || 100;
    const volCafe = Math.max(0, Math.round((eau - 0.7 * dose) / 5) * 5);
    if (tasse) {
      const lait = Math.max(0, tasse.contenance_ml - volCafe);
      $("#f-lait").value = lait;
      $("#lait-hint").textContent = lait === 0
        ? I18N.t("lait_trop_petit")
        : I18N.t("lait_calc", { l: lait, t: tasse.contenance_ml, v: volCafe });
    } else {
      $("#lait-hint").textContent = I18N.t("lait_choisir_tasse");
    }
  }

  // Tasses : liste déroulante, avertissement de contenance, mini éditeur.
  function remplirSelectTasses() {
    const sel = $("#f-tasse");
    const v = sel.value;
    sel.innerHTML = '<option value=""></option>' + DATA.state.tasses.map(t =>
      '<option value="' + t.nom + '">' + t.nom + " · " + t.contenance_ml + " ml</option>").join("");
    if (v && DATA.state.tasses.some(t => t.nom === v)) sel.value = v;
  }

  function majAvertTasse() {
    const zone = $("#tasse-avert");
    const tasse = DATA.state.tasses.find(t => t.nom === $("#f-tasse").value);
    if (!tasse) { zone.textContent = ""; return; }
    const dose = parseFloat($("#f-dose").value);
    const eau = parseFloat($("#f-eau").value);
    if (!(dose > 0 && eau > 0)) { zone.textContent = ""; return; }
    const volCafe = Math.max(0, Math.round(saisie.methode === "Brikka" ? eau - 0.7 * dose : eau - 2.1 * dose));
    const ajout = !$("#champ-ajout-eau").hidden && $("#f-ajout-eau-oui").checked ? (parseFloat($("#f-eau-ajoutee").value) || 0) : 0;
    const lait = !$("#champ-lait").hidden ? (parseFloat($("#f-lait").value) || 0) : 0;
    const total = volCafe + ajout + lait;
    zone.classList.toggle("hint-alerte", total > tasse.contenance_ml);
    zone.textContent = total > tasse.contenance_ml
      ? I18N.t("tasse_deborde", { v: total, c: tasse.contenance_ml })
      : "";
  }

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
    $("#f-dose").value = r.dose || DEFAULT_DOSE_G;
    // L'eau reste vide (pas de balance pour la peser) et la température part
    // sur 95, l'eau bouillie qui a fini de buller. Les cibles de la recette
    // restent visibles dans le panneau latéral.
    $("#f-eau").value = "";
    $("#f-temp").value = 95;
    $("#f-mouture").value = cafeCourantMoulu() ? "" : r.dial;
    majAgitationDepuisRecette();
    majLait();
    majLive();
    majAvertissements();
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

  function majAvertissements() {
    const zone = $("#avertissements");
    const cafe = DATA.state.cafes.find(c => c.id === $("#f-cafe").value);
    const av = avertissementsCombinaison(cafe, saisie.methode, $("#f-recette").value, DATA.state.recettes);
    saisie.bloque = av.bloque;
    const msgs = av.msgs.slice();
    const dial = $("#f-mouture").value.trim();
    if (dial && !cafeCourantMoulu()) {
      const v = GRIND.verifierPlage(saisie.methode, dial);
      if (!v.ok) msgs.push(v.message);
    }
    zone.innerHTML = msgs.map((m, i) =>
      '<div class="avertissement' + (av.bloque && i === 0 ? " avertissement-bloquant" : "") + '">' + m + "</div>").join("");
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
      const etapes = etapesPour(r);
      zoneR.innerHTML =
        '<div class="aside-titre"><span class="pastille-methode ' + r.methode.toLowerCase() + '"></span><h4>' + r.nom + "</h4></div>" +
        (r.sousTitre ? '<p class="aside-sous">' + r.sousTitre + "</p>" : "") +
        '<div class="recette-params">' +
        '<span class="param-chip">' + r.dose + " g / " + r.eau + " g</span>" +
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
      if (btn) btn.addEventListener("click", () => ouvrirPasAPas(btn.dataset.r));
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

  function majLive() {
    const dose = parseFloat($("#f-dose").value);
    const eau = parseFloat($("#f-eau").value);
    const ratio = dose > 0 && eau > 0 ? "1:" + (eau / dose).toFixed(1) : "…";
    $("#live-ratio").innerHTML = I18N.t("lv_ratio") + " <b>" + ratio + "</b>";

    // Café déjà moulu : la molette ne s'applique pas, mouture par défaut du paquet.
    const moulu = cafeCourantMoulu();
    const champMouture = $("#f-mouture");
    champMouture.disabled = moulu;
    if (moulu && champMouture.value) champMouture.value = "";
    champMouture.placeholder = moulu ? I18N.t("paquet") : "1.5.0";

    const dial = champMouture.value.trim();
    const p = GRIND.parseDial(dial);
    const horsPlage = !moulu && p && !GRIND.verifierPlage(saisie.methode, dial).ok;
    $("#live-mouture").innerHTML = I18N.t("lv_mouture") + " <b>" +
      (moulu ? I18N.t("paquet")
        : p ? I18N.t("lv_detail", { c: p.crans, u: Math.round(p.microns) })
        : dial ? I18N.t("lv_invalide") : "…") + "</b>";
    $("#live-mouture").classList.toggle("hors-plage", !!horsPlage || (!moulu && dial !== "" && !p));
    // Détail affiché juste sous le champ molette.
    const detailMouture = $("#mouture-detail");
    if (moulu) {
      detailMouture.textContent = I18N.t("paquet");
      detailMouture.classList.remove("hint-alerte");
    } else if (p) {
      detailMouture.textContent = I18N.t("lv_detail", { c: p.crans, u: Math.round(p.microns) }) + " · " + GRIND.bande(p.microns).nom;
      detailMouture.classList.toggle("hint-alerte", !!horsPlage);
    } else {
      detailMouture.textContent = dial ? I18N.t("lv_invalide") : "";
      detailMouture.classList.toggle("hint-alerte", !!dial);
    }

    const cafe = DATA.state.cafes.find(c => c.id === $("#f-cafe").value);
    let cout = "…";
    if (cafe && cafe.prix_vnd && cafe.format_grammes && dose > 0) {
      cout = fmtVND(cafe.prix_vnd / cafe.format_grammes * dose);
      // Café non pur : seconde valeur, le coût rapporté au café réel.
      const pct = cafe.pourcentage_cafe_reel === "" || cafe.pourcentage_cafe_reel === undefined ? 100 : Number(cafe.pourcentage_cafe_reel);
      if (pct < 100 && pct > 0) {
        cout += " <small>(" + I18N.t("lv_cout_reel", { v: fmtVND(cafe.prix_vnd / (cafe.format_grammes * pct / 100) * dose) }) + ")</small>";
      }
    }
    $("#live-cout").innerHTML = I18N.t("lv_cout") + " <b>" + cout + "</b>";

    // Volume de la boisson : extraction plus eau ajoutée plus lait, en direct.
    const volBase = parseFloat($("#f-volume").value) ||
      (dose > 0 && eau > 0 ? Math.max(0, Math.round(saisie.methode === "Brikka" ? eau - 0.7 * dose : eau - 2.1 * dose)) : 0);
    const ajoutEau = !$("#champ-ajout-eau").hidden && $("#f-ajout-eau-oui").checked ? (parseFloat($("#f-eau-ajoutee").value) || 0) : 0;
    const laitMl = !$("#champ-lait").hidden ? (parseFloat($("#f-lait").value) || 0) : 0;
    const spanBoisson = $("#live-boisson");
    if (volBase > 0 && (ajoutEau > 0 || laitMl > 0)) {
      const parts = [];
      if (ajoutEau > 0) parts.push("+" + ajoutEau + " ml");
      if (laitMl > 0) parts.push("+" + laitMl + " ml " + I18N.t("lv_lait"));
      spanBoisson.hidden = false;
      spanBoisson.innerHTML = I18N.t("lv_boisson") + " <b>" + volBase + " ml (" + parts.join(", ") + ") = " + (volBase + ajoutEau + laitMl) + " ml</b>";
    } else {
      spanBoisson.hidden = true;
    }
    majAvertTasse();

    // Volume en tasse estimé : la Brikka retient un peu d'eau dans la chaudière
    // et le marc, le papier du Switch retient environ 2 g d'eau par gramme de café.
    const btnVol = $("#volume-estime");
    if (dose > 0 && eau > 0) {
      const brut = saisie.methode === "Brikka" ? eau - 0.7 * dose : eau - 2.1 * dose;
      const estime = Math.max(0, Math.round(brut / 5) * 5);
      btnVol.hidden = false;
      btnVol.textContent = I18N.t("vol_estime", { v: estime });
      btnVol.title = I18N.t("vol_titre", { m: saisie.methode });
      btnVol.dataset.valeur = estime;
    } else {
      btnVol.hidden = true;
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
    return etapesPour(r).filter(e => e.t !== null && e.t !== undefined);
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
    $("#f-total").value = total;
    const tOuv = tOuverture();
    if (tOuv !== null && total > tOuv) $("#f-ecoulement").value = total - tOuv;
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
  function majCorrectionDiagnostic() {
    $("#diagnostic-correction").innerHTML = DIAGNOSTICS
      .filter(d => saisie.diagnostics.has(d))
      .map(d => I18N.tr(DIAGNOSTIC_CORRECTIONS[d] || ""))
      .filter(Boolean).join("<br>");
  }

  function construirePilules() {
    // Diagnostics à choix MULTIPLE (une tasse peut être un peu amère ET
    // astringente). Chaque pilule porte sa correction en infobulle (data-info,
    // bulle CSS au survol).
    $("#f-diagnostic").innerHTML = DIAGNOSTICS.map(d =>
      '<button type="button" class="pilule" data-diag="' + d + '" data-info="' +
      I18N.tr(DIAGNOSTIC_CORRECTIONS[d] || "") + '">' + I18N.diag(d) + "</button>").join("");
    $$("#f-diagnostic .pilule").forEach(b => b.addEventListener("click", () => {
      const d = b.dataset.diag;
      if (saisie.diagnostics.has(d)) saisie.diagnostics.delete(d);
      else saisie.diagnostics.add(d);
      b.classList.toggle("actif", saisie.diagnostics.has(d));
      majCorrectionDiagnostic();
    }));

    // Descripteurs groupés par famille de la roue des saveurs. Chaque tag
    // porte sa définition en infobulle (data-info, bulle CSS au survol).
    $("#f-descripteurs").innerHTML = DESCRIPTEURS_GROUPES.map(g =>
      '<div class="tags-groupe"><span class="tags-groupe-nom">' + I18N.groupe(g.nom) + "</span>" +
      '<div class="tags">' + g.tags.map(d =>
        '<button type="button" class="tag" data-tag="' + d + '" data-info="' +
        I18N.tagInfo(d) + '">' + I18N.tag(d) + "</button>").join("") +
      "</div></div>").join("");
    $$("#f-descripteurs .tag").forEach(b => b.addEventListener("click", () => {
      const t = b.dataset.tag;
      if (saisie.descripteurs.has(t)) saisie.descripteurs.delete(t);
      else saisie.descripteurs.add(t);
      b.classList.toggle("actif", saisie.descripteurs.has(t));
    }));
  }

  function reinitialiserSaisie(garderCafe) {
    saisie.editId = null;
    saisie.diagnostics.clear();
    saisie.descripteurs.clear();
    $("#saisie-titre").textContent = I18N.t("s_nouvelle");
    $("#btn-enregistrer").textContent = I18N.t("s_enregistrer");
    $("#btn-annuler-edition").hidden = true;
    $("#f-date").value = maintenantLocal();
    $("#f-dose").value = DEFAULT_DOSE_G;
    if (!garderCafe) $("#f-cafe").value = "";
    $("#f-commentaire").value = "";
    $("#f-note").value = 7;
    $("#note-affichee").textContent = "7";
    $("#f-total").value = "";
    $("#f-ecoulement").value = "";
    $("#f-volume").value = "";
    $("#f-eau").value = "";
    $("#f-temp").value = 95;
    $("#f-prechauffe").checked = false;
    $("#f-ajout-eau-oui").checked = false;
    $("#f-eau-ajoutee").hidden = true;
    $("#f-eau-ajoutee").value = "";
    $("#f-lait").value = "";
    majAgitationDepuisRecette();
    majLait();
    $$("#f-diagnostic .pilule").forEach(x => x.classList.remove("actif"));
    $$("#f-descripteurs .tag").forEach(x => x.classList.remove("actif"));
    $("#diagnostic-correction").textContent = "";
    chronoRaz();
    majAvertissements();
    majLive();
  }

  function chargerExtractionDansSaisie(ext, duplication) {
    remplirSelectCafes(ext.cafe_id);
    saisie.editId = duplication ? null : ext.id;
    $("#f-date").value = duplication ? maintenantLocal() : ext.date_heure;
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
    $("#f-agitation-oui").checked = ext.agitation_nb !== "" && ext.agitation_nb !== undefined;
    $("#f-agitation").hidden = !$("#f-agitation-oui").checked;
    $("#f-agitation").value = ext.agitation_nb !== undefined && ext.agitation_nb !== "" ? ext.agitation_nb : 1;
    $("#f-tasse").value = ext.tasse || "";
    $("#f-lait").value = ext.lait_ml !== undefined ? ext.lait_ml : "";
    $("#champ-lait").hidden = !(trouverRecette(ext.recette) || {}).lait;
    $("#f-total").value = ext.temps_total_s;
    $("#f-ecoulement").value = ext.temps_ecoulement_s;
    $("#f-note").value = ext.note_sur_10 === "" ? 7 : ext.note_sur_10;
    $("#note-affichee").textContent = $("#f-note").value;
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
    activerEcran("saisie");
  }

  async function enregistrerSaisie(ev) {
    ev.preventDefault();
    if (!$("#f-dose").value) { toast(I18N.t("t_dose")); return; }
    if (saisie.bloque) { toast(I18N.t("t_bloque")); return; }
    const ext = {
      date_heure: $("#f-date").value || maintenantLocal(),
      cafe_id: $("#f-cafe").value,
      methode: saisie.methode,
      recette: $("#f-recette").value,
      dose_g: $("#f-dose").value,
      eau_g: $("#f-eau").value,
      mouture_dial: $("#f-mouture").value.trim().replace(/,/g, "."),
      temperature_c: $("#f-temp").value,
      temps_total_s: $("#f-total").value,
      temps_ecoulement_s: $("#f-ecoulement").value,
      volume_extrait_ml: $("#f-volume").value,
      eau_ajoutee_ml: saisie.methode === "Brikka" && $("#f-ajout-eau-oui").checked ? $("#f-eau-ajoutee").value : "",
      lait_ml: !$("#champ-lait").hidden ? $("#f-lait").value : "",
      agitation_nb: saisie.methode === "Switch" && $("#f-agitation-oui").checked ? ($("#f-agitation").value || 1) : "",
      tasse: $("#f-tasse").value,
      eau_prechauffee: saisie.methode === "Brikka" && $("#f-prechauffe").checked ? 1 : "",
      note_sur_10: $("#f-note").value,
      diagnostic: DIAGNOSTICS.filter(d => saisie.diagnostics.has(d)).join("|"),
      descripteurs: Array.from(saisie.descripteurs).join("|"),
      commentaire: $("#f-commentaire").value.trim(),
    };
    if (saisie.editId) {
      await DATA.modifierExtraction(saisie.editId, ext);
      toast(I18N.t("t_modifiee"));
      reinitialiserSaisie();
      activerEcran("historique");
    } else {
      await DATA.ajouterExtraction(ext);
      toast(I18N.t("t_enregistree"));
      reinitialiserSaisie(true);
      activerEcran("tableau");
    }
  }

  // ---------- Historique ----------

  const tri = { colonne: "date_heure", sens: -1 };

  function filtrerHistorique() {
    const exts = extAvecCalculs();
    const fCafe = $("#h-cafe").value;
    const fMethode = $("#h-methode").value;
    const fDiag = $("#h-diagnostic").value;
    const fNote = parseFloat($("#h-note-min").value);
    const fDu = $("#h-du").value;
    const fAu = $("#h-au").value;
    return exts.filter(e =>
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
    if (col === "ratio") return e._c.ratio === "" ? -1 : e._c.ratio;
    if (col === "mouture") return e._c.crans === "" ? -1 : e._c.crans;
    if (col === "note_sur_10") return e.note_sur_10 === "" ? -1 : e.note_sur_10;
    return e[col] === "" ? -1 : e[col];
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

    $$("#h-table th .tri").forEach(s => s.textContent = "");
    const th = $('#h-table th[data-tri="' + tri.colonne + '"] .tri');
    if (th) th.textContent = tri.sens > 0 ? "▲" : "▼";

    $("#h-corps").innerHTML = liste.map(e =>
      "<tr data-id=\"" + e.id + "\">" +
      "<td>" + fmtDateHeure(e.date_heure) + "</td>" +
      "<td>" + I18N.tr(e._c.cafe_nom) + "</td>" +
      '<td><span class="chip-methode ' + e.methode.toLowerCase() + '">' + e.methode + "</span></td>" +
      "<td>" + (e.recette || "") + "</td>" +
      "<td>" + (e.mouture_dial ? e.mouture_dial + " <small>(" + e._c.microns + " µm)</small>" : e._c.moulu ? "<small>" + I18N.t("paquet") + "</small>" : "") + "</td>" +
      "<td>" + e._c.ratioTexte + "</td>" +
      '<td class="note-cellule">' + (e.note_sur_10 !== "" ? e.note_sur_10 : "") + "</td>" +
      '<td class="chip-diagnostic">' + (e.diagnostic ? diagsAffiches(e.diagnostic) : "") + "</td>" +
      '<td><div class="actions-ligne">' +
      '<button class="btn-ligne" data-action="dupliquer" title="Dupliquer pour refaire la même">⧉</button>' +
      '<button class="btn-ligne" data-action="modifier" title="Modifier">✎</button>' +
      '<button class="btn-ligne danger" data-action="supprimer" title="Supprimer">🗑</button>' +
      "</div></td></tr>"
    ).join("");
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
      ouvrirModaleRecettes();
      ouvrirFormRecette(b.dataset.recetteEdit);
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

  function etapesPour(recette) {
    if (recette.variantes) {
      const { pours } = versementsTetsu();
      let cumul = 0;
      return pours.map((p, i) => {
        cumul += p;
        return { t: null, texte: I18N.t("pap_verser", { p, c: cumul, b: i === 0 ? I18N.t("pap_bloom") : "" }) };
      }).concat([{ t: null, texte: I18N.t("pap_drain") }]);
    }
    return recette.etapes;
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

  function rendreConvertisseur() {
    const texte = $("#conv-dial").value.trim();
    const zone = $("#conv-resultat");
    const p = GRIND.parseDial(texte);
    if (!p) {
      zone.innerHTML = '<span class="conv-erreur">' + I18N.t("cv_erreur") + "</span>";
      CHARTS.diagramme("reglette", null);
      return;
    }
    const compatibles = GRIND.methodesCompatibles(p.microns).map(m => I18N.methode(m.nom));
    zone.innerHTML =
      '<span class="conv-chip"><b>' + p.crans + "</b> " + I18N.t("cv_crans") + "</span>" +
      '<span class="conv-chip">' + I18N.t("cv_environ") + " <b>" + Math.round(p.microns) + "</b> " + I18N.t("cv_microns") + "</span>" +
      '<span class="conv-chip">' + I18N.t("cv_bande") + " <b>" + GRIND.bande(p.microns).nom + "</b></span>" +
      '<span class="conv-chip">' + (compatibles.length ? I18N.t("cv_compatible") + " <b>" + compatibles.join(", ") + "</b>" : "<b>" + I18N.t("cv_hors") + "</b>") + "</span>";
    CHARTS.diagramme("reglette", texte);
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

  // ---------- Gestion des cafés ----------

  let cafeEditId = null;

  function ouvrirModaleCafes() {
    rendreListeCafes();
    $("#form-cafe").hidden = true;
    const m = $("#modale-cafes");
    if (!m.open) m.showModal();
  }

  function rendreListeCafes() {
    // Actifs d'abord (ordre d'origine conservé), désactivés toujours en fin
    // de liste. Chaque café porte un badge de note moyenne (sur ses
    // extractions notées) et sa date d'ajout dans le système.
    const tri = [...DATA.state.cafes].sort((a, b) => (a.actif === 0 ? 1 : 0) - (b.actif === 0 ? 1 : 0));
    $("#cafes-liste").innerHTML = tri.map(c => {
      const notes = DATA.state.extractions
        .filter(e => e.cafe_id === c.id && e.note_sur_10 !== "")
        .map(e => Number(e.note_sur_10));
      const badgeNote = notes.length
        ? ' <span class="badge-note" title="' + I18N.t("b_extractions", { n: notes.length }) + '">★ ' +
          fmtDecimal(moyenne(notes), 1) + "</span>"
        : "";
      return '<div class="cafe-ligne' + (c.actif === 0 ? " inactif" : "") + '">' +
      "<div><b>" + c.nom + "</b>" + badgeNote +
      (Number(c.pourcentage_cafe_reel) < 100 ? ' <span class="badge-nonpur">' + c.pourcentage_cafe_reel + " % " + I18N.t("pct_cafe") + "</span>" : "") +
      ((c.tag || "").includes("référence") ? ' <span class="badge-reference">' + I18N.t("badge_etalon") + "</span>" : "") +
      "<div class=\"cafe-meta\">" +
      [c.torrefacteur, c.espece, c.procede,
        c.machine_recommandee ? I18N.t("li_machine", { m: I18N.machine(c.machine_recommandee) }) : "",
        c.prix_vnd ? fmtVND(c.prix_vnd) + " / " + c.format_grammes + " g" : "",
        c.date_ajout ? I18N.t("li_ajoute", { d: fmtDateCourte(c.date_ajout) }) : ""].filter(Boolean).join(" · ") +
      "</div></div>" +
      '<span class="cafe-meta">' + (c.actif === 0 ? I18N.t("li_inactif") : "") + "</span>" +
      '<button class="btn btn-petit" data-cafe-edit="' + c.id + '">' + I18N.t("btn_modifier") + "</button></div>";
    }).join("");
    $$("[data-cafe-edit]").forEach(b => b.addEventListener("click", () => ouvrirFormCafe(b.dataset.cafeEdit)));
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
    remplirSelectCafes();
    remplirFiltres();
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
    $("#r-temp-texte").value = r ? r.tempTexte : "";
    $("#r-dial").value = r ? r.dial : "1.5.0";
    $("#r-ratio-texte").value = r ? r.ratioTexte : "";
    $("#r-total-texte").value = r ? r.totalTexte : "";
    $("#r-etapes").value = r ? etapesVersTexte(r.etapes) : "";
    $("#r-pourqui").value = r ? r.pourQui : "";
    $("#r-cafes").value = r ? r.cafesAssocies.join("\n") : "";
    $("#r-note").value = r ? r.note : "";
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
      tempTexte: $("#r-temp-texte").value.trim() || ($("#r-temp").value + " °C"),
      dial: $("#r-dial").value.trim().replace(/,/g, "."),
      ratioTexte: $("#r-ratio-texte").value.trim(),
      totalTexte: $("#r-total-texte").value.trim(),
      etapes: texteVersEtapes($("#r-etapes").value),
      pourQui: $("#r-pourqui").value.trim(),
      cafesAssocies: $("#r-cafes").value.split("\n").map(s => s.trim()).filter(Boolean),
      note: $("#r-note").value.trim(),
      parDefaut: $("#r-defaut").checked,
      avancee: $("#r-avancee").checked,
      actif: $("#r-actif").checked ? 1 : 0,
    };
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

  // ---------- Saisie rapide flottante ----------

  let rapideOuvert = false;

  function basculerRapide(forcer) {
    rapideOuvert = forcer !== undefined ? forcer : !rapideOuvert;
    $("#panneau-rapide").classList.toggle("ouvert", rapideOuvert);
    $("#fab-rapide").classList.toggle("ouvert", rapideOuvert);
    if (rapideOuvert) majPanneauRapide();
  }

  function majPanneauRapide() {
    const selCafe = $("#q-cafe");
    const v = selCafe.value;
    selCafe.innerHTML = '<option value="">' + I18N.t("choisir_cafe") + "</option>" +
      cafesSelectionnables().map(c => '<option value="' + c.id + '">' + c.nom + "</option>").join("");
    if (v && cafesSelectionnables().some(c => c.id === v)) selCafe.value = v;
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
    const av = r ? avertissementsCombinaison(cafe, r.methode, r.nom, DATA.state.recettes) : { msgs: [], bloque: false };
    $("#q-avert").textContent = av.msgs.length ? "⚠ " + av.msgs[0] : "";
  }

  async function enregistrerRapide() {
    const cafeId = $("#q-cafe").value;
    const r = trouverRecette($("#q-recette").value);
    if (!cafeId) { toast(I18N.t("t_choisis_cafe")); return; }
    if (!r) { toast(I18N.t("t_choisis_recette")); return; }
    const cafeQ = DATA.state.cafes.find(c => c.id === cafeId);
    if (r.methode === "Switch" && cafeInterditSwitch(cafeQ)) { toast(I18N.t("t_bloque")); return; }
    await DATA.ajouterExtraction({
      date_heure: maintenantLocal(),
      cafe_id: cafeId,
      methode: r.methode,
      recette: r.nom,
      dose_g: r.dose || DEFAULT_DOSE_G,
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
      if (["tableau", "saisie", "historique", "reference", "guide"].includes(h) && h !== ecranCourant) activerEcran(h);
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
      choisirMethode(b.dataset.methode);
      prefillDepuisRecette($("#f-recette").value);
    }));
    $("#f-cafe").addEventListener("change", surChoixCafe);
    $("#f-recette").addEventListener("change", () => { prefillDepuisRecette($("#f-recette").value); majAvertissements(); });
    ["f-dose", "f-eau", "f-mouture"].forEach(id =>
      $("#" + id).addEventListener("input", () => { majLive(); majAvertissements(); }));
    $("#f-note").addEventListener("input", () => $("#note-affichee").textContent = $("#f-note").value);
    $("#btn-chrono").addEventListener("click", chronoPrincipal);
    $("#btn-chrono-stop").addEventListener("click", chronoArreter);
    $("#btn-chrono-raz").addEventListener("click", chronoRaz);
    $("#chrono-bip").addEventListener("change", () => {
      try { localStorage.setItem("bips", $("#chrono-bip").checked ? "1" : "0"); } catch (e) { /* tant pis */ }
    });
    $("#form-saisie").addEventListener("submit", enregistrerSaisie);
    $("#btn-annuler-edition").addEventListener("click", () => { reinitialiserSaisie(); activerEcran("historique"); });
    $("#btn-gerer-cafes").addEventListener("click", ouvrirModaleCafes);
    $("#btn-cafes-entete").addEventListener("click", ouvrirModaleCafes);
    $("#btn-recettes-entete").addEventListener("click", ouvrirModaleRecettes);
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
      $("#f-agitation").hidden = !$("#f-agitation-oui").checked;
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

    // Historique
    ["h-cafe", "h-methode", "h-diagnostic", "h-note-min", "h-du", "h-au"].forEach(id =>
      $("#" + id).addEventListener("input", rendreHistorique));
    $("#h-reinitialiser").addEventListener("click", () => {
      ["h-cafe", "h-methode", "h-diagnostic", "h-note-min", "h-du", "h-au"].forEach(id => $("#" + id).value = "");
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
    $("#h-corps").addEventListener("click", async ev => {
      const btn = ev.target.closest("[data-action]");
      if (!btn) return;
      const id = btn.closest("tr").dataset.id;
      const ext = DATA.state.extractions.find(e => e.id === id);
      if (!ext) return;
      if (btn.dataset.action === "supprimer") {
        if (confirm(I18N.t("c_suppr"))) {
          await DATA.supprimerExtraction(id);
          toast(I18N.t("t_supprimee"));
          rendreHistorique();
        }
      } else if (btn.dataset.action === "modifier") {
        chargerExtractionDansSaisie(ext, false);
      } else if (btn.dataset.action === "dupliquer") {
        chargerExtractionDansSaisie(ext, true);
        toast(I18N.t("t_dupliquee"));
      }
    });

    // Référence
    $("#conv-dial").addEventListener("input", rendreConvertisseur);
    $("#pap-demarrer").addEventListener("click", papDemarrer);
    $("#pap-suivant").addEventListener("click", papSuivant);
    $("#btn-gerer-recettes").addEventListener("click", ouvrirModaleRecettes);

    // Recettes : formulaire
    $("#recette-nouvelle").addEventListener("click", () => ouvrirFormRecette(null));
    $("#recette-annuler").addEventListener("click", () => $("#form-recette").hidden = true);
    $("#form-recette").addEventListener("submit", enregistrerRecette);
    $("#recette-retablir").addEventListener("click", async () => {
      if (!recetteEditId) return;
      if (!confirm(I18N.t("c_retablir"))) return;
      await DATA.reinitialiserRecette(recetteEditId);
      $("#form-recette").hidden = true;
      rendreListeRecettes();
      toast(I18N.t("t_retablie"));
    });
    $("#recette-supprimer").addEventListener("click", async () => {
      if (!recetteEditId) return;
      if (!confirm(I18N.t("c_suppr_recette"))) return;
      await DATA.supprimerRecette(recetteEditId);
      $("#form-recette").hidden = true;
      rendreListeRecettes();
      toast(I18N.t("t_recette_supprimee"));
    });

    // Saisie rapide flottante
    $("#fab-rapide").addEventListener("click", () => basculerRapide());
    $("#q-fermer").addEventListener("click", () => basculerRapide(false));
    $("#q-cafe").addEventListener("change", surChoixCafeRapide);
    $("#q-recette").addEventListener("change", majAvertRapide);
    $("#q-note").addEventListener("input", () => $("#q-note-affichee").textContent = $("#q-note").value);
    $("#q-enregistrer").addEventListener("click", enregistrerRapide);
    $("#q-complet").addEventListener("click", () => { basculerRapide(false); activerEcran("saisie"); });

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
    $("#modale-pas-a-pas").addEventListener("close", () => clearInterval(pap.interval));

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
    $("#cafe-nouveau").addEventListener("click", () => ouvrirFormCafe(null));
    $("#cafe-annuler").addEventListener("click", () => $("#form-cafe").hidden = true);
    $("#form-cafe").addEventListener("submit", enregistrerCafe);

    // Les changements de données rafraîchissent l'interface.
    $("#don-sync").addEventListener("click", async () => {
      const etat = await DATA.synchroniser(true);
      toast(I18N.t(etat === "ok" ? "t_sync_ok" : "t_sync_ko"));
    });

    DATA.abonner(() => {
      majBadges();
      majStatutSync();
      remplirSelectCafes();
      remplirFiltres();
      remplirSelectRecettes();
      remplirSelectRecetteReco();
      remplirSelectTasses();
      rendreRecettes();
      if (rapideOuvert) majPanneauRapide();
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
    $("#btn-lang").textContent = I18N.lang() === "fr" ? "EN" : "FR";
    $("#btn-lang").title = I18N.lang() === "fr" ? "Switch to English" : "Passer en français";
    construirePilules();
    $$("#f-diagnostic .pilule").forEach(x => x.classList.toggle("actif", saisie.diagnostics.has(x.dataset.diag)));
    $$("#f-descripteurs .tag").forEach(x => x.classList.toggle("actif", saisie.descripteurs.has(x.dataset.tag)));
    majCorrectionDiagnostic();
    majBoutonsChrono();
    majEtapesChrono(false);
    $("#saisie-titre").textContent = saisie.editId ? I18N.t("s_modifier") : I18N.t("s_nouvelle");
    $("#btn-enregistrer").textContent = saisie.editId ? I18N.t("s_enregistrer_modif") : I18N.t("s_enregistrer");
    remplirSelectCafes();
    remplirFiltres();
    remplirSelectRecettes();
    remplirSelectRecetteReco();
    remplirSelectTasses();
    rendreRecettes();
    rendreTablePlages();
    rendreConvertisseur();
    majBadges();
    majLait();
    majLive();
    majAvertissements();
    if (rapideOuvert) majPanneauRapide();
    rendreEcranCourant(true);
  }

  // ---------- Démarrage ----------

  async function demarrer() {
    I18N.appliquerStatique();
    $("#btn-lang").textContent = I18N.lang() === "fr" ? "EN" : "FR";
    $("#btn-lang").title = I18N.lang() === "fr" ? "Switch to English" : "Passer en français";
    CHARTS.appliquerDefauts();
    construirePilules();
    cabler();
    rendreTablePlages();

    const aDesDonnees = await DATA.init();
    majBadges();
    remplirSelectCafes();
    remplirFiltres();
    remplirSelectRecettes();
    remplirSelectRecetteReco();
    remplirSelectTasses();
    rendreRecettes();
    rendreConvertisseur();
    try { $("#chrono-bip").checked = localStorage.getItem("bips") !== "0"; } catch (e) { /* tant pis */ }
    choisirMethode("Brikka");
    reinitialiserSaisie();

    const h = location.hash.slice(1);
    activerEcran(["tableau", "saisie", "historique", "reference", "guide"].includes(h) ? h : "tableau");

    // Le système relâche le verrou d'écran quand l'onglet part en arrière plan.
    // Au retour, si le chrono tourne toujours, on le reprend.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") syncWakeLock();
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
})();
