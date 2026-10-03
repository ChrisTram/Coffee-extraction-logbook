/* Q6 (v9.13): THE SYNC BEAN.
 *
 * The sync state between devices used to be an 8 px dot in the rail. It is
 * now a coffee bean, drawn as one: an oval with its S shaped crease and a
 * soft highlight. A RAW bean, unroasted and ivory (never green: no green hue
 * anywhere, base.css), turns while the logbook talks to the server; once
 * everything is up to date it is ROASTED, dark brown and a little glossy, and
 * pops once; offline it is grey and crossed out; when
 * the sync fails it turns reddish. One glance tells whether the other device
 * has the last cup.
 *
 * It appears wherever the state does: the rail (the "Plus" sheet on a phone),
 * on the bar's "Plus" icon, in the Data panel and in the Settings list. Every
 * element carrying .sync-bean gets the drawing and the look; the sentence
 * next to it does not change.
 *
 * The status line itself (SYNC_LABELS, updateSyncStatus) lived in app.js
 * until v9.13: it moved here with its indicator. */
"use strict";

(() => {

  // Borrowed from the core, loaded before us.
  const { $, $$ } = UI;

  // A status line for sync between devices. The manual button only appears
  // where sync makes sense, so not on file:// nor in demo mode.
  const SYNC_LABELS = {
    local: "sync_local",
    demo: "sync_demo",
    syncing: "sync_in_progress",
    offline: "sync_offline",
    "session-expired": "sync_session",
    "not-configured": "sync_not_configured",
    "outdated-version": "sync_outdated",
    error: "sync_error",
  };

  /* The state, in four looks and a neutral one. "idle" says that nothing is
     happening here: on file://, in demo mode, before the first exchange, or
     when the server has no database. */
  const BEAN_LOOKS = {
    syncing: "raw",
    ok: "roasted",
    offline: "off",
    error: "alert",
    "session-expired": "alert",
    "outdated-version": "alert",
  };
  const beanLook = state => BEAN_LOOKS[state] || "idle";

  /* The drawing, in a 24 unit box. The bean leans like a real one: a darker
     oval for its rounded edge, a lighter face shifted up and left, the crease
     as an S along the long axis, and a highlight on the upper left. The
     slash, drawn over a knockout of the background, only shows offline.
     Colours come from finishing.css (custom properties per look and theme):
     the drawing carries no colour of its own. */
  const BEAN_SVG = '<svg class="bean" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<g transform="rotate(-32 12 12)">' +
    '<ellipse class="bean-rim" cx="12" cy="12" rx="7.1" ry="9.7"></ellipse>' +
    '<ellipse class="bean-face" cx="11.35" cy="11.25" rx="6.25" ry="8.75"></ellipse>' +
    '<path class="bean-crease" d="M12.1 2.9c-2.4 3.1 2.3 5.8 -0.1 9.1s2.3 6 -0.1 9.1"></path>' +
    '<path class="bean-gloss" d="M8.3 6.9c-1.2 1.7 -1.5 3.9 -0.9 6.1"></path>' +
    "</g>" +
    '<path class="bean-gap" d="M4.5 19.5L19.5 4.5"></path><path class="bean-slash" d="M4.5 19.5L19.5 4.5"></path>' +
    "</svg>";

  let lastLook = null;

  /* Gives every bean of the page the look of the state. The roasted bean pops
     ONCE, when it comes out of a sync: not on every data notification, which
     replays this function while the state does not move. */
  function paintSyncBeans(state, label) {
    const look = beanLook(state);
    const pop = lastLook === "raw" && look === "roasted";
    lastLook = look;
    $$(".sync-bean").forEach(b => {
      if (!b.querySelector("svg")) b.innerHTML = BEAN_SVG;
      b.dataset.state = state || "never";
      b.dataset.look = look;
      if (label) b.title = label;
      // Only where it shows: a hidden bean would keep the class and pop later, when opened.
      b.classList.remove("pop");
      if (pop && b.getClientRects().length) {
        // A layout read between the two, so the animation restarts if it was still running.
        void b.offsetWidth;
        b.classList.add("pop");
        b.addEventListener("animationend", () => b.classList.remove("pop"), { once: true });
      }
    });
  }

  function updateSyncStatus() {
    const syncState = DATA.state.syncState;
    let text;
    if (syncState === "ok") {
      text = I18N.t("sync_ok", {
        h: new Date(DATA.state.syncedAt).toLocaleTimeString(I18N.locale(), { hour: "2-digit", minute: "2-digit" }),
      });
    } else {
      text = I18N.t(SYNC_LABELS[syncState] || "sync_never");
    }
    // The server document has a cap: we warn at half, early enough to archive.
    const { syncSize: size, syncCap: cap } = DATA.state;
    if (cap > 0 && size / cap >= 0.5) {
      text += " " + I18N.t("sync_size", { p: Math.round(100 * size / cap) });
    }
    $$(".sync-text").forEach(e => { e.textContent = text; });
    /* The bean takes the look of the state: in the rail it is the only place
       where sync shows without opening a panel. */
    paintSyncBeans(syncState || "never", text);
    $("#db-sync").hidden = !DATA.syncPossible();
  }

  // Made available to the other screens.
  Object.assign(UI, { SYNC_LABELS, beanLook, paintSyncBeans, updateSyncStatus });
})();
