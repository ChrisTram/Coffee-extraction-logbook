/* Gestures tests (v9.22), no browser: R6 pull to sync, R13 the dictated comment.
 *
 *   node tools/gestures.test.mjs
 *
 * Both features are mostly movement and browser APIs (touch events, speech
 * recognition), which the eye and the browser pane check. What is checked
 * here is what can be wrong without anything moving: how the dictated words
 * join what was typed (never wiping it), how they land one word at a time,
 * the pull's rubber, its threshold and its roast, what each sync answer
 * shows, and the wiring that keeps the two in their place (load order, the
 * sheet, the precache, the calm path, the dictionaries). */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = f => readFileSync(join(ROOT, f), "utf8");

let failures = 0;
function check(label, condition, detail) {
  if (!condition) failures += 1;
  console.log(`${condition ? "OK  " : "FAIL"} ${label}${!condition && detail ? ` -> ${detail}` : ""}`);
}

/* The two modules in a scope of their own, on a UI stub: they only touch the
   DOM when wired, so loading them is enough to reach their pure part. */
const stubUI = { $: () => null, $$: () => [], nav: { screenName: "dashboard" }, toast() {}, enableLongPress() {} };
const UI = new Function("UI", read("js/ui-dictate.js") + "\n" + read("js/ui-pull.js") + "\nreturn UI;")(stubUI);
const { mergeDictation: merge, revealStep, pullTravel, pullPose, pullOutcome, PULL_SCREENS } = UI;

// The French templates and the English halves, as the page loads them.
const { I18N_FR, I18N_EN } = new Function(read("js/i18n.fr.js") + "\n" + read("js/i18n.fr2.js") + "\n" + read("js/i18n.en.js") +
  "\nreturn { I18N_FR, I18N_EN };")();

/* ---------- R13: joining the dictated words to what was typed ---------- */
{
  check("an empty field takes the words with a capital", merge("", "ronde et sucrée") === "Ronde et sucrée", merge("", "ronde et sucrée"));
  check("after a full stop: one space and a capital", merge("Belle tasse.", "ronde et sucrée") === "Belle tasse. Ronde et sucrée");
  check("mid sentence: one space, the case as heard", merge("Ronde", "et sucrée") === "Ronde et sucrée");
  check("a proper name heard mid sentence keeps its capital", merge("Comme le", "Bana Cafe") === "Comme le Bana Cafe");
  check("a field that ends with a space gets no second one", merge("Ronde ", "et sucrée") === "Ronde et sucrée");
  check("after a new line: no space, and a capital", merge("Ligne un\n", "deuxième ligne") === "Ligne un\nDeuxième ligne");
  check("after a question or an exclamation: a capital", merge("Trop amer ?", "oui") === "Trop amer ? Oui" &&
    merge("Superbe !", "encore") === "Superbe ! Encore");
  check("a comma heard first sticks to the word before", merge("Ronde", ", sucrée") === "Ronde, sucrée");
  check("spaces inside the dictation fold into one, and none before a comma", merge("", "  ronde   et  ,  sucrée ") === "Ronde et, sucrée");
  check("a sentence that starts inside the dictation takes its capital too", merge("", "ronde. une fin cacao") === "Ronde. Une fin cacao");
  check("the accented first letter is capitalised", merge("", "équilibrée") === "Équilibrée");
  check("nothing heard leaves the field as it was, to the character", merge("Belle  tasse. ", "   ") === "Belle  tasse. " && merge("x", null) === "x");
  const typed = "  Mon texte, tapé  à la main.";
  check("what was typed is always the start of the result, untouched", merge(typed, "et la suite").startsWith(typed) &&
    merge("abc", "def").startsWith("abc") && merge("", "x") === "X");
}

