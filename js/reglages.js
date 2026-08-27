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

  function moyenne(liste) {
    return liste.reduce((a, b) => a + b, 0) / liste.length;
  }

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

  return { MIN_TASSES, signature, pourCafe, tous, moyenneGlissante, meilleurLevier, constatsParCafe, LEVIERS };
})();
