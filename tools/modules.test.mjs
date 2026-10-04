/* Tests of the BOUNDARIES between the interface files.
 *
 *   node tools/modules.test.mjs
 *
 * The interface used to fit in a single 3,400 line file, a single function,
 * a single scope. Everything was visible from everywhere, so nothing could be
 * miswired. Splitting it into seven files removed that safety net: each file
 * now has its own scope, and a forgotten name no longer shows up while writing.
 * This file puts the net back, statically.
 *
 * The three mistakes this split makes possible, from nastiest down:
 *
 *   1. Borrowing a `let` from the core. Destructuring binds a VALUE: the
 *      borrowing file stays frozen on the value at load time, forever,
 *      with nothing to flag it. It happened during the split itself,
 *      on the current screen, and only a review caught it. Shared state
 *      must be an object mutated in place, like `entry`, `chrono` or `nav`.
 *
 *   2. Calling a function of another screen without going through UI. The file
 *      loads without a hitch and the failure comes on click, in the browser.
 *
 *   3. Defining a function without exposing it while another file calls it.
 *      Same symptom, same delay.
 *
 * We read the files, we do not execute them: boot.test.mjs takes care of
 * running the application for real.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log("OK   " + name);
  else { failures++; console.log("FAIL " + name + (detail ? "  -> " + detail : "")); }
}

/* A lexer just complete enough to know WHERE the free identifiers are.
   Regular expressions are not enough: a name also appears in strings,
   comments and as a property, and mixing them up would give false alarms
   galore, hence a test that would end up being ignored. */
function lexer(src) {
  const tokens = [];
  let i = 0, prev = null;
  const push = (type, start, end) => {
    const j = { type, start, end, text: src.slice(start, end) };
    tokens.push(j);
    if (type !== "space" && type !== "comment") prev = j;
  };
  while (i < src.length) {
    const c = src[i];
    if (" \t\n\r".includes(c)) {
      const d = i; while (i < src.length && " \t\n\r".includes(src[i])) i++;
      push("space", d, i); continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      const d = i; while (i < src.length && src[i] !== "\n") i++;
      push("comment", d, i); continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const d = i; i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2; push("comment", d, i); continue;
    }
    if (c === '"' || c === "'") {
      const d = i, q = c; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === "\\") i++; i++; }
      i++; push("string", d, i); continue;
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
      i++; push("template", d, i); continue;
    }
    if (c === "/") {
      // Regex or division: it depends on the previous token, not on the character.
      const p = prev ? prev.text : null;
      const isDivision = p !== null && (/^[\w$]+$/.test(p) || p === ")" || p === "]") &&
        !["return", "typeof", "case", "in", "of", "new", "delete", "void",
          "instanceof", "do", "else", "yield", "await"].includes(p);
      if (isDivision) { push("op", i, i + 1); i++; continue; }
      const d = i; i++; let inClass = false;
      while (i < src.length) {
        const x = src[i];
        if (x === "\\") { i += 2; continue; }
        if (x === "[") inClass = true;
        else if (x === "]") inClass = false;
        else if ((x === "/" && !inClass) || x === "\n") break;
        i++;
      }
      i++; while (i < src.length && /[a-z]/.test(src[i])) i++;
      push("regex", d, i); continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const d = i; while (i < src.length && /[\w$]/.test(src[i])) i++;
      push("ident", d, i); continue;
    }
    if (/[0-9]/.test(c)) {
      const d = i; while (i < src.length && /[\w.]/.test(src[i])) i++;
      push("number", d, i); continue;
    }
    /* Operators longer than one character must come out as ONE token. Without
       that, `=>` becomes `=` then `>`, and all recognition of arrow functions
       silently falls apart: every parameter then looks like an unknown name,
       and the test drowns its real alarm in fifty false ones. */
    const multi = OPS.find(o => src.startsWith(o, i));
    const n = multi ? multi.length : 1;
    push("op", i, i + n); i += n;
  }
  return tokens;
}

