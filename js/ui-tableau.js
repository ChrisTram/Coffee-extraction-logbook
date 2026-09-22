/* Écran d'accueil : les phrases d'analyse et le calendrier d'activité.
 *
 * Les insights sont des phrases CALCULÉES, pas des graphiques de plus, et les
 * règles restent volontairement prudentes : il faut assez d'extractions notées
 * dans chacun des groupes comparés avant d'affirmer quoi que ce soit. Mieux vaut
 * ne rien dire que dire une bêtise sur trois tasses. */
"use strict";

(() => {

  // Emprunté au noyau, chargé avant nous.
  const { $, $$, animerCompteur, attrTitre, cleLocale, detailRatio, diagsAffiches,
    ecartMoyen, estRatee, extAnalysables, extAvecCalculs, fmtDateHeure, fmtDecimal, fmtTemps,
    fmtVND, inclureRatees, moyenne, nav, trouverRecette } = UI;

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

  function rendreInsights(exts) {
    $("#insights").innerHTML = computeInsights(exts).map(c => {
      if (!c.haut) return '<li class="constat constat-vide"><p>' + c.texte + "</p></li>";
      return '<li class="constat"><p>' + c.texte + "</p>" +
        '<div class="preuve">' + reglette(c) +
        '<span class="preuve-chiffres">' + I18N.t("ins_contre", { h: note1(c.haut.note), b: note1(c.bas.note) }) + "</span>" +
        '<span class="preuve-pied">' + I18N.t("ins_" + c.confiance) + " · " +
        I18N.t("ins_effectifs", { h: c.haut.n, b: c.bas.n }) + "</span></div></li>";
    }).join("");
  }

  // ---------- Calendrier d'activité ----------
  // 18 semaines et pas 26 : à raison d'une ou deux tasses par jour, six mois de
  // grille sont surtout six mois de cases vides, ce qui donne l'impression que
  // le calendrier ne marche pas.
  /* Plafond de la fenetre du calendrier. Le nombre REELLEMENT affiche se calcule
     depuis la largeur du conteneur, voir semainesVisibles() : au dela de ce
     plafond on n'apprend plus rien, en dessous on entasse. */
  const SEMAINES_HEATMAP = 18;
  const SEMAINES_MIN = 6;

  /* COMBIEN DE SEMAINES TIENNENT, vraiment. Une case fait 17 px plus 4 de
     gouttiere, et la colonne des jours en prend 34 a gauche : c'est la seule
     arithmetique. Sans ce calcul, le SVG imposait 620 px dans une carte de 257
     et la carte defilait horizontalement, ce qu'une carte ne doit jamais faire.

     Le resultat sert A LA FOIS a la grille et aux cinq chiffres du dessous :
     deux fenetres differentes pour un meme bloc, ce serait un bloc qui se
     contredit. */
  /* Empeche le rattrapage de se rappeler lui-meme sans fin. */
  let heatmapRecomptee = false;

  function semainesVisibles() {
    const cadre = $("#g-heatmap");
    const dispo = cadre ? cadre.clientWidth : 0;
    if (!dispo) return SEMAINES_HEATMAP;
    const tiennent = Math.floor((dispo - 34) / 21);
    return Math.max(SEMAINES_MIN, Math.min(SEMAINES_HEATMAP, tiennent));
  }

  /* Chiffre la période affichée. Une grille de cases ne dit rien de mesurable
     toute seule; ces cinq nombres sont ce qu'on vient y chercher.

     La SÉRIE EN COURS est comptée depuis le dernier jour actif, et n'est
     annoncée que si ce jour est aujourd'hui ou hier. Sinon, à huit heures du
     matin avant le premier café, elle retomberait à zéro tous les jours et ne
     voudrait plus rien dire. */
  function statsHeatmap(parJour, semaines) {
    const fenetre = semaines || SEMAINES_HEATMAP;
    const fin = new Date();
    fin.setHours(0, 0, 0, 0);
    const debut = new Date(fin);
    debut.setDate(debut.getDate() - (fenetre * 7 - 1));

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

  /* LA LEGENDE DE L'ECHELLE. Les teintes du calendrier suivent une echelle
     ABSOLUE, une couleur veut donc toujours dire la meme chose : c'est ce qui
     rend une legende utile, et c'est pourquoi elle doit exister. Sans elle, le
     calendrier est une suite de bruns. */
  function rendreLegendeHeatmap() {
    const cible = $("#heatmap-legende");
    if (!cible) return;
    const cases = [0, 1, 2, 3, 4].map(n =>
      '<span class="hm-i hm-n' + n + '"></span>').join("");
    cible.innerHTML = '<span>' + I18N.t("hm_leg_moins") + "</span>" + cases +
      "<span>" + I18N.t("hm_leg_plus") + "</span>";
  }

  function rendreStatsHeatmap(parJour, semaines) {
    const fenetre = semaines || SEMAINES_HEATMAP;
    const s = statsHeatmap(parJour, fenetre);
    if (!s.tasses) {
      $("#heatmap-stats").innerHTML =
        '<p class="carte-vide">' + I18N.t("hm_resume_vide", { s: fenetre }) + "</p>";
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
    /* DEUX jeux, et savoir lequel on prend est la seule question qui compte ici.
       exts compte CE QUI S'EST PASSÉ, analysables conseille CE QU'IL FAUT FAIRE.
       Voir extAnalysables() dans le noyau pour la règle. */
    const exts = extAvecCalculs();
    const analysables = extAnalysables();
    /* La bascule « inclure les ratées » vit dans l'écran Paramètres depuis la
       v7.91 : en bandeau ici, elle prenait la place du premier chiffre à chaque
       ouverture pour un réglage qu'on change une fois par mois. */
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

    const notes = analysables.filter(e => e.note_sur_10 !== "").map(e => e.note_sur_10);
    const notes7j = analysables.filter(e => e.note_sur_10 !== "" && new Date(e.date_heure) >= il7j).map(e => e.note_sur_10);

    // Caféine estimée par jour sur les 7 derniers jours.
    const mgCafeine = e => {
      const cafe = DATA.cafeDe(e);
      return cafeineMg(e.dose_g || 0, cafe ? cafe.espece : "", cafe ? cafe.pourcentage_cafe_reel : 100);
    };
    const cafeine7j = exts.filter(e => new Date(e.date_heure) >= il7j).reduce((a, e) => a + mgCafeine(e), 0);

    /* QUATRE tuiles, pas sept. Sept chiffres alignes se COMPTENT au lieu de se
       lire : on cherche celui qu'on voulait. Les quatre qui restent sont ceux
       qui bougent d'un jour a l'autre. Les trois autres, total, note globale et
       cafeine, n'ont pas disparu : ils passent en ligne sous la grille, ou ils
       se lisent quand on les cherche sans occuper le coup d'oeil. */
    const kpis = [
      { valeur: exts.filter(e => e.date_heure.slice(0, 10) === auj).length, label: I18N.t("kpi_auj"), dec: 0 },
      { valeur: exts.filter(e => e.date_heure.slice(0, 10) >= cleLundi).length, label: I18N.t("kpi_semaine"), dec: 0 },
      { valeur: moyenne(notes7j) || 0, label: I18N.t("kpi_note7"), dec: 1, sur10: true },
      { valeur: ecartMoyen(notes) || 0, label: I18N.t("kpi_regularite"), dec: 1, plusMoins: true },
    ];
    $("#kpis").innerHTML = kpis.map(k =>
      '<div class="kpi"><div class="kpi-valeur"><span class="kpi-nombre"></span>' +
      (k.sur10 ? "<small> / 10</small>" : k.mg ? "<small> mg</small>" : k.plusMoins ? "<small> pt</small>" : "") +
      '</div><div class="kpi-label">' + k.label + "</div></div>"
    ).join("");
    $$("#kpis .kpi-nombre").forEach((el, i) =>
      animerCompteur(el, kpis[i].valeur, kpis[i].dec, "", kpis[i].plusMoins ? "± " : ""));

    /* Les trois chiffres sortis des tuiles. Ils restent lisibles, en clair, et
       ne sont plus sur le chemin du regard. */
    const ligne = (libelle, valeur) =>
      "<li><span>" + libelle + "</span><b>" + valeur + "</b></li>";
    $("#kpis-secondaires").innerHTML =
      ligne(I18N.t("kpi_total"), exts.length) +
      ligne(I18N.t("kpi_note"), fmtDecimal(moyenne(notes) || 0, 1) + " / 10") +
      ligne(I18N.t("kpi_cafeine"), "≈ " + Math.round(cafeine7j / 7) + " mg");

    /* La surligne de la tete de page : la date du jour, comme dans la maquette. */
    $("#tableau-surligne").textContent = maintenant.toLocaleDateString(I18N.locale(),
      { weekday: "long", day: "numeric", month: "long" });

    rendreDerniereTasse(exts);

    rendreInsights(analysables);

    // 30 derniers jours : barres, note, grammes, caféine dans le tooltip
    const labels = [], comptes = [], moyennes = [], details = [], tendance = [];
    /* La tendance se calcule sur TOUT l'historique noté, pas sur les 30 jours :
       une moyenne glissante qui redémarrerait au bord de la fenêtre serait vide
       les quatre premiers jours affichés. On la projette ensuite jour par jour,
       en gardant la dernière valeur connue, pour qu'elle ne se coupe pas les
       jours sans tasse. */
    const glissante = REGLAGES.moyenneGlissante(analysables, 5);
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
      const nJour = analysables.filter(e => e.date_heure.slice(0, 10) === cle && e.note_sur_10 !== "").map(e => e.note_sur_10);
      if (nJour.length) infoParJour[cle] = "note moyenne " + moyenne(nJour).toFixed(1);
    });
    /* Autant de semaines que la carte peut en montrer, sans defilement. Le meme
       nombre part aux cinq chiffres du dessous : la grille et son resume
       decrivent la meme fenetre. */
    const semaines = semainesVisibles();
    CHARTS.heatmap("g-heatmap", parJour, infoParJour, semaines);
    $("#heatmap-titre").textContent = I18N.t("hm_titre", { n: semaines });
    rendreStatsHeatmap(parJour, semaines);
    rendreLegendeHeatmap();

    /* AU PREMIER RENDU la carte n a pas encore de largeur : semainesVisibles()
       retombe sur le plafond et dessine 18 semaines ecrasees a l echelle. Une
       fois la mise en page faite, on recompte, et on ne redessine que si le
       compte a change. Le drapeau empeche la boucle : un seul rattrapage. */
    if (!heatmapRecomptee) {
      heatmapRecomptee = true;
      setTimeout(() => {
        heatmapRecomptee = false;
        if (nav.ecran === "tableau" && semainesVisibles() !== semaines) UI.rendreTableau();
      }, 0);
    }

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
    const brikka = analysables.filter(e => e.methode === "Brikka");
    const swtch = analysables.filter(e => e.methode === "Switch");
    const nB = brikka.filter(e => e.note_sur_10 !== "").map(e => e.note_sur_10);
    const nS = swtch.filter(e => e.note_sur_10 !== "").map(e => e.note_sur_10);
    $("#duel-machines").innerHTML =
      '<div class="duel-col brikka"><b>' + brikka.length + "</b><span>" + I18N.t("d_ext_brikka") + "</span><b>" +
      (nB.length ? moyenne(nB).toFixed(1) : "...") + "</b><span>" + I18N.t("d_note") + "</span></div>" +
      '<div class="duel-col switch"><b>' + swtch.length + "</b><span>" + I18N.t("d_ext_switch") + "</span><b>" +
      (nS.length ? moyenne(nS).toFixed(1) : "...") + "</b><span>" + I18N.t("d_note") + "</span></div>";

    // Cafés passés dans les deux machines
    const cafesDeux = DATA.state.cafes.filter(c => {
      const eb = analysables.some(e => e.cafe_id === c.id && e.methode === "Brikka" && e.note_sur_10 !== "");
      const es = analysables.some(e => e.cafe_id === c.id && e.methode === "Switch" && e.note_sur_10 !== "");
      return eb && es;
    });
    CHARTS.comparatifMachines("g-duel",
      cafesDeux.map(c => c.nom),
      cafesDeux.map(c => +moyenne(analysables.filter(e => e.cafe_id === c.id && e.methode === "Brikka" && e.note_sur_10 !== "").map(e => e.note_sur_10)).toFixed(1)),
      cafesDeux.map(c => +moyenne(analysables.filter(e => e.cafe_id === c.id && e.methode === "Switch" && e.note_sur_10 !== "").map(e => e.note_sur_10)).toFixed(1)));

    // Nuages
    const pts = m => analysables
      .filter(e => e.methode === m && e.note_sur_10 !== "" && e._c.microns !== "")
      .map(e => ({ x: e._c.microns, y: e.note_sur_10, nom: e._c.cafe_nom + ", " + e.mouture_dial }));
    CHARTS.nuage("g-mouture", pts("Brikka"), pts("Switch"), I18N.t("axe_mouture"), "µm");

    const notees = analysables.filter(e => e.note_sur_10 !== "");
    const gouts = rendreGouts(notees);

    // Les trois cartes qui peuvent rester vides avec des données valides.
    majCarteVide("mouture", pts("Brikka").length + pts("Switch").length, causeMoutureVide(notees));
    majCarteVide("gouts", gouts.length, causeGoutsVide(notees));
    majCarteVide("duel", cafesDeux.length, causeDuelVide(notees));

    // Diagnostics
    const parDiag = {};
    analysables.forEach(e => (e.diagnostic || "").split("|").filter(Boolean).forEach(d => {
      parDiag[d] = (parDiag[d] || 0) + 1;
    }));
    const diagLabels = DIAGNOSTICS.filter(d => parDiag[d]);
    CHARTS.anneauDiagnostics("g-diagnostics", diagLabels, diagLabels.map(d => parDiag[d]));

    // Note par recette
    const parRecette = {};
    analysables.forEach(e => {
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
    /* HUIT et non cinq : la carte s'etire a la hauteur de sa rangee, et cinq
       lignes y laissaient un grand blanc. Des lignes valent mieux que du vide. */
    const dernieres = [...exts].sort((a, b) => b.date_heure.localeCompare(a.date_heure))
      .slice(0, DERNIERES_AFFICHEES);
    // Chaque ligne ouvre l'édition de son extraction. role et tabindex plutôt
    // qu'un vrai bouton : le contenu est structuré (div, span) et un bouton n'a
    // pas le droit d'en contenir.
    /* UNE VRAIE TABLE, et non plus une liste de blocs : les colonnes alignent
       les memes grandeurs d'une ligne a l'autre, ce qu'une liste ne fait pas.

       PLUS DE BULLE DU COMMENTAIRE AU SURVOL (v8.33) : il est deja ecrit sur la
       ligne juste dessous, la bulle le repetait mot pour mot. Chris la trouvait
       absurde. Le title dit seulement ce que fait le clic. */
    $("#dernieres-liste").innerHTML = dernieres.map(e =>
      '<tr class="derniere-cliquable' + (estRatee(e) ? " ligne-ratee" : "") +
      '" data-ext="' + e.id + '" tabindex="0" role="button" title="' + attrTitre(I18N.t("h_editer")) + '">' +
      '<td class="d-quand">' + fmtDateHeure(e.date_heure) + "</td>" +
      '<td class="d-machine"><span class="pastille-methode ' + e.methode.toLowerCase() +
        '" title="' + attrTitre(e.methode) + '"></span></td>' +
      '<td class="d-cafe"><b>' + I18N.tr(e._c.cafe_nom) + "</b>" +
        (estRatee(e) ? '<span class="mention-ratee">' + I18N.t("rt_badge") + "</span>" : "") + "</td>" +
      '<td class="d-mesures">' +
        (e.recette ? '<span class="d-recette">' + I18N.tr(e.recette) + "</span>" : "") +
        mesuresCourtes(e) +
        (e.diagnostic ? '<span class="d-diag">' + diagsAffiches(e.diagnostic) + "</span>" : "") +
      "</td>" +
      '<td class="d-gouts">' + goutsDerniere(e) + "</td>" +
      '<td class="d-note">' + (e.note_sur_10 !== "" ? e.note_sur_10 : "") + "</td></tr>" +
      commentaireDerniere(e)
    ).join("");
    /* Le texte complet au survol, mais SEULEMENT si la ligne l'a coupe : un
       commentaire lisible en entier n'a pas besoin d'etre repete. Mesure au
       survol et non au rendu : l'ecran peut se rendre cache, et tout mesure 0. */
    $("#dernieres-liste").onmouseover = ev => {
      const td = ev.target.closest(".derniere-commentaire td");
      if (td) td.title = td.scrollWidth > td.clientWidth + 1 ? td.textContent : "";
    };
  }

  /* LA DERNIERE TASSE, en grand.

     C'est la carte que Chris regarde en ouvrant le site : ce qu'il vient de
     boire, et ce qu'il en a pense. Elle reprend les memes briques que les cinq
     dernieres (mesures, gouts, commentaire) pour que les deux disent la meme
     chose, et cliquer dessus ouvre l'extraction, comme une ligne de la table.

     Elle se cache quand il n'y a rien : une carte vide qui annonce "pas de
     derniere tasse" n'apprend rien a quelqu'un qui voit deja un carnet vide. */
  function rendreDerniereTasse(exts) {
    const carte = $("#carte-derniere");
    const e = [...exts].sort((a, b) => b.date_heure.localeCompare(a.date_heure))[0];
    carte.hidden = !e;
    if (!e) return;

    const contexte = [];
    if (e.recette) contexte.push(I18N.tr(e.recette));
    if (e.dose_g > 0 && e.eau_g) contexte.push(e.dose_g + " → " + e.eau_g + " g");
    const t = fmtTemps(e.temps_total_s);
    if (t) contexte.push(t);
    if (e.temperature_c !== "" && e.temperature_c !== undefined) contexte.push(e.temperature_c + " °C");
    if (e.methode === "Brikka" && e.puissance_feu !== "" && e.puissance_feu !== undefined) {
      contexte.push(I18N.t("rg_feu", { f: e.puissance_feu }));
    }

    carte.dataset.ext = e.id;
    carte.setAttribute("role", "button");
    carte.setAttribute("tabindex", "0");
    carte.innerHTML =
      '<div class="derniere-grande-corps">' +
        '<p class="surligne">' + I18N.t("tb_derniere", { q: depuisQuand(e.date_heure) }) + "</p>" +
        '<p class="derniere-grande-cafe">' + I18N.tr(e._c.cafe_nom) + "</p>" +
        '<p class="derniere-grande-contexte">' +
          '<span class="pastille-methode ' + e.methode.toLowerCase() + '"></span>' +
          '<span class="derniere-grande-machine">' + e.methode + "</span>" +
          contexte.map(x => '<span class="sep" aria-hidden="true">|</span><span>' + x + "</span>").join("") +
        "</p>" +
        goutsDerniere(e) +
        (e.commentaire ? '<p class="derniere-grande-commentaire">' + attrTitre(e.commentaire) + "</p>" : "") +
        piedDerniere(e) +
      "</div>" +
      '<div class="derniere-grande-note">' +
        (estRatee(e) ? '<span class="badge-ratee">' + I18N.t("rt_badge") + "</span>" : "") +
        /* Sans note, on ecrit "pas encore notee" au lieu d un tiret : un tiret
           dans un grand chiffre se lit comme un moins, et la regle du projet
           interdit de toute facon le cadratin. */
        (e.note_sur_10 !== ""
          ? '<span class="grande-note">' + e.note_sur_10 + "</span>" +
            '<span class="grande-note-sur">' + I18N.t("tb_sur10") + "</span>"
          : '<span class="grande-note-sans">' + I18N.t("n_pas_notee") + "</span>") +
        (e.diagnostic ? '<span class="pastille-diag">' + diagsAffiches(e.diagnostic) + "</span>" : "") +
      "</div>";
  }

  /* LE PIED de la carte : ratio, mouture, ecoulement, cout. Quatre chiffres
     deja calcules, ceux qu'on compare d'une tasse a l'autre, qui occupent la
     hauteur que la carte gagne en s'alignant sur les chiffres cles. Chaque
     case n'apparait que si la valeur existe : une case vide est un trou. */
  function piedDerniere(e) {
    const cases = [];
    const carre = (libelle, valeur) => cases.push("<div><span>" + libelle + "</span><b>" + valeur + "</b></div>");
    if (e._c.ratioTexte) carre(I18N.t("d_ratio"), e._c.ratioTexte);
    if (e.mouture_dial) carre(I18N.t("d_mouture"), e.mouture_dial + (e._c.microns ? " <small>" + e._c.microns + " µm</small>" : ""));
    else if (e._c.moulu) carre(I18N.t("d_mouture"), I18N.t("paquet"));
    const ecoulement = fmtTemps(e.temps_ecoulement_s);
    if (ecoulement) carre(I18N.t("d_ecoulement"), ecoulement);
    if (e._c.cout_tasse_vnd !== "") carre(I18N.t("d_cout"), fmtVND(e._c.cout_tasse_vnd));
    return cases.length ? '<div class="derniere-grande-pied">' + cases.join("") + "</div>" : "";
  }

  /* « il y a 2 h ». Assez precis pour situer la tasse, jamais a la minute : on
     veut savoir si c'est ce matin ou avant hier, pas l'heure exacte, qui est
     deja dans la table juste dessous. */
  function depuisQuand(dh) {
    const min = Math.max(0, Math.round((Date.now() - new Date(dh)) / 60000));
    if (min < 60) return I18N.t("tb_min", { n: min });
    const h = Math.round(min / 60);
    if (h < 24) return I18N.t("tb_heures", { n: h });
    return I18N.t("tb_jours", { n: Math.round(h / 24) });
  }

  /* La ligne de MESURES d'une extraction : ce que Chris a réellement réglé.
     Chaque élément n'apparaît que s'il est renseigné, sinon la ligne se
     remplirait de trous pour les champs qu'il ne remplit pas.

     Le ratio porte son infobulle, comme dans l'historique. Sur la Brikka, "eau"
     désigne la CHAUDIÈRE et pas ce qui tombe dans la tasse : afficher le chiffre
     sans dire de quoi il parle en ferait un piège. Le ratio en tasse, lui,
     n'apparaît que s'il a été mesuré. */
  function mesuresDerniere(e) {
    const bouts = [];
    if (e.dose_g > 0 && e.eau_g) bouts.push(e.dose_g + " → " + e.eau_g + " g");
    if (e._c.ratioTexte) {
      bouts.push('<b title="' + attrTitre(detailRatio(e._c.ratioBase, e.dose_g, e.eau_g)) + '">' +
        e._c.ratioTexte + "</b>" +
        (e._c.ratioTasseTexte ? ' <small>(' + I18N.t("rt_tasse_court") + " " + e._c.ratioTasseTexte + ")</small>" : ""));
    }
    const total = fmtTemps(e.temps_total_s);
    if (total) bouts.push(total);
    if (e.mouture_dial) bouts.push(I18N.t("molette") + " " + e.mouture_dial);
    if (e.temperature_c !== "" && e.temperature_c !== undefined) bouts.push(e.temperature_c + " °C");
    // La puissance de feu ne veut rien dire hors Brikka : le Switch n'a pas de feu.
    if (e.methode === "Brikka" && e.puissance_feu !== "" && e.puissance_feu !== undefined) {
      bouts.push(I18N.t("rg_feu", { f: e.puissance_feu }));
    }
    if (!bouts.length) return "";
    return '<div class="derniere-mesures">' + bouts.join("<span>·</span>") + "</div>";
  }

  /* Les GOÛTS cochés, en petites pastilles, quatre au plus puis « +n ». La carte
     avait la place et ne disait rien de ce que la tasse avait en bouche, alors que
     c'est le sujet du carnet. Les valeurs stockées sont françaises, l'affichage
     passe par I18N.tag. */
  const DERNIERES_AFFICHEES = 8;
  const MAX_GOUTS_DERNIERE = 4;
  function goutsDerniere(e) {
    const tags = String(e.descripteurs || "").split("|").filter(Boolean);
    if (!tags.length) return "";
    const visibles = tags.slice(0, MAX_GOUTS_DERNIERE).map(t => '<span class="derniere-tag">' + I18N.tag(t) + "</span>");
    const reste = tags.length - visibles.length;
    return '<div class="derniere-gouts">' + visibles.join("") +
      (reste > 0 ? '<span class="derniere-tag derniere-tag-plus">+' + reste + "</span>" : "") + "</div>";
  }

  /* Le commentaire, en clair et tronqué, au lieu d'attendre le survol : c'est le
     seul champ qui dit POURQUOI une tasse était bonne, et il fallait poser la
     souris dessus pour le lire. Le survol garde le texte complet. */
  /* LE COMMENTAIRE SUR SA PROPRE LIGNE, tronque a UNE ligne par le CSS et non
     par un compte de caracteres : la largeur disponible depend de la fenetre, un
     seuil en dur coupe trop tot sur grand ecran et trop tard sur petit. Le texte
     entier ne vient au survol que si la ligne est coupee, voir plus haut. */
  function commentaireDerniere(e) {
    const c = String(e.commentaire || "").trim();
    if (!c) return "";
    return '<tr class="derniere-commentaire" data-ext="' + e.id + '"><td colspan="6">' + attrTitre(c) + "</td></tr>";
  }

  /* LES MESURES DE LA CARTE, version courte : la dose, l'eau et le temps. La
     molette, les degres et le feu sont dans l'historique, qui existe pour les
     comparer ; ici ils faisaient replier la ligne sur trois etages. */
  function mesuresCourtes(e) {
    const bouts = [];
    if (e.dose_g > 0 && e.eau_g) bouts.push(e.dose_g + " → " + e.eau_g + " g");
    const t = fmtTemps(e.temps_total_s);
    if (t) bouts.push(t);
    if (!bouts.length) return "";
    return '<span class="d-chiffres">' + bouts.join(" · ") + "</span>";
  }

  // Mis à disposition des autres écrans.
  /* Câblage des contrôles du tableau de bord. Appelé une fois par app.js. */
  function cablerTableau() {
    // Délégué sur la liste : son contenu est réécrit à chaque rendu, un handler
    // par ligne fuirait à chaque rafraîchissement du tableau de bord.
    const ouvrirDerniere = cible => {
      const li = cible.closest("[data-ext]");
      if (!li) return;
      const ext = DATA.state.extractions.find(x => x.id === li.dataset.ext);
      if (!ext) return;
      UI.chargerExtractionDansSaisie(ext, false);
    };
    /* La table ET la grande carte ouvrent l'extraction. Deleguer sur les deux
       plutot que sur document : un gestionnaire global attraperait les clics de
       tout le tableau de bord pour ne servir que deux zones. */
    [$("#dernieres-liste"), $("#carte-derniere")].forEach(zone => {
      zone.addEventListener("click", ev => ouvrirDerniere(ev.target));
      zone.addEventListener("keydown", ev => {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        ev.preventDefault();
        ouvrirDerniere(ev.target);
      });
    });
  }

  Object.assign(UI, {
    rendreDerniereTasse, rendreLegendeHeatmap, semainesVisibles,
    MIN_GAP, MIN_SAMPLE, MIN_TASSES_GOUT, PIRES_GOUTS, SEMAINES_HEATMAP, TOP_GOUTS,
    bestOfGroups, cablerTableau, causeDuelVide, causeGoutsVide, causeMoutureVide, computeInsights,
    insightAgePaquet, insightMoment, insightPuissance, insightRecettes, insightsParCafe,
    DERNIERES_AFFICHEES, majCarteVide, mesuresCourtes, note1, rendreGouts, rendreInsights, rendreStatsHeatmap, rendreTableau,
    statsHeatmap,
  });
})();
