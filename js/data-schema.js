/* Schéma des données : colonnes, normalisation, valeurs de départ.
 *
 * Pur : aucune de ces fonctions ne lit ni n'écrit l'état, elles transforment
 * une ligne en une ligne. C'est la couche qui décide ce qu'est une extraction
 * valide, quelles colonnes vont dans un CSV et lesquelles n'y vont jamais
 * (maj_le), et ce que valent les recettes et les tasses semées. Dépend de
 * GRIND (validation de la molette) et des semences de recettes.js. */
"use strict";

const DATA_SCHEMA = (() => {

  const CAFE_COLS = ["id", "nom", "torrefacteur", "origine", "espece", "procede", "torrefaction",
    "deja_moulu", "pourcentage_cafe_reel", "tag", "notes_annoncees", "format_grammes", "prix_vnd",
    "date_torrefaction", "machine_recommandee", "recette_recommandee", "date_ajout", "actif"];

  const EXT_COLS = ["id", "date_heure", "cafe_id", "methode", "recette", "dose_g", "eau_g",
    "mouture_dial", "temperature_c", "temps_total_s", "temps_ecoulement_s",
    "volume_extrait_ml", "eau_ajoutee_ml", "lait_ml", "agitation_nb", "tasse", "eau_prechauffee",
    "note_sur_10", "diagnostic", "descripteurs", "commentaire", "puissance_feu", "ratee", "chauffe_s"];

  /* Réglages du matériel de Chris. UNE seule ligne, d'id fixe, parce que c'est
     un utilisateur unique : voir normaliserReglages pour le pourquoi de la
     table. maj_le n'est pas dans les colonnes, comme partout ailleurs. */
  const REGLAGE_ID = "moi";

  const REGLAGE_COLS = ["id", "dose_g", "puissance_feu", "mouture_dial", "schema_version", "ebullition_s",
    "pas_crans", "pas_degres", "pas_feu", "pas_eau_g", "pas_dose_g", "dessins"];

  const RECETTE_COLS = ["id", "nom", "numero", "methode", "famille", "variante", "sous_titre", "dose_g", "eau_g",
    "temperature_c", "temp_texte", "mouture_dial", "ratio_texte", "total_texte", "lait",
    "etapes", "pour_qui", "cafes_associes", "note", "par_defaut", "avancee", "variantes", "actif",
    "puissance_feu", "volume_typique"];

  const TASSE_COLS = ["id", "nom", "contenance_ml"];

  /* Valeur de RATTRAPAGE des extractions Brikka déjà enregistrées, qui n'avaient
     pas ce champ. Ce n'est PAS le défaut du formulaire (voir DEFAULT_PUISSANCE_FEU
     dans app.js, à 4) : l'historique garde ce qui était plausible au moment où il
     a été saisi, on ne réécrit pas le passé quand le réglage courant change. */
  const PUISSANCE_FEU_HISTORIQUE = 3;

  const ACHAT_COLS = ["id", "cafe_id", "date_achat", "format_grammes", "prix_vnd", "date_torrefaction", "date_ouverture"];

  /* Estampille une ligne qu'on vient d'écrire, pour que la fusion sache qui est
     le plus récent. À appeler dans les MUTATIONS uniquement. */
  function estampiller(row) {
    row.maj_le = Date.now();
    return row;
  }

  /* Reporte les horodatages connus sur des lignes qui viennent d'un CSV.
     INDISPENSABLE : les CSV ne transportent pas `maj_le`, donc relire le dossier
     lié remettrait tout à zéro. Conséquence si on ne le fait pas, et c'était un
     vrai bug : modifier une extraction hors ligne puis RECHARGER la page avant
     que la synchro passe faisait perdre la modification, écrasée par la version
     du serveur qui, elle, était estampillée.

     Si le CONTENU a changé par rapport à ce qu'on avait en mémoire, on estampille
     à maintenant : une édition au tableur est un geste délibéré, elle doit gagner
     la fusion. Une ligne inconnue est nouvelle, donc estampillée aussi. */
  function reporterHorodatage(lues, connues, cols) {
    const parId = new Map((connues || []).map(r => [r.id, r]));
    const champs = cols.filter(c => c !== "id");
    return lues.map(ligne => {
      const avant = parId.get(ligne.id);
      if (!avant) return estampiller(ligne);
      const identique = champs.every(c => {
        const a = avant[c], b = ligne[c];
        return String(a === undefined || a === null ? "" : a) === String(b === undefined || b === null ? "" : b);
      });
      ligne.maj_le = identique ? (Number(avant.maj_le) || 0) : Date.now();
      return ligne;
    });
  }

  function normaliserCafe(r) {
    return {
      id: String(r.id || "").trim(),
      // Horodatage de synchronisation. PRÉSERVÉ tel quel ici : normaliser est
      // appelé au chargement comme à l'écriture, et restamper au chargement
      // ferait croire à chaque appareil qu'il est le plus récent. Ce sont les
      // mutations qui estampillent, explicitement. Jamais dans les CSV : les
      // colonnes exportées sont listées à la main (voir csvSerialiser).
      maj_le: Number(r.maj_le) || 0,
      nom: r.nom || "", torrefacteur: r.torrefacteur || "", origine: r.origine || "",
      espece: r.espece || "", procede: r.procede || "", torrefaction: r.torrefaction || "",
      deja_moulu: Number(r.deja_moulu) === 1 ? 1 : 0,
      pourcentage_cafe_reel: r.pourcentage_cafe_reel === "" || r.pourcentage_cafe_reel === undefined
        ? 100 : Math.max(1, Math.min(100, Number(r.pourcentage_cafe_reel) || 100)),
      tag: r.tag || "",
      notes_annoncees: r.notes_annoncees || "",
      format_grammes: r.format_grammes === "" || r.format_grammes === undefined ? "" : Number(r.format_grammes),
      prix_vnd: r.prix_vnd === "" || r.prix_vnd === undefined ? "" : Number(r.prix_vnd),
      date_torrefaction: r.date_torrefaction || "",
      machine_recommandee: r.machine_recommandee || "",
      recette_recommandee: r.recette_recommandee || "",
      date_ajout: r.date_ajout || "",
      actif: Number(r.actif) === 0 ? 0 : 1,
    };
  }

  // Date du jour en LOCAL (jamais toISOString, décalage à UTC+7). Même
  // définition que partout ailleurs : outils.js.
  function dateLocaleAujourdhui() {
    return OUTILS.cleLocale(new Date());
  }

  function normaliserExtraction(r) {
    return {
      id: String(r.id || "").trim(),
      // Horodatage de synchronisation. PRÉSERVÉ tel quel ici : normaliser est
      // appelé au chargement comme à l'écriture, et restamper au chargement
      // ferait croire à chaque appareil qu'il est le plus récent. Ce sont les
      // mutations qui estampillent, explicitement. Jamais dans les CSV : les
      // colonnes exportées sont listées à la main (voir csvSerialiser).
      maj_le: Number(r.maj_le) || 0,
      date_heure: r.date_heure || "",
      cafe_id: r.cafe_id || "",
      methode: r.methode || "",
      recette: r.recette || "",
      dose_g: r.dose_g === "" ? "" : Number(r.dose_g),
      eau_g: r.eau_g === "" ? "" : Number(r.eau_g),
      mouture_dial: r.mouture_dial || "",
      temperature_c: r.temperature_c === "" ? "" : Number(r.temperature_c),
      temps_total_s: r.temps_total_s === "" ? "" : Number(r.temps_total_s),
      temps_ecoulement_s: r.temps_ecoulement_s === "" ? "" : Number(r.temps_ecoulement_s),
      // volume_tasse_ml est l'ancien nom du champ, accepté en lecture.
      volume_extrait_ml: (() => {
        const v = r.volume_extrait_ml !== undefined && r.volume_extrait_ml !== "" ? r.volume_extrait_ml : r.volume_tasse_ml;
        return v === "" || v === undefined ? "" : Number(v);
      })(),
      eau_ajoutee_ml: r.eau_ajoutee_ml === "" || r.eau_ajoutee_ml === undefined ? "" : Number(r.eau_ajoutee_ml),
      lait_ml: r.lait_ml === "" || r.lait_ml === undefined ? "" : Number(r.lait_ml),
      agitation_nb: r.agitation_nb === "" || r.agitation_nb === undefined ? "" : Number(r.agitation_nb),
      tasse: r.tasse || "",
      eau_prechauffee: Number(r.eau_prechauffee) === 1 ? 1 : "",
      // Puissance de feu, echelle personnelle de 1 a 10. Bornee et arrondie :
      // une valeur hors plage editee au tableur est ramenee dedans, pas jetee.
      puissance_feu: r.puissance_feu === "" || r.puissance_feu === undefined || r.puissance_feu === null
        ? "" : Math.max(1, Math.min(10, Math.round(Number(r.puissance_feu)) || 1)),
      note_sur_10: r.note_sur_10 === "" ? "" : Number(r.note_sur_10),
      diagnostic: r.diagnostic || "",
      descripteurs: r.descripteurs || "",
      commentaire: r.commentaire || "",
      /* Ratée : 1 ou vide. Vide veut dire "pas dit", pas "réussie", et c'est la
         valeur de toutes les tasses antérieures au drapeau. Aucune migration
         n'est nécessaire pour autant : une colonne absente d'un vieux CSV relit
         vide, ce qui est exactement le bon défaut. */
      ratee: Number(r.ratee) === 1 ? 1 : "",
      /* Temps passé par la bouilloire sur le feu, en secondes, Switch seulement.
         C'est la mesure de Chris ; la température stockée en est l'estimation,
         corrigeable à la main. Vide pour la Brikka et pour tout l'historique
         antérieur : une colonne absente relit vide, aucune migration. */
      chauffe_s: r.chauffe_s === "" || r.chauffe_s === undefined || r.chauffe_s === null
        ? "" : Math.max(0, Math.round(Number(r.chauffe_s)) || 0),
    };
  }

  // Recette : forme JS interne <-> ligne CSV lisible au tableur.
  // Les étapes sont encodées une par segment "m:ss texte" ou "- texte",
  // séparées par " || ". Les cafés associés sont séparés par " ; ".
  /* Réglages du matériel. Une TABLE d'une ligne plutôt qu'un mécanisme dédié :
     la fusion par maj_le, les tombstones et l'assainissement réseau existent
     déjà. Ces trois valeurs décrivent le MATÉRIEL de Chris, pas son appareil :
     sa molette de broyeur est la même vue du téléphone et de l'ordinateur, alors
     que le thème et les bips restent en localStorage à juste titre. */
  function normaliserReglages(r) {
    const nombre = (v, min, max, defaut) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= min && n <= max ? n : defaut;
    };
    return {
      id: REGLAGE_ID,
      maj_le: Number(r && r.maj_le) || 0,
      dose_g: nombre(r && r.dose_g, 0.1, 100, 15),
      /* 3, comme le repli d'usine de l'interface et la semence des recettes :
         trois endroits, une seule valeur, sinon un carnet neuf et un carnet
         existant n'annoncent pas le meme feu. */
      puissance_feu: nombre(r && r.puissance_feu, 1, 10, 3),
      mouture_dial: typeof (r && r.mouture_dial) === "string" && GRIND.parseDial(r.mouture_dial)
        ? r.mouture_dial : "1.5.0",
      // Version de schéma du document, voir PAS_DE_SCHEMA. Rangée ici parce que
      // cette ligne est le seul endroit synchronisé qui ne soit pas une donnée
      // de café : la version doit voyager avec les données qu'elle décrit.
      schema_version: nombre(r && r.schema_version, 0, 999, 0),
      /* Temps que met la bouilloire de Chris à bouillir depuis l'eau du robinet,
         en secondes. Décrit son MATÉRIEL, donc synchronisé comme la molette. Sert
         à estimer la température du Switch depuis le temps de chauffe.

         120 SECONDES par défaut, et non zéro. Le choix d'origine était zéro, avec
         une raison valable : sans mesure, une valeur d'usine INVENTÉE produirait
         des degrés faux d'apparence sérieuse. Son prix était que la fonction
         restait éteinte tant qu'on n'allait pas la régler, et rien ne le disait
         au moment où on tapait un temps de chauffe. Chris a depuis mesuré sa
         bouilloire, 2 minutes du robinet au gros bouillon : la valeur n'est plus
         inventée, et le raisonnement d'origine ne s'applique plus. C'est CE
         défaut qui alimente replis.ebullition, pas la constante d'interface. */
      ebullition_s: nombre(r && r.ebullition_s, 30, 1800, 120),
      /* Les PAS de la correction chiffrée (v8.48), pour un diagnostic « un peu » ;
         un diagnostic franc les double. Des défauts tirés des phrases de
         correction (« un ou deux crans », « 2 à 3 degrés », « un gramme de café »),
         réglables dans Paramètres. Une ligne d'avant la v8.48 n'a pas ces
         colonnes : elle prend les défauts, sans migration. */
      pas_crans: nombre(r && r.pas_crans, 1, 10, 2),
      pas_degres: nombre(r && r.pas_degres, 1, 6, 2),
      pas_feu: nombre(r && r.pas_feu, 1, 3, 1),
      pas_eau_g: nombre(r && r.pas_eau_g, 5, 60, 15),
      pas_dose_g: nombre(r && r.pas_dose_g, 0.5, 3, 1),
      /* Les dessins du tableau de bord (v8.57), dans l'ordre choisi, « ! » devant
         ceux qui sont masqués : « etagere,!horloge,podium ». Vide = l'ordre
         d'origine, tout visible. Un nom inconnu est ignoré à la lecture. */
      dessins: String(r && r.dessins || "").replace(/[^a-z!,]/g, "").slice(0, 200),
    };
  }

  function normaliserRecette(r) {
    return {
      id: String(r.id || "").trim(),
      // Horodatage de synchronisation. PRÉSERVÉ tel quel ici : normaliser est
      // appelé au chargement comme à l'écriture, et restamper au chargement
      // ferait croire à chaque appareil qu'il est le plus récent. Ce sont les
      // mutations qui estampillent, explicitement. Jamais dans les CSV : les
      // colonnes exportées sont listées à la main (voir csvSerialiser).
      maj_le: Number(r.maj_le) || 0,
      nom: r.nom || "",
      numero: r.numero || "",
      methode: r.methode === "Switch" ? "Switch" : "Brikka",
      famille: r.famille || "",
      variante: r.variante || "",
      lait: r.lait !== undefined && r.lait !== "" ? (Number(r.lait) === 1 || r.lait === true) : false,
      sousTitre: r.sous_titre !== undefined ? r.sous_titre : (r.sousTitre || ""),
      dose: Number(r.dose_g !== undefined ? r.dose_g : r.dose) || 0,
      eau: Number(r.eau_g !== undefined ? r.eau_g : r.eau) || 0,
      // "" veut dire AUCUNE cible, ce qui n'est pas la même chose que 0 degré.
      // Sur la Brikka la température dépend de la flamme, la fixer n'a pas de sens.
      temp: (() => {
        const v = r.temperature_c !== undefined ? r.temperature_c : r.temp;
        return v === "" || v === null || v === undefined ? "" : (Number(v) || "");
      })(),
      // Puissance de feu visee par la recette, Brikka seulement. Preremplit la
      // saisie comme le font la dose et la molette.
      puissance_feu: r.puissance_feu === "" || r.puissance_feu === undefined || r.puissance_feu === null
        ? "" : Math.max(1, Math.min(10, Math.round(Number(r.puissance_feu)) || 1)),
      /* Rendement TYPIQUE en tasse, déclaré par la recette. Ce n'est pas une
         estimation calculée : la Brikka n'en a volontairement aucune, l'ancienne
         formule annonçait 139 ml là où Chris en mesure 90 à 115. C'est un chiffre
         mesuré, écrit dans la recette, et il sert à calculer le lait quand le
         volume de la tasse n'a pas été relevé. */
      volumeTypique: (() => {
        const v = r.volume_typique !== undefined ? r.volume_typique : r.volumeTypique;
        return v === "" || v === null || v === undefined ? "" : (Number(v) || "");
      })(),
      tempTexte: r.temp_texte !== undefined ? r.temp_texte : (r.tempTexte || ""),
      dial: r.mouture_dial !== undefined ? r.mouture_dial : (r.dial || ""),
      ratioTexte: r.ratio_texte !== undefined ? r.ratio_texte : (r.ratioTexte || ""),
      totalTexte: r.total_texte !== undefined ? r.total_texte : (r.totalTexte || ""),
      etapes: Array.isArray(r.etapes) ? r.etapes
        : texteVersEtapes(String(r.etapes || "").split("||").join("\n")),
      pourQui: r.pour_qui !== undefined ? r.pour_qui : (r.pourQui || ""),
      cafesAssocies: Array.isArray(r.cafesAssocies) ? r.cafesAssocies
        : String(r.cafes_associes || "").split(";").map(s => s.trim()).filter(Boolean),
      note: r.note || "",
      parDefaut: r.par_defaut !== undefined ? Number(r.par_defaut) === 1 : !!r.parDefaut,
      avancee: r.avancee !== undefined && r.avancee !== "" ? (Number(r.avancee) === 1 || r.avancee === true) : false,
      variantes: r.variantes !== undefined && r.variantes !== "" ? (Number(r.variantes) === 1 || r.variantes === true) : false,
      actif: Number(r.actif) === 0 ? 0 : 1,
    };
  }

  function recetteVersLigne(r) {
    return {
      id: r.id, nom: r.nom, numero: r.numero, methode: r.methode, famille: r.famille,
      variante: r.variante,
      sous_titre: r.sousTitre,
      dose_g: r.dose, eau_g: r.eau, temperature_c: r.temp, temp_texte: r.tempTexte,
      mouture_dial: r.dial, ratio_texte: r.ratioTexte, total_texte: r.totalTexte,
      lait: r.lait ? 1 : 0,
      etapes: etapesVersTexte(r.etapes).split("\n").filter(Boolean).join(" || "),
      pour_qui: r.pourQui,
      cafes_associes: r.cafesAssocies.join(" ; "),
      note: r.note,
      par_defaut: r.parDefaut ? 1 : 0,
      avancee: r.avancee ? 1 : 0,
      variantes: r.variantes ? 1 : 0,
      actif: r.actif,
      /* puissance_feu manquait ici alors qu'elle figure dans RECETTE_COLS depuis
         qu'elle existe : csvSerialiser lit ligne[colonne], donc la colonne
         sortait VIDE. Exporter les recettes puis les relire effacait la cible de
         feu des dix recettes, sans rien signaler. Le controle des colonnes
         couvertes, dans tools/data.test.mjs, empeche desormais l'oubli. */
      puissance_feu: r.puissance_feu,
      volume_typique: r.volumeTypique,
    };
  }

  function recettesDefaut() {
    return RECETTES_DEPART.map(r => normaliserRecette({
      ...r,
      etapes: r.etapes.map(e => ({ ...e })),
      cafesAssocies: [...r.cafesAssocies],
    }));
  }

  function normaliserAchat(r) {
    return {
      id: String(r.id || "").trim(),
      maj_le: Number(r.maj_le) || 0,
      cafe_id: r.cafe_id || "",
      date_achat: r.date_achat || "",
      format_grammes: r.format_grammes === "" || r.format_grammes === undefined ? "" : Number(r.format_grammes),
      prix_vnd: r.prix_vnd === "" || r.prix_vnd === undefined ? "" : Number(r.prix_vnd),
      date_torrefaction: r.date_torrefaction || "",
      /* Jour où le sachet a été OUVERT, la seule fraîcheur qui compte ici. Vide
         tant qu'il dort dans le placard, ce qui est une information en soi. */
      date_ouverture: r.date_ouverture || "",
    };
  }

  function normaliserTasse(r) {
    return {
      id: String(r.id || "").trim(),
      // Horodatage de synchronisation. PRÉSERVÉ tel quel ici : normaliser est
      // appelé au chargement comme à l'écriture, et restamper au chargement
      // ferait croire à chaque appareil qu'il est le plus récent. Ce sont les
      // mutations qui estampillent, explicitement. Jamais dans les CSV : les
      // colonnes exportées sont listées à la main (voir csvSerialiser).
      maj_le: Number(r.maj_le) || 0,
      nom: r.nom || "",
      contenance_ml: Number(r.contenance_ml) || 0,
    };
  }

  function tassesDefaut() {
    return TASSES_DEPART.map(t => normaliserTasse(t));
  }

  function nouvelId(prefixe, liste) {
    let n = liste.length + 1;
    while (liste.some(x => x.id === prefixe + n)) n++;
    return prefixe + n;
  }

  return {
    CAFE_COLS, EXT_COLS, REGLAGE_ID, REGLAGE_COLS, RECETTE_COLS, TASSE_COLS, ACHAT_COLS,
    PUISSANCE_FEU_HISTORIQUE,
    estampiller, reporterHorodatage, nouvelId, dateLocaleAujourdhui,
    normaliserCafe, normaliserExtraction, normaliserReglages, normaliserRecette, normaliserAchat,
    normaliserTasse, recetteVersLigne, recettesDefaut, tassesDefaut,
  };
})();
