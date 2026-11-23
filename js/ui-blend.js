/* OTHER COFFEES IN THE CUP (v9.56, a third one in v9.60): the blend's part of
 * the entry form. Moved out of js/ui-entry.js in v9.60, which a third coffee
 * pushed past its 1,200 lines.
 *
 * THE BLEND: the end of a bag topped up with another coffee, or the ends of
 * two bags with a third. Not the norm, so the field is closed behind
 * « + Un deuxième café dans la tasse », and the third coffee behind
 * « + Un troisième café ». The dose stays the cup's total; each row holds the
 * grams of its coffee. Saved as blend_coffee_id / blend_g and
 * blend2_coffee_id / blend2_g: each bag gives its own grams, and the cup
 * stays out of every average (TOOLS.blendParts).
 *
 * js/ui-entry.js calls in: UI.fillBlendSelect when the coffee menu is filled,
 * UI.updateBlend when the dose or the coffee changes, UI.setBlend on a reset
 * or an opened cup, UI.readBlend at saving. The draft calls UI.restoreBlend. */
"use strict";

(() => {

  // Borrowed from the core and from ui-entry.js, loaded before us.
  const { $, titleAttr, fmtDecimal, fallbacks, selectableCoffees, entry } = UI;

  const blendOpen = () => !$("#blend-body").hidden;
  const round1 = n => Math.round(n * 10) / 10;
  // The two rows: the second coffee, there once the field is open, and the third.
  const blendRows = () => [
    { sel: $("#f-blend-coffee"), g: $("#f-blend-g"), open: blendOpen() },
    { sel: $("#f-blend2-coffee"), g: $("#f-blend2-g"), open: blendOpen() && !$("#blend-row-2").hidden },
  ];
  const gramsOf = input => parseFloat(String(input.value || "").replace(",", "."));
  const rowValue = row => ({ id: row.sel.value, g: row.g.value });

  /* The added coffees' menus: the same coffees as the first one's. `keepIds`
     puts back a coffee archived since, when an old blend is edited. */
  function fillBlendSelect(keepIds) {
    const rows = blendRows();
    if (!rows[0].sel || !rows[1].sel) return;
    const list = selectableCoffees();
    rows.forEach((row, i) => {
      const value = keepIds ? (keepIds[i] || "") : row.sel.value;
      const kept = value && !list.some(c => c.id === value) ? DATA.state.coffees.find(c => c.id === value) : null;
      row.sel.innerHTML = '<option value="">' + I18N.t(i ? "blend_pick_third" : "blend_pick") + "</option>" +
        list.concat(kept ? [kept] : []).map(c => '<option value="' + titleAttr(c.id) + '">' + titleAttr(c.name) + "</option>").join("");
      row.sel.value = value || "";
    });
    updateBlend();
  }

  /* The bag being finished among `others`: the one that holds the least, and
     less than this dose. All its grams go in. */
  function endingBag(others, dose) {
    return others.map(c => ({ coffee: c, gauge: DATA.bagGauge(c.id, fallbacks.dose) }))
      .filter(o => o.gauge && o.gauge.grams > 0 && o.gauge.grams < dose).sort((a, b) => a.gauge.grams - b.gauge.grams)[0] || null;
  }

  /* What opening the field proposes. Another bag holds less than this dose:
     it is the one being finished, all its grams go in. Otherwise, the cup's
     own bag holds less than the dose: the second coffee makes up the rest. The
     second coffee is only guessed when there is no doubt about it. */
  function blendDefault() {
    const main = $("#f-coffee").value, dose = parseFloat($("#f-dose").value) || fallbacks.dose;
    const others = selectableCoffees().filter(c => c.id !== main);
    const tail = endingBag(others, dose);
    if (tail) return { id: tail.coffee.id, g: round1(tail.gauge.grams) };
    const only = others.length === 1 ? others[0].id : "";
    const own = main ? DATA.bagGauge(main, fallbacks.dose) : null;
    if (own && own.grams > 0 && own.grams < dose) return { id: only, g: round1(dose - own.grams) };
    return { id: only, g: "" };
  }
  /* What the third row proposes: one more bag being finished, with all its
     grams; else the only coffee left to pick, without grams. */
  function thirdDefault() {
    const taken = [$("#f-coffee").value, $("#f-blend-coffee").value];
    const others = selectableCoffees().filter(c => !taken.includes(c.id));
    const tail = endingBag(others, parseFloat($("#f-dose").value) || fallbacks.dose);
    if (tail) return { id: tail.coffee.id, g: round1(tail.gauge.grams) };
    return { id: others.length === 1 ? others[0].id : "", g: "" };
  }

  // `parts`: [{ id, g }] for the second coffee, then the third when there is one.
  function setBlend(open, parts) {
    const list = open ? (parts || []) : [];
    const third = list.length > 1;
    $("#blend-body").hidden = !open;
    $("#blend-toggle").hidden = !!open;
    $("#blend-toggle").setAttribute("aria-expanded", open ? "true" : "false");
    $("#blend-row-2").hidden = !third;
    const grams = p => (p && p.g !== undefined && p.g !== null ? p.g : "");
    $("#f-blend-g").value = grams(list[0]);
    $("#f-blend2-g").value = grams(list[1]);
    fillBlendSelect([(list[0] && list[0].id) || "", (list[1] && list[1].id) || ""]);
  }

  /* What saving reads: null without a blend (the field closed, or opened and
     left empty), { parts: [{ id, g }] } for a blend of one or two added
     coffees, { error } when a row is half filled, names a coffee already in
     the cup, or when the added grams reach the dose, which is the cup's total. */
  function readBlend() {
    if (!blendOpen()) return null;
    const filled = blendRows().filter(r => r.open).map(r => ({ id: r.sel.value, raw: String(r.g.value || "").trim() })).filter(r => r.id || r.raw);
    if (!filled.length) return null;
    const seen = [$("#f-coffee").value], parts = [];
    for (const r of filled) {
      const g = parseFloat(r.raw.replace(",", "."));
      if (!r.id || !(g > 0) || seen.includes(r.id)) return { error: "toast_blend_incomplete" };
      seen.push(r.id);
      parts.push({ id: r.id, g: round1(g) });
    }
    if (!(parts.reduce((s, p) => s + p.g, 0) < parseFloat($("#f-dose").value))) return { error: "toast_blend_over" };
    return { parts: parts };
  }

  // The line under the field: what each coffee gives, and what the added bags keep.
  function updateBlend() {
    const hint = $("#blend-hint"), rows = blendRows();
    if (!hint || !rows[0].sel || !rows[1].sel) return;
    if (!blendOpen()) { hint.textContent = ""; return; }
    const main = $("#f-coffee").value;
    // A coffee is in the cup once: neither the cup's own, nor the other row's.
    if (rows[1].open && rows[1].sel.value && rows[1].sel.value === rows[0].sel.value) rows[1].sel.value = "";
    rows.forEach((row, i) => {
      const other = rows[1 - i].open ? rows[1 - i].sel.value : "";
      Array.from(row.sel.options).forEach(o => { o.disabled = !!o.value && (o.value === main || o.value === other); });
      if (row.sel.value && row.sel.value === main) row.sel.value = "";
    });
    // A third coffee needs a third coffee to pick.
    $("#blend-more").hidden = rows[1].open || selectableCoffees().length < 3;
    const dose = parseFloat($("#f-dose").value);
    const parts = rows.filter(r => r.open).map(r => ({ id: r.sel.value, g: gramsOf(r.g) }));
    const added = round1(parts.reduce((s, p) => s + (p.g > 0 ? p.g : 0), 0));
    const nameOf = id => { const c = DATA.state.coffees.find(x => x.id === id); return c ? I18N.tr(c.name) : I18N.t("pick_coffee"); };
    let text, alert = false;
    if (parts.some(p => !p.id || !(p.g > 0))) text = I18N.t("blend_hint_empty");
    else if (!(dose > 0) || !(added < dose)) { text = I18N.t("blend_hint_over"); alert = true; }
    else {
      const piece = (g, id) => I18N.t("blend_hint_part", { g: fmtDecimal(g, 1), n: nameOf(id) });
      text = I18N.t("blend_hint", { d: fmtDecimal(dose, 1), q: [piece(round1(dose - added), main)].concat(parts.map(p => piece(p.g, p.id))).join(", ") });
      // What each added bag keeps: on a new cup only, a saved one is already counted.
      if (!entry.editId) {
        parts.forEach(p => {
          const gauge = DATA.bagGauge(p.id, fallbacks.dose);
          if (gauge) text += " " + I18N.t("blend_hint_left", { r: fmtDecimal(Math.max(0, round1(gauge.grams - p.g)), 1), m: nameOf(p.id) });
        });
      }
    }
    hint.textContent = text;
    hint.classList.toggle("hint-alert", alert);
  }

  /* After a draft was put back in the fields: the field opens on what it holds. */
  function restoreBlend() {
    const a = rowValue({ sel: $("#f-blend-coffee"), g: $("#f-blend-g") }), b = rowValue({ sel: $("#f-blend2-coffee"), g: $("#f-blend2-g") });
    const has = p => !!(p.id || p.g);
    setBlend(has(a) || has(b), has(b) ? [a, b] : [a]);
  }

  // Called once by wireEntry.
  function wireBlend() {
    $("#blend-toggle").addEventListener("click", () => {
      const d = blendDefault();
      setBlend(true, [d]);
      UI.scheduleDraft();
      (d.id ? $("#f-blend-g") : $("#f-blend-coffee")).focus();
    });
    // Removing the second coffee keeps the third, which takes its place.
    $("#blend-remove").addEventListener("click", () => {
      const third = blendRows()[1];
      if (third.open && (third.sel.value || third.g.value)) setBlend(true, [rowValue(third)]);
      else { setBlend(false); $("#blend-toggle").focus(); }
      UI.scheduleDraft();
    });
    // v9.60: a third coffee, opened on what the bags suggest.
    $("#blend-more").addEventListener("click", () => {
      const d = thirdDefault();
      setBlend(true, [rowValue(blendRows()[0]), d]);
      UI.scheduleDraft();
      (d.id ? $("#f-blend2-g") : $("#f-blend2-coffee")).focus();
    });
    $("#blend2-remove").addEventListener("click", () => {
      setBlend(true, [rowValue(blendRows()[0])]);
      UI.scheduleDraft();
      $("#f-blend-g").focus();
    });
    ["f-blend-coffee", "f-blend2-coffee"].forEach(id => $("#" + id).addEventListener("change", updateBlend));
    ["f-blend-g", "f-blend2-g"].forEach(id => $("#" + id).addEventListener("input", updateBlend));
  }

  Object.assign(UI, { fillBlendSelect, setBlend, readBlend, updateBlend, restoreBlend, wireBlend });
})();
