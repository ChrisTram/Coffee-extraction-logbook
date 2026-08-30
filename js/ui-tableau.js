/* Écran d'accueil : les phrases d'analyse et le calendrier d'activité.
 *
 * Les insights sont des phrases CALCULÉES, pas des graphiques de plus, et les
 * règles restent volontairement prudentes : il faut assez d'extractions notées
 * dans chacun des groupes comparés avant d'affirmer quoi que ce soit. Mieux vaut
 * ne rien dire que dire une bêtise sur trois tasses. */
"use strict";

(() => {

  // Emprunté au noyau, chargé avant nous.
  const { $, $$, animerCompteur, attrTitre, cleLocale, diagsAffiches, ecartMoyen, extAvecCalculs,
    fmtDateHeure, fmtDecimal, moyenne, trouverRecette } = UI;

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

  /* Âge du PAQUET, pas âge de la torréfaction. La règle précédente partait de
     `date_torrefaction`, absente des cinq cafés de Chris et destinée à le rester :
     elle n'a jamais pu se déclencher une seule fois. Le jour d'ouverture, lui, il
     le connaît toujours, et c'est ce qu'il décrit comme faisant le plus bouger ses
     tasses. Les tranches suivent le dégazage puis l'éventement. */
  function insightAgePaquet(notees) {
    const groupes = { ins_paquet_frais: [], ins_paquet_median: [], ins_paquet_vieux: [] };
    notees.forEach(e => {
      const j = e._c.jours_ouvert;
      if (j === "" || j < 0) return;
      if (j <= 7) groupes.ins_paquet_frais.push(e.note_sur_10);
      else if (j <= 21) groupes.ins_paquet_median.push(e.note_sur_10);
      else groupes.ins_paquet_vieux.push(e.note_sur_10);
    });
    const res = bestOfGroups(groupes);
    if (!res) return null;
    return I18N.t("ins_paquet", {
      quand: I18N.t(res.gagnant.cle),
      haut: note1(res.gagnant.moy),
      bas: note1(res.moyReste),
    });
  }

  /* LE CONSTAT PAR CAFÉ ET PAR MACHINE, la phrase la plus utile du lot.

     Les autres règles comparent des groupes sur TOUT l'historique. Mélanger un
     Sáng Tạo en Brikka et un Liberica en Switch pour conclure sur la puissance de
     feu ne décrit aucune tasse réelle. Celle-ci isole donc chaque couple (café,
     machine) et cherche, parmi six leviers, celui qui sépare le mieux SES tasses.

     Les garde-fous sont les mêmes que partout : trois tasses de chaque côté et
     0,4 point d'écart. Sur les données actuelles de Chris, aucun ne passe encore,
     et c'est le bon comportement : le meilleur écart par café tombe à 0,17. */
  function insightsParCafe(exts) {
    return REGLAGES.constatsParCafe(DATA.state.cafes, exts, {
      minLot: MIN_SAMPLE * 2,
      minParGroupe: MIN_SAMPLE,
      minEcart: MIN_GAP,
    }).slice(0, 2).map(c => I18N.t("ins_cafe_levier", {
      cafe: c.cafe ? c.cafe.nom : "",
      machine: I18N.machine(c.methode),
      levier: I18N.t("lev_" + c.levier),
      valeur: I18N.tr(String(c.valeur)),
      haut: note1(c.haut),
      bas: note1(c.bas),
      n: c.n,
    }));
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

  // Moment de la journée : l'heure est déjà dans date_heure, donc cette règle ne
  // coûte aucune saisie supplémentaire. Répond à "est-ce que ma première tasse
  // est vraiment meilleure, ou juste bue avec plus d'enthousiasme".
  function insightMoment(notees) {
    const groupes = { ins_moment_matin: [], ins_moment_aprem: [], ins_moment_soir: [] };
    notees.forEach(e => {
      const heure = Number(String(e.date_heure).slice(11, 13));
      if (!Number.isFinite(heure)) return;
      if (heure < 12) groupes.ins_moment_matin.push(e.note_sur_10);
      else if (heure < 18) groupes.ins_moment_aprem.push(e.note_sur_10);
      else groupes.ins_moment_soir.push(e.note_sur_10);
    });
    const res = bestOfGroups(groupes);
    if (!res) return null;
    return I18N.t("ins_moment", {
      quand: I18N.t(res.gagnant.cle),
      haut: note1(res.gagnant.moy),
      bas: note1(res.moyReste),
    });
  }

  // Puissance de feu, Brikka seulement. C'est la variable que Chris cherche
  // justement à régler : tant qu'elle vaut 3 partout, la règle se tait, et elle
  // parlera dès qu'il aura essayé autre chose.
  function insightPuissance(notees) {
    const groupes = {};
    notees
      .filter(e => e.methode === "Brikka" && e.puissance_feu !== "" && e.puissance_feu !== undefined)
      .forEach(e => (groupes[e.puissance_feu] = groupes[e.puissance_feu] || []).push(e.note_sur_10));
    const res = bestOfGroups(groupes);
    if (!res) return null;
    return I18N.t("ins_puissance", {
      feu: res.gagnant.cle,
      haut: note1(res.gagnant.moy),
      bas: note1(res.moyReste),
    });
  }

  function computeInsights(exts) {
    const notees = exts.filter(e => e.note_sur_10 !== "");
    /* Les constats PAR CAFÉ d'abord : ils sont plus précis, donc plus
       actionnables. Les règles globales ensuite, et elles annoncent elles mêmes
       qu'elles mélangent les cafés : c'est leur limite, autant la dire. */
    const phrases = insightsParCafe(exts).concat([
      insightAgePaquet(notees),
      insightRecettes(notees),
      insightMoment(notees),
      insightPuissance(notees),
    ].filter(Boolean).map(p => I18N.t("ins_global", { p })));

    if (phrases.length) return phrases;

    // Rien à dire : on explique POURQUOI plutôt que de laisser un cadre vide.
    // C'est la différence entre "pas assez de données" et "le site est cassé".
    // On ne réclame PAS les dates de torréfaction ici : les paquets vietnamiens
    // ne les portent presque jamais, le rappel serait un reproche permanent.
    return [I18N.t("ins_vide", { n: MIN_SAMPLE })];
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

  /* Chiffre la période affichée. Une grille de cases ne dit rien de mesurable
     toute seule; ces cinq nombres sont ce qu'on vient y chercher.

     La SÉRIE EN COURS est comptée depuis le dernier jour actif, et n'est
     annoncée que si ce jour est aujourd'hui ou hier. Sinon, à huit heures du
     matin avant le premier café, elle retomberait à zéro tous les jours et ne
     voudrait plus rien dire. */
  function statsHeatmap(parJour) {
    const fin = new Date();
    fin.setHours(0, 0, 0, 0);
    const debut = new Date(fin);
    debut.setDate(debut.getDate() - (SEMAINES_HEATMAP * 7 - 1));

    const jours = [];
    const jour = new Date(debut);
    while (jour <= fin) {
      jours.push(parJour[cleLocale(jour)] || 0);
      jour.setDate(jour.getDate() + 1);
    }

    let tasses = 0, joursActifs = 0, serie = 0, meilleureSerie = 0;
    jours.forEach(n => {
      if (n > 0) {
        tasses += n;
        joursActifs += 1;
        serie += 1;
        if (serie > meilleureSerie) meilleureSerie = serie;
      } else {
        serie = 0;
      }
    });

    // Série en cours : on remonte depuis la fin, en tolérant qu'aujourd'hui soit
    // encore vide (index dernier = aujourd'hui).
    let serieEnCours = 0;
    let i = jours.length - 1;
    if (jours[i] === 0) i -= 1; // aujourd'hui pas encore entamé, on part d'hier
    while (i >= 0 && jours[i] > 0) { serieEnCours += 1; i -= 1; }

    // Moyenne par semaine rapportée au temps RÉELLEMENT couvert : diviser par
    // 18 semaines alors que le premier café date de 15 jours donnerait un chiffre
    // faux et décourageant.
    const premierActif = jours.findIndex(n => n > 0);
    const joursCouverts = premierActif === -1 ? 0 : jours.length - premierActif;
    const parSemaine = joursCouverts > 0 ? tasses / (joursCouverts / 7) : 0;

    return { tasses, joursActifs, serieEnCours, meilleureSerie, parSemaine };
  }

  function rendreStatsHeatmap(parJour) {
    const s = statsHeatmap(parJour);
    if (!s.tasses) {
      $("#heatmap-stats").innerHTML =
        '<p class="carte-vide">' + I18N.t("hm_resume_vide", { s: SEMAINES_HEATMAP }) + "</p>";
      return;
    }
    const cases = [
      { v: s.tasses, l: I18N.t("hm_st_tasses") },
      { v: s.joursActifs, l: I18N.t("hm_st_jours") },
      { v: s.serieEnCours, l: I18N.t("hm_st_serie_now") },
      { v: s.meilleureSerie, l: I18N.t("hm_st_serie_max") },
      { v: fmtDecimal(s.parSemaine, 1), l: I18N.t("hm_st_semaine") },
    ];
    $("#heatmap-stats").innerHTML = cases
      .map(c => '<div class="mini-stat"><b>' + c.v + "</b><span>" + c.l + "</span></div>")
      .join("");
  }

  /* Un graphe vide ne dit pas POURQUOI il est vide, et ça se lit comme un site
     cassé. Ces trois cartes sont les seules qui peuvent rester vides longtemps
     avec des données parfaitement valides, donc chacune annonce sa vraie cause
     plutôt qu'un "pas de données" générique qui n'aide personne. */
  function majCarteVide(id, nbPoints, cle) {
    const vide = nbPoints === 0;
    $("#boite-" + id).hidden = vide;
    const msg = $("#vide-" + id);
    msg.hidden = !vide;
    if (vide) msg.textContent = I18N.t(cle);
  }

  function causeMoutureVide(notees) {
    if (!notees.length) return "vide_rien";
    // Cas le plus courant chez un buveur de café déjà moulu : la mouture n'est
    // volontairement pas stockée, donc le nuage ne peut rien montrer.
    const toutesMoulues = notees.every(e => {
      const c = DATA.cafeDe(e);
      return c && Number(c.deja_moulu) === 1;
    });
    return toutesMoulues ? "vide_mouture_moulu" : "vide_mouture";
  }

  function causeGoutsVide(notees) {
    if (!notees.length) return "vide_rien";
    const avecTags = notees.filter(e => (e.descripteurs || "").trim() !== "").length;
    // Distinguer "tu ne coches jamais de descripteurs" de "pas encore assez de
    // fois le même", parce que l'action à faire n'est pas la même.
    return avecTags === 0 ? "vide_gouts_aucun" : "vide_gouts_seuil";
  }

  /* Note moyenne par descripteur. C'est le seul graphique du tableau de bord qui
     parle de GOÛT plutôt que de réglage, alors que c'est le sujet du carnet.
     Il remplace un nuage note contre âge du café, qui dépendait d'une date de
     torréfaction que les paquets vietnamiens ne portent presque jamais : il était
     donc structurellement vide.

     Ici la donnée est toujours là, puisque les descripteurs se cochent à chaque
     tasse. On garde les 10 meilleurs et les 5 pires : sur 59 tags, tout afficher
     serait illisible, et ce sont les extrêmes qui portent l'information. */
  const MIN_TASSES_GOUT = 3;
  const TOP_GOUTS = 10;
  const PIRES_GOUTS = 5;

  function rendreGouts(notees) {
    const parTag = {};
    notees.forEach(e => {
      (e.descripteurs || "").split("|").filter(Boolean).forEach(tag => {
        (parTag[tag] = parTag[tag] || []).push(e.note_sur_10);
      });
    });

    const classes = Object.entries(parTag)
      .filter(([, notes]) => notes.length >= MIN_TASSES_GOUT)
      .map(([tag, notes]) => ({ tag, moy: moyenne(notes), n: notes.length }))
      .sort((a, b) => b.moy - a.moy);

    if (!classes.length) {
      $("#note-gouts").textContent = "";
      return [];
    }

    // Les extrêmes, sans doublon si la liste est courte.
    const retenus = classes.length > TOP_GOUTS + PIRES_GOUTS
      ? [...classes.slice(0, TOP_GOUTS), ...classes.slice(-PIRES_GOUTS)]
      : classes;

    const moyenneGlobale = moyenne(notees.map(e => e.note_sur_10));
    const items = retenus.map(c => ({
      label: I18N.tag(c.tag),
      value: +c.moy.toFixed(1),
      extra: I18N.t("b_extractions", { n: c.n }),
    }));
    // Vert au dessus de ta moyenne, rouge en dessous : sans repère, "7,9" ne dit
    // pas si c'est bon pour TOI.
    const couleurs = retenus.map(c =>
      c.moy >= moyenneGlobale
        ? getComputedStyle(document.documentElement).getPropertyValue("--ok").trim()
        : getComputedStyle(document.documentElement).getPropertyValue("--danger").trim());

    CHARTS.barresHorizontales("g-gouts", items, couleurs, I18N.t("axe_note_moy"), 10);
    $("#note-gouts").textContent = I18N.t("gouts_note", {
      m: fmtDecimal(moyenneGlobale, 1),
      n: MIN_TASSES_GOUT,
    });
    return items;
  }

  function causeDuelVide(notees) {
    if (!notees.length) return "vide_rien";
    const machines = new Set(notees.map(e => e.methode).filter(Boolean));
    // Une seule machine utilisée : il n'y a rien à comparer, ce n'est pas un bug.
    return machines.size < 2 ? "vide_duel_une_machine" : "vide_duel";
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
      { valeur: ecartMoyen(notes) || 0, label: I18N.t("kpi_regularite"), dec: 1, plusMoins: true },
    ];
    $("#kpis").innerHTML = kpis.map(k =>
      '<div class="kpi"><div class="kpi-valeur"><span class="kpi-nombre"></span>' +
      (k.sur10 ? "<small> / 10</small>" : k.mg ? "<small> mg</small>" : k.plusMoins ? "<small> pt</small>" : "") +
      '</div><div class="kpi-label">' + k.label + "</div></div>"
    ).join("");
    $$("#kpis .kpi-nombre").forEach((el, i) =>
      animerCompteur(el, kpis[i].valeur, kpis[i].dec, "", kpis[i].plusMoins ? "± " : ""));

    rendreInsights(exts);

    // 30 derniers jours : barres, note, grammes, caféine dans le tooltip
    const labels = [], comptes = [], moyennes = [], details = [], tendance = [];
    /* La tendance se calcule sur TOUT l'historique noté, pas sur les 30 jours :
       une moyenne glissante qui redémarrerait au bord de la fenêtre serait vide
       les quatre premiers jours affichés. On la projette ensuite jour par jour,
       en gardant la dernière valeur connue, pour qu'elle ne se coupe pas les
       jours sans tasse. */
    const glissante = REGLAGES.moyenneGlissante(DATA.state.extractions, 5);
    let iGliss = 0, derniere = null;
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const cle = cleLocale(d);
      const duJour = exts.filter(e => e.date_heure.slice(0, 10) === cle);
      labels.push(d.toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" }));
      comptes.push(duJour.length);
      const nJour = duJour.filter(e => e.note_sur_10 !== "").map(e => e.note_sur_10);
      moyennes.push(nJour.length ? +moyenne(nJour).toFixed(1) : null);
      if (!duJour.length) { details.push(""); continue; }
      const g = duJour.reduce((a, e) => a + (e.dose_g || 0), 0);
      const mg = duJour.reduce((a, e) => a + mgCafeine(e), 0);
      const nomsCafes = [...new Set(duJour.map(e => (DATA.cafeDe(e) || {}).nom).filter(Boolean))];
      details.push(I18N.t("tip_cafe_g", { g: Math.round(g * 10) / 10 }) + "\n" +
        I18N.t("tip_cafeine", { mg }) + "\n" + nomsCafes.join(", "));
    }
    // Second passage : la tendance suit les mêmes libellés que les barres.
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const cle = cleLocale(d);
      while (iGliss < glissante.length && String(glissante[iGliss].date).slice(0, 10) <= cle) {
        if (glissante[iGliss].valeur !== null) derniere = glissante[iGliss].valeur;
        iGliss += 1;
      }
      tendance.push(derniere);
    }
    CHARTS.barresEtLigne30j("g-30jours", labels, comptes, moyennes, details, tendance);

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
    rendreStatsHeatmap(parJour);

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

    const notees = exts.filter(e => e.note_sur_10 !== "");
    const gouts = rendreGouts(notees);

    // Les trois cartes qui peuvent rester vides avec des données valides.
    majCarteVide("mouture", pts("Brikka").length + pts("Switch").length, causeMoutureVide(notees));
    majCarteVide("gouts", gouts.length, causeGoutsVide(notees));
    majCarteVide("duel", cafesDeux.length, causeDuelVide(notees));

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
    // Chaque ligne ouvre l'édition de son extraction. role et tabindex plutôt
    // qu'un vrai bouton : le contenu est structuré (div, span) et un bouton n'a
    // pas le droit d'en contenir.
    $("#dernieres-liste").innerHTML = dernieres.map(e =>
      '<li class="derniere-cliquable" data-ext="' + e.id + '" tabindex="0" role="button" title="' +
      attrTitre(I18N.t("h_editer")) + '">' +
      "<span class=\"pastille-methode " + e.methode.toLowerCase() + "\"></span>" +
      "<div><span class=\"derniere-cafe\">" + I18N.tr(e._c.cafe_nom) + "</span>" +
      "<div class=\"derniere-infos\">" + fmtDateHeure(e.date_heure) + " · " + e.methode +
      (e.recette ? " · " + e.recette : "") + (e.mouture_dial ? " · " + I18N.t("molette") + " " + e.mouture_dial : "") +
      (e.diagnostic ? " · " + diagsAffiches(e.diagnostic) : "") + "</div></div>" +
      "<span class=\"derniere-note\">" + (e.note_sur_10 !== "" ? e.note_sur_10 + "<small>/10</small>" : "") + "</span></li>"
    ).join("");
  }

  // Mis à disposition des autres écrans.
  Object.assign(UI, {
    MIN_GAP, MIN_SAMPLE, MIN_TASSES_GOUT, PIRES_GOUTS, SEMAINES_HEATMAP, TOP_GOUTS,
    bestOfGroups, causeDuelVide, causeGoutsVide, causeMoutureVide, computeInsights,
    insightAgePaquet, insightMoment, insightPuissance, insightRecettes, insightsParCafe,
    majCarteVide, note1, rendreGouts, rendreInsights, rendreStatsHeatmap, rendreTableau,
    statsHeatmap,
  });
})();
