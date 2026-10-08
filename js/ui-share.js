/* F2 (v9.19): A CUP, OR A RECIPE, TO SHARE.
 *
 * « Partager » on a cup builds two things: an IMAGE in the logbook's colours
 * (the Graphite palette: near black, cream ink, the copper of the accent),
 * with the coffee, the recipe, dose and water, the water or the heat, the
 * grind, the time, the tastes and the score; and a TEXT with the recipe and
 * its steps, for a message:
 *
 *   Là Việt Balanced · One and Done
 *   15 g / 225 g · 92 °C · molette 1.5.0 · 2:24
 *   Étapes :
 *   0:00 Bloom 45 g ...
 *   Goûts : caramel, rond · 8,5/10
 *   Carnet d'extraction
 *
 * A Guide recipe shares the same way: its steps, dose, water, temperature
 * and time. The window shows the card, which flips from the logbook's cover
 * to the image once drawn, and the text. « Partager » hands both to the
 * phone's share sheet (Zalo, WhatsApp, Messenger) when the browser can send
 * a file (navigator.canShare), the text alone otherwise, and copies the text
 * to the clipboard where there is no share sheet at all.
 *
 * Any button can ask for it: data-share-cup="<id>", data-share-recipe="<id>",
 * or data-action="share" inside an element carrying data-id (a history row).
 * One listener on the document serves them all. */
"use strict";

