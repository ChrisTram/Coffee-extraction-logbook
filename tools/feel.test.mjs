/* Tests of the feel group (v9.24): R3 the accent of your coffee, R8 the
 * little springs.
 *
 *   node tools/feel.test.mjs
 *
 * The pure parts of js/ui-accent.js (which coffee, which roast, which
 * colours) and js/ui-feel.js (how far a card leans) run here with a stub of
 * the interface core. Every accent colour is checked against the real
 * surfaces of base.css, the way WCAG computes contrast, in the three
 * palettes. Then the accent is driven on a fake <html>: the early paint from
 * the remembered roast, the glide, the setting, the calm path. Last, the page
 * and the sheet are read for what the work promised. boot.test.mjs runs the
 * site for real. */

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

/* ---------- A fake page, enough for the two files ---------- */

function fakeRoot(theme, palette) {
  const props = new Map(), classes = new Set();
  const attrs = { "data-theme": theme, "data-palette": palette };
  return {
    props, classes, attrs,
    style: { setProperty: (k, v) => props.set(k, v), removeProperty: k => props.delete(k) },
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
    getAttribute: k => (k in attrs ? attrs[k] : null),
  };
}
function fakeStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

/* Loads js/ui-accent.js and js/ui-feel.js on a fresh page. `observers` keeps
   the MutationObserver callbacks, to play a theme switch by hand. */
function load(opts) {
  const o = opts || {};
  const root = fakeRoot(o.theme || "light", o.palette || "graphite");
  const storage = fakeStorage(o.storage);
  const subscribers = [], observers = [], timers = [];
  const DATA = { state: o.state || { coffees: [], extractions: [], purchases: [] }, subscribe: fn => subscribers.push(fn) };
  const box = { checked: false, listeners: {}, addEventListener(k, fn) { this.listeners[k] = fn; } };
  const UI = { $: sel => (sel === "#param-accent" ? box : null), nav: { screenName: "dashboard" }, renderCurrentScreen() {} };
  const document = { documentElement: root, visibilityState: o.hidden ? "hidden" : "visible", addEventListener() {} };
  const matchMedia = q => ({ matches: q.includes("reduce") ? !!o.calm : true });
  function MutationObserver(fn) { observers.push(fn); return { observe() {} }; }
  const setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  const clearTimeout = () => {};
  for (const f of ["js/ui-accent.js", "js/ui-feel.js"]) {
    new Function("UI", "DATA", "document", "window", "localStorage", "matchMedia", "MutationObserver", "setTimeout", "clearTimeout",
      "getComputedStyle", "requestAnimationFrame", read(f))(
      UI, DATA, document, { addEventListener() {} }, storage, matchMedia, MutationObserver, setTimeout, clearTimeout,
      () => ({}), fn => fn());
  }
  return { UI, DATA, root, storage, subscribers, observers, timers, box };
}

const { UI } = load();

/* ---------- R3: which roast ---------- */
{
  const r = UI.roastLevel;
  check("the three roasts of the coffee sheet", r("Claire") === "light" && r("Medium") === "medium" && r("Foncée") === "dark");
  check("an import's words too, dark winning over light", r("dark") === "dark" && r("Light roast") === "light" && r("rang đậm") === "dark" &&
    r("Medium foncé") === "dark" && r("medium-light") === "light");
  check("no roast, or an unknown one, is no level", r("") === "" && r(undefined) === "" && r("Espresso") === "");
}

