/* P3 (v9.13): DOING IT FROM THE KEYBOARD.
 *
 * One letter, when no field is being typed in and no modifier is held:
 *   N  a new cup              R  redo the last cup (or the hovered one)
 *   E  edit the hovered cup    C  compare the hovered cup
 *   G then a letter           go to a screen (the table below)
 *   J  K                      next, previous in the list (↓ ↑ in the side panel)
 *   Enter                     open the chosen cup      ?  the help
 *   Escape                    closes the side panel (the windows close themselves)
 * Ctrl K (⌘ K) belongs to js/ui-palette.js.
 *
 * Never while typing: an input, a textarea, a select, anything contenteditable
 * swallows every letter. Never over a window (the brew mode, Mes cafés, the
 * palette), and N R E C never on the entry screen: one stray key would
 * overwrite the form being filled. The decision (shortcutFor) is apart from
 * the DOM, so tools/boot.test.mjs checks it key by key.
 *
 * DISCOVERABLE (v9.19). Every key of the site is written ONCE, in SHORTCUTS:
 * the chords and the letters are read from it, the rail writes its keys from
 * it, and the help is GENERATED from it, a compact popover opened by « ? » or
 * by the keyboard button at the foot of the rail. A key added there shows up
 * in the help, a key removed disappears. A one-time hint tells a desktop
 * visitor that « ? » exists, until he uses a shortcut or closes it. */
"use strict";

