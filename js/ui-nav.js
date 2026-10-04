/* M3 (v9.13): THE PHONE BAR, WITH ITS CENTRAL BUTTON.
 *
 * Five places: Accueil, Journal, the new cup in the middle (raised, always
 * at the same spot), Analyses, and Plus (N1, v9.21: Analyses took the Guide's
 * place, the Guide went into Plus). The floating quick entry button is gone,
 * its job moved here:
 *
 *   - a TAP on the central button opens the entry form, like "Nouvelle tasse"
 *     in the desktop rail (it is a .nav-btn: app.js already wires it);
 *   - a LONG PRESS on it opens the quick entry panel;
 *   - and the "Plus" sheet has a "Saisie rapide" entry, for whoever does not
 *     know about the long press, and for the keyboard.
 *
 * The mark under the active tab slides from one tab to the next. The screens
 * that live in the sheet (Réglages gagnants, Guide, Paramètres) put it under
 * "Plus". Nothing of the bar exists above 1024 px, where it is not displayed.
 *
 * N1 (v9.21) adds two things that live with the navigation on every width:
 * the mark of the RAIL, which slides from one entry to the next too, and the
 * DRAFT DOT, a copper dot on « Nouvelle tasse » and on the « + » while the
 * entry form holds a cup in progress (UI.draftInForm, js/ui-draft.js). */
"use strict";

