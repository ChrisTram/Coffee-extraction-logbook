/* R13 (v9.22): DICTATING THE COMMENT.
 *
 * The comment could be dictated since v8.43, all at once at the end of the
 * sentence. Now the words write themselves one after the other while Chris
 * speaks: the browser's interim results land in the field as they come,
 * paced one word at a time, then settle as the final text. Tap the
 * microphone again, or simply pause, and it stops.
 *
 * WHERE. Only where the browser knows speech recognition (SpeechRecognition,
 * prefixed webkit on Chrome and Safari; Firefox has none), and only online:
 * Chrome and Safari send the voice to their own service, which the button's
 * bubble says on hover and on a long press. The site plays nothing; the
 * system may beep when the microphone opens, that is not ours.
 *
 * THE TEXT. What was typed is never wiped nor rewritten: the dictation is
 * ADDED after it, with one space, and a sentence that starts (empty field,
 * after a full stop, a question or a new line) takes a capital
 * (mergeDictation, pure, tests in tools/gestures.test.mjs). A key typed while
 * it listens stops it, and keeps everything. Every write fires an input
 * event, so the draft (js/ui-draft.js) and the draft mark of the navigation
 * follow it like typed text.
 *
 * THE STATES. Listening: the button is pressed, a ring pulses around it and a
 * short live line says « J'écoute… ». A refused microphone, silence or a lost
 * connection: one calm sentence in that line, no window. Reduced motion: no
 * pulse and no pacing, the words land as they come. */
"use strict";