// Longest to shortest: `===` must win over `==`.
const OPS = ["...", "===", "!==", "**=", "&&=", "||=", "??=", "=>", "==", "!=", "<=", ">=",
  "&&", "||", "??", "?.", "++", "--", "+=", "-=", "*=", "/=", "%=", "**", "<<", ">>"];

const FILES = ["js/ui-core.js", "js/ui-sync-bean.js", "js/ui-nav.js", "js/ui-scrub.js", "js/ui-findings.js", "js/ui-last-cup.js", "js/ui-dashboard.js", "js/ui-wheel.js", "js/ui-cup.js", "js/ui-dial.js", "js/ui-rating-dial.js", "js/ui-entry.js", "js/ui-entry-aside.js", "js/ui-pills.js", "js/ui-chrono.js", "js/ui-draft.js", "js/ui-quick.js",
  "js/ui-history.js", "js/ui-journal.js", "js/ui-guide.js", "js/ui-catalog.js", "js/ui-coffee-sheet.js", "js/ui-brew.js", "js/ui-drawings.js", "js/ui-jar.js", "js/ui-moments.js", "js/ui-roll.js", "js/ui-brewer.js", "js/ui-arrivals.js", "js/ui-empty.js", "js/ui-coffees.js", "js/ui-bag-end.js", "js/ui-panel.js", "js/ui-palette.js", "js/ui-shortcuts.js", "js/app.js"];

const KEYWORDS = new Set(["if","else","for","while","do","return","function","const","let","var",
  "new","typeof","instanceof","in","of","delete","void","this","null","true","false","undefined",
  "class","extends","super","try","catch","finally","throw","switch","case","default","break",
  "continue","async","await","yield","import","export","from","as","static","get","set","arguments"]);

/* The other layers of the site. We COLLECT them from their files instead of
   listing them here: recipes.js alone publishes some thirty constants, and a
   handwritten list would have drifted at the first addition, turning this test
   into a source of false alarms. Which amounts to disabling it. */
const OTHER_LAYERS = ["js/legacy-names.js", "js/tools.js", "js/i18n.fr.js", "js/i18n.js", "js/grind.js", "js/recipes.js", "js/sync.js",
  "js/data-csv.js", "js/data-schema.js", "js/data-store.js", "js/data-calcs.js", "js/data-migrations.js",
  "js/data.js", "js/tuning.js", "js/bags.js", "js/search.js", "js/charts.js", "js/demo-data.js"];
const GLOBALS = new Set(["Chart",
  "UI","document","window","location","history","navigator","localStorage","sessionStorage",
  "console","Math","JSON","Date","Number","String","Boolean","Array","Object","Set","Map","WeakMap","Promise",
  "RegExp","Error","Intl","Blob","URL","File","FileReader","FormData","Headers","Request","Response",
  "AbortController","TextEncoder","TextDecoder","IntersectionObserver","ResizeObserver",
  "MutationObserver","NodeFilter","AudioContext","webkitAudioContext","Image","Event","CustomEvent",
  "setTimeout","clearTimeout","setInterval","clearInterval","requestAnimationFrame",
  "cancelAnimationFrame","queueMicrotask","fetch","alert","confirm","prompt","matchMedia",
  "parseInt","parseFloat","isNaN","isFinite","encodeURIComponent","decodeURIComponent",
  "structuredClone","crypto","performance","getComputedStyle","scrollTo","btoa","atob","Infinity","NaN"]);

for (const f of OTHER_LAYERS) {
  const s = readFileSync(join(ROOT, f), "utf8");
  for (const m of s.matchAll(/^(?:const|let|var|function|async function) ([\w$]+)/gm)) GLOBALS.add(m[1]);
}

/* What each file declares, borrows and exposes. Declarations are
   collected at every depth, parameters included, otherwise every parameter
   would look like an unknown name. */
