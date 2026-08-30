/* Tests des FRONTIERES entre les fichiers de l'interface.
 *
 *   node tools/modules.test.mjs
 *
 * L'interface tenait dans un seul fichier de 3 400 lignes, une seule fonction,
 * une seule portee. Tout se voyait de partout, donc rien ne pouvait mal se
 * cabler. Le decoupage en sept fichiers a supprime ce filet : chaque fichier a
 * maintenant sa portee, et un nom oublie ne se voit plus a l'ecriture. Ce
 * fichier remet le filet, en statique.
 *
 * Les trois fautes que ce decoupage rend possibles, par ordre de mechancete :
 *
 *   1. Emprunter un `let` du noyau. La destructuration lie une VALEUR : le
 *      fichier emprunteur reste fige sur la valeur du chargement, pour toujours,
 *      sans que rien ne le signale. C'est arrive pendant le decoupage lui-meme,
 *      sur l'ecran courant, et seule une relecture l'a attrape. L'etat partage
 *      doit etre un objet mute en place, comme `saisie`, `chrono` ou `nav`.
 *
 *   2. Appeler une fonction d'un autre ecran sans passer par UI. Le fichier se
 *      charge sans broncher et la panne arrive au clic, dans le navigateur.
 *
 *   3. Definir une fonction sans l'exposer alors qu'un autre fichier l'appelle.
 *      Meme symptome, meme delai.
 *
 * On lit les fichiers, on ne les execute pas : boot.test.mjs se charge de faire
 * tourner l'application pour de vrai.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
function check(nom, ok, detail) {
  if (ok) console.log("OK   " + nom);
  else { failures++; console.log("FAIL " + nom + (detail ? "  -> " + detail : "")); }
}

/* Un lexeur juste assez complet pour savoir OU sont les identifiants libres.
   Les expressions regulieres ne suffisent pas : un nom apparait aussi dans des
   chaines, des commentaires et comme propriete, et les confondre donnerait des
   alertes fausses en pagaille, donc un test qu'on finirait par ignorer. */
function lexer(src) {
  const jetons = [];
  let i = 0, prec = null;
  const pousser = (type, deb, fin) => {
    const j = { type, deb, fin, txt: src.slice(deb, fin) };
    jetons.push(j);
    if (type !== "espace" && type !== "commentaire") prec = j;
  };
  while (i < src.length) {
    const c = src[i];
    if (" \t\n\r".includes(c)) {
      const d = i; while (i < src.length && " \t\n\r".includes(src[i])) i++;
      pousser("espace", d, i); continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      const d = i; while (i < src.length && src[i] !== "\n") i++;
      pousser("commentaire", d, i); continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const d = i; i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2; pousser("commentaire", d, i); continue;
    }
    if (c === '"' || c === "'") {
      const d = i, q = c; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === "\\") i++; i++; }
      i++; pousser("chaine", d, i); continue;
    }
    if (c === "`") {
      const d = i; i++;
      while (i < src.length && src[i] !== "`") {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "$" && src[i + 1] === "{") {
          i += 2; let n = 1;
          while (i < src.length && n > 0) {
            if (src[i] === "{") n++;
            else if (src[i] === "}") n--;
            else if ("\"'`".includes(src[i])) {
              const q = src[i]; i++;
              while (i < src.length && src[i] !== q) { if (src[i] === "\\") i++; i++; }
            }
            i++;
          }
          continue;
        }
        i++;
      }
      i++; pousser("gabarit", d, i); continue;
    }
    if (c === "/") {
      // Regex ou division : cela depend du jeton precedent, pas du caractere.
      const p = prec ? prec.txt : null;
      const divise = p !== null && (/^[\w$]+$/.test(p) || p === ")" || p === "]") &&
        !["return", "typeof", "case", "in", "of", "new", "delete", "void",
          "instanceof", "do", "else", "yield", "await"].includes(p);
      if (divise) { pousser("op", i, i + 1); i++; continue; }
      const d = i; i++; let crochet = false;
      while (i < src.length) {
        const x = src[i];
        if (x === "\\") { i += 2; continue; }
        if (x === "[") crochet = true;
        else if (x === "]") crochet = false;
        else if ((x === "/" && !crochet) || x === "\n") break;
        i++;
      }
      i++; while (i < src.length && /[a-z]/.test(src[i])) i++;
      pousser("regex", d, i); continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const d = i; while (i < src.length && /[\w$]/.test(src[i])) i++;
      pousser("ident", d, i); continue;
    }
    if (/[0-9]/.test(c)) {
      const d = i; while (i < src.length && /[\w.]/.test(src[i])) i++;
      pousser("nombre", d, i); continue;
    }
    /* Les operateurs de plus d'un caractere doivent sortir en UN jeton. Sans
       cela `=>` devient `=` puis `>`, et toute la reconnaissance des fonctions
       flechees tombe en silence : chaque parametre passe alors pour un nom
       inconnu, et le test noie sa vraie alerte dans cinquante fausses. */
    const multi = OPS.find(o => src.startsWith(o, i));
    const n = multi ? multi.length : 1;
    pousser("op", i, i + n); i += n;
  }
  return jetons;
}

