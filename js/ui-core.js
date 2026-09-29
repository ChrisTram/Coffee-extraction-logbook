/* Interface core: the shared tools, the theme and the navigation.
 *
 * The whole rest of the interface is built on top of it, so this file loads
 * first and exposes the UI object that the others extend. It knows NO screen
 * in particular: when it must redraw one, it goes through UI, and that is
 * deliberate. A core that called renderHistory() directly would no longer
 * be a core, it would be the whole application with extra steps.
 *
 * A name placed here is a name every screen may use. That is a commitment:
 * before adding one, check that at least two screens really need it. */
"use strict";

const UI = (() => {

  // ---------- Small tools ----------

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  /* Toggles the visual state AND the announced state in one gesture. Keeping
     them apart would guarantee they diverge: it already happened on other
     projects, the class follows and the attribute stays frozen. */
  /* LONG PRESS on a pill or a tag: opens its definition. Hover does not exist
     under a finger and a tap does not trigger :focus-visible, so on the phone
     half of the vocabulary was unreachable. The short press keeps its toggle
     role, and the bubble is cancelled as soon as the finger moves so it does
     not fire during a scroll. */
  const LONG_PRESS_MS = 450;

  function enableLongPress(root) {
    let pendingTimer = null, target = null;
    // True between a bubble opened by long press and the click that follows it.
    let bubbleJustOpened = false;
    const dismiss = () => {
      root.querySelectorAll(".info-expanded").forEach(x => x.classList.remove("info-expanded"));
    };
    const cancel = () => { clearTimeout(pendingTimer); pendingTimer = null; target = null; };

    root.addEventListener("pointerdown", ev => {
      const el = ev.target.closest("[data-info]");
      if (!el) return;
      target = el;
      bubbleJustOpened = false;
      pendingTimer = setTimeout(() => {
        dismiss();
        el.classList.add("info-expanded");
        bubbleJustOpened = true;
        pendingTimer = null;
      }, LONG_PRESS_MS);
    });
    root.addEventListener("pointermove", cancel);
    root.addEventListener("pointerup", () => {
      // A long press already opened the bubble: the click that follows must
      // not also toggle the pill. Otherwise the click is let through.
      if (target && target.classList.contains("info-expanded")) {
        setTimeout(dismiss, 2500);
      }
      cancel();
    });
    root.addEventListener("pointercancel", () => { cancel(); dismiss(); });

    /* The click that FOLLOWS a long press must do nothing more: the bubble is
       already open, that was all that was asked. Without this, reading the
       definition of a descriptor selected it on the way, and the long press is
       the only way to open the bubble without a mouse.

       In the CAPTURE phase on the container, so before the target and before
       bubbling: that is what lets stopPropagation() keep the delegated
       handler, set on this same container, from seeing the event. */
    root.addEventListener("click", ev => {
      if (!bubbleJustOpened) return;
      bubbleJustOpened = false;
      ev.stopPropagation();
      ev.preventDefault();
    }, true);
  }

  /* Delays a call until the keystrokes stop. One function per use, not a
     shared queue: two different fields must not cancel each other. */
  /* Signature of a table: enough to know whether it moved, without comparing
     it row by row. maj_le moves on every mutation (see estampiller in
     data.js), the length covers deletions. */
  /* Lookup cache for the STATIC elements of index.html. Only use it on nodes
     that are never replaced ("jamais remplacés", a phrase the tests look for):
     a node coming from an innerHTML would be cached detached, and the
     following writes would go into the void. */
  const fieldCache = new Map();
  function $f(sel) {
    let el = fieldCache.get(sel);
    if (!el) { el = document.querySelector(sel); if (el) fieldCache.set(sel, el); }
    return el;
  }

  /* Writes ONLY if it changes. An innerHTML assignment invalidates the layout
     even when the content is identical, and the live line is rewritten on
     every character while most keystrokes change none of its parts: typing
     in the dial touches neither the ratio nor the cost. */
  function setHtml(el, html) {
    if (el && el.innerHTML !== html) el.innerHTML = html;
  }

  function setText(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  }

  function signatureTable(table) {
    let max = 0;
    for (const x of table) if (x.maj_le > max) max = x.maj_le;
    return table.length + ":" + max;
  }

  /* Runs the function only if the signature changed since last time.
     The key separates the memories: two callers must not step on each other. */
  const signatures = new Map();
  function ifChanged(key, table, fn) {
    const s = signatureTable(table);
    if (signatures.get(key) === s) return false;
    signatures.set(key, s);
    fn();
    return true;
  }

  /* Forces the next render, whatever the signature. Used by the language
     toggle: the data did not move, but all the text must be redone. */
  function forgetSignatures() {
    signatures.clear();
  }

  function debounce(fn, delay) {
    let h = null;
    return (...args) => {
      clearTimeout(h);
      h = setTimeout(() => fn(...args), delay === undefined ? 120 : delay);
    };
  }

  function setPressed(el, isActive) {
    el.classList.toggle("on", isActive);
    el.setAttribute("aria-pressed", isActive ? "true" : "false");
  }

  function toast(message) {
    const t = $("#toast");
    t.textContent = message;
    t.removeAttribute("hidden");
    clearTimeout(toast._h);
    toast._h = setTimeout(() => t.setAttribute("hidden", ""), 2600);
  }

  /* Message with an action button, five seconds. Used to undo a deletion,
     which is ALREADY done when this message shows: see
     deleteExtractionWithUndo. The button disappears with the message, so
     there is no follow-up to handle. */
  /* ONE AT A TIME (v8.71): two taps on "Save" during the write created two
     cups. The next call is ignored as long as the first one has not
     finished. */
  function oneAtATime(fn) {
    let ongoing = false;
    return async (...args) => {
      if (ongoing) return undefined;
      ongoing = true;
      try { return await fn(...args); } finally { ongoing = false; }
    };
  }

  /* UPDATES ANNOUNCE THEMSELVES (v8.72). It took "reloading twice": the
     installed PWA resumes from memory instead of reloading, and nothing
     watched for new versions. On returning to the app we ask the service
     worker to check, and when a new one takes over, a message offers to
     reload, only once, and only if there already was a version (not on the
     very first install). */
  function watchForUpdates() {
    if (!("serviceWorker" in navigator) || !location.protocol.startsWith("http")) return;
    const hadVersion = !!navigator.serviceWorker.controller;
    let offered = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadVersion || offered) return;
      offered = true;
      toastAction(I18N.t("maj_prete"), I18N.t("maj_recharger"), () => location.reload(), true);
    });
    navigator.serviceWorker.register("sw.js").then(reg => {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => { /* offline */ });
      });
    }).catch(() => { /* not critical */ });
  }

  function toastAction(message, label, action, persistent) {
    const t = $("#toast");
    t.innerHTML = "";
    t.appendChild(document.createTextNode(message + " "));
    const b = document.createElement("button");
    b.type = "button";
    b.className = "toast-action";
    b.textContent = label;
    b.addEventListener("click", () => {
      t.setAttribute("hidden", "");
      clearTimeout(toast._h);
      action();
    });
    t.appendChild(b);
    t.removeAttribute("hidden");
    clearTimeout(toast._h);
    if (persistent) return;
    toast._h = setTimeout(() => {
      t.setAttribute("hidden", "");
      t.textContent = "";
    }, 5000);
  }

  /* Yes or no question in a <dialog>, instead of confirm().

     On the phone, confirm() is a system box: it leaves the theme, ignores the
     page language (the message goes through I18N but not its buttons) and
     breaks the feel of an installed app. Here everything is in the page. The
     SAFE choice gets the focus: Enter cancels, you have to aim to confirm.
     Escape closes the native dialog, so it cancels too.

     Returns a promise of a boolean, so the caller reads as before:
     `if (!await askConfirm(texte)) return;`. */
  function askConfirm(message, options) {
    const d = $("#modal-confirm");
    if (!d || typeof d.showModal !== "function") return Promise.resolve(window.confirm(message));
    const danger = !!(options && options.danger);
    setText($("#confirm-title"), I18N.t("c_titre"));
    setText($("#confirm-text"), message);
    const ok = $("#confirm-ok"), noButton = $("#confirm-cancel");
    ok.textContent = (options && options.label) || I18N.t("c_ok");
    noButton.textContent = I18N.t("t_annuler");
    ok.classList.toggle("btn-danger", danger);
    // Reassigned on each opening: a single handler, never stacked.
    ok.onclick = () => d.close("ok");
    noButton.onclick = () => d.close("annuler");
    return new Promise(resolve => {
      const onClose = () => {
        d.removeEventListener("close", onClose);
        resolve(d.returnValue === "ok");
      };
      d.addEventListener("close", onClose);
      d.returnValue = "";
      d.showModal();
      noButton.focus();
    });
  }

  /* Deletes for real, immediately, and offers to go back.

     The order matters and it is deliberate. Delaying the deletion would have
     been simpler to write, but closing the tab during the delay would then
     have CANCELLED a deletion Chris believed done. Here the row goes right
     away, goes to the sync right away, and the undo re-inserts it as a new
     write, which the merge knows how to handle: it is later than the
     tombstone, so it wins. */
  async function deleteExtractionWithUndo(ext) {
    const copied = { ...ext };
    delete copied._c;
    await DATA.deleteExtraction(ext.id);
    UI.renderHistory();
    toastAction(I18N.t("t_supprimee"), I18N.t("t_annuler"), async () => {
      await DATA.restoreExtraction(copied);
      UI.renderHistory();
      toast(I18N.t("t_restauree"));
    });
  }

  function fmtDuration(s) {
    if (s === "" || s === null || s === undefined || isNaN(s)) return "";
    const m = Math.floor(s / 60), sec = Math.round(s % 60);
    return m + ":" + String(sec).padStart(2, "0");
  }

  function fmtVND(n) {
    if (n === "" || n === null || isNaN(n)) return "";
    return Math.round(n).toLocaleString("fr-FR") + " ₫";
  }

  // A single definition, in tools.js: see that file's header.
  const { average, localDateKey } = TOOLS;

  function localNow() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  /* THE TRACK OF A SLIDER. Sliders are drawn in CSS (thin track, thumb with
     an accent border) instead of accent-color, which renders differently on
     each engine. The CSS does not know the value: we give it --pc, the share
     of travel covered, and the track gradient stops there. Call it on every
     input AND on every write of .value by the code, or the track lies. */
  function paintSlider(slider) {
    if (!slider) return;
    const min = Number(slider.min) || 0, max = Number(slider.max);
    const v = Number(slider.value);
    const pc = isNaN(max) || max === min || isNaN(v) ? 0 : ((v - min) / (max - min)) * 100;
    slider.style.setProperty("--pc", Math.max(0, Math.min(100, pc)) + "%");
  }

  /* THE RATING WITHOUT A THUMB (v8.40). A slider cannot be empty: the absence
     of a rating lived in a "not rated yet" box, to untick ON TOP of setting
     the rating. It now lives on the slider itself, through the
     slider-inactive class, as long as it has not been touched. Putting a
     finger anywhere on the track rates, in a single gesture. Since v8.68 this
     class has no style: the slider keeps the same look, the label tells the
     state. Same mechanism in the entry form and in the quick entry. */
  function isRatingEmpty(slider) {
    return !!slider && slider.classList.contains("slider-inactive");
  }
  function markRating(slider, empty) {
    if (slider) slider.classList.toggle("slider-inactive", empty);
  }
  /* The keys that CHANGE the value. Tabbing through the slider must not rate
     the cup: the old unfiltered keydown did. */
  const SLIDER_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"];
  /* pointerdown on top of input: putting the finger where the slider already
     is fires no input, and the rating would have stayed empty unknowingly. */
  function wireRating(slider, after) {
    const onTouch = () => { markRating(slider, false); after(); };
    slider.addEventListener("input", onTouch);
    slider.addEventListener("pointerdown", onTouch);
    slider.addEventListener("keydown", ev => { if (SLIDER_KEYS.includes(ev.key)) onTouch(); });
  }

  /* DICTATING THE COMMENT (v8.43). Speaking while the cup cools down, hands
     busy. Chrome's and Safari's speech recognition goes through their
     servers: the button only exists if the browser knows it AND we are
     online, and it hides as soon as the connection drops. The dictated text
     is ADDED to what is already written and stays editable: nothing goes to
     storage before Save. */
  function wireDictation(button, field, label) {
    const Recognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!button || !field || !Recognition) return;
    const visible = () => { button.hidden = typeof navigator !== "undefined" && navigator.onLine === false; };
    visible();
    window.addEventListener("online", visible);
    window.addEventListener("offline", visible);
    let recognition = null;
    const setListening = isActive => {
      button.setAttribute("aria-pressed", String(isActive));
      if (label) label.textContent = I18N.t(isActive ? "dictee_ecoute" : "dictee");
    };
    button.addEventListener("click", () => {
      if (recognition) { recognition.stop(); return; }
      recognition = new Recognition();
      recognition.lang = I18N.locale();
      recognition.interimResults = false;
      recognition.continuous = false;
      const before = field.value.trim();
      recognition.onresult = ev => {
        const spoken = Array.from(ev.results).map(r => r[0].transcript).join(" ").trim();
        if (!spoken) return;
        field.value = (before ? before + " " : "") + spoken;
        field.dispatchEvent(new Event("input", { bubbles: true }));
      };
      recognition.onerror = ev => {
        if (ev.error === "not-allowed" || ev.error === "service-not-allowed") toast(I18N.t("dictee_refusee"));
        else if (ev.error === "network") toast(I18N.t("dictee_reseau"));
      };
      recognition.onend = () => { recognition = null; setListening(false); };
      try { recognition.start(); setListening(true); } catch (e) { recognition = null; setListening(false); }
    });
  }

  /* LINE ICONS. Same drawing as the navigation: 1.8 px, round caps, text
     colour. They replace the Unicode glyphs (⇄ ⚠ ⧉ ✎ 🗑) of the action
     buttons, which changed drawing with the platform and which the
     navigation's "never an emoji" rule already forbade elsewhere. The name
     is a key, not text: what is read is the button's title. */
  const ICONS = {
    chevron: '<path d="m9 6 6 6-6 6"/>',
    gauche: '<path d="m15 6-6 6 6 6"/>',
    comparer: '<path d="M4 8h13"/><path d="m14 5 3 3-3 3"/><path d="M20 16H7"/><path d="m10 13-3 3 3 3"/>',
    ratee: '<path d="M12 4 3 19h18z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
    dupliquer: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    modifier: '<path d="M12 20h8"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    supprimer: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    croix: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
  };
  function icon(nameKey) {
    return '<svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"' +
      ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[nameKey] || "") + "</svg>";
  }

  function fmtDateTime(dh) {
    const d = new Date(dh);
    if (isNaN(d)) return dh;
    return d.toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" }) + " " +
      d.toLocaleTimeString(I18N.locale(), { hour: "2-digit", minute: "2-digit" });
  }

  /* THE DAY IN WORDS (v8.82), for the subheadings of lists grouped by day:
     "Today", "Yesterday", then "Saturday 26 September". The year is only
     written if it is not the current one. */
  function dayLabelOf(dh) {
    const d = new Date(dh);
    if (isNaN(d)) return String(dh);
    const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
    const day = new Date(d); day.setHours(0, 0, 0, 0);
    const gap = Math.round((todayDate - day) / 86400000);
    if (gap === 0) return I18N.t("j_aujourdhui");
    if (gap === 1) return I18N.t("j_hier");
    const s = d.toLocaleDateString(I18N.locale(), { weekday: "long", day: "numeric", month: "long",
      year: d.getFullYear() === todayDate.getFullYear() ? undefined : "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  // The day key of a date_heure, for grouping: "2026-09-26".
  const dayKey = dh => String(dh).slice(0, 10);
  function fmtHour(dh) {
    const d = new Date(dh);
    return isNaN(d) ? "" : d.toLocaleTimeString(I18N.locale(), { hour: "2-digit", minute: "2-digit" });
  }

  // "2026-08-12" to "12 Aug 2026", building the date in LOCAL time
  // (new Date("2026-08-12") would be read as UTC).
  function fmtShortDate(s) {
    const [a, m, j] = String(s).split("-").map(Number);
    if (!a || !m || !j) return s;
    return new Date(a, m - 1, j).toLocaleDateString(I18N.locale(), { day: "numeric", month: "short", year: "numeric" });
  }

  function fmtDecimal(n, dec) {
    return Number(n.toFixed(dec)).toLocaleString(I18N.locale(), { maximumFractionDigits: dec });
  }

  function animateCounter(el, target, decimals, suffix, prefix) {
    const duration = 750, startedAt = performance.now();
    const dec = decimals || 0;
    function frame(t) {
      const p = Math.min(1, (t - startedAt) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = target * eased;
      el.textContent = (prefix || "") +
        v.toLocaleString(I18N.locale(), { minimumFractionDigits: dec, maximumFractionDigits: dec }) + (suffix || "");
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // Live recipes (editable, stored with the data).
  function liveRecipes() { return DATA.state.recettes.filter(r => r.actif !== 0); }
  function recipesForMethod(m) { return liveRecipes().filter(r => r.methode === m); }
  function findRecipe(nameKey) { return DATA.state.recettes.find(r => r.nom === nameKey); }
  function recipeWithVariants() { return liveRecipes().find(r => r.variantes); }

  // title attribute: the full value of a truncated cell, on hover.
  // Double quotes would break the attribute, so they are neutralised.
  // The shared escaping (TOOLS.escapeHtml), under its old name.
  function titleAttr(text) {
    return TOOLS.escapeHtml(text || "");
  }

  // "Sous-extrait (acide)|Astringent" to a translated display "Under-extracted (sour), Astringent".
  function displayedDiags(s) {
    return (s || "").split("|").filter(Boolean).map(d => I18N.diag(d)).join(", ");
  }

  function detailRatio(base, dose, water) {
    if (base === "chaudiere") return I18N.t("rt_chaudiere", { d: dose, e: water });
    if (base === "infusion") return I18N.t("rt_infusion", { d: dose, e: water });
    return "";
  }

  /* True when the cup was marked failed. An empty column means "not said",
     so not failed: that is the case of everything before the flag. */
  function isFailed(e) { return Number(e.ratee) === 1; }

  const INCLUDE_FAILED_KEY = "inclure-ratees";
  /* A READING preference, so local like the theme and the beeps: it changes
     what the figures tell, not the data. Nothing to sync. */
  function includeFailed() {
    try { return localStorage.getItem(INCLUDE_FAILED_KEY) === "1"; } catch (e) { return false; }
  }

  function toggleFailed(include) {
    try { localStorage.setItem(INCLUDE_FAILED_KEY, include ? "1" : "0"); } catch (e) { /* too bad */ }
  }

  /* The extractions we draw ADVICE from: insights, best settings, tastes,
     machine duel, trend. A failed cup describes a missed gesture, not a
     setting, and keeping it can get a correct setting condemned.

     COUNTS keep everything, always: cups drunk, grams used, cost, activity
     calendar, bag stock. The coffee was indeed used, and a gesture error does
     not erase the expense. That is the dividing line, and it fits in one
     sentence: what describes WHAT HAPPENED counts everything, what advises
     WHAT TO DO leaves the failed ones out. */
  function analyzableExts() {
    const all = extsWithCalcs();
    return includeFailed() ? all : all.filter(e => !isFailed(e));
  }

  /* KEPT IN MEMORY (v8.75). Every render, and every keystroke in the entry
     form, recomputed ratio, bag age and the rest for the whole history, dozens
     of times per dashboard render. The calculation is redone when the data
     moves: DATA revision, or tables replaced or grown (load, sync, add). A
     copy of the array is returned on every call: a caller that sorts does
     not disturb the others. */
  /* Each cup keeps its calculation as long as ITS content does not change
     (even modified in place, by a path that does not notify), and as long as
     the coffees and bags it depends on have not moved (DATA revision, tables
     replaced or grown). The returned array is new on every call. */
  let globalMemo = null, memoVersion = 0;
  const memoPerCup = new WeakMap();
  function extsWithCalcs() {
    const s = DATA.state;
    const key = [DATA.dataRevision ? DATA.dataRevision() : 0, s.cafes, s.cafes.length, s.achats, s.achats.length];
    if (!globalMemo || key.some((v, i) => v !== globalMemo[i])) { globalMemo = key; memoVersion++; }
    return s.extractions.map(e => {
      const sig = JSON.stringify(e);
      const m = memoPerCup.get(e);
      if (m && m.v === memoVersion && m.sig === sig) return m.obj;
      const obj = { ...e, _c: DATA.calcs(e) };
      memoPerCup.set(e, { sig, v: memoVersion, obj });
      return obj;
    });
  }

  // Dose used when nothing prefills it (recipe without a dose, blank form).
  // 15 g is the dose of all the original Switch recipes.
  const FACTORY_DOSE = 15;

  // Default heat level, personal scale from 1 to 10, Brikka only.
  /* 3 since Chris asked for it again. The scale has already been 3, then 4,
     then 2 (schema steps v1 and v2): it comes back to its starting point. */
  const FACTORY_FIRE = 3;

  /* The grinder's REAL setting, the one where the dial physically sits. It is
     not the same thing as a recipe's dial, which is a TARGET: the Brikka aims
     for 1.2.0 and the Switch for 1.6.0, but Chris leaves his C5 on 1.5.0, the
     "compromise that works for both" from his guide, so as not to recount the
     clicks at every machine change. The form prefilled the target and so made
     him record a grind he had not used.
     The target stays visible in the side panel, and the range warning keeps
     reporting a real gap. */
  const FACTORY_DIAL = "1.5.0";

  /* Read VIEW on the `reglages` table, which syncs. These three values
     describe Chris's EQUIPMENT: his grinder dial is the same seen from the
     phone and from the computer. They lived in localStorage, so his phone
     ignored what he set on the computer, and he could not see it since these
     are prefilled fields that look normal.

     The theme and the beeps, however, rightly stay local: a phone in the
     kitchen and a computer do not have the same needs.

     `replis` stays a plain object because it is read everywhere in the
     rendering code; it is just refreshed from DATA on every notification. */
  const FALLBACKS_KEY = "replis-saisie";
  /* Kettle boiling time, in seconds, from tap water.
     ZERO as long as Chris has not timed it: without a measure, no estimate,
     the entry help asks to do it once. */
  /* TWO MINUTES, measured by Chris on his kettle: tap water to a rolling
     boil. It was 0 until now, and the model refuses to compute without a
     boiling time: the temperature estimate from the heating time therefore
     NEVER started unless one went to set it in Settings. A correct factory
     fallback beats a neutral fallback that disables the feature. */
  const FACTORY_BOIL_S = 120;
  const fallbacks = { dose: FACTORY_DOSE, fire: FACTORY_FIRE, dial: FACTORY_DIAL, boil: FACTORY_BOIL_S, bubbles: "" };

  function loadFallbacks() {
    const r = DATA.currentSettings();
    fallbacks.dose = r.dose_g;
    fallbacks.fire = r.puissance_feu;
    fallbacks.dial = r.mouture_dial;
    fallbacks.boil = r.ebullition_s;
    fallbacks.bubbles = r.bulles_s;
    // The steps of the numeric correction (v8.48), as is: the row's columns.
    fallbacks.dessins = r.dessins || "";
    fallbacks.stepSizes = { pas_crans: r.pas_crans, pas_degres: r.pas_degres, pas_feu: r.pas_feu,
      pas_eau_g: r.pas_eau_g, pas_dose_g: r.pas_dose_g };
  }

  /* One-time takeover of the settings set before the sync. Without it, Chris
     would find the factory values again and have to set everything by hand.
     Marked once, and only if the table is still empty: a takeover that
     overwrote an already synced setting would be worse than none. */
  async function migrateLocalFallbacks() {
    let raw = null;
    try {
      if (localStorage.getItem("replis-repris")) return;
      raw = JSON.parse(localStorage.getItem(FALLBACKS_KEY) || "null");
      localStorage.setItem("replis-repris", "1");
    } catch (e) { return; }
    if (!raw || DATA.state.reglages.length) return;
    await DATA.updateSettings({
      dose_g: raw.dose,
      puissance_feu: raw.feu,
      mouture_dial: raw.molette,
    });
    loadFallbacks();
  }

  async function saveFallbacks() {
    await DATA.updateSettings({
      dose_g: fallbacks.dose,
      puissance_feu: fallbacks.fire,
      mouture_dial: fallbacks.dial,
      ebullition_s: fallbacks.boil,
      bulles_s: fallbacks.bubbles,
      ...(fallbacks.stepSizes || {}),
      dessins: fallbacks.dessins || "",
    });
  }

  // ---------- Theme ----------

  /* The two dark palettes (v8.34): data-theme gives the family, data-palette
     the palette. The status bar colour follows the palette. */
  const TINTS = { clair: "#f4ede3", graphite: "#111113", nuit: "#0b1017" };
  function applyTheme(theme, palette) {
    document.documentElement.setAttribute("data-theme", theme);
    if (palette) document.documentElement.setAttribute("data-palette", palette);
    try {
      localStorage.setItem("theme", theme);
      if (palette) localStorage.setItem("sombre", palette);
    } catch (e) { /* unavailable, too bad */ }
    /* The status bar of the installed PWA follows the theme. The two tags of
       the <head> only know the system preference, and the browser keeps the
       one whose media matches: so we write the chosen colour into BOTH,
       otherwise the one it keeps would contradict the choice. */
    const tint = theme === "sombre"
      ? TINTS[document.documentElement.getAttribute("data-palette")] || TINTS.graphite
      : TINTS.clair;
    document.querySelectorAll('meta[name="theme-color"]')
      .forEach(m => m.setAttribute("content", tint));
    if (typeof Chart !== "undefined") {
      CHARTS.applyDefaults();
      renderCurrentScreen(true);
    }
  }

  /* The restore on load lives in the <head> of index.html, not here: a
     deferred script only acts after the first render, and the light theme
     therefore flashed dark on every opening. */

  // ---------- Navigation ----------

  const SCREEN_NAMES = ["tableau", "saisie", "historique", "reglages", "guide", "parametres"];

  /* Old screen names still present in a bookmark or a PWA shortcut.
     "reference" merged into "guide": the reference and the buying guide
     talked about the same equipment and were read one after the other. */
  const RENAMED_SCREENS = { reference: "guide" };
  function normalizeScreen(nameKey) {
    return RENAMED_SCREENS[nameKey] || nameKey;
  }
  /* Navigation state, in a single object mutated in place rather than in
     separate variables. The shape matters: several files read and write it,
     and a shared object reads up to date everywhere, where a borrowed
     variable would be frozen on its value at load time. */
  const nav = { screenName: "tableau" };

  /* Wraps a screen change in a view transition when the engine can do it.
     Otherwise we call directly: the fallback is the previous behaviour, not
     a degraded version.

     Reduced motion is also respected here and not only in CSS: starting the
     machinery only to cancel it afterwards would be work for nothing. */
  function withTransition(fn) {
    const reducedMotion = typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    /* HIDDEN document (background tab, minimised window): the browser has no
       rendering opportunity, so the update callback would wait forever and
       the screen would only switch on return. We switch right away, without
       animation: nobody is watching it. */
    const cache = typeof document.visibilityState === "string" && document.visibilityState === "hidden";
    if (reducedMotion || cache || !document.startViewTransition) { fn(); return; }
    const transition = document.startViewTransition(fn);
    /* A transition interrupted by the next one, or skipped, rejects its
       promises: that is normal, and without this catch every quick screen
       switch left an "Uncaught (in promise)" in the console. */
    if (transition && transition.ready) transition.ready.catch(() => {});
    if (transition && transition.finished) transition.finished.catch(() => {});
  }

  /* forEditing: true ONLY when loadExtractionIntoEntry opens the
     screen. It used to be a shared flag, set before a forty-line body and
     reset after, without finally: an exception in the middle left it true
     forever and the edit abandonment below never fired again. Chris then
     reopened an old extraction believing he was entering a new one, and
     modified it without meaning to.

     As a parameter, there is no state left to get stuck: the information
     belongs to the call, it lives as long as the call. */
  function activateScreen(nameKey, forEditing) {
    /* Arriving on Entry through the navigation means "I want to log a cup",
       never "resume the edit from ten minutes ago". So we abandon the edit in
       progress, and we SAY so: without the message, the abandonment would be
       as silent as the bug it fixes. Nothing is lost in storage, the modified
       extraction had not been saved and can still be opened from the history. */
    if (nameKey === "saisie" && UI.entry.editId && !forEditing) {
      UI.resetEntry();
      toast(I18N.t("t_edition_abandonnee"));
    }
    /* Arriving on Entry for a NEW cup must show the current time. Here and
       not in renderCurrentScreen: that one replays on every data
       notification, and the date would jump while filling in the form. On
       arrival, once, is what we want. */
    if (nameKey === "saisie" && !UI.entry.editId) UI.refreshEntryDate();
    nav.screenName = nameKey;
    // Only the VISUAL switch goes into the transition. The edit abandonment
    // above is business logic: it happens in every case.
    withTransition(() => {
      $$(".screen").forEach(e => e.classList.remove("on"));
      /* aria-current="page" and not aria-pressed: these are navigation links
          disguised as buttons, not toggles. */
      $$(".nav-btn").forEach(b => {
        b.classList.toggle("on", b.dataset.screen === nameKey);
        if (b.dataset.screen === nameKey) b.setAttribute("aria-current", "page");
        else b.removeAttribute("aria-current");
      });
      const sec = $("#screen-" + nameKey);
      if (sec) sec.classList.add("on");
      if (location.hash !== "#" + nameKey) history.replaceState(null, "", "#" + nameKey);
      renderCurrentScreen();
    });
    window.scrollTo({ top: 0 });
  }

  function renderCurrentScreen(force) {
    if (nav.screenName === "tableau") { UI.renderDashboard(); UI.renderDrawings(); }
    else if (nav.screenName === "reglages") UI.renderTuning();
    else if (nav.screenName === "historique") UI.renderHistory();
    else if (nav.screenName === "parametres") UI.renderParameters();
    else if (nav.screenName === "guide" && force) UI.renderConverter();
  }

  return {
    $, $$, $f, LONG_PRESS_MS, FALLBACKS_KEY, FACTORY_DOSE, FACTORY_BOIL_S, SCREEN_NAMES, RENAMED_SCREENS,
    FACTORY_FIRE, FACTORY_DIAL, enableLongPress, activateScreen, animateCounter,
    debounce, applyTheme, titleAttr, withTransition, setPressed, fieldCache,
    toggleFailed, loadFallbacks, localDateKey, askConfirm, detailRatio, displayedDiags,
    saveFallbacks, isFailed, analyzableExts, includeFailed,
    dayKey, extsWithCalcs, fmtShortDate, fmtDateTime, fmtDecimal, fmtHour, dayLabelOf, fmtDuration, fmtVND, icon,
    localNow, markRating, wireDictation, wireRating, isRatingEmpty, paintSlider, average, nav, normalizeScreen, forgetSignatures, setHtml, setText,
    recipeWithVariants, recipesForMethod, liveRecipes, renderCurrentScreen, fallbacks,
    migrateLocalFallbacks, ifChanged, signatureTable, signatures,
    deleteExtractionWithUndo, toast, toastAction, findRecipe, oneAtATime, watchForUpdates,
  };
})();