const info = {};
for (const f of FILES) {
  const src = readFileSync(join(ROOT, f), "utf8");
  const tokens = lexer(src);
  const sig = [];
  tokens.forEach((j, k) => { if (j.type !== "space" && j.type !== "comment") sig.push(k); });
  const rank = new Map(); sig.forEach((k, r) => rank.set(k, r));
  const before = k => (rank.get(k) > 0 ? tokens[sig[rank.get(k) - 1]] : null);
  const after = k => (rank.get(k) + 1 < sig.length ? tokens[sig[rank.get(k) + 1]] : null);

  /* The REAL parameter lists: those following `function` or `catch`,
     and those whose closing parenthesis is followed by an arrow. Without this
     precision, `addEventListener("click", updateLive)` would look like a
     declaration of a parameter named updateLive. */
  const inParams = new Set();
  for (let r = 0; r < sig.length; r++) {
    if (tokens[sig[r]].text !== "(") continue;
    let n = 1, r2 = r;
    while (n > 0 && r2 + 1 < sig.length) {
      r2++; const t = tokens[sig[r2]].text;
      if (t === "(") n++; else if (t === ")") n--;
    }
    const afterClose = r2 + 1 < sig.length ? tokens[sig[r2 + 1]].text : null;
    const prev1 = r > 0 ? tokens[sig[r - 1]].text : null;
    const prev2 = r > 1 ? tokens[sig[r - 2]].text : null;
    if (afterClose === "=>" || prev1 === "function" || prev1 === "catch" || prev2 === "function")
      for (let x = r + 1; x < r2; x++) inParams.add(sig[x]);
  }

  /* Names bound by a DECLARATION, which do not all follow the keyword:
       let cups = 0, activeDays = 0, serie = 0;      <- after a comma
       const { activeDays, serie } = calculer();       <- inside a pattern
       const { _c, ...reste } = extraction;             <- after a spread
     So we walk the whole declaration up to its semicolon, keeping
     the names that are in BINDING position: right after the keyword,
     after a top-level comma, or anywhere inside a pattern. */
  const inPattern = new Set();
  for (let r = 0; r < sig.length; r++) {
    if (!["const", "let", "var"].includes(tokens[sig[r]].text)) continue;
    let depth = 0, expectName = true;
    for (let x = r + 1; x < sig.length; x++) {
      const t = tokens[sig[x]].text;
      if (t === ";" && depth === 0) break;
      if ("({[".includes(t)) { depth++; continue; }
      if (")}]".includes(t)) { depth--; if (depth < 0) break; continue; }
      if (t === "," && depth === 0) { expectName = true; continue; }
      if (t === "=" && depth === 0) { expectName = false; continue; }
      // Inside a pattern (depth > 0 right after the keyword) every name is a binding.
      const insideAPattern = depth > 0 && "({[".includes(tokens[sig[r + 1]].text);
      if (tokens[sig[x]].type === "ident" && (expectName || insideAPattern)) {
        inPattern.add(sig[x]);
        if (depth === 0) expectName = false;
      }
    }
  }

  const declared = new Set(), free = [], viaUI = new Set(), reassigned = new Set();
  for (let k = 0; k < tokens.length; k++) {
    const j = tokens[k];
    if (j.type !== "ident" || KEYWORDS.has(j.text)) continue;
    const p = before(k), s = after(k);
    if (p && (p.text === "." || p.text === "?.")) {
      if (p.text === "." && rank.get(k) >= 2 && tokens[sig[rank.get(k) - 2]].text === "UI") viaUI.add(j.text);
      continue;
    }
    if (s && s.text === ":" && p && (p.text === "{" || p.text === ",")) continue;   // object key
    const isDecl = p && ["const", "let", "var", "function", "class"].includes(p.text);
    // `...` for the rest parameter: `(...args) => ...`
    const isParam = inParams.has(k) && p && ["(", ",", "{", "[", "..."].includes(p.text) &&
      s && [",", ")", "=", "}", "]"].includes(s.text);
    const bareArrow = s && s.text === "=>" && (!p || ![")", ".", "?."].includes(p.text));
    const isPattern = inPattern.has(k);
    if (isDecl || isParam || bareArrow || isPattern) { declared.add(j.text); continue; }
    if (s && ["=", "+=", "-=", "++", "--"].includes(s.text)) reassigned.add(j.text);
    free.push({ name: j.text, line: src.slice(0, j.start).split("\n").length });
  }

  // The borrowing header: `const { a, b } = UI;`
  const borrowMatch = src.match(/const \{([^}]*)\} = UI;/);
  const borrowed = new Set(borrowMatch ? borrowMatch[1].split(",").map(x => x.trim()).filter(Boolean) : []);

  /* What the file exposes: the core's `return {...}`, or the Object.assign
     of the others. We read the declared list, not the definitions: a name defined
     but missing from the list is exactly the mistake we are looking for. */
  const exposeMatch = src.match(/Object\.assign\(UI, \{([\s\S]*?)\}\);/) || src.match(/  return \{([\s\S]*?)\n  \};/);
  const exposed = new Set(exposeMatch ? exposeMatch[1].split(",").map(x => x.trim()).filter(Boolean) : []);

  info[f] = { src, declared, free, borrowed, exposed, viaUI, reassigned };
}

