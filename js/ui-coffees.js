/* « MES CAFÉS », A PAGE (v9.18, O2 « Tes bocaux, sur l'étagère et dans la
 * saisie »).
 *
 * Until v9.18, Mes cafés was a window of rows to edit, and the entry form
 * chose the coffee in a menu of names, without the stock. Now the bags are
 * the jars of Q8 (js/ui-jar.js), to the gram, in two places:
 *
 *   - the page #screen-coffees: a shelf in three rows, the open bags (the
 *     most advanced first), those to buy again (the end of a bag, Q9, drawn by
 *     js/ui-bag-end.js) and the finished ones. Under three cups the glass
 *     blushes, never green. A jar GROWS into its coffee's sheet (a view
 *     transition: the jar flies to the sheet's jar while the card unfolds
 *     into the window or the side panel), and going back sets it down on the
 *     shelf, where its place stayed marked. Since v9.31 the rows stand one
 *     under the other at every width, under a strip of figures and the frise
 *     of the bags, each open jar at the left of its card (js/ui-shelf.js);
 *   - the entry form: a row of the open bags as small jars above the coffee
 *     menu. A tap chooses; #f-coffee stays the truth that saving, the draft,
 *     the quick entry and the prefills read, and the jars follow it.
 *
 * The coffee and bag forms of the old window live in the page, unchanged
 * (js/ui-catalog.js). Everything the shelf decides (rows, order, the end of a
 * bag) is pure, in js/bags.js. Reduced motion, a hidden page or an engine
 * without view transitions: everything opens and lands at once. */
"use strict";

