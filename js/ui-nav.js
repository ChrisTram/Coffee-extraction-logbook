/* M3 (v9.13): THE PHONE BAR, WITH ITS CENTRAL BUTTON.
 *
 * Five places: Tableau, Historique, the new cup in the middle (raised, always
 * at the same spot), Guide, and Plus. The floating quick entry button is gone,
 * its job moved here:
 *
 *   - a TAP on the central button opens the entry form, like "Nouvelle tasse"
 *     in the desktop rail (it is a .nav-btn: app.js already wires it);
 *   - a LONG PRESS on it opens the quick entry panel;
 *   - and the "Plus" sheet has a "Saisie rapide" entry, for whoever does not
 *     know about the long press, and for the keyboard.
 *
 * The mark under the active tab slides from one tab to the next. The screens
 * that live in the sheet (Mes réglages, Paramètres) put it under "Plus".
 * Nothing here exists above 1024 px, where the bar is not displayed. */
"use strict";

(() => {

  // Borrowed from the core, loaded before us.
  const { $, nav, LONG_PRESS_MS } = UI;

  // The tab standing for each screen. The sheet's screens are under "Plus".
  const BAR_TABS = { dashboard: "dashboard", history: "history", entry: "entry", guide: "guide", coffees: "plus", tuning: "plus", settings: "plus" };
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
       screen, crossing 1024 px): the mark follows without sliding. */
    const bar = $(".bottom-bar");
    if (bar && typeof ResizeObserver === "function") {
      new ResizeObserver(() => placeBarMark(null, true)).observe(bar);
    }
    placeBarMark(null, true);
    // The bean of the sync state is drawn from the start, before any exchange.
    UI.paintSyncBeans(DATA.state.syncState);
  }

  // Made available to the other screens.
  Object.assign(UI, { BAR_TABS, placeBarMark, wireNav, openQuickEntry });
})();