/* ---------- R13: the words land one after the other ---------- */
{
  check("one step adds exactly one word", revealStep("Belle tasse.", "Belle tasse. Ronde et sucrée", 12) === "Belle tasse. Ronde");
  check("the next step adds the next one, with its space", revealStep("Belle tasse. Ronde", "Belle tasse. Ronde et sucrée", 12) === "Belle tasse. Ronde et");
  check("arrived: it stays", revealStep("Ronde", "Ronde", 0) === "Ronde");
  // Walk from the typed text to the heard one, counting the steps.
  const base = "Belle tasse.", target = merge(base, "ronde et sucrée avec une fin cacao");
  let shown = base, steps = 0;
  while (shown !== target && steps < 50) { shown = revealStep(shown, target, base.length); steps++; }
  check("seven words land in seven steps", shown === target && steps === 7, steps + " steps, " + shown);
  // The recognition changes its mind: back to the last word both agree on.
  check("a word that grows is completed where it stands", revealStep("Belle tasse. Ronde et sucrée", "Belle tasse. Ronde et sucrées", 12) === "Belle tasse. Ronde et sucrées");
  check("a replaced word is rewound to its start", revealStep("Ronde et sucrée", "Ronde et salée", 0) === "Ronde et ",
    JSON.stringify(revealStep("Ronde et sucrée", "Ronde et salée", 0)));
  check("a dropped last word just goes", revealStep("Ronde et sucrée", "Ronde et", 0) === "Ronde et");
  check("a rewind never goes into what was typed", revealStep("Typé ronde", "Typé, ronde", 4) === "Typé" &&
    revealStep("abc Xyz", "abc xyz", 3) === "abc ");
  // Whatever the changes of mind, the typed text is never cut.
  const typed = "Déjà écrit";
  const heard = [merge(typed, "un"), merge(typed, "un deux"), merge(typed, "on de"), merge(typed, "un deux trois")];
  let s = typed, cut = false;
  for (const target2 of heard) for (let i = 0; i < 6; i++) { s = revealStep(s, target2, typed.length); if (!s.startsWith(typed)) cut = true; }
  check("through every change of mind the typed text stays whole, and the last words land", !cut && s === heard[3], s);
}

/* ---------- R6: the rubber, the threshold, the roast ---------- */
{
  check("no pull, no travel; a push up is no pull", pullTravel(0) === 0 && pullTravel(-40) === 0);
  const samples = [10, 40, 90, 150, 300, 800, 4000].map(pullTravel);
  check("the bean follows the finger, then less and less", samples.every((v, i) => i === 0 || v > samples[i - 1]) &&
    samples[0] > 9 && pullTravel(400) - pullTravel(300) < pullTravel(100) - pullTravel(0));
  check("and it never goes past its reach", samples.every(v => v < 180), samples.map(Math.round).join(", "));
  check("the threshold comes after a real pull, not a flick (between 70 and 130 px of finger)",
    pullTravel(70) < 72 && pullTravel(130) >= 72, pullTravel(70).toFixed(1) + " / " + pullTravel(130).toFixed(1));
  const half = pullPose(36, false), armed = pullPose(72, false), far = pullPose(140, false), farther = pullPose(170, false);
  check("before the threshold the raw bean stretches, taller and thinner", half.sy > 1.15 && half.sx < 0.95 && !half.armed && half.roast === 0 && half.turn === 0);
  check("at the threshold it is back in shape and armed", armed.armed && armed.sx === 1 && armed.sy === 1 && armed.roast === 0);
  check("past it, it turns and roasts with the pull", far.turn > 0 && far.roast > 0 && farther.turn > far.turn && farther.roast >= far.roast);
  check("the roast is whole before the reach, never more", pullPose(135, false).roast === 1 && pullPose(179, false).roast === 1);
  check("the disc comes down with the finger", half.y === 36 && far.y === 140 && half.show === 1 && pullPose(4, false).show < 1);
  const calm = [pullPose(20, true), pullPose(72, true), pullPose(150, true)];
  check("calm: no stretch, no turn, no travel; a ring fills to the threshold",
    calm.every(p => p.sx === 1 && p.sy === 1 && p.turn === 0 && p.y === calm[0].y) &&
    calm[0].ring > 0 && calm[0].ring < 1 && calm[1].ring === 1 && calm[1].armed && !calm[0].armed);
  check("the four list screens, and not the entry form", PULL_SCREENS.join() === "dashboard,history,coffees,analytics");
}

