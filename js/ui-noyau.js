/* Interface core: the shared tools, the theme and the navigation.
 *
 * The whole rest of the interface is built on top of it, so this file loads
 * first and exposes the UI object that the others extend. It knows NO screen
 * in particular: when it must redraw one, it goes through UI, and that is
 * deliberate. A core that called rendreHistorique() directly would no longer
 * be a core, it would be the whole application with extra steps.
 *
 * A name placed here is a name every screen may use. That is a commitment:
 * before adding one, check that at least two screens really need it. */
"use strict";

const UI = (() => {

  // ---------- Small tools ----------

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  /* Toggles the visual state AND the announced state in one gesture. Keeping
     them apart would guarantee they diverge: it already happened on other
     projects, the class follows and the attribute stays frozen. */
  /* LONG PRESS on a pill or a tag: opens its definition. Hover does not exist
     under a finger and a tap does not trigger :focus-visible, so on the phone
     half of the vocabulary was unreachable. The short press keeps its toggle
     role, and the bubble is cancelled as soon as the finger moves so it does
     not fire during a scroll. */
  const APPUI_LONG_MS = 450;

  function activerAppuiLong(racine) {
    let minuteur = null, cible = null;
    // True between a bubble opened by long press and the click that follows it.
    let bubbleJustOpened = false;
    const fermer = () => {
      racine.querySelectorAll(".info-ouverte").forEach(x => x.classList.remove("info-ouverte"));
    };
    const annuler = () => { clearTimeout(minuteur); minuteur = null; cible = null; };

    racine.addEventListener("pointerdown", ev => {
      const el = ev.target.closest("[data-info]");
      if (!el) return;
      cible = el;
      bubbleJustOpened = false;
      minuteur = setTimeout(() => {
        fermer();
        el.classList.add("info-ouverte");
        bubbleJustOpened = true;
        minuteur = null;
      }, APPUI_LONG_MS);
    });
    racine.addEventListener("pointermove", annuler);
    racine.addEventListener("pointerup", () => {
      // A long press already opened the bubble: the click that follows must
      // not also toggle the pill. Otherwise the click is let through.
      if (cible && cible.classList.contains("info-ouverte")) {
        setTimeout(fermer, 2500);
      }
      annuler();
    });
    racine.addEventListener("pointercancel", () => { annuler(); fermer(); });

    /* The click that FOLLOWS a long press must do nothing more: the bubble is
       already open, that was all that was asked. Without this, reading the
       definition of a descriptor selected it on the way, and the long press is
       the only way to open the bubble without a mouse.

       In the CAPTURE phase on the container, so before the target and before
       bubbling: that is what lets stopPropagation() keep the delegated
       handler, set on this same container, from seeing the event. */
    racine.addEventListener("click", ev => {
      if (!bubbleJustOpened) return;
      bubbleJustOpened = false;
      ev.stopPropagation();
      ev.preventDefault();
    }, true);
  }

  /* Delays a call until the keystrokes stop. One function per use, not a
     shared queue: two different fields must not cancel each other. */
  /* Signature of a table: enough to know whether it moved, without comparing
     it row by row. maj_le moves on every mutation (see estampiller in
     data.js), the length covers deletions. */
  /* Lookup cache for the STATIC elements of index.html. Only use it on nodes
     that are never replaced ("jamais remplacés", a phrase the tests look for):
     a node coming from an innerHTML would be cached detached, and the
     following writes would go into the void. */
  const cacheChamps = new Map();
  function $f(sel) {
    let el = cacheChamps.get(sel);
    if (!el) { el = document.querySelector(sel); if (el) cacheChamps.set(sel, el); }
    return el;
  }

  /* Writes ONLY if it changes. An innerHTML assignment invalidates the layout
     even when the content is identical, and the live line is rewritten on
     every character while most keystrokes change none of its parts: typing
     in the dial touches neither the ratio nor the cost. */
  function poser(el, html) {
    if (el && el.innerHTML !== html) el.innerHTML = html;
  }

  function poserTexte(el, texte) {
    if (el && el.textContent !== texte) el.textContent = texte;
  }

  function signatureTable(tableau) {
    let max = 0;
    for (const x of tableau) if (x.maj_le > max) max = x.maj_le;
    return tableau.length + ":" + max;
  }

  /* Runs the function only if the signature changed since last time.
     The key separates the memories: two callers must not step on each other. */
  const signatures = new Map();
  function siChange(cle, tableau, fn) {
    const s = signatureTable(tableau);
    if (signatures.get(cle) === s) return false;
    signatures.set(cle, s);
    fn();
    return true;
  }

  /* Forces the next render, whatever the signature. Used by the language
     toggle: the data did not move, but all the text must be redone. */
  function oublierSignatures() {
    signatures.clear();
  }

  function antiRebond(fn, delai) {
    let h = null;
    return (...args) => {
      clearTimeout(h);
      h = setTimeout(() => fn(...args), delai === undefined ? 120 : delai);
    };
  }

  function basculerEtat(el, actif) {
    el.classList.toggle("actif", actif);
    el.setAttribute("aria-pressed", actif ? "true" : "false");
  }

  function toast(message) {
    const t = $("#toast");
    t.textContent = message;
    t.removeAttribute("hidden");
    clearTimeout(toast._h);
    toast._h = setTimeout(() => t.setAttribute("hidden", ""), 2600);
  }

  /* Message with an action button, five seconds. Used to undo a deletion,
     which is ALREADY done when this message shows: see
     supprimerExtractionAvecRetour. The button disappears with the message, so
     there is no follow-up to handle. */
  /* ONE AT A TIME (v8.71): two taps on "Save" during the write created two
     cups. The next call is ignored as long as the first one has not
     finished. */
  function unSeulALaFois(fn) {
    let enCours = false;
    return async (...args) => {
      if (enCours) return undefined;
      enCours = true;
      try { return await fn(...args); } finally { enCours = false; }
    };
  }

  /* UPDATES ANNOUNCE THEMSELVES (v8.72). It took "reloading twice": the
     installed PWA resumes from memory instead of reloading, and nothing
     watched for new versions. On returning to the app we ask the service
     worker to check, and when a new one takes over, a message offers to
     reload, only once, and only if there already was a version (not on the
     very first install). */
  function surveillerMisesAJour() {
    if (!("serviceWorker" in navigator) || !location.protocol.startsWith("http")) return;
    const hadVersion = !!navigator.serviceWorker.controller;
    let offered = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadVersion || offered) return;
      offered = true;
      toastAction(I18N.t("maj_prete"), I18N.t("maj_recharger"), () => location.reload(), true);
    });
    navigator.serviceWorker.register("sw.js").then(reg => {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => { /* offline */ });
      });
    }).catch(() => { /* not critical */ });
  }

  function toastAction(message, libelle, action, persistant) {
    const t = $("#toast");
    t.innerHTML = "";
    t.appendChild(document.createTextNode(message + " "));
    const b = document.createElement("button");
    b.type = "button";
    b.className = "toast-action";
    b.textContent = libelle;
    b.addEventListener("click", () => {
      t.setAttribute("hidden", "");
      clearTimeout(toast._h);
      action();
    });
    t.appendChild(b);
    t.removeAttribute("hidden");
    clearTimeout(toast._h);
    if (persistant) return;
    toast._h = setTimeout(() => {
      t.setAttribute("hidden", "");
      t.textContent = "";
    }, 5000);
  }

  /* Yes or no question in a <dialog>, instead of confirm().

     On the phone, confirm() is a system box: it leaves the theme, ignores the
     page language (the message goes through I18N but not its buttons) and
     breaks the feel of an installed app. Here everything is in the page. The
     SAFE choice gets the focus: Enter cancels, you have to aim to confirm.
     Escape closes the native dialog, so it cancels too.

     Returns a promise of a boolean, so the caller reads as before:
     `if (!await confirmer(texte)) return;`. */
  function confirmer(message, options) {
    const d = $("#modale-confirmer");
    if (!d || typeof d.showModal !== "function") return Promise.resolve(window.confirm(message));
    const danger = !!(options && options.danger);
    poserTexte($("#confirmer-titre"), I18N.t("c_titre"));
    poserTexte($("#confirmer-texte"), message);
    const ok = $("#confirmer-ok"), non = $("#confirmer-annuler");
    ok.textContent = (options && options.libelle) || I18N.t("c_ok");
    non.textContent = I18N.t("t_annuler");
    ok.classList.toggle("btn-danger", danger);
    // Reassigned on each opening: a single handler, never stacked.
    ok.onclick = () => d.close("ok");
    non.onclick = () => d.close("annuler");
    return new Promise(resolve => {
      const onClose = () => {
        d.removeEventListener("close", onClose);
        resolve(d.returnValue === "ok");
      };
      d.addEventListener("close", onClose);
      d.returnValue = "";
      d.showModal();
      non.focus();
    });
  }

  /* Deletes for real, immediately, and offers to go back.

     The order matters and it is deliberate. Delaying the deletion would have
     been simpler to write, but closing the tab during the delay would then
     have CANCELLED a deletion Chris believed done. Here the row goes right
     away, goes to the sync right away, and the undo re-inserts it as a new
     write, which the merge knows how to handle: it is later than the
     tombstone, so it wins. */
  async function supprimerExtractionAvecRetour(ext) {
    const copie = { ...ext };
    delete copie._c;
    await DATA.supprimerExtraction(ext.id);
    UI.rendreHistorique();
    toastAction(I18N.t("t_supprimee"), I18N.t("t_annuler"), async () => {
      await DATA.restaurerExtraction(copie);
      UI.rendreHistorique();
      toast(I18N.t("t_restauree"));
    });
  }

  function fmtTemps(s) {
    if (s === "" || s === null || s === undefined || isNaN(s)) return "";
    const m = Math.floor(s / 60), sec = Math.round(s % 60);
    return m + ":" + String(sec).padStart(2, "0");
  }

  function fmtVND(n) {
    if (n === "" || n === null || isNaN(n)) return "";
    return Math.round(n).toLocaleString("fr-FR") + " ₫";
  }

  // A single definition, in outils.js: see that file's header.
  const { moyenne, cleLocale } = OUTILS;

  function maintenantLocal() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  /* THE TRACK OF A SLIDER. Sliders are drawn in CSS (thin track, thumb with
     an accent border) instead of accent-color, which renders differently on
     each engine. The CSS does not know the value: we give it --pc, the share
     of travel covered, and the track gradient stops there. Call it on every
     input AND on every write of .value by the code, or the track lies. */
  function peindreCurseur(curseur) {
    if (!curseur) return;
    const min = Number(curseur.min) || 0, max = Number(curseur.max);
    const v = Number(curseur.value);
    const pc = isNaN(max) || max === min || isNaN(v) ? 0 : ((v - min) / (max - min)) * 100;
    curseur.style.setProperty("--pc", Math.max(0, Math.min(100, pc)) + "%");
  }

  /* THE RATING WITHOUT A THUMB (v8.40). A slider cannot be empty: the absence
     of a rating lived in a "not rated yet" box, to untick ON TOP of setting
     the rating. It now lives on the slider itself, through the
     curseur-inactif class, as long as it has not been touched. Putting a
     finger anywhere on the track rates, in a single gesture. Since v8.68 this
     class has no style: the slider keeps the same look, the label tells the
     state. Same mechanism in the entry form and in the quick entry. */
  function noteVide(curseur) {
    return !!curseur && curseur.classList.contains("curseur-inactif");
  }
  function marquerNote(curseur, vide) {
    if (curseur) curseur.classList.toggle("curseur-inactif", vide);
  }
  /* The keys that CHANGE the value. Tabbing through the slider must not rate
     the cup: the old unfiltered keydown did. */
  const SLIDER_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"];
  /* pointerdown on top of input: putting the finger where the slider already
     is fires no input, and the rating would have stayed empty unknowingly. */
  function brancherNote(curseur, apres) {
    const toucher = () => { marquerNote(curseur, false); apres(); };
    curseur.addEventListener("input", toucher);
    curseur.addEventListener("pointerdown", toucher);
    curseur.addEventListener("keydown", ev => { if (SLIDER_KEYS.includes(ev.key)) toucher(); });
  }

  /* DICTATING THE COMMENT (v8.43). Speaking while the cup cools down, hands
     busy. Chrome's and Safari's speech recognition goes through their
     servers: the button only exists if the browser knows it AND we are
     online, and it hides as soon as the connection drops. The dictated text
     is ADDED to what is already written and stays editable: nothing goes to
     storage before Save. */
  function brancherDictee(bouton, champ, libelle) {
    const Recognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!bouton || !champ || !Recognition) return;
    const visible = () => { bouton.hidden = typeof navigator !== "undefined" && navigator.onLine === false; };
    visible();
    window.addEventListener("online", visible);
    window.addEventListener("offline", visible);
    let reco = null;
    const etat = actif => {
      bouton.setAttribute("aria-pressed", String(actif));
      if (libelle) libelle.textContent = I18N.t(actif ? "dictee_ecoute" : "dictee");
    };
    bouton.addEventListener("click", () => {
      if (reco) { reco.stop(); return; }
      reco = new Recognition();
      reco.lang = I18N.locale();
      reco.interimResults = false;
      reco.continuous = false;
      const avant = champ.value.trim();
      reco.onresult = ev => {
        const dit = Array.from(ev.results).map(r => r[0].transcript).join(" ").trim();
        if (!dit) return;
        champ.value = (avant ? avant + " " : "") + dit;
        champ.dispatchEvent(new Event("input", { bubbles: true }));
      };
      reco.onerror = ev => {
        if (ev.error === "not-allowed" || ev.error === "service-not-allowed") toast(I18N.t("dictee_refusee"));
        else if (ev.error === "network") toast(I18N.t("dictee_reseau"));
      };
      reco.onend = () => { reco = null; etat(false); };
      try { reco.start(); etat(true); } catch (e) { reco = null; etat(false); }
    });
  }

  /* LINE ICONS. Same drawing as the navigation: 1.8 px, round caps, text
     colour. They replace the Unicode glyphs (⇄ ⚠ ⧉ ✎ 🗑) of the action
     buttons, which changed drawing with the platform and which the
     navigation's "never an emoji" rule already forbade elsewhere. The name
     is a key, not text: what is read is the button's title. */
  const ICONS = {
    chevron: '<path d="m9 6 6 6-6 6"/>',
    gauche: '<path d="m15 6-6 6 6 6"/>',
    comparer: '<path d="M4 8h13"/><path d="m14 5 3 3-3 3"/><path d="M20 16H7"/><path d="m10 13-3 3 3 3"/>',
    ratee: '<path d="M12 4 3 19h18z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
    dupliquer: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    modifier: '<path d="M12 20h8"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    supprimer: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    croix: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
  };
  function icone(nom) {
    return '<svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"' +
      ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[nom] || "") + "</svg>";
  }

  function fmtDateHeure(dh) {
    const d = new Date(dh);
    if (isNaN(d)) return dh;
    return d.toLocaleDateString(I18N.locale(), { day: "numeric", month: "short" }) + " " +
      d.toLocaleTimeString(I18N.locale(), { hour: "2-digit", minute: "2-digit" });
  }

  /* THE DAY IN WORDS (v8.82), for the subheadings of lists grouped by day:
     "Today", "Yesterday", then "Saturday 26 September". The year is only
     written if it is not the current one. */
  function libelleJour(dh) {
    const d = new Date(dh);
    if (isNaN(d)) return String(dh);
    const auj = new Date(); auj.setHours(0, 0, 0, 0);
    const jour = new Date(d); jour.setHours(0, 0, 0, 0);
    const ecart = Math.round((auj - jour) / 86400000);
    if (ecart === 0) return I18N.t("j_aujourdhui");
    if (ecart === 1) return I18N.t("j_hier");
    const s = d.toLocaleDateString(I18N.locale(), { weekday: "long", day: "numeric", month: "long",
      year: d.getFullYear() === auj.getFullYear() ? undefined : "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  // The day key of a date_heure, for grouping: "2026-09-26".
  const cleJour = dh => String(dh).slice(0, 10);
  function fmtHeure(dh) {
    const d = new Date(dh);
    return isNaN(d) ? "" : d.toLocaleTimeString(I18N.locale(), { hour: "2-digit", minute: "2-digit" });
  }

  // "2026-08-12" to "12 Aug 2026", building the date in LOCAL time
  // (new Date("2026-08-12") would be read as UTC).
  function fmtDateCourte(s) {
    const [a, m, j] = String(s).split("-").map(Number);
    if (!a || !m || !j) return s;
    return new Date(a, m - 1, j).toLocaleDateString(I18N.locale(), { day: "numeric", month: "short", year: "numeric" });
  }

  function fmtDecimal(n, dec) {
    return Number(n.toFixed(dec)).toLocaleString(I18N.locale(), { maximumFractionDigits: dec });
  }

  function animerCompteur(el, cible, decimals, suffixe, prefixe) {
    const duree = 750, depart = performance.now();
    const dec = decimals || 0;
    function pas(t) {
      const p = Math.min(1, (t - depart) / duree);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = cible * eased;
      el.textContent = (prefixe || "") +
        v.toLocaleString(I18N.locale(), { minimumFractionDigits: dec, maximumFractionDigits: dec }) + (suffixe || "");
      if (p < 1) requestAnimationFrame(pas);
    }
    requestAnimationFrame(pas);
  }

  // Live recipes (editable, stored with the data).
  function recettesVivantes() { return DATA.state.recettes.filter(r => r.actif !== 0); }
  function recettesDeMethode(m) { return recettesVivantes().filter(r => r.methode === m); }
  function trouverRecette(nom) { return DATA.state.recettes.find(r => r.nom === nom); }
  function recetteAvecVariantes() { return recettesVivantes().find(r => r.variantes); }

  // title attribute: the full value of a truncated cell, on hover.
  // Double quotes would break the attribute, so they are neutralised.
  // The shared escaping (OUTILS.echap), under its old name.
  function attrTitre(texte) {
    return OUTILS.echap(texte || "");
  }

  // "Sous-extrait (acide)|Astringent" to a translated display "Under-extracted (sour), Astringent".
  function diagsAffiches(s) {
    return (s || "").split("|").filter(Boolean).map(d => I18N.diag(d)).join(", ");
  }

  function detailRatio(base, dose, eau) {
    if (base === "chaudiere") return I18N.t("rt_chaudiere", { d: dose, e: eau });
    if (base === "infusion") return I18N.t("rt_infusion", { d: dose, e: eau });
    return "";
  }

  /* True when the cup was marked failed. An empty column means "not said",
     so not failed: that is the case of everything before the flag. */
  function estRatee(e) { return Number(e.ratee) === 1; }

  const INCLUDE_FAILED_KEY = "inclure-ratees";
  /* A READING preference, so local like the theme and the beeps: it changes
     what the figures tell, not the data. Nothing to sync. */
  function inclureRatees() {
    try { return localStorage.getItem(INCLUDE_FAILED_KEY) === "1"; } catch (e) { return false; }
  }

  function basculerRatees(inclure) {
    try { localStorage.setItem(INCLUDE_FAILED_KEY, inclure ? "1" : "0"); } catch (e) { /* too bad */ }
  }

  /* The extractions we draw ADVICE from: insights, best settings, tastes,
     machine duel, trend. A failed cup describes a missed gesture, not a
     setting, and keeping it can get a correct setting condemned.

     COUNTS keep everything, always: cups drunk, grams used, cost, activity
     calendar, bag stock. The coffee was indeed used, and a gesture error does
     not erase the expense. That is the dividing line, and it fits in one
     sentence: what describes WHAT HAPPENED counts everything, what advises
     WHAT TO DO leaves the failed ones out. */
  function extAnalysables() {
    const tout = extAvecCalculs();
    return inclureRatees() ? tout : tout.filter(e => !estRatee(e));
  }

  /* KEPT IN MEMORY (v8.75). Every render, and every keystroke in the entry
     form, recomputed ratio, bag age and the rest for the whole history, dozens
     of times per dashboard render. The calculation is redone when the data
     moves: DATA revision, or tables replaced or grown (load, sync, add). A
     copy of the array is returned on every call: a caller that sorts does
     not disturb the others. */
  /* Each cup keeps its calculation as long as ITS content does not change
     (even modified in place, by a path that does not notify), and as long as
     the coffees and bags it depends on have not moved (DATA revision, tables
     replaced or grown). The returned array is new on every call. */
  let globalMemo = null, memoVersion = 0;
  const memoParTasse = new WeakMap();
  function extAvecCalculs() {
    const s = DATA.state;
    const cle = [DATA.revisionDonnees ? DATA.revisionDonnees() : 0, s.cafes, s.cafes.length, s.achats, s.achats.length];
    if (!globalMemo || cle.some((v, i) => v !== globalMemo[i])) { globalMemo = cle; memoVersion++; }
    return s.extractions.map(e => {
      const sig = JSON.stringify(e);
      const m = memoParTasse.get(e);
      if (m && m.v === memoVersion && m.sig === sig) return m.obj;
      const obj = { ...e, _c: DATA.calculs(e) };
      memoParTasse.set(e, { sig, v: memoVersion, obj });
      return obj;
    });
  }

  // Dose used when nothing prefills it (recipe without a dose, blank form).
  // 15 g is the dose of all the original Switch recipes.
  const DOSE_REPLI_USINE = 15;

  // Default heat level, personal scale from 1 to 10, Brikka only.
  /* 3 since Chris asked for it again. The scale has already been 3, then 4,
     then 2 (schema steps v1 and v2): it comes back to its starting point. */
  const FEU_REPLI_USINE = 3;

  /* The grinder's REAL setting, the one where the dial physically sits. It is
     not the same thing as a recipe's dial, which is a TARGET: the Brikka aims
     for 1.2.0 and the Switch for 1.6.0, but Chris leaves his C5 on 1.5.0, the
     "compromise that works for both" from his guide, so as not to recount the
     clicks at every machine change. The form prefilled the target and so made
     him record a grind he had not used.
     The target stays visible in the side panel, and the range warning keeps
     reporting a real gap. */
  const MOLETTE_REPLI_USINE = "1.5.0";

  /* Read VIEW on the `reglages` table, which syncs. These three values
     describe Chris's EQUIPMENT: his grinder dial is the same seen from the
     phone and from the computer. They lived in localStorage, so his phone
     ignored what he set on the computer, and he could not see it since these
     are prefilled fields that look normal.

     The theme and the beeps, however, rightly stay local: a phone in the
     kitchen and a computer do not have the same needs.

     `replis` stays a plain object because it is read everywhere in the
     rendering code; it is just refreshed from DATA on every notification. */
  const CLE_REPLIS = "replis-saisie";
  /* Kettle boiling time, in seconds, from tap water.
     ZERO as long as Chris has not timed it: without a measure, no estimate,
     the entry help asks to do it once. */
  /* TWO MINUTES, measured by Chris on his kettle: tap water to a rolling
     boil. It was 0 until now, and the model refuses to compute without a
     boiling time: the temperature estimate from the heating time therefore
     NEVER started unless one went to set it in Settings. A correct factory
     fallback beats a neutral fallback that disables the feature. */
  const EBULLITION_USINE = 120;
  const replis = { dose: DOSE_REPLI_USINE, feu: FEU_REPLI_USINE, molette: MOLETTE_REPLI_USINE, ebullition: EBULLITION_USINE, bulles: "" };

  function chargerReplis() {
    const r = DATA.reglagesCourants();
    replis.dose = r.dose_g;
    replis.feu = r.puissance_feu;
    replis.molette = r.mouture_dial;
    replis.ebullition = r.ebullition_s;
    replis.bulles = r.bulles_s;
    // The steps of the numeric correction (v8.48), as is: the row's columns.
    replis.dessins = r.dessins || "";
    replis.pas = { pas_crans: r.pas_crans, pas_degres: r.pas_degres, pas_feu: r.pas_feu,
      pas_eau_g: r.pas_eau_g, pas_dose_g: r.pas_dose_g };
  }

  /* One-time takeover of the settings set before the sync. Without it, Chris
     would find the factory values again and have to set everything by hand.
     Marked once, and only if the table is still empty: a takeover that
     overwrote an already synced setting would be worse than none. */
  async function reprendreReplisLocaux() {
    let brut = null;
    try {
      if (localStorage.getItem("replis-repris")) return;
      brut = JSON.parse(localStorage.getItem(CLE_REPLIS) || "null");
      localStorage.setItem("replis-repris", "1");
    } catch (e) { return; }
    if (!brut || DATA.state.reglages.length) return;
    await DATA.majReglages({
      dose_g: brut.dose,
      puissance_feu: brut.feu,
      mouture_dial: brut.molette,
    });
    chargerReplis();
  }

  async function ecrireReplis() {
    await DATA.majReglages({
      dose_g: replis.dose,
      puissance_feu: replis.feu,
      mouture_dial: replis.molette,
      ebullition_s: replis.ebullition,
      bulles_s: replis.bulles,
      ...(replis.pas || {}),
      dessins: replis.dessins || "",
    });
  }

  // ---------- Theme ----------

  /* The two dark palettes (v8.34): data-theme gives the family, data-sombre
     the palette. The status bar colour follows the palette. */
  const TINTS = { clair: "#f4ede3", graphite: "#111113", nuit: "#0b1017" };
  function appliquerTheme(theme, palette) {
    document.documentElement.setAttribute("data-theme", theme);
    if (palette) document.documentElement.setAttribute("data-sombre", palette);
    try {
      localStorage.setItem("theme", theme);
      if (palette) localStorage.setItem("sombre", palette);
    } catch (e) { /* unavailable, too bad */ }
    /* The status bar of the installed PWA follows the theme. The two tags of
       the <head> only know the system preference, and the browser keeps the
       one whose media matches: so we write the chosen colour into BOTH,
       otherwise the one it keeps would contradict the choice. */
    const teinte = theme === "sombre"
      ? TINTS[document.documentElement.getAttribute("data-sombre")] || TINTS.graphite
      : TINTS.clair;
    document.querySelectorAll('meta[name="theme-color"]')
      .forEach(m => m.setAttribute("content", teinte));
    if (typeof Chart !== "undefined") {
      CHARTS.appliquerDefauts();
      rendreEcranCourant(true);
    }
  }

  /* The restore on load lives in the <head> of index.html, not here: a
     deferred script only acts after the first render, and the light theme
     therefore flashed dark on every opening. */

  // ---------- Navigation ----------

  const ECRANS = ["tableau", "saisie", "historique", "reglages", "guide", "parametres"];

  /* Old screen names still present in a bookmark or a PWA shortcut.
     "reference" merged into "guide": the reference and the buying guide
     talked about the same equipment and were read one after the other. */
  const ECRANS_RENOMMES = { reference: "guide" };
  function normaliserEcran(nom) {
    return ECRANS_RENOMMES[nom] || nom;
  }
  /* Navigation state, in a single object mutated in place rather than in
     separate variables. The shape matters: several files read and write it,
     and a shared object reads up to date everywhere, where a borrowed
     variable would be frozen on its value at load time. */
  const nav = { ecran: "tableau" };

  /* Wraps a screen change in a view transition when the engine can do it.
     Otherwise we call directly: the fallback is the previous behaviour, not
     a degraded version.

     Reduced motion is also respected here and not only in CSS: starting the
     machinery only to cancel it afterwards would be work for nothing. */
  function avecTransition(fn) {
    const bouge = typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    /* HIDDEN document (background tab, minimised window): the browser has no
       rendering opportunity, so the update callback would wait forever and
       the screen would only switch on return. We switch right away, without
       animation: nobody is watching it. */
    const cache = typeof document.visibilityState === "string" && document.visibilityState === "hidden";
    if (bouge || cache || !document.startViewTransition) { fn(); return; }
    const transition = document.startViewTransition(fn);
    /* A transition interrupted by the next one, or skipped, rejects its
       promises: that is normal, and without this catch every quick screen
       switch left an "Uncaught (in promise)" in the console. */
    if (transition && transition.ready) transition.ready.catch(() => {});
    if (transition && transition.finished) transition.finished.catch(() => {});
  }

  /* pourEdition: true ONLY when chargerExtractionDansSaisie opens the
     screen. It used to be a shared flag, set before a forty-line body and
     reset after, without finally: an exception in the middle left it true
     forever and the edit abandonment below never fired again. Chris then
     reopened an old extraction believing he was entering a new one, and
     modified it without meaning to.

     As a parameter, there is no state left to get stuck: the information
     belongs to the call, it lives as long as the call. */
  function activerEcran(nom, pourEdition) {
    /* Arriving on Entry through the navigation means "I want to log a cup",
       never "resume the edit from ten minutes ago". So we abandon the edit in
       progress, and we SAY so: without the message, the abandonment would be
       as silent as the bug it fixes. Nothing is lost in storage, the modified
       extraction had not been saved and can still be opened from the history. */
    if (nom === "saisie" && UI.saisie.editId && !pourEdition) {
      UI.reinitialiserSaisie();
      toast(I18N.t("t_edition_abandonnee"));
    }
    /* Arriving on Entry for a NEW cup must show the current time. Here and
       not in rendreEcranCourant: that one replays on every data
       notification, and the date would jump while filling in the form. On
       arrival, once, is what we want. */
    if (nom === "saisie" && !UI.saisie.editId) UI.rafraichirDateSaisie();
    nav.ecran = nom;
    // Only the VISUAL switch goes into the transition. The edit abandonment
    // above is business logic: it happens in every case.
    avecTransition(() => {
      $$(".ecran").forEach(e => e.classList.remove("actif"));
      /* aria-current="page" and not aria-pressed: these are navigation links
          disguised as buttons, not toggles. */
      $$(".nav-btn").forEach(b => {
        b.classList.toggle("actif", b.dataset.ecran === nom);
        if (b.dataset.ecran === nom) b.setAttribute("aria-current", "page");
        else b.removeAttribute("aria-current");
      });
      const sec = $("#ecran-" + nom);
      if (sec) sec.classList.add("actif");
      if (location.hash !== "#" + nom) history.replaceState(null, "", "#" + nom);
      rendreEcranCourant();
    });
    window.scrollTo({ top: 0 });
  }

  function rendreEcranCourant(force) {
    if (nav.ecran === "tableau") { UI.rendreTableau(); UI.rendreDessins(); }
    else if (nav.ecran === "reglages") UI.rendreReglages();
    else if (nav.ecran === "historique") UI.rendreHistorique();
    else if (nav.ecran === "parametres") UI.rendreParametres();
    else if (nav.ecran === "guide" && force) UI.rendreConvertisseur();
  }

  return {
    $, $$, $f, APPUI_LONG_MS, CLE_REPLIS, DOSE_REPLI_USINE, EBULLITION_USINE, ECRANS, ECRANS_RENOMMES,
    FEU_REPLI_USINE, MOLETTE_REPLI_USINE, activerAppuiLong, activerEcran, animerCompteur,
    antiRebond, appliquerTheme, attrTitre, avecTransition, basculerEtat, cacheChamps,
    basculerRatees, chargerReplis, cleLocale, confirmer, detailRatio, diagsAffiches,
    ecrireReplis, estRatee, extAnalysables, inclureRatees,
    cleJour, extAvecCalculs, fmtDateCourte, fmtDateHeure, fmtDecimal, fmtHeure, libelleJour, fmtTemps, fmtVND, icone,
    maintenantLocal, marquerNote, brancherDictee, brancherNote, noteVide, peindreCurseur, moyenne, nav, normaliserEcran, oublierSignatures, poser, poserTexte,
    recetteAvecVariantes, recettesDeMethode, recettesVivantes, rendreEcranCourant, replis,
    reprendreReplisLocaux, siChange, signatureTable, signatures,
    supprimerExtractionAvecRetour, toast, toastAction, trouverRecette, unSeulALaFois, surveillerMisesAJour,
  };
})();
