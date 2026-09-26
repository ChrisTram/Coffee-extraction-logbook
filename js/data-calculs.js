/* Champs calculés, jamais stockés, et lecture des sachets.
 *
 * Lecture seule sur l'état : ces fonctions dérivent (ratio, coût, âge du
 * sachet, stock restant) et n'écrivent rien. `pour(state)` les lie à l'état
 * que data.js possède ; la façade DATA les expose sous leur nom d'avant. */
"use strict";

const DATA_CALCULS = (() => {

  function pour(state) {

    /* Sachet en cours d'un café : le dernier acheté. Retourne null si le café n'a
       aucun achat, auquel cas l'appelant retombe sur les champs de la fiche café,
       qui restent la source pour un café à sachet unique. */
    /* Le sachet en vigueur à une DATE donnée, et pas simplement le dernier acheté.
       Sans ça, une extraction du 10 août serait rattachée au sachet acheté le 20 et
       afficherait un âge négatif. */
    /* LE SACHET AU PLACARD N'EST PAS LE SACHET EN COURS (v8.72). Le sachet était
       choisi par date d'achat : un sachet acheté d'avance devenait « le sachet
       courant », le stock repartait à plein et le jour du sachet disparaissait
       alors que Chris buvait encore l'ancien. Le formulaire dit « laisse la date
       d'ouverture vide tant qu'il dort » : un sachet ouvert à la date voulue passe
       donc avant un sachet sans date d'ouverture, et un sachet ouvert PLUS TARD
       n'est jamais celui d'une tasse d'avant. Sans aucun sachet ouvert, on garde
       le dernier acheté, comme avant. */
    function sachetALaDate(cafeId, date) {
      const jour = String(date || "").slice(0, 10);
      const candidats = state.achats
        .filter(a => a.cafe_id === cafeId && (!jour || String(a.date_achat).slice(0, 10) <= jour))
        .filter(a => !(jour && a.date_ouverture && String(a.date_ouverture).slice(0, 10) > jour));
      const ouverts = candidats.filter(a => a.date_ouverture)
        .sort((a, b) => String(b.date_ouverture).localeCompare(String(a.date_ouverture)));
      if (ouverts.length) return ouverts[0];
      return candidats.sort((a, b) => String(b.date_achat).localeCompare(String(a.date_achat)))[0] || null;
    }

    function sachetCourant(cafeId) {
      return sachetALaDate(cafeId, OUTILS.cleLocale(new Date()));
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

    function cafeDe(ext) {
      return state.cafes.find(c => c.id === ext.cafe_id) || null;
    }

    function calculs(ext) {
      const cafe = cafeDe(ext);
      const dial = GRIND.parseDial(ext.mouture_dial);
      /* RATIO : deux logiques, une par machine, parce que "eau" ne désigne pas la
         même chose des deux côtés.

         SWITCH, percolation : l'eau versée traverse le café et finit dans la tasse.
         Le ratio d'infusion classique, eau sur dose, est le bon (1:15).

         BRIKKA : "eau" est le volume de la CHAUDIÈRE. Une partie reste en vapeur
         et ne passe jamais dans la tasse. Utiliser eau sur dose donnerait 1:9,4
         là où la tasse fait réellement 1:5,6, et surtout ce nombre ne bougerait
         jamais puisque la chaudière est toujours remplie pareil. On prend donc le
         VOLUME EXTRAIT, comme le brew ratio d'un espresso.
         Sans volume extrait renseigné on retombe sur la chaudière, mais l'infobulle
         le dit clairement au lieu de faire passer un chiffre pour l'autre. */
      let ratio = "", ratioBase = "";
      const estBrikka = ext.methode === "Brikka";
      if (ext.dose_g > 0 && ext.eau_g) {
        ratio = ext.eau_g / ext.dose_g;
        ratioBase = estBrikka ? "chaudiere" : "infusion";
      }
      /* Ratio en TASSE, secondaire et seulement s'il est mesuré. Il décrit ce qui
         sort vraiment de la Brikka, mais il ne se compare à aucune recette. */
      const ratioTasse = ext.dose_g > 0 && ext.volume_extrait_ml !== "" && Number(ext.volume_extrait_ml) > 0
        ? Number(ext.volume_extrait_ml) / ext.dose_g
        : "";
      /* Jours depuis l'OUVERTURE du sachet. C'est la variable de fraîcheur utile :
         Chris n'a de date de torréfaction sur aucun café et n'en aura pas, mais il
         sait toujours quand il a ouvert un paquet. */
      let joursOuvert = "";
      if (ext.cafe_id && ext.date_heure) {
        const sachet = sachetALaDate(ext.cafe_id, ext.date_heure);
        if (sachet && sachet.date_ouverture) {
          const d1 = new Date(sachet.date_ouverture + "T00:00");
          const d2 = new Date(ext.date_heure);
          if (!isNaN(d1) && !isNaN(d2)) joursOuvert = Math.max(0, Math.floor((d2 - d1) / 86400000));
        }
      }
      let age = "";
      if (cafe && cafe.date_torrefaction && ext.date_heure) {
        const d1 = new Date(cafe.date_torrefaction + "T00:00");
        const d2 = new Date(ext.date_heure);
        if (!isNaN(d1) && !isNaN(d2)) age = Math.floor((d2 - d1) / 86400000);
      }
      let retention = "";
      if (ext.eau_g !== "" && ext.volume_extrait_ml !== "") retention = ext.eau_g - ext.volume_extrait_ml;
      /* Volume LIQUIDE : extraction plus eau ajoutée plus lait froid. Sur un
         cappuccino la tasse paraîtra plus pleine que ce chiffre, et c'est normal :
         la mousse est de l'air. Elle occupe du volume sans rien ajouter à boire,
         et surtout sans diluer quoi que ce soit, donc elle n'entre ni ici ni dans
         le ratio boisson. */
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
        ratioBase,
        ratioTasse,
        ratioTasseTexte: ratioTasse === "" ? "" : "1:" + ratioTasse.toFixed(1),
        // Ratio de la boisson : inclut l'eau d'allongement et le lait froid, les
        // deux seuls liquides ajoutés. Sur une Brikka allongée, c'est lui qui
        // décrit ce qu'on boit vraiment.
        ratioBoisson: (() => {
          if (!(ext.dose_g > 0) || boisson === "" || !(Number(boisson) > 0)) return "";
          const ajout = (Number(ext.eau_ajoutee_ml) || 0) + (Number(ext.lait_ml) || 0);
          if (!ajout) return "";
          return "1:" + (Number(boisson) / ext.dose_g).toFixed(1);
        })(),
        crans: dial ? dial.crans : "",
        microns: dial ? Math.round(dial.microns) : "",
        age_jours: age,
        jours_ouvert: joursOuvert,
        retention_ml: retention,
        volume_boisson_ml: boisson,
        cout_tasse_vnd: cout,
        cout_reel_vnd: coutReel,
        cafe_nom: cafe ? cafe.nom : (ext.cafe_id ? "Café supprimé" : "Sans café"),
        moulu: cafe ? Number(cafe.deja_moulu) === 1 : false,
      };
    }

    return { cafeDe, calculs, sachetALaDate, sachetCourant, stockSachet };
  }

  return { pour };
})();
