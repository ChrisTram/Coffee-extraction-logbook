/* M7, THE DURATION ON WHEELS (v9.13): the entry's times (total, drawdown, the
 * kettle's heating) are set on two narrow wheels, minutes and seconds.
 *
 * Each wheel is a native scroll-snap list three rows high: a swipe spins it
 * and it settles on a value, the mouse wheel and the arrow keys move it one
 * step on a computer. The two number fields are still there, laid over the
 * middle row: a tap on the middle row (or Tab) shows the field and the
 * keyboard, typing moves the wheel. They stay the source of truth, as before:
 * saving, the draft and the stopwatch read and write them, and the wheels
 * follow (UI.syncTimeWheel, called by writeDuration).
 *
 * Quick buttons beside: five seconds less or more, fifteen more, and
 * « Reprendre le chrono » when the stopwatch has a time, for the total and the
 * drawdown (from the "open" step), so a time forgotten on the wheels is one
 * tap away. Empty fields still mean "no time": the wheels show 0 dimmed, and
 * nothing is written until Chris turns one. */
"use strict";

(() => {

  const { $ } = UI;

  const QUICK = [-5, 5, 15];
  const DEFAULT_ROW = 28;
  const wheels = new Map();

  function reducedMotion() {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  const nextFrame = fn => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(fn) : setTimeout(fn, 16));
  // Where the browser says when a scroll has come to rest; elsewhere a short pause stands for it.
  const HAS_SCROLLEND = typeof window !== "undefined" && "onscrollend" in window;

  const valueOf = input => {
    const v = parseInt(input.value, 10);
    return Number.isFinite(v) ? v : null;
  };
  const rowHeight = col => {
    const item = col.scroll.querySelector(".tw-item");
    return (item && item.offsetHeight) || DEFAULT_ROW;
  };
  const clampTo = (col, v) => Math.max(0, Math.min(col.max, v));

  // ---------- One column ----------

  /* The drum effect: rows shrink and fade with their distance from the
     middle. Only the rows around the middle are touched. */
  function paintItems(col) {
    const centre = col.scroll.scrollTop / rowHeight(col);
    const items = col.items;
    const lo = Math.max(0, Math.floor(centre) - 3), hi = Math.min(items.length - 1, Math.ceil(centre) + 3);
    col.touched.forEach(i => { if (i < lo || i > hi) items[i].style.cssText = ""; });
    col.touched = [];
    for (let i = lo; i <= hi; i++) {
      const dist = Math.min(1.6, Math.abs(i - centre));
      items[i].style.cssText = "opacity:" + (1 - dist * 0.42).toFixed(2) + ";transform:scale(" + (1 - dist * 0.16).toFixed(3) + ")";
      col.touched.push(i);
    }
  }

  /* Brings a column onto its field's value. `smooth` animates, unless reduced
     motion. A scroll the code makes is never taken for Chris's. */
  function syncCol(col, smooth) {
    const v = clampTo(col, valueOf(col.input) || 0);
    col.user = false;
    const top = v * rowHeight(col);
    if (typeof col.scroll.scrollTo === "function") {
      col.scroll.scrollTo({ top, behavior: smooth && !reducedMotion() ? "smooth" : "instant" });
    } else {
      col.scroll.scrollTop = top;
    }
    nextFrame(() => paintItems(col));
  }

  /* Writes a value chosen on the wheel into its field, and fires the
     field's own event: the heating time estimates the temperature from it,
     the form drafts it. */
  function commit(inst, col, v) {
    col.committing = true;
    col.input.value = String(clampTo(col, v));
    col.input.dispatchEvent(new Event("input", { bubbles: true }));
    col.committing = false;
    afterChange(inst);
  }

  function afterChange(inst) {
    inst.host.classList.toggle("tw-empty", inst.cols.every(c => c.input.value === ""));
    UI.scheduleDraft();
  }

  // The scroll came to rest: if Chris moved it, the value is his.
  function settle(inst, col) {
    clearTimeout(col.settleTimer);
    const v = clampTo(col, Math.round(col.scroll.scrollTop / rowHeight(col)));
    if (col.user) {
      col.user = false;
      if (v !== valueOf(col.input)) commit(inst, col, v);
    }
    paintItems(col);
  }

  function stepCol(inst, col, d) {
    const next = clampTo(col, (valueOf(col.input) || 0) + d);
    commit(inst, col, next);
    syncCol(col, true);
  }

  function wireCol(inst, col) {
    const s = col.scroll;
    const mine = () => { col.user = true; };
    s.addEventListener("pointerdown", mine);
    s.addEventListener("touchstart", mine, { passive: true });
    s.addEventListener("scroll", () => {
      nextFrame(() => paintItems(col));
      if (HAS_SCROLLEND) return;
      clearTimeout(col.settleTimer);
      col.settleTimer = setTimeout(() => settle(inst, col), 160);
    }, { passive: true });
    s.addEventListener("scrollend", () => settle(inst, col));
    // The mouse wheel: one step per notch, a trackpad needs a real swipe.
    s.addEventListener("wheel", ev => {
      ev.preventDefault();
      col.wheelAcc += ev.deltaMode === 0 ? ev.deltaY : ev.deltaY * 40;
      if (Math.abs(col.wheelAcc) < 30) return;
      const d = Math.sign(col.wheelAcc);
      col.wheelAcc = 0;
      stepCol(inst, col, d);
    }, { passive: false });
    /* A tap on another row picks it; on the middle row it opens the field,
       for typing (the phone's number pad). */
    s.addEventListener("click", ev => {
      const item = ev.target.closest && ev.target.closest(".tw-item");
      if (!item) return;
      col.user = false;
      const v = Number(item.dataset.v);
      if (v === valueOf(col.input)) {
        col.input.focus();
        try { col.input.select(); } catch (e) { /* not selectable here */ }
      } else {
        commit(inst, col, v);
        syncCol(col, true);
      }
    });
    // Typing, or the field's own arrows: the wheel follows.
    col.input.addEventListener("input", () => {
      if (!col.committing) syncCol(col, true);
      inst.host.classList.toggle("tw-empty", inst.cols.every(c => c.input.value === ""));
    });
    /* A wheel hidden at mount (collapsed stopwatch, Brikka) has no height to
       scroll: it is put back on its value the moment it shows. */
    if (typeof ResizeObserver === "function") {
      let shown = false;
      new ResizeObserver(entries => {
        const h = entries[0] && entries[0].contentRect ? entries[0].contentRect.height : 0;
        if (h > 0 && !shown) syncCol(col, false);
        shown = h > 0;
      }).observe(s);
    }
  }

  function buildCol(input, pad) {
    const scroll = input.parentNode && input.parentNode.querySelector(".tw-scroll");
    if (!scroll) return null;
    const max = Number(input.max) > 0 ? Number(input.max) : 59;
    let html = '<span class="tw-pad"></span>';
    for (let v = 0; v <= max; v++) html += '<span class="tw-item" data-v="' + v + '">' + String(v).padStart(pad, "0") + "</span>";
    scroll.innerHTML = html + '<span class="tw-pad"></span>';
    return {
      input, scroll, max, user: false, committing: false, wheelAcc: 0, settleTimer: null, touched: [],
      items: scroll.querySelectorAll ? Array.from(scroll.querySelectorAll(".tw-item")) : [],
    };
  }

  // ---------- The quick buttons ----------

  /* The stopwatch's time for this field: the total, or the drawdown from the
     recipe's "open" step. null while there is nothing to take. */
  function chronoSeconds(kind) {
    const s = Math.round(UI.stopwatchElapsed());
    if (!(s > 0)) return null;
    if (kind === "total") return s;
    const open = UI.openingTime();
    return open !== null && s > open ? s - open : null;
  }

  function setSeconds(inst, total) {
    const [minCol, secCol] = inst.cols;
    const t = Math.max(0, Math.min(minCol.max * 60 + 59, Math.round(total)));
    minCol.input.value = String(Math.floor(t / 60));
    secCol.input.value = String(t % 60);
    // Both fields' own events: each wheel follows, and the form hears about it.
    inst.cols.forEach(c => c.input.dispatchEvent(new Event("input", { bubbles: true })));
    afterChange(inst);
  }

  function addSeconds(prefix, d) {
    const inst = wheels.get(prefix);
    if (!inst) return;
    const now = UI.readDuration(prefix);
    setSeconds(inst, (now === "" ? 0 : now) + d);
  }

  function quickMarkup(inst) {
    return QUICK.map(d => '<button type="button" class="tw-q" data-tw-add="' + d + '">' +
      (d < 0 ? "−" : "+") + Math.abs(d) + " s</button>").join("") +
      (inst.chrono ? '<button type="button" class="tw-q tw-chrono" data-tw-chrono hidden></button>' : "");
  }

  // ---------- Mounting ----------

  /* One wheel pair: `prefix` names the two fields (prefix-min, prefix-sec),
     `host` holds them, `quick` receives the buttons, `chrono` says which
     stopwatch time to offer ("total", "flow", or none). */
  function mountTimeWheel(prefix, host, quick, chrono) {
    const min = $("#" + prefix + "-min"), sec = $("#" + prefix + "-sec");
    if (!host || !min || !sec || wheels.has(prefix)) return null;
    const cols = [buildCol(min, 1), buildCol(sec, 2)];
    if (cols.some(c => !c)) return null;
    const inst = { prefix, host, quick, chrono: chrono || null, cols };
    wheels.set(prefix, inst);
    cols.forEach(c => wireCol(inst, c));
    if (quick) {
      quick.innerHTML = quickMarkup(inst);
      quick.addEventListener("click", ev => {
        const b = ev.target.closest && ev.target.closest("button");
        if (!b) return;
        if (b.hasAttribute("data-tw-chrono")) {
          const s = chronoSeconds(inst.chrono);
          if (s !== null) setSeconds(inst, s);
        } else {
          addSeconds(prefix, Number(b.dataset.twAdd));
        }
      });
    }
    host.classList.add("tw-on");
    syncTimeWheel(prefix);
    refreshTimeWheels();
    return inst;
  }

  // Back on the fields' values, without animation: a reset, an opened cup, the stopwatch.
  function syncTimeWheel(prefix) {
    const inst = wheels.get(prefix);
    if (!inst) return;
    inst.cols.forEach(c => syncCol(c, false));
    inst.host.classList.toggle("tw-empty", inst.cols.every(c => c.input.value === ""));
  }
  function syncTimeWheels() { wheels.forEach((inst, prefix) => syncTimeWheel(prefix)); }

  /* The « Reprendre le chrono » buttons, shown only when the stopwatch has
     something to give, and translated. Called on each stopwatch transition. */
  function refreshTimeWheels() {
    wheels.forEach(inst => {
      if (!inst.quick || !inst.chrono) return;
      const b = inst.quick.querySelector("[data-tw-chrono]");
      if (!b) return;
      const label = I18N.t("wheel_chrono");
      if (b.textContent !== label) b.textContent = label;
      const hide = chronoSeconds(inst.chrono) === null;
      if (b.hidden !== hide) b.hidden = hide;
    });
  }

  Object.assign(UI, { mountTimeWheel, syncTimeWheel, syncTimeWheels, refreshTimeWheels, addSeconds, wheelChronoSeconds: chronoSeconds });
})();