/* ---------- R6: what each answer shows ---------- */
{
  const t = key => (I18N_FR[key] || {}).fr;
  const looks = new Set(["roasted", "off", "idle", "alert"]);
  const states = ["ok", "offline", "local", "not-configured", "demo", "session-expired", "outdated-version", "error", "server", undefined];
  const bad = states.filter(s => { const o = pullOutcome(s); return !looks.has(o.look) || !t(o.key) || !I18N_EN.T[o.key]; });
  check("every answer has a Q6 look and a line in both languages", bad.length === 0, bad.join(", "));
  check("synced: the roasted bean and « Synchronisé »", pullOutcome("ok").look === "roasted" && t(pullOutcome("ok").key) === "Synchronisé");
  check("offline: grey and crossed out, « Hors ligne »", pullOutcome("offline").look === "off" && /^Hors ligne/.test(t(pullOutcome("offline").key)));
  check("no sync here (file://, no database): « Pas de synchro sur cet appareil »",
    t(pullOutcome("local").key) === "Pas de synchro sur cet appareil" && pullOutcome("not-configured").key === "pull_no_sync" && pullOutcome("local").look === "idle");
  check("a failed sync is reddish and says so", pullOutcome("error").look === "alert" && pullOutcome("error").key === "toast_sync_failed");
  check("an outdated tab is offered the reload", pullOutcome("outdated-version").reload === true);
}

