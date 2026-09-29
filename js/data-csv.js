/* CSV: reading and writing, and nothing else.
 *
 * Pure: no dependency, no state. Chris's files open in a spreadsheet, so the
 * format is the spreadsheet's: comma, doubled quotes, line endings
 * normalised on read. */
"use strict";

const DATA_CSV = (() => {

  function csvParse(text) {
    const lines = [];
    let field = "", line = [], inQuotes = false;
    const t = (text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (inQuotes) {
        if (ch === '"') {
          if (t[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ",") { line.push(field); field = ""; }
        else if (ch === "\n") { line.push(field); lines.push(line); line = []; field = ""; }
        else field += ch;
      }
    }
    if (field !== "" || line.length) { line.push(field); lines.push(line); }
    if (!lines.length) return [];
    const headers = lines[0].map(h => h.trim());
    return lines.slice(1)
      .filter(l => l.some(c => c !== ""))
      .map(l => {
        const obj = {};
        headers.forEach((h, idx) => {
          const v = l[idx] !== undefined ? l[idx] : "";
          obj[h] = /^'[=+\-@\t\r]/.test(v) ? v.slice(1) : v;
        });
        return obj;
      });
  }

  /* NO SPREADSHEET FORMULAS (v8.73). A text starting with = + - or @ turns
     into a formula when the CSV is opened. It gets an apostrophe in front,
     which reading back removes (csvParse). Numbers are not touched. */
  const FORMULA = /^[=+\-@\t\r]/;
  function csvChamp(v) {
    const raw = v === null || v === undefined ? "" : String(v);
    const s = typeof v === "string" && FORMULA.test(raw) ? "'" + raw : raw;
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function csvSerialiser(rows, cols) {
    const lines = [cols.join(",")];
    rows.forEach(r => lines.push(cols.map(c => csvChamp(r[c])).join(",")));
    return lines.join("\n") + "\n";
  }

  return { csvParse, csvChamp, csvSerialiser };
})();
