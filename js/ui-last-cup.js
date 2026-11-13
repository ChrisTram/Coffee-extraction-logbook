/* Home: the latest cup, a small card since v9.46 (its history chart left for
 * the 30 days chart above it, and stays in the cup's side panel), and the
 * building blocks it shares with the table of recent brews (moved out of
 * ui-dashboard.js in v8.78). */
"use strict";

(() => {

  // Borrowed from the core and from ui-findings.js, loaded before us.
  const { $, titleAttr, displayedDiags, isFailed, analyzableExts, fmtDuration,
    average, fmtRating } = UI;

  /* THE LATEST CUP.

     This is the card Chris looks at when opening the site: what he just
     drank, and what he thought of it. It reuses the same blocks as the last
     five (measurements, tastes, comment) so both say the same thing, and
     clicking it opens the brew, like a table row.

     It hides when there is nothing: an empty card announcing "no latest
     cup" teaches nothing to someone who already sees an empty logbook. */
  let lastHtml = "";
  function renderLastCup(exts) {
    const card = $("#card-last");
    const e = [...exts].sort((a, b) => b.date_time.localeCompare(a.date_time))[0];
    card.hidden = !e;
    if (!e) { lastHtml = ""; return null; }
    /* J6 (v9.13): THE RECORD THAT SHINES. When this cup is the best ever
       brewed on its coffee's bag in stock (DATA.bagRecord), the card gets a
       copper border that turns, a sentence that says by how much, and its
       score rolls once like an odometer (js/ui-moments.js). */
    const record = DATA.bagRecord(e);

    const context = [];
    if (e.recipe) context.push(I18N.tr(e.recipe));
    if (e.dose_g > 0 && e.water_g) context.push(e.dose_g + " → " + e.water_g + " g");
    const total = fmtDuration(e.total_time_s);
    if (total) context.push(total);
    if (e.temperature_c !== "" && e.temperature_c !== undefined) context.push(e.temperature_c + " °C");
    if (e.method === "Brikka" && e.heat_level !== "" && e.heat_level !== undefined) {
      context.push(I18N.t("setting_heat", { f: e.heat_level }));
    }

    card.dataset.ext = e.id;
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.classList.toggle("is-record", !!record);
    /* L1 (v9.21): THE SCORE NEXT TO THE NAME. A head row carries the name, its
       context line and the score, big, on the right, on every width: on a
       phone the score used to fall under the card body, below the fold. The
       rest follows underneath, short (v9.46): the record, the tastes, the
       comment, and ONE line that places the cup among those of its coffee.
       The chart of those cups and the footer of figures are gone from here:
       the 30 days chart above shows the cups, the cup's panel has the rest.
       The head is also what js/ui-home.js watches to fold the card into its band. */
    const html =
      '<div class="lc-head">' +
        '<div class="lc-title">' +
          '<p class="highlight">' + I18N.t("dash_last_cup", { q: timeSince(e.date_time) }) + "</p>" +
          '<p class="last-big-coffee">' + I18N.tr(e._c.coffee_name) + "</p>" +
          '<p class="last-big-context">' +
            '<span class="dot-method ' + e.method.toLowerCase() + '"></span>' +
            '<span class="last-big-machine">' + e.method + "</span>" +
            context.map(x => '<span class="sep" aria-hidden="true">|</span><span>' + x + "</span>").join("") +
          "</p>" +
        "</div>" +
        '<div class="last-big-rating">' +
          (isFailed(e) ? '<span class="badge-failed">' + I18N.t("botched_badge") + "</span>" : "") +
          /* Without a score, we write "not rated yet" instead of a dash: a dash
             in a big number reads as a minus, and the project rules forbid
             the em dash anyway. */
          (e.score_10 !== ""
            ? '<span class="big-rating">' + e.score_10 + "</span>" +
              '<span class="big-rating-scale">' + I18N.t("dash_out_of_10") + "</span>"
            : '<span class="big-rating-none">' + I18N.t("not_rated_yet") + "</span>" + UI.rateAction(e)) +
          (e.diagnostic ? '<span class="dot-diag">' + displayedDiags(e.diagnostic) + "</span>" : "") +
        "</div>" +
      "</div>" +
      '<div class="last-big-body">' +
        (record ? '<p class="last-record">' + titleAttr(I18N.t("record_line", {
          x: fmtRating(record.gap), d: dayMonth(record.previousDate) })) + "</p>" : "") +
        lastTastes(e) +
        (e.comment ? '<p class="last-big-comment">' + titleAttr(e.comment) + "</p>" : "") +
        rankLine(e) +
      "</div>";
    /* Rewritten only when it changed (v9.13): a render in the middle of the
       odometer, the steam or the count, a sync arriving, would cut them. */
    if (html === lastHtml) return e;
    lastHtml = html;
    card.innerHTML = html;
    UI.playRecord(card, record, e);
    return e;
  }

  // « 12 septembre », from a local YYYY-MM-DD.
  function dayMonth(key) {
    const [y, m, d] = String(key).split("-").map(Number);
    return y && m && d ? new Date(y, m - 1, d).toLocaleDateString(I18N.locale(), { day: "numeric", month: "long" }) : "";
  }

  /* The recipes' colours on the chart of a coffee's cups (v9.40): distinct,
     warm and cool, never green. */
  const SPOT_COLOURS = ["#c8813f", "#4f93e6", "#d58ab3", "#e0b04a", "#9b7ad8", "#c45a4a", "#8a9bb0", "#b8865b"];

  /* A click on a dot opens that cup in the side panel (or wherever a cup
     opens on this screen). Delegated once on the document: the card is
     rewritten at each render. The card itself is clickable: the dot's click
     stays the dot's. */
  let spotWired = false;
  function wireSpot() {
    if (spotWired || typeof document.addEventListener !== "function") return;
    spotWired = true;
    document.addEventListener("click", ev => {
      const g = ev.target && ev.target.closest ? ev.target.closest("[data-spot-cup]") : null;
      if (!g) return;
      ev.preventDefault();
      ev.stopPropagation();
      const ext = (DATA.state.extractions || []).find(x => x.id === g.getAttribute("data-spot-cup"));
      if (ext && typeof UI.openCup === "function") UI.openCup(ext, g);
    }, true);
  }
  wireSpot();

  /* WHERE THIS CUP RANKS AMONG THOSE OF THE SAME COFFEE (v8.39). The card
     takes the height of the key figures and left an empty band of about 85 px
     between the tastes and the footer. It now answers the question you ask in
     front of a score: was that luck, or my level?
     Each rated cup of the coffee is a dot on the score scale, this one large,
     the coffee average as a line. Under three rated cups, nothing: a rank
     among two says nothing. */
  /* The facts of a cup's rank among the rated cups of its coffee, or null
     (no score, or under three rated cups). */
  function rankFacts(e) {
    if (e.score_10 === "" || e.score_10 === undefined) return null;
    const siblings = analyzableExts().filter(x => x.coffee_id === e.coffee_id && x.score_10 !== "");
    if (!siblings.some(x => x.id === e.id)) siblings.push(e);
    if (siblings.length < 3) return null;
    const rating = Number(e.score_10);
    const notes = siblings.map(x => Number(x.score_10));
    const avg = average(notes);
    const ahead = notes.filter(n => n > rating).length;
    const ties = notes.filter(n => n === rating).length - 1;
    const rankText = ahead === 0
      ? I18N.t(ties ? "rank_joint_best" : "rank_best")
      : I18N.t("rank_position", { k: ahead + 1, n: notes.length });
    const gap = rating - avg;
    const position = Math.abs(gap) < 0.2 ? I18N.t("rank_on_average")
      : I18N.t(gap > 0 ? "rank_above" : "rank_below", { x: fmtRating(Math.abs(gap)) });
    return { siblings, rating, notes, avg, rankText, position };
  }

  /* ONE LINE on the home's card (v9.46): « Parmi tes 23 tasses notées de Là
     Việt Balanced : la meilleure, 2,7 au-dessus de ta moyenne ». */
  function rankLine(e) {
    const f = rankFacts(e);
    if (!f) return "";
    return '<p class="last-rank"><span>' + I18N.t("rank_among", { n: f.notes.length, coffee: I18N.tr(e._c.coffee_name) }) + '</span><span class="sep" aria-hidden="true"> · </span>' +
      "<b>" + f.rankText + "</b>, " + f.position + "</p>";
  }

  /* The same, with the chart: in the cup's side panel (js/ui-panel-edit.js). */
  function rankAmongSiblings(e) {
    const f = rankFacts(e);
    if (!f) return "";
    const { siblings, rating, notes, avg, rankText, position } = f;

    /* v9.40: ONE DOT PER CUP, OVER TIME. The dates run along, the score goes
       up, each cup is its own dot in the colour of its recipe (legend under the
       chart), the coffee's average a dashed level, this cup large. A click on
       a dot opens that cup in the side panel (wireSpot); its title says which
       cup it is. No line between the dots: each cup stays a cup. */
    const list = siblings.slice().sort((p, q) => String(p.date_time).localeCompare(String(q.date_time)));
    const time = x => new Date(String(x.date_time).slice(0, 16)).getTime();
    const t0 = time(list[0]), t1 = time(list[list.length - 1]);
    const low = Math.max(0, Math.floor(Math.min(...notes)) - 1), high = 10;
    const L = 30, R = 586, T = 26, B = 118;
    let xs = list.map(x => (t1 > t0 ? (time(x) - t0) / (t1 - t0) : list.length > 1 ? list.indexOf(x) / (list.length - 1) : 0.5));
    const minGap = list.length > 1 ? Math.min(0.6 / (list.length - 1), 0.025) : 0;
    for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] < minGap) xs[i] = xs[i - 1] + minGap;
    const span = xs[xs.length - 1] > 1 ? xs[xs.length - 1] : 1;
    xs = xs.map(v => L + 8 + (v / span) * (R - L - 16));
    const y = n => B - ((n - low) / (high - low)) * (B - T);
    // The recipes of this coffee, the most brewed first, each its colour.
    const count = {};
    list.forEach(x => { const k = x.recipe || x.method || "?"; count[k] = (count[k] || 0) + 1; });
    const recipes = Object.keys(count).sort((p, q) => count[q] - count[p]);
    const colour = k => SPOT_COLOURS[recipes.indexOf(k) % SPOT_COLOURS.length];
    let svg = "";
    const stepY = high - low > 6 ? 2 : 1;
    for (let n = Math.ceil(low); n <= high; n += stepY) {
      svg += '<line class="ls-grid" x1="' + L + '" y1="' + y(n).toFixed(1) + '" x2="' + R + '" y2="' + y(n).toFixed(1) + '"></line>' +
        '<text x="' + (L - 8) + '" y="' + (y(n) + 4).toFixed(1) + '" text-anchor="end">' + n + "</text>";
    }
    const ym = y(avg);
    svg += '<line class="ls-avg" x1="' + L + '" y1="' + ym.toFixed(1) + '" x2="' + R + '" y2="' + ym.toFixed(1) + '"></line>' +
      '<line class="ls-avg" x1="' + (R - 150) + '" y1="10" x2="' + (R - 126) + '" y2="10"></line>' +
      '<text class="ls-avg-label" x="' + R + '" y="14" text-anchor="end">' + I18N.t("rank_average", { m: fmtRating(avg) }) + "</text>";
    // The dates: up to six, evenly spread over the time the coffee covers.
    const dayLabel = t => new Date(t).toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" });
    const ticks = t1 > t0 ? Math.min(6, Math.max(2, list.length)) : 1;
    for (let k = 0; k < ticks; k++) {
      const f2 = ticks === 1 ? 0.5 : k / (ticks - 1);
      const xt = L + 8 + f2 * (R - L - 16);
      svg += '<line class="ls-tick" x1="' + xt.toFixed(1) + '" y1="' + B + '" x2="' + xt.toFixed(1) + '" y2="' + (B + 4) + '"></line>' +
        '<text x="' + xt.toFixed(1) + '" y="' + (B + 19) + '" text-anchor="' + (ticks > 1 && k === 0 ? "start" : ticks > 1 && k === ticks - 1 ? "end" : "middle") + '">' +
        dayLabel(t1 > t0 ? t0 + f2 * (t1 - t0) : t0) + "</text>";
    }
    const tip = x => dayLabel(time(x)) + " · " + (x.recipe || x.method || "") + " · " + fmtRating(Number(x.score_10));
    list.forEach((x, i) => {
      const me = x.id === e.id;
      const cx = xs[i].toFixed(1), cy = y(Number(x.score_10)).toFixed(1);
      svg += '<g class="ls-cup' + (me ? " ls-me" : "") + '" data-spot-cup="' + titleAttr(x.id) + '" style="--i:' + i + ";--c:" + colour(x.recipe || x.method || "?") + '">' +
        "<title>" + TOOLS.escapeHtml(tip(x)) + "</title>" +
        '<circle class="ls-hit" cx="' + cx + '" cy="' + cy + '" r="11"></circle>' +
        '<circle class="ls-dot" cx="' + cx + '" cy="' + cy + '" r="' + (me ? 7.5 : 4.6) + '"></circle></g>';
    });
    const legend = '<p class="ls-legend">' + recipes.map(k => '<span><i style="--c:' + colour(k) + '"></i>' +
      TOOLS.escapeHtml(I18N.tr(k)) + " <small>" + count[k] + "</small></span>").join("") + "</p>";
    return '<div class="last-spot" role="img" aria-label="' + titleAttr(I18N.t("rank_aria", {
      n: notes.length, coffee: I18N.tr(e._c.coffee_name), score: fmtRating(rating), m: fmtRating(avg) })) + '">' +
      '<p class="last-spot-head"><span>' + I18N.t("rank_among", { n: notes.length, coffee: I18N.tr(e._c.coffee_name) }) + "</span>" +
      "<span><b>" + rankText + "</b>, " + position + "</span></p>" +
      '<svg class="ls-time" viewBox="0 0 600 ' + (B + 26) + '">' + svg + "</svg>" + legend + "</div>";
  }

  /* "2 h ago". Precise enough to place the cup, never to the minute: we want
     to know whether it was this morning or the day before yesterday, not the
     exact time, which is already in the table just below. */
  function timeSince(dt) {
    const min = Math.max(0, Math.round((Date.now() - new Date(dt)) / 60000));
    if (min < 60) return I18N.t("dash_minutes_ago", { n: min });
    const h = Math.round(min / 60);
    if (h < 24) return I18N.t("dash_hours_ago", { n: h });
    return I18N.t("dash_days_ago", { n: Math.round(h / 24) });
  }

  /* The ticked TASTES, as small pills, four at most then "+n". The card had
     the room and said nothing about what the cup tasted like, even though
     that is the point of the logbook. Stored values are French, display
     goes through I18N.tag. */
  const LATEST_SHOWN = 6;
  const MAX_LAST_TASTES = 4;
  /* `lead` goes first in the row, before the tastes: the pill of a cup that
     came in from the other device (Q13, v9.17). */
  function lastTastes(e, lead) {
    const tags = String(e.descriptors || "").split("|").filter(Boolean);
    if (!tags.length && !lead) return "";
    const shown = tags.slice(0, MAX_LAST_TASTES).map(t => '<span class="last-tag">' + I18N.tag(t) + "</span>");
    const rest = tags.length - shown.length;
    return '<div class="last-tastes">' + (lead || "") + shown.join("") +
      (rest > 0 ? '<span class="last-tag last-tag-plus">+' + rest + "</span>" : "") + "</div>";
  }

  /* THE CARD MEASUREMENTS, short version: dose, water and time. Dial,
     degrees and heat are in the history, which exists to compare them;
     here they made the row wrap onto three levels. */
  function shortMeasures(e) {
    const parts = [];
    if (e.dose_g > 0 && e.water_g) parts.push(e.dose_g + " → " + e.water_g + " g");
    const t = fmtDuration(e.total_time_s);
    if (t) parts.push(t);
    if (!parts.length) return "";
    return '<span class="d-figures">' + parts.join(" · ") + "</span>";
  }

  Object.assign(UI, {
    LATEST_SHOWN, lastTastes, shortMeasures, renderLastCup, timeSince, rankAmongSiblings,
  });
})();