const core = info["js/ui-core.js"];

/* 1. NO UNKNOWN FREE NAME.
   A name that is neither declared locally, nor borrowed from the core, nor a
   site global is a call that will throw on the first click. */
{
  const unknown = [];
  for (const f of FILES) {
    const { declared, free, borrowed } = info[f];
    const seen = new Set();
    for (const { name, line } of free) {
      if (seen.has(name) || declared.has(name) || borrowed.has(name) || GLOBALS.has(name)) continue;
      seen.add(name);
      unknown.push(f + ":" + line + " " + name);
    }
  }
  check("no file calls a name it neither owns nor borrows",
    unknown.length === 0, unknown.join(", "));
}

/* 2. EVERYTHING READ THROUGH UI IS ACTUALLY SET ON UI.
   `UI.renderHistory()` on a name nobody exposes only breaks on click. */
{
  const allExposed = new Set();
  for (const f of FILES) for (const n of info[f].exposed) allExposed.add(n);
  const orphans = [];
  for (const f of FILES)
    for (const n of info[f].viaUI)
      if (!allExposed.has(n)) orphans.push(f + " reads UI." + n);
  check("everything read on UI is exposed by a file",
    orphans.length === 0, orphans.join(", "));
}

/* 3. THE SILENT MISTAKE: borrowing a `let` from the core.
   Destructuring binds a value. Borrowing a variable that the core
   later reassigns freezes the borrower on the value at load time, and nothing
   warns. Shared state must be an object mutated in place. */
{
  const coreMutables = new Set(
    [...core.src.matchAll(/^  (?:let|var) ([\w$]+)\s*=/gm)].map(m => m[1]));
  const faults = [];
  for (const f of FILES) {
    if (f === "js/ui-core.js") continue;
    for (const n of info[f].borrowed) if (coreMutables.has(n)) faults.push(f + " borrows the let " + n);
  }
  check("no file borrows a reassignable variable from the core",
    faults.length === 0, faults.join(", "));

  // The noisy counterpart: reassigning a borrowed name throws in strict mode.
  const reassignFaults = [];
  for (const f of FILES) {
    if (f === "js/ui-core.js") continue;
    for (const n of info[f].reassigned) if (info[f].borrowed.has(n)) reassignFaults.push(f + " reassigns " + n);
  }
  check("no file reassigns a borrowed name", reassignFaults.length === 0, reassignFaults.join(", "));

  /* Navigation state, for its part, is a SHARED object and must stay so: that is
     precisely the shape that fixed the mistake above. */
  check("navigation state is a shared object, not variables",
    core.src.includes('const nav = { screenName: "dashboard" }'));
}

/* 4. THE CORE STAYS A CORE.
   It loads first, so it cannot borrow anything. And it must not know
   any screen in particular: when it redraws one, it goes through
   UI, resolved at call time. */
{
  check("the core borrows nothing, it loads first", core.borrowed.size === 0);
  check("the core defines UI", core.src.includes("const UI = (() => {"));
  check("the other files extend UI without redefining it",
    FILES.slice(1).every(f => !info[f].src.includes("const UI =")));
  /* The core only mentions a screen through UI, never as a direct call. We look at the
     FREE names collected by the lexer, not the raw source: the header of this very
     file explains the rule by writing renderHistory(), and a
     text search would be fooled by its own comment. */
  const screens = ["renderDashboard", "renderHistory", "renderTuning", "renderParameters", "renderConverter"];
  const direct = screens.filter(n => core.free.some(x => x.name === n));
  check("the core calls no screen directly", direct.length === 0, direct.join(", "));
}

