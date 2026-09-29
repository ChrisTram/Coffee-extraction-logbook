/* Sets a new site version, everywhere it is written.
 *
 *   node tools/bump_version.mjs 7.83
 *
 * The version lives in THREE places, and they must say the same thing:
 *
 *   index.html   <meta name="app-version" content="X">, read by app.js for the
 *                footer and by outils.js for the files loaded on demand; and
 *                the ?v=X parameter of every script tag and of the
 *                stylesheet, which is what lets the browser keep these files
 *                cached for a year without ever serving a stale version: the
 *                URL changes, so the cache changes.
 *   sw.js        const VERSION = "X", to precache the same URLs and drop the
 *                old ones on activation.
 *
 * A test (tools/data.test.mjs) rejects any mismatch between the three. This
 * script exists so that a version bump is one command and not sixteen hand
 * edits, one of which, forgotten, would leave a phone on the old code with
 * the new HTML. */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = String(process.argv[2] || "").trim();

if (!/^\d+\.\d+(\.\d+)?$/.test(version)) {
  console.error("Usage : node tools/bump_version.mjs 7.83");
  process.exit(1);
}

function rewrite(file, transform) {
  const path = join(ROOT, file);
  const before = readFileSync(path, "utf8");
  const after = transform(before);
  if (after === before) { console.log("  " + file + " : inchangé"); return; }
  writeFileSync(path, after);
  console.log("  " + file + " : mis à jour");
}

console.log("Version " + version);

rewrite("index.html", html => html
  .replace(/<meta name="app-version" content="[^"]*">/, `<meta name="app-version" content="${version}">`)
  // The page's tags: css/… and js/… with or without an existing ?v=. Only .js and .css
  // (v8.75): a preloaded font must keep the stylesheet's exact URL.
  .replace(/(href|src)="((?:css|js)\/[^"?]+\.(?:js|css))(?:\?v=[^"]*)?"/g, `$1="$2?v=${version}"`));

rewrite("sw.js", sw => sw.replace(/const VERSION = "[^"]*";/, `const VERSION = "${version}";`));

console.log("Pense au changelog, puis : node tools/data.test.mjs");