// Du plus long au plus court : `===` doit gagner contre `==`.
const OPS = ["...", "===", "!==", "**=", "&&=", "||=", "??=", "=>", "==", "!=", "<=", ">=",
  "&&", "||", "??", "?.", "++", "--", "+=", "-=", "*=", "/=", "%=", "**", "<<", ">>"];

const FICHIERS = ["js/ui-noyau.js", "js/ui-tableau.js", "js/ui-saisie.js",
  "js/ui-historique.js", "js/ui-guide.js", "js/ui-catalogue.js", "js/app.js"];

const MOTS_CLES = new Set(["if","else","for","while","do","return","function","const","let","var",
  "new","typeof","instanceof","in","of","delete","void","this","null","true","false","undefined",
  "class","extends","super","try","catch","finally","throw","switch","case","default","break",
  "continue","async","await","yield","import","export","from","as","static","get","set","arguments"]);

/* Les autres couches du site. On les RELEVE dans leurs fichiers au lieu de les
   lister ici : recettes.js à lui seul publie une trentaine de constantes, et une
   liste écrite à la main aurait divergé au premier ajout, transformant ce test
   en source de fausses alertes. Ce qui revient à le désactiver. */
const AUTRES_COUCHES = ["js/i18n.js", "js/grind.js", "js/recettes.js", "js/sync.js",
  "js/data.js", "js/reglages.js", "js/charts.js", "js/demo-data.js"];
const GLOBAUX = new Set(["Chart",
  "UI","document","window","location","history","navigator","localStorage","sessionStorage",
  "console","Math","JSON","Date","Number","String","Boolean","Array","Object","Set","Map","Promise",
  "RegExp","Error","Intl","Blob","URL","File","FileReader","FormData","Headers","Request","Response",
  "AbortController","TextEncoder","TextDecoder","IntersectionObserver","ResizeObserver",
  "MutationObserver","NodeFilter","AudioContext","webkitAudioContext","Image","Event","CustomEvent",
  "setTimeout","clearTimeout","setInterval","clearInterval","requestAnimationFrame",
  "cancelAnimationFrame","queueMicrotask","fetch","alert","confirm","prompt","matchMedia",
  "parseInt","parseFloat","isNaN","isFinite","encodeURIComponent","decodeURIComponent",
  "structuredClone","crypto","performance","getComputedStyle","scrollTo","btoa","atob","Infinity","NaN"]);

for (const f of AUTRES_COUCHES) {
  const s = readFileSync(join(ROOT, f), "utf8");
  for (const m of s.matchAll(/^(?:const|let|var|function|async function) ([\w$]+)/gm)) GLOBAUX.add(m[1]);
}

