/* Migrations : version de schéma et rattrapages de l'existant.
 *
 * Tout ce qui réécrit des données déjà stockées pour suivre un changement du
 * code vit ici, et nulle part ailleurs. `pour(state, aides)` lie les pas à
 * l'état que data.js possède ; `aides` apporte ce qui écrit dans l'état hors
 * des tables (pierres tombales, lecture des réglages). Les normaliseurs et les
 * semences viennent de DATA_SCHEMA. */
"use strict";

const DATA_MIGRATIONS = (() => {

  function pour(state, aides) {
    const { marquerSupprime, reglagesCourants } = aides;
    const { PUISSANCE_FEU_HISTORIQUE, estampiller, nouvelId, dateLocaleAujourdhui, normaliserReglages,
      normaliserRecette, normaliserAchat, recettesDefaut, tassesDefaut } = DATA_SCHEMA;

    // ---------- Migration : anciens noms de recettes et anciennes fiches ----------
    // Idempotente : peut tourner à chaque chargement sans effet de bord.
    /* ---------- VERSION DE SCHÉMA ----------

       Il y avait six rattrapages à usage unique, chacun marqué par un drapeau dans
       `localStorage`, donc PAR APPAREIL, alors que les données qu'ils corrigent
       sont PARTAGÉES entre appareils. Un appareil qui démarrait avec un stockage
       vide posait ses drapeaux sur rien, recevait ensuite le document du serveur
       non migré, et ne le migrait plus jamais. Ce n'est pas théorique : c'est
       arrivé avec les 150 g de chaudière de la Brikka.

       Maintenant : un numéro de version rangé dans la ligne `reglages`, donc
       synchronisé avec le reste. On applique les pas dont le numéro dépasse la
       version du document, puis on écrit la nouvelle version. Un appareil neuf qui
       reçoit un document déjà migré ne rejoue rien, et un document en retard est
       rattrapé par le premier appareil qui l'ouvre, quel qu'il soit.

       POUR AJOUTER UNE MIGRATION : un pas de plus à la FIN, avec le numéro suivant,
       et `SCHEMA_ACTUEL` incrémenté. Ne jamais renuméroter, ne jamais insérer au
       milieu : le numéro déjà écrit chez Chris est une promesse.

       Chaque pas ne touche QUE la valeur semée d'avant. Un pas qui écraserait un
       réglage choisi volontairement serait un bug, pas une migration. */
    const SCHEMA_ACTUEL = 10;

    // Rattrapage de la puissance de feu des recettes Brikka : l'échelle de Chris a
    // bougé deux fois, 3 puis 4 puis 2.
    const majFeuBrikka = (concerne, valeur) => () => {
      let touche = false;
      state.recettes.forEach(rec => {
        if (rec.methode !== "Brikka" || !concerne(rec)) return;
        rec.puissance_feu = valeur;
        estampiller(rec);
        touche = true;
      });
      return touche;
    };

    const PAS_DE_SCHEMA = [
      { v: 1, nom: "feu 3 devient 4", appliquer: majFeuBrikka(r => Number(r.puissance_feu) === 3, 4) },
      { v: 2, nom: "feu 4 devient 2", appliquer: majFeuBrikka(r => Number(r.puissance_feu) === 4, 2) },
      // Les recettes semées avant l'existence du champ ne portent rien : la colonne
      // Feu des Paramètres restait vide et seul le repli sauvait le préremplissage.
      { v: 3, nom: "feu vide devient 2",
        appliquer: majFeuBrikka(r => r.puissance_feu === "" || r.puissance_feu === undefined, 2) },
      // 100 g était une estimation, 150 g est la contenance réelle de la chaudière.
      // Et plus de température cible : sur la Brikka c'est la flamme qui décide.
      { v: 4, nom: "chaudière Brikka a 150 g", appliquer: () => {
        let touche = false;
        state.recettes.forEach(rec => {
          if (rec.methode !== "Brikka" || Number(rec.eau) !== 100) return;
          rec.eau = 150;
          rec.temp = "";
          estampiller(rec);
          touche = true;
        });
        return touche;
      } },
      /* Molette unique. Le Timemore de Chris reste posé sur 1.5.0, le compromis qui
         marche sur les deux machines : une cible par recette décrivait un geste
         qu'il ne fait jamais. Concerne les dix recettes, Switch comprises. */
      { v: 5, nom: "molette unique a 1.5.0", appliquer: () => {
        let touche = false;
        state.recettes.forEach(rec => {
          if (rec.dial === "1.5.0") return;
          rec.dial = "1.5.0";
          estampiller(rec);
          touche = true;
        });
        return touche;
      } },
      /* Chronicler et Sweet : 240 g, pas 225. Le document source dit "15 g / 240 g,
         ratio 1:16" avec un premier versement de 120 g ; la transcription d'origine
         avait rétréci la recette de 6 %. */
      { v: 6, nom: "Chronicler a 240 g", appliquer: () => {
        let touche = false;
        state.recettes.forEach(rec => {
          if (rec.famille !== "chronicler" || Number(rec.eau) !== 225) return;
          rec.eau = 240;
          rec.ratioTexte = "ratio 1:16, environ 210 ml en tasse";
          rec.etapes = (rec.etapes || []).map(e => ({
            ...e,
            texte: String(e.texte).split("112 g").join("120 g").split("225 g").join("240 g"),
          }));
          rec.note = String(rec.note || "").split("225 g").join("240 g").split("affiche 225").join("affiche 240");
          estampiller(rec);
          touche = true;
        });
        return touche;
      } },

      /* Trois corrections de TEXTE, vérifiées le 3 septembre 2026.

         1. La Brikka se remplit à l'EAU FROIDE. C'est la consigne Bialetti pour ce
            modèle précisément : sa soupape lestée est calibrée sur la montée en
            pression que produit l'eau froide, et l'eau préchauffée est la méthode
            de la Moka Express. La recette dite "classique" prescrivait 80 à 90
            degrés, donc ni ce que Chris fait ni ce que le fabricant recommande.

         2. "Écoulement sous 10 secondes, la mouture est trop fine : passer à
            1.4.0" envoyait dans le mauvais sens. 1.4.0 vaut 582 µm, soit PLUS FIN
            que 1.5.0 qui vaut 624. Le diagnostic est juste, un lit trop serré fait
            lâcher la soupape d'un coup ; le remède doit être plus GROSSIER.

         3. Le Costaud (Bloom) promettait "plus fin" alors que le pas v5 a aligné
            les dix recettes sur 1.5.0. Le texte décrivait un réglage que la fiche
            ne porte plus.

         Chaque remplacement est CIBLÉ sur l'ancien texte : une recette que Chris
         aurait déjà réécrite à la main n'est pas touchée. */
      { v: 7, nom: "eau froide Brikka et sens de la mouture", appliquer: () => {
        let touche = false;
        const remplacer = (rec, champ, avant, apres) => {
          if (String(rec[champ] || "").indexOf(avant) < 0) return false;
          rec[champ] = String(rec[champ]).split(avant).join(apres);
          return true;
        };
        state.recettes.forEach(rec => {
          let bouge = false;
          // La classique porte variante "Standard", pas une chaine vide.
          if (rec.famille === "brikka-classique" && rec.variante !== "Eau préchauffée") {
            const etapes = (rec.etapes || []).map(e => {
              if (String(e.texte).indexOf("Préchauffer l'eau à 80 ou 90 degrés") < 0) return e;
              bouge = true;
              return { ...e, texte: "Remplir la chaudière à l'eau FROIDE : c'est la consigne Bialetti pour la Brikka, dont la soupape lestée est calibrée sur cette montée en pression. L'eau préchauffée est la méthode de la Moka Express, pas celle-ci." };
            });
            if (bouge) rec.etapes = etapes;
          }
          if (remplacer(rec, "note", "la mouture est trop fine : passer à 1.4.0.",
            "la mouture est trop fine et la soupape lâche d'un coup : passer à 1.6.0, plus grossier.")) bouge = true;
          if (remplacer(rec, "pourQui",
            "seuls la température de départ, la flamme et la mouture changent.",
            "seuls la température de départ, la flamme et la mouture changent. À savoir avant de comparer : Bialetti recommande l'eau FROIDE pour la Brikka, l'eau préchauffée étant la méthode de la Moka Express. Cette recette applique donc volontairement l'autre méthode.")) bouge = true;
          if (remplacer(rec, "pourQui", "Plus chaud, plus fin, plus long.",
            "Plus chaud et plus long. Pour le plus fin, descendre d'un cran à la main : les dix recettes portent 1.5.0 depuis que je ne recompte plus les crans à chaque changement de machine.")) bouge = true;
          if (bouge) { estampiller(rec); touche = true; }
        });
        return touche;
      } },

      /* Les deux recettes Brikka au lait fusionnent : même dose, même eau, même
         molette, même feu, et leurs étapes disaient toutes les deux "extraire
         exactement comme la Brikka classique". Seule la texture du lait changeait.
         Le renommage recolle l'historique, ce pas retire la recette en trop.

         Uniquement si elle porte encore son nom d'origine : renommée, elle est
         devenue une recette personnelle et ne nous appartient plus. */
      { v: 8, nom: "fusion des deux Brikka au lait", appliquer: () => {
        let touche = false;
        const avant = state.recettes.length;
        state.recettes = state.recettes.filter(rec =>
          !(rec.id === "brikka-cappuccino" && rec.nom === "Brikka cappuccino"));
        if (state.recettes.length !== avant) {
          marquerSupprime("recettes", "brikka-cappuccino");
          touche = true;
        }
        /* La SURVIVANTE prend le nom fusionné et le contenu de la semence. Sans
           ça, l'historique renommé pointerait vers "Brikka au lait" pendant que la
           recette s'appellerait encore "Brikka flat white" : un nom de recette
           orphelin, qui casse le panneau latéral et le préremplissage.

           Le nom d'origine encore en place sert de preuve que la recette n'a pas
           été retouchée à la main. Renommée, elle appartient à Chris et on n'y
           touche pas. */
        const fusionnee = RECETTES_DEPART.find(d => d.id === "brikka-flatwhite");
        state.recettes.forEach(rec => {
          if (rec.id !== "brikka-flatwhite" || rec.nom !== "Brikka flat white" || !fusionnee) return;
          ["nom", "sousTitre", "etapes", "pourQui", "note", "volumeTypique", "lait", "cafesAssocies"]
            .forEach(champ => { rec[champ] = fusionnee[champ]; });
          estampiller(rec);
          touche = true;
        });
        return touche;
      } },

    /* Deux recettes de percolation pure rejoignent la graine en v7.92, en
       deuxième et troisième positions : Better 1 Cup (Hoffmann) et One and Done
       (Lance Hedrick). Les étiquettes « Recette N » des recettes d'origine
       suivantes se décalent, et la Sweet, variante de la Chronicler affichée sur
       la même carte, reprend l'étiquette de sa famille. Ciblé sur l'ancienne
       étiquette : une étiquette réécrite à la main n'est pas touchée. L'ORDRE
       d'affichage, lui, est rétabli à chaque chargement par migrerDonnees. */
    { v: 9, nom: "numéros des recettes après Hoffmann et One and Done", appliquer: () => {
      const nouveaux = { "sweet": ["Recette 2", "Recette 1"], "costaud-bloom": ["Recette 3", "Recette 4"],
        "costaud-immersion": ["Recette 4", "Recette 5"], "tetsu-devil": ["Recette 5", "Recette 6"],
        "sherrycipe": ["Recette 6", "Recette 7"] };
      let touche = false;
      state.recettes.forEach(rec => {
        const n = nouveaux[rec.id];
        if (!n || rec.numero !== n[0]) return;
        rec.numero = n[1];
        estampiller(rec);
        touche = true;
      });
      return touche;
    } },

    /* La Sweet passe en fin de liste (v7.95) et prend l'étiquette « Recette 8 ».
       Ciblé sur l'étiquette posée par le pas v9, sinon rien. */
    { v: 10, nom: "la Sweet en dernier", appliquer: () => {
      let touche = false;
      state.recettes.forEach(rec => {
        if (rec.id !== "sweet" || rec.numero !== "Recette 1") return;
        rec.numero = "Recette 8";
        estampiller(rec);
        touche = true;
      });
      return touche;
    } },
    ];

    /* Applique les pas manquants et écrit la nouvelle version. Renvoie vrai si
       quelque chose a bougé, pour que l'appelant sache qu'il faut persister. */
    function appliquerSchema() {
      const version = Number(reglagesCourants().schema_version) || 0;
      if (version >= SCHEMA_ACTUEL) return false;
      PAS_DE_SCHEMA.filter(p => p.v > version).forEach(p => p.appliquer());
      state.reglages = [estampiller(normaliserReglages({
        ...reglagesCourants(),
        schema_version: SCHEMA_ACTUEL,
      }))];
      return true;
    }

    function migrerDonnees() {
      // 1. Renomme les anciennes recettes dans l'historique et les cafés.
      state.extractions.forEach(e => {
        if (RENOMMAGES_RECETTES[e.recette]) e.recette = RENOMMAGES_RECETTES[e.recette];
      });
      state.cafes.forEach(c => {
        if (RENOMMAGES_RECETTES[c.recette_recommandee]) c.recette_recommandee = RENOMMAGES_RECETTES[c.recette_recommandee];
      });
      // 2. Retire les recettes d'origine de l'ancienne génération, garde les
      //    recettes personnelles, et garantit la présence des nouvelles.
      const avaitAnciennes = state.recettes.some(r => ANCIENS_SEED_IDS.includes(r.id));
      if (avaitAnciennes) {
        const persos = state.recettes.filter(r => !ANCIENS_SEED_IDS.includes(r.id) && !RECETTES_DEPART.some(d => d.id === r.id));
        state.recettes = recettesDefaut().concat(persos);
      } else {
        RECETTES_DEPART.forEach(d => {
          const idx = state.recettes.findIndex(r => r.id === d.id);
          if (idx < 0) {
            state.recettes.push(normaliserRecette({ ...d, etapes: d.etapes.map(e => ({ ...e })), cafesAssocies: [...d.cafesAssocies] }));
            return;
          }
          // Mise à niveau structurelle : familles et variantes (v7), sans toucher
          // aux paramètres que l'utilisateur aurait édités.
          const ex = state.recettes[idx];
          if ((d.variante || "") && (ex.variante || "") !== d.variante) {
            if (ex.nom !== d.nom) {
              state.extractions.forEach(e => { if (e.recette === ex.nom) e.recette = d.nom; });
              state.cafes.forEach(c => { if (c.recette_recommandee === ex.nom) c.recette_recommandee = d.nom; });
              ex.nom = d.nom;
            }
            ex.famille = d.famille;
            ex.variante = d.variante;
          }
        });
      }
      // 2 bis. ORDRE d'affichage : les recettes d'origine dans l'ordre de la
      //    graine, les personnelles ensuite dans leur ordre. Idempotent. Sans ça,
      //    une recette ajoutée à la graine arrivait en fin de liste chez qui avait
      //    déjà des données, quelle que soit sa position dans RECETTES_DEPART.
      const rang = new Map(RECETTES_DEPART.map((d, i) => [d.id, i]));
      state.recettes = state.recettes
        .map((r, i) => ({ r, cle: rang.has(r.id) ? rang.get(r.id) : RECETTES_DEPART.length + i }))
        .sort((x, y) => x.cle - y.cle)
        .map(x => x.r);
      // 3. Met à jour les fiches Sáng Tạo 4 et Balanced si elles n'ont pas
      //    encore reçu leurs corrections (marquées par le tag).
      const c1 = state.cafes.find(c => c.id === "c1" && (c.nom || "").includes("Sáng Tạo"));
      if (c1 && !c1.tag) {
        Object.assign(c1, {
          espece: "Blend Arabica, Robusta, Excelsa, Catimor",
          procede: "Torréfaction traditionnelle avec additifs",
          notes_annoncees: "Corps rond, sucré, faible acidité, arôme persistant. Étiquette : café 82 pour cent, soja torréfié, sirop de sucre brun, substitut de beurre, arômes de synthèse, beurre.",
          format_grammes: 340, prix_vnd: 148800, deja_moulu: 1,
          pourcentage_cafe_reel: 82, tag: "café aromatisé",
          machine_recommandee: "Brikka", recette_recommandee: "Brikka classique",
        });
      }
      const c4 = state.cafes.find(c => c.id === "c4" && (c.nom || "").includes("Balanced"));
      if (c4 && !c4.tag) {
        Object.assign(c4, {
          notes_annoncees: "100 pour cent arabica, medium, Đà Lạt, rien d'ajouté",
          pourcentage_cafe_reel: 100, tag: "café de référence",
          machine_recommandee: "Les deux", recette_recommandee: "The Coffee Chronicler's Recipe",
        });
      }
      // 4. Tasses par défaut si absentes.
      if (!state.tasses.length) state.tasses = tassesDefaut();
      // 5. Date d'ajout des cafés : si absente, on prend la date de la première
      //    extraction du café (meilleure approximation pour l'existant). Les
      //    cafés jamais extraits restent sans date (rien d'affiché).
      state.cafes.forEach(c => {
        if (c.date_ajout) return;
        const dates = state.extractions
          .filter(e => e.cafe_id === c.id && e.date_heure)
          .map(e => e.date_heure).sort();
        if (dates.length) c.date_ajout = dates[0].slice(0, 10);
      });
      // 6 ter. Puissance de feu : 3 sur toutes les extractions Brikka qui n'en ont
      //    pas. Sans valeur de départ, le champ resterait vide sur tout l'historique
      //    et aucune comparaison ne serait possible avant des semaines.
      //    IDEMPOTENTE : ne touche que les lignes dont le champ est vide, donc une
      //    valeur saisie ou corrigée à la main n'est jamais écrasée.
      state.extractions.forEach(e => {
        if (e.methode === "Brikka" && (e.puissance_feu === "" || e.puissance_feu === undefined)) {
          e.puissance_feu = PUISSANCE_FEU_HISTORIQUE;
          estampiller(e);
        }
      });

      // Les rattrapages de valeurs semées vivent dans PAS_DE_SCHEMA, plus haut :
      // ils dépendent d'un numéro de version stocké AVEC les données.
      appliquerSchema();

      // 6 bis. Les extractions faites à l'eau préchauffée quittent "Brikka
      //    classique" pour la variante dédiée. Le préchauffage n'est pas un détail
      //    de service : il change la montée en pression, la durée et le
      //    comportement de la soupape, donc c'est un protocole distinct qui mérite
      //    sa ligne dans les comparaisons.
      //    IDEMPOTENTE par construction : après le déplacement, `recette` ne vaut
      //    plus "Brikka classique", donc un rechargement ne redéplace rien. Et on
      //    ne touche QUE les lignes qui portent exactement l'ancien nom, une
      //    extraction déjà rangée à la main est laissée en place.
      const RECETTE_PRECHAUFFEE = "Brikka classique (eau préchauffée)";
      state.extractions.forEach(e => {
        if (e.recette === "Brikka classique" && Number(e.eau_prechauffee) === 1) {
          e.recette = RECETTE_PRECHAUFFEE;
          estampiller(e);
        }
      });

      // 7. Achats : un sachet implicite pour chaque café qui a un format mais aucun
      //    achat. IDEMPOTENTE grâce au test "aucun achat pour ce café", donc elle ne
      //    recrée rien à chaque chargement et n'écrase aucun achat saisi à la main.
      //    Sans elle, le stock serait incalculable sur tout l'existant.
      state.cafes.forEach(c => {
        if (!(Number(c.format_grammes) > 0)) return;
        if (state.achats.some(a => a.cafe_id === c.id)) return;
        const dates = state.extractions
          .filter(e => e.cafe_id === c.id && e.date_heure)
          .map(e => e.date_heure).sort();
        const date = c.date_ajout || (dates.length ? dates[0].slice(0, 10) : dateLocaleAujourdhui());
        state.achats.push(normaliserAchat({
          id: nouvelId("a", state.achats),
          cafe_id: c.id,
          date_achat: date,
          format_grammes: c.format_grammes,
          prix_vnd: c.prix_vnd,
          date_torrefaction: c.date_torrefaction,
        }));
      });
    }

    return { SCHEMA_ACTUEL, PAS_DE_SCHEMA, appliquerSchema, migrerDonnees };
  }

  return { pour };
})();