/* ---------- R3: which coffee ---------- */
{
  const coffees = [
    { id: "a", name: "Ancien", roast: "Foncée", active: 0 },
    { id: "b", name: "Bleu", roast: "Claire", active: 1 },
    { id: "c", name: "Cuivre", roast: "Medium", active: 1 },
  ];
  const cup = (coffee, when) => ({ coffee_id: coffee, date_time: when });
  const pick = (ext, bags) => (UI.accentCoffee(coffees, ext, bags) || {}).id || null;
  check("the coffee of the last cup logged, whatever the order of the table",
    pick([cup("c", "2026-10-03T08:00"), cup("b", "2026-10-04T07:30"), cup("c", "2026-10-01T09:00")], []) === "b");
  const bags = [
    { coffee_id: "c", purchase_date: "2026-09-01", opened_date: "2026-09-02" },
    { coffee_id: "b", purchase_date: "2026-09-20", opened_date: "" },
    { coffee_id: "a", purchase_date: "2026-09-25", opened_date: "2026-09-26" },
  ];
  check("an archived last coffee gives way to the bag opened last on the shelf", pick([cup("a", "2026-10-04T07:00")], bags) === "c");
  check("before the first cup, the same open bag", pick([], bags) === "c");
  check("a logbook that never fills the opening date falls back on the purchase",
    pick([], bags.map(b => ({ ...b, opened_date: "" }))) === "b");
  check("nothing at all: no coffee, the theme's copper", pick([], []) === null && UI.accentCoffee(undefined, undefined, undefined) === null);
}

/* ---------- R3: the colours, and their contrast in the three palettes ---------- */
const css = read("css/base.css");
const block = sel => { const i = css.indexOf(sel + " {"); return css.slice(i, css.indexOf("\n}", i)); };
const tokenOf = (src, name) => (src.match(new RegExp("--" + name + ":\\s*([^;]+);")) || [])[1];
const PALETTES = {
  light: block('html[data-theme="light"]'),
  graphite: block('html[data-theme="dark"]'),
  night: block('html[data-theme="dark"][data-palette="night"]'),
};
// Nuit only redefines what changes: the rest comes from the Graphite block.
const token = (pal, name) => tokenOf(PALETTES[pal], name) || tokenOf(PALETTES.graphite, name);

const rgb = c => {
  const s = String(c).trim();
  if (s.startsWith("#")) return { r: parseInt(s.slice(1, 3), 16), g: parseInt(s.slice(3, 5), 16), b: parseInt(s.slice(5, 7), 16), a: 1 };
  const p = s.match(/rgba?\(([^)]+)\)/)[1].split(",").map(Number);
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
};
const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const hsl = c => {
  const [r, g, b] = [c.r, c.g, c.b].map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, L = (mx + mn) / 2;
  if (!d) return { h: 0, s: 0, l: L };
  const s = L > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l: L };
};

