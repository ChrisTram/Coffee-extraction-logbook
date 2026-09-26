/* Tableau de bord : les phrases calculées et leur carrousel (sorties de
 * ui-tableau.js en v8.78).
 *
 * Les constats sont des phrases CALCULÉES, pas des graphiques de plus, et les
 * règles restent volontairement prudentes : il faut assez d'extractions notées
 * dans chacun des groupes comparés avant d'affirmer quoi que ce soit. Mieux vaut
 * ne rien dire que dire une bêtise sur trois tasses. */
"use strict";

(() => {

  // Emprunté au noyau, chargé avant nous.
  const { $, $$, attrTitre, fmtDecimal, moyenne, nav, trouverRecette } = UI;

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

  /* LA PREUVE SOUS LA PHRASE (v8.36). Une phrase seule demande de croire sur
     parole ; en dessous, les deux moyennes comparées, leurs effectifs et deux
     barres à la même échelle (sur 10) disent d'où sort le constat.

     Le niveau de confiance n'est pas un calcul de statisticien, et il ne se
     présente pas comme tel : « écart solide » quand l'écart atteint 0,8 point
     ET que les deux groupes ont au moins cinq tasses, « écart probable » sinon.
     Les seuils d'affichage, eux, ne bougent pas : sous 0,4 point ou sous trois
     tasses par groupe, on continue de se taire. */
  const GAP_SOLIDE = 0.8;
  const N_SOLIDE = 5;
  function confiance(haut, bas, nHaut, nBas) {
    return haut - bas >= GAP_SOLIDE && Math.min(nHaut, nBas) >= N_SOLIDE ? "solide" : "probable";
  }

  /* Un constat complet : la phrase, les deux côtés de la comparaison, et de
     quoi juger. Toutes les règles rendent cette forme, ou null. */
  function constat(texte, haut, bas) {
    return { texte, haut, bas, confiance: confiance(haut.note, bas.note, haut.n, bas.n) };
  }

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
    return constat(
      I18N.t("ins_paquet", {
        quand: I18N.t(res.gagnant.cle),
        haut: note1(res.gagnant.moy),
        bas: note1(res.moyReste),
      }),
      { libelle: I18N.t(res.gagnant.cle), note: res.gagnant.moy, n: res.gagnant.notes.length },
      { libelle: I18N.t("ins_reste_temps"), note: res.moyReste, n: res.nReste });
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
    }).slice(0, 2).map(c => constat(
      I18N.t("ins_cafe_levier", {
        cafe: c.cafe ? c.cafe.nom : "",
        machine: I18N.machine(c.methode),
        levier: I18N.t("lev_" + c.levier),
        valeur: I18N.tr(String(c.valeur)),
        haut: note1(c.haut),
        bas: note1(c.bas),
        n: c.n,
      }),
      { libelle: I18N.t("lev_" + c.levier) + " " + I18N.tr(String(c.valeur)), note: c.haut, n: c.n },
      { libelle: I18N.t("ins_reste"), note: c.bas, n: c.nReste }));
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
        .map(([nom, notes]) => ({ nom, moy: moyenne(notes), n: notes.length }))
        .sort((a, b) => b.moy - a.moy);
      if (classes.length !== 2) continue;
      if (classes[0].moy - classes[1].moy < MIN_GAP) continue;
      return constat(
        I18N.t("ins_recettes", {
          gagnante: I18N.tr(classes[0].nom),
          perdante: I18N.tr(classes[1].nom),
          haut: note1(classes[0].moy),
          bas: note1(classes[1].moy),
        }),
        { libelle: I18N.tr(classes[0].nom), note: classes[0].moy, n: classes[0].n },
        { libelle: I18N.tr(classes[1].nom), note: classes[1].moy, n: classes[1].n });
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
    return constat(
      I18N.t("ins_moment", {
        quand: I18N.t(res.gagnant.cle),
        haut: note1(res.gagnant.moy),
        bas: note1(res.moyReste),
      }),
      { libelle: I18N.t(res.gagnant.cle), note: res.gagnant.moy, n: res.gagnant.notes.length },
      { libelle: I18N.t("ins_reste_jour"), note: res.moyReste, n: res.nReste });
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
    return constat(
      I18N.t("ins_puissance", {
        feu: res.gagnant.cle,
        haut: note1(res.gagnant.moy),
        bas: note1(res.moyReste),
      }),
      { libelle: I18N.t("rg_feu", { f: res.gagnant.cle }), note: res.gagnant.moy, n: res.gagnant.notes.length },
      { libelle: I18N.t("ins_reste_reglages"), note: res.moyReste, n: res.nReste });
  }

  /* TROIS CONSTATS DE PLUS (v8.42). Des données saisies à chaque tasse,
     qu'aucune règle ne lisait : la température de l'eau du Switch, l'eau
     préchauffée de la Brikka, l'agitation du Switch. Même moule que les règles
     au dessus, mêmes seuils de silence (MIN_SAMPLE, MIN_GAP). Chacune ne regarde
     QUE la machine concernée : l'eau préchauffée d'un Switch ne veut rien dire. */

  // Les tranches suivent ce que la bouilloire donne vraiment, pas la cible des
  // recettes : sous 91, l'eau a eu le temps de refroidir ; 94 et plus, juste
  // sortie du feu.
  function trancheTemp(t) {
    return t <= 90 ? "ins_temp_basse" : t <= 93 ? "ins_temp_moyenne" : "ins_temp_haute";
  }
  function insightTemperature(notees) {
    const groupes = { ins_temp_basse: [], ins_temp_moyenne: [], ins_temp_haute: [] };
    notees.forEach(e => {
      const t = Number(e.temperature_c);
      if (e.methode !== "Switch" || e.temperature_c === "" || !Number.isFinite(t)) return;
      groupes[trancheTemp(t)].push(e.note_sur_10);
    });
    const res = bestOfGroups(groupes);
    if (!res) return null;
    return constat(
      I18N.t("ins_temp", { plage: I18N.t(res.gagnant.cle) }),
      { libelle: I18N.t(res.gagnant.cle), note: res.gagnant.moy, n: res.gagnant.notes.length },
      { libelle: I18N.t("ins_reste_temp"), note: res.moyReste, n: res.nReste });
  }

  /* Deux groupes seulement : le reste EST l'autre groupe, on le nomme. */
  function duel(groupes, texte) {
    const res = bestOfGroups(groupes);
    if (!res) return null;
    const autre = Object.keys(groupes).find(k => k !== res.gagnant.cle);
    return constat(
      texte(I18N.t(res.gagnant.cle)),
      { libelle: I18N.t(res.gagnant.cle), note: res.gagnant.moy, n: res.gagnant.notes.length },
      { libelle: I18N.t(autre), note: res.moyReste, n: res.nReste });
  }
  function insightPrechauffe(notees) {
    const groupes = { ins_prech_oui: [], ins_prech_non: [] };
    notees.filter(e => e.methode === "Brikka").forEach(e =>
      groupes[Number(e.eau_prechauffee) === 1 ? "ins_prech_oui" : "ins_prech_non"].push(e.note_sur_10));
    return duel(groupes, quoi => I18N.t("ins_prechauffe", { quoi }));
  }
  function insightAgitation(notees) {
    const groupes = { ins_agit_oui: [], ins_agit_non: [] };
    notees.filter(e => e.methode === "Switch").forEach(e =>
      groupes[e.agitation_nb !== "" && e.agitation_nb !== undefined && Number(e.agitation_nb) > 0
        ? "ins_agit_oui" : "ins_agit_non"].push(e.note_sur_10));
    return duel(groupes, quoi => I18N.t("ins_agitation", { quoi }));
  }

  function computeInsights(exts) {
    const notees = exts.filter(e => e.note_sur_10 !== "");
    /* Les constats PAR CAFÉ d'abord : ils sont plus précis, donc plus
       actionnables. Les règles globales ensuite, et elles annoncent elles mêmes
       qu'elles mélangent les cafés : c'est leur limite, autant la dire. */
    const constats = insightsParCafe(exts).concat([
      insightAgePaquet(notees),
      insightRecettes(notees),
      insightMoment(notees),
      insightPuissance(notees),
      insightTemperature(notees),
      insightPrechauffe(notees),
      insightAgitation(notees),
    ].filter(Boolean).map(c => ({ ...c, texte: I18N.t("ins_global", { p: c.texte }) })));

    if (constats.length) return constats;

    // Rien à dire : on explique POURQUOI plutôt que de laisser un cadre vide.
    // C'est la différence entre "pas assez de données" et "le site est cassé".
    // On ne réclame PAS les dates de torréfaction ici : les paquets vietnamiens
    // ne les portent presque jamais, le rappel serait un reproche permanent.
    return [{ texte: I18N.t("ins_vide", { n: MIN_SAMPLE }) }];
  }

  /* LA PREUVE, SUR UNE LIGNE (v8.37). La v8.36 la posait en deux rangées de
     barres avec un pied à part : 164 px par constat, et le graphe des trente
     jours, qui s'aligne sur la hauteur de sa voisine, montait à 370 px de
     dessin. Elle répétait aussi, en libellé, le réglage que la phrase venait de
     nommer.

     Ici une réglette de 0 à 10, l'échelle des notes (normaliser sur l'écart
     ferait passer 0,4 point pour un gouffre), avec deux points : le réglage en
     accent, le reste en neutre, et le trait entre eux. Puis « 6,8 contre 5,2 »,
     et à droite la confiance avec les deux effectifs. Rien n'est perdu. */
  function reglette(c) {
    const haut = c.haut.note, bas = c.bas.note;
    const pc = n => Math.max(0, Math.min(100, (Number(n) / 10) * 100)).toFixed(1) + "%";
    const g = Math.min(haut, bas), d = Math.max(haut, bas);
    // Les libellés des deux camps, pour un lecteur d'écran : la phrase les nomme déjà à l'oeil.
    const dit = c.haut.libelle + " " + note1(haut) + ", " + c.bas.libelle + " " + note1(bas);
    return '<span class="reglette" role="img" aria-label="' + attrTitre(dit) + '">' +
      '<i class="reglette-trait" style="left:' + pc(g) + ";width:calc(" + pc(d) + " - " + pc(g) + ')"></i>' +
      '<i class="reglette-point bas" style="left:' + pc(bas) + '"></i>' +
      '<i class="reglette-point haut" style="left:' + pc(haut) + '"></i></span>';
  }

  /* LE CARROUSEL (v8.39). Les constats s'empilaient, et la carte, plus haute
     que le graphe voisin, l'étirait avec elle. Ils sont maintenant tous dans
     la même case de grille, un seul visible : la carte prend la hauteur du
     plus long, jamais la somme, et changer de constat ne fait rien sauter. */
  let insightCourant = 0;
  function montrerInsight(i) {
    const lis = $$("#insights > li");
    if (!lis.length) return;
    insightCourant = (i + lis.length) % lis.length;
    lis.forEach((li, k) => {
      li.classList.toggle("courant", k === insightCourant);
      li.setAttribute("aria-hidden", String(k !== insightCourant));
    });
    const pos = $("#insights-nav .insights-pos");
    if (pos) pos.textContent = (insightCourant + 1) + " / " + lis.length;
  }

  /* Les flèches du carrousel. Appelé par cablerTableau. */
  function cablerConstats() {
    $("#insights-nav").addEventListener("click", ev => {
      const b = ev.target.closest("[data-insight]");
      if (b) montrerInsight(insightCourant + Number(b.dataset.insight));
    });
  }

  function rendreInsights(exts) {
    const constats = computeInsights(exts);
    const nav = $("#insights-nav");
    nav.hidden = constats.length < 2;
    nav.innerHTML = constats.length < 2 ? "" :
      '<span class="insights-pos"></span>' +
      '<button type="button" class="btn-carre-petit" data-insight="-1" aria-label="' + attrTitre(I18N.t("ins_precedent")) + '">' + UI.icone("gauche") + "</button>" +
      '<button type="button" class="btn-carre-petit" data-insight="1" aria-label="' + attrTitre(I18N.t("ins_suivant")) + '">' + UI.icone("chevron") + "</button>";
    $("#insights").innerHTML = constats.map(c => {
      if (!c.haut) return '<li class="constat constat-vide"><p>' + c.texte + "</p></li>";
      return '<li class="constat"><p>' + c.texte + "</p>" +
        '<div class="preuve">' + reglette(c) +
        '<span class="preuve-chiffres">' + I18N.t("ins_contre", { h: note1(c.haut.note), b: note1(c.bas.note) }) + "</span>" +
        '<span class="preuve-pied">' + I18N.t("ins_" + c.confiance) + " · " +
        I18N.t("ins_effectifs", { h: c.haut.n, b: c.bas.n }) + "</span></div></li>";
    }).join("");
    montrerInsight(insightCourant);
  }

  Object.assign(UI, {
    MIN_GAP, MIN_SAMPLE, note1,
    bestOfGroups, cablerConstats, computeInsights,
    insightAgePaquet, insightAgitation, insightMoment, insightPrechauffe, insightPuissance,
    insightRecettes, insightTemperature, insightsParCafe, rendreInsights,
  });
})();
