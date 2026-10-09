/* THE END OF A BAG (v9.18, Q9 « Le sachet, du dernier grain au sachet neuf »).
 *
 * Finishing a bag and opening the next one used to happen without a word.
 * Now, when a saved cup leaves less than one dose in its bag (BAGS.isSpent),
 * the bag's jar tilts, its last beans roll out and a « vide » stamp lands,
 * once per bag and per device (localStorage "bag-end-seen"), the first time
 * the scene is seen. Then:
 *
 *   - « Racheter » puts a new bag on the counter next to the jar. Nothing is
 *     saved yet: a tap on the bag (or « Ouvrir le sachet ») tears it open and
 *     pours it, and only then the purchase is recorded, through the same
 *     DATA.addPurchase as the « Nouveau sachet » form, opened today, at the
 *     size and price of the last bag (« Autre format ou prix ? » opens that
 *     form instead). The jar's level rises to the bag size: that is the jar's
 *     own movement (UI.playJars), beans raining in.
 *   - The scene then offers to pick up where the last bag stopped (recipe,
 *     grind, temperature or flame of its last cup, BAGS.resumeCup). « Oui,
 *     reprendre » prefills the entry through the « Refaire » path (toast
 *     setting_prefilled), ONCE: nothing is stored as a default for the coffee.
 *   - « Ranger ce café » archives it (active = 0) onto the shelf of the
 *     finished ones; its cups stay in the journal.
 *
 * One scene, three places: the coffee sheet (layout "card"), « Mes cafés »
 * (layout "row", its « À racheter » shelf) and the corner of the home screen
 * (layout "corner", wired by the home screen: see bagEndScene). Its buttons
 * are delegated on the document, so a scene works wherever its HTML lands. */
"use strict";

