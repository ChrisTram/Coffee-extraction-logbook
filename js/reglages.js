/* Meilleur réglage PAR CAFÉ.
 *
 * Volontairement par café et pas en général : le meilleur réglage d'un Sáng Tạo 4
 * déjà moulu à 82 pour cent de café n'a rien à voir avec celui d'un Balanced en
 * grains. Une moyenne globale mélangerait les deux et ne serait actionnable pour
 * aucun des deux.
 *
 * Une COMBINAISON est l'ensemble des leviers que Chris contrôle au moment de
 * faire la tasse : la recette, la mouture, la puissance de feu, le préchauffage.
 * Le café n'en fait pas partie, c'est la clé de regroupement. La note et le
 * diagnostic non plus, ce sont des résultats.
 *
 * Fichier séparé de app.js et sans aucune dépendance au DOM : le calcul est
 * ainsi testable sans navigateur, ce qui compte d'autant plus que le panneau
 * navigateur de l'agent ne peut pas exécuter ce site (voir la dette technique
 * dans AUDIT.md).
 */

/* Moyenne glissante sur une fenêtre de tasses NOTÉES, pas de jours : à une ou
   deux tasses par jour actif, une fenêtre en jours serait pleine de trous et la
   courbe sauterait autant que les points bruts.

   Renvoie une valeur par extraction notée, dans l'ordre chronologique, et null
   tant que la fenêtre n'est pas pleine : afficher une moyenne de deux tasses
   comme si c'en était une de cinq serait mentir sur sa solidité. */
function moyenneGlissante(extractions, fenetre) {
  const n = fenetre || 5;
  const ord = extractions
    .filter(e => e.note_sur_10 !== "" && e.note_sur_10 !== undefined && e.date_heure)
    .slice()
    .sort((a, b) => String(a.date_heure).localeCompare(String(b.date_heure)));
  return ord.map((e, i) => {
    if (i < n - 1) return { date: e.date_heure, valeur: null };
    const f = ord.slice(i - n + 1, i + 1).map(x => Number(x.note_sur_10));
    return { date: e.date_heure, valeur: Math.round(f.reduce((s, x) => s + x, 0) / n * 100) / 100 };
  });
}

/* Leviers examinés, dans l'ordre où on les préfère à écart égal : d'abord ce que
   Chris règle vraiment au moment de faire la tasse, ensuite ce qu'il subit.
   La fonction valeur renvoie null quand le levier n'est pas renseigné, la tasse est alors
   ignorée POUR CE LEVIER seulement. */
const LEVIERS = [
  { cle: "feu", valeur: e => (e.methode !== "Brikka" || e.puissance_feu === "" || e.puissance_feu === undefined
      ? null : String(e.puissance_feu)) },
  { cle: "prechauffage", valeur: e => (e.methode !== "Brikka" ? null
      : Number(e.eau_prechauffee) === 1 ? "oui" : "non") },
  { cle: "recette", valeur: e => e.recette || null },
  { cle: "dose", valeur: e => (Number(e.dose_g) > 0 ? String(Math.round(Number(e.dose_g))) : null) },
  { cle: "mouture", valeur: e => e.mouture_dial || null },
  { cle: "paquet", valeur: e => {
      const j = e._c && e._c.jours_ouvert;
      if (j === "" || j === undefined || j === null) return null;
      return j <= 7 ? "frais" : j <= 21 ? "median" : "vieux";
    } },
];

/* Cherche, dans un lot de tasses homogène, le levier dont le meilleur groupe se
   détache le plus du reste. Renvoie null si aucun ne passe les garde-fous.

   Les garde-fous sont les mêmes que les insights du tableau de bord et ils ne
   sont pas négociables : au moins minParGroupe tasses de chaque côté, et au
   moins minEcart point de différence. En dessous, n'importe quelle corrélation
   est du bruit et une phrase affirmative serait un mensonge. */
