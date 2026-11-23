/* THE DURATION, TYPED AS « 3:50 » (v9.59): the entry's times (total, drawdown)
 * are each ONE text field, the one of the cup's panel. Chris: « le champ temps
 * de la saisie / modif rapide, mets-le aussi sur l'écran de saisie complète
 * dans ce format-là, c'est très pratique ». It replaces the two wheels of
 * v9.13 (minutes and seconds over two number fields).
 *
 * The field is the source of truth: saving, the draft and the stopwatch read
 * and write it through UI.readDuration and UI.writeDuration (js/ui-entry.js),
 * which share the panel's reading (TOOLS.parseDuration): « 3:50 », « 3 50 »,
 * « 3.50 », « 230 ». Leaving the field rewrites what was understood as m:ss;
 * what cannot be read is underlined in red and refused at saving.
 *
 * The quick buttons stay beside: five seconds less or more, fifteen more, and
 * « Reprendre le chrono » when the stopwatch has a time, for the total and the
 * drawdown (from the "open" step). The up and down arrows move one second. An
 * empty field still means "no time". */
"use strict";

(() => {

  const { $ } = UI;

  const QUICK = [-5, 5, 15];
  const fields = new Map();

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
    UI.writeDuration(inst.prefix, Math.max(0, total));
    UI.scheduleDraft();
  }

  // An unreadable field counts from zero, like an empty one.
  function addSeconds(prefix, d) {
    const inst = fields.get(prefix);
    if (!inst) return;
    const now = UI.readDuration(prefix);
    setSeconds(inst, (typeof now === "number" ? now : 0) + d);
  }

  /* Leaving the field: what was understood is written back as m:ss (« 3 50 »
     becomes « 3:50 », « 230 » too), what was not is marked. */
  function settle(inst) {
    const s = UI.readDuration(inst.prefix);
    if (s === null) inst.input.setAttribute("aria-invalid", "true");
    else UI.writeDuration(inst.prefix, s);
  }

  function quickMarkup(inst) {
    return QUICK.map(d => '<button type="button" class="tw-q" data-tw-add="' + d + '">' +
      (d < 0 ? "−" : "+") + Math.abs(d) + " s</button>").join("") +
      (inst.chrono ? '<button type="button" class="tw-q tw-chrono" data-tw-chrono hidden></button>' : "");
  }

  /* One time field: `prefix` names it (prefix-time), `quick` receives the
     buttons, `chrono` says which stopwatch time to offer ("total", "flow", or
     none). */
  function mountTimeField(prefix, quick, chrono) {
    const input = $("#" + prefix + "-time");
    if (!input || fields.has(prefix)) return null;
    const inst = { prefix, input, quick, chrono: chrono || null };
    fields.set(prefix, inst);
    input.addEventListener("input", () => { input.removeAttribute("aria-invalid"); UI.scheduleDraft(); });
    input.addEventListener("change", () => settle(inst));
    input.addEventListener("keydown", ev => {
      if (ev.key === "Enter") {
        // Never the form's implicit submit: « done » on the phone only closes the keyboard.
        ev.preventDefault();
        settle(inst);
        input.blur();
      } else if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
        ev.preventDefault();
        addSeconds(prefix, ev.key === "ArrowUp" ? 1 : -1);
      }
    });
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
    refreshTimeFields();
    return inst;
  }

  /* The « Reprendre le chrono » buttons, shown only when the stopwatch has
     something to give, and translated. Called on each stopwatch transition. */
  function refreshTimeFields() {
    fields.forEach(inst => {
      if (!inst.quick || !inst.chrono) return;
      const b = inst.quick.querySelector("[data-tw-chrono]");
      if (!b) return;
      const label = I18N.t("wheel_chrono");
      if (b.textContent !== label) b.textContent = label;
      const hide = chronoSeconds(inst.chrono) === null;
      if (b.hidden !== hide) b.hidden = hide;
    });
  }

  Object.assign(UI, { mountTimeField, refreshTimeFields, addSeconds, timeFieldChrono: chronoSeconds });
})();