(() => {

  // Borrowed from the core, loaded before us.
  const { enableLongPress } = UI;

  // One word every 55 ms: fast enough to keep up with speech, slow enough to be seen landing.
  const REVEAL_MS = 55;
  // How long a calm message stays under the field.
  const NOTE_MS = 4200;
  // The recognition's errors that deserve a sentence; "aborted" is ours and says nothing.
  const ERROR_KEYS = {
    "not-allowed": "dictate_refused",
    "service-not-allowed": "dictate_refused",
    network: "dictate_network",
    "no-speech": "dictate_silence",
    "audio-capture": "dictate_no_mic",
  };

  /* ---------- The text, pure ---------- */

  // An empty field, a full stop, a question, an exclamation or a new line: what follows starts a sentence.
  const SENTENCE_START = /(^|[.!?…]|\n)\s*$/;

  const capitalize = s => s.replace(/\p{L}/u, c => c.toLocaleUpperCase());

  /* The dictated words after what is already there. The existing text is
     kept to the character; one space joins them unless the field already
     ends with a space or a line, or the words open with a comma or a stop.
     A sentence start takes a capital, inside the dictation too. */
  function mergeDictation(base, spoken) {
    const before = String(base == null ? "" : base);
    let words = String(spoken == null ? "" : spoken).replace(/\s+/g, " ").trim();
    if (!words) return before;
    words = words.replace(/ ([,.…)])/g, "$1")
      .replace(/([.!?…] )(\p{Ll})/gu, (m, stop, c) => stop + c.toLocaleUpperCase());
    if (SENTENCE_START.test(before)) words = capitalize(words);
    const glue = before === "" || /\s$/.test(before) || /^[,.…)]/.test(words) ? "" : " ";
    return before + glue + words;
  }

  /* One step from what the field shows toward what the recognition heard:
     one more word. If the recognition changed its mind, back to the last
     word both agree on, but never into the first `keep` characters (what was
     typed before the dictation). */
  function revealStep(shown, target, keep) {
    const from = String(shown), to = String(target);
    const floor = Math.min(Math.max(0, keep || 0), to.length);
    if (from === to) return to;
    if (to.startsWith(from)) {
      const next = /^\s*\S+/.exec(to.slice(from.length));
      return next ? from + next[0] : to;
    }
    // A word dropped at the end: no need to go back further than that.
    if (from.startsWith(to)) return to;
    let i = 0;
    while (i < from.length && i < to.length && from[i] === to[i]) i++;
    while (i > floor && !/\s/.test(to[i - 1])) i--;
    return to.slice(0, Math.max(i, floor));
  }

  /* ---------- The button ---------- */

  const reducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const recognitionClass = () => typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

  /* button: the microphone; field: the textarea; label: the button's word;
     live: the line under the field. The button stays hidden where the
     browser cannot recognise speech, and offline. */

  function wireDictation(button, field, label, live) {
    if (!button || !field || !recognitionClass()) return;
    const visible = () => { button.hidden = typeof navigator !== "undefined" && navigator.onLine === false; };
    visible();
    window.addEventListener("online", visible);
    window.addEventListener("offline", visible);
    let session = null, noteTimer = 0;

    // The bubble and its long press: the voice goes through the browser's service.
    const words = () => {
      button.dataset.info = I18N.t("dictate_info");
      if (label) label.textContent = I18N.t(session ? "dictate_stop" : "dictate");
      const line = live && session && !live.classList.contains("note") ? live.querySelector(".dl-text") : null;
      if (line) line.textContent = I18N.t("dictate_listening");
    };
    if (button.parentElement && enableLongPress) enableLongPress(button.parentElement);

    function showLine(text, isNote) {
      if (!live) return;
      clearTimeout(noteTimer);
      live.innerHTML = (isNote ? "" : '<span class="dl-dot" aria-hidden="true"></span>') + '<span class="dl-text"></span>';
      live.querySelector(".dl-text").textContent = text;
      live.classList.toggle("note", Boolean(isNote));
      live.hidden = false;
      if (isNote) noteTimer = setTimeout(hideLine, NOTE_MS);
    }
    function hideLine() {
      clearTimeout(noteTimer);
      if (live) { live.hidden = true; live.textContent = ""; live.classList.remove("note"); }
    }

    function setListening(on) {
      button.setAttribute("aria-pressed", String(on));
      button.classList.toggle("listening", on);
      words();
      if (on) showLine(I18N.t("dictate_listening"), false);
    }

    /* Writes into the field like a keystroke would: the draft listens to
       input. If the field moved under us (a key, a reset after saving), the
       session stops and leaves it alone. */
    function write(s, text) {
      if (field.value !== s.written) { s.rec.abort(); return false; }
      if (text === field.value) return true;
      field.value = text;
      s.written = text;
      field.scrollTop = field.scrollHeight;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }

    function pace(s) {
      if (s.timer || session !== s) return;
      const step = () => {
        s.timer = 0;
        if (session !== s) return;
        const next = s.calm ? s.target : revealStep(s.written, s.target, s.base.length);
        if (!write(s, next)) return;
        if (next !== s.target) s.timer = setTimeout(step, REVEAL_MS);
      };
      step();
    }

    function startSession() {
      // Looked up at each start, not frozen at wiring: a polyfill or a test stub is taken as it is now.
      let rec;
      try {
        const Recognition = recognitionClass();
        rec = new Recognition();
      } catch (e) {
        showLine(I18N.t("dictate_failed"), true);
        return;
      }
      rec.lang = I18N.locale();
      rec.interimResults = true;
      // One utterance: a pause ends it (Chrome on Android repeats itself in continuous mode).
      rec.continuous = false;
      rec.maxAlternatives = 1;
      const s = { rec, base: field.value, written: field.value, target: field.value, timer: 0, error: "", calm: reducedMotion() };
      rec.onresult = ev => {
        if (session !== s) return;
        let heard = "";
        for (let i = 0; i < ev.results.length; i++) heard += " " + (ev.results[i][0] ? ev.results[i][0].transcript : "");
        s.target = mergeDictation(s.base, heard);
        pace(s);
      };
      rec.onerror = ev => { s.error = ev.error || "failed"; };
      rec.onend = () => {
        if (session !== s) return;
        clearTimeout(s.timer);
        s.timer = 0;
        // What was heard settles at once: no word is left waiting for its turn.
        if (s.target !== s.written && field.value === s.written) write(s, s.target);
        session = null;
        setListening(false);
        const key = ERROR_KEYS[s.error] || (s.error && s.error !== "aborted" ? "dictate_failed" : "");
        if (key) showLine(I18N.t(key), true);
        else hideLine();
      };
      session = s;
      try {
        rec.start();
        setListening(true);
      } catch (e) {
        session = null;
        setListening(false);
        showLine(I18N.t("dictate_failed"), true);
      }
    }

    button.addEventListener("click", () => {
      if (session) { session.rec.stop(); return; }
      startSession();
    });
    // A key typed while it listens: the hand takes over, the dictation stops.
    field.addEventListener("input", ev => { if (session && ev.isTrusted) session.rec.abort(); });
    I18N.subscribe(words);
    words();
  }

  // Made available to the other screens, and to the tests (the pure part).
  Object.assign(UI, { wireDictation, mergeDictation, revealStep });
})();