/* 5. THE THREE FILE LISTS STAY IN AGREEMENT.
   The page, the service worker and the boot harness declare the same list
   in three places. Forgetting one gives three different failures: blank screen,
   broken offline app, or a test that passes while the site is dead.
   index.html against sw.js is already checked in data.test.mjs; the
   harness was missing, the one whose failure is the most misleading. */
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const boot = readFileSync(join(ROOT, "tools/boot.test.mjs"), "utf8");
  // Without the ?v=: the version is part of the URL, not of the file name.
  const inPage = [...html.matchAll(/<script\b[^>]*src="(js\/[^"?]+)/g)].map(m => m[1]);
  const missing = inPage.filter(s => !boot.includes('"' + s + '"'));
  check("the boot harness loads every script of the page",
    missing.length === 0, missing.join(", "));
  const ghosts = FILES.filter(f => !inPage.includes(f));
  check("and every interface file is actually in the page",
    ghosts.length === 0, ghosts.join(", "));
}

/* 6. SIZE, SINCE IT WAS THE REASON FOR THE SPLIT.
   A generous cap: it is not there to impose a style, only so that
   we notice the day a file turns back into a catch-all. */
{
  const oversized = FILES.filter(f => info[f].src.split("\n").length > 1200);
  check("no interface file goes back above 1200 lines",
    oversized.length === 0, oversized.map(f => f + " " + info[f].src.split("\n").length).join(", "));
  /* The cap applies to ALL layers since v7.87: data.js was the
     last giant IIFE, 1,417 lines and six jobs, and it escaped the
     check because the check only looked at the interface. */
  const oversizedElsewhere = OTHER_LAYERS.filter(f =>
    readFileSync(join(ROOT, f), "utf8").split("\n").length > 1200);
  check("no other layer exceeds 1200 lines either",
    oversizedElsewhere.length === 0, oversizedElsewhere.join(", "));
}

/* 7. EACH SCREEN WIRES ITS OWN CONTROLS.
   wireApp() in app.js was 401 lines long and set 95 listeners on fields
   it only knew by their id. Each screen now has
   its own cablerX(), and app.js only keeps what belongs to no screen. A
   screen id reappearing in app.js is a regression. */
{
  const app = info["js/app.js"].src;
  const prefixes = ['$("#f-', '$("#q-', '$("#h-', '$("#conv-', '$("#param-', '$("#recette-',
    '$("#cafe-', '$("#pap-', '$("#btn-chrono', '$("#tasse-', '$("#sachet-', '$("#dernieres-'];
  // $$("#f-...") is a DOM READ for redrawing, not wiring: we only
  // look at $( preceded by something other than a dollar.
  const escapeRe = s => s.replace(/[$()]/g, c => "\\" + c);
  const leaks = prefixes.filter(p => new RegExp("(^|[^$])" + escapeRe(p)).test(app));
  check("app.js no longer wires any screen control", leaks.length === 0, leaks.join(" "));
  const wirers = ["wireDashboard", "wireEntry", "wireQuick", "wireHistory", "wireGuide", "wireCatalog"];
  const absent = wirers.filter(c => !FILES.some(f => f !== "js/app.js" && info[f].exposed.has(c)));
  check("each screen exposes its wirer", absent.length === 0, absent.join(", "));
  const notCalled = wirers.filter(c => !app.includes("UI." + c + "()"));
  check("and app.js calls them all", notCalled.length === 0, notCalled.join(", "));
  const lineCount = app.split("\n").length;
  check("app.js stays under 450 lines", lineCount <= 450, String(lineCount));
}

console.log(failures === 0 ? "\nALL PASS" : "\n" + failures + " FAILURE(S)");
process.exit(failures === 0 ? 0 : 1);