{
  check("a medium roast keeps the theme's own copper", UI.accentTokens("medium", "light") === null && UI.accentTokens("", "night") === null);
  check("an unknown palette changes nothing", UI.accentTokens("dark", "espresso") === null);
  const light = UI.accentTokens("light", "light"), graph = UI.accentTokens("dark", "graphite");
  check("only the accent family is written, the dark card's copper in the light theme only",
    Object.keys(light).every(k => /^--(card-dark-)?accent/.test(k)) && Object.keys(light).length === 8 &&
    Object.keys(graph).length === 5 && !Object.keys(graph).some(k => k.startsWith("--card-dark")));

  const bad = [], family = [], order = [];
  for (const pal of ["light", "graphite", "night"]) {
    const panel = rgb(token(pal, "panel")), onAccent = rgb(token(pal, "on-accent"));
    const surfaces = ["bg", "panel", "panel-2", "panel-3", "rail"].map(n => [n, rgb(token(pal, n))]);
    const sets = { medium: { "--accent": token(pal, "accent"), "--accent-strong": token(pal, "accent-strong"), "--accent-bg": token(pal, "accent-bg") } };
    for (const lv of ["light", "dark"]) sets[lv] = UI.accentTokens(lv, pal);
    for (const [lv, t] of Object.entries(sets)) {
      const acc = rgb(t["--accent"]), strong = rgb(t["--accent-strong"]);
      const all = surfaces.concat([["accent-bg", over(rgb(t["--accent-bg"]), panel)]]);
      for (const [n, s] of all) {
        if (ratio(acc, s) < 4.5) bad.push(`${pal}/${lv} accent on ${n} ${ratio(acc, s).toFixed(2)}`);
        if (ratio(strong, s) < 4.5) bad.push(`${pal}/${lv} strong on ${n} ${ratio(strong, s).toFixed(2)}`);
      }
      if (ratio(onAccent, acc) < 4.5) bad.push(`${pal}/${lv} button text ${ratio(onAccent, acc).toFixed(2)}`);
      if (ratio(onAccent, strong) < 4.5) bad.push(`${pal}/${lv} button text on hover ${ratio(onAccent, strong).toFixed(2)}`);
      for (const c of Object.values(t)) {
        const { h, s, l } = hsl(rgb(c));
        if (s > 0.15 && l > 0.15 && l < 0.85 && !(h >= 15 && h <= 45)) family.push(`${pal}/${lv} ${c} hue ${Math.round(h)}`);
      }
    }
    // Lighter and more golden for a light roast, deeper for a dark one.
    const L = lv => lum(rgb(sets[lv]["--accent"])), H = lv => hsl(rgb(sets[lv]["--accent"])).h;
    if (!(H("light") > H("medium") && H("light") > H("dark"))) order.push(pal + ": the light roast is not the most golden");
    if (!(L("dark") < L("medium") && L("dark") < L("light"))) order.push(pal + ": the dark roast is not the deepest");
  }
  check("every accent text holds 4.5:1 on the bg, the rail, the three panels and its own wash, in the three palettes, at every roast",
    bad.length === 0, bad.join(" | "));
  check("every colour stays in the copper, amber and brown family (hue 15 to 45, never green)", family.length === 0, family.join(" | "));
  check("light is the most golden, dark the deepest, in every palette", order.length === 0, order.join(" | "));

  // The dark card of the light theme: its copper on espresso, and the text on that copper.
  const cardBg = rgb(tokenOf(PALETTES.light, "card-dark-bg"));
  const cardFails = [];
  for (const lv of ["light", "dark"]) {
    const t = UI.accentTokens(lv, "light");
    const acc = rgb(t["--card-dark-accent"]);
    const subs = [cardBg, over(rgb("rgba(246, 239, 229, 0.06)"), cardBg), over(rgb("rgba(246, 239, 229, 0.1)"), cardBg), over(rgb(t["--card-dark-accent-bg"]), cardBg)];
    subs.forEach((s, i) => { if (ratio(acc, s) < 4.5) cardFails.push(lv + " on sub-surface " + i + " " + ratio(acc, s).toFixed(2)); });
    if (ratio(cardBg, acc) < 4.5) cardFails.push(lv + " button text " + ratio(cardBg, acc).toFixed(2));
  }
  const base = rgb("#e0bd97");
  if (ratio(cardBg, base) < 4.5) cardFails.push("medium button text " + ratio(cardBg, base).toFixed(2));
  check("the timer card of the light theme: its copper reads on espresso, and its button text reads on its copper", cardFails.length === 0, cardFails.join(" | "));
}