(() => {

  const { $, $$, toast } = UI;

  /* THE TABLE. `group` files the key in the help; `keys` are drawn as
     keycaps (a chord with `then`, « G puis A »); `screen` makes a G chord;
     `run` makes a letter act (run() below); `needs` is a selector that must
     exist for the key to exist, for the screens other files create. A key
     without `screen` nor `run` belongs to another file (the palette, the
     dials, the brew mode below) and is only listed. */
  const SHORTCUTS = [
    { group: "go", keys: ["G", "A"], then: true, screen: "dashboard" },
    { group: "go", keys: ["G", "H"], then: true, screen: "history" },
    { group: "go", keys: ["G", "J"], then: true, screen: "journal" },
    { group: "go", keys: ["G", "N"], then: true, screen: "analytics", needs: "#screen-analytics" },
    { group: "go", keys: ["G", "C"], then: true, screen: "coffees", needs: "#screen-coffees" },
    { group: "go", keys: ["G", "T"], then: true, screen: "tuning" },
    { group: "go", keys: ["G", "G"], then: true, screen: "guide" },
    { group: "go", keys: ["G", "P"], then: true, screen: "settings" },
    { group: "actions", keys: ["Ctrl", "K"], label: "keys_help_palette" },
    { group: "actions", keys: ["N"], run: "new", label: "keys_help_new" },
    { group: "actions", keys: ["R"], run: "redo", label: "keys_help_redo" },
    { group: "actions", keys: ["?"], label: "keys_help_help" },
    { group: "cups", keys: ["J", "K"], label: "keys_help_walk" },
    { group: "cups", keys: ["↓", "↑"], label: "keys_help_panel_walk" },
    { group: "cups", keys: ["Enter"], label: "keys_help_open" },
    { group: "cups", keys: ["E"], run: "edit", label: "keys_help_edit" },
    { group: "cups", keys: ["C"], run: "compare", label: "keys_help_compare" },
    { group: "cups", keys: ["Escape"], label: "keys_help_close" },
    // The entry: js/ui-dial.js, js/ui-rating-dial.js and js/ui-entry-aside.js own these.
    { group: "entry", keys: ["↑", "↓"], label: "keys_help_dial" },
    { group: "entry", keys: ["←", "→"], label: "keys_help_rating" },
    { group: "entry", keys: ["PageUp", "PageDown"], label: "keys_help_rating_point" },
    { group: "entry", keys: ["Home", "End"], label: "keys_help_rating_ends" },
    { group: "entry", keys: ["Escape"], label: "keys_help_aside" },
    // The brew mode: Space and → are run here (brewKey), Escape closes its window natively.
    { group: "brew", keys: ["Space"], label: "keys_help_brew_go" },
    { group: "brew", keys: ["→"], label: "keys_help_brew_next" },
    { group: "brew", keys: ["Escape"], label: "keys_help_brew_close" },
  ];
  const GROUPS = ["go", "actions", "cups", "entry", "brew"];
  // The single letters that act, read from the table: { n: "new", r: "redo", e: "edit", c: "compare" }.
  const LETTERS = {};
  SHORTCUTS.forEach(s => { if (s.run && s.keys.length === 1) LETTERS[s.keys[0].toLowerCase()] = s.run; });

  const CHORD_MS = 1500;
  const kb = { chord: false, chordTimer: null };

  /* A key whose screen exists. `has` tells whether a selector is in the page;
     without it (the tests' contexts), only the keys that need nothing. */
  const available = (s, has) => !s.needs || (typeof has === "function" && has(s.needs));
  const pageHas = sel => !!document.querySelector(sel);
  // The G chord for this letter, among the available screens.
  const chordFor = (k, has) => SHORTCUTS.find(s => s.screen && s.keys[1].toLowerCase() === k && available(s, has)) || null;

  /* A field that takes letters. Buttons and boxes do not: a letter typed on a
     focused checkbox is free. A slider does (its arrows move it). */
  const NOT_TYPING = ["button", "submit", "reset", "checkbox", "radio", "color", "file", "image"];
  function isTypingTarget(el) {
    if (!el || !el.tagName) return false;
    if (el.isContentEditable) return true;
    const tag = String(el.tagName).toUpperCase();
    if (tag === "TEXTAREA" || tag === "SELECT") return true;
    if (tag === "INPUT") return !NOT_TYPING.includes(String(el.type || "text").toLowerCase());
    const role = el.getAttribute ? el.getAttribute("role") : null;
    return role === "textbox" || role === "combobox" || role === "searchbox";
  }

  /* THE DECISION: which action this key asks for, given the context. Pure:
     `ctx` says whether a field is being typed in, a window is open, the brew
     mode is open, the side panel is open, a G is pending, which screen is
     shown, whether the focus is on a cup row, and (`has`) which screens
     exist. Returns an action name, or null to let the key through. */
  function shortcutFor(ev, ctx) {
    const key = ev && ev.key;
    if (!key || ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) return null;
    if (ctx.typing) return null;
    // The brew mode is a window of its own: two keys, nothing else.
    if (ctx.brew) return key === " " ? "brew-go" : key === "ArrowRight" ? "brew-next" : null;
    if (ctx.modal) return null;
    if (key === "Escape") return ctx.panelOpen && !ctx.bubble ? "close" : null;
    const k = key.length === 1 ? key.toLowerCase() : "";
    if (ctx.chord) {
      const target = chordFor(k, ctx.has);
      return target ? "go:" + target.screen : "chord-cancel";
    }
    if (key === "?") return "help";
    if (ctx.panelOpen && (key === "ArrowDown" || key === "ArrowUp")) return key === "ArrowDown" ? "next" : "prev";
    if (k === "j") return "next";
    if (k === "k") return "prev";
    if (k === "g") return "chord";
    if (key === "Enter" && ctx.onRow) return "open";
    if (ctx.screen === "entry") return null;
    return LETTERS[k] || null;
  }

  // ---------- The context ----------

  function modalOpen() {
    if (UI.isQuickOpen && UI.isQuickOpen()) return true;
    const rail = $("#rail");
    if (rail && rail.classList.contains("expanded")) return true;
    return $$("dialog[open]").some(d => !d.classList.contains("as-panel"));
  }

  // The rows a cup lives in, on each screen: the same as the side panel's lists.
  const CURSOR_ROWS = [
    ["dashboard", "#latest-list", "tr.last-clickable"],
    ["history", "#h-body", "tr.row-hist"],
    ["history", "#h-cards", ".h-card"],
    ["history", "#h-journal", ".h-card"],
  ];
  const ROW_SELECTOR = "tr.last-clickable[data-ext], tr.row-hist[data-id], .h-card[data-id]";
  const rowId = row => (row ? row.getAttribute("data-id") || row.getAttribute("data-ext") : null);
  // The focus is ON a cup row (not on a button inside it, which has its own Enter).
  function focusedRow() {
    const a = document.activeElement;
    return a && a.matches && a.matches(ROW_SELECTOR) ? a : null;
  }

  function context(ev) {
    const bubble = $("#bubble-cup");
    const brew = $("#modal-brew");
    return {
      typing: isTypingTarget(ev.target) || isTypingTarget(document.activeElement),
      modal: modalOpen(),
      brew: !!(brew && brew.open),
      panelOpen: !!(UI.panelIsOpen && UI.panelIsOpen()),
      bubble: !!(bubble && !bubble.hidden),
      chord: kb.chord,
      screen: UI.nav.screenName,
      onRow: !!focusedRow(),
      has: pageHas,
    };
  }

  // ---------- The actions ----------

  /* The cup a letter acts on: the one under the mouse, otherwise the one in
     the side panel (opening or walking the panel forgets the mouse). R falls
     back to the last cup. */
  function targetCup() {
    const id = (UI.hoveredCupId && UI.hoveredCupId()) || (UI.panelCupId && UI.panelCupId());
    return id ? DATA.state.extractions.find(e => e.id === id) || null : null;
  }

  // J and K without a panel: a cursor on the rows of the screen, carried by the focus.
  function moveCursor(delta) {
    const zone = CURSOR_ROWS.filter(([screen]) => screen === UI.nav.screenName)
      .map(([, root, rows]) => { const r = $(root); return r ? [...r.querySelectorAll(rows)].filter(x => x.offsetParent !== null) : []; })
      .find(list => list.length);
    if (!zone) return;
    const current = document.activeElement && document.activeElement.closest ? document.activeElement.closest(ROW_SELECTOR) : null;
    const i = zone.indexOf(current);
    const next = zone[i < 0 ? (delta > 0 ? 0 : zone.length - 1) : Math.max(0, Math.min(zone.length - 1, i + delta))];
    if (!next.hasAttribute("tabindex")) next.setAttribute("tabindex", "-1");
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: "nearest" });
  }

  // The name of a screen in the help: the rail's own label, so a renamed entry renames its key.
  function screenLabel(s) {
    if (s === "journal") return I18N.t("palette_journal");
    if (s === "history") return I18N.t("keys_label_history");
    const entry = $('.rail-entry[data-screen="' + s + '"] span');
    return entry && entry.textContent ? entry.textContent.trim() : I18N.t("keys_label_" + s);
  }

  // The hint while a G waits for its second letter.
  let chordHint = null;
  function showChord(on) {
    clearTimeout(kb.chordTimer);
    kb.chord = on;
    if (!chordHint) {
      chordHint = document.createElement("div");
      chordHint.className = "kbd-chord";
      chordHint.setAttribute("role", "status");
      chordHint.hidden = true;
      document.body.appendChild(chordHint);
    }
    if (on) {
      chordHint.innerHTML = "<kbd>G</kbd> " + SHORTCUTS.filter(s => s.screen && available(s, pageHas)).map(s =>
        "<span><kbd>" + s.keys[1] + "</kbd> " + I18N.t("keys_go_" + s.screen) + "</span>").join("");
      chordHint.hidden = false;
      kb.chordTimer = setTimeout(() => showChord(false), CHORD_MS);
    } else chordHint.hidden = true;
  }

  // ---------- The help, generated from the table ----------

  const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || "");
  // The keycap of one key, in words where the key has a name.
  const NAMED = { Escape: "key_escape", Enter: "key_enter", Space: "key_space", PageUp: "key_page_up",
    PageDown: "key_page_down", Home: "key_home", End: "key_end" };
  function keycap(k) {
    if (k === "Ctrl") return "<kbd>" + (isMac() ? "⌘" : "Ctrl") + "</kbd>";
    return "<kbd>" + TOOLS.escapeHtml(NAMED[k] ? I18N.t(NAMED[k]) : k) + "</kbd>";
  }
  function keysHtml(s) {
    return s.then ? keycap(s.keys[0]) + ' <span class="kp-then">' + I18N.t("keys_then") + "</span> " + keycap(s.keys[1])
      : s.keys.map(keycap).join("");
  }
  function helpHtml() {
    return GROUPS.map((g, gi) => {
      const rows = SHORTCUTS.filter(s => s.group === g && available(s, pageHas));
      if (!rows.length) return "";
      return '<section class="kp-group" style="--kp-i:' + gi + '"><h3>' + I18N.t("keys_group_" + g) + '</h3><dl class="keys-list">' +
        rows.map(s => "<div><dt>" + TOOLS.escapeHtml(s.screen ? screenLabel(s.screen) : I18N.t(s.label)) + "</dt><dd>" +
          keysHtml(s) + "</dd></div>").join("") + "</dl></section>";
    }).join("");
  }

  /* The help is a POPOVER (no window over the page): light dismiss, Escape,
     the keyboard button of the rail toggles it natively (popovertarget). An
     engine without the Popover API gets the same box, shown and hidden. */
  const popoverApi = () => !!(document.body && typeof document.body.showPopover === "function");
  function helpOpen(box) {
    if (!box) return false;
    if (popoverApi() && box.matches) { try { return box.matches(":popover-open"); } catch (e) { return false; } }
    return !box.hidden;
  }
  function renderHelp() {
    const grid = $("#keys-grid");
    if (grid) grid.innerHTML = helpHtml();
  }
  function toggleShortcutsHelp(force) {
    const box = $("#modal-shortcuts");
    if (!box) return;
    const isOpen = helpOpen(box);
    const open = force === undefined ? !isOpen : force;
    if (open === isOpen) return;
    if (popoverApi() && box.showPopover) {
      if (open) box.showPopover(); else box.hidePopover();
    } else {
      if (open) renderHelp();
      box.hidden = !open;
    }
  }

  // ---------- The one-time hint ----------

  const HINT_KEY = "keys-hint-done";
  const HINT_DELAYS_MS = [6000, 25000, 60000];
  let hintEl = null;
  const deskPointer = () => typeof matchMedia === "function" && matchMedia("(min-width: 1024px) and (hover: hover) and (pointer: fine)").matches;
  function hintDone() {
    try { return localStorage.getItem(HINT_KEY) === "1"; } catch (e) { return true; }
  }
  // A shortcut was used, or the hint closed: it never comes back on this device.
  function markShortcutsKnown() {
    try { localStorage.setItem(HINT_KEY, "1"); } catch (e) { /* without storage, it simply comes back */ }
    if (hintEl && !hintEl.hidden) {
      hintEl.classList.add("kh-leave");
      setTimeout(() => { if (hintEl) hintEl.hidden = true; }, 220);
    }
  }
  function showHint() {
    if (hintDone() || !deskPointer()) return true;
    // Not over a window, nor on a hidden page: it will try again a little later.
    if (modalOpen() || document.visibilityState === "hidden") return false;
    if (!hintEl) {
      hintEl = document.createElement("div");
      hintEl.className = "keys-hint";
      hintEl.setAttribute("role", "status");
      hintEl.hidden = true;
      document.body.appendChild(hintEl);
      hintEl.addEventListener("click", ev => {
        const close = ev.target.closest && ev.target.closest(".kh-close");
        markShortcutsKnown();
        if (!close) toggleShortcutsHelp(true);
      });
    }
    hintEl.innerHTML = '<button type="button" class="kh-open">' + I18N.t("keys_hint", { k: "<kbd>?</kbd>" }) + "</button>" +
      '<button type="button" class="kh-close" aria-label="' + TOOLS.escapeHtml(I18N.t("keys_hint_close")) + '">×</button>';
    // Just above the keyboard button of the rail, its tail pointing at it.
    const button = $("#btn-keys");
    const r = button && button.getBoundingClientRect ? button.getBoundingClientRect() : null;
    if (r && r.width && typeof window.innerHeight === "number") {
      const left = Math.max(12, Math.round(r.left + r.width / 2 - 100));
      hintEl.style.left = left + "px";
      hintEl.style.bottom = Math.round(window.innerHeight - r.top + 12) + "px";
      hintEl.style.setProperty("--kh-tail", Math.round(r.left + r.width / 2 - left - 6) + "px");
    }
    hintEl.hidden = false;
    return true;
  }
  function scheduleHint(i) {
    if (i >= HINT_DELAYS_MS.length || hintDone() || !deskPointer()) return;
    setTimeout(() => { if (!showHint()) scheduleHint(i + 1); }, HINT_DELAYS_MS[i]);
  }

  // ---------- Running ----------

  function run(action) {
    markShortcutsKnown();
    if (action === "help") { toggleShortcutsHelp(); return; }
    if (action === "close") { UI.closePanel(); return; }
    if (action === "brew-go" || action === "brew-next") {
      const target = $(action === "brew-go" ? "#br-go" : ".br-scene");
      if (target && !target.hidden && !target.disabled) target.click();
      return;
    }
    if (action === "next" || action === "prev") {
      const delta = action === "next" ? 1 : -1;
      if (UI.panelIsOpen()) UI.panelStep(delta);
      else moveCursor(delta);
      return;
    }
    if (action === "chord") { showChord(true); return; }
    if (action === "chord-cancel") { showChord(false); return; }
    if (action.startsWith("go:")) {
      showChord(false);
      const s = action.slice(3);
      if (UI.panelIsOpen()) UI.closePanel();
      if (s === "journal" || s === "history") UI.openHistoryView(s === "journal" ? "bag" : "date");
      else UI.activateScreen(s);
      return;
    }
    if (action === "open") {
      const row = focusedRow();
      const ext = row && DATA.state.extractions.find(e => e.id === rowId(row));
      if (ext) UI.openCup(ext, row);
      return;
    }
    if (action === "new") { UI.closePanel(); UI.activateScreen("entry"); return; }
    const cup = targetCup();
    if (action === "redo") {
      UI.closePanel();
      if (cup) { UI.redoCup(cup); toast(I18N.t("toast_duplicated")); }
      else toast(I18N.t(UI.redoLast() ? "toast_redo" : "toast_redo_empty"));
      return;
    }
    if (!cup) { toast(I18N.t("keys_no_cup")); return; }
    if (action === "edit") { UI.closePanel(); UI.loadExtractionIntoEntry(cup, false); }
    else if (action === "compare") UI.compareCup(cup.id);
  }

  function onKey(ev) {
    if (ev.defaultPrevented) return;
    const action = shortcutFor(ev, context(ev));
    if (!action) return;
    // N, R... auto-repeated while held: once is enough. J and K may repeat to scroll a list.
    if (ev.repeat && !["next", "prev"].includes(action)) { ev.preventDefault(); return; }
    ev.preventDefault();
    /* Space in the brew mode: a focused button there would take the key on
       its release and click itself too. It lets go of the focus first. */
    if (action === "brew-go" && document.activeElement && document.activeElement.blur &&
        document.activeElement.tagName === "BUTTON") document.activeElement.blur();
    run(action);
  }

  /* The keys, written in the rail next to the screens they lead to (desktop
     with a mouse only, css/finishing.css). Read from the table: a screen
     added by another file gets its keys as soon as it has a rail entry. */
  function railKeys() {
    const out = { entry: "N" };
    SHORTCUTS.forEach(s => { if (s.screen) out[s.screen] = s.keys.join(" "); });
    return out;
  }
  function addRailKeys() {
    const keys = railKeys();
    $$(".rail-entry[data-screen]").forEach(b => {
      const k = keys[b.dataset.screen];
      if (!k || b.querySelector(".rail-kbd")) return;
      const el = document.createElement("kbd");
      el.className = "rail-kbd";
      el.setAttribute("aria-hidden", "true");
      el.textContent = k;
      b.appendChild(el);
    });
  }

  function wireShortcuts() {
    document.addEventListener("keydown", onKey);
    // Ctrl K is a shortcut too: once used, the hint has nothing left to teach.
    document.addEventListener("keydown", ev => {
      if ((ev.ctrlKey || ev.metaKey) && String(ev.key).toLowerCase() === "k") markShortcutsKnown();
    }, true);
    addRailKeys();
    const box = $("#modal-shortcuts");
    if (box) {
      // The content is written on each opening: the screens and the language may have changed.
      if (popoverApi()) box.addEventListener("beforetoggle", ev => { if (ev.newState === "open") { renderHelp(); markShortcutsKnown(); } });
      else {
        box.hidden = true;
        $$("[popovertarget='modal-shortcuts']").forEach(b => b.addEventListener("click", () =>
          toggleShortcutsHelp(b.getAttribute("popovertargetaction") === "hide" ? false : undefined)));
      }
    }
    scheduleHint(0);
  }

  Object.assign(UI, { wireShortcuts, shortcutFor, isTypingTarget, toggleShortcutsHelp, SHORTCUTS, shortcutsHelpHtml: helpHtml, showKeysHint: showHint });
})();
