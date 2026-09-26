/* Tableau de bord : la dernière tasse en grand, et les briques qu'elle partage
 * avec la table des dernières extractions (sorties de ui-tableau.js en v8.78). */
"use strict";

(() => {

  // Emprunté au noyau et à ui-constats.js, chargés avant nous.
  const { $, attrTitre, diagsAffiches, estRatee, extAnalysables, fmtTemps, fmtVND,
    moyenne, note1, trouverRecette } = UI;

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
    // Le temps total est au PIED (v8.39), à côté de la cible de la recette.
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
        placeDerniere(e) +
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

  /* LA PLACE DE LA TASSE PARMI CELLES DU MÊME CAFÉ (v8.39). La carte prend la
     hauteur des chiffres clés et laissait une bande vide d'environ 85 px entre
     les goûts et le pied. Elle sert maintenant à répondre à la question qu'on
     se pose devant une note : c'est un coup de chance, ou mon niveau ?
     Chaque tasse notée du café est un point sur l'échelle des notes, celle-ci
     en grand, la moyenne du café en trait. Sous trois tasses notées, rien :
     une place parmi deux ne dit rien. */
  function placeDerniere(e) {
    if (e.note_sur_10 === "" || e.note_sur_10 === undefined) return "";
    const soeurs = extAnalysables().filter(x => x.cafe_id === e.cafe_id && x.note_sur_10 !== "");
    if (!soeurs.some(x => x.id === e.id)) soeurs.push(e);
    if (soeurs.length < 3) return "";
    const note = Number(e.note_sur_10);
    const notes = soeurs.map(x => Number(x.note_sur_10));
    const moy = moyenne(notes);
    const devant = notes.filter(n => n > note).length;
    const egales = notes.filter(n => n === note).length - 1;
    const rang = devant === 0
      ? I18N.t(egales ? "pl_ex_aequo" : "pl_meilleure")
      : I18N.t("pl_rang", { k: devant + 1, n: notes.length });
    const ecart = note - moy;
    const situe = Math.abs(ecart) < 0.2 ? I18N.t("pl_dans_moyenne")
      : I18N.t(ecart > 0 ? "pl_au_dessus" : "pl_au_dessous", { x: note1(Math.abs(ecart)) });

    // L'échelle : de la note entière sous la plus basse jusqu'à 10.
    const bas = Math.max(0, Math.floor(Math.min(...notes)) - 1);
    const G = 12, D = 588, base = 34, pas = 6.5;
    const x = n => G + ((n - bas) / (10 - bas)) * (D - G);
    let svg = '<line x1="' + G + '" y1="' + (base + 8) + '" x2="' + D + '" y2="' + (base + 8) + '" stroke="var(--lignes)"></line>';
    for (let n = Math.ceil(bas); n <= 10; n += (10 - bas > 6 ? 2 : 1)) {
      svg += '<text x="' + x(n) + '" y="' + (base + 19) + '" text-anchor="middle">' + n + "</text>";
    }
    const xm = x(moy);
    svg += '<line x1="' + xm + '" y1="12" x2="' + xm + '" y2="' + (base + 8) + '" stroke="var(--attenue)" stroke-dasharray="3 3"></line>' +
      '<text x="' + (xm > D * 0.7 ? xm - 5 : xm + 5) + '" y="10" text-anchor="' + (xm > D * 0.7 ? "end" : "start") + '">' +
      I18N.t("pl_moyenne", { m: note1(moy) }) + "</text>";
    // Les autres tasses, empilées quand elles ont la même note.
    const piles = {};
    soeurs.forEach(s => {
      if (s.id === e.id) return;
      const n = Number(s.note_sur_10);
      const k = (piles[n] = (piles[n] || 0) + 1) - 1;
      svg += '<circle cx="' + x(n) + '" cy="' + (base - Math.min(k, 3) * pas) + '" r="2.6" fill="var(--texte)" opacity="0.55"></circle>';
    });
    // Celle-ci, par dessus, cernée de la couleur du panneau pour se détacher.
    svg += '<circle cx="' + x(note) + '" cy="' + (base - 3) + '" r="6.5" fill="var(--accent)" stroke="var(--panneau-2)" stroke-width="2"></circle>';
    return '<div class="derniere-place" role="img" aria-label="' + attrTitre(I18N.t("pl_aria", {
      n: notes.length, cafe: I18N.tr(e._c.cafe_nom), note: note1(note), m: note1(moy) })) + '">' +
      '<p class="derniere-place-tete"><span>' + I18N.t("pl_parmi", { n: notes.length, cafe: I18N.tr(e._c.cafe_nom) }) + "</span>" +
      "<span><b>" + rang + "</b>, " + situe + "</span></p>" +
      '<svg viewBox="0 0 600 ' + (base + 22) + '" aria-hidden="true">' + svg + "</svg></div>";
  }

  /* La CIBLE d'un chiffre du pied : ce que la recette visait, sinon ta moyenne
     sur ce café et cette recette. Une valeur sans repère ne dit pas si elle
     est bonne. */
  function cibleTempsRecette(r) {
    const m = /^total\s+(.+)$/.exec(String((r && r.totalTexte) || "").trim());
    if (!m) return "";
    return m[1].replace(/^environ\s+/, "≈ ").replace(/,.*$/, "");
  }

  /* LE PIED de la carte : ratio, temps, écoulement, mouture, coût, chacun avec
     sa cible dessous (v8.39). Chaque case n'apparait que si la valeur existe :
     une case vide est un trou. */
  function piedDerniere(e) {
    const r = trouverRecette(e.recette);
    const memes = extAnalysables().filter(x => x.id !== e.id && x.cafe_id === e.cafe_id && x.recette === e.recette);
    const moyTemps = champ => {
      const v = memes.map(x => Number(x[champ])).filter(n => n > 0);
      return v.length >= 2 ? fmtTemps(Math.round(moyenne(v))) : "";
    };
    const cases = [];
    const carre = (libelle, valeur, cible, ok) => cases.push("<div><span>" + libelle + "</span><b>" + valeur + "</b>" +
      (cible ? '<small class="' + (ok ? "cible-tenue" : "") + '">' + cible + "</small>" : "") + "</div>");

    if (e._c.ratioTexte) {
      let cible = "", ok = false;
      /* Au SWITCH seulement : l'eau de la recette est l'eau versée, la même
         grandeur que celle de la tasse. Sur la Brikka, c'est l'eau de la
         chaudière (150 g) pour un ratio d'environ 1:7 dans la tasse : les
         comparer annoncerait un écart qui n'existe pas. */
      if (e.methode === "Switch" && r && r.dose > 0 && r.eau > 0) {
        const vise = r.eau / r.dose;
        cible = I18N.t("pl_recette", { v: "1:" + vise.toFixed(1) });
        ok = Math.abs(Number(e.eau_g) / Number(e.dose_g) - vise) <= 0.3;
      }
      carre(I18N.t("d_ratio"), e._c.ratioTexte, cible, ok);
    }
    const total = fmtTemps(e.temps_total_s);
    if (total) {
      const vise = cibleTempsRecette(r);
      const moy = moyTemps("temps_total_s");
      carre(I18N.t("d_temps"), total,
        vise ? I18N.t("pl_recette", { v: vise }) : moy ? I18N.t("pl_ta_moyenne", { v: moy }) : "", false);
    }
    const ecoulement = fmtTemps(e.temps_ecoulement_s);
    if (ecoulement) {
      const moy = moyTemps("temps_ecoulement_s");
      carre(I18N.t("d_ecoulement"), ecoulement, moy ? I18N.t("pl_ta_moyenne", { v: moy }) : "", false);
    }
    if (e.mouture_dial) carre(I18N.t("d_mouture"), e.mouture_dial, e._c.microns ? e._c.microns + " µm" : "", false);
    else if (e._c.moulu) carre(I18N.t("d_mouture"), I18N.t("paquet"), "", false);
    if (e._c.cout_tasse_vnd !== "") carre(I18N.t("d_cout"), fmtVND(e._c.cout_tasse_vnd), I18N.t("pl_la_tasse"), false);
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

  Object.assign(UI, {
    DERNIERES_AFFICHEES, commentaireDerniere, goutsDerniere, mesuresCourtes, rendreDerniereTasse,
  });
})();
