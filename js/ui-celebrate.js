/* R4 AND R9 (v9.23): THE STEAM, THE STREAK AND THE MILESTONES.
 *
 *   - R4, THE STEAM. For fifteen minutes after a cup's time (its date_time,
 *     not the moment it was typed), soft wisps rise over the score of the last
 *     cup card, « encore chaude »; they thin out as the minutes pass, then
 *     vanish. A smaller wisp rides on the folded band. CSS animations only,
 *     paused while the page is hidden, removed by one timer when the time is
 *     up: nothing runs every frame.
 *   - R9, THE STREAK: « 6 jours d'affilée » on the home's week line, from two
 *     days on, with a small cup and its flame (dimmed until today has a cup).
 *   - R9, THE MILESTONES: right after « Enregistrer », a cup that crosses one
 *     (the 100th cup, a first 10, a record streak...) gets a burst of beans out
 *     of the saved cup's card (js/ui-cup.js) and one line, « 100e tasse ! ».
 *     A record on the bag (J6) that comes with it joins the same line: one
 *     moment, never two. Each milestone is celebrated once per device
 *     (localStorage `milestones-seen`); the first time, everything already
 *     reached counts as seen. Only a save celebrates: a sync or an import
 *     brings old milestones silently.
 *   - R9, THE TILE of Analyses: the current and best streaks, the milestones
 *     reached with their dates (each opens its cup), the next one.
 *
 * The rules are in js/milestones.js (pure). With reduced motion: a still,
 * faint wisp and its label; the line fades in, no beans. */
"use strict";

