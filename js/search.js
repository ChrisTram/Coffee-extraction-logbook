/* SEARCH (v9.13): the ranking behind « Chercher et agir » (Ctrl K, P1 and M5).
 *
 * One field searches the coffees, the cups (their comment, their tastes,
 * their recipe), the recipes, the Guide and the actions. This file only
 * decides what matches and in which order: it knows neither the DOM nor DATA,
 * the palette (js/ui-palette.js) hands it plain items. That is what lets
 * tools/data.test.mjs check the ranking without a browser.
 *
 * THE RULES, in the order they weigh:
 *   1. Every word typed must be found somewhere in the item (AND): « bana
 *      brikka » narrows, it does not widen.
 *   2. Accents and case do not count: « brule » finds « brûlé », « da lat »
 *      finds « Đà Lạt ». A French logbook typed on a keyboard needs it.
 *   3. A word found at the START of a word beats a word found inside one, and
 *      the item's name beats its detail, which beats its keywords.
 *   4. Groups come in the order of their best item; on a tie, the fixed order
 *      of GROUPS (the actions first: « bana » then Enter brews the Bana). */
"use strict";

const SEARCH = (() => {

  // The groups, in their order of preference when two score the same.
  const GROUPS = ["actions", "coffees", "cups", "recipes", "tastes", "guide", "screens"];
  // How many items a group shows at most: a palette is read at a glance.
  const LIMITS = { actions: 3, coffees: 4, cups: 5, recipes: 4, tastes: 3, guide: 4, screens: 3 };

  /* Lower case, no accents, single spaces. đ has no decomposition in Unicode
     (it is a letter of its own), so it is mapped by hand, like the two French
     ligatures. */
  function fold(s) {
    return String(s === null || s === undefined ? "" : s)
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[đĐ]/g, "d").replace(/œ/g, "oe").replace(/Œ/g, "oe").replace(/æ/g, "ae").replace(/Æ/g, "ae")
      .toLowerCase().replace(/\s+/g, " ").trim();
  }

  function words(query) {
    return fold(query).split(" ").filter(Boolean);
  }

  /* 2 when the word starts a word of the text, 1 when it sits inside one,
     0 when it is absent. A word start is the beginning of the text or any
     character that is not a letter or a digit before it. */
  function where(word, text) {
    let i = text.indexOf(word);
    if (i < 0) return 0;
    while (i >= 0) {
      if (i === 0 || !/[a-z0-9]/.test(text[i - 1])) return 2;
      i = text.indexOf(word, i + 1);
    }
    return 1;
  }

  // Points for a word found [inside, at a word start], per field.
  const WEIGHTS = { name: [6, 10], detail: [3, 4], keywords: [1, 2] };

  /* The score of an item: 0 when one word is missing. `item.name` is the
     field that names it (it may differ from what is displayed: the action
     « Brasser Bana Cofe G4 » is named by its coffee), `item.detail` and
     `item.keywords` are read with less weight. Strings already folded or not,
     it does not matter. */
  function score(query, item) {
    const list = words(query);
    if (!list.length || !item) return 0;
    const name = fold(item.name), detail = fold(item.detail), keywords = fold(item.keywords);
    let total = 0;
    for (const w of list) {
      const best = Math.max(
        pointsFor(where(w, name), WEIGHTS.name),
        pointsFor(where(w, detail), WEIGHTS.detail),
        pointsFor(where(w, keywords), WEIGHTS.keywords));
      if (!best) return 0;
      total += best;
    }
    // The whole query as the start of the name, then as the whole name.
    const q = list.join(" ");
    if (name.startsWith(q)) total += 8;
    if (name === q) total += 12;
    return total;
  }
  const pointsFor = (found, weights) => (found ? weights[found - 1] : 0);

  /* The ranked list, grouped. Within a group: score, then `order` (smaller
     first: the caller gives recency or its own preference), then the order
     received. Groups follow their best score, ties by GROUPS. Each item comes
     back with its `score`. */
  function rank(items, query, limits) {
    const caps = Object.assign({}, LIMITS, limits || {});
    const byGroup = new Map();
    (items || []).forEach((item, index) => {
      const s = score(query, item);
      if (!s) return;
      const g = item.group;
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push({ ...item, score: s, _index: index });
    });
    const groupRank = g => (GROUPS.indexOf(g) < 0 ? GROUPS.length : GROUPS.indexOf(g));
    const groups = [...byGroup.entries()].map(([g, list]) => {
      list.sort((a, b) => b.score - a.score || (a.order || 0) - (b.order || 0) || a._index - b._index);
      return { g, list: list.slice(0, caps[g] === undefined ? 5 : caps[g]) };
    });
    groups.sort((a, b) => b.list[0].score - a.list[0].score || groupRank(a.g) - groupRank(b.g));
    return groups.flatMap(x => x.list.map(({ _index, ...item }) => item));
  }

  return { GROUPS, LIMITS, fold, words, where, score, rank };
})();
