/* Écran guide : les recettes de référence, le mode pas à pas, le convertisseur
 * de mouture et les tables de plages.
 *
 * Les recettes affichées ici s'adaptent aux grammes d'eau réellement saisis : une
 * recette écrite pour 240 g montrée telle quelle à quelqu'un qui en verse 150
 * serait un piège, pas une référence. */
"use strict";

(() => {

  // Emprunté au noyau, chargé avant nous.
  const { $, $$, antiRebond, attrTitre, basculerEtat, ecrireReplis, extAnalysables, fmtDecimal, fmtTemps, moyenne,
    peindreCurseur, recetteAvecVariantes, recettesVivantes, replis, toast } = UI;

  // ---------- Référence : recettes ----------

  const tetsuChoix = { p40: "sucre", p60: "plein" };
  const familleSelection = {}; // famille -> id de la variante affichée

  /* LE GUIDE EN BIBLIOTHÈQUE (v8.52). Deux choses nouvelles sur chaque recette,
     toutes deux calculées, rien d'écrit à la main :

     - ses PROFILS de café, pour les filtres : lavés ou fermentés, lus dans son
       texte « Pour qui », la première phrase d'abord (« Les lavés propres… »,
       « Les fermentés, natural, honey… »), le texte entier sinon. Une recette qui
       ne vise aucun profil (les Brikka) vaut pour tous et paraît sous les deux.
       Les cafés associés ont été essayés et écartés : le Balanced, lavé, figure
       dans presque toutes les listes et rendait tout « lavé ». Changer le texte
       d'une recette change son filtre ;
     - « Chez toi » : la moyenne de tes tasses notées sur CETTE recette. */
  const LAVE = /lav|wash/i, FERMENTE = /natur|honey|ana[eé]ro|ferment/i;
  function profilsRecette(r) {
    const texte = String(r.pourQui || "");
    const lire = t => [LAVE.test(t) ? "lave" : "", FERMENTE.test(t) ? "fermente" : ""].filter(Boolean);
    const premiere = lire(texte.split(/[.:]/)[0]);
    const p = premiere.length ? premiere : lire(texte);
    return p.length ? p : ["lave", "fermente"];
  }
  function chezToi(r) {
    const notes = extAnalysables().filter(e => e.recette === r.nom && e.note_sur_10 !== "").map(e => Number(e.note_sur_10));
    return '<p class="recette-chez-toi">' + (notes.length
      ? I18N.t("bi_chez_toi", { m: fmtDecimal(moyenne(notes), 1), n: notes.length })
      : I18N.t("bi_pas_essayee")) + "</p>";
  }
  const filtre = { valeur: "tout" };
  try { filtre.valeur = localStorage.getItem("guide-filtre") || "tout"; } catch (e) { /* sans stockage, tout */ }
  function appliquerFiltre() {
    $$("#grille-recettes .recette-carte").forEach(c => {
      const v = filtre.valeur;
      c.hidden = !(v === "tout" || c.classList.contains(v.toLowerCase()) || (c.dataset.profils || "").split(" ").includes(v));
    });
    $$("#biblio-filtres [data-filtre]").forEach(b => basculerEtat(b, b.dataset.filtre === filtre.valeur));
    const vide = $("#biblio-vide");
    if (vide) vide.hidden = $$("#grille-recettes .recette-carte").some(c => !c.hidden);
  }

  /* LES ONGLETS DU GUIDE (v8.52). Le sommaire montre UN panneau à la fois, celui
     qui contient la cible du lien ; les ancres restent, et une cible qui n'est pas
     en tête de son panneau (Quoi acheter, Règles d'achat) y défile. Recettes
     d'abord, et l'onglet choisi est retenu. */
  function montrerGuide(cible) {
    const el = cible ? document.getElementById(cible) : null;
    const panneau = el ? el.closest(".guide-panneau") : $("#gp-" + (cible || "recettes"));
    if (!panneau) return;
    $$(".guide-panneau").forEach(p => { p.hidden = p !== panneau; });
    $$(".guide-onglets [data-guide]").forEach(a => {
      const actif = a.dataset.guide === panneau.dataset.panneau;
      a.classList.toggle("courant", actif);
      if (actif) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
    try { localStorage.setItem("guide-onglet", panneau.dataset.panneau); } catch (e) { /* tant pis */ }
    if (el && el !== panneau.querySelector("h2, .ref-titre-ligne h2")) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* Ouvre UNE recette dans le Guide (v8.53, le podium du tableau de bord) : sa
     variante affichée si elle est d'une famille, le filtre remis sur « Toutes »
     pour qu'elle ne soit pas cachée, puis la carte au centre, un instant soulignée. */
  function montrerRecette(id) {
    const r = DATA.state.recettes.find(x => x.id === id);
    if (!r) { montrerGuide("ref-recettes"); return; }
    if (r.famille) familleSelection[r.famille] = r.id;
    filtre.valeur = "tout";
    rendreRecettes();
    montrerGuide("ref-recettes");
    const carte = $('#grille-recettes [data-recette="' + id + '"]');
    if (!carte) return;
    carte.scrollIntoView({ behavior: "smooth", block: "center" });
    carte.classList.add("recette-montree");
    setTimeout(() => carte.classList.remove("recette-montree"), 1800);
  }

  /* LA VIDÉO DE LA RECETTE (v8.64). Un lien YouTube devient « Voir la vidéo » :
     le lecteur ne se charge qu'au clic, dans la carte, depuis youtube-nocookie
     (pas de cookie tant qu'on ne lance rien, et pas de son surprise à
     l'ouverture du Guide). Tout autre lien reste un lien. */
  const idYoutube = url => (String(url || "").match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/) || [])[1] || "";
  const attr = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  function blocVideo(r) {
    if (!r.video) return "";
    const id = idYoutube(r.video);
    return '<div class="recette-video">' +
      (id ? '<button type="button" class="btn btn-petit" data-video="' + id + '">' + I18N.t("bi_video") + "</button>" : "") +
      '<a class="recette-video-lien" href="' + attr(r.video) + '" target="_blank" rel="noopener">' +
      I18N.t(id ? "bi_youtube" : "bi_source") + "</a></div>";
  }
  function lancerVideo(bouton) {
    const cadre = document.createElement("iframe");
    cadre.className = "recette-lecteur";
    cadre.src = "https://www.youtube-nocookie.com/embed/" + bouton.dataset.video + "?autoplay=1&rel=0";
    cadre.title = I18N.t("bi_video");
    cadre.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    cadre.allowFullscreen = true;
    bouton.replaceWith(cadre);
  }

  /* LA VIDÉO DANS LA SAISIE (v8.69), sous la fiche recette du panneau de droite.
     Sa propre carte, et non dans la fiche : la fiche se redessine à chaque
     frappe, et la vidéo en cours se serait coupée. Elle ne se refait que
     quand la recette ou son lien changent. */
  function majVideoAside(r) {
    const zone = $("#aside-video");
    if (!zone) return;
    const cle = r ? r.id + "|" + (r.video || "") : "";
    if (zone.dataset.pour === cle) return;
    zone.dataset.pour = cle;
    const bloc = r ? blocVideo(r) : "";
    zone.hidden = !bloc;
    zone.innerHTML = bloc;
    const b = zone.querySelector("[data-video]");
    if (b) b.addEventListener("click", () => lancerVideo(b));
  }

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
    return '<article class="carte recette-carte ' + r.methode.toLowerCase() + '" data-recette="' + r.id + '" data-profils="' +
      profilsRecette(r).join(" ") + '">' +
      '<div class="recette-entete">' +
      (r.numero ? '<span class="recette-numero">' + r.numero + "</span>" : '<span class="recette-numero">' + r.methode + "</span>") +
      badges + "</div>" +
      "<h3>" + r.nom + "</h3>" +
      pilules +
      '<p class="recette-sous">' + r.sousTitre + "</p>" +
      '<div class="recette-params">' + params + "</div>" +
      blocVideo(r) +
      chezToi(r) +
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
    appliquerFiltre();

    rendreTetsu();

    $$("[data-var-fam]").forEach(b => b.addEventListener("click", () => {
      familleSelection[b.dataset.varFam] = b.dataset.varId;
      rendreRecettes();
    }));
    $$("[data-pasapas]").forEach(b => b.addEventListener("click", () => ouvrirPasAPas(b.dataset.pasapas)));
    $$("#grille-recettes [data-video]").forEach(b => b.addEventListener("click", () => lancerVideo(b)));
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
      return "<li><span class=\"etape-temps\">" + fmtTemps(i * TETSU.intervalle) + "</span><span>" +
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
      '<p class="tetsu-detail">' + I18N.tr(v40.detail) + " " + I18N.tr(v60.detail) + " " + I18N.t("te_fin", { s: TETSU.intervalle }) + "</p>";
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
      /* Le TOTAL d'abord, comme toutes les autres recettes (« jusqu'à 90 g ») :
         le versement seul (30, 60, puis 45) ne se lisait pas sur la balance, et
         le mode Brassage, qui cherche « à X g », affichait 60 au lieu de 90. */
      return mettreAEchelle(pours.map((p, i) => {
        cumul += p;
        return { t: i * TETSU.intervalle, texte: i === 0
          ? I18N.t("pap_premier", { c: cumul, b: I18N.t("pap_bloom") })
          : I18N.t("pap_verser", { p, c: cumul, b: "" }) };
      // L'écoulement, 30 secondes après le dernier versement.
      }).concat([{ t: (pours.length - 1) * TETSU.intervalle + 30, texte: I18N.t("pap_drain") }]));
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
    peindreCurseur($("#conv-slider"));
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
  /* Câblage des contrôles du Guide : moulin, pas à pas, boutons de copie.
     Appelé une fois par app.js. */
  function cablerGuide() {
    $("#conv-dial").addEventListener("input", rendreConvertisseurDifferee);
    $("#conv-slider").addEventListener("input", () => {
      $("#conv-dial").value = GRIND.dialDepuisCrans(Number($("#conv-slider").value));
      /* IMMÉDIAT, et c'est un changement assumé. L'anti-rebond posé en v7.57
         couvrait un redessin complet du SVG à chaque cran ; depuis que le
         squelette de la réglette est construit une seule fois, il ne reste que
         deux attributs à déplacer. Garder les 90 ms d'attente reviendrait à
         payer le défaut sans le bénéfice, sur le seul contrôle du site qu'on
         manipule en continu. Le champ texte, lui, garde son anti-rebond. */
      rendreConvertisseur();
    });
    /* Le seul chemin qui change vraiment un réglage depuis cet écran. Il écrit
       le même repli que l'écran Paramètres, il n'y a donc qu'une source. */
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
      try { localStorage.setItem("guide-filtre", filtre.valeur); } catch (e) { /* tant pis */ }
      appliquerFiltre();
    }));
    $$(".guide-onglets [data-guide]").forEach(a => a.addEventListener("click", ev => {
      ev.preventDefault();
      montrerGuide(a.getAttribute("href").slice(1));
    }));
    // Au démarrage : l'onglet retenu, sinon les recettes.
    let onglet = "recettes";
    try { onglet = localStorage.getItem("guide-onglet") || "recettes"; } catch (e) { /* recettes */ }
    const panneau = $("#gp-" + onglet) || $("#gp-recettes");
    const titre = panneau && panneau.querySelector("h2");
    montrerGuide(titre && titre.id ? titre.id : null);

    // Boutons de copie des messages vietnamiens
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
  }

  Object.assign(UI, { majVideoAside,
    cablerGuide, carteRecette, chezToi, conseilMouture, montrerGuide, montrerRecette, profilsRecette, etapesPour, facteurEau, familleSelection, ouvrirPasAPas,
    pap, papDemarrer, papSuivant, papTic, rendreConvertisseur, rendreConvertisseurDifferee,
    rendrePapEtapes, rendreRecettes, rendreReperesMouture, rendreTablePlages, rendreTetsu,
    tetsuChoix, versementsTetsu,
  });
})();
