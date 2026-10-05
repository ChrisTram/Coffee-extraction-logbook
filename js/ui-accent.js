/* R3 (v9.24): THE ACCENT OF YOUR COFFEE.
 *
 * The copper of the interface takes the colour of the coffee in progress:
 * more golden for a light roast, deeper brown for a dark one, the site's own
 * copper for a medium one or an unknown roast. Never green: every value below
 * stays in the copper, amber and brown family (hue 15 to 45 degrees), which
 * tools/feel.test.mjs checks value by value.
 *
 * WHICH COFFEE. The coffee of the last cup logged, as long as it is still on
 * the shelf (not archived): it is the one the home's last cup card shows, the
 * one in the cup. When that coffee is archived, or before the first cup, the
 * bag opened most recently among the coffees still on the shelf (by its
 * opening date; a logbook that never fills it falls back on the purchase
 * date). Nothing at all: the theme's own copper.
 *
 * WHICH TOKENS. Only the accent family, per palette (light, Graphite, Nuit):
 * --accent, --accent-strong, --accent-bg, --accent-ring, --accent-glow, and in
 * the light theme the dark card's own accent (the timer and the findings, a
 * dark card on paper, css/feel.css). The background, the text and every other
 * token stay where they are. Each value keeps WCAG AA: accent text holds
 * 4.5:1 on the darkest panel it sits on and on --accent-bg, and the button
 * text (--on-accent, unchanged) holds 4.5:1 on the accent and on its hover;
 * tools/feel.test.mjs computes them all.
 *
 * HOW. The tokens are written inline on <html>, so they win over the theme
 * blocks of base.css, and taken off for a medium roast or when the setting is
 * off. css/feel.css registers them (@property) so they glide for a second when
 * the coffee changes; a theme switch snaps, like the rest of the theme. The
 * last roast is kept per device and applied as soon as this file runs, before
 * the data is read, so the copper does not flash at every opening. The
 * setting (« L'accent suit ton café », Paramètres › Cet appareil) is a device
 * preference in localStorage, never synced. */
"use strict";

