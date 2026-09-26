/* Écran d'accueil : le calendrier d'activité, les analyses et les dernières
 * extractions. Les phrases calculées vivent dans ui-constats.js et la grande
 * carte de la dernière tasse dans ui-derniere.js (découpés en v8.78). */
"use strict";

(() => {

  // Emprunté au noyau, chargé avant nous.
  const { $, $$, animerCompteur, attrTitre, cleLocale, diagsAffiches,
    estRatee, extAnalysables, extAvecCalculs, fmtDateHeure, fmtDecimal, moyenne, nav, trouverRecette } = UI;
  // Et aux deux morceaux sortis d'ici en v8.78, chargés juste avant.
  const { MIN_GAP, MIN_SAMPLE, note1, cablerConstats, rendreInsights,
    DERNIERES_AFFICHEES, commentaireDerniere, goutsDerniere, mesuresCourtes, rendreDerniereTasse } = UI;

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

  /* LES LECTURES DES ANALYSES (v8.39). Une phrase par onglet, à côté du
     graphique, pour ne pas avoir à l'interpréter. Chacune se tait (chaîne
     vide) quand ses données ne permettent pas de conclure : mêmes seuils que
     partout, trois tasses par groupe. */
  function lectureClassement(items, cleUn, cleDeux) {
    const ok = items.filter(i => i.n >= MIN_SAMPLE);
    if (ok.length < 2) return "";
    const haut = ok[0], bas = ok[ok.length - 1];
    return I18N.t(ok.length > 2 ? cleDeux : cleUn, {
      a: haut.label, ma: note1(haut.value), b: bas.label, mb: note1(bas.value),
    });
  }

  function lectureMachines(nB, nS) {
    if (nB.length < MIN_SAMPLE || nS.length < MIN_SAMPLE) return "";
    const mB = moyenne(nB), mS = moyenne(nS), ecart = Math.abs(mB - mS);
    if (ecart < MIN_GAP) return I18N.t("lec_machines_egal", { mb: note1(mB), ms: note1(mS) });
    return I18N.t(mS > mB ? "lec_switch_devant" : "lec_brikka_devant", {
      x: note1(ecart), s: ecart >= 2 ? "s" : "",
      souvent: nB.length === nS.length ? ""
        : I18N.t(nB.length > nS.length ? "lec_souvent_brikka" : "lec_souvent_switch"),
    });
  }

  function lectureDiagnostics(parDiag) {
    const total = Object.values(parDiag).reduce((a, b) => a + b, 0);
    const tri = Object.entries(parDiag).sort((a, b) => b[1] - a[1]);
    if (!tri.length) return "";
    return I18N.t("lec_diag", { d: diagsAffiches(tri[0][0]), n: tri[0][1], t: total });
  }

  function lectureMouture(analysables) {
    let meilleur = null;
    ["Brikka", "Switch"].forEach(m => {
      const parDial = {};
      analysables.filter(e => e.methode === m && e.note_sur_10 !== "" && e.mouture_dial)
        .forEach(e => (parDial[e.mouture_dial] = parDial[e.mouture_dial] || []).push(e.note_sur_10));
      Object.entries(parDial).filter(([, ns]) => ns.length >= MIN_SAMPLE).forEach(([dial, ns]) => {
        const moy = moyenne(ns);
        if (!meilleur || moy > meilleur.moy) meilleur = { m, dial, moy, n: ns.length };
      });
    });
    return meilleur ? I18N.t(meilleur.m === "Brikka" ? "lec_mouture_brikka" : "lec_mouture_switch", {
      d: meilleur.dial, x: note1(meilleur.moy), n: meilleur.n,
    }) : "";
  }

  function lectureGouts(items, moyenneGlobale) {
    if (items.length < 2) return "";
    const bons = items.filter(i => i.value >= moyenneGlobale).slice(0, 2).map(i => i.label);
    const pire = items[items.length - 1];
    if (!bons.length) return "";
    return I18N.t(pire.value < moyenneGlobale ? "lec_gouts" : "lec_gouts_sans_pire", {
      a: bons.join(I18N.t("lec_et")), p: pire.label,
    });
  }

  /* Les ONGLETS. L'onglet choisi est retenu dans ce navigateur : on revient
     sur la question qu'on se posait. Les panneaux ne sont jamais en
     display: none (voir .analyses-pile) : ils sont inertes et invisibles, pour
     que chaque graphe garde sa taille. */
  const CLE_ONGLET = "analyse-onglet";
  function montrerAnalyse(nom, focus) {
    const boutons = $$(".onglets-analyses [role=tab]");
    if (!boutons.some(b => b.dataset.analyse === nom)) nom = "cafes";
    boutons.forEach(b => {
      const actif = b.dataset.analyse === nom;
      b.setAttribute("aria-selected", String(actif));
      b.tabIndex = actif ? 0 : -1;
      if (actif && focus) b.focus();
      const panneau = $("#analyse-" + b.dataset.analyse);
      panneau.classList.toggle("courant", actif);
      panneau.inert = !actif;
      panneau.setAttribute("aria-hidden", String(!actif));
    });
    try { localStorage.setItem(CLE_ONGLET, nom); } catch (e) { /* sans stockage, on repart sur Cafés */ }
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
      { valeur: REGLAGES.ecartACafeEgal(analysables) || 0, label: I18N.t("kpi_regularite"), dec: 1, plusMoins: true },
    ];
    $("#kpis").innerHTML = kpis.map(k =>
      '<div class="kpi"><div class="kpi-valeur"><span class="kpi-nombre"></span>' +
      (k.sur10 ? "<small> / 10</small>" : k.mg ? "<small> mg</small>" : k.plusMoins ? "<small> pt</small>" : "") +
      '</div><div class="kpi-label">' + k.label + "</div></div>"
    ).join("");
    /* Une moyenne sans tasse n'est pas zéro (v8.38) : « 0,0 / 10 » se lisait
       comme une semaine de tasses ratées. Un trait, sans animation ni unité. */
    kpis[2].vide = !notes7j.length;
    kpis[3].vide = notes.length < 2;
    $$("#kpis .kpi-nombre").forEach((el, i) => {
      if (kpis[i].vide) {
        el.textContent = "-";
        el.parentElement.querySelector("small")?.remove();
        return;
      }
      animerCompteur(el, kpis[i].valeur, kpis[i].dec, "", kpis[i].plusMoins ? "± " : "");
    });

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
    let iGliss = 0, derniere = null, derniereDate = null;
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
        if (glissante[iGliss].valeur !== null) {
          derniere = glissante[iGliss].valeur;
          derniereDate = String(glissante[iGliss].date).slice(0, 10);
        }
        iGliss += 1;
      }
      /* Prolongée sept jours au plus après la dernière tasse notée (v8.38) :
         au-delà, elle traçait une ligne plate sur un mois sans une tasse, une
         tendance que rien ne mesurait. */
      const vieille = derniereDate &&
        (new Date(cle + "T12:00") - new Date(derniereDate + "T12:00")) / 86400000 > 7;
      tendance.push(vieille ? null : derniere);
    }
    CHARTS.barresEtLigne30j("g-30jours", labels, comptes, moyennes, details, tendance, UI.rendreCafes30j(exts));

    // Heatmap
    const parJour = {}, infoParJour = {};
    exts.forEach(e => {
      const cle = e.date_heure.slice(0, 10);
      parJour[cle] = (parJour[cle] || 0) + 1;
    });
    const notesParJour = {};
    analysables.forEach(e => { if (e.note_sur_10 !== "") (notesParJour[e.date_heure.slice(0, 10)] = notesParJour[e.date_heure.slice(0, 10)] || []).push(e.note_sur_10); });
    Object.keys(parJour).forEach(cle => { if (notesParJour[cle]) infoParJour[cle] = I18N.t("d_note") + " " + moyenne(notesParJour[cle]).toFixed(1); });
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
    $("#lecture-cafes").textContent = lectureClassement(
      itemsCafes.map(i => ({ ...i, n: parCafe[i.nomBrut].length })), "lec_cafes_deux", "lec_cafes");

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
    $("#lecture-gouts").textContent = lectureGouts(gouts, moyenne(notees.map(e => e.note_sur_10)) || 0);
    $("#lecture-machines").textContent = lectureMachines(nB, nS);
    $("#lecture-mouture").textContent = lectureMouture(analysables);

    // Les trois cartes qui peuvent rester vides avec des données valides.
    majCarteVide("mouture", pts("Brikka").length + pts("Switch").length, causeMoutureVide(notees));
    majCarteVide("gouts", gouts.length, causeGoutsVide(notees));
    majCarteVide("aromes", CHARTS.roueAromes(notees), causeGoutsVide(notees));
    majCarteVide("duel", cafesDeux.length, causeDuelVide(notees));

    // Diagnostics
    const parDiag = {};
    analysables.forEach(e => (e.diagnostic || "").split("|").filter(Boolean).forEach(d => {
      parDiag[d] = (parDiag[d] || 0) + 1;
    }));
    const diagLabels = DIAGNOSTICS.filter(d => parDiag[d]);
    CHARTS.anneauDiagnostics("g-diagnostics", diagLabels, diagLabels.map(d => parDiag[d]));
    $("#lecture-diagnostics").textContent = lectureDiagnostics(parDiag);

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
    $("#lecture-recettes").textContent = lectureClassement(
      itemsRecettes.map(i => ({ ...i, label: I18N.tr(i.label), n: parRecette[i.label].length })), "lec_recettes_deux", "lec_recettes");

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

  /* Câblage des contrôles du tableau de bord. Appelé une fois par app.js. */
  function cablerTableau() {
    cablerConstats();
    const onglets = $(".onglets-analyses");
    onglets.addEventListener("click", ev => {
      const b = ev.target.closest("[role=tab]");
      if (b) montrerAnalyse(b.dataset.analyse);
    });
    // Flèches gauche et droite, Début et Fin : le clavier d'une vraie liste d'onglets.
    onglets.addEventListener("keydown", ev => {
      const liste = $$(".onglets-analyses [role=tab]");
      const i = liste.findIndex(b => b.getAttribute("aria-selected") === "true");
      const cible = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: liste.length - 1 }[ev.key];
      if (cible === undefined) return;
      ev.preventDefault();
      montrerAnalyse(liste[(cible + liste.length) % liste.length].dataset.analyse, true);
    });
    let depart = "cafes";
    try { depart = localStorage.getItem(CLE_ONGLET) || depart; } catch (e) { /* idem */ }
    montrerAnalyse(depart);

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

  // Mis à disposition des autres écrans.
  Object.assign(UI, {
    rendreLegendeHeatmap, semainesVisibles,
    MIN_TASSES_GOUT, PIRES_GOUTS, SEMAINES_HEATMAP, TOP_GOUTS,
    cablerTableau, causeDuelVide, causeGoutsVide, causeMoutureVide,
    majCarteVide, rendreGouts, rendreStatsHeatmap, rendreTableau,
    statsHeatmap,
  });
})();