(() => {

  const { $, titleAttr, fmtDecimal } = UI;
  const escapeHtml = TOOLS.escapeHtml;
  const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hidden = () => typeof document.visibilityState === "string" && document.visibilityState === "hidden";

  // ---------- R4: the steam of a cup still hot ----------

  const STEAM_MS = 15 * 60 * 1000;
  // A cup a minute ahead of this clock (the other device's) is still hot.
  const STEAM_AHEAD_MS = 60 * 1000;

  /* Pure: how old the cup is and how long its steam has left, or null when
     it has none (older than fifteen minutes, or dated in the future). */
  function steamState(dateTime, now) {
    const t = new Date(String(dateTime || "")).getTime();
    const n = now instanceof Date ? now.getTime() : Number(now);
    if (!Number.isFinite(t) || !Number.isFinite(n)) return null;
    const age = n - t;
    if (age < -STEAM_AHEAD_MS || age >= STEAM_MS) return null;
    return { age: Math.max(0, age), left: STEAM_MS - Math.max(0, age) };
  }

  /* The wisps: each one drifts up on its own loop (the svg), and thins out
     on its own clock over the fifteen minutes (its span), so the fourth goes
     first, then the third, and the last two are faint at the end. The clock
     starts in the past by the cup's age (a negative delay): a render ten
     minutes later shows ten minutes of thinning, not a fresh plume. */
  const WISPS = [
    { x: -17, sway: -5, t: 3.6, d: 0, life: 900, end: 0.22 },
    { x: 1, sway: 6, t: 4.1, d: -1.3, life: 900, end: 0.3 },
    { x: 17, sway: -4, t: 3.3, d: -2.4, life: 620, end: 0 },
    { x: -7, sway: 5, t: 4.5, d: -3.2, life: 340, end: 0 },
  ];
  const WISP_PATH = "M10 43 C3 34 17 27 10 18 C5 12 14 7 10 1";
  function steamHtml(age, mini) {
    const list = mini ? WISPS.slice(0, 3) : WISPS;
    return '<span class="lc-steam' + (mini ? " mini" : "") + '" aria-hidden="true" style="--age:' + Math.round(age / 1000) + 's">' +
      list.map((w, i) => '<span class="lc-w" style="--i:' + i + ";--x:" + w.x + "px;--sway:" + w.sway + "px;--t:" + w.t + "s;--d:" + w.d +
        "s;--life:" + w.life + "s;--end:" + w.end + '"><svg viewBox="0 0 20 44" focusable="false"><path d="' + WISP_PATH + '"></path></svg></span>').join("") +
      "</span>";
  }

  const steam = { cupId: null, timer: null };
  function removeSteam() {
    clearTimeout(steam.timer);
    steam.timer = null;
    steam.cupId = null;
    const card = $("#card-last");
    if (card && card.classList) card.classList.remove("is-steaming");
    [$("#card-last"), $("#home-band")].forEach(root => {
      if (!root || typeof root.querySelectorAll !== "function") return;
      [...root.querySelectorAll(".lc-cup, .lc-steam, .lc-warm, .hbd-warm")].forEach(el => el.remove());
    });
  }

  /* Puts the steam on the card (and its band) of the last cup, or takes it
     away. Called after every home render: the card and the band are only
     rewritten when what they say changed, so the wisps already there keep
     their loop; a rewritten card gets them again. */
  function placeSteam(e) {
    const st = e ? steamState(e.date_time, Date.now()) : null;
    if (!st) { if (steam.cupId) removeSteam(); return; }
    const card = $("#card-last");
    if (!card || card.hidden || typeof card.querySelector !== "function") return;
    if (steam.cupId !== e.id) removeSteam();
    steam.cupId = e.id;
    clearTimeout(steam.timer);
    // One timer, when the fifteen minutes are up: no polling.
    steam.timer = setTimeout(removeSteam, st.left + 50);
    card.classList.add("is-steaming");
    /* v9.30: the steam rises from the cup itself, the one this cup was drunk
       from, drawn between the name and the score (Chris: « plutôt que faire
       fumer la note »). */
    const score = card.querySelector(".lc-head .last-big-rating");
    /* The drawing says which cup and which drink: when the cup is changed
       afterwards (the side panel, v9.32), it is drawn again, wisps included,
       their clock still started at the cup's real age. */
    const key = [e.cup || "", e.method || "", e.recipe || "", e.milk_ml || ""].join("|");
    const drawn = card.querySelector(".lc-cup");
    if (drawn && drawn.dataset.cupKey !== key) drawn.remove();
    if (score && !card.querySelector(".lc-cup") && typeof UI.cupArt === "function") {
      score.insertAdjacentHTML("beforebegin", '<span class="lc-cup" aria-hidden="true" data-cup-key="' + escapeHtml(key) + '">' + UI.cupArt(e) + steamHtml(st.age, false) + "</span>");
    }
    /* « encore chaude »: after « Dernière tasse » on a wide card, under the
       score on a narrow one, where the head has room for it (css/moments.css
       shows one of the two). */
    const warm = cls => '<span class="lc-warm ' + cls + '">' + escapeHtml(I18N.t("steam_label")) + "</span>";
    const over = card.querySelector(".lc-title .highlight");
    if (over && !over.querySelector(".lc-warm")) over.insertAdjacentHTML("beforeend", warm("lc-warm-wide"));
    const scale = score ? score.querySelector(".big-rating-scale, .big-rating-none") : null;
    if (scale && !score.querySelector(".lc-warm")) scale.insertAdjacentHTML("afterend", warm("lc-warm-narrow"));
    // The band, smaller: three short wisps beside its score, the label after « Dernière tasse ».
    const band = $("#home-band");
    if (!band || typeof band.querySelector !== "function") return;
    const bandScore = band.querySelector(".hbd-score"), bandLabel = band.querySelector(".hbd-who small");
    if (bandScore && !bandScore.querySelector(".lc-steam")) bandScore.insertAdjacentHTML("beforeend", steamHtml(st.age, true));
    if (bandLabel && !bandLabel.querySelector(".hbd-warm")) bandLabel.insertAdjacentHTML("beforeend", '<span class="hbd-warm">' + escapeHtml(I18N.t("steam_label")) + "</span>");
  }

  /* Hidden, the wisps stop; back on screen, they start again from the cup's
     real age (the thinning clock was stopped with them). */
  function onVisibility() {
    const card = $("#card-last");
    const root = document.documentElement;
    if (root && root.classList) root.classList.toggle("steam-still", hidden());
    if (hidden() || !steam.cupId || !card || typeof card.querySelectorAll !== "function") return;
    const cup = (DATA.state.extractions || []).find(x => x.id === steam.cupId);
    [card, $("#home-band")].forEach(r => { if (r && r.querySelectorAll) [...r.querySelectorAll(".lc-cup, .lc-steam")].forEach(el => el.remove()); });
    if (cup) placeSteam(cup); else removeSteam();
  }

  // ---------- R9: the streak on the week line ----------

  /* A small cup with its flame, in the stroke of the site's icons. The flame
     is lit (filled) once today has its cup. */
  const FLAME_CUP = '<svg class="hw-flame" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
    '<path class="hw-flame-fire" d="M7.6 1.4c1.7 1.5 2.5 2.8 2.5 4.1a2.5 2.5 0 0 1-5 0c0-.8.4-1.6 1-2.1.1.7.4 1.2.9 1.4-.2-1.1 0-2.2.6-3.4z"></path>' +
    '<path class="hw-flame-cup" d="M2.6 9h9.2v1.6a3.6 3.6 0 0 1-3.6 3.6H6.2a3.6 3.6 0 0 1-3.6-3.6z M11.8 10h.6a1.5 1.5 0 0 1 0 3h-.9"></path></svg>';

  function streakHtml(s) {
    if (!s || s.current < 2) return "";
    const text = I18N.t("streak_days", { n: s.current });
    return '<span class="hw-streak' + (s.today ? "" : " pending") + '" title="' + titleAttr(I18N.t(s.today ? "streak_title" : "streak_pending", { n: s.current })) + '">' +
      FLAME_CUP + "<span>" + escapeHtml(text) + "</span></span>";
  }

  /* After the week is drawn (js/ui-home.js rewrites it at every render), the
     streak joins it: a line of its own under the figures on the card of a
     wide screen, next to « Ta semaine » on the line of a narrow one; and its
     words join the button's label. */
  function placeStreak(exts) {
    const s = MILESTONES.streaks(exts, new Date());
    const html = streakHtml(s);
    const words = html ? I18N.t("streak_days", { n: s.current }) : "";
    [["#home-week", ".hw-head"], ["#home-week-line", ".hw-label"]].forEach(([id, sel]) => {
      const host = $(id);
      if (!host || typeof host.querySelector !== "function") return;
      const slot = host.querySelector(sel);
      if (!slot) return;
      const old = slot.querySelector(".hw-streak");
      if (old) old.remove();
      if (html) slot.insertAdjacentHTML("beforeend", html);
      const label = host.getAttribute("aria-label") || "";
      if (words && label && !label.includes(words)) host.setAttribute("aria-label", label + (/[.!?]$/.test(label) ? " " : ". ") + words + ".");
    });
    return s;
  }

  // ---------- R9: the milestones, once per device ----------

  const SEEN_KEY = "milestones-seen";
  function readSeen() {
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      if (raw === null) return null;
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : null;
    } catch (e) { return null; }
  }
  function writeSeen(ids) {
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids)); } catch (e) { /* this device will celebrate again: harmless */ }
  }

  /* The first time this device sees the logbook, everything already reached
     is seen: an old 100th cup must not burst at the next save. */
  function noteSeen(exts) {
    if (readSeen() !== null) return;
    writeSeen(MILESTONES.compute(exts).map(m => m.id));
  }

  const capital = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
  function milestoneLabel(m) {
    if (!m) return "";
    if (m.kind === "cups") return I18N.t("ms_cups", { n: m.n });
    if (m.kind === "coffees") return I18N.t("ms_coffees", { n: m.n });
    if (m.kind === "score9" || m.kind === "score10") return I18N.t("ms_score", { s: fmtDecimal(Number(m.score), 1) });
    if (m.kind === "streak") return I18N.t("ms_streak", { n: m.n });
    if (m.kind === "recipe") return I18N.t("ms_recipe", { r: I18N.tr(m.recipe) });
    return "";
  }

  /* One short line for the moment, two things at most: the most telling
     milestone, then the record of the bag when it comes with it (one
     moment, never two), otherwise the next milestone. « 100e tasse et ton
     premier 10 ! », « Ton premier 9 et record sur ce sachet ! ». */
  function momentLine(items, record) {
    const labels = (items || []).map(milestoneLabel).filter(Boolean);
    if (!labels.length) return "";
    const parts = [labels[0]];
    if (record) parts.push(I18N.t("ms_record"));
    else if (labels[1]) parts.push(labels[1]);
    const text = parts.length > 1 ? I18N.t("ms_and", { a: parts[0], b: parts[1] }) : parts[0];
    return I18N.t("ms_line", { x: capital(text) });
  }

  /* What a save crosses, and the line that says it; null when nothing new.
     Remembers at once everything reached, whatever brought it. */
  function saveMoment(saved) {
    if (!saved || !saved.id) return null;
    const r = MILESTONES.forSave(DATA.state.extractions, saved.id, readSeen());
    writeSeen(r.seen);
    if (!r.celebrate.length) return null;
    const record = typeof DATA.bagRecord === "function" ? !!DATA.bagRecord(saved) : false;
    return { items: r.celebrate, record: record, line: momentLine(r.celebrate, record) };
  }

  /* v9.27: a LATE RATING (the side panel, the phone's rating sheet). Only a
     first 9 or a first 10 can be crossed by a score given afterwards
     (MILESTONES.forEdit); a record on the bag alone says its line, without
     beans. One moment: the caller shows the line where the rating was given. */
  function editMoment(saved, before) {
    if (!saved || !saved.id) return null;
    const r = MILESTONES.forEdit(DATA.state.extractions, saved.id, before, readSeen());
    writeSeen(r.seen);
    const record = typeof DATA.bagRecord === "function" ? !!DATA.bagRecord(saved) : false;
    if (!r.celebrate.length && !record) return null;
    const line = r.celebrate.length ? momentLine(r.celebrate, record) : I18N.t("ms_line", { x: capital(I18N.t("ms_record")) });
    return { items: r.celebrate, record: record, line: line };
  }

  /* The bean, drawn on the canvas: a brown oval with its crease, that
     tumbles (its width follows the cosine of its turn: we see its face, then
     its edge, then its back, which has no crease). */
  const BROWNS = ["#5a3219", "#7a4a28", "#946036", "#b07a45", "#48291a"];
  function drawBean(ctx, b) {
    const rx = 5 * b.s, ry = 7.2 * b.s, turn = Math.cos(b.flip);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.r);
    ctx.scale(Math.max(0.22, Math.abs(turn)), 1);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = b.c;
    ctx.fill();
    if (turn > 0) {
      ctx.beginPath();
      ctx.moveTo(0, -ry * 0.78);
      ctx.quadraticCurveTo(rx * 0.62, 0, 0, ry * 0.78);
      ctx.strokeStyle = "rgba(28, 12, 4, 0.78)";
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* THE BURST: about thirty beans thrown up and out of the cup, then falling
     under gravity, for 1.2 s, on a canvas over the page that lets every tap
     through and goes away by itself. Copper (the accent, so it follows the
     coffee's colour, read where the beans come from) and browns. Never with
     reduced motion, nor hidden. */
  const BURST_MS = 1250, GRAVITY = 1600, BEANS = 30;
  function burst(x, y, from) {
    if (calm() || hidden() || typeof document.createElement !== "function" || !document.body) return false;
    const canvas = document.createElement("canvas");
    const ctx = canvas && typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
    if (!ctx || typeof ctx.ellipse !== "function" || typeof document.body.appendChild !== "function") return false;
    const root = document.documentElement || {};
    const w = root.clientWidth || window.innerWidth || 0, h = root.clientHeight || window.innerHeight || 0;
    if (!w || !h) return false;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.className = "bean-burst";
    canvas.setAttribute("aria-hidden", "true");
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    document.body.appendChild(canvas);
    const copper = (getComputedStyle(from || document.documentElement).getPropertyValue("--accent") || "").trim() || "#b8743a";
    const beans = Array.from({ length: BEANS }, (_, i) => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 3;
      const v = 260 + Math.random() * 440;
      return { x: x + (Math.random() - 0.5) * 18, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, r: Math.random() * 6.3,
        vr: (Math.random() - 0.5) * 12, flip: Math.random() * 6.3, vf: 5 + Math.random() * 9, s: 0.8 + Math.random() * 0.6,
        c: i % 3 === 0 ? copper : BROWNS[i % BROWNS.length] };
    });
    const t0 = performance.now();
    let last = t0, done = false, inside = false;
    const end = () => { if (done) return; done = true; canvas.remove(); };
    /* A frame that calls back at once (the test harness) ends the burst on
       the spot; a page that gets no frame at all ends it by the clock. */
    const step = stamp => {
      if (done) return;
      if (inside) { end(); return; }
      inside = true;
      try {
        const t = typeof stamp === "number" && stamp > t0 ? stamp : performance.now();
        const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
        last = t;
        const p = (t - t0) / BURST_MS;
        if (p >= 1 || hidden()) { end(); return; }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.globalAlpha = p > 0.72 ? Math.max(0, (1 - p) / 0.28) : 1;
        beans.forEach(b => {
          b.vy += GRAVITY * dt; b.vx *= 0.992;
          b.x += b.vx * dt; b.y += b.vy * dt;
          b.r += b.vr * dt; b.flip += b.vf * dt;
          drawBean(ctx, b);
        });
        requestAnimationFrame(step);
      } finally { inside = false; }
    };
    requestAnimationFrame(step);
    setTimeout(end, BURST_MS + 250);
    return true;
  }

  /* The moment on the saved cup's card: the line is in it from the start
     (so the card does not jump), and shows when the score lands like a
     stamp, with the beans out of the cup. */
  function playMoment(m) {
    const host = $("#cup-card");
    if (!m || !host || host.hidden || typeof host.querySelector !== "function") return;
    host.classList.add("cc-has-milestone");
    const head = host.querySelector(".cc-head");
    if (!head || typeof head.insertAdjacentHTML !== "function") return;
    head.insertAdjacentHTML("afterend", '<p class="cc-milestone">' + FLAME_CUP.replace("hw-flame", "cc-ms-icon") + "<span>" + escapeHtml(m.line) + "</span></p>");
    const line = host.querySelector(".cc-milestone");
    let played = false;
    const play = () => {
      if (played) return;
      played = true;
      if (line && line.classList) line.classList.add("on");
      const art = host.querySelector(".cc-art");
      const r = art && typeof art.getBoundingClientRect === "function" ? art.getBoundingClientRect() : null;
      if (r && r.width) burst(r.left + r.width / 2, r.top + r.height * 0.32, host);
    };
    if (host.classList.contains("cc-stamped")) { play(); return; }
    // With the stamp (js/ui-cup.js sets cc-stamped), or by the clock if nothing tells us.
    if (typeof MutationObserver === "function") {
      const watch = new MutationObserver(() => { if (host.classList.contains("cc-stamped")) { watch.disconnect(); play(); } });
      watch.observe(host, { attributes: true, attributeFilter: ["class"] });
      setTimeout(() => { watch.disconnect(); play(); }, 1600);
    } else {
      setTimeout(play, 950);
    }
  }

  /* THE SAVE FLOW'S CARD (Q2), with its moment when there is one: the full
     entry and the quick entry call this instead of UI.showCupCard. A
     milestone keeps the card a little longer, so its line can be read. A
     celebration never stands in the way of the save: any trouble, the card
     shows as before. */
  const HOLD_MS = 1900;
  function showSavedCup(saved) {
    let moment = null;
    try { moment = saveMoment(saved); } catch (e) { moment = null; }
    UI.showCupCard(saved, moment ? { hold: HOLD_MS } : undefined);
    if (moment) { try { playMoment(moment); } catch (e) { /* the card stays as it is */ } }
    return moment;
  }

  // The burst, for a late rating given in the side panel or the phone's sheet (v9.27).
  const beanBurst = burst;

  // ---------- R9: the tile of Analyses ----------

  const TILE_SHOWN = 4;
  function dayText(key, withYear) {
    const d = new Date(String(key) + "T12:00");
    if (isNaN(d)) return "";
    const o = { day: "numeric", month: "short" };
    if (withYear) o.year = "numeric";
    return d.toLocaleDateString(I18N.locale(), o);
  }

  /* The streaks on the left, the milestones on a line on the right, the
     latest four when closed and all of them open, the next one underneath.
     Rewritten only when what it says changed: its entrance plays once. */
  let tileHtml = "";
  function renderMilestoneTile() {
    const body = $("#tile-milestones");
    if (!body) return;
    const exts = DATA.state.extractions || [];
    const s = MILESTONES.streaks(exts, new Date());
    const list = MILESTONES.compute(exts);
    const next = MILESTONES.nextCups(exts);
    const year = String(new Date().getFullYear());
    const yearOf = k => String(k).slice(0, 4) !== year;
    const bestRange = s.best >= 2 ? I18N.t("ms_best_range", { a: dayText(s.bestFrom, yearOf(s.bestFrom)), b: dayText(s.bestTo, yearOf(s.bestTo)) }) : "";
    const streak = '<div class="ms-streaks">' +
      '<div class="ms-figure' + (s.current >= 2 && s.today ? " lit" : "") + '"><p class="ms-num">' + FLAME_CUP.replace("hw-flame", "ms-icon") +
        "<b>" + s.current + '</b></p><p class="ms-cap">' + escapeHtml(I18N.t("ms_now", { s: s.current > 1 ? "s" : "" })) + "</p></div>" +
      '<div class="ms-figure"><p class="ms-num"><b>' + s.best + '</b></p><p class="ms-cap">' + escapeHtml(I18N.t("ms_best")) +
        (bestRange ? "<small>" + escapeHtml(bestRange) + "</small>" : "") + "</p></div></div>";
    const first = Math.max(0, list.length - TILE_SHOWN);
    const track = list.length
      ? '<ol class="ms-track">' + list.map((m, i) => {
        const label = capital(milestoneLabel(m)), when = dayText(m.date, yearOf(m.date));
        // A recipe is named in bold, « nouvelle recette » goes with the date.
        const title = m.kind === "recipe" ? I18N.tr(m.recipe) : label;
        const caption = m.kind === "recipe" ? I18N.t("ms_recipe_caption", { d: when }) : when;
        // The older ones wait for the tile to open; the shown ones arrive one after the other.
        return "<li" + (i < first ? ' class="an-more-row"' : "") + ' style="--i:' + Math.max(0, i - first) + '">' +
          (m.cupId ? '<button type="button" class="ms-item ms-' + m.kind + '" data-cup="' + titleAttr(m.cupId) + '" aria-label="' +
            titleAttr(I18N.t("ms_item_aria", { m: label, d: when })) + '">' : '<span class="ms-item ms-' + m.kind + '">') +
          '<i class="ms-dot" aria-hidden="true"></i><b>' + escapeHtml(title) + "</b><small>" + escapeHtml(caption) + "</small>" +
          (m.cupId ? "</button>" : "</span>") + "</li>";
      }).join("") + "</ol>"
      : '<p class="an-none">' + escapeHtml(I18N.t("ms_none")) + "</p>";
    const more = list.length > TILE_SHOWN ? '<p class="an-less an-hint">' + escapeHtml(I18N.t("an_more_rows", { n: list.length - TILE_SHOWN })) + "</p>" : "";
    const foot = next ? '<p class="ms-next">' + escapeHtml(I18N.t("ms_next", { n: next.n, k: next.left })) + "</p>" : "";
    const html = streak + '<div class="ms-list">' + track + more + foot + "</div>";
    if (html === tileHtml) return;
    tileHtml = html;
    body.innerHTML = html;
  }

  // ---------- Render and wiring ----------

  /* Called by js/ui-home.js after each home render, with what it computed
     (null for an empty logbook). */
  function renderMoments(o) {
    if (!o) { removeSteam(); return; }
    placeSteam(o.last);
    placeStreak(o.exts);
    noteSeen(o.exts);
  }

  if (typeof document.addEventListener === "function") document.addEventListener("visibilitychange", onVisibility);

  Object.assign(UI, {
    steamState, streakHtml, milestoneLabel, momentLine, saveMoment, showSavedCup, renderMoments, renderMilestoneTile,
    editMoment, beanBurst,
  });
})();
