/* R6 (v9.22): PULL TO SYNC.
 *
 * On a phone, pulling a list screen down from its very top (the home, the
 * journal, Mes cafés, Analyses) brings down a raw bean, the Q6 sync bean
 * (js/ui-sync-bean.js), on a small disc. It stretches as the finger pulls;
 * past the threshold it springs back into shape, then turns and roasts, from
 * ivory to brown, as the pull goes on. Let go there and the sync starts
 * through the same door as the Data panel's button (DATA.synchronize): the
 * bean keeps turning while it runs, finishes its roast, takes the look of the
 * result (roasted, grey and crossed out, reddish) and goes back up. Let go
 * before the threshold and it springs back up, nothing happens.
 *
 * WHEN IT STARTS. A touch phone only (pointer: coarse): the mouse gets
 * nothing. The page at its top, one finger, a move that is clearly downward;
 * never from a field, a sideways list, the table, the curves read under the
 * finger, a list that scrolls on its own and is not at its top, nor while a
 * window, the "Plus" sheet or the quick entry is open. The entry form and the
 * brew mode are not on the list of screens (the brew mode is a window).
 *
 * THE BROWSER. Chrome reloads the page on the same gesture. Where ours is
 * active, html carries .pull-on and the sheet sets overscroll-behavior-y on
 * it (css/gestures.css); body already had it since v8.x, but the viewport
 * takes the root's value. Every listener is passive: the scroll is never held.
 *
 * WITHOUT SYNC. Offline, on file://, in the demo: the pull still answers, the
 * bean settles and the toast says why nothing went up. No sound, ever.
 *
 * REDUCED MOTION. The bean does not stretch nor turn: it waits in place while
 * a ring around it fills, then the sync, then the result. */
"use strict";