function meilleurLevier(tasses, minParGroupe, minEcart) {
  const minN = minParGroupe || 3;
  const minE = minEcart || 0.4;
  let meilleur = null;

  for (const levier of LEVIERS) {
    const groupes = new Map();
    tasses.forEach(e => {
      const v = levier.valeur(e);
      if (v === null) return;
      if (!groupes.has(v)) groupes.set(v, []);
      groupes.get(v).push(Number(e.note_sur_10));
    });
    const eligibles = [...groupes.entries()].filter(([, n]) => n.length >= minN);
    // Il faut au moins DEUX groupes : un levier qui n'a jamais varié ne peut
    // rien expliquer, même si ses tasses sont excellentes.
    if (eligibles.length < 2) continue;

    const moy = n => n.reduce((s, x) => s + x, 0) / n.length;
    const classes = eligibles.map(([v, n]) => ({ valeur: v, moy: moy(n), n: n.length }))
      .sort((a, b) => b.moy - a.moy);
    // Le gagnant contre TOUT LE RESTE mis en commun, pas contre le deuxième : à
    // trois valeurs ou plus, l'écart au deuxième est toujours minuscule.
    const reste = eligibles.filter(([v]) => v !== classes[0].valeur).flatMap(([, n]) => n);
    if (!reste.length) continue;
    const ecart = classes[0].moy - moy(reste);
    if (ecart < minE) continue;

    if (!meilleur || ecart > meilleur.ecart) {
      meilleur = {
        levier: levier.cle, valeur: classes[0].valeur, ecart,
        haut: classes[0].moy, bas: moy(reste), n: classes[0].n, nReste: reste.length,
      };
    }
  }
  return meilleur;
}

/* Un constat par couple (café, machine), du plus documenté au moins documenté.
   Isoler la machine n'est pas un détail : la même puissance de feu ne veut rien
   dire d'un Switch, et mélanger les deux produirait une moyenne qui ne décrit
   aucune tasse réelle. */
function constatsParCafe(cafes, extractions, options) {
  const o = options || {};
  const minLot = o.minLot || 6;
  const notees = extractions.filter(e => e.note_sur_10 !== "" && e.note_sur_10 !== undefined);
  const lots = new Map();
  notees.forEach(e => {
    const k = e.cafe_id + "|" + e.methode;
    if (!lots.has(k)) lots.set(k, []);
    lots.get(k).push(e);
  });

  return [...lots.entries()]
    .filter(([, tasses]) => tasses.length >= minLot)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([k, tasses]) => {
      const [cafeId, methode] = k.split("|");
      const trouve = meilleurLevier(tasses, o.minParGroupe, o.minEcart);
      if (!trouve) return null;
      const cafe = cafes.find(c => c.id === cafeId);
      return { cafe: cafe || null, cafeId, methode, total: tasses.length, ...trouve };
    })
    .filter(Boolean);
}

/* LES TASSES JUMELLES (v8.44). Au moment de brasser : ce réglage, qu'a-t-il
   donné les fois d'avant ?

   Jumelle ne veut PAS dire identique. La première version comparait tout
   (température, dose, feu), et Chris l'a corrigée avant même qu'elle existe :
   une tasse à 94 °C au lieu de 92 reste la même tasse. Une jumelle, c'est donc
   la MÊME RECETTE et une molette à JUMELLE_CRANS crans près (3 crans, 25 µm).
   Le café n'est pas exigé, mais les tasses du même café passent devant, puis
   la molette la plus proche, puis la plus récente. Un café déjà moulu n'a pas
   de molette : ses jumelles sont alors les tasses de la même recette sur ce
   même café.

   Seules les tasses NOTÉES comptent (une jumelle sans note ne dit rien), et
   l'appelant écarte les ratées comme partout ailleurs dans ce qui conseille. */