/* Ce que chaque fichier declare, emprunte et expose. Les declarations sont
   relevees a toute profondeur : parametres compris, sans quoi chaque parametre
   passerait pour un nom inconnu. */
const infos = {};
for (const f of FICHIERS) {
  const src = readFileSync(join(ROOT, f), "utf8");
  const jetons = lexer(src);
  const sig = [];
  jetons.forEach((j, k) => { if (j.type !== "espace" && j.type !== "commentaire") sig.push(k); });
  const rang = new Map(); sig.forEach((k, r) => rang.set(k, r));
  const av = k => (rang.get(k) > 0 ? jetons[sig[rang.get(k) - 1]] : null);
  const ap = k => (rang.get(k) + 1 < sig.length ? jetons[sig[rang.get(k) + 1]] : null);

  /* Les VRAIES listes de parametres : celles qui suivent `function` ou `catch`,
     et celles dont la parenthese fermante est suivie d'une fleche. Sans cette
     precision, `addEventListener("click", majLive)` passerait pour une
     declaration de parametre nomme majLive. */
  const dansParams = new Set();
  for (let r = 0; r < sig.length; r++) {
    if (jetons[sig[r]].txt !== "(") continue;
    let n = 1, r2 = r;
    while (n > 0 && r2 + 1 < sig.length) {
      r2++; const t = jetons[sig[r2]].txt;
      if (t === "(") n++; else if (t === ")") n--;
    }
    const apF = r2 + 1 < sig.length ? jetons[sig[r2 + 1]].txt : null;
    const av1 = r > 0 ? jetons[sig[r - 1]].txt : null;
    const av2 = r > 1 ? jetons[sig[r - 2]].txt : null;
    if (apF === "=>" || av1 === "function" || av1 === "catch" || av2 === "function")
      for (let x = r + 1; x < r2; x++) dansParams.add(sig[x]);
  }

  /* Les noms lies par une DECLARATION, qui ne suivent pas tous le mot-cle :
       let tasses = 0, joursActifs = 0, serie = 0;      <- apres une virgule
       const { joursActifs, serie } = calculer();       <- dans un motif
       const { _c, ...reste } = extraction;             <- apres un etalement
     On parcourt donc la declaration entiere jusqu'a son point-virgule, en
     retenant les noms qui sont en position de LIAISON : juste apres le mot-cle,
     apres une virgule de premier niveau, ou n'importe ou dans un motif. */
  const dansMotif = new Set();
  for (let r = 0; r < sig.length; r++) {
    if (!["const", "let", "var"].includes(jetons[sig[r]].txt)) continue;
    let prof = 0, attendNom = true;
    for (let x = r + 1; x < sig.length; x++) {
      const t = jetons[sig[x]].txt;
      if (t === ";" && prof === 0) break;
      if ("({[".includes(t)) { prof++; continue; }
      if (")}]".includes(t)) { prof--; if (prof < 0) break; continue; }
      if (t === "," && prof === 0) { attendNom = true; continue; }
      if (t === "=" && prof === 0) { attendNom = false; continue; }
      // Dans un motif (prof > 0 juste apres le mot-cle) tout nom est une liaison.
      const dansUnMotif = prof > 0 && "({[".includes(jetons[sig[r + 1]].txt);
      if (jetons[sig[x]].type === "ident" && (attendNom || dansUnMotif)) {
        dansMotif.add(sig[x]);
        if (prof === 0) attendNom = false;
      }
    }
  }

  const declares = new Set(), libres = [], viaUI = new Set(), reaffectes = new Set();
  for (let k = 0; k < jetons.length; k++) {
    const j = jetons[k];
    if (j.type !== "ident" || MOTS_CLES.has(j.txt)) continue;
    const p = av(k), s = ap(k);
    if (p && (p.txt === "." || p.txt === "?.")) {
      if (p.txt === "." && rang.get(k) >= 2 && jetons[sig[rang.get(k) - 2]].txt === "UI") viaUI.add(j.txt);
      continue;
    }
    if (s && s.txt === ":" && p && (p.txt === "{" || p.txt === ",")) continue;   // cle d'objet
    const estDecl = p && ["const", "let", "var", "function", "class"].includes(p.txt);
    // `...` pour le parametre de reste : `(...args) => ...`
    const estParam = dansParams.has(k) && p && ["(", ",", "{", "[", "..."].includes(p.txt) &&
      s && [",", ")", "=", "}", "]"].includes(s.txt);
    const flecheNue = s && s.txt === "=>" && (!p || ![")", ".", "?."].includes(p.txt));
    const estMotif = dansMotif.has(k);
    if (estDecl || estParam || flecheNue || estMotif) { declares.add(j.txt); continue; }
    if (s && ["=", "+=", "-=", "++", "--"].includes(s.txt)) reaffectes.add(j.txt);
    libres.push({ nom: j.txt, ligne: src.slice(0, j.deb).split("\n").length });
  }

  // L'en-tete d'emprunt : `const { a, b } = UI;`
  const emp = src.match(/const \{([^}]*)\} = UI;/);
  const empruntes = new Set(emp ? emp[1].split(",").map(x => x.trim()).filter(Boolean) : []);

  /* Ce que le fichier expose : le `return {...}` du noyau, ou l'Object.assign
     des autres. On lit la liste declaree, pas les definitions : un nom defini
     mais absent de la liste est exactement la faute qu'on cherche. */
  const exp = src.match(/Object\.assign\(UI, \{([\s\S]*?)\}\);/) || src.match(/  return \{([\s\S]*?)\n  \};/);
  const exposes = new Set(exp ? exp[1].split(",").map(x => x.trim()).filter(Boolean) : []);

  infos[f] = { src, declares, libres, empruntes, exposes, viaUI, reaffectes };
}

