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

  return { MIN_TASSES, signature, pourCafe, tous };
})();