/* ---------- R3: on the page ---------- */
{
  const state = {
    coffees: [{ id: "x", roast: "Foncée", active: 1 }, { id: "y", roast: "Claire", active: 1 }, { id: "z", roast: "Medium", active: 1 }],
    extractions: [{ coffee_id: "x", date_time: "2026-10-04T08:00" }],
    purchases: [],
  };
  const page = load({ theme: "dark", palette: "graphite", state });
  check("nothing is painted before the data when this device has no memory", page.root.props.size === 0);
  page.UI.wireAccent();
  check("the setting is on by default", page.box.checked === true && page.subscribers.length === 1);
  page.UI.refreshAccent();
  const dark = page.UI.accentTokens("dark", "graphite");
  check("a dark roast's colours land on <html>", page.root.props.get("--accent") === dark["--accent"] && page.root.props.get("--accent-glow") === dark["--accent-glow"]);
  check("and glide for a second", page.root.classes.has("accent-glide") && page.timers.some(t => t.ms >= 1000 && t.ms <= 1200));
  check("the roast is remembered for the next opening", page.storage.getItem("accent-roast") === "dark");
  page.timers.forEach(t => t.fn());
  check("the glide class leaves once the colours have settled", !page.root.classes.has("accent-glide"));

  // The theme button: the same roast in the new palette, at once.
  page.root.attrs["data-palette"] = "night";
  page.observers.forEach(fn => fn());
  check("a theme switch takes the new palette's values without a glide",
    page.root.props.get("--accent") === page.UI.accentTokens("dark", "night")["--accent"] && !page.root.classes.has("accent-glide"));

  /* An ordinary re-render, a sync, or another cup of the same roast: nothing
     glides, nothing is written. The glide restyles the whole page for a
     second, so it must only run when the level really changes. */
  const timersBefore = page.timers.length, written = page.storage.m.size;
  state.extractions.push({ coffee_id: "x", date_time: "2026-10-04T09:00" });
  page.subscribers.forEach(fn => fn());
  page.subscribers.forEach(fn => fn("sync"));
  check("the same roast again never glides nor writes", !page.root.classes.has("accent-glide") && page.timers.length === timersBefore &&
    page.storage.m.size === written && page.root.props.get("--accent") === page.UI.accentTokens("dark", "night")["--accent"]);

  // A new cup of a medium coffee: back to the theme's copper.
  state.extractions.push({ coffee_id: "z", date_time: "2026-10-04T10:00" });
  page.subscribers[0]();
  check("a medium coffee takes every colour off, the theme speaks again", page.root.props.size === 0 && page.storage.getItem("accent-roast") === "medium");

  // The setting off: nothing, whatever the coffee.
  state.extractions.push({ coffee_id: "y", date_time: "2026-10-04T11:00" });
  page.box.checked = false;
  page.box.listeners.change();
  check("the setting off keeps the theme's copper and is a device preference", page.root.props.size === 0 && page.storage.getItem("accent-follows") === "0");
  page.box.checked = true;
  page.box.listeners.change();
  check("back on, the light roast arrives", page.root.props.get("--accent") === page.UI.accentTokens("light", "night")["--accent"]);

  // The next opening: the remembered roast is painted as the file runs, with no glide.
  const next = load({ theme: "light", storage: { "accent-roast": "light" } });
  check("the remembered roast is painted before the data, without a glide",
    next.root.props.get("--accent") === next.UI.accentTokens("light", "light")["--accent"] &&
    next.root.props.get("--card-dark-accent") === next.UI.accentTokens("light", "light")["--card-dark-accent"] && !next.root.classes.has("accent-glide"));
  const off = load({ theme: "light", storage: { "accent-roast": "light", "accent-follows": "0" } });
  check("but not when the setting is off", off.root.props.size === 0);

  const calm = load({ theme: "light", calm: true, state });
  calm.UI.refreshAccent();
  check("with reduced motion the colour changes at once, no glide", calm.root.props.size > 0 && !calm.root.classes.has("accent-glide"));
  const hidden = load({ theme: "light", hidden: true, state });
  hidden.UI.refreshAccent();
  check("and on a hidden page too", hidden.root.props.size > 0 && !hidden.root.classes.has("accent-glide"));
}

/* ---------- R8: how far a card leans ---------- */
{
  const lim = UI.tiltLimit;
  check("a small card leans its full 3 degrees", lim(310, 330) === 3 && lim(120, 160) === 3);
  check("a bigger one less, never under half", lim(584, 393) < 3 && lim(584, 393) > 1.5 && lim(690, 550) >= 1.5);
  check("a large panel does not lean at all", lim(967, 400) === 0 && lim(584, 1032) === 0 && lim(0, 0) === 0);
  const a = UI.tiltAngles;
  check("the centre is flat", a(0.5, 0.5, 3).rx === 0 && a(0.5, 0.5, 3).ry === 0);
  check("the side under the pointer goes down, up to the limit", a(1, 0.5, 3).ry === 3 && a(0, 0.5, 3).ry === -3 && a(0.5, 0, 3).rx === 3 && a(0.5, 1, 3).rx === -3);
  check("a pointer past the edge stays at the limit", a(1.4, -0.3, 2).ry === 2 && a(1.4, -0.3, 2).rx === 2);
}

