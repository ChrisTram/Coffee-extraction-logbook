/* O4 (v9.19): THE FIRST OPENING.
 *
 * The first visit opened a window about CSV files with three technical
 * choices, then an empty dashboard. Three questions now, and you brew:
 *   1. where to keep your cups, in plain words: on your devices and online
 *      (the browser's copy, synced when the site runs online, a copy each
 *      day on the server), or in a CSV folder (the folder link of the Data
 *      window, Chrome and Edge only: create one, or open an existing one);
 *   2. your gear: the two brewers (they narrow the recipe to start with and
 *      the first coffee's machine), the C5 ESP and where its dial stays
 *      (settings.grind_dial, « Mon moulin » in Paramètres), its zero;
 *   3. your first coffee, and the recipe to start with, picked by the coffee
 *      and recipe table of the Guide (TUNING.starterRecipe).
 * « Brasser ma première tasse » saves the coffee and opens the entry on it,
 * prefilled as when a coffee is chosen by hand. Everything stays editable
 * in Paramètres and Mes cafés.
 *
 * WHEN it shows did not change: at the end of startApp, once the local data
 * AND the sync have answered, and only if there is still no coffee and no
 * cup (welcomeAfterStart). A device about to receive its cups never sees it.
 * A page loaded on #welcome, and « Revoir la première ouverture » in the Data
 * window, open it on purpose, to see it again.
 *
 * Desktop: the three steps side by side, the current one lit. Phone: one
 * step at a time, sliding. A progress line follows; a brewer ticked bounces.
 * Reduced motion: no slide, no bounce. */
"use strict";

