/* P3 (v9.13): DOING IT FROM THE KEYBOARD.
 *
 * One letter, when no field is being typed in and no modifier is held:
 *   N  a new cup              R  redo the last cup (or the hovered one)
 *   E  edit the hovered cup    C  compare the hovered cup
 *   G then A H J T G P        go to a screen (Accueil, Historique par date,
 *                             Journal par sachet, Tes réglages, Guide, Paramètres)
 *   J  K                      next, previous in the list (↓ ↑ in the side panel)
 *   Enter                     open the chosen cup      ?  this help
 *   Escape                    closes the side panel (the windows close themselves)
 * Ctrl K (⌘ K) belongs to js/ui-palette.js.
 *
 * Never while typing: an input, a textarea, a select, anything contenteditable
 * swallows every letter. Never over a window (the brew mode, Mes cafés, the
 * palette), and N R E C never on the entry screen: one stray key would
 * overwrite the form being filled. The decision (shortcutFor) is apart from
 * the DOM, so tools/boot.test.mjs checks it key by key. */
"use strict";

(() => {

  const { $, $$, toast } = UI;

  // G, then this letter, goes to this screen. « journal » and « history » are the two views of the history.
  const GO = { a: "dashboard", h: "history", j: "journal", t: "tuning", g: "guide", p: "settings" };
  const CHORD_MS = 1500;
  const kb = { chord: false, chordTimer: null };

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
     `ctx` says whether a field is being typed in, a window is open, the side
     panel is open, a G is pending, which screen is shown, and whether the
     focus is on a cup row. Returns an action name, or null to let the key
     through. */
  function shortcutFor(ev, ctx) {
    const key = ev && ev.key;
    if (!key || ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) return null;
    if (ctx.typing || ctx.modal) return null;
    if (key === "Escape") return ctx.panelOpen && !ctx.bubble ? "close" : null;
    const k = key.length === 1 ? key.toLowerCase() : "";
    if (ctx.chord) return GO[k] ? "go:" + GO[k] : "chord-cancel";
    if (key === "?") return "help";
    if (ctx.panelOpen && (key === "ArrowDown" || key === "ArrowUp")) return key === "ArrowDown" ? "next" : "prev";
    if (k === "j") return "next";
    if (k === "k") return "prev";
    if (k === "g") return "chord";
    if (key === "Enter" && ctx.onRow) return "open";
    if (ctx.screen === "entry") return null;
    if (k === "n") return "new";
    if (k === "r") return "redo";
    if (k === "e") return "edit";
    if (k === "c") return "compare";
    return null;
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
    return {
      typing: isTypingTarget(ev.target) || isTypingTarget(document.activeElement),
      modal: modalOpen(),
      panelOpen: !!(UI.panelIsOpen && UI.panelIsOpen()),
      bubble: !!(bubble && !bubble.hidden),
      chord: kb.chord,
      screen: UI.nav.screenName,
      onRow: !!focusedRow(),
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
      chordHint.innerHTML = "<kbd>G</kbd> " + Object.entries(GO).map(([k, s]) =>
        "<span><kbd>" + k.toUpperCase() + "</kbd> " + I18N.t("keys_go_" + s) + "</span>").join("");
      chordHint.hidden = false;
      kb.chordTimer = setTimeout(() => showChord(false), CHORD_MS);
    } else chordHint.hidden = true;
  }

  function toggleShortcutsHelp(force) {
    const d = $("#modal-shortcuts");
    if (!d) return;
    const open = force === undefined ? !d.open : force;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }

  function run(action) {
    if (action === "help") { toggleShortcutsHelp(); return; }
    if (action === "close") { UI.closePanel(); return; }
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
    run(action);
  }

  /* The keys, written in the rail next to the screens they lead to (desktop
     with a mouse only, css/finishing.css). Added here: they mean nothing
     without this file. */
  const RAIL_KEYS = { dashboard: "G A", entry: "N", history: "G H", tuning: "G T", guide: "G G", settings: "G P" };
  function addRailKeys() {
    $$(".rail-entry[data-screen]").forEach(b => {
      const keys = RAIL_KEYS[b.dataset.screen];
      if (!keys || b.querySelector(".rail-kbd")) return;
      const k = document.createElement("kbd");
      k.className = "rail-kbd";
      k.setAttribute("aria-hidden", "true");
      k.textContent = keys;
      b.appendChild(k);
    });
  }

  function wireShortcuts() {
    document.addEventListener("keydown", onKey);
    addRailKeys();
  }

  Object.assign(UI, { wireShortcuts, shortcutFor, isTypingTarget, toggleShortcutsHelp });
})();