/* ---------- The page, the sheet, the languages ---------- */
{
  const html = read("index.html"), feel = read("css/feel.css"), sw = read("sw.js");
  const noComments = feel.replace(/\/\*[\s\S]*?\*\//g, "");
  let depth = 0, negative = false;
  for (const ch of noComments) { if (ch === "{") depth++; if (ch === "}") { depth--; if (depth < 0) negative = true; } }
  check("feel.css closes what it opens", depth === 0 && !negative, String(depth));
  /* LAST of all the sheets, whoever comes in between: its button
     transitions restate the sheets' own and must win at equal specificity. */
  const sheets = [...html.matchAll(/<link rel="stylesheet" href="css\/([\w-]+)\.css\?v=/g)].map(m => m[1]);
  check("the sheet is loaded last of all, and precached", sheets[sheets.length - 1] === "feel" && sheets.includes("home") &&
    sw.includes('"./css/feel.css"'), sheets.join(", "));
  check("the two files load right after the core, and are precached",
    /ui-core\.js\?v=[\d.]+"><\/script>\n<script defer src="js\/ui-accent\.js\?v=[\d.]+"><\/script>\n<script defer src="js\/ui-feel\.js/.test(html) &&
    sw.includes('"./js/ui-accent.js"') && sw.includes('"./js/ui-feel.js"'));
  const device = html.slice(html.indexOf('id="ps-device"'), html.indexOf("</article>", html.indexOf('id="ps-device"')));
  check("the setting is a switch in « Cet appareil », on by default",
    /<span class="toggle"><input type="checkbox" id="param-accent" checked><i aria-hidden="true"><\/i><\/span> L'accent suit ton café/.test(device));
  check("the device pane is all switches now", (device.match(/class="toggle"/g) || []).length === 3);

  // @property: the accent family is registered as colours, its rest values are base.css's and screens.css's.
  const reg = name => (noComments.match(new RegExp("@property --" + name + " \\{[^}]*initial-value: ([^;]+);")) || [])[1];
  check("the accent family is registered, so that it glides",
    ["accent", "accent-strong", "accent-bg", "accent-ring", "accent-glow"].every(n => reg(n) === tokenOf(PALETTES.light, n)));
  const screens = read("css/screens.css"), cardDark = screens.slice(screens.indexOf(".card-dark {"), screens.indexOf("}", screens.indexOf(".card-dark {")));
  check("the dark card's copper at rest is screens.css's",
    reg("card-dark-accent") === tokenOf(cardDark, "accent") && reg("card-dark-accent-strong") === tokenOf(cardDark, "accent-strong") &&
    reg("card-dark-accent-bg") === tokenOf(cardDark, "accent-bg"));
  const glide = (noComments.match(/html\.accent-glide \{[^}]*\}/) || [""])[0];
  check("the glide moves the accent family and nothing else",
    ["--accent ", "--accent-strong", "--accent-bg", "--accent-ring", "--accent-glow", "--card-dark-accent "].every(t => glide.includes(t)) &&
    !/--(bg|panel|ink|text|muted)\b/.test(glide));

  // R8: the springs are on `scale`, the cups keep the native box, the switches are left out.
  check("buttons squish with `scale`, which composes with their own transforms",
    /\.btn:active, \.btn-method:active, \.btn-square-small:active \{ scale: 0\.95; \}/.test(noComments) &&
    !/:active[^{]*\{[^}]*\btransform:/.test(noComments.slice(0, noComments.indexOf("@media (prefers-reduced-motion"))));
  check("each button keeps its own transitions, the spring added at the end",
    noComments.includes(".btn { transition: border-color var(--transition), background var(--transition), transform 120ms, scale") &&
    noComments.includes(".btn-row { transition: all 150ms, scale"));
  check("the checkboxes stay native, the switches are left out", /input\[type="checkbox"\]:not\(\.toggle > input\) \{[^}]*appearance: none/.test(noComments) &&
    !/input\[type="checkbox"\][^{]*\{[^}]*(display: none|opacity: 0;|visibility: hidden)/.test(noComments));
  check("a mixed box is a half cup", /:indeterminate \{ background-size: 100% 50%/.test(noComments));
  // The microphone of the comment (gestures.css, v9.22) keeps its own transitions and springs too.
  const gestures = read("css/gestures.css");
  const micOwn = (gestures.match(/\.comm-head \.dictate \{[^}]*transition: ([^;]+);/) || [])[1];
  check("the comment's microphone squishes, its own transitions kept", !!micOwn &&
    noComments.includes(".comm-head .dictate { transition: " + micOwn + ", scale var(--spring-ms) var(--spring); }") &&
    noComments.includes(".comm-head .dictate:active { scale: 0.93; }"));
  check("the thumb is a bean that rolls half a turn", /\.toggle input:checked \+ i::before, \.toggle input:checked \+ i::after \{ transform: translateX\(18px\) rotate\(180deg\); \}/.test(noComments));
  const calm = noComments.slice(noComments.indexOf("@media (prefers-reduced-motion: reduce)"));
  check("the calm path: no glide, no squish, no roll, no rising cup",
    calm.includes("html.accent-glide { transition: none; }") && /\.btn-row:active[^{]*\{ scale: none; transform: none; \}/.test(calm) &&
    calm.includes("translateX(18px); }") && calm.includes(":checked::before"));
  const tiny = [...noComments.matchAll(/font-size:\s*([\d.]+)rem/g)].filter(m => Number(m[1]) < 0.75);
  check("no text under 0.75rem", tiny.length === 0);

  // The tilt: a computer only, one frame per move, nothing on cards with fields.
  const tilt = read("js/ui-feel.js");
  check("the tilt is for a mouse on a computer, and never with reduced motion",
    tilt.includes('ev.pointerType !== "mouse"') && tilt.includes("(hover: hover) and (pointer: fine)") && tilt.includes("!calm() && finePointer()"));
  check("one animation frame at most per move, nothing while the mouse is still",
    tilt.includes("if (!frame) frame = requestAnimationFrame(step)") && !/setInterval/.test(tilt));
  check("never on a card holding a field or a chart read with the pointer", tilt.includes('querySelector("input, select, textarea, canvas, [data-scrub]")'));
  check("the text never goes through a 3D transform: a card's skin leans, or a jar's drawing, never the card",
    !/\bel\.style\.transform\b/.test(tilt) && tilt.includes('el.style.setProperty("--skin-transform"') && tilt.includes("art.style.transform") &&
    /\.feel-skin-after::after, \.feel-skin-before::before \{[^}]*z-index: -1;[^}]*transform: var\(--skin-transform, none\)/.test(noComments));
  check("a new accent or theme puts a tilted card back on its own colours",
    /function writeTokens[\s\S]{0,200}UI\.flattenTilt\(\)/.test(read("js/ui-accent.js")) && tilt.includes("function flattenTilt() { if (card) leave(true); }"));
  check("the skin only takes a pseudo-element nobody draws", tilt.includes('getComputedStyle(el, "::" + which).content === "none"'));
  check("at rest the card gets its own look back, without a fade, then its transitions",
    /SKIN_PROPS\.filter\(p => p !== "transition"\)\.forEach\(p => el\.style\.setProperty\(p, kept\[p\]\)\);\s*void getComputedStyle\(el\)\.borderTopColor;\s*el\.style\.transition = kept\.transition;/.test(tilt));

  // Storage: every access wrapped.
  const accent = read("js/ui-accent.js");
  const raw = accent.split("\n").filter(l => /localStorage\./.test(l) && !/try \{/.test(l));
  check("every localStorage access is wrapped", raw.length === 0, raw.join(" | "));

  // The two languages.
  const en = new Function(read("js/i18n.en.js") + "\nreturn I18N_EN;")();
  const words = ["L'accent suit ton café", "Le cuivre des boutons prend la couleur de ton café en cours : plus doré pour une torréfaction claire, plus brun pour une foncée."];
  check("the setting's words have their English", words.every(w => en.UI[w] && html.includes(w)), words.filter(w => !en.UI[w]).join(" | "));
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