/* ---------- The wiring ---------- */
{
  const html = read("index.html"), sw = read("sw.js"), app = read("js/app.js"), core = read("js/ui-core.js");
  const bean = read("js/ui-sync-bean.js"), pull = read("js/ui-pull.js"), dictate = read("js/ui-dictate.js"), entry = read("js/ui-entry.js");
  const at = s => html.indexOf(s);
  check("the gestures sheet comes right after home.css", at('href="css/gestures.css') > at('href="css/home.css') &&
    /css\/home\.css\?v=[^"]+">\n<link rel="stylesheet" href="css\/gestures\.css\?v=/.test(html));
  check("the dictation loads before the entry form, which borrows it", at('src="js/ui-dictate.js') > 0 && at('src="js/ui-dictate.js') < at('src="js/ui-entry.js'));
  check("the pull loads after the sync bean it draws", at('src="js/ui-pull.js') > at('src="js/ui-sync-bean.js'));
  check("both scripts and the sheet are precached", ["./js/ui-pull.js", "./js/ui-dictate.js", "./css/gestures.css"].every(f => sw.includes('"' + f + '"')));
  check("app.js wires the pull with the other gestures", /UI\.wireScrub\(\);\n\s*UI\.wirePull\(\);/.test(app));
  check("the old dictation left the core", !core.includes("function wireDictation") && !/\bwireDictation,/.test(core));
  check("the entry form hands the live line to the dictation", entry.includes('wireDictation($("#f-dictate"), $("#f-comment"), $("#f-dictate-text"), $("#f-dictate-live"));'));
  check("the live line sits under the comment, announced politely", /<textarea id="f-comment"[^>]*><\/textarea>\n\s*<p class="dictate-live" id="f-dictate-live" aria-live="polite" hidden><\/p>/.test(html) &&
    html.includes('aria-describedby="f-dictate-live"'));
  check("the pulled beans are Q6 beans that the global state leaves alone", bean.includes('if ("pull" in b.dataset) return;') &&
    /BEAN_SVG, beanLook/.test(bean) && pull.includes('class="sync-bean" data-pull'));
  check("every touch listener is passive: the scroll is never held", (pull.match(/addEventListener\("touch\w+", on\w+, passive\)/g) || []).length === 4 &&
    !pull.includes("preventDefault"));
  check("the pull goes through the Data panel's door", pull.includes("DATA.synchronize(true)") && pull.includes("DATA.syncPossible()"));
  check("the dictation listens in the site's language, word by word, one utterance", dictate.includes("rec.lang = I18N.locale();") &&
    dictate.includes("rec.interimResults = true;") && dictate.includes("rec.continuous = false;"));
  check("every dictated write fires an input event, for the draft", /field\.value = text;[\s\S]{0,120}field\.dispatchEvent\(new Event\("input", \{ bubbles: true \}\)\)/.test(dictate));
  check("neither plays a sound", ![pull, dictate].some(s => /AudioContext|new Audio|\.play\(|speechSynthesis|vibrate/.test(s)));
}

/* ---------- The sheet ---------- */
{
  const css = read("css/gestures.css");
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let depth = 0, negative = false;
  for (const ch of bare) { if (ch === "{") depth++; if (ch === "}") { depth--; if (depth < 0) negative = true; } }
  check("gestures.css closes what it opens", depth === 0 && !negative, String(depth));
  check("the browser's pull-to-refresh steps aside only where ours runs, and only on touch",
    /@media \(pointer: coarse\) \{\s*html\.pull-on \{ overscroll-behavior-y: contain; \}\s*\}/.test(bare) &&
    (bare.match(/overscroll-behavior/g) || []).length === 1);
  const tiny = [...bare.matchAll(/font-size:\s*([\d.]+)rem/g)].filter(m => Number(m[1]) < 0.75);
  check("no text under 0.75rem", tiny.length === 0, tiny.map(m => m[0]).join(", "));
  check("no colour of its own: tokens, and the Q6 bean's looks", !/#[0-9a-f]{3,8}\b|rgba?\(/i.test(bare));
  check("no green", !/green/i.test(css));
  check("the layer comes from the scale", /z-index: var\(--z-[a-z]+\)/.test(bare) && !/z-index:\s*\d/.test(bare));
  check("a finger gets a full target on the microphone", /@media \(pointer: coarse\) \{\s*\.comm-head \.dictate \{ min-height: 44px;/.test(bare));
  const own = [...bare.matchAll(/@keyframes ([\w-]+)/g)].map(m => m[1]);
  const reduced = bare.slice(bare.indexOf("@media (prefers-reduced-motion: reduce)"));
  check("every movement of the sheet has its calm path", own.length === 4 && reduced.includes(".pull-spin.spinning, .pull-sync.done .pull-spin { animation: none; }") &&
    reduced.includes(".dictate.listening::before { animation: none;") && reduced.includes(".dictate.listening .ico, .dl-dot, .dictate-live { animation: none; }") &&
    reduced.includes(".pull-shape"), own.join(", "));
}

/* ---------- The words ---------- */
{
  const keys = ["pull_offline", "pull_no_sync", "dictate_stop", "dictate_info", "dictate_silence", "dictate_no_mic", "dictate_failed", "dictate_listening"];
  const missing = keys.filter(k => !(I18N_FR[k] && I18N_FR[k].fr) || !I18N_EN.T[k]);
  check("every new line exists in French and in English", missing.length === 0, missing.join(", "));
  check("the live line says « J'écoute… »", I18N_FR.dictate_listening.fr === "J'écoute…");
  check("the bubble says where the voice goes", /service vocal du navigateur/.test(I18N_FR.dictate_info.fr) && /speech service/.test(I18N_EN.T.dictate_info));
  const fr2 = read("js/i18n.fr2.js"), en = read("js/i18n.en.js");
  // At the end, or followed only by the blocks of the groups merged after it (v9.23: moments).
  check("the new keys sit at the end of each dictionary, under the group's comment",
    /\/\/ gestures \(v9\.\d+\)\n(\s+\w+: \{ fr: "[^"]*" \},\n)+(\s*\/\/ [a-z]+ \(v9\.\d+\)\n(\s+\w+: \{ fr: "[^"]*" \},\n)+)*\}\);\s*$/.test(fr2) && en.indexOf("// gestures (v9.") > 0 &&
    en.indexOf("// gestures (v9.") < en.indexOf("\n  UI: {"));
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
