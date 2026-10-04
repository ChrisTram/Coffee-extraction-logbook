/* O6 (v9.21): YOUR MONTH IN COFFEE.
 *
 * The month had no recap. On the first days of a month (the 1st to the 3rd),
 * the Analyses page opens on the story of the month before, once per device;
 * « Revoir l'histoire » replays it any time. Four cards, tapped through like
 * stories, a progress bar per card at the top:
 *
 *   1. the month in figures (the cups, how many on each brewer, the days, the
 *      average);
 *   2. the coffee of the month, the one most brewed, in its jar;
 *   3. the discovery: a taste ticked for the very first time that month (or,
 *      without one, the taste of the month);
 *   4. your best cup, and « Refaire ».
 *
 * A card moves on by itself after a few seconds (not with reduced motion), a
 * press holds it, the left of the card goes back, the right goes on, a swipe
 * does the same on a phone, a swipe down or Escape closes. It is a <dialog>:
 * the focus stays inside, Escape is native.
 *
 * monthStory() and storyDue() are pure: tools/home.test.mjs runs them. */
"use strict";

(() => {

  const { $, localDateKey, fmtDecimal, average, nav } = UI;
  const escapeHtml = TOOLS.escapeHtml;
  const fmtRating = n => fmtDecimal(n, 1);
  const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hidden = () => typeof document.visibilityState === "string" && document.visibilityState === "hidden";
  const dayOf = dt => String(dt).slice(0, 10);
  const plural = n => (n > 1 ? "s" : "");

  // ---------- The story (pure) ----------

  // The month the story tells: the one before `now`, as "YYYY-MM".
  function storyMonth(now) {
    const d = new Date(now || new Date());
    const m = new Date(d.getFullYear(), d.getMonth() - 1, 1, 12);
    return m.getFullYear() + "-" + String(m.getMonth() + 1).padStart(2, "0");
  }

  /* The story of a month ("YYYY-MM"), or null without a cup in it. */
  function monthStory(exts, analyzable, key) {
    const cups = exts.filter(e => dayOf(e.date_time).slice(0, 7) === key);
    if (!cups.length) return null;
    const rated = analyzable.filter(e => e.score_10 !== "" && e.score_10 !== undefined && dayOf(e.date_time).slice(0, 7) === key);
    const notesOf = list => list.map(e => Number(e.score_10));
    // The coffee of the month: the most brewed, the better rated on a tie.
    const byCoffee = new Map();
    cups.forEach(e => byCoffee.set(e.coffee_id, (byCoffee.get(e.coffee_id) || 0) + 1));
    const coffees = [...byCoffee.entries()].map(([id, n]) => {
      const own = rated.filter(e => e.coffee_id === id);
      const c = DATA.state.coffees.find(x => x.id === id);
      return { id, n, name: c ? c.name : "", mean: own.length ? average(notesOf(own)) : null };
    }).sort((a, b) => b.n - a.n || (b.mean || 0) - (a.mean || 0));
    // The discovery: first ticked ever in that month; the most ticked of them.
    const firstSeen = new Map();
    exts.forEach(e => String(e.descriptors || "").split("|").filter(Boolean).forEach(t => {
      const d = dayOf(e.date_time);
      if (!firstSeen.has(t) || d < firstSeen.get(t)) firstSeen.set(t, d);
    }));
    const inMonth = new Map();
    cups.forEach(e => String(e.descriptors || "").split("|").filter(Boolean).forEach(t => inMonth.set(t, (inMonth.get(t) || 0) + 1)));
    const tastes = [...inMonth.entries()].map(([tag, n]) => ({ tag, n, first: firstSeen.get(tag), isNew: String(firstSeen.get(tag)).slice(0, 7) === key }));
    const discovery = tastes.filter(t => t.isNew).sort((a, b) => b.n - a.n || String(a.first).localeCompare(String(b.first)))[0] ||
      tastes.sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag))[0] || null;
    const best = rated.slice().sort((a, b) => Number(b.score_10) - Number(a.score_10) || String(b.date_time).localeCompare(String(a.date_time)))[0];
    return {
      key: key,
      cups: cups.length,
      brikka: cups.filter(e => e.method === "Brikka").length,
      switch: cups.filter(e => e.method === "Switch").length,
      days: new Set(cups.map(e => dayOf(e.date_time))).size,
      rated: rated.length,
      mean: rated.length ? average(notesOf(rated)) : null,
      coffee: coffees[0] || null,
      discovery: discovery,
      best: best ? { id: best.id, score: Number(best.score_10), coffee_id: best.coffee_id, recipe: best.recipe || "", date_time: best.date_time, method: best.method } : null,
    };
  }

  // The first three days of a month, and the story of the month before not seen yet here.
  function storyDue(now, seen) {
    const d = new Date(now || new Date());
    return d.getDate() <= 3 && seen !== storyMonth(d);
  }

  const monthName = key => new Date(key + "-01T12:00").toLocaleDateString(I18N.locale(), { month: "long" });

  // ---------- The banner on the Analyses page ----------

  /* Rewritten only when what it says changed (compared with what was
     written, not with innerHTML, which the browser serializes its own way):
     a sync answering twice must not cut a movement under way. */
  const written = new WeakMap();
  function put(el, html) {
    if (!el || written.get(el) === html) return false;
    written.set(el, html);
    el.innerHTML = html;
    return true;
  }

  const SEEN_KEY = "story-seen";
  let current = null;
  function currentStory() {
    return monthStory(UI.extsWithCalcs(), UI.analyzableExts(), storyMonth(new Date()));
  }

  /* Full the first week of the month, a single line after: « Revoir l'histoire »
     stays at hand all month. */
  function renderStoryBanner() {
    const card = $("#an-story");
    if (!card) return;
    current = currentStory();
    card.hidden = !current;
    if (!current) { put(card, ""); return; }
    const s = current, slim = new Date().getDate() > 7;
    const coffee = s.coffee ? I18N.tr(s.coffee.name) : "";
    const facts = [I18N.t("story_fact_cups", { n: s.cups, s: plural(s.cups) }),
      coffee ? I18N.t("story_fact_coffee", { c: coffee }) : "",
      s.discovery && s.discovery.isNew ? I18N.t("story_fact_discovery", { t: I18N.tag(s.discovery.tag) }) : "",
      s.best ? I18N.t("story_fact_best", { b: fmtRating(s.best.score) }) : ""].filter(Boolean);
    card.classList.toggle("slim", slim);
    const html = '<div class="as-text"><p class="highlight">' + escapeHtml(I18N.t("story_banner_over", { m: monthName(s.key) })) + "</p>" +
      (slim ? "" : '<p class="as-facts">' + facts.map(escapeHtml).join('<span class="hw-sep" aria-hidden="true"> · </span>') + "</p>") + "</div>" +
      '<button type="button" class="btn btn-small' + (slim ? " btn-subtle" : " btn-primary") + ' as-replay" data-story-open>' +
      escapeHtml(I18N.t("story_replay")) + " ›</button>";
    put(card, html);
  }

  /* The first days of the month, the page OPENS on the story, once per
     device and per month. */
  function maybeOpenStory() {
    let seen = null;
    try { seen = localStorage.getItem(SEEN_KEY); } catch (e) { return; }
    if (!storyDue(new Date(), seen) || hidden() || nav.screenName !== "analytics") return;
    if (document.querySelector("dialog[open]")) return;
    const s = current || currentStory();
    if (!s) return;
    try { localStorage.setItem(SEEN_KEY, s.key); } catch (e) { return; }
    openStory(s);
  }

  // ---------- The four cards ----------

  const CARD_MS = 6500;
  const play = { story: null, index: 0, timer: null, started: 0, left: CARD_MS, held: false };

  function cardHtml(s, i) {
    const month = monthName(s.key);
    if (i === 0) {
      const split = s.brikka && s.switch ? I18N.t("story_split", { s: s.switch, b: s.brikka })
        : I18N.t(s.switch ? "story_all_switch" : "story_all_brikka");
      return '<p class="st-over">' + escapeHtml(I18N.t("story_title", { m: month })) + "</p>" +
        '<p class="st-big" data-count="' + s.cups + '">' + s.cups + "</p>" +
        '<p class="st-line">' + escapeHtml(I18N.t("story_cups", { s: plural(s.cups) })) + ", " + escapeHtml(split) + "</p>" +
        '<p class="st-small">' + escapeHtml(I18N.t("story_days", { n: s.days, s: plural(s.days) })) +
        (s.mean !== null ? " · " + escapeHtml(I18N.t("story_mean", { m: fmtRating(s.mean) })) : "") + "</p>";
    }
    if (i === 1) {
      const c = s.coffee;
      const coffee = c ? DATA.state.coffees.find(x => x.id === c.id) : null;
      const gauge = coffee && DATA.bagGauge ? DATA.bagGauge(coffee.id, UI.fallbacks.dose) : null;
      return '<p class="st-over">' + escapeHtml(I18N.t("story_coffee_over")) + "</p>" +
        (gauge ? '<div class="st-jar" aria-hidden="true">' + UI.jarSvg({ grams: gauge.grams, bag: gauge.bag, roast: UI.jarRoast(coffee) }) + "</div>" : "") +
        '<p class="st-name">' + escapeHtml(c ? I18N.tr(c.name) : "") + "</p>" +
        '<p class="st-line">' + escapeHtml(I18N.t("story_coffee_line", { n: c ? c.n : 0, s: plural(c ? c.n : 0), t: s.cups })) + "</p>" +
        (c && c.mean !== null ? '<p class="st-small">' + escapeHtml(I18N.t("story_mean", { m: fmtRating(c.mean) })) + "</p>" : "");
    }
    if (i === 2) {
      const d = s.discovery;
      if (!d) return '<p class="st-over">' + escapeHtml(I18N.t("story_taste_over")) + "</p>" +
        '<p class="st-line">' + escapeHtml(I18N.t("story_taste_none")) + "</p>";
      const when = new Date(String(d.first) + "T12:00").toLocaleDateString(I18N.locale(), { day: "numeric", month: "long" });
      return '<p class="st-over">' + escapeHtml(I18N.t(d.isNew ? "story_discovery_over" : "story_taste_over")) + "</p>" +
        '<p class="st-name st-taste">' + escapeHtml(I18N.tag(d.tag)) + "</p>" +
        '<p class="st-line">' + escapeHtml(d.isNew ? I18N.t("story_discovery_line", { d: when }) : I18N.t("story_taste_line", { n: d.n })) + "</p>" +
        (I18N.tagInfo(d.tag) ? '<p class="st-small">' + escapeHtml(I18N.tagInfo(d.tag)) + "</p>" : "");
    }
    const b = s.best;
    if (!b) return '<p class="st-over">' + escapeHtml(I18N.t("story_best_over")) + "</p>" +
      '<p class="st-line">' + escapeHtml(I18N.t("story_best_none")) + "</p>";
    const coffee = DATA.state.coffees.find(x => x.id === b.coffee_id);
    const when = new Date(b.date_time).toLocaleDateString(I18N.locale(), { weekday: "long", day: "numeric", month: "long" });
    return '<p class="st-over">' + escapeHtml(I18N.t("story_best_over")) + "</p>" +
      '<p class="st-big">' + fmtRating(b.score) + "</p>" +
      '<p class="st-line">' + escapeHtml([coffee ? I18N.tr(coffee.name) : "", b.recipe ? I18N.tr(b.recipe) : ""].filter(Boolean).join(" · ")) + "</p>" +
      '<p class="st-small">' + escapeHtml(when) + "</p>" +
      '<button type="button" class="btn btn-primary st-redo" data-story-redo="' + escapeHtml(b.id) + '">' + escapeHtml(I18N.t("bubble_redo")) + "</button>";
  }

  function paintBars() {
    const bars = $("#story-bars");
    if (!bars) return;
    bars.innerHTML = [0, 1, 2, 3].map(i => '<span class="sb' + (i < play.index ? " done" : i === play.index ? " now" : "") + '"><i></i></span>').join("");
    const now = bars.querySelector(".sb.now i");
    if (now && !calm()) now.style.animationDuration = CARD_MS + "ms";
  }

  // Shows card i: the new one slides in from the side it comes from.
  function show(i, from) {
    const stage = $("#story-stage");
    if (!stage || !play.story) return;
    play.index = Math.max(0, Math.min(3, i));
    const html = '<div class="st-card st-' + play.index + '">' + cardHtml(play.story, play.index) + "</div>";
    const quiet = calm() || hidden();
    stage.innerHTML = html;
    const card = stage.firstChild;
    if (!quiet && card && card.classList) card.classList.add(from === "back" ? "st-in-back" : "st-in");
    const big = stage.querySelector("[data-count]");
    if (big && !quiet && typeof big.getClientRects === "function" && big.getClientRects().length) UI.animateCounter(big, Number(big.dataset.count), 0);
    paintBars();
    restartTimer();
  }

  // A card moves on by itself; a press holds it where it is.
  function restartTimer() {
    clearTimeout(play.timer);
    play.timer = null;
    if (calm() || play.index >= 3) return;
    play.left = CARD_MS;
    play.started = performance.now();
    play.timer = setTimeout(() => show(play.index + 1), CARD_MS);
  }
  function hold(on) {
    const frame = $("#modal-story");
    if (!frame || calm()) return;
    if (on && play.timer) {
      clearTimeout(play.timer);
      play.timer = null;
      play.left = Math.max(400, play.left - (performance.now() - play.started));
      frame.classList.add("held");
    } else if (!on && frame.classList.contains("held")) {
      frame.classList.remove("held");
      if (play.index >= 3) return;
      play.started = performance.now();
      play.timer = setTimeout(() => show(play.index + 1), play.left);
    }
  }

  function openStory(s) {
    const d = $("#modal-story");
    if (!d || !s || typeof d.showModal !== "function") return;
    play.story = s;
    d.classList.remove("closing");
    if (!d.open) d.showModal();
    show(0);
    const next = $("#story-next");
    if (next) next.focus();
  }
  function closeStory() {
    const d = $("#modal-story");
    clearTimeout(play.timer);
    play.timer = null;
    if (!d || !d.open) return;
    if (calm() || typeof d.animate !== "function") { d.close(); return; }
    d.classList.add("closing");
    setTimeout(() => { d.classList.remove("closing"); if (d.open) d.close(); }, 220);
  }

  function wireStory() {
    const d = $("#modal-story");
    const banner = $("#an-story");
    if (banner) banner.addEventListener("click", ev => {
      if (!ev.target.closest("[data-story-open]")) return;
      const s = current || currentStory();
      if (s) openStory(s);
    });
    if (!d) return;
    $("#story-close").addEventListener("click", closeStory);
    $("#story-prev").addEventListener("click", () => show(play.index - 1, "back"));
    $("#story-next").addEventListener("click", () => { if (play.index < 3) show(play.index + 1); else closeStory(); });
    // Escape: the native cancel of the dialog, with the same exit.
    d.addEventListener("cancel", ev => { ev.preventDefault(); closeStory(); });
    d.addEventListener("close", () => { clearTimeout(play.timer); play.timer = null; });
    d.addEventListener("keydown", ev => {
      if (ev.key === "ArrowRight") { ev.preventDefault(); if (play.index < 3) show(play.index + 1); }
      else if (ev.key === "ArrowLeft") { ev.preventDefault(); show(play.index - 1, "back"); }
    });
    d.addEventListener("click", ev => {
      const redo = ev.target.closest("[data-story-redo]");
      if (!redo) return;
      const ext = DATA.state.extractions.find(e => e.id === redo.dataset.storyRedo);
      closeStory();
      if (ext) { UI.redoCup(ext); UI.toast(I18N.t("setting_prefilled")); }
    });
    /* The finger: a press holds the card, a sideways swipe changes it, a
       swipe down closes. A tap is left to the two halves' buttons. */
    let start = null;
    d.addEventListener("pointerdown", ev => {
      if (ev.target.closest("button:not(.story-nav)")) return;
      start = { x: ev.clientX, y: ev.clientY, t: performance.now() };
      hold(true);
    });
    const end = ev => {
      if (!start) return;
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      start = null;
      hold(false);
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        ev.preventDefault();
        swallowClick = true;
        if (dx < 0) { if (play.index < 3) show(play.index + 1); } else show(play.index - 1, "back");
      } else if (dy > 80 && dy > Math.abs(dx)) { swallowClick = true; closeStory(); }
    };
    let swallowClick = false;
    d.addEventListener("pointerup", end);
    d.addEventListener("pointercancel", () => { start = null; hold(false); });
    // The click that ends a swipe must not also change the card.
    d.addEventListener("click", ev => { if (swallowClick) { swallowClick = false; ev.stopPropagation(); ev.preventDefault(); } }, true);
    // A hidden page holds the story where it is.
    document.addEventListener("visibilitychange", () => { if (d.open) hold(hidden()); });
  }

  Object.assign(UI, { storyMonth, monthStory, storyDue, renderStoryBanner, maybeOpenStory, wireStory, openStory });
})();