(() => {

  const { $, $$, fmtDecimal, analyzableExts, average, fallbacks, nav, activateScreen } = UI;
  const escapeHtml = TOOLS.escapeHtml;

  const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hidden = () => typeof document.visibilityState === "string" && document.visibilityState === "hidden";
  // Ids go into selectors: only the safe ones (the logbook's ids all are).
  const safeId = id => typeof id === "string" && /^[\w-]+$/.test(id);

  // ---------- What a jar shows ----------

  /* One coffee as the shelf and the entry read it: its gauge (null when no
     bag size is known), the day of its open bag (0 the opening day) and the
     date of its latest cup. */
  function jarItem(c) {
    const jc = UI.bagDay(c.id);
    let lastCup = "";
    DATA.state.extractions.forEach(e => { if (e.coffee_id === c.id && String(e.date_time) > lastCup) lastCup = String(e.date_time); });
    return { coffee: c, gauge: DATA.bagGauge(c.id, fallbacks.dose), day: jc ? jc.day : null, lastCup };
  }

  /* The average of each coffee over its analysable rated cups, and their
     number: advice, so no botched cup. { avg, n } by coffee id. */
  function ratings() {
    const per = new Map();
    analyzableExts().forEach(e => {
      if (e.score_10 === "") return;
      if (!per.has(e.coffee_id)) per.set(e.coffee_id, []);
      per.get(e.coffee_id).push(Number(e.score_10));
    });
    return new Map([...per].map(([id, list]) => [id, { avg: average(list), n: list.length }]));
  }

  // The day a date_time falls on, short: « 12 sept. ».
  function shortDay(s) {
    const [a, m, j] = String(s || "").slice(0, 10).split("-").map(Number);
    return a && m && j ? new Date(a, m - 1, j).toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" }) : "";
  }

  /* A jar of the shelf. The art carries the jar's data attributes, so a
     change of grams since this device last showed it plays (UI.playJars):
     the level drops after a cup, beans rain in after a new bag.

     v9.31: an open jar stands at the left of its card (js/ui-shelf.js), on
     its bit of plank, its grams under it; its name and average head the
     card. A finished one is a small tile: the jar, its name on two lines,
     its final average and its dates. */
  function jarCard(it, i, rates, done) {
    const c = it.coffee, g = it.gauge;
    const low = !!(g && g.low);
    const jar = { coffeeId: c.id, grams: g ? g.grams : 0, bag: g ? g.bag : 0, low, roast: UI.jarRoast(c), unknown: !g };
    const stats = rates.get(c.id) || { avg: null, n: 0 };
    const score = stats.avg === null ? "·" : fmtDecimal(stats.avg, 1);
    const grams = g ? fmtDecimal(g.grams, 0) + " g" : I18N.t("cf_to_count");
    const label = I18N.t(done ? "cf_jar_done_aria" : "cf_jar_aria", { c: c.name, g: grams, m: score, d: shortDay(it.lastCup) });
    const open = '<button type="button" class="cf-jar' + (low && !done ? " is-low" : "") + (done ? " is-done" : "") + '" data-sheet="' +
      escapeHtml(c.id) + '" style="--i:' + i + '" aria-label="' + escapeHtml(label) + '">' +
      '<span class="cf-art"' + (g && !done ? UI.jarData(jar) : "") + ">" + UI.jarSvg(jar) + "</span>";
    if (done) {
      const d = UI.shelfDoneLines(c, stats);
      return open + '<span class="cf-done-text"><b class="cf-name">' + escapeHtml(c.name) + '</b><span class="cf-done-avg">' + escapeHtml(d.top) + "</span>" +
        (d.span ? '<span class="cf-done-span">' + escapeHtml(d.span) + "</span>" : "") + "</span></button>";
    }
    return UI.shelfOpenCard(it, i, stats, open +
      '<span class="cf-line"><span class="cf-g"' + (g ? ' data-jar-grams="' + escapeHtml(c.id) + '"' : "") + ">" + escapeHtml(grams) + "</span></span></button>");
  }

  // ---------- The shelf ----------

  /* The three rows. A coffee in the middle of its end of bag (a new bag on
     the counter, or just poured with the resume offered) stays in « À
     racheter » until the scene is done, even when its jar is full again. */
  function rows() {
    const r = BAGS.shelves(DATA.state.coffees.map(jarItem));
    const busy = r.open.filter(it => UI.bagEndActive && UI.bagEndActive(it.coffee.id));
    if (busy.length) {
      r.open = r.open.filter(it => !busy.includes(it));
      r.rebuy = busy.concat(r.rebuy);
    }
    return r;
  }

  let shelfHtml = "";
  // Set when the page is arrived on: the next render fills the jars one after the other.
  let arriving = true;

  function renderCoffeeList() {
    const zone = $("#coffees-list");
    if (!zone) return;
    /* M6 (v9.13): an empty logbook says what to do, and the button does it. */
    if (!DATA.state.coffees.length) {
      const html = UI.emptyHint({ drawing: "jar", title: I18N.t("coffees_empty_title"),
        text: I18N.t("coffees_empty_text"), action: I18N.t("coffees_empty_go"), go: "coffee-new", wide: true });
      if (html !== shelfHtml) { zone.innerHTML = html; shelfHtml = html; }
      writeCounts({ open: [], rebuy: [], done: [] });
      return;
    }
    const r = rows(), rates = ratings();
    const row = (key, inner) => '<section class="cf-row cf-row-' + key + '" id="cf-row-' + key + '" aria-labelledby="cf-h-' + key + '">' +
      '<h3 class="cf-row-h" id="cf-h-' + key + '">' + escapeHtml(I18N.t("cf_row_" + key)) + ' <span class="cf-row-n">' + r[key].length + "</span></h3>" + inner + "</section>";
    /* v9.31: the strip at the top (the stock in figures, the bags over
       time), then the three rows one under the other, full width. */
    const frise = UI.shelfFrise();
    let html = '<div class="cf-top' + (frise ? "" : " cf-top-alone") + '">' + UI.shelfSummary(r) + frise + "</div>";
    html += row("open", r.open.length
      ? '<div class="cf-cards" id="cf-open">' + r.open.map((it, i) => jarCard(it, i, rates, false)).join("") + "</div>"
      : '<p class="cf-quiet">' + escapeHtml(I18N.t(r.rebuy.length ? "cf_open_none_rebuy" : "cf_open_none")) + "</p>");
    if (r.rebuy.length) {
      html += row("rebuy", '<div class="cf-rebuy" id="cf-rebuy">' +
        r.rebuy.map((it, i) => UI.bagEndScene(it.coffee.id, { layout: "row", index: i, force: true, meta: UI.shelfRebuyMeta(it.coffee.id) })).join("") + "</div>");
    }
    if (r.done.length) {
      html += row("done", '<button type="button" class="link-card cf-done-more" id="cf-done-more" data-cf-done-more aria-controls="cf-done" hidden></button>' +
        '<div class="cf-plank cf-plank-done" id="cf-done">' + r.done.map((it, i) => jarCard(it, i, rates, true)).join("") + "</div>");
    }
    const fresh = html !== shelfHtml;
    if (fresh) { zone.innerHTML = html; shelfHtml = html; }
    UI.drawShelfFrise(fresh);
    fitDone();
    writeCounts(r);
    markShelfJar(UI.sheetCoffeeId ? UI.sheetCoffeeId() : null);
    if (arriving && !calm() && !hidden()) {
      arriving = false;
      zone.classList.remove("cf-arrive");
      void zone.offsetWidth;
      zone.classList.add("cf-arrive");
      UI.shelfCountUp(zone);
      clearTimeout(renderCoffeeList.arriveTimer);
      renderCoffeeList.arriveTimer = setTimeout(() => zone.classList.remove("cf-arrive"), 1600);
    }
    arriving = false;
    UI.playJars(zone);
    UI.playBagScenes(zone);
  }

  /* THE FINISHED ONES, ONE PLANK (v9.25). Only as many tiles as the plank
     holds in a row (its columns, read from the grid; two rows of two on a
     phone), the others behind
     « Voir les N autres », which only shows when there are others. */
  let doneAll = false;
  function fitDone() {
    const plank = $("#cf-done"), more = $("#cf-done-more");
    if (!plank || !more || typeof getComputedStyle !== "function" || typeof plank.querySelectorAll !== "function") return;
    // A hidden page has no columns to count: it counts when it shows (wireCoffees).
    if (!plank.offsetWidth) return;
    const jars = [...plank.querySelectorAll(".cf-jar")];
    const cols = Math.max(1, String(getComputedStyle(plank).gridTemplateColumns || "").split(" ").filter(Boolean).length);
    // Two rows on a phone, where a row holds only two tiles.
    const keep = cols * (cols <= 2 ? 2 : 1);
    const extra = Math.max(0, jars.length - keep);
    jars.forEach((j, i) => { j.hidden = !doneAll && i >= keep; });
    more.hidden = !extra;
    more.textContent = I18N.t(doneAll ? "cf_done_less" : "cf_done_more", { n: extra });
    more.setAttribute("aria-expanded", String(doneAll));
  }

  // The counts of the header, rolling when they change.
  function writeCounts(r) {
    ["open", "rebuy", "done"].forEach(k => {
      const el = $("#cf-n-" + k);
      if (!el) return;
      const n = String(r[k].length);
      if (UI.rollText) UI.rollText(el, n); else el.textContent = n;
      const b = el.closest ? el.closest("[data-cf-jump]") : null;
      if (b) b.disabled = r[k].length === 0;
    });
  }

  /* THE JAR OUT OF THE SHELF. While a coffee's sheet is open, its jar is in
     the sheet: on the shelf, its place stays marked, dashed. */
  function markShelfJar(id) {
    $$("#coffees-list .cf-jar.is-lifted").forEach(b => { if (b.dataset.sheet !== id) b.classList.remove("is-lifted"); });
    if (!safeId(id)) return;
    const b = $('#coffees-list .cf-jar[data-sheet="' + id + '"]');
    if (b) b.classList.add("is-lifted");
  }

  // ---------- The jar that grows into its sheet ----------

  const canMorph = () => typeof document.startViewTransition === "function" && !calm() && !hidden();
  function inView(el) {
    if (!el || typeof el.getBoundingClientRect !== "function") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < (window.innerHeight || 0);
  }
  const vtName = (el, n) => { if (el && el.style) el.style.viewTransitionName = n; };
  // The jar the sheet shows: the end of bag's when it is there, the passport's otherwise.
  function sheetJar() {
    const zone = $("#sheet-content");
    if (!zone) return null;
    return [zone.querySelector(".be-art"), zone.querySelector(".sh-jar")].find(inView) || null;
  }
  function transition(update, cleanup) {
    let t = null, ran = false;
    try { t = document.startViewTransition(() => { ran = true; update(); }); } catch (e) { update(); cleanup(); return; }
    /* A page that draws no frame (a throttled window) never calls the
       update: past 600 ms the movement is skipped, which still runs it, so
       the sheet always opens or closes. */
    setTimeout(() => { if (!ran && t && typeof t.skipTransition === "function") t.skipTransition(); }, 600);
    // An interrupted or skipped transition rejects: normal, nothing to report.
    if (t && t.ready) t.ready.catch(() => {});
    const done = t && t.finished ? t.finished : Promise.resolve();
    done.catch(() => {}).then(cleanup);
  }

  /* What unfolds and what flies: an open jar's whole card (v9.31) and its
     jar, or the jar's own place and its drawing. */
  const surfaceOf = el => (el.closest && el.closest(".cf-card")) || el;
  const artOf = box => box.querySelector(".cf-art, .be-art") || box;

  /* A jar of the page opens its sheet: the card unfolds into the window (or
     the side panel on a wide screen) and the jar flies to the sheet's jar. */
  function openFromJar(el) {
    const id = el.dataset.sheet;
    const card = surfaceOf(el);
    if (!canMorph() || !inView(card)) { UI.openCoffee(id, el); return; }
    const art = artOf(card);
    vtName(card, "cf-sheet");
    if (art !== card) vtName(art, "cf-jar");
    const d = $("#modal-sheet");
    let target = null;
    transition(() => {
      vtName(card, ""); vtName(art, "");
      UI.openCoffee(id, el);
      if (!d.open) return;
      d.classList.add("cf-morph");
      vtName(d, "cf-sheet");
      target = sheetJar();
      vtName(target, "cf-jar");
    }, () => {
      d.classList.remove("cf-morph");
      vtName(d, "");
      vtName(target, "");
    });
  }

  /* Going back (the Close button, Escape, the phone's back): the sheet
     shrinks into its jar on the shelf and the jar settles in its place.
     Returns false when it does not apply (another screen, the jar out of
     view, no transition): the caller then closes as usual. */
  function closeSheetToShelf() {
    const d = $("#modal-sheet");
    const id = UI.sheetCoffeeId ? UI.sheetCoffeeId() : null;
    if (!d || !d.open || !canMorph() || nav.screenName !== "coffees" || !safeId(id)) return false;
    const jarSel = '#coffees-list .cf-jar[data-sheet="' + id + '"], #coffees-list .be-jar[data-sheet="' + id + '"]';
    const jar = $(jarSel);
    if (!jar) return false;
    const card = surfaceOf(jar);
    const r = card.getBoundingClientRect();
    if (!(r.height > 0) || r.bottom < 0 || r.top > (window.innerHeight || 0)) return false;
    const from = sheetJar();
    vtName(d, "cf-sheet");
    vtName(from, "cf-jar");
    d.classList.add("cf-morph");
    let landed = null, art = null;
    transition(() => {
      vtName(d, ""); vtName(from, "");
      d.classList.remove("cf-morph");
      d.close();
      const back = $(jarSel);
      if (!back) return;
      back.classList.remove("is-lifted");
      back.classList.add("cf-settle");
      landed = surfaceOf(back);
      art = artOf(landed);
      vtName(landed, "cf-sheet");
      if (art !== landed) vtName(art, "cf-jar");
    }, () => {
      vtName(landed, ""); vtName(art, "");
      const back = $(jarSel);
      if (back) setTimeout(() => back.classList.remove("cf-settle"), 400);
    });
    return true;
  }

  // ---------- Showing the page ----------

  function showCoffeesPage() {
    if (nav.screenName !== "coffees") activateScreen("coffees");
  }
  /* « Mes cafés » from anywhere (the drawings, the empty places, the entry's
     button): the page, its forms closed. Under its old name too, the window
     it replaced: code of other screens still calls it. */
  function openCoffeesPage() {
    ["#form-coffee", "#form-bag"].forEach(s => { const f = $(s); if (f) f.hidden = true; });
    showCoffeesPage();
  }

  /* A form just opened at the top of the page: brought into view and its
     first field focused, once the page is on screen (the screen change may
     still be in its transition). */
  function revealCoffeeForm(form, field) {
    let tries = 0;
    const go = () => {
      const page = $("#screen-coffees");
      if (page && !page.classList.contains("on") && tries++ < 12) { setTimeout(go, 50); return; }
      if (form && form.scrollIntoView) form.scrollIntoView({ block: "nearest", behavior: calm() ? "auto" : "smooth" });
      if (field && field.focus) field.focus({ preventScroll: true });
    };
    go();
  }

  // ---------- The entry's jars ----------

  const JAR_MAX = 6;
  let jarsHtml = "";

  /* The row of open bags at the top of the entry form, the most advanced
     first: small jars at their level, their grams and the day of the bag. */
  function renderCoffeeJars() {
    const zone = $("#coffee-jars");
    if (!zone) return;
    const list = BAGS.entryJars(DATA.state.coffees.map(jarItem), JAR_MAX);
    zone.hidden = !list.length;
    if (!list.length) { if (jarsHtml) { zone.innerHTML = ""; jarsHtml = ""; } return; }
    const tile = it => {
      const c = it.coffee, g = it.gauge;
      const jar = { coffeeId: c.id, grams: g.grams, bag: g.bag, low: !!g.low, roast: UI.jarRoast(c) };
      const day = it.day === null ? "" : " · " + I18N.t("sheet_day", { n: it.day + 1 });
      return '<button type="button" class="cj-tile' + (g.low ? " is-low" : "") + '" data-coffee-pick="' + escapeHtml(c.id) + '" aria-pressed="false">' +
        '<span class="cj-art"' + UI.jarData(jar) + ">" + UI.jarSvg(jar) + "</span>" +
        '<span class="cj-name">' + escapeHtml(c.name) + "</span>" +
        '<small class="cj-sub"><span data-jar-grams="' + escapeHtml(c.id) + '">' + fmtDecimal(g.grams, 0) + " g</span>" + escapeHtml(day) + "</small></button>";
    };
    const html = '<p class="cj-h">' + escapeHtml(I18N.t("cj_title")) + '</p><div class="cj-row">' + list.map(tile).join("") +
      '<button type="button" class="cj-tile cj-other" data-coffee-other aria-pressed="false">' +
        '<span class="cj-other-ico" aria-hidden="true"><svg class="ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg></span>' +
        '<span class="cj-name">' + escapeHtml(I18N.t("cj_other")) + '</span><small class="cj-sub" data-cj-other-sub></small></button></div>';
    if (html !== jarsHtml) { zone.innerHTML = html; jarsHtml = html; }
    markPicked();
    UI.playJars(zone);
  }

  /* The jars follow the menu: the chosen coffee's jar is pressed; a coffee
     without a jar here presses « Autre café… », which then names it. */
  function markPicked() {
    const zone = $("#coffee-jars"), sel = $("#f-coffee");
    if (!zone || !sel || typeof zone.querySelectorAll !== "function") return;
    const id = sel.value;
    let found = false;
    zone.querySelectorAll("[data-coffee-pick]").forEach(b => {
      const on = b.dataset.coffeePick === id;
      found = found || on;
      b.setAttribute("aria-pressed", String(on));
    });
    const other = zone.querySelector("[data-coffee-other]");
    if (!other) return;
    other.setAttribute("aria-pressed", String(!found && !!id));
    const c = !found && id ? DATA.state.coffees.find(x => x.id === id) : null;
    const sub = other.querySelector("[data-cj-other-sub]");
    if (sub) sub.textContent = c ? c.name : I18N.t("cj_other_sub");
  }

  /* THE MENU STAYS THE TRUTH, whoever writes it: a tap here, the draft, a
     prefill, a reset. Its value is read and written through the browser's
     own property; this only adds a repaint of the jars after each write
     (the same device as the grinder dial, js/ui-dial.js). */
  function watchSelect(sel) {
    const proto = typeof window !== "undefined" && window.HTMLSelectElement && window.HTMLSelectElement.prototype;
    const desc = proto && Object.getOwnPropertyDescriptor(proto, "value");
    if (!sel || !desc || !desc.set || Object.prototype.hasOwnProperty.call(sel, "value")) return;
    let pending = false;
    Object.defineProperty(sel, "value", {
      configurable: true,
      enumerable: true,
      get() { return desc.get.call(this); },
      // A function, not a method: the boundaries test reads its parameter.
      set: function (v) {
        desc.set.call(this, v);
        if (pending) return;
        pending = true;
        // After the current task: several writes in a row repaint once.
        Promise.resolve().then(() => { pending = false; markPicked(); });
      },
    });
  }

  function onJarsClick(ev) {
    const pick = ev.target.closest("[data-coffee-pick]");
    const sel = $("#f-coffee");
    if (pick && sel) {
      const id = pick.dataset.coffeePick;
      if (sel.value !== id) {
        sel.value = id;
        // The menu's own event: the machine and the recipe follow, the draft saves.
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
      markPicked();
      if (!calm()) {
        pick.classList.remove("cj-hop");
        void pick.offsetWidth;
        pick.classList.add("cj-hop");
      }
      return;
    }
    if (ev.target.closest("[data-coffee-other]") && sel) {
      sel.focus();
      try { if (typeof sel.showPicker === "function") sel.showPicker(); } catch (e) { /* the focus is enough */ }
    }
  }

  // ---------- Wiring ----------

  /* Called once, by wireCatalog (app.js is at its line cap). */
  function wireCoffees() {
    const list = $("#coffees-list");
    if (list) {
      list.addEventListener("click", ev => {
        if (ev.target.closest("[data-cf-done-more]")) {
          doneAll = !doneAll;
          fitDone();
          // The jars that come out rise one after the other, like arriving on the page.
          if (doneAll && !calm()) $$("#cf-done .cf-jar").forEach((j, i) => {
            if (typeof j.animate === "function") j.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }],
              { duration: 360, delay: i * 35, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "backwards" });
          });
          return;
        }
        if (UI.onShelfClick(ev)) return;
        const card = ev.target.closest(".cf-jar[data-sheet], .be-jar[data-sheet], .cf-card [data-sheet]");
        if (!card) return;
        // Ours: the sheet's own handler on the document would open it a second time.
        ev.stopPropagation();
        openFromJar(card);
      });
    }
    $$("[data-cf-jump]").forEach(b => b.addEventListener("click", () => {
      const row = $("#cf-row-" + b.dataset.cfJump);
      if (row && row.scrollIntoView) row.scrollIntoView({ block: "start", behavior: calm() ? "auto" : "smooth" });
    }));
    const jars = $("#coffee-jars");
    if (jars) jars.addEventListener("click", onJarsClick);
    const sel = $("#f-coffee");
    if (sel) { watchSelect(sel); sel.addEventListener("change", markPicked); }
    const sheet = $("#modal-sheet");
    if (sheet) sheet.addEventListener("close", () => markShelfJar(null));
    /* Arriving on the page fills the jars one after the other: noted when
       the screen goes away, played by the next render. */
    const page = $("#screen-coffees");
    if (page && typeof MutationObserver === "function") {
      new MutationObserver(() => { if (!page.classList.contains("on")) arriving = true; else requestAnimationFrame(() => { fitDone(); UI.drawShelfFrise(false); }); })
        .observe(page, { attributes: true, attributeFilter: ["class"] });
    }
    // The end of a bag's buttons, wherever its scene is drawn (js/ui-bag-end.js).
    UI.wireBagEnd();
    DATA.subscribe(kind => { if (kind !== "sync") renderCoffeeJars(); });
    I18N.subscribe(() => { jarsHtml = ""; shelfHtml = ""; renderCoffeeJars(); });
    // The finished ones' plank counts its columns again at a new width, the frise redraws at it.
    window.addEventListener("resize", UI.debounce(() => { fitDone(); UI.drawShelfFrise(false); }, 150));
  }

  // Under the old window's name too: the drawings and the empty places call it.
  const openCoffeesModal = openCoffeesPage;
  Object.assign(UI, {
    wireCoffees, renderCoffeeList, renderCoffeeJars, openCoffeesPage, openCoffeesModal, showCoffeesPage,
    revealCoffeeForm, markShelfJar, closeSheetToShelf,
  });
})();