(() => {

  const { $, toast, fmtDecimal, fmtDuration, findRecipe } = UI;

  const fmt1 = n => fmtDecimal(n, 1);
  const has = v => v !== "" && v !== undefined && v !== null;

  // ---------- The text ----------

  /* The steps of a recipe, translated then scaled to the water really
     poured (the same rule as the Guide and the brew mode, scalePours). */
  function stepLines(recipe, water) {
    if (!recipe || !Array.isArray(recipe.steps) || !recipe.steps.length) return [];
    const f = !recipe.has_variants && typeof pourFactor === "function" ? pourFactor(recipe, water) : 1;
    return recipe.steps.map(s => {
      const text = typeof scalePours === "function" ? scalePours(I18N.tr(s.text), f) : I18N.tr(s.text);
      return (s.t === null || s.t === undefined || s.t === "" ? "· " : fmtDuration(s.t) + " ") + text;
    });
  }

  // The settings line of a cup: dose and water, the water or the heat, the grind, the time.
  function cupSettings(ext) {
    return [
      has(ext.dose_g) ? ext.dose_g + " g" + (has(ext.water_g) ? " / " + ext.water_g + " g" : "") : "",
      ext.method === "Brikka"
        ? [has(ext.heat_level) ? I18N.t("share_heat", { f: ext.heat_level }) : "", Number(ext.preheated_water) === 1 ? I18N.t("share_preheated") : ""].filter(Boolean).join(" · ")
        : has(ext.temperature_c) ? ext.temperature_c + " °C" : "",
      ext.grind_dial ? I18N.t("dial") + " " + ext.grind_dial : "",
      has(ext.total_time_s) ? fmtDuration(Number(ext.total_time_s)) : "",
    ].filter(Boolean).join(" · ");
  }

  const tastesOf = ext => String(ext.descriptors || "").split("|").filter(Boolean).map(t => I18N.tag(t));

  function cupText(ext, coffeeName, recipe) {
    const lines = [[coffeeName, ext.recipe ? I18N.tr(ext.recipe) : ext.method].filter(Boolean).join(" · ")];
    const settings = cupSettings(ext);
    if (settings) lines.push(settings);
    const steps = stepLines(recipe, ext.water_g);
    if (steps.length) lines.push(I18N.t("share_steps"), ...steps);
    const tastes = tastesOf(ext);
    const score = has(ext.score_10) ? I18N.t("share_score", { m: fmt1(Number(ext.score_10)) }) : "";
    if (tastes.length) lines.push(I18N.t("share_tastes", { t: tastes.join(", ") }) + (score ? " · " + score : ""));
    else if (score) lines.push(I18N.t("share_rated", { m: score }));
    lines.push(I18N.t("share_signature"));
    return lines.join("\n");
  }

  function recipeSettings(r) {
    return [
      has(r.dose) ? r.dose + " g" + (has(r.water) ? " / " + r.water + " g" : "") : "",
      r.method === "Brikka" ? (has(r.heat_level) ? I18N.t("share_heat", { f: r.heat_level }) : "")
        : has(r.temp) ? r.temp + " °C" : I18N.tr(r.tempText || ""),
      r.dial ? I18N.t("dial") + " " + r.dial : "",
      r.totalText ? I18N.tr(r.totalText) : "",
    ].filter(Boolean).join(" · ");
  }

  function recipeText(r) {
    const lines = [[I18N.tr(r.name), I18N.machine ? I18N.machine(r.method) : r.method].join(" · ")];
    const settings = recipeSettings(r);
    if (settings) lines.push(settings);
    const steps = stepLines(r, r.water);
    if (steps.length) lines.push(I18N.t("share_steps"), ...steps);
    // Who it is for: its first sentence, a message is not the Guide.
    if (r.bestFor) lines.push(I18N.t("share_for_who", { t: I18N.tr(r.bestFor).split(/(?<=\.)\s/)[0] }));
    lines.push(I18N.t("share_signature"));
    return lines.join("\n");
  }

  // ---------- The image ----------

  /* The Graphite palette of css/base.css, written here because a canvas does
     not read CSS: the image is the same whatever the theme on screen. */
  const INK = "#f6f3ee", TEXT = "#d6d1ca", MUTED = "#a49e96", ACCENT = "#e8bb85";
  const BG_TOP = "#1b1b1e", BG = "#111113", TILE = "rgba(255, 255, 255, 0.055)", LINE = "rgba(255, 255, 255, 0.10)";
  const MACHINE = { Brikka: "#4f93e6", Switch: "#ef7440" };
  const W = 1080, H = 1350, PAD = 88;
  const SERIF = '"Instrument Serif", Georgia, serif', SANS = 'Manrope, "Segoe UI", system-ui, sans-serif';

  // Words that fit a width, on at most maxLines lines; the last one ends on an ellipsis if cut.
  function wrap(ctx, text, width, maxLines) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (let i = 0; i < words.length; i++) {
      const tryLine = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(tryLine).width <= width || !line) { line = tryLine; continue; }
      lines.push(line);
      line = words[i];
      if (lines.length === maxLines) { line = ""; break; }
    }
    if (line) lines.push(line);
    const cut = lines.length > maxLines || lines.join(" ").split(" ").length < words.length;
    const out = lines.slice(0, maxLines);
    if (cut && out.length) {
      let last = out[out.length - 1];
      while (last && ctx.measureText(last + "…").width > width) last = last.slice(0, -1);
      out[out.length - 1] = last.trim() + "…";
    }
    return out;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function background(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, BG_TOP);
    g.addColorStop(1, BG);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // The warm glow of the site's dark background, top right.
    const glow = ctx.createRadialGradient(W * 0.86, -40, 10, W * 0.86, -40, 760);
    glow.addColorStop(0, "rgba(232, 187, 133, 0.16)");
    glow.addColorStop(1, "rgba(232, 187, 133, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  }

  function eyebrow(ctx, text, y) {
    ctx.font = "700 26px " + SANS;
    ctx.fillStyle = MUTED;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "4px";
    ctx.fillText(String(text).toUpperCase(), PAD, y);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  }

  function machinePill(ctx, method, y) {
    ctx.font = "600 30px " + SANS;
    const label = I18N.machine ? I18N.machine(method) : method;
    const w = ctx.measureText(label).width + 74;
    roundRect(ctx, PAD, y - 38, w, 54, 27);
    ctx.fillStyle = TILE;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(PAD + 30, y - 11, 9, 0, Math.PI * 2);
    ctx.fillStyle = MACHINE[method] || ACCENT;
    ctx.fill();
    ctx.fillStyle = TEXT;
    ctx.fillText(label, PAD + 50, y);
  }

  // Up to four tiles in a row of two: a small label, a big value.
  function tiles(ctx, list, y) {
    const gap = 22, w = (W - 2 * PAD - gap) / 2, h = 128;
    list.slice(0, 4).forEach((t, i) => {
      const x = PAD + (i % 2) * (w + gap), ty = y + Math.floor(i / 2) * (h + gap);
      roundRect(ctx, x, ty, w, h, 22);
      ctx.fillStyle = TILE;
      ctx.fill();
      ctx.font = "700 22px " + SANS;
      ctx.fillStyle = MUTED;
      if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
      ctx.fillText(String(t.label).toUpperCase(), x + 28, ty + 46);
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
      ctx.font = "600 44px " + SANS;
      ctx.fillStyle = INK;
      ctx.fillText(wrap(ctx, t.value, w - 56, 1)[0] || "", x + 28, ty + 100);
    });
    return y + Math.ceil(Math.min(4, list.length) / 2) * (h + gap);
  }

  function footer(ctx) {
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD, H - 150);
    ctx.lineTo(W - PAD, H - 150);
    ctx.stroke();
    // The rail's cup (the brand icon), drawn at 2.4 times its 24 px: body, handle, steam.
    ctx.save();
    ctx.translate(PAD, H - 118);
    ctx.scale(2.4, 2.4);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(4, 8); ctx.lineTo(17, 8); ctx.lineTo(17, 14);
    ctx.arc(12, 14, 5, 0, Math.PI / 2); ctx.lineTo(9, 19);
    ctx.arc(9, 14, 5, Math.PI / 2, Math.PI); ctx.closePath();
    ctx.moveTo(17, 9.5); ctx.lineTo(18.5, 9.5); ctx.arc(18.5, 12, 2.5, -Math.PI / 2, Math.PI / 2); ctx.lineTo(17, 14.5);
    ctx.moveTo(7, 3.5); ctx.lineTo(7, 5.5); ctx.moveTo(11, 3.5); ctx.lineTo(11, 5.5);
    ctx.stroke();
    ctx.restore();
    ctx.font = "44px " + SERIF;
    ctx.fillStyle = INK;
    ctx.fillText(I18N.t("share_signature"), PAD + 76, H - 72);
    ctx.font = "500 26px " + SANS;
    ctx.fillStyle = MUTED;
    ctx.textAlign = "right";
    ctx.fillText(I18N.t("share_brewers"), W - PAD, H - 74);
    ctx.textAlign = "left";
  }

  function drawCup(ctx, ext, coffeeName) {
    background(ctx);
    const d = new Date(String(ext.date_time || ""));
    const when = isNaN(d) ? "" : d.toLocaleDateString(I18N.locale(), { day: "numeric", month: "long", year: "numeric" });
    eyebrow(ctx, [I18N.t("share_signature"), when].filter(Boolean).join(" · "), PAD + 22);
    machinePill(ctx, ext.method, PAD + 118);
    let y = PAD + 240;
    ctx.font = "104px " + SERIF;
    ctx.fillStyle = INK;
    wrap(ctx, coffeeName || I18N.t("share_no_coffee"), W - 2 * PAD, 2).forEach(l => { ctx.fillText(l, PAD, y); y += 104; });
    ctx.font = "500 40px " + SANS;
    ctx.fillStyle = TEXT;
    wrap(ctx, ext.recipe ? I18N.tr(ext.recipe) : "", W - 2 * PAD, 1).forEach(l => { ctx.fillText(l, PAD, y - 22); y += 40; });
    // The score, in the copper of the accent, as on the dashboard.
    y += 190;
    if (has(ext.score_10)) {
      ctx.font = "230px " + SERIF;
      ctx.fillStyle = ACCENT;
      const s = fmt1(Number(ext.score_10));
      ctx.fillText(s, PAD - 6, y);
      const sw = ctx.measureText(s).width;
      ctx.font = "500 46px " + SANS;
      ctx.fillStyle = MUTED;
      ctx.fillText("/ 10", PAD + sw + 14, y - 18);
    } else {
      ctx.font = "500 40px " + SANS;
      ctx.fillStyle = MUTED;
      ctx.fillText(I18N.t("not_rated_yet"), PAD, y - 60);
    }
    y += 54;
    const water = ext.method === "Brikka"
      ? { label: I18N.t("share_tile_heat"), value: has(ext.heat_level) ? ext.heat_level + " / 10" : "" }
      : { label: I18N.t("share_tile_water"), value: has(ext.temperature_c) ? ext.temperature_c + " °C" : "" };
    const list = [
      { label: I18N.t("share_tile_dose"), value: has(ext.dose_g) ? ext.dose_g + (has(ext.water_g) ? " → " + ext.water_g : "") + " g" : "" },
      water,
      { label: I18N.t("share_tile_grind"), value: ext.grind_dial || I18N.t("bag_default") },
      { label: I18N.t("share_tile_time"), value: has(ext.total_time_s) ? fmtDuration(Number(ext.total_time_s)) : "" },
    ].filter(t => t.value);
    y = tiles(ctx, list, y);
    // The tastes, as outlined pills.
    const tastes = tastesOf(ext).slice(0, 6);
    if (tastes.length) {
      ctx.font = "600 32px " + SANS;
      let x = PAD, ty = y + 34;
      tastes.forEach(t => {
        const w = ctx.measureText(t).width + 48;
        if (x + w > W - PAD) { x = PAD; ty += 72; }
        if (ty > H - 230) return;
        roundRect(ctx, x, ty - 40, w, 58, 29);
        ctx.strokeStyle = "rgba(232, 187, 133, 0.55)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = INK;
        ctx.fillText(t, x + 24, ty);
        x += w + 14;
      });
    }
    footer(ctx);
  }

  function drawRecipe(ctx, r) {
    background(ctx);
    eyebrow(ctx, I18N.t("share_recipe_eyebrow"), PAD + 22);
    machinePill(ctx, r.method, PAD + 118);
    let y = PAD + 236;
    ctx.font = "92px " + SERIF;
    ctx.fillStyle = INK;
    wrap(ctx, I18N.tr(r.name), W - 2 * PAD, 2).forEach(l => { ctx.fillText(l, PAD, y); y += 92; });
    if (r.subtitle) {
      ctx.font = "500 36px " + SANS;
      ctx.fillStyle = TEXT;
      wrap(ctx, I18N.tr(r.subtitle), W - 2 * PAD, 1).forEach(l => { ctx.fillText(l, PAD, y - 18); y += 36; });
    }
    y += 24;
    const list = [
      { label: I18N.t("share_tile_dose"), value: has(r.dose) ? r.dose + (has(r.water) ? " → " + r.water : "") + " g" : "" },
      r.method === "Brikka" ? { label: I18N.t("share_tile_heat"), value: has(r.heat_level) ? r.heat_level + " / 10" : "" }
        : { label: I18N.t("share_tile_water"), value: has(r.temp) ? r.temp + " °C" : I18N.tr(r.tempText || "") },
      { label: I18N.t("share_tile_grind"), value: r.dial || "" },
      { label: I18N.t("share_tile_time"), value: I18N.tr(r.totalText || "") },
    ].filter(t => t.value);
    y = tiles(ctx, list, y) + 26;
    /* The steps: the time in copper, the text beside it. As many as fit
       above the footer; the last one that does not fit whole is cut on an
       ellipsis rather than dropped. */
    const steps = stepLines(r, r.water);
    const LINE = 38, BOTTOM = H - 180;
    for (const line of steps) {
      const room = Math.floor((BOTTOM - y) / LINE);
      if (room < 1) break;
      const m = line.match(/^(\d+:\d{2}|·) (.*)$/);
      const t = m ? m[1] : "", body = m ? m[2] : line;
      ctx.font = "500 29px " + SANS;
      const lines = wrap(ctx, body, W - 2 * PAD - 110, Math.min(3, room));
      ctx.fillStyle = ACCENT;
      ctx.font = "700 29px " + SANS;
      ctx.fillText(t, PAD, y);
      ctx.font = "500 29px " + SANS;
      ctx.fillStyle = TEXT;
      lines.forEach(l => { ctx.fillText(l, PAD + 110, y); y += LINE; });
      y += 12;
    }
    footer(ctx);
  }

  // The fonts of the page, loaded before drawing: a canvas would fall back on Georgia otherwise.
  async function fontsReady() {
    if (!document.fonts || !document.fonts.load) return;
    try {
      await Promise.all(["104px " + SERIF, "600 40px " + SANS, "700 26px " + SANS].map(f => document.fonts.load(f, "Àé ạ")));
    } catch (e) { /* the fallback fonts draw it anyway */ }
  }

  async function drawToBlob(draw) {
    await fontsReady();
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx || typeof canvas.toBlob !== "function") return null;
    draw(ctx);
    return new Promise(resolve => canvas.toBlob(b => resolve(b), "image/png"));
  }

  // ---------- The window ----------

  const share = { text: "", title: "", file: null, url: "", run: 0 };
  const slug = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "tasse";
  const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canSendFiles = file => !!(file && navigator.canShare && (() => { try { return navigator.canShare({ files: [file] }); } catch (e) { return false; } })());

  function forgetImage() {
    if (share.url && typeof URL !== "undefined" && URL.revokeObjectURL) URL.revokeObjectURL(share.url);
    share.url = "";
    share.file = null;
  }

  async function openShare(o) {
    const d = $("#modal-share");
    if (!d) return;
    forgetImage();
    const run = ++share.run;
    share.text = o.text;
    share.title = o.title;
    $("#share-title").textContent = o.heading;
    $("#share-text").textContent = o.text;
    const img = $("#share-img"), card = $("#share-card");
    img.removeAttribute("src");
    img.alt = "";
    card.classList.remove("is-shown");
    card.classList.add("is-waiting");
    // Without a share sheet, the text goes to the clipboard: one button says so.
    $("#share-send").hidden = typeof navigator === "undefined" || !navigator.share;
    // The image to keep, where it cannot travel with the text (a desktop without file sharing).
    const save = $("#share-save");
    if (save) { save.hidden = true; save.removeAttribute("href"); }
    if (!d.open) d.showModal();
    const blob = await drawToBlob(o.draw);
    if (run !== share.run || !d.open) return;
    card.classList.remove("is-waiting");
    if (!blob) return;
    share.file = typeof File === "function" ? new File([blob], o.fileName, { type: "image/png" }) : null;
    share.url = URL.createObjectURL(blob);
    img.src = share.url;
    img.alt = o.alt;
    if (save && !canSendFiles(share.file)) { save.href = share.url; save.setAttribute("download", o.fileName); save.hidden = false; }
    // The card turns over once the image is there: from the logbook's cover to the cup.
    const show = () => { if (run === share.run) card.classList.add("is-shown"); };
    if (calm() || typeof requestAnimationFrame !== "function") show();
    else {
      requestAnimationFrame(() => requestAnimationFrame(show));
      // A throttled tab gives no frame: the card turns anyway.
      setTimeout(show, 120);
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(share.text);
      toast(I18N.t("share_copied"));
    } catch (e) {
      // No clipboard (an old engine, an http page): the text is selected for a manual copy.
      const pre = $("#share-text");
      if (pre && window.getSelection && document.createRange) {
        const range = document.createRange();
        range.selectNodeContents(pre);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      toast(I18N.t("share_copy_failed"));
    }
  }

  /* Image and text when the browser can send a file, the text alone
     otherwise, the clipboard without a share sheet. Closing the sheet
     without choosing is not an error. */
  async function send() {
    const data = { title: share.title, text: share.text };
    try {
      if (canSendFiles(share.file)) await navigator.share({ ...data, files: [share.file] });
      else if (navigator.share) await navigator.share(data);
      else { await copyText(); return; }
    } catch (e) {
      if (e && e.name === "AbortError") return;
      await copyText();
    }
  }

  // ---------- What can be shared ----------

  function shareCup(ext) {
    if (!ext) return;
    const coffee = DATA.state.coffees.find(c => c.id === ext.coffee_id);
    const name = coffee ? coffee.name : "";
    const recipe = ext.recipe ? findRecipe(ext.recipe) : null;
    openShare({
      heading: I18N.t("share_cup_title"),
      title: [name, ext.recipe ? I18N.tr(ext.recipe) : ""].filter(Boolean).join(" · "),
      text: cupText(ext, name, recipe),
      alt: I18N.t("share_cup_alt", { c: name || I18N.t("share_no_coffee") }),
      fileName: "carnet-" + slug(name) + ".png",
      draw: ctx => drawCup(ctx, ext, name),
    });
  }

  function shareRecipe(r) {
    if (!r) return;
    openShare({
      heading: I18N.t("share_recipe_title"),
      title: I18N.tr(r.name),
      text: recipeText(r),
      alt: I18N.t("share_recipe_alt", { r: I18N.tr(r.name) }),
      fileName: "recette-" + slug(r.name) + ".png",
      draw: ctx => drawRecipe(ctx, r),
    });
  }

  // The share icon (a box and its arrow), the stroke of the rail's icons.
  const shareIcon = () => '<svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 3v12"/><path d="m7.5 7.5 4.5-4.5 4.5 4.5"/><path d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12"/></svg>';

  function wireShare() {
    document.addEventListener("click", ev => {
      const t = ev.target && ev.target.closest ? ev.target : null;
      if (!t) return;
      const recipeBtn = t.closest("[data-share-recipe]");
      if (recipeBtn) { shareRecipe(DATA.state.recipes.find(r => r.id === recipeBtn.dataset.shareRecipe)); return; }
      const cupBtn = t.closest("[data-share-cup], [data-action='share']");
      if (!cupBtn) return;
      const holder = cupBtn.dataset.shareCup ? null : cupBtn.closest("[data-id]");
      const id = cupBtn.dataset.shareCup || (holder ? holder.dataset.id : "");
      shareCup(DATA.state.extractions.find(e => e.id === id));
    });
    const d = $("#modal-share");
    if (!d) return;
    $("#share-send").addEventListener("click", send);
    $("#share-copy").addEventListener("click", copyText);
    d.addEventListener("close", () => { share.run++; forgetImage(); $("#share-img").removeAttribute("src"); });
    // A click on the backdrop closes, like the palette.
    d.addEventListener("click", ev => { if (ev.target === d) d.close(); });
  }

  Object.assign(UI, { wireShare, shareCup, shareRecipe, shareIcon, cupShareText: cupText, recipeShareText: recipeText });
})();