const JUMELLE_CRANS = 3;
function jumelles(extractions, cible, combien) {
  if (!cible || !cible.recette) return [];
  const moulu = !!cible.moulu;
  const pc = moulu ? null : GRIND.parseDial(String(cible.mouture_dial || ""));
  const trouvees = [];
  extractions.forEach(e => {
    if (e.note_sur_10 === "" || e.note_sur_10 === undefined || e.recette !== cible.recette) return;
    const memeCafe = e.cafe_id === cible.cafe_id;
    let ecart = 0;
    if (pc) {
      const pe = GRIND.parseDial(String(e.mouture_dial || ""));
      if (!pe) return;
      ecart = pe.crans - pc.crans;
      if (Math.abs(ecart) > JUMELLE_CRANS) return;
    } else if (!memeCafe) {
      return;
    }
    trouvees.push({ ext: e, memeCafe, ecart });
  });
  trouvees.sort((a, b) =>
    (b.memeCafe - a.memeCafe) || (Math.abs(a.ecart) - Math.abs(b.ecart)) ||
    String(b.ext.date_heure).localeCompare(String(a.ext.date_heure)));
  return trouvees.slice(0, combien || 3);
}

/* LA CORRECTION CHIFFRÉE (v8.48). D'un diagnostic à un réglage : « Un peu
   amer » sur une molette 1.4.2 devient « 1.4.2 → 1.5.0 ».

   Rien n'est écrit en dur ici : le SENS vient de DIAGNOSTIC_LEVIERS (recettes.js),
   les PAS de la ligne de réglages (Paramètres), la valeur de départ de la tasse,
   et les bornes de la mouture de la plage de sa machine (GRIND). Changer un pas,
   une plage ou une recette change la proposition sans toucher au code.

   Plusieurs diagnostics cochés : pour chaque levier, le plus franc l'emporte ; deux
   diagnostics qui tirent un levier en sens contraires l'annulent, c'est le cas de
   l'extraction inégale. Un café déjà moulu n'a pas de molette. Rend la liste des
   leviers dans l'ordre où les appliquer (mouture, chaleur, ratio), vide s'il n'y a
   rien à chiffrer. Le premier est la proposition, les autres « si ça ne suffit
   pas ». */
function correctionChiffree(ext, pas, moulu) {
  const p = Object.assign({ pas_crans: 2, pas_degres: 2, pas_feu: 1, pas_eau_g: 15, pas_dose_g: 1 }, pas || {});
  const sens = {};
  String(ext && ext.diagnostic || "").split("|").filter(Boolean).forEach(d => {
    const l = (typeof DIAGNOSTIC_LEVIERS !== "undefined" && DIAGNOSTIC_LEVIERS[d]) || {};
    Object.entries(l).forEach(([k, v]) => {
      if (sens[k] === undefined) sens[k] = v;
      else if (Math.sign(sens[k]) !== Math.sign(v)) sens[k] = 0;
      else if (Math.abs(v) > Math.abs(sens[k])) sens[k] = v;
    });
  });
  const nb = v => (v === "" || v === undefined || v === null || !Number.isFinite(Number(v)) ? null : Number(v));
  const borne = (v, a, b) => Math.max(a, Math.min(b, v));
  const leviers = [];
  if (sens.mouture && !moulu) {
    const d = GRIND.parseDial(String(ext.mouture_dial || ""));
    const plage = GRIND.METHODES.find(m => m.id === String(ext.methode || "").toLowerCase());
    if (d) {
      let c = d.crans + sens.mouture * p.pas_crans;
      if (plage) c = borne(c, plage.minC, plage.maxC);
      c = borne(c, 0, GRIND.CRANS_MAX);
      if (c !== d.crans) {
        leviers.push({ levier: "mouture", champ: "mouture_dial", de: ext.mouture_dial, vers: GRIND.dialDepuisCrans(c),
          ecart: c - d.crans, microns: [Math.round(d.microns), Math.round(c * GRIND.MICRONS_PAR_CRAN)] });
      }
    }
  }
  if (sens.chaleur) {
    if (ext.methode === "Switch" && nb(ext.temperature_c) !== null) {
      const t = borne(nb(ext.temperature_c) + sens.chaleur * p.pas_degres, 80, 100);
      if (t !== nb(ext.temperature_c)) leviers.push({ levier: "temperature", champ: "temperature_c", de: nb(ext.temperature_c), vers: t });
    } else if (ext.methode === "Brikka" && nb(ext.puissance_feu) !== null && sens.chaleur < 0) {
      // À la Brikka, jamais plus de feu (v8.74) : il surchauffe l'aluminium.
      const f = borne(nb(ext.puissance_feu) + sens.chaleur * p.pas_feu, 1, 10);
      if (f !== nb(ext.puissance_feu)) leviers.push({ levier: "feu", champ: "puissance_feu", de: nb(ext.puissance_feu), vers: f });
    }
  }
  if (sens.ratio) {
    if (ext.methode === "Switch" && nb(ext.eau_g) > 0) {
      const e = Math.max(nb(ext.dose_g) > 0 ? nb(ext.dose_g) * 8 : 60, nb(ext.eau_g) + sens.ratio * p.pas_eau_g);
      if (e !== nb(ext.eau_g)) leviers.push({ levier: "eau", champ: "eau_g", de: nb(ext.eau_g), vers: e });
    }
    // Pas de ratio chiffré à la Brikka (v8.74) : son panier est plein et arasé.
  }
  return leviers;
}