(() => {

  const { $ } = UI;

  const FOLLOW_KEY = "accent-follows";
  const ROAST_KEY = "accent-roast";
  const GLIDE_MS = 1000;

  /* A roast as the coffee sheet stores it (Claire, Medium, Foncée), or as an
     import may bring it (dark, light, đậm...). Dark wins over light: a
     « medium foncé » is a dark one. */
  function roastLevel(roast) {
    const t = String(roast || "").toLowerCase();
    if (/fonc|dark|đậm|brun/.test(t)) return "dark";
    if (/clair|light|sáng|blond/.test(t)) return "light";
    if (/medium|moyen|vừa/.test(t)) return "medium";
    return "";
  }

  // The coffee whose colour the interface takes (the rule above). Pure.
  function accentCoffee(coffees, extractions, purchases) {
    const byId = new Map((coffees || []).map(c => [c.id, c]));
    const onShelf = c => !!c && Number(c.active) !== 0;
    let last = null;
    (extractions || []).forEach(e => { if (!last || String(e.date_time || "") > String(last.date_time || "")) last = e; });
    if (last && onShelf(byId.get(last.coffee_id))) return byId.get(last.coffee_id);
    const bags = (purchases || []).filter(p => onShelf(byId.get(p.coffee_id)));
    const opened = bags.filter(p => p.opened_date);
    const pool = opened.length ? opened : bags;
    const key = p => String((opened.length ? p.opened_date : p.purchase_date) || "");
    const bag = pool.reduce((best, p) => (!best || key(p) > key(best) ? p : best), null);
    return bag ? byId.get(bag.coffee_id) : null;
  }

  /* The accent family per palette and roast. Medium is absent on purpose: it
     is the theme's own copper (base.css), never copied here. Light theme:
     the accent cannot get lighter, cream text has to stay readable on it, so
     a light roast turns golden at the same depth; dark palettes: the accent
     is a light colour on near black, so a dark roast deepens towards toffee
     without dropping under 4.5:1 on --panel-3. */
  const ACCENTS = {
    light: {
      light: { accent: "#87570f", strong: "#7a4e0c", bg: "#f3e6cc", ring: "rgba(135, 87, 15, 0.35)", glow: "rgba(135, 87, 15, 0.10)",
        card: { accent: "#ecc888", strong: "#f5dcae", bg: "rgba(236, 200, 136, 0.16)" } },
      dark: { accent: "#6f3b20", strong: "#62331b", bg: "#efdfd3", ring: "rgba(111, 59, 32, 0.35)", glow: "rgba(111, 59, 32, 0.10)",
        card: { accent: "#d2a07c", strong: "#e4bb9a", bg: "rgba(210, 160, 124, 0.16)" } },
    },
    graphite: {
      light: { accent: "#f3c977", strong: "#f8dca2", bg: "rgba(243, 201, 119, 0.12)", ring: "#f3c977", glow: "rgba(243, 201, 119, 0.16)" },
      dark: { accent: "#cc8f5c", strong: "#dfa979", bg: "rgba(204, 143, 92, 0.13)", ring: "#cc8f5c", glow: "rgba(204, 143, 92, 0.16)" },
    },
    night: {
      light: { accent: "#f0b766", strong: "#f7cb8c", bg: "rgba(240, 183, 102, 0.13)", ring: "#f0b766", glow: "rgba(240, 183, 102, 0.16)" },
      dark: { accent: "#d89270", strong: "#e8aa88", bg: "rgba(216, 146, 112, 0.14)", ring: "#d89270", glow: "rgba(216, 146, 112, 0.16)" },
    },
  };
  // Every property this file may write, so that taking them off forgets none.
  const TOKEN_NAMES = ["--accent", "--accent-strong", "--accent-bg", "--accent-ring", "--accent-glow",
    "--card-dark-accent", "--card-dark-accent-strong", "--card-dark-accent-bg"];

  /* The tokens of a roast level in a palette (light, graphite, night), as
     { "--accent": "#...", ... }; null for medium, an unknown roast or an
     unknown palette: the theme keeps its own copper. Pure. */
  function accentTokens(level, palette) {
    const set = ACCENTS[palette] && ACCENTS[palette][level];
    if (!set) return null;
    const out = { "--accent": set.accent, "--accent-strong": set.strong, "--accent-bg": set.bg,
      "--accent-ring": set.ring, "--accent-glow": set.glow };
    if (set.card) Object.assign(out, { "--card-dark-accent": set.card.accent,
      "--card-dark-accent-strong": set.card.strong, "--card-dark-accent-bg": set.card.bg });
    return out;
  }

  // ---------- On the page ----------

  const root = () => document.documentElement;
  const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hidden = () => document.visibilityState === "hidden";
  function paletteNow() {
    const r = root();
    if (!r || typeof r.getAttribute !== "function") return "graphite";
    if (r.getAttribute("data-theme") !== "dark") return "light";
    return r.getAttribute("data-palette") === "night" ? "night" : "graphite";
  }

  // Default ON: only an explicit « 0 » turns it off.
  function accentFollows() {
    try { return localStorage.getItem(FOLLOW_KEY) !== "0"; } catch (e) { return true; }
  }

  let shown = "";   // the level whose colours are on the page now ("" = the theme's copper)
  let saved = null;
  let glideTimer = null;

  // The colours of a level in the current palette, on <html>; none for "".
  function writeTokens(level) {
    const r = root();
    if (!r || !r.style) return;
    // A tilted card wears a copy of the old colours: it goes back to its own (js/ui-feel.js).
    if (UI.flattenTilt) UI.flattenTilt();
    const tokens = accentTokens(level, paletteNow());
    TOKEN_NAMES.forEach(name => {
      if (tokens && tokens[name]) r.style.setProperty(name, tokens[name]);
      else r.style.removeProperty(name);
    });
  }

  /* Moves the page to a level. `glide`: the colours slide for a second
     (css/feel.css, html.accent-glide); without it, or with reduced motion or
     a hidden page, they change at once. */
  function paint(level, glide) {
    if (level === shown) return;
    const r = root();
    const moving = glide && !calm() && !hidden() && !!(r && r.classList);
    if (moving) {
      r.classList.add("accent-glide");
      clearTimeout(glideTimer);
      glideTimer = setTimeout(() => { r.classList.remove("accent-glide"); afterGlide(); }, GLIDE_MS + 100);
    }
    writeTokens(level);
    shown = level;
    if (!moving) afterGlide();
  }

  /* The charts read the accent when they are drawn: once the colour has
     settled, the Analyses page redraws them, only if it is the open screen. */
  function afterGlide() {
    if (typeof Chart === "undefined" || !UI.nav || UI.nav.screenName !== "analytics") return;
    if (typeof CHARTS !== "undefined" && CHARTS.applyDefaults) CHARTS.applyDefaults();
    UI.renderCurrentScreen(true);
  }

  // The level the data asks for now: the coffee in progress, its roast.
  function wantedLevel() {
    if (!accentFollows() || typeof DATA === "undefined" || !DATA.state) return "";
    const coffee = accentCoffee(DATA.state.coffees, DATA.state.extractions, DATA.state.purchases);
    return coffee ? roastLevel(coffee.roast) : "";
  }

  /* After the data has loaded and after every change: a new cup of another
     coffee, a coffee edited or archived, a sync. Only a different level moves
     anything; it is remembered for the next opening. */
  function refreshAccent() {
    const level = wantedLevel();
    if (level !== saved) {
      saved = level;
      try { localStorage.setItem(ROAST_KEY, level); } catch (e) { /* the next opening starts from copper */ }
    }
    paint(level === "medium" ? "" : level, true);
  }

  /* The theme button changes data-theme and data-palette: the same level
     takes the new palette's values at once, before the next frame. The
     charts are applyTheme's business. */
  function watchTheme() {
    if (typeof MutationObserver !== "function" || !root()) return;
    new MutationObserver(() => writeTokens(shown))
      .observe(root(), { attributes: true, attributeFilter: ["data-theme", "data-palette"] });
  }

  // The setting, in Paramètres › Cet appareil.
  function wireAccent() {
    const box = $("#param-accent");
    if (box) {
      box.checked = accentFollows();
      box.addEventListener("change", () => {
        try { localStorage.setItem(FOLLOW_KEY, box.checked ? "1" : "0"); } catch (e) { /* this visit only */ }
        refreshAccent();
      });
    }
    if (typeof DATA !== "undefined" && DATA.subscribe) DATA.subscribe(refreshAccent);
  }

  /* As soon as the file runs: the last roast seen on this device, so the page
     opens in the right copper rather than gliding into it at every visit. */
  (() => {
    let cached = "";
    try { cached = accentFollows() ? localStorage.getItem(ROAST_KEY) || "" : ""; } catch (e) { cached = ""; }
    if (cached === "light" || cached === "dark") paint(cached, false);
    watchTheme();
  })();

  Object.assign(UI, {
    roastLevel, accentCoffee, accentTokens, accentFollows, refreshAccent, wireAccent,
  });
})();