(() => {

  const { $, $$, toast, fallbacks, saveFallbacks, setPressed, activateScreen } = UI;

  // The process and roast chips: the stored value (French, read by coffeeProfile), and its label.
  const PROCESSES = [["Lavé", "welcome_process_washed"], ["Honey", "welcome_process_honey"], ["Natural", "welcome_process_natural"],
    ["Fermenté", "welcome_process_fermented"], ["Rang bơ", "welcome_process_rang_bo"]];
  const ROASTS = [["Claire", "welcome_roast_light"], ["Medium", "welcome_roast_medium"], ["Foncée", "welcome_roast_dark"]];
  const wl = { step: 1, store: "online", gear: { Brikka: true, Switch: true }, process: "Lavé", roast: "Medium", asked: false };

  // #welcome, read before startApp rewrites the hash to the first screen.
  try { wl.asked = typeof location !== "undefined" && location.hash === "#welcome"; } catch (e) { /* no location */ }

  const dialog = () => $("#modal-welcome");
  // One step at a time below this width; side by side above (css/extras.css says the same).
  const sliding = () => typeof matchMedia === "function" && matchMedia("(max-width: 899px)").matches;
  const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- The steps ----------

  function goTo(step, focus) {
    const d = dialog();
    if (!d) return;
    wl.step = Math.max(1, Math.min(3, step));
    d.style.setProperty("--wl-step", String(wl.step));
    $$("#welcome-steps .wl-step").forEach(s => {
      const n = Number(s.dataset.step);
      const current = n === wl.step;
      if (current) s.setAttribute("aria-current", "step"); else s.removeAttribute("aria-current");
      // On the phone, the other steps are off screen: out of reach of the keyboard too.
      s.inert = sliding() && !current;
    });
    const back = $("#welcome-back");
    if (back) back.hidden = wl.step === 1;
    fitViewport();
    if (focus) {
      const s = $('#welcome-steps .wl-step[data-step="' + wl.step + '"]');
      const target = s && s.querySelector("input, [aria-checked='true'], button");
      // After the slide, so the focus does not scroll the track mid-way.
      if (target) setTimeout(() => target.focus({ preventScroll: true }), calm() || !sliding() ? 0 : 380);
    }
  }

  /* On the phone the window takes the height of the step shown, not of the
     tallest: the track would leave a hole under a short step. */
  function fitViewport() {
    const vp = $("#modal-welcome .wl-viewport");
    if (!vp || !vp.style) return;
    if (!sliding()) { vp.style.height = ""; return; }
    const s = $('#welcome-steps .wl-step[data-step="' + wl.step + '"]');
    if (s && s.offsetHeight) vp.style.height = (s.offsetHeight + 8) + "px";
    // An engine without overflow: clip may have let a focus scroll the track.
    if (vp.scrollTop || vp.scrollLeft) { vp.scrollTop = 0; vp.scrollLeft = 0; }
  }

  // ---------- Step 1: where to keep the cups ----------

  function chooseStore(value) {
    wl.store = value;
    $$("#modal-welcome [data-store]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.store === value)));
    const folder = $("#welcome-folder");
    if (folder) folder.hidden = value !== "folder";
    if (value === "folder" && !DATA.state.fsAvailable) $("#welcome-fs-note").hidden = false;
  }

  /* Linking a folder needs the gesture of its own button (the browser asks
     where). Created, the welcome goes on to the gear; opened with cups in it,
     the logbook is already there and the welcome closes. */
  async function linkFolder(create) {
    if (!DATA.state.fsAvailable) {
      toast(I18N.t("toast_fs_unavailable"));
      $("#welcome-fs-note").hidden = false;
      return;
    }
    try {
      const name = await DATA.linkFolder(create);
      toast(I18N.t("toast_folder", { n: name }));
      UI.updateBadges();
      if (!create && (DATA.state.extractions.length || DATA.state.coffees.length)) { closeWelcome(); return; }
      $("#welcome-folder-state").textContent = I18N.t("welcome_folder_linked", { n: name });
      goTo(2, true);
    } catch (e) {
      if (e && e.name === "AbortError") return;
      toast(e.message || I18N.t("toast_link_failed"));
    }
  }

  function storeSubtitle() {
    // Online only on the deployed site; in a file opened from the disk, the copy stays in this browser.
    const online = typeof SYNC !== "undefined" && SYNC.isAvailable && SYNC.isAvailable();
    const sub = $("#welcome-online-sub");
    if (sub) sub.textContent = I18N.t(online ? "welcome_store_online" : "welcome_store_browser");
    const linked = DATA.state.dirHandle;
    $("#welcome-folder-state").textContent = linked ? I18N.t("welcome_folder_linked", { n: linked.name }) : "";
    if (linked) chooseStore("folder");
    const noFs = !DATA.state.fsAvailable;
    $("#welcome-create").disabled = noFs;
    $("#welcome-open").disabled = noFs;
  }

  // ---------- Step 2: the gear ----------

  function toggleGear(button) {
    const m = button.dataset.gear;
    const other = m === "Brikka" ? "Switch" : "Brikka";
    // At least one brewer: unticking the last one ticks the other.
    wl.gear[m] = !wl.gear[m];
    if (!wl.gear[m] && !wl.gear[other]) wl.gear[other] = true;
    $$("#modal-welcome [data-gear]").forEach(b => setPressed(b, !!wl.gear[b.dataset.gear]));
    if (!calm()) {
      button.classList.remove("wl-bounce");
      void button.offsetWidth;
      button.classList.add("wl-bounce");
    }
    renderStart();
  }

  const dialValue = () => String(($("#welcome-dial") || {}).value || "").trim().replace(/,/g, ".");
  function saveDial() {
    const v = dialValue();
    if (!v || !GRIND.parseDial(v) || v === fallbacks.dial) return;
    fallbacks.dial = v;
    saveFallbacks();
  }

  // ---------- Step 3: the first coffee ----------

  function chips(zone, list, current, attr) {
    if (!zone) return;
    zone.innerHTML = list.map(([value, key]) =>
      '<button type="button" class="wl-chip" role="radio" aria-checked="' + (value === current) + '" data-' + attr + '="' + TOOLS.escapeHtml(value) + '">' +
      TOOLS.escapeHtml(I18N.t(key)) + "</button>").join("");
  }

  // The coffee as it will be saved, and the recipe the table gives it.
  function draftCoffee() {
    const name = String(($("#welcome-coffee") || {}).value || "").trim();
    return { name, process: wl.process, roast: wl.roast, species: wl.process === "Rang bơ" ? "Robusta" : "" };
  }
  function starter() {
    return TUNING.starterRecipe(draftCoffee(), wl.gear, DATA.state.recipes);
  }
  function startLine(s) {
    const r = s.recipe;
    // The heat at the Brikka; at the Switch the table's degrees, else the recipe's for this roast.
    let water = "";
    if (r.method === "Brikka") water = r.heat_level ? I18N.t("welcome_heat", { f: r.heat_level }) : "";
    else {
      const t = s.temp || (typeof temperatureForCoffee === "function" ? temperatureForCoffee(r, draftCoffee()) : r.temp);
      water = t === "" || t === undefined || t === null ? "" : /°/.test(String(t)) ? String(t) : t + " °C";
    }
    const dial = GRIND.parseDial(dialValue()) ? dialValue() : fallbacks.dial;
    return [water, r.dose && r.water ? r.dose + " g / " + r.water + " g" : "", dial].filter(Boolean).join(" · ");
  }
  function renderStart() {
    const zone = $("#welcome-start");
    if (!zone) return;
    const s = starter();
    if (!s) { zone.innerHTML = ""; return; }
    const html = '<p class="wl-start-title">' + TOOLS.escapeHtml(I18N.t("welcome_start", { r: I18N.tr(s.recipe.name) })) + "</p>" +
      '<p class="wl-start-line">' + TOOLS.escapeHtml(startLine(s)) + "</p>" +
      '<p class="wl-start-why">' + TOOLS.escapeHtml(I18N.t(s.fromTable ? "welcome_start_table" : "welcome_start_everyday")) + "</p>";
    if (zone.innerHTML === html) return;
    zone.innerHTML = html;
    // The card catches the eye when the table changes its mind.
    if (!calm() && dialog() && dialog().open) {
      zone.classList.remove("wl-swap");
      void zone.offsetWidth;
      zone.classList.add("wl-swap");
    }
  }

  function renderChips() {
    chips($("#welcome-process"), PROCESSES, wl.process, "process");
    chips($("#welcome-roast"), ROASTS, wl.roast, "roast");
  }

  /* Saves the coffee (if it has a name) with the recipe as its
     recommendation, then opens the entry on it: the same path as « Brasser ce
     café » of Ctrl K, so the machine, the recipe, the dose and the grind come
     prefilled, and the coffee's roast sets the temperature. */
  async function brewFirst() {
    saveDial();
    const draft = draftCoffee();
    const s = starter();
    if (!draft.name) {
      const field = $("#welcome-coffee");
      if (field) {
        field.focus();
        field.classList.remove("wl-shake");
        void field.offsetWidth;
        if (!calm()) field.classList.add("wl-shake");
      }
      toast(I18N.t("welcome_name_needed"));
      return;
    }
    const coffee = await DATA.addCoffee({
      ...draft, pre_ground: 0, real_coffee_pct: 100, active: 1,
      recommended_method: s ? s.recipe.method : "", recommended_recipe: s ? s.recipe.name : "",
    });
    closeWelcome();
    UI.fillCoffeeSelect();
    UI.resetEntry();
    const sel = $("#f-coffee");
    sel.value = coffee.id;
    if (sel.value === coffee.id) UI.onCoffeeChoice();
    activateScreen("entry");
    toast(I18N.t("welcome_ready", { c: coffee.name }));
  }

  // ---------- Opening, closing ----------

  function openWelcome() {
    const d = dialog();
    if (!d || d.open) return;
    wl.gear = { Brikka: true, Switch: true };
    $$("#modal-welcome [data-gear]").forEach(b => setPressed(b, true));
    $$("#modal-welcome .wl-brewer-art").forEach((el, i) => UI.paintBrewer(el, i === 0 ? "Brikka" : "Switch"));
    const dial = $("#welcome-dial");
    if (dial && !dial.value) { dial.value = fallbacks.dial; dial.dispatchEvent(new Event("input", { bubbles: true })); }
    storeSubtitle();
    chooseStore(DATA.state.dirHandle ? "folder" : wl.store);
    // Seen again on purpose, over real cups: the demo would replace them, its button goes.
    $("#welcome-demo").hidden = DATA.state.extractions.length > 0;
    renderChips();
    renderStart();
    goTo(1, false);
    d.showModal();
  }

  function closeWelcome() {
    const d = dialog();
    if (d && d.open) d.close();
  }

  /* Called at the end of startApp (app.js): mayShow says the local data, and
     the sync if any, have left the logbook empty; the welcome still checks
     it has no coffee and no cup. #welcome opens it whatever the data. */
  function welcomeAfterStart(mayShow) {
    if (wl.asked) { wl.asked = false; openWelcome(); return; }
    if (!mayShow || DATA.state.coffees.length || DATA.state.extractions.length) return;
    openWelcome();
  }

  function wireWelcome() {
    const d = dialog();
    if (!d) return;
    d.addEventListener("click", ev => {
      const t = ev.target && ev.target.closest ? ev.target : null;
      if (!t) return;
      const store = t.closest("[data-store]");
      if (store) { chooseStore(store.dataset.store); return; }
      const gear = t.closest("[data-gear]");
      if (gear) { toggleGear(gear); return; }
      const proc = t.closest("[data-process]");
      if (proc) { wl.process = proc.dataset.process; renderChips(); renderStart(); return; }
      const roast = t.closest("[data-roast]");
      if (roast) { wl.roast = roast.dataset.roast; renderChips(); renderStart(); return; }
      const go = t.closest("[data-welcome-go]");
      if (go) { if (wl.step === 2) saveDial(); goTo(Number(go.dataset.welcomeGo), true); return; }
      // On the desktop the three steps are side by side: working in one lights it.
      const step = t.closest(".wl-step");
      if (step && !sliding() && Number(step.dataset.step) !== wl.step) goTo(Number(step.dataset.step), false);
    });
    d.addEventListener("focusin", ev => {
      const step = ev.target.closest && ev.target.closest(".wl-step");
      if (step && !sliding() && Number(step.dataset.step) !== wl.step) goTo(Number(step.dataset.step), false);
    });
    $("#welcome-create").addEventListener("click", () => linkFolder(true));
    $("#welcome-open").addEventListener("click", () => linkFolder(false));
    $("#welcome-back").addEventListener("click", () => goTo(wl.step - 1, true));
    $("#welcome-brew").addEventListener("click", brewFirst);
    $("#welcome-coffee").addEventListener("input", renderStart);
    $("#welcome-coffee").addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); brewFirst(); } });
    $("#welcome-dial").addEventListener("input", renderStart);
    // Leaving the welcome keeps the dial chosen, and puts the screen's name back in the address.
    d.addEventListener("close", () => {
      saveDial();
      if (location.hash === "#welcome") history.replaceState(null, "", "#" + UI.nav.screenName);
    });
    // A step that grows (the folder buttons, the starting recipe) grows the window with it.
    if (typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(() => { if (d.open) fitViewport(); });
      $$("#welcome-steps .wl-step").forEach(s => ro.observe(s));
    }
    // A width that crosses the threshold changes which steps the keyboard reaches.
    if (typeof matchMedia === "function") {
      const mq = matchMedia("(max-width: 899px)");
      if (mq.addEventListener) mq.addEventListener("change", () => { if (d.open) goTo(wl.step, false); });
    }
    // The Data window: see the first opening again, on purpose.
    const again = $("#db-welcome");
    if (again) again.addEventListener("click", () => { const m = $("#modal-data"); if (m && m.open) m.close(); openWelcome(); });
    I18N.subscribe(() => { if (d.open) { storeSubtitle(); renderChips(); renderStart(); } });
  }

  Object.assign(UI, { wireWelcome, welcomeAfterStart, openWelcome });
})();