/* LA RÉGULARITÉ, À CAFÉ ÉGAL (v8.54). L'écart moyen de chaque tasse à la moyenne
   des tasses du MÊME café sur la MÊME recette, sur toutes les tasses qui ont au
   moins une jumelle. L'ancien calcul prenait l'écart à la moyenne de tout
   l'historique : un Liberica à 8 et un Strong à 4, chacun refait à l'identique,
   donnaient un gros écart. C'était la variété des cafés, pas la régularité du
   geste. Rend null tant qu'aucun couple café et recette n'a deux tasses notées. */
function ecartACafeEgal(tasses) {
  const groupes = {};
  tasses.forEach(e => {
    if (e.note_sur_10 === "" || e.note_sur_10 === undefined) return;
    const k = e.cafe_id + "|" + e.recette;
    (groupes[k] = groupes[k] || []).push(Number(e.note_sur_10));
  });
  let somme = 0, n = 0;
  Object.values(groupes).filter(g => g.length >= 2).forEach(g => {
    const m = g.reduce((a, b) => a + b, 0) / g.length;
    g.forEach(x => { somme += Math.abs(x - m); n += 1; });
  });
  return n ? somme / n : null;
}

const REGLAGES = (() => {
  // Même seuil que les insights : sous trois tasses, une moyenne est du hasard.
  const MIN_TASSES = 3;

  const texte = v => (v === null || v === undefined ? "" : String(v));

  /* Signature d'une combinaison. Les valeurs vides comptent : "pas de mouture"
     est une information sur un café déjà moulu, pas une donnée manquante. */
  function signature(e) {
    return [
      texte(e.recette),
      texte(e.mouture_dial),
      texte(e.puissance_feu),
      Number(e.eau_prechauffee) === 1 ? "1" : "",
    ].join("|");
  }

  // Définie une seule fois, dans outils.js. Renvoie null sur une liste vide,
  // là où la copie locale renvoyait NaN et laissait "NaN" atteindre l'écran.
  const moyenne = OUTILS.moyenne;

  /* Retourne le bilan d'un café : sa moyenne toutes tasses confondues, et la
     meilleure combinaison si elle atteint le seuil.

     `raison` explique l'absence de résultat au lieu de laisser une carte vide,
     et distingue les deux cas qui n'appellent pas la même action : pas assez de
     tasses en tout, ou assez de tasses mais éparpillées sur trop de réglages. */
  function pourCafe(cafeId, extractions, minTasses) {
    const seuil = minTasses || MIN_TASSES;
    const notees = extractions.filter(e => e.cafe_id === cafeId && e.note_sur_10 !== "");
    if (!notees.length) return { total: 0, moyenne: null, meilleure: null, raison: "aucune" };

    const groupes = new Map();
    notees.forEach(e => {
      const s = signature(e);
      if (!groupes.has(s)) groupes.set(s, []);
      groupes.get(s).push(e);
    });

    const eligibles = [...groupes.entries()]
      .filter(([, liste]) => liste.length >= seuil)
      .map(([s, liste]) => {
        const notes = liste.map(e => Number(e.note_sur_10));
        const moy = moyenne(notes);
        // La tasse de référence : la mieux notée de la combinaison, la plus
        // récente en cas d'égalité. C'est elle qu'on duplique pour refaire.
        const reference = [...liste].sort((a, b) =>
          Number(b.note_sur_10) - Number(a.note_sur_10) ||
          String(b.date_heure).localeCompare(String(a.date_heure)))[0];
        const [recette, mouture, puissance, prechauffe] = s.split("|");
        return {
          signature: s, recette, mouture, puissance,
          prechauffe: prechauffe === "1",
          moyenne: moy, n: liste.length, referenceId: reference.id,
        };
      })
      .sort((a, b) => b.moyenne - a.moyenne || b.n - a.n);

    const bilan = {
      total: notees.length,
      moyenne: moyenne(notees.map(e => Number(e.note_sur_10))),
      meilleure: eligibles[0] || null,
      combinaisons: groupes.size,
      raison: "",
    };
    /* UN « MEILLEUR » SOUS LA MOYENNE N'EN EST PAS UN (v8.38). Quand tous les
       réglages refaits au moins trois fois restent sous la moyenne du café, les
       bonnes tasses viennent de réglages essayés une ou deux fois : couronner
       le moins mauvais des réglages répétés conseillait de refaire une tasse
       plus mauvaise que d'habitude. On désigne plutôt le réglage de la
       MEILLEURE tasse, et ce qu'il manque pour savoir s'il tient. */
    if (bilan.meilleure && bilan.meilleure.moyenne < bilan.moyenne - 0.2) {
      const top = [...notees].sort((a, b) =>
        Number(b.note_sur_10) - Number(a.note_sur_10) ||
        String(b.date_heure).localeCompare(String(a.date_heure)))[0];
      const k = groupes.get(signature(top)).length;
      bilan.meilleure = null;
      bilan.raison = "sous_moyenne";
      bilan.meilleureTasse = { id: top.id, note: Number(top.note_sur_10), fois: k };
      bilan.manque = Math.max(1, seuil - k);
      return bilan;
    }
    if (!bilan.meilleure) {
      bilan.raison = notees.length < seuil ? "pas_assez" : "eparpille";
      // Combien de tasses manquent à la combinaison la plus jouée : c'est
      // l'action concrète, refaire la même plutôt que d'en essayer une de plus.
      const plusJouee = [...groupes.values()].sort((a, b) => b.length - a.length)[0];
      bilan.manque = seuil - plusJouee.length;
    }
    return bilan;
  }

  /* Tous les cafés, les actifs d'abord, ceux qui ont un résultat en tête. Un
     café sans aucune tasse notée est retourné quand même : son absence de
     résultat est une information. */
  function tous(cafes, extractions, minTasses) {
    return cafes
      .map(c => ({ cafe: c, ...pourCafe(c.id, extractions, minTasses) }))
      .sort((a, b) => {
        const actif = (a.cafe.actif === 0 ? 1 : 0) - (b.cafe.actif === 0 ? 1 : 0);
        if (actif) return actif;
        const trouve = (b.meilleure ? 1 : 0) - (a.meilleure ? 1 : 0);
        if (trouve) return trouve;
        return (b.meilleure ? b.meilleure.moyenne : b.moyenne || 0) -
          (a.meilleure ? a.meilleure.moyenne : a.moyenne || 0);
      });
  }

  return { MIN_TASSES, signature, pourCafe, tous, moyenneGlissante, meilleurLevier, constatsParCafe, LEVIERS,
    JUMELLE_CRANS, jumelles, correctionChiffree, ecartACafeEgal };
})();