(() => {

  // Borrowed from the core, loaded before us.
  const { $, nav, LONG_PRESS_MS, debounce } = UI;

  // The tab standing for each screen. The sheet's screens are under "Plus".
  const BAR_TABS = { dashboard: "dashboard", history: "history", entry: "entry", analytics: "analytics",
    guide: "plus", coffees: "plus", tuning: "plus", settings: "plus" };
  const tabOf = screen => {
    const key = BAR_TABS[screen];
    if (!key) return null;
    return key === "plus" ? $("#btn-plus") : $('.bottom-bar [data-screen="' + key + '"]');
  };

  /* Places the mark under the tab of the screen. In pixels from the bar's
     left edge, read from the tab itself: the five tabs share the width, so
     the position follows any phone width, the language and the zoom.
     "instant" skips the slide: on the first placement and on a resize, the
     mark must be where it belongs, not travel there. */
  function placeBarMark(screen, instant) {
    const name = screen || nav.screenName;
    placeRailMark(name, instant);
    paintDraftDot();
    const plus = $("#btn-plus");
    // "Plus" lights up for the screens it holds: you know where you are.
    if (plus) plus.classList.toggle("on", BAR_TABS[name] === "plus");
    const bar = $(".bottom-bar"), mark = $(".bar-mark"), tab = tabOf(name);
    // Desktop: the bar is not displayed, there is nothing to measure.
    if (!bar || !mark || !tab || !bar.offsetWidth) return;
    if (instant) mark.classList.remove("ready");
    mark.style.transform = "translateX(" + Math.round(tab.offsetLeft + tab.offsetWidth / 2 - mark.offsetWidth / 2) + "px)";
    if (!mark.classList.contains("ready")) {
      // A layout read before enabling the slide: otherwise the first placement would slide too.
      void mark.offsetWidth;
      mark.classList.add("ready");
    }
  }

  /* N1: THE RAIL'S MARK. One rounded block behind the active entry, that
     slides and resizes to the next one instead of the background jumping.
     Measured from the entry, like the bar's: the labels can wrap in English.
     An entry not displayed (the daily screens in the phone sheet, which the
     bar carries) has no mark. */
  function placeRailMark(name, instant) {
    const box = $(".rail-entries"), mark = $(".rail-mark");
    if (!box || !mark || typeof box.querySelector !== "function") return;
    const entry = box.querySelector('.rail-entry[data-screen="' + name + '"]');
    const shown = !!entry && entry.offsetParent !== null && entry.offsetHeight > 0;
    box.classList.toggle("has-mark", shown);
    if (!shown) { mark.classList.remove("ready"); return; }
    if (instant || !mark.classList.contains("ready")) mark.classList.remove("ready");
    mark.style.transform = "translateY(" + entry.offsetTop + "px)";
    mark.style.height = entry.offsetHeight + "px";
    if (!mark.classList.contains("ready")) {
      void mark.offsetWidth;
      mark.classList.add("ready");
    }
  }

  /* N1: THE DRAFT DOT. A cup started in the entry form (a time, a taste, a
     rating, a comment...) and left unsaved: « Nouvelle tasse » and the « + »
     wear a copper dot that pops in, say « brouillon en cours » to a screen
     reader, and the rail button's tooltip offers to resume it. Nothing is
     lost without it (the form keeps its content), the dot only says so. */
  function paintDraftDot() {
    const has = typeof UI.draftInForm === "function" && UI.draftInForm();
    [$(".rail-new"), $("#bar-new")].forEach(b => {
      if (!b) return;
      b.classList.toggle("has-draft", has);
      if (has) b.setAttribute("aria-describedby", "draft-note");
      else b.removeAttribute("aria-describedby");
    });
    const railNew = $(".rail-new");
    if (!railNew) return;
    if (has) railNew.setAttribute("title", I18N.t("draft_resume"));
    else railNew.removeAttribute("title");
  }

  /* THE LONG PRESS on the central button opens the quick entry. Same delay as
     the long press on pills and tags (LONG_PRESS_MS), cancelled as soon as the
     finger moves: a thumb sliding along the bar must not open anything. */
  function wireCentreButton() {
    const button = $("#bar-new");
    if (!button) return;
    let timer = null, origin = null, armed = false;
    const cancel = () => {
      clearTimeout(timer);
      timer = null;
      button.classList.remove("pressing");
    };
    /* The click that FOLLOWS a long press must do nothing: not open the entry
       form, and not close the panel that just opened, whose veil is now under
       the finger. Swallowed on the whole document, in the capture phase. A
       press held long enough for the system to drop that click leaves the trap
       armed: the next press, anywhere, disarms it. */
    document.addEventListener("click", ev => {
      if (!armed) return;
      armed = false;
      ev.stopPropagation();
      ev.preventDefault();
    }, true);
    document.addEventListener("pointerdown", () => { armed = false; }, true);
    button.addEventListener("pointerdown", ev => {
      if (ev.button > 0) return;
      origin = [ev.clientX, ev.clientY];
      button.classList.add("pressing");
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        armed = true;
        button.classList.remove("pressing");
        // A short buzz says the long press was understood, where the phone can.
        if (typeof navigator.vibrate === "function") { try { navigator.vibrate(12); } catch (e) { /* refused */ } }
        openQuickEntry();
      }, LONG_PRESS_MS);
    });
    button.addEventListener("pointermove", ev => {
      if (timer && origin && Math.hypot(ev.clientX - origin[0], ev.clientY - origin[1]) > 10) cancel();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(type => button.addEventListener(type, cancel));
    // No menu nor text selection under a held finger.
    button.addEventListener("contextmenu", ev => ev.preventDefault());
  }

  function openQuickEntry() {
    UI.toggleNavSheet(false);
    UI.toggleQuick(true);
  }

  function wireNav() {
    wireCentreButton();
    const quick = $("#rail-quick");
    if (quick) quick.addEventListener("click", openQuickEntry);
    /* The bar appears and changes width with the window (rotation, split
       screen, crossing 1024 px): the mark follows without sliding. The rail's
       mark too: its entries can wrap. */
    const bar = $(".bottom-bar");
    if (typeof ResizeObserver === "function") {
      if (bar) new ResizeObserver(() => placeBarMark(null, true)).observe(bar);
      const rail = $(".rail-entries");
      if (rail) new ResizeObserver(() => placeRailMark(nav.screenName, true)).observe(rail);
    }
    placeBarMark(null, true);
    /* The draft dot follows what the form holds as it is filled: typing,
       ticking a taste, the stopwatch's buttons. */
    const form = $("#form-entry");
    if (form) {
      const repaint = debounce(paintDraftDot, 180);
      ["input", "change", "click"].forEach(type => form.addEventListener(type, repaint));
    }
    // Its tooltip is in the language of the page.
    I18N.subscribe(paintDraftDot);
    // The bean of the sync state is drawn from the start, before any exchange.
    UI.paintSyncBeans(DATA.state.syncState);
  }

  // Made available to the other screens.
  Object.assign(UI, { BAR_TABS, placeBarMark, placeRailMark, paintDraftDot, wireNav, openQuickEntry });
})();
