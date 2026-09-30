/* Dashboard: the latest cup, shown large, and the building blocks it shares
 * with the table of recent brews (moved out of ui-dashboard.js in v8.78). */
"use strict";

(() => {

  // Borrowed from the core and from ui-findings.js, loaded before us.
  const { $, titleAttr, displayedDiags, isFailed, analyzableExts, fmtDuration, fmtVND,
    average, fmtRating, findRecipe } = UI;

  /* THE LATEST CUP, shown large.

     This is the card Chris looks at when opening the site: what he just
     drank, and what he thought of it. It reuses the same blocks as the last
     five (measurements, tastes, comment) so both say the same thing, and
     clicking it opens the brew, like a table row.

     It hides when there is nothing: an empty card announcing "no latest
     cup" teaches nothing to someone who already sees an empty logbook. */
  function renderLastCup(exts) {
    const card = $("#card-last");
    const e = [...exts].sort((a, b) => b.date_time.localeCompare(a.date_time))[0];
    card.hidden = !e;
    if (!e) return;

    const context = [];
    if (e.recipe) context.push(I18N.tr(e.recipe));
    if (e.dose_g > 0 && e.water_g) context.push(e.dose_g + " → " + e.water_g + " g");
    // Total time sits in the FOOTER (v8.39), next to the recipe target.
    if (e.temperature_c !== "" && e.temperature_c !== undefined) context.push(e.temperature_c + " °C");
    if (e.method === "Brikka" && e.heat_level !== "" && e.heat_level !== undefined) {
      context.push(I18N.t("setting_heat", { f: e.heat_level }));
    }

    card.dataset.ext = e.id;
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.innerHTML =
      '<div class="last-big-body">' +
        '<p class="highlight">' + I18N.t("dash_last_cup", { q: timeSince(e.date_time) }) + "</p>" +
        '<p class="last-big-coffee">' + I18N.tr(e._c.coffee_name) + "</p>" +
        '<p class="last-big-context">' +
          '<span class="dot-method ' + e.method.toLowerCase() + '"></span>' +
          '<span class="last-big-machine">' + e.method + "</span>" +
          context.map(x => '<span class="sep" aria-hidden="true">|</span><span>' + x + "</span>").join("") +
        "</p>" +
        lastTastes(e) +
        (e.comment ? '<p class="last-big-comment">' + titleAttr(e.comment) + "</p>" : "") +
        rankAmongSiblings(e) +
        lastCupFooter(e) +
      "</div>" +
      '<div class="last-big-rating">' +
        (isFailed(e) ? '<span class="badge-failed">' + I18N.t("botched_badge") + "</span>" : "") +
        /* Without a score, we write "not rated yet" instead of a dash: a dash
           in a big number reads as a minus, and the project rules forbid
           the em dash anyway. */
        (e.score_10 !== ""
          ? '<span class="big-rating">' + e.score_10 + "</span>" +
            '<span class="big-rating-scale">' + I18N.t("dash_out_of_10") + "</span>"
          : '<span class="big-rating-none">' + I18N.t("not_rated_yet") + "</span>") +
        (e.diagnostic ? '<span class="dot-diag">' + displayedDiags(e.diagnostic) + "</span>" : "") +
      "</div>";
  }

  /* WHERE THIS CUP RANKS AMONG THOSE OF THE SAME COFFEE (v8.39). The card
     takes the height of the key figures and left an empty band of about 85 px
     between the tastes and the footer. It now answers the question you ask in
     front of a score: was that luck, or my level?
     Each rated cup of the coffee is a dot on the score scale, this one large,
     the coffee average as a line. Under three rated cups, nothing: a rank
     among two says nothing. */
  function rankAmongSiblings(e) {
    if (e.score_10 === "" || e.score_10 === undefined) return "";
    const siblings = analyzableExts().filter(x => x.coffee_id === e.coffee_id && x.score_10 !== "");
    if (!siblings.some(x => x.id === e.id)) siblings.push(e);
    if (siblings.length < 3) return "";
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

    // The scale: from the whole score below the lowest one up to 10.
    const low = Math.max(0, Math.floor(Math.min(...notes)) - 1);
    const L = 12, R = 588, base = 34, step = 6.5;
    const x = n => L + ((n - low) / (10 - low)) * (R - L);
    let svg = '<line x1="' + L + '" y1="' + (base + 8) + '" x2="' + R + '" y2="' + (base + 8) + '" stroke="var(--lines)"></line>';
    for (let n = Math.ceil(low); n <= 10; n += (10 - low > 6 ? 2 : 1)) {
      svg += '<text x="' + x(n) + '" y="' + (base + 19) + '" text-anchor="middle">' + n + "</text>";
    }
    const xm = x(avg);
    svg += '<line x1="' + xm + '" y1="12" x2="' + xm + '" y2="' + (base + 8) + '" stroke="var(--muted)" stroke-dasharray="3 3"></line>' +
      '<text x="' + (xm > R * 0.7 ? xm - 5 : xm + 5) + '" y="10" text-anchor="' + (xm > R * 0.7 ? "end" : "start") + '">' +
      I18N.t("rank_average", { m: fmtRating(avg) }) + "</text>";
    // The other cups, stacked when they share the same score.
    const stacks = {};
    siblings.forEach(s => {
      if (s.id === e.id) return;
      const n = Number(s.score_10);
      const k = (stacks[n] = (stacks[n] || 0) + 1) - 1;
      svg += '<circle cx="' + x(n) + '" cy="' + (base - Math.min(k, 3) * step) + '" r="2.6" fill="var(--text)" opacity="0.55"></circle>';
    });
    // This one, on top, ringed with the panel colour so it stands out.
    svg += '<circle cx="' + x(rating) + '" cy="' + (base - 3) + '" r="6.5" fill="var(--accent)" stroke="var(--panel-2)" stroke-width="2"></circle>';
    return '<div class="last-spot" role="img" aria-label="' + titleAttr(I18N.t("rank_aria", {
      n: notes.length, coffee: I18N.tr(e._c.coffee_name), score: fmtRating(rating), m: fmtRating(avg) })) + '">' +
      '<p class="last-spot-head"><span>' + I18N.t("rank_among", { n: notes.length, coffee: I18N.tr(e._c.coffee_name) }) + "</span>" +
      "<span><b>" + rankText + "</b>, " + position + "</span></p>" +
      '<svg viewBox="0 0 600 ' + (base + 22) + '" aria-hidden="true">' + svg + "</svg></div>";
  }

  /* The TARGET of a footer figure: what the recipe aimed for, otherwise your
     average on this coffee and this recipe. A value with no reference does
     not say whether it is good. */
  function recipeTimeTarget(r) {
    const m = /^total\s+(.+)$/.exec(String((r && r.totalText) || "").trim());
    if (!m) return "";
    return m[1].replace(/^environ\s+/, "≈ ").replace(/,.*$/, "");
  }

  /* THE FOOTER of the card: ratio, time, drawdown, grind, cost, each with its
     target underneath (v8.39). Each cell only appears if the value exists:
     an empty cell is a hole. */
  function lastCupFooter(e) {
    const r = findRecipe(e.recipe);
    const same = analyzableExts().filter(x => x.id !== e.id && x.coffee_id === e.coffee_id && x.recipe === e.recipe);
    const avgTime = field => {
      const v = same.map(x => Number(x[field])).filter(n => n > 0);
      return v.length >= 2 ? fmtDuration(Math.round(average(v))) : "";
    };
    const cells = [];
    const cell = (label, value, target, ok) => cells.push("<div><span>" + label + "</span><b>" + value + "</b>" +
      (target ? '<small class="' + (ok ? "target-held" : "") + '">' + target + "</small>" : "") + "</div>");

    if (e._c.ratioText) {
      let target = "", ok = false;
      /* On the SWITCH only: the recipe water is the poured water, the same
         quantity as the cup's. On the Brikka, it is the boiler water
         (150 g) for a ratio of about 1:7 in the cup: comparing them would
         announce a gap that does not exist. */
      if (e.method === "Switch" && r && r.dose > 0 && r.water > 0) {
        const aimed = r.water / r.dose;
        target = I18N.t("rank_recipe", { v: "1:" + aimed.toFixed(1) });
        ok = Math.abs(Number(e.water_g) / Number(e.dose_g) - aimed) <= 0.3;
      }
      cell(I18N.t("detail_ratio"), e._c.ratioText, target, ok);
    }
    const total = fmtDuration(e.total_time_s);
    if (total) {
      const aimed = recipeTimeTarget(r);
      const avg = avgTime("total_time_s");
      cell(I18N.t("detail_time"), total,
        aimed ? I18N.t("rank_recipe", { v: aimed }) : avg ? I18N.t("rank_your_average", { v: avg }) : "", false);
    }
    const drawdown = fmtDuration(e.flow_time_s);
    if (drawdown) {
      const avg = avgTime("flow_time_s");
      cell(I18N.t("detail_drawdown"), drawdown, avg ? I18N.t("rank_your_average", { v: avg }) : "", false);
    }
    if (e.grind_dial) cell(I18N.t("detail_grind"), e.grind_dial, e._c.microns ? e._c.microns + " µm" : "", false);
    else if (e._c.ground) cell(I18N.t("detail_grind"), I18N.t("bag_default"), "", false);
    if (e._c.cup_cost_vnd !== "") cell(I18N.t("detail_cost"), fmtVND(e._c.cup_cost_vnd), I18N.t("rank_per_cup"), false);
    return cells.length ? '<div class="last-big-footer">' + cells.join("") + "</div>" : "";
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
  const LATEST_SHOWN = 8;
  const MAX_LAST_TASTES = 4;
  function lastTastes(e) {
    const tags = String(e.descriptors || "").split("|").filter(Boolean);
    if (!tags.length) return "";
    const shown = tags.slice(0, MAX_LAST_TASTES).map(t => '<span class="last-tag">' + I18N.tag(t) + "</span>");
    const rest = tags.length - shown.length;
    return '<div class="last-tastes">' + shown.join("") +
      (rest > 0 ? '<span class="last-tag last-tag-plus">+' + rest + "</span>" : "") + "</div>";
  }

  /* The comment, in plain view and truncated, instead of waiting for hover:
     it is the only field that says WHY a cup was good, and you had to put
     the mouse on it to read it. Hover keeps the full text. */
  /* THE COMMENT ON ITS OWN LINE, truncated to ONE line by CSS and not by a
     character count: the available width depends on the window, a hard
     threshold cuts too early on a big screen and too late on a small one.
     The full text only comes on hover if the line is cut, see above. */
  function lastComment(e) {
    const c = String(e.comment || "").trim();
    if (!c) return "";
    return '<tr class="last-comment" data-ext="' + e.id + '"><td colspan="5">' + titleAttr(c) + "</td></tr>";
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
    LATEST_SHOWN, lastComment, lastTastes, shortMeasures, renderLastCup,
  });
})();
