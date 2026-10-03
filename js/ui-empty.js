/* EMPTY SCREENS THAT SAY WHAT TO DO (v9.13, M6).
 *
 * A card with nothing in it read like a broken page, and « Aucune donnée »
 * helps nobody. An empty place now has a small drawing, ONE sentence that
 * says why it is empty, and the button that leads to where it gets filled:
 * the entry for a chart waiting for cups, the Guide for a duel that needs
 * the other brewer, the coffee form for an empty « Mes cafés ».
 *
 * The drawings are line art in the site's tokens, like the icons: they follow
 * the three palettes without a colour of their own. */
"use strict";

(() => {

  const { activateScreen } = UI;
  const escapeHtml = TOOLS.escapeHtml;

  // Four small drawings, 150 by 110.
  const DRAWINGS = {
    // A cup and its steam: nothing brewed yet.
    cup: '<path class="eh-fill" d="M32 44 L104 44 L98 90 Q96 98 88 98 L48 98 Q40 98 38 90 Z"></path>' +
      '<path class="eh-line" d="M104 54 Q122 56 120 68 Q118 80 100 80"></path>' +
      '<ellipse class="eh-accent-soft" cx="68" cy="47" rx="34" ry="4.5"></ellipse>' +
      '<path class="eh-accent" d="M54 34 Q49 24 57 16 M70 34 Q65 22 74 12 M86 34 Q81 24 89 16"></path>' +
      '<path class="eh-line" d="M24 104 H112"></path>',
    // An empty jar, two beans left at the bottom: no coffee on the shelf.
    jar: '<rect class="eh-fill" x="52" y="10" width="46" height="14" rx="4"></rect>' +
      '<path class="eh-line" d="M56 24 L94 24 Q104 24 104 34 L104 92 Q104 102 94 102 L56 102 Q46 102 46 92 L46 34 Q46 24 56 24 Z"></path>' +
      '<ellipse class="eh-bean" cx="66" cy="95" rx="5" ry="3.5"></ellipse>' +
      '<ellipse class="eh-bean" cx="82" cy="96" rx="5" ry="3.5" transform="rotate(20 82 96)"></ellipse>' +
      '<path class="eh-accent" d="M112 40 v14 M105 47 h14"></path>',
    // Axes and a dotted line that waits for its points: a chart to fill.
    chart: '<path class="eh-line" d="M28 14 V96 H130"></path>' +
      '<path class="eh-dash" d="M34 82 Q60 74 74 60 T124 30"></path>' +
      '<circle class="eh-accent-dot" cx="52" cy="76" r="4"></circle>' +
      '<circle class="eh-fill" cx="88" cy="52" r="4"></circle>' +
      '<circle class="eh-fill" cx="116" cy="34" r="4"></circle>',
    // The two brewers side by side: a duel waiting for its second.
    duel: '<path class="eh-fill" d="M28 40 L58 40 L54 98 L32 98 Z"></path>' +
      '<path class="eh-line" d="M36 40 L40 24 L46 24 L50 40"></path>' +
      '<path class="eh-line" d="M86 34 L124 34 L112 66 L98 66 Z"></path>' +
      '<path class="eh-dash" d="M98 66 V98 H112 V66"></path>' +
      '<path class="eh-accent" d="M70 52 l6 6 -6 6"></path>',
  };

  /* The empty state, as HTML. `go` names where the button leads: a screen
     (entry, guide, history), or an action of the page that drew it
     (coffee-new, coffees, sheet-brew, settings-jar), wired by that page. */
  function emptyHint(o) {
    const art = DRAWINGS[o.drawing] || DRAWINGS.cup;
    return '<div class="empty-hint' + (o.wide ? " empty-hint-wide" : "") + '">' +
      '<svg class="eh-art" viewBox="0 0 150 110" aria-hidden="true" focusable="false">' + art + "</svg>" +
      '<div class="eh-text">' +
        (o.title ? '<p class="eh-title">' + escapeHtml(o.title) + "</p>" : "") +
        '<p class="eh-say">' + escapeHtml(o.text || "") + "</p>" +
        (o.action ? '<button type="button" class="btn btn-small' + (o.primary === false ? "" : " btn-primary") +
          '" data-empty-go="' + escapeHtml(o.go || "entry") + '">' + escapeHtml(o.action) + "</button>" : "") +
      "</div></div>";
  }

  /* The screens a button can lead to from anywhere. The other names are the
     drawing page's business (the coffee sheet wires its own). */
  const SCREENS = ["dashboard", "entry", "history", "tuning", "guide", "settings"];
  function wireEmpty() {
    document.addEventListener("click", ev => {
      const b = ev.target.closest && ev.target.closest("[data-empty-go]");
      if (!b) return;
      const go = b.dataset.emptyGo;
      if (SCREENS.includes(go)) {
        const open = b.closest("dialog[open]");
        if (open) open.close();
        activateScreen(go);
      } else if (go === "coffee-new") {
        UI.openCoffeeForm(null);
      } else if (go === "coffees") {
        UI.openCoffeesModal();
      }
    });
  }

  Object.assign(UI, { emptyHint, wireEmpty });
})();
