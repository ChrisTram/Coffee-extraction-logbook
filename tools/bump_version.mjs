/* Pose une nouvelle version du site, partout où elle est écrite.
 *
 *   node tools/bump_version.mjs 7.83
 *
 * La version vit à TROIS endroits, et ils doivent dire la même chose :
 *
 *   index.html   <meta name="app-version" content="X">, lue par app.js pour le
 *                pied de page et par outils.js pour les fichiers chargés à la
 *                demande ; et le paramètre ?v=X de chaque balise script et de la
 *                feuille de style, qui est ce qui permet au navigateur de garder
 *                ces fichiers en cache un an sans jamais servir une version
 *                périmée : l'URL change, donc le cache change.
 *   sw.js        const VERSION = "X", pour précacher les mêmes URL et jeter les
 *                anciennes à l'activation.
 *
 * Un test (tools/data.test.mjs) refuse toute divergence entre les trois. Ce
 * script existe pour qu'une montée de version soit une commande et pas seize
 * retouches à la main, dont une oubliée laisserait un téléphone sur l'ancien
 * code avec le nouveau HTML. */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = String(process.argv[2] || "").trim();

if (!/^\d+\.\d+(\.\d+)?$/.test(version)) {
  console.error("Usage : node tools/bump_version.mjs 7.83");
  process.exit(1);
}

function reecrire(fichier, transformer) {
  const chemin = join(ROOT, fichier);
  const avant = readFileSync(chemin, "utf8");
  const apres = transformer(avant);
  if (apres === avant) { console.log("  " + fichier + " : inchangé"); return; }
  writeFileSync(chemin, apres);
  console.log("  " + fichier + " : mis à jour");
}

console.log("Version " + version);

reecrire("index.html", html => html
  .replace(/<meta name="app-version" content="[^"]*">/, `<meta name="app-version" content="${version}">`)
  // Les balises de la page : css/… et js/… avec ou sans ?v= existant.
  .replace(/(href|src)="((?:css|js)\/[^"?]+)(?:\?v=[^"]*)?"/g, `$1="$2?v=${version}"`));

reecrire("sw.js", sw => sw.replace(/const VERSION = "[^"]*";/, `const VERSION = "${version}";`));

console.log("Pense au changelog, puis : node tools/data.test.mjs");