(() => {

  const { $, fmtDecimal, fmtVND, fallbacks, localNow, toast } = UI;
  const escapeHtml = TOOLS.escapeHtml;

  const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hidden = () => typeof document.visibilityState === "string" && document.visibilityState === "hidden";
  const coffeeOf = id => DATA.state.coffees.find(c => c.id === id) || null;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  /* Where each scene stands, per coffee, for this session: "bag" (the new
     bag on the counter, not saved) or "poured" (saved, the resume offered).
     Absent: the bag is spent, the stamp is on. */
  const steps = new Map();
  // The scenes whose bag just arrived: it slides in once, not on every render.
  const entering = new Set();
  // When each bag was poured ("AAAA-MM-JJTHH:MM"): the cups before it are the last bag's.
  const pouredAt = new Map();
  const lastOfOldBag = id => BAGS.resumeCup(DATA.state.extractions.filter(e => String(e.date_time) <= (pouredAt.get(id) || "9")), id);
  const busy = new Set();

  // ---------- The memory of the stamp ----------

  const SEEN_KEY = "bag-end-seen";
  let seenMemo = null;
  function seenList() {
    if (!seenMemo) {
      try { seenMemo = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]") || []; } catch (e) { seenMemo = []; }
      if (!Array.isArray(seenMemo)) seenMemo = [];
    }
    return seenMemo;
  }
  function markSeen(key) {
    const l = seenList();
    if (l.includes(key)) return;
    l.push(key);
    // Bounded: a key per finished bag, the latest sixty are enough.
    while (l.length > 60) l.shift();
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(l)); } catch (e) { /* without storage, the stamp lands on each visit */ }
  }
  // The bag a stamp is about: its id, or the coffee card when no purchase was recorded.
  const bagKey = id => { const b = DATA.currentBag(id); return id + "|" + (b ? b.id : "card"); };

  // ---------- When a scene shows ----------

  /* A scene shows for an active coffee whose bag is spent, for any coffee in
     the middle of its scene, and in the sheet of an archived coffee (it can
     be bought again from there). */
  function wanted(id, place) {
    const c = coffeeOf(id);
    if (!c) return false;
    if (steps.has(id)) return true;
    if (Number(c.active) === 0) return place === "sheet";
    return BAGS.isSpent(DATA.bagGauge(id, fallbacks.dose));
  }
  const bagEndActive = id => steps.has(id);

  /* The coffees whose end of bag is to be shown, the latest emptied first:
     what the home corner reads to know whether to draw a scene. */
  function bagEndCoffees() {
    const last = new Map();
    DATA.state.extractions.forEach(e => { if (String(e.date_time) > (last.get(e.coffee_id) || "")) last.set(e.coffee_id, String(e.date_time)); });
    return DATA.state.coffees.filter(c => Number(c.active) !== 0 && wanted(c.id, "corner"))
      .sort((a, b) => String(last.get(b.id) || "").localeCompare(String(last.get(a.id) || ""))).map(c => c.id);
  }

  // ---------- The words ----------

  function dayWords(dateTime) {
    const [a, m, j] = String(dateTime || "").slice(0, 10).split("-").map(Number);
    if (!a || !m || !j) return "";
    const d = new Date(a, m - 1, j), today = new Date(); today.setHours(0, 0, 0, 0);
    const gap = Math.round((today - d) / 86400000);
    return gap <= 0 ? I18N.t("be_today") : gap === 1 ? I18N.t("be_yesterday")
      : I18N.t("be_on", { d: d.toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" }) });
  }

  // « Chronicler · 1.4.4 · 92 °C », what the resume would put back.
  function resumeWords(e) {
    if (!e) return "";
    return [I18N.tr(e.recipe || ""), e.grind_dial || I18N.t("bag_default"),
      e.method === "Switch" && e.temperature_c !== "" && e.temperature_c !== undefined ? e.temperature_c + " °C"
        : e.method === "Brikka" && e.heat_level !== "" && e.heat_level !== undefined ? I18N.t("setting_heat", { f: e.heat_level }) : "",
    ].filter(Boolean).join(" · ");
  }

  // The size a new bag will have: the last bag's, which the coffee card keeps.
  const bagSize = c => (Number(c.bag_size_g) > 0 ? Number(c.bag_size_g) : 0);

  // ---------- The drawing ----------

  /* The new bag: kraft paper, its welded top as a strip that tears off, a
     label with the coffee's name. The colours are those of a bag, not of the
     theme, like the beans of the jar. */
  function bagSvg(c) {
    const name = String(c.name || "");
    const short = name.length > 10 ? name.slice(0, 9).trimEnd() + "…" : name;
    return '<svg class="be-bag-svg" viewBox="0 0 120 170" aria-hidden="true" focusable="false">' +
      '<path class="be-bag-body" d="M14 30 L18 26 L26 30 L34 26 L42 30 L50 26 L58 30 L66 26 L74 30 L82 26 L90 30 L98 26 L106 30 ' +
        'L110 150 Q110 162 98 162 L22 162 Q10 162 10 150 Z"></path>' +
      '<g class="be-bag-top"><path d="M14 6 L106 6 L106 30 L98 26 L90 30 L82 26 L74 30 L66 26 L58 30 L50 26 L42 30 L34 26 L26 30 L18 26 L14 30 Z"></path>' +
        '<path class="be-bag-seam" d="M14 16 H106"></path></g>' +
      '<circle class="be-bag-valve" cx="60" cy="48" r="6"></circle>' +
      '<rect class="be-bag-label" x="22" y="72" width="76" height="58" rx="6"></rect>' +
      // The name, readable only on the sheet's big bag; the scene's text says the size.
      '<text class="be-bag-name" x="60" y="107" text-anchor="middle">' + escapeHtml(short) + "</text></svg>";
  }

  /* THE SCENE of a coffee, as HTML, or "" when it has nothing to show.
     opts.layout: "card" (the sheet), "row" (« Mes cafés »), "corner" (home);
     opts.place: "sheet" lets an archived coffee show its scene;
     opts.force: draw it even when the bag is not spent (the shelf already
     decided); opts.index: the stagger of a list; opts.meta: HTML under the
     title (v9.31, « Mes cafés »: where the bag came from, what it cost).

     FOR THE HOME SCREEN (the stock corner): for each id of
     UI.bagEndCoffees(), insert UI.bagEndScene(id, { layout: "corner" }), then
     call UI.playBagScenes(container) after writing it. The buttons work by
     themselves. */
  function bagEndScene(id, opts) {
    const o = opts || {};
    const c = coffeeOf(id);
    if (!c || (!o.force && !wanted(id, o.place))) return "";
    const layout = o.layout || "card";
    const step = steps.get(id) || "empty";
    const g = DATA.bagGauge(id, fallbacks.dose);
    const archived = Number(c.active) === 0;
    const size = bagSize(c);
    // An archived coffee may have been put away with beans left: no stamp, no red then.
    const spent = !!g && BAGS.isSpent(g);
    const jar = { coffeeId: c.id, grams: g ? g.grams : 0, bag: g ? g.bag : size, low: spent, roast: UI.jarRoast(c), labels: layout === "card", unknown: !g };
    const key = bagKey(id);
    const fresh = step === "empty" && spent && !archived && !seenList().includes(key);
    const stamped = step === "empty" && spent && !fresh;
    const clickable = layout !== "card";
    const jarTag = clickable ? "button" : "div";
    const jarHtml = "<" + jarTag + (clickable ? ' type="button"' : "") + ' class="be-jar"' +
      (clickable ? ' data-sheet="' + escapeHtml(id) + '" aria-label="' + escapeHtml(I18N.t("be_jar_aria", { c: c.name })) + '"' : "") + ">" +
      '<span class="be-art"' + (g ? UI.jarData(jar) : "") + ">" + UI.jarSvg(jar) + "</span>" +
      '<span class="be-stamp" aria-hidden="true">' + escapeHtml(I18N.t("be_stamp")) + "</span></" + jarTag + ">";
    const newBag = step === "bag"
      ? '<button type="button" class="be-bag' + (entering.has(id) ? " be-bag-in" : "") + '" data-be-act="open" data-be-id="' + escapeHtml(id) +
        '" aria-label="' + escapeHtml(I18N.t("be_open_aria", { c: c.name })) + '">' + bagSvg(c) + "</button>"
      : "";

    let say = "", actions = "", resume = "";
    const btn = (act, text, kind) => '<button type="button" class="btn btn-small' + (kind ? " " + kind : "") + '" data-be-act="' + act +
      '" data-be-id="' + escapeHtml(id) + '">' + escapeHtml(text) + "</button>";
    if (step === "empty") {
      const bag = DATA.currentBag(id);
      const cups = BAGS.bagCups(DATA.state.extractions, id, bag ? bag.id : "", DATA.bagAtDate);
      const last = BAGS.resumeCup(DATA.state.extractions, id);
      const stats = cups.n ? I18N.t(cups.average === null ? "be_stats_n" : "be_stats", { n: cups.n, s: cups.n > 1 ? "s" : "", m: cups.average === null ? "" : fmtDecimal(cups.average, 1) }) : "";
      if (archived) say = spent ? I18N.t("be_archived_spent") : I18N.t("be_archived_left", { g: g ? fmtDecimal(g.grams, 0) : "?" });
      else if (g && g.remaining < 0) say = I18N.t("be_to_count");
      else if (g && g.grams > 0.5) say = I18N.t("be_crumbs", { g: fmtDecimal(g.grams, 0) });
      else say = last ? I18N.t("be_empty_since", { d: dayWords(last.date_time) }) : I18N.t("be_empty");
      if (stats && !archived) say += " " + stats;
      // The home corner has one line's worth of room.
      if (layout === "corner" && !archived) say = I18N.t("be_corner_spent");
      actions = btn("buy", size ? I18N.t("be_buy_size", { g: size }) : I18N.t("be_buy"), "btn-primary") +
        (archived ? "" : btn("store", I18N.t("be_store"), "btn-subtle"));
    } else if (step === "bag") {
      say = I18N.t("be_bag_ready", { g: size ? size + " g" : "", p: c.price_vnd ? " · " + fmtVND(c.price_vnd) : "" });
      actions = btn("open", I18N.t("be_open"), "btn-primary") + btn("form", I18N.t("be_other_bag"), "btn-subtle") + btn("cancel", I18N.t("be_cancel"), "btn-subtle");
    } else {
      const last = lastOfOldBag(id);
      say = I18N.t("be_poured", { g: g ? fmtDecimal(g.grams, 0) : size });
      if (last) {
        resume = '<p class="be-resume">' + escapeHtml(I18N.t("be_resume")) + " <b>" + escapeHtml(resumeWords(last)) + "</b> ?</p>";
        actions = btn("resume", I18N.t("be_resume_yes"), "btn-primary") + btn("done", I18N.t("be_resume_no"), "btn-subtle");
      } else {
        actions = btn("done", I18N.t("be_done"), "btn-subtle");
      }
    }
    const title = layout === "card" ? I18N.t(step === "empty" ? (archived ? "be_title_archived" : "be_title") : step === "bag" ? "be_title_bag" : "be_title_poured")
      : c.name;
    return '<div class="bag-end be-' + layout + " be-step-" + step + (step === "empty" && spent ? " be-spent" : "") +
      (stamped ? " be-stamped" : "") + (archived ? " be-archived" : "") +
      '" data-bag-end="' + escapeHtml(id) + '"' + (fresh ? ' data-be-fresh="' + escapeHtml(key) + '"' : "") +
      ' style="--i:' + (o.index || 0) + '">' +
      '<div class="be-stage">' + jarHtml + newBag + "</div>" +
      '<div class="be-text"><p class="be-title">' + escapeHtml(title) + '</p>' + (o.meta || "") + '<p class="be-say">' + escapeHtml(say) + "</p>" + resume +
      '<div class="be-actions">' + actions + "</div></div></div>";
  }


  // ---------- The movements ----------

  /* A few beans roll out of a tilted jar, or pour from a torn bag. Drawn in
     HTML in the stage, above the jar; the jar's own CSS gives them their look. */
  function beans(stage, from, count, path) {
    if (calm() || !stage || typeof stage.getBoundingClientRect !== "function" || typeof document.createElement !== "function") return;
    const s = stage.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
      const b = document.createElement("span");
      b.className = "jar-bean";
      const size = Math.max(5, Math.round(from.size || 7));
      b.style.width = size + "px";
      b.style.height = Math.round(size * 1.35) + "px";
      b.style.left = (from.x - s.left - size / 2 + (Math.random() - 0.5) * 8).toFixed(1) + "px";
      b.style.top = (from.y - s.top - size).toFixed(1) + "px";
      stage.appendChild(b);
      if (typeof b.animate !== "function") { b.remove(); continue; }
      const run = b.animate(path(i), { duration: 640 + i * 30, delay: i * 55, easing: "cubic-bezier(0.45, 0, 0.8, 0.6)", fill: "both" });
      run.onfinish = () => b.remove();
      run.oncancel = () => b.remove();
    }
  }

  /* THE BAG RUNS OUT: the jar tilts, the last beans roll out on its left,
     the stamp lands. About 800 ms, once per bag, when the scene is seen. */
  function playEnd(scene) {
    const key = scene.dataset.beFresh;
    scene.removeAttribute("data-be-fresh");
    if (key) markSeen(key);
    if (calm() || hidden()) { scene.classList.add("be-stamped"); return; }
    const art = scene.querySelector(".be-art"), stage = scene.querySelector(".be-stage");
    scene.classList.add("be-tilting");
    if (art && typeof art.getBoundingClientRect === "function") {
      const r = art.getBoundingClientRect();
      const lip = { x: r.left + r.width * 0.2, y: r.top + r.height * 0.32, size: r.width / 14 };
      setTimeout(() => beans(stage, lip, 6, i => {
        const dx = -r.width * (0.35 + Math.random() * 0.45), dy = r.height * (0.55 + Math.random() * 0.2);
        return [{ transform: "translate(0, 0) rotate(0deg)", opacity: 0 },
          { transform: "translate(" + (dx * 0.25).toFixed(1) + "px, " + (r.height * 0.04).toFixed(1) + "px) rotate(60deg)", opacity: 1, offset: 0.2 },
          { transform: "translate(" + dx.toFixed(1) + "px, " + dy.toFixed(1) + "px) rotate(" + (220 + i * 40) + "deg)", opacity: 0 }];
      }), 200);
    }
    setTimeout(() => scene.classList.add("be-stamped"), 480);
    setTimeout(() => scene.classList.remove("be-tilting"), 900);
  }

  /* Plays what the scenes drawn under `root` have to play: the end of a bag
     the first time it is seen. A scene not on screen (a hidden screen, a
     window not open) waits to be seen. */
  let watcher = null;
  function playBagScenes(root) {
    const scope = root || document;
    if (!scope || typeof scope.querySelectorAll !== "function") return;
    scope.querySelectorAll(".bag-end[data-be-fresh]").forEach(scene => {
      const seen = typeof scene.getClientRects === "function" ? scene.getClientRects().length > 0 : true;
      if (seen && !hidden()) {
        // After the frame that paints it: a screen just switched is still in its transition.
        setTimeout(() => { if (scene.isConnected !== false && scene.dataset.beFresh) playEnd(scene); }, 120);
        return;
      }
      if (typeof IntersectionObserver !== "function") return;
      if (!watcher) {
        watcher = new IntersectionObserver(entries => entries.forEach(en => {
          if (!en.isIntersecting) return;
          watcher.unobserve(en.target);
          if (en.target.dataset.beFresh) playEnd(en.target);
        }), { threshold: 0.4 });
      }
      watcher.observe(scene);
    });
  }

  /* THE BAG TEARS AND POURS: its top strip flies off, the bag moves over the
     jar and tips its mouth into it, a few beans fall. About 700 ms; the level
     then rises with the jar's own movement once the purchase is saved. */
  async function playPour(scene) {
    const bag = scene && scene.querySelector(".be-bag"), art = scene && scene.querySelector(".be-art");
    if (calm() || hidden() || !bag || !art || typeof bag.animate !== "function") return;
    const top = bag.querySelector(".be-bag-top");
    if (top && typeof top.animate === "function") {
      top.animate([{ transform: "none", opacity: 1 }, { transform: "translate(16px, -34px) rotate(30deg)", opacity: 0 }],
        { duration: 340, easing: "ease-out", fill: "forwards" });
    }
    const b = bag.getBoundingClientRect(), j = art.getBoundingClientRect();
    const dx = (j.left + j.width * 0.62) - (b.left + b.width / 2), dy = (j.top - b.height * 0.42) - b.top;
    bag.animate([{ transform: "none", opacity: 1 },
      { transform: "translate(" + dx.toFixed(1) + "px, " + dy.toFixed(1) + "px) rotate(-128deg)", opacity: 1, offset: 0.75 },
      { transform: "translate(" + dx.toFixed(1) + "px, " + (dy - 6).toFixed(1) + "px) rotate(-136deg)", opacity: 0 }],
      { duration: 640, delay: 200, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" });
    const mouth = { x: j.left + j.width * 0.5, y: j.top + j.height * 0.08, size: j.width / 13 };
    setTimeout(() => beans(scene.querySelector(".be-stage"), mouth, 8, i => [
      { transform: "translate(0, 0)", opacity: 0 },
      { transform: "translate(0, 6px)", opacity: 1, offset: 0.12 },
      { transform: "translate(" + ((Math.random() - 0.5) * j.width * 0.4).toFixed(1) + "px, " + Math.max(18, j.height * (0.62 - i * 0.03)).toFixed(1) + "px) rotate(" + (90 + i * 30) + "deg)", opacity: 0 },
    ]), 520);
    await wait(760);
  }

  /* An element lands where it now sits, from where it was (`from`, a rect):
     the jar archived from « À racheter » travels to the finished shelf. */
  function flipFrom(el, from) {
    if (!el || !from || calm() || typeof el.animate !== "function") return;
    const to = el.getBoundingClientRect();
    if (!to.width || !from.width) return;
    const s = from.width / to.width;
    el.style.transformOrigin = "0 0";
    el.animate([{ transform: "translate(" + (from.left - to.left).toFixed(1) + "px, " + (from.top - to.top).toFixed(1) + "px) scale(" + s.toFixed(3) + ")" },
      { transform: "none" }], { duration: 560, easing: "cubic-bezier(0.25, 0.9, 0.3, 1.08)" });
  }

  // ---------- The actions ----------

  // Every place a scene lives in is redrawn: the sheet, the current screen (the page, the home corner).
  function refresh() {
    if (UI.renderOpenSheet) UI.renderOpenSheet();
    UI.renderCurrentScreen();
  }

  async function act(action, id, button) {
    const c = coffeeOf(id);
    if (!c || busy.has(id)) return;
    const scene = button && button.closest ? button.closest(".bag-end") : null;
    if (action === "buy") {
      // Without a known size, a bag cannot be poured: the form asks for it.
      if (!bagSize(c)) { leaveSheet(); UI.openBagForm(id); return; }
      steps.set(id, "bag");
      entering.add(id);
      setTimeout(() => entering.delete(id), 700);
      refresh();
      return;
    }
    if (action === "cancel") { steps.delete(id); refresh(); return; }
    if (action === "form") { steps.delete(id); leaveSheet(); UI.openBagForm(id); refresh(); return; }
    if (action === "open") {
      busy.add(id);
      try {
        await playPour(scene);
        const now = localNow(), today = now.slice(0, 10);
        steps.set(id, "poured");
        pouredAt.set(id, now);
        /* The bags count by DAY: a cup of this morning, from the old bag, would
           be taken from the new one opened today. Then the bag is also marked
           full at this minute (the manual count of v8.96, same columns), and
           only the cups after it come off. */
        const sameDay = DATA.state.extractions.some(e => e.coffee_id === id && String(e.date_time).slice(0, 10) === today);
        await DATA.addPurchase({ coffee_id: id, purchase_date: today, bag_size_g: bagSize(c), price_vnd: c.price_vnd,
          roast_date: "", opened_date: today, ...(sameDay ? { remaining_g: bagSize(c), remaining_at: now } : {}) });
        // Bought again from the finished shelf: back among the open ones.
        if (Number(c.active) === 0) await DATA.editCoffee(id, { ...c, active: 1 });
        toast(I18N.t("be_toast_open", { g: bagSize(c) }));
      } finally { busy.delete(id); }
      return;
    }
    if (action === "resume") {
      const last = lastOfOldBag(id);
      steps.delete(id);
      if (!last) { refresh(); return; }
      leaveSheet();
      UI.redoCup(last);
      toast(I18N.t("setting_prefilled"));
      return;
    }
    if (action === "done") { steps.delete(id); refresh(); return; }
    if (action === "store") {
      busy.add(id);
      const art = scene && scene.querySelector(".be-art");
      const from = art && typeof art.getBoundingClientRect === "function" ? art.getBoundingClientRect() : null;
      try {
        steps.delete(id);
        await DATA.editCoffee(id, { ...c, active: 0 });
        toast(I18N.t("be_toast_stored", { c: c.name }));
        const to = $('#coffees-list .cf-jar[data-sheet="' + id + '"] .cf-art');
        if (to) flipFrom(to, from);
      } finally { busy.delete(id); }
    }
  }

  // The sheet gives way when the action leads elsewhere (the entry form, the bag form).
  function leaveSheet() { if (UI.closeSheetToNavigate) UI.closeSheetToNavigate(); }

  function wireBagEnd() {
    document.addEventListener("click", ev => {
      const b = ev.target.closest && ev.target.closest("[data-be-act]");
      if (b) act(b.dataset.beAct, b.dataset.beId, b);
    });
  }

  Object.assign(UI, { bagEndScene, bagEndCoffees, bagEndActive, playBagScenes, wireBagEnd });
})();
