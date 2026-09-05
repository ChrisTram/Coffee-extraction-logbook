/* CSV : lecture et écriture, et rien d'autre.
 *
 * Pur : aucune dépendance, aucun état. Les fichiers de Chris s'ouvrent au
 * tableur, donc le format est celui du tableur : virgule, guillemets doublés,
 * fins de ligne normalisées à la lecture. */
"use strict";

const DATA_CSV = (() => {

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

  return { csvParse, csvChamp, csvSerialiser };
})();