const noyau = infos["js/ui-noyau.js"];

/* 1. AUCUN NOM LIBRE INCONNU.
   Un nom qui n'est ni declare sur place, ni emprunte au noyau, ni un global du
   site est un appel qui partira en erreur au premier clic. */
{
  const inconnus = [];
  for (const f of FICHIERS) {
    const { declares, libres, empruntes } = infos[f];
    const vus = new Set();
    for (const { nom, ligne } of libres) {
      if (vus.has(nom) || declares.has(nom) || empruntes.has(nom) || GLOBAUX.has(nom)) continue;
      vus.add(nom);
      inconnus.push(f + ":" + ligne + " " + nom);
    }
  }
  check("aucun fichier n'appelle un nom qu'il n'a ni chez lui ni emprunté",
    inconnus.length === 0, inconnus.join(", "));
}

/* 2. TOUT CE QUI EST LU PAR UI EST BIEN POSE SUR UI.
   `UI.rendreHistorique()` sur un nom que personne n'expose ne casse qu'au clic. */
{
  const tousExposes = new Set();
  for (const f of FICHIERS) for (const n of infos[f].exposes) tousExposes.add(n);
  const orphelins = [];
  for (const f of FICHIERS)
    for (const n of infos[f].viaUI)
      if (!tousExposes.has(n)) orphelins.push(f + " lit UI." + n);
  check("tout ce qui est lu sur UI est exposé par un fichier",
    orphelins.length === 0, orphelins.join(", "));
}

