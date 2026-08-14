// Couche de données : CSV, IndexedDB, File System Access.
// Principe : la vérité vit dans deux CSV sur le disque (cafes.csv, extractions.csv),
// IndexedDB garde en permanence une copie de travail pour ne rien perdre.
"use strict";

const DATA = (() => {

  const CAFE_COLS = ["id", "nom", "torrefacteur", "origine", "espece", "procede", "torrefaction",
    "deja_moulu", "pourcentage_cafe_reel", "tag", "notes_annoncees", "format_grammes", "prix_vnd",
    "date_torrefaction", "machine_recommandee", "recette_recommandee", "date_ajout", "actif"];
  const EXT_COLS = ["id", "date_heure", "cafe_id", "methode", "recette", "dose_g", "eau_g",
    "mouture_dial", "temperature_c", "temps_total_s", "temps_ecoulement_s",
    "volume_extrait_ml", "eau_ajoutee_ml", "lait_ml", "agitation_nb", "tasse", "eau_prechauffee",
    "note_sur_10", "diagnostic", "descripteurs", "commentaire"];
  const RECETTE_COLS = ["id", "nom", "numero", "methode", "famille", "variante", "sous_titre", "dose_g", "eau_g",
    "temperature_c", "temp_texte", "mouture_dial", "ratio_texte", "total_texte", "lait",
    "etapes", "pour_qui", "cafes_associes", "note", "par_defaut", "avancee", "variantes", "actif"];
  const TASSE_COLS = ["id", "nom", "contenance_ml"];
  const ACHAT_COLS = ["id", "cafe_id", "date_achat", "format_grammes", "prix_vnd", "date_torrefaction"];

  const state = {
    cafes: [],
    extractions: [],
    recettes: [],
    tasses: [],
    // Un achat = un sachet. Sans cette table, un café racheté gardait UNE seule
    // date de torréfaction, donc la fraîcheur mentait dès le deuxième sachet, et
    // le stock restant n'était pas calculable.
    achats: [],
    dirHandle: null,
    fsDisponible: typeof window !== "undefined" && "showDirectoryPicker" in window,
    demoActive: false,

    // Synchronisation entre appareils. `tombes` retient les suppressions
    // ({table: {id: horodatage}}) : sans elles, une ligne supprimée sur le
    // téléphone reviendrait au prochain échange avec le bureau, qui l'a encore.
    // Hors des CSV, c'est de la mécanique de synchro, pas de la donnée café.
    tombes: typeof SYNC === "undefined" ? {} : SYNC.tombesVides(),
    syncEtat: "inconnu",
    syncLe: null,
  };

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

  /* Pose une pierre tombale. La date sert à trancher contre une éventuelle
     réécriture de la même ligne sur l'autre appareil. */
  function marquerSupprime(table, id) {
    if (!state.tombes[table]) state.tombes[table] = {};
    state.tombes[table][id] = Date.now();
  }

  const abonnes = [];
  function abonner(fn) { abonnes.push(fn); }
  function notifier() { abonnes.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }

  // ---------- CSV ----------

  function csvParse(texte) {
    const lignes = [];
    let champ = "", ligne = [], enQuotes = false;
    const t = (texte || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (enQuotes) {
        if (ch === '"') {
          if (t[i + 1] === '"') { champ += '"'; i++; }
          else enQuotes = false;
        } else champ += ch;
      } else {
        if (ch === '"') enQuotes = true;
        else if (ch === ",") { ligne.push(champ); champ = ""; }
        else if (ch === "\n") { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ""; }
        else champ += ch;
      }
    }
    if (champ !== "" || ligne.length) { ligne.push(champ); lignes.push(ligne); }
    if (!lignes.length) return [];
    const entetes = lignes[0].map(h => h.trim());
    return lignes.slice(1)
      .filter(l => l.some(c => c !== ""))
      .map(l => {
        const obj = {};
        entetes.forEach((h, idx) => { obj[h] = l[idx] !== undefined ? l[idx] : ""; });
        return obj;
      });
  }

  function csvChamp(v) {
    const s = v === null || v === undefined ? "" : String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function csvSerialiser(rows, cols) {
    const lignes = [cols.join(",")];
    rows.forEach(r => lignes.push(cols.map(c => csvChamp(r[c])).join(",")));
    return lignes.join("\n") + "\n";
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

  // Date du jour en LOCAL (jamais toISOString, décalage à UTC+7).
  function dateLocaleAujourdhui() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
      "-" + String(d.getDate()).padStart(2, "0");
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
      note_sur_10: r.note_sur_10 === "" ? "" : Number(r.note_sur_10),
      diagnostic: r.diagnostic || "",
      descripteurs: r.descripteurs || "",
      commentaire: r.commentaire || "",
    };
  }

  // Recette : forme JS interne <-> ligne CSV lisible au tableur.
  // Les étapes sont encodées une par segment "m:ss texte" ou "- texte",
  // séparées par " || ". Les cafés associés sont séparés par " ; ".
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
      temp: Number(r.temperature_c !== undefined ? r.temperature_c : r.temp) || 0,
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
    };
  }

  function csvRecettes() {
    return csvSerialiser(state.recettes.map(recetteVersLigne), RECETTE_COLS);
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
    };
  }

  /* Sachet en cours d'un café : le dernier acheté. Retourne null si le café n'a
     aucun achat, auquel cas l'appelant retombe sur les champs de la fiche café,
     qui restent la source pour un café à sachet unique. */
  function sachetCourant(cafeId) {
    return state.achats
      .filter(a => a.cafe_id === cafeId)
      .sort((a, b) => String(b.date_achat).localeCompare(String(a.date_achat)))[0] || null;
  }

  /* Stock restant du sachet en cours, en grammes.
     Ne comptent que les extractions POSTÉRIEURES à la date d'achat : c'est tout
     l'intérêt de la table, un sachet racheté repart de son format plein sans que
     l'historique du sachet précédent ne vienne le vider. Une extraction sans dose
     compte pour DEFAULT_DOSE_G, sinon un oubli de saisie ferait croire à un stock
     intact. */
  function stockSachet(cafeId, doseDefaut) {
    const sachet = sachetCourant(cafeId);
    const cafe = state.cafes.find(c => c.id === cafeId);
    const format = sachet ? sachet.format_grammes : (cafe ? cafe.format_grammes : "");
    if (format === "" || !(Number(format) > 0)) return null;

    const depuis = sachet ? sachet.date_achat : (cafe ? cafe.date_ajout : "");
    const consomme = state.extractions
      .filter(e => e.cafe_id === cafeId)
      .filter(e => !depuis || String(e.date_heure).slice(0, 10) >= depuis)
      .reduce((total, e) => total + (Number(e.dose_g) || doseDefaut || 0), 0);

    const restant = Number(format) - consomme;
    return {
      format: Number(format),
      consomme: Math.round(consomme * 10) / 10,
      restant: Math.round(restant * 10) / 10,
      depuis,
      dateTorrefaction: sachet ? sachet.date_torrefaction : (cafe ? cafe.date_torrefaction : ""),
      sachets: state.achats.filter(a => a.cafe_id === cafeId).length,
    };
  }

  async function ajouterAchat(achat) {
    const a = estampiller(normaliserAchat(achat));
    a.id = nouvelId("a", state.achats);
    state.achats.push(a);
    // La fiche café suit le dernier sachet : format, prix et date de
    // torréfaction affichés ailleurs doivent rester cohérents avec lui.
    const cafe = state.cafes.find(c => c.id === a.cafe_id);
    if (cafe) {
      if (a.format_grammes !== "") cafe.format_grammes = a.format_grammes;
      if (a.prix_vnd !== "") cafe.prix_vnd = a.prix_vnd;
      cafe.date_torrefaction = a.date_torrefaction;
      estampiller(cafe);
    }
    await persister();
    return a;
  }

  async function supprimerAchat(id) {
    marquerSupprime("achats", id);
    state.achats = state.achats.filter(x => x.id !== id);
    await persister();
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

  // ---------- Migration : anciens noms de recettes et anciennes fiches ----------
  // Idempotente : peut tourner à chaque chargement sans effet de bord.
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

  // ---------- Champs calculés, jamais stockés ----------

  function cafeDe(ext) {
    return state.cafes.find(c => c.id === ext.cafe_id) || null;
  }

  function calculs(ext) {
    const cafe = cafeDe(ext);
    const dial = GRIND.parseDial(ext.mouture_dial);
    let ratio = "";
    if (ext.dose_g && ext.eau_g) ratio = (ext.eau_g / ext.dose_g);
    let age = "";
    if (cafe && cafe.date_torrefaction && ext.date_heure) {
      const d1 = new Date(cafe.date_torrefaction + "T00:00");
      const d2 = new Date(ext.date_heure);
      if (!isNaN(d1) && !isNaN(d2)) age = Math.floor((d2 - d1) / 86400000);
    }
    let retention = "";
    if (ext.eau_g !== "" && ext.volume_extrait_ml !== "") retention = ext.eau_g - ext.volume_extrait_ml;
    // Volume de la boisson servie : extraction plus eau ajoutée plus lait.
    let boisson = "";
    if (ext.volume_extrait_ml !== "") {
      boisson = ext.volume_extrait_ml + (ext.eau_ajoutee_ml || 0) + (ext.lait_ml || 0);
    }
    let cout = "", coutReel = "";
    if (cafe && cafe.prix_vnd && cafe.format_grammes && ext.dose_g) {
      cout = Math.round(cafe.prix_vnd / cafe.format_grammes * ext.dose_g);
      const pct = cafe.pourcentage_cafe_reel === "" || cafe.pourcentage_cafe_reel === undefined ? 100 : Number(cafe.pourcentage_cafe_reel);
      if (pct < 100 && pct > 0) {
        coutReel = Math.round(cafe.prix_vnd / (cafe.format_grammes * pct / 100) * ext.dose_g);
      }
    }
    return {
      ratio,
      ratioTexte: ratio === "" ? "" : "1:" + ratio.toFixed(1),
      crans: dial ? dial.crans : "",
      microns: dial ? Math.round(dial.microns) : "",
      age_jours: age,
      retention_ml: retention,
      volume_boisson_ml: boisson,
      cout_tasse_vnd: cout,
      cout_reel_vnd: coutReel,
      cafe_nom: cafe ? cafe.nom : (ext.cafe_id ? "Café supprimé" : "Sans café"),
      moulu: cafe ? Number(cafe.deja_moulu) === 1 : false,
    };
  }

  // ---------- IndexedDB ----------

  let db = null;
  function ouvrirDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("cafe-tracker", 1);
      req.onupgradeneeded = () => { req.result.createObjectStore("kv"); };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  function kvSet(cle, valeur) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").put(valeur, cle);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  function kvGet(cle) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readonly");
      const req = tx.objectStore("kv").get(cle);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function sauverLocal() {
    await kvSet("cafes", state.cafes);
    await kvSet("extractions", state.extractions);
    await kvSet("recettes", state.recettes);
    await kvSet("tasses", state.tasses);
    await kvSet("demoActive", state.demoActive);
    await kvSet("achats", state.achats);
    await kvSet("tombes", state.tombes);
  }

  // ---------- File System Access ----------

  async function verifierPermission(handle) {
    if (!handle) return false;
    const opts = { mode: "readwrite" };
    if (await handle.queryPermission(opts) === "granted") return true;
    if (await handle.requestPermission(opts) === "granted") return true;
    return false;
  }

  async function ecrireFichier(nom, contenu) {
    const fh = await state.dirHandle.getFileHandle(nom, { create: true });
    const w = await fh.createWritable();
    await w.write(contenu);
    await w.close();
  }

  async function lireFichier(nom) {
    try {
      const fh = await state.dirHandle.getFileHandle(nom);
      const f = await fh.getFile();
      return await f.text();
    } catch (e) {
      return null;
    }
  }

  let ecritureEnAttente = null;
  async function sauverFichiers() {
    if (!state.dirHandle) return false;
    // Regroupe les écritures rapprochées.
    if (ecritureEnAttente) clearTimeout(ecritureEnAttente);
    return new Promise(resolve => {
      ecritureEnAttente = setTimeout(async () => {
        try {
          if (!await verifierPermission(state.dirHandle)) { resolve(false); return; }
          await ecrireFichier("cafes.csv", csvSerialiser(state.cafes, CAFE_COLS));
          await ecrireFichier("extractions.csv", csvSerialiser(state.extractions, EXT_COLS));
          await ecrireFichier("recettes.csv", csvRecettes());
          await ecrireFichier("tasses.csv", csvSerialiser(state.tasses, TASSE_COLS));
          await ecrireFichier("achats.csv", csvSerialiser(state.achats, ACHAT_COLS));
          resolve(true);
        } catch (e) {
          console.error("Écriture fichier impossible", e);
          resolve(false);
        }
      }, 400);
    });
  }

  async function lierDossier(creer) {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    if (!await verifierPermission(handle)) throw new Error("Permission refusée");
    state.dirHandle = handle;
    if (creer) {
      if (!state.cafes.length) state.cafes = CAFES_DEPART.map(normaliserCafe);
      if (!state.recettes.length) state.recettes = recettesDefaut();
      if (!state.tasses.length) state.tasses = tassesDefaut();
      state.demoActive = false;
      await ecrireFichier("cafes.csv", csvSerialiser(state.cafes, CAFE_COLS));
      await ecrireFichier("extractions.csv", csvSerialiser(state.extractions, EXT_COLS));
      await ecrireFichier("recettes.csv", csvRecettes());
      await ecrireFichier("tasses.csv", csvSerialiser(state.tasses, TASSE_COLS));
      await ecrireFichier("achats.csv", csvSerialiser(state.achats, ACHAT_COLS));
    } else {
      const tc = await lireFichier("cafes.csv");
      const te = await lireFichier("extractions.csv");
      const tr = await lireFichier("recettes.csv");
      const tt = await lireFichier("tasses.csv");
      const ta = await lireFichier("achats.csv");
      if (tc === null && te === null) {
        throw new Error("Ce dossier ne contient ni cafes.csv ni extractions.csv.");
      }
      if (tc !== null) state.cafes = reporterHorodatage(csvParse(tc).map(normaliserCafe), state.cafes, CAFE_COLS);
      if (te !== null) state.extractions = reporterHorodatage(csvParse(te).map(normaliserExtraction), state.extractions, EXT_COLS);
      if (tr !== null) state.recettes = reporterHorodatage(csvParse(tr).map(normaliserRecette), state.recettes, RECETTE_COLS);
      else if (!state.recettes.length) state.recettes = recettesDefaut();
      if (tt !== null) state.tasses = reporterHorodatage(csvParse(tt).map(normaliserTasse), state.tasses, TASSE_COLS);
      if (ta !== null) state.achats = reporterHorodatage(csvParse(ta).map(normaliserAchat), state.achats, ACHAT_COLS);
      migrerDonnees();
      await ecrireFichier("recettes.csv", csvRecettes());
      state.demoActive = false;
    }
    await kvSet("dirHandle", handle);
    await sauverLocal();
    notifier();
    return handle.name;
  }

  async function delierDossier() {
    state.dirHandle = null;
    await kvSet("dirHandle", null);
    notifier();
  }

  // ---------- Import et export ----------

  function detecterTable(rows) {
    if (!rows.length) return null;
    const cles = Object.keys(rows[0]);
    if (cles.includes("date_achat")) return "achats";
    if (cles.includes("contenance_ml")) return "tasses";
    if (cles.includes("pour_qui") || cles.includes("sous_titre")) return "recettes";
    if (cles.includes("cafe_id") || cles.includes("diagnostic")) return "extractions";
    if (cles.includes("torrefacteur") || cles.includes("machine_recommandee")) return "cafes";
    return null;
  }

  async function importerTexteCSV(texte) {
    const rows = csvParse(texte);
    const table = detecterTable(rows);
    if (!table) throw new Error("Colonnes non reconnues : ni une table cafés, ni extractions, ni recettes.");
    // Un import est un geste DÉLIBÉRÉ : les lignes sont estampillées maintenant
    // pour qu'elles gagnent la fusion contre la version du serveur. Sans ça, un
    // import serait annulé par la synchro suivante.
    const importees = normaliser => rows.map(r => estampiller(normaliser(r)));
    if (table === "cafes") state.cafes = importees(normaliserCafe);
    else if (table === "recettes") state.recettes = importees(normaliserRecette);
    else if (table === "tasses") state.tasses = importees(normaliserTasse);
    else state.extractions = importees(normaliserExtraction);
    migrerDonnees();
    state.demoActive = false;
    await persister();
    return { table, n: rows.length };
  }

  function telecharger(nomFichier, contenu) {
    const blob = new Blob([contenu], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomFichier;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function exporterCafes() { telecharger("cafes.csv", csvSerialiser(state.cafes, CAFE_COLS)); }
  function exporterExtractions(liste) {
    telecharger("extractions.csv", csvSerialiser(liste || state.extractions, EXT_COLS));
  }
  function exporterRecettes() { telecharger("recettes.csv", csvRecettes()); }

  // ---------- Démo ----------

  async function chargerDemo() {
    state.cafes = csvParse(DEMO_CAFES_CSV).map(normaliserCafe);
    state.extractions = csvParse(DEMO_EXTRACTIONS_CSV).map(normaliserExtraction);
    state.recettes = recettesDefaut();
    state.tasses = tassesDefaut();
    // La demo n'a pas de fichier d'achats : la migration en fabrique un sachet
    // implicite par cafe, ce qui suffit a faire vivre le stock en demonstration.
    state.achats = [];
    migrerDonnees();
    state.demoActive = true;
    await sauverLocal();
    notifier();
  }

  async function viderDonnees() {
    state.extractions = [];
    state.cafes = CAFES_DEPART.map(normaliserCafe);
    state.recettes = recettesDefaut();
    state.tasses = tassesDefaut();
    state.achats = [];
    state.demoActive = false;
    await persister();
  }

  // ---------- Mutations ----------

  function nouvelId(prefixe, liste) {
    let n = liste.length + 1;
    while (liste.some(x => x.id === prefixe + n)) n++;
    return prefixe + n;
  }

  // ---------- Synchronisation entre appareils ----------

  // Une rafale de modifications (édition d'une recette, saisie enchaînée) ne
  // doit pas produire une rafale de requêtes.
  const SYNC_DEBOUNCE_MS = 1500;
  let syncMinuteur = null;
  let syncEnCours = false;

  function chargeUtileLocale() {
    return {
      tables: {
        cafes: state.cafes,
        extractions: state.extractions,
        recettes: state.recettes,
        tasses: state.tasses,
        achats: state.achats,
      },
      tombes: state.tombes,
    };
  }

  function syncPossible() {
    // JAMAIS en démo : sans ce garde fou, charger la démonstration sur un
    // appareil enverrait 62 fausses extractions dans les vraies données.
    return typeof SYNC !== "undefined" && SYNC.disponible() && !state.demoActive;
  }

  /* Échange avec le serveur et ADOPTE le résultat fusionné. Ne passe pas par
     persister() : cela relancerait une synchro en boucle. */
  async function synchroniser(manuelle) {
    if (!syncPossible()) {
      state.syncEtat = typeof SYNC === "undefined" || !SYNC.disponible() ? "local" : "demo";
      if (manuelle) notifier();
      return state.syncEtat;
    }
    if (syncEnCours) return state.syncEtat;
    syncEnCours = true;
    state.syncEtat = "encours";
    notifier();

    try {
      const fusion = await SYNC.echanger(chargeUtileLocale());
      state.cafes = (fusion.tables.cafes || []).map(normaliserCafe);
      state.extractions = (fusion.tables.extractions || []).map(normaliserExtraction);
      state.recettes = (fusion.tables.recettes || []).map(normaliserRecette);
      state.tasses = (fusion.tables.tasses || []).map(normaliserTasse);
      state.achats = (fusion.tables.achats || []).map(normaliserAchat);
      state.tombes = fusion.tombes || SYNC.tombesVides();
      if (!state.recettes.length) state.recettes = recettesDefaut();
      if (!state.tasses.length) state.tasses = tassesDefaut();
      migrerDonnees();
      await sauverLocal();
      sauverFichiers();
      state.syncEtat = "ok";
      state.syncLe = Date.now();
    } catch (error) {
      // On garde les données locales telles quelles : une synchro ratée ne doit
      // jamais faire perdre une saisie. Le prochain échange rattrapera.
      state.syncEtat = error && error.code ? error.code : "erreur";
    } finally {
      syncEnCours = false;
      notifier();
    }
    return state.syncEtat;
  }

  function planifierSync() {
    if (!syncPossible()) return;
    clearTimeout(syncMinuteur);
    syncMinuteur = setTimeout(() => { synchroniser(false); }, SYNC_DEBOUNCE_MS);
  }

  async function persister() {
    await sauverLocal();
    sauverFichiers();
    notifier();
    planifierSync();
  }

  async function ajouterExtraction(ext) {
    const e = estampiller(normaliserExtraction(ext));
    e.id = nouvelId("e", state.extractions);
    state.extractions.push(e);
    await persister();
    return e;
  }

  async function modifierExtraction(id, ext) {
    const idx = state.extractions.findIndex(x => x.id === id);
    if (idx < 0) return null;
    const e = estampiller(normaliserExtraction(ext));
    e.id = id;
    state.extractions[idx] = e;
    await persister();
    return e;
  }

  async function supprimerExtraction(id) {
    marquerSupprime("extractions", id);
    state.extractions = state.extractions.filter(x => x.id !== id);
    await persister();
  }

  async function ajouterCafe(cafe) {
    const c = estampiller(normaliserCafe(cafe));
    c.id = nouvelId("c", state.cafes);
    if (!c.date_ajout) c.date_ajout = dateLocaleAujourdhui();
    state.cafes.push(c);
    await persister();
    return c;
  }

  async function modifierCafe(id, cafe) {
    const idx = state.cafes.findIndex(x => x.id === id);
    if (idx < 0) return null;
    const c = estampiller(normaliserCafe(cafe));
    c.id = id;
    // La date d'ajout ne s'édite pas : on conserve celle en place.
    if (!c.date_ajout) c.date_ajout = state.cafes[idx].date_ajout || "";
    state.cafes[idx] = c;
    await persister();
    return c;
  }

  // ---------- Recettes : mutations ----------

  function estRecetteDorigine(id) {
    return RECETTES_DEPART.some(r => r.id === id);
  }

  async function ajouterRecette(recette) {
    const r = estampiller(normaliserRecette(recette));
    let n = 1;
    let id = "r" + n;
    while (state.recettes.some(x => x.id === id)) { n++; id = "r" + n; }
    r.id = id;
    state.recettes.push(r);
    await persister();
    return r;
  }

  async function modifierRecette(id, recette) {
    const idx = state.recettes.findIndex(x => x.id === id);
    if (idx < 0) return null;
    const ancienNom = state.recettes[idx].nom;
    const r = estampiller(normaliserRecette(recette));
    r.id = id;
    // Une recette d'origine garde ses marqueurs structurels (variantes du 4:6).
    if (estRecetteDorigine(id)) {
      const origine = RECETTES_DEPART.find(x => x.id === id);
      r.variantes = origine.variantes;
    }
    state.recettes[idx] = r;
    // Si le nom change, suit dans les extractions et les cafés.
    if (ancienNom && r.nom !== ancienNom) {
      state.extractions.forEach(e => { if (e.recette === ancienNom) e.recette = r.nom; });
      state.cafes.forEach(c => { if (c.recette_recommandee === ancienNom) c.recette_recommandee = r.nom; });
    }
    await persister();
    return r;
  }

  async function reinitialiserRecette(id) {
    const origine = RECETTES_DEPART.find(x => x.id === id);
    if (!origine) return null;
    const idx = state.recettes.findIndex(x => x.id === id);
    const r = normaliserRecette({
      ...origine,
      etapes: origine.etapes.map(e => ({ ...e })),
      cafesAssocies: [...origine.cafesAssocies],
    });
    estampiller(r);
    if (idx < 0) state.recettes.push(r);
    else {
      const ancienNom = state.recettes[idx].nom;
      state.recettes[idx] = r;
      if (ancienNom && ancienNom !== r.nom) {
        state.extractions.forEach(e => { if (e.recette === ancienNom) e.recette = r.nom; });
        state.cafes.forEach(c => { if (c.recette_recommandee === ancienNom) c.recette_recommandee = r.nom; });
      }
    }
    await persister();
    return r;
  }

  async function supprimerRecette(id) {
    if (estRecetteDorigine(id)) return false;
    marquerSupprime("recettes", id);
    state.recettes = state.recettes.filter(x => x.id !== id);
    await persister();
    return true;
  }

  // ---------- Tasses : mutations ----------

  async function ajouterTasse(nom, contenance) {
    let n = 1, id = "tp" + n;
    while (state.tasses.some(x => x.id === id)) { n++; id = "tp" + n; }
    state.tasses.push(estampiller(normaliserTasse({ id, nom, contenance_ml: contenance })));
    await persister();
  }

  async function supprimerTasse(id) {
    marquerSupprime("tasses", id);
    state.tasses = state.tasses.filter(x => x.id !== id);
    if (!state.tasses.length) state.tasses = tassesDefaut();
    await persister();
  }

  // ---------- Initialisation ----------

  async function init() {
    await ouvrirDB();
    const cafes = await kvGet("cafes");
    const extractions = await kvGet("extractions");
    const recettes = await kvGet("recettes");
    const tasses = await kvGet("tasses");
    const achats = await kvGet("achats");
    const demoActive = await kvGet("demoActive");
    if (Array.isArray(cafes)) state.cafes = cafes.map(normaliserCafe);
    if (Array.isArray(extractions)) state.extractions = extractions.map(normaliserExtraction);
    if (Array.isArray(recettes) && recettes.length) state.recettes = recettes;
    else state.recettes = recettesDefaut();
    if (Array.isArray(tasses) && tasses.length) state.tasses = tasses;
    else state.tasses = tassesDefaut();
    if (Array.isArray(achats)) state.achats = achats.map(normaliserAchat);
    state.demoActive = !!demoActive;
    const handle = await kvGet("dirHandle");
    if (handle) {
      state.dirHandle = handle;
      // La permission sera demandée au premier geste utilisateur, on tente une
      // relecture silencieuse si elle est déjà accordée.
      try {
        if (await handle.queryPermission({ mode: "readwrite" }) === "granted") {
          const tc = await lireFichier("cafes.csv");
          const te = await lireFichier("extractions.csv");
          const tr = await lireFichier("recettes.csv");
          const tt = await lireFichier("tasses.csv");
          const ta = await lireFichier("achats.csv");
          if (tc !== null) state.cafes = reporterHorodatage(csvParse(tc).map(normaliserCafe), state.cafes, CAFE_COLS);
          if (te !== null) state.extractions = reporterHorodatage(csvParse(te).map(normaliserExtraction), state.extractions, EXT_COLS);
          if (tr !== null) state.recettes = reporterHorodatage(csvParse(tr).map(normaliserRecette), state.recettes, RECETTE_COLS);
          if (tt !== null) state.tasses = reporterHorodatage(csvParse(tt).map(normaliserTasse), state.tasses, TASSE_COLS);
          if (ta !== null) state.achats = reporterHorodatage(csvParse(ta).map(normaliserAchat), state.achats, ACHAT_COLS);
        }
      } catch (e) { console.warn("Relecture du dossier lié impossible", e); }
    }
    const tombes = await kvGet("tombes");
    if (tombes && typeof tombes === "object") state.tombes = tombes;

    migrerDonnees();
    await sauverLocal();

    // Synchro AVANT de conclure qu'il n'y a pas de données : sur un appareil
    // neuf (le téléphone), tout est encore vide en local et c'est le serveur qui
    // détient les données. Sans cet ordre, la modale d'accueil s'ouvrirait et
    // proposerait la démo alors que les vraies données arrivent juste après.
    if (syncPossible()) await synchroniser(false);

    return state.cafes.length > 0 || state.extractions.length > 0;
  }

  return {
    state, abonner, notifier, init,
    synchroniser, syncPossible, reporterHorodatage,
    csvParse, csvSerialiser, CAFE_COLS, EXT_COLS, RECETTE_COLS, ACHAT_COLS,
    sachetCourant, stockSachet, ajouterAchat, supprimerAchat,
    calculs, cafeDe,
    lierDossier, delierDossier, sauverFichiers,
    importerTexteCSV, exporterCafes, exporterExtractions, exporterRecettes,
    chargerDemo, viderDonnees,
    ajouterExtraction, modifierExtraction, supprimerExtraction,
    ajouterCafe, modifierCafe,
    ajouterRecette, modifierRecette, reinitialiserRecette, supprimerRecette, estRecetteDorigine,
    ajouterTasse, supprimerTasse,
    kvGet, kvSet,
  };
})();