(() => {

  // Borrowed from the core, loaded before us.
  const { $, $$, nav, toast } = UI;

  // The long screens read from their top. The entry form and the brew mode are never pulled.
  const PULL_SCREENS = ["dashboard", "history", "coffees", "analytics"];
  // Finger travel before the direction is decided: under it, a tap stays a tap.
  const SLOP = 10;
  // The bean's travel (px) that arms the sync, and the rubber's scale: it never goes past REACH.
  const ARM = 72;
  const REACH = 180;
  // Past the threshold, this much more travel roasts the bean through.
  const ROAST_SPAN = 60;
  // Where the bean waits while the sync runs, and the disc's height (it starts just above the screen).
  const REST = 64;
  const DISC = 52;
  // A sync of 100 ms still shows a real turn; a lost one gives up after 20 s.
  const MIN_SPIN_MS = 800;
  const SETTLE_MS = 20000;
  // One turn of the bean while it syncs (css/gestures.css, .pull-spin).
  const TURN_MS = 900;
  // How long the result stays in view before the bean goes back up.
  const SHOW_MS = 900;
  /* Where a pull never starts: what reads a finger itself (fields, the dials,
     the curves, the 30 day chart), the journal's table, the cup card, and
     anything that asks for it with data-no-pull. Sideways lists and inner
     scrollers are found by their computed style, see blockedFrom(). */
  const NO_PULL = "input, textarea, select, [contenteditable], canvas, svg[data-scrub], .rating-dial, .grind-dial, " +
    ".h-grid-wrap, #cup-card, [data-no-pull]";

  /* ---------- The pure part: travel, pose, outcome ---------- */

  /* The rubber: the bean follows the finger at first, then less and less,
     and never goes past REACH. */
  function pullTravel(dy) {
    return dy > 0 ? REACH * (1 - Math.exp(-dy / REACH)) : 0;
  }

  /* What the bean looks like at a given travel. Before the threshold it
     stretches (taller, thinner); past it, back in shape, it turns and
     roasts with the pull. Calm (reduced motion): it stays put and still, a
     ring around it fills instead. */
  function pullPose(travel, calm) {
    const t = Math.max(0, Number(travel) || 0);
    const armed = t >= ARM;
    if (calm) {
      return { y: REST, show: Math.min(1, t / 24), ring: Math.min(1, t / ARM), sx: 1, sy: 1, turn: 0, roast: 0, armed };
    }
    const stretch = armed ? 0 : t / ARM;
    const past = Math.max(0, t - ARM);
    return {
      y: t, show: Math.min(1, t / 16), ring: 0,
      sx: 1 - 0.18 * stretch, sy: 1 + 0.42 * stretch,
      turn: past * 2.4, roast: Math.min(1, past / ROAST_SPAN), armed,
    };
  }

  /* From the sync's answer to the bean's last look and the line the toast
     says. "local" (file://) and "not-configured" (no database on the server)
     are the same thing for Chris: no sync on this device. */
  function pullOutcome(state) {
    switch (state) {
      case "ok": return { look: "roasted", key: "toast_sync_ok" };
      case "offline": return { look: "off", key: "pull_offline" };
      case "local":
      case "not-configured": return { look: "idle", key: "pull_no_sync" };
      case "demo": return { look: "idle", key: "sync_demo" };
      case "session-expired": return { look: "alert", key: "sync_session" };
      case "outdated-version": return { look: "alert", key: "sync_outdated", reload: true };
      default: return { look: "alert", key: "toast_sync_failed" };
    }
  }

  /* ---------- Where and when ---------- */

  const media = q => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(q).matches;
  const isTouchPhone = () => media("(pointer: coarse)");
  const isCalm = () => media("(prefers-reduced-motion: reduce)");
  const pageTop = () => (typeof window !== "undefined" ? (window.scrollY || 0) : 0) <= 1;

  /* Something on top of the screen: a window, the "Plus" sheet, the quick
     entry, the palette. The pull belongs to the screen alone. */
  function somethingOpen() {
    if (document.querySelector("dialog[open]")) return true;
    const rail = $("#rail");
    if (rail && rail.classList.contains("expanded")) return true;
    if (UI.isQuickOpen && UI.isQuickOpen()) return true;
    return Boolean(UI.isPaletteOpen && UI.isPaletteOpen());
  }

  /* The finger landed on something that wants the move for itself: a
     control, a list that scrolls sideways (the stock corner, the tabs), a
     surface that takes the touch (touch-action without pan-y), or a list
     that scrolls on its own and is not at its top. */
  function blockedFrom(target) {
    if (!target || !target.closest) return false;
    if (target.closest(NO_PULL)) return true;
    for (let el = target; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      const cs = getComputedStyle(el);
      const ta = cs.touchAction || "auto";
      if (ta !== "auto" && ta !== "manipulation" && !/pan-y/.test(ta)) return true;
      if (/auto|scroll/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) return true;
      if (/auto|scroll/.test(cs.overflowY) && el.scrollTop > 0) return true;
    }
    return false;
  }

  function canStart(target) {
    return isTouchPhone() && PULL_SCREENS.includes(nav.screenName) && pageTop() &&
      !busy && !somethingOpen() && !blockedFrom(target);
  }

  /* html.pull-on where the pull is active, so the browser's own
     pull-to-refresh steps aside there and only there. */
  function markScreen() {
    const root = document.documentElement;
    if (root && root.classList) root.classList.toggle("pull-on", PULL_SCREENS.includes(nav.screenName));
  }

  /* ---------- The disc and its bean ---------- */

  let disc = null, shape = null, spin = null, roastLayer = null, ringFill = null;

  /* Built on the first pull. Two Q6 beans one on top of the other: the raw
     one below, the roasted one above, whose opacity is the roast. Both take
     their colours from the Q6 rules, per theme, and the top one takes the
     look of the result at the end. data-pull keeps paintSyncBeans away from
     them: they say what the pull does, not the global state. */
  function build() {
    if (disc) return;
    const bean = look => '<span class="sync-bean" data-pull data-look="' + look + '">' + UI.BEAN_SVG + "</span>";
    disc = document.createElement("div");
    disc.className = "pull-sync";
    disc.setAttribute("aria-hidden", "true");
    disc.hidden = true;
    disc.innerHTML =
      '<svg class="pull-ring" viewBox="0 0 52 52" focusable="false"><circle class="pull-ring-track" cx="26" cy="26" r="23"></circle>' +
      '<circle class="pull-ring-fill" cx="26" cy="26" r="23" pathLength="100"></circle></svg>' +
      '<span class="pull-shape"><span class="pull-spin">' + bean("raw") + bean("roasted") + "</span></span>";
    document.body.appendChild(disc);
    shape = disc.querySelector(".pull-shape");
    spin = disc.querySelector(".pull-spin");
    roastLayer = disc.querySelectorAll(".sync-bean")[1];
    ringFill = disc.querySelector(".pull-ring-fill");
  }

  function paint(p) {
    disc.style.transform = "translate3d(0, " + (p.y - DISC).toFixed(1) + "px, 0)";
    disc.style.opacity = String(p.show);
    shape.style.transform = "rotate(" + p.turn.toFixed(1) + "deg) scale(" + p.sx.toFixed(3) + ", " + p.sy.toFixed(3) + ")";
    roastLayer.style.opacity = String(p.roast);
    ringFill.style.strokeDashoffset = String(100 - 100 * p.ring);
    disc.classList.toggle("armed", p.armed);
  }

  /* ---------- The gesture ---------- */

  let start = null, pose = null, busy = false, calm = false, leaveTimer = 0;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const findTouch = (list, id) => Array.from(list || []).find(t => t.identifier === id) || null;

  function onStart(ev) {
    if (ev.touches.length !== 1) { if (start && start.live) letGo(false); start = null; return; }
    if (!canStart(ev.target)) { start = null; return; }
    const t = ev.touches[0];
    start = { id: t.identifier, x: t.clientX, y: t.clientY, live: false };
  }

  function onMove(ev) {
    if (!start) return;
    const t = findTouch(ev.touches, start.id);
    if (!t) return;
    const dx = t.clientX - start.x, dy = t.clientY - start.y;
    if (!start.live) {
      if (Math.hypot(dx, dy) < SLOP) return;
      // Clearly downward (within about 35 degrees of vertical) and still at the top; anything else is not ours.
      if (dy <= 0 || Math.abs(dx) > dy * 0.7 || !pageTop()) { start = null; return; }
      start.live = true;
      start.y += SLOP;
      begin();
    }
    /* Painted right here: the browser already sends one touchmove per frame,
       and the writes are styles only, no layout is read. */
    pose = pullPose(pullTravel(t.clientY - start.y), calm);
    paint(pose);
  }

  function onEnd(ev) {
    if (!start) return;
    const live = start.live;
    if (findTouch(ev.touches, start.id)) return;
    start = null;
    if (live) letGo(ev.type === "touchend" && pose && pose.armed);
  }

  function begin() {
    build();
    clearTimeout(leaveTimer);
    calm = isCalm();
    disc.className = "pull-sync pulling" + (calm ? " calm" : "");
    roastLayer.dataset.look = "roasted";
    pose = pullPose(0, calm);
    paint(pose);
    disc.hidden = false;
  }

  function letGo(sync) {
    if (!disc) return;
    if (sync) { runPulled(); return; }
    // Before the threshold: the bean springs back into shape and goes back up.
    disc.classList.remove("pulling", "armed");
    disc.classList.add("leaving");
    paint({ ...pullPose(0, calm), show: 0 });
    leaveTimer = setTimeout(reset, 380);
  }

  function reset() {
    if (!disc) return;
    disc.hidden = true;
    disc.className = "pull-sync";
    roastLayer.dataset.look = "roasted";
    busy = false;
  }

  /* ---------- The sync ---------- */

  /* Waits for a sync already in flight (the automatic one) to land: the pull
     joined it rather than starting a second one (DATA.synchronize). */
  async function settled() {
    const until = Date.now() + SETTLE_MS;
    while (DATA.state.syncState === "syncing" && Date.now() < until) await sleep(150);
    return DATA.state.syncState;
  }

  /* Through the same door as the Data panel's button. Never throws: a sync
     that fails is a look and a line, not an exception. */
  async function runSync() {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
    if (!DATA.syncPossible()) return DATA.state.demoActive ? "demo" : "local";
    try {
      const state = await DATA.synchronize(true);
      return state === "syncing" ? await settled() : state;
    } catch (e) {
      return "error";
    }
  }

  /* The turn ends where it started: the class leaves at the end of a lap, so
     the bean never snaps back to upright. */
  function stopSpin() {
    if (calm || !spin.classList.contains("spinning")) return Promise.resolve();
    return new Promise(resolve => {
      const done = () => { clearTimeout(timer); spin.removeEventListener("animationiteration", done); spin.classList.remove("spinning"); resolve(); };
      const timer = setTimeout(done, TURN_MS + 80);
      spin.addEventListener("animationiteration", done);
    });
  }

  async function runPulled() {
    busy = true;
    const turn = pose ? pose.turn : 0;
    disc.classList.remove("pulling");
    disc.classList.add("syncing");
    // It settles where it waits, back in shape, and keeps turning while the roast goes on.
    paint({ ...pullPose(ARM, calm), y: REST, show: 1, turn, ring: 1, roast: pose ? pose.roast : 0 });
    if (!calm) spin.classList.add("spinning");
    roastLayer.style.opacity = String(Math.max(Number(roastLayer.style.opacity) || 0, 0.85));
    const began = Date.now();
    const state = await runSync();
    const rest = MIN_SPIN_MS - (Date.now() - began);
    if (rest > 0) await sleep(rest);
    await stopSpin();
    finish(pullOutcome(state));
  }

  function finish(out) {
    disc.classList.add("done");
    roastLayer.dataset.look = out.look;
    roastLayer.style.opacity = "1";
    if (out.reload && UI.toastAction) UI.toastAction(I18N.t(out.key), I18N.t("update_reload"), () => location.reload());
    else if (out.key) toast(I18N.t(out.key));
    setTimeout(() => {
      disc.classList.add("leaving");
      // Calm, it fades where it stands; otherwise it goes back up.
      paint({ ...pullPose(0, calm), y: calm ? REST : 0, show: 0, turn: 0, ring: 1, roast: 1 });
      leaveTimer = setTimeout(reset, 380);
    }, SHOW_MS);
  }

  /* ---------- Wiring ---------- */

  function wirePull() {
    if (typeof document === "undefined" || !document.addEventListener) return;
    const passive = { passive: true };
    document.addEventListener("touchstart", onStart, passive);
    document.addEventListener("touchmove", onMove, passive);
    document.addEventListener("touchend", onEnd, passive);
    document.addEventListener("touchcancel", onEnd, passive);
    // The screen changes inside a view transition: the class follows the screens' own.
    if (typeof MutationObserver === "function") {
      const watch = new MutationObserver(markScreen);
      $$(".screen").forEach(s => watch.observe(s, { attributes: true, attributeFilter: ["class"] }));
    }
    markScreen();
  }

  // Made available to the other screens, and to the tests (the pure part).
  Object.assign(UI, { wirePull, pullTravel, pullPose, pullOutcome, PULL_SCREENS });
})();