/* 3. LA FAUTE SILENCIEUSE : emprunter un `let` du noyau.
   La destructuration lie une valeur. Emprunter une variable que le noyau
   reaffecte ensuite fige l'emprunteur sur la valeur du chargement, et rien
   n'avertit. L'etat partage doit etre un objet mute en place. */
{
  const mutablesNoyau = new Set(
    [...noyau.src.matchAll(/^  (?:let|var) ([\w$]+)\s*=/gm)].map(m => m[1]));
  const fautes = [];
  for (const f of FICHIERS) {
    if (f === "js/ui-noyau.js") continue;
    for (const n of infos[f].empruntes) if (mutablesNoyau.has(n)) fautes.push(f + " emprunte le let " + n);
  }
  check("aucun fichier n'emprunte une variable réassignable du noyau",
    fautes.length === 0, fautes.join(", "));

  // Le pendant bruyant : reaffecter un nom emprunte leve en mode strict.
  const reaff = [];
  for (const f of FICHIERS) {
    if (f === "js/ui-noyau.js") continue;
    for (const n of infos[f].reaffectes) if (infos[f].empruntes.has(n)) reaff.push(f + " réaffecte " + n);
  }
  check("aucun fichier ne réaffecte un nom emprunté", reaff.length === 0, reaff.join(", "));

  /* L'etat de navigation, lui, est un objet PARTAGE et doit le rester : c'est
     precisement la forme qui a corrige la faute ci-dessus. */
  check("l'état de navigation est un objet partagé, pas des variables",
    noyau.src.includes('const nav = { ecran: "tableau" }'));
}

/* 4. LE NOYAU RESTE UN NOYAU.
   Il se charge en premier, donc il ne peut rien emprunter. Et il ne doit
   connaitre aucun ecran en particulier : quand il en redessine un, il passe par
   UI, decide au moment de l'appel. */
{
  check("le noyau n'emprunte rien, il se charge en premier", noyau.empruntes.size === 0);
  check("le noyau définit UI", noyau.src.includes("const UI = (() => {"));
  check("les autres fichiers augmentent UI sans le redéfinir",
    FICHIERS.slice(1).every(f => !infos[f].src.includes("const UI =")));
  /* Le noyau ne cite un écran que par UI, jamais en appel direct. On regarde les
     noms LIBRES relevés par le lexeur, pas la source brute : l'en-tête de ce
     fichier-ci explique justement la règle en écrivant rendreHistorique(), et
     une recherche textuelle se ferait piéger par son propre commentaire. */
  const ecrans = ["rendreTableau", "rendreHistorique", "rendreReglages", "rendreParametres", "rendreConvertisseur"];
  const directs = ecrans.filter(n => noyau.libres.some(x => x.nom === n));
  check("le noyau n'appelle aucun écran directement", directs.length === 0, directs.join(", "));
}

/* 5. LES TROIS LISTES DE FICHIERS RESTENT D'ACCORD.
   La page, le service worker et le harnais de demarrage declarent la meme liste
   a trois endroits. En oublier un donne trois pannes differentes : ecran blanc,
   application hors ligne cassee, ou test qui passe alors que le site est mort.
   index.html contre sw.js est deja verifie dans data.test.mjs ; il manquait le
   harnais, celui dont la panne est la plus trompeuse. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const boot = readFileSync(join(ROOT, "tools/boot.test.mjs"), "utf8");
  const dansPage = [...html.matchAll(/<script\b[^>]*src="(js\/[^"]+)"/g)].map(m => m[1]);
  const oublies = dansPage.filter(s => !boot.includes('"' + s + '"'));
  check("le harnais de démarrage charge tous les scripts de la page",
    oublies.length === 0, oublies.join(", "));
  const fantomes = FICHIERS.filter(f => !dansPage.includes(f));
  check("et tous les fichiers d'interface sont bien dans la page",
    fantomes.length === 0, fantomes.join(", "));
}

/* 6. LA TAILLE, PUISQUE C'ETAIT LE MOTIF DU DECOUPAGE.
   Un plafond genereux : il n'est pas la pour imposer un style, seulement pour
   qu'on remarque le jour ou un fichier redevient un fourre-tout. */
{
  const gros = FICHIERS.filter(f => infos[f].src.split("\n").length > 1200);
  check("aucun fichier d'interface ne repasse au-dessus de 1200 lignes",
    gros.length === 0, gros.map(f => f + " " + infos[f].src.split("\n").length).join(", "));
}

console.log(failures === 0 ? "\nTOUT PASSE" : "\n" + failures + " ECHEC(S)");
process.exit(failures === 0 ? 0 : 1);
