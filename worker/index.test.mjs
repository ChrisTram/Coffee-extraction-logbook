import worker, { EMPREINTE_SCRIPT_THEME, POLITIQUE_SECURITE } from "./index.js";

const env = {
  AUTH_USERNAME: "Chris",
  AUTH_PASSWORD: "correct-horse",
  AUTH_SECRET: "signing-key-for-tests",
  ASSETS: {
    fetch: async () => new Response("<html>LE SITE</html>", { headers: { "Content-Type": "text/html" } }),
  },
};

let failures = 0;
function check(label, condition, detail) {
  const status = condition ? "OK  " : "FAIL";
  if (!condition) failures += 1;
  console.log(`${status} ${label}${!condition && detail ? ` -> ${detail}` : ""}`);
}

const call = (path, init) => worker.fetch(new Request(`https://site.test${path}`, init), env);
const post = (path, fields, cookie) =>
  call(path, {
    method: "POST",
    body: new URLSearchParams(fields),
    headers: cookie ? { Cookie: cookie } : {},
  });

// 1. Anonyme sur la racine : redirige vers /login en gardant la destination
const anon = await call("/");
check("anonyme redirige", anon.status === 302, `status ${anon.status}`);
check("anonyme ne voit pas le site", !(await anon.text()).includes("LE SITE"));

const deep = await call("/index.html?x=1");
check(
  "destination preservee",
  deep.headers.get("Location").endsWith("/login?next=%2Findex.html%3Fx%3D1"),
  deep.headers.get("Location")
);

// 2. La page de login s'affiche et est bilingue
const page = await call("/login");
const html = await page.text();
check("login sert du HTML", page.status === 200 && html.includes("Carnet d'extraction"));
check("login bilingue", html.includes('data-en="Username"') && html.includes('data-fr="Identifiant"'));
check("login non indexable", page.headers.get("X-Robots-Tag").includes("noindex"));

// 3. Mauvais mot de passe, mauvais identifiant
const wrongPass = await post("/login", { username: "Chris", password: "nope", next: "/" });
check("mauvais mdp refuse", wrongPass.status === 401, `status ${wrongPass.status}`);
check("mauvais mdp ne pose pas de cookie", !wrongPass.headers.get("Set-Cookie"));

const wrongUser = await post("/login", { username: "Eve", password: "correct-horse", next: "/" });
check("mauvais identifiant refuse", wrongUser.status === 401, `status ${wrongUser.status}`);

// 4. Bonnes creds : cookie 30 jours, HttpOnly, Secure, SameSite
const good = await post("/login", { username: "Chris", password: "correct-horse", next: "/historique" });
const setCookie = good.headers.get("Set-Cookie") || "";
check("bonnes creds redirigent", good.status === 302, `status ${good.status}`);
check("retour a la destination", (good.headers.get("Location") || "").endsWith("/historique"));
check("cookie HttpOnly", setCookie.includes("HttpOnly"));
check("cookie Secure", setCookie.includes("Secure"));
check("cookie SameSite=Lax", setCookie.includes("SameSite=Lax"));
check("cookie 30 jours", setCookie.includes(`Max-Age=${30 * 24 * 3600}`), setCookie);

// 5. Identifiant insensible a la casse
const casing = await post("/login", { username: "  chris ", password: "correct-horse", next: "/" });
check("identifiant insensible a la casse", casing.status === 302, `status ${casing.status}`);

// 6. Avec le cookie : le site est servi
const cookie = setCookie.split(";")[0];
const inside = await call("/", { headers: { Cookie: cookie } });
const insideBody = await inside.text();
check("session valide sert le site", inside.status === 200 && insideBody.includes("LE SITE"));
check("contenu non cachable en partage", (inside.headers.get("Cache-Control") || "").includes("private"));

// 7. Cookie falsifie : signature cassee
const [name, value] = cookie.split("=");
const tampered = `${name}=${value.slice(0, -3)}AAA`;
const forged = await call("/", { headers: { Cookie: tampered } });
check("signature falsifiee rejetee", forged.status === 302, `status ${forged.status}`);

// 8. Cookie signe avec une AUTRE cle
const otherEnv = { ...env, AUTH_SECRET: "another-key" };
const otherLogin = await worker.fetch(
  new Request("https://site.test/login", { method: "POST", body: new URLSearchParams({ username: "Chris", password: "correct-horse", next: "/" }) }),
  otherEnv
);
const otherCookie = (otherLogin.headers.get("Set-Cookie") || "").split(";")[0];
const crossed = await call("/", { headers: { Cookie: otherCookie } });
check("cookie d'une autre cle rejete", crossed.status === 302, `status ${crossed.status}`);

// 9. Redirection ouverte
const openRedirect = await post("/login", { username: "Chris", password: "correct-horse", next: "//evil.example/x" });
check(
  "redirection ouverte bloquee",
  (openRedirect.headers.get("Location") || "").startsWith("https://site.test/"),
  openRedirect.headers.get("Location")
);
const schemeRedirect = await post("/login", { username: "Chris", password: "correct-horse", next: "https://evil.example/x" });
check(
  "next absolu bloque",
  (schemeRedirect.headers.get("Location") || "") === "https://site.test/",
  schemeRedirect.headers.get("Location")
);

// 10. Logout
const bye = await call("/logout", { headers: { Cookie: cookie } });
check("logout efface le cookie", (bye.headers.get("Set-Cookie") || "").includes("Max-Age=0"));

// 11. Secrets manquants : fermeture par defaut, et on dit lesquels
const naked = await worker.fetch(new Request("https://site.test/"), { ASSETS: env.ASSETS });
const nakedBody = await naked.text();
check("sans secrets, 503", naked.status === 503, `status ${naked.status}`);
check("sans secrets, rien n'est servi", !nakedBody.includes("LE SITE"));
check(
  "sans secrets, les trois noms sont listes",
  ["AUTH_USERNAME", "AUTH_PASSWORD", "AUTH_SECRET"].every((n) => nakedBody.includes(n))
);

const partial = await worker.fetch(new Request("https://site.test/"), {
  ...env,
  AUTH_SECRET: undefined,
});
const partialBody = await partial.text();
check("un seul secret manquant, 503", partial.status === 503, `status ${partial.status}`);
check("le secret manquant est nomme", partialBody.includes("Manquant ou vide : AUTH_SECRET"));
check("les secrets presents ne sont pas nommes comme manquants", !partialBody.includes("AUTH_USERNAME,"));
check("aucune valeur de secret n'est divulguee", !partialBody.includes("correct-horse"));

// Un secret vide ou reduit a des espaces compte comme absent
const blank = await worker.fetch(new Request("https://site.test/"), { ...env, AUTH_PASSWORD: "   " });
check("secret vide traite comme absent", blank.status === 503, `status ${blank.status}`);

// 12. Session expiree (on force une expiration dans le passe)
const realNow = Date.now;
Date.now = () => realNow() - 31 * 24 * 3600 * 1000;
const oldLogin = await post("/login", { username: "Chris", password: "correct-horse", next: "/" });
Date.now = realNow;
const oldCookie = (oldLogin.headers.get("Set-Cookie") || "").split(";")[0];
const expired = await call("/", { headers: { Cookie: oldCookie } });
check("session expiree rejetee", expired.status === 302, `status ${expired.status}`);

// 12 bis. Cache HTTP : un fichier de code VERSIONNE se garde un an, tout le
//     reste se revalide a chaque fois. La version dans l'URL est ce qui rend
//     la promesse tenable : un nouveau deploiement change l'URL.
{
  const versioned = await call("/js/app.js?v=7.82", { headers: { Cookie: cookie } });
  check("un script versionne est immutable", (versioned.headers.get("Cache-Control") || "").includes("immutable"));
  check("et toujours prive", (versioned.headers.get("Cache-Control") || "").includes("private"));
  const css = await call("/css/styles.css?v=7.82", { headers: { Cookie: cookie } });
  check("la feuille de style versionnee aussi", (css.headers.get("Cache-Control") || "").includes("immutable"));
  const bare = await call("/js/app.js", { headers: { Cookie: cookie } });
  check("sans version, un script se revalide", (bare.headers.get("Cache-Control") || "").includes("no-cache"));
  const page = await call("/index.html?v=7.82", { headers: { Cookie: cookie } });
  check("la page ne devient jamais immutable, meme avec ?v", (page.headers.get("Cache-Control") || "").includes("no-cache"));
  const manifest = await call("/manifest.json", { headers: { Cookie: cookie } });
  check("le manifeste non plus", (manifest.headers.get("Cache-Control") || "").includes("no-cache"));

  /* Les polices n'ont pas de ?v= et n'en auront pas : la version vit dans
     index.html et sw.js, pas dans la feuille de style. Elles sont immuables par
     contrat (on publie un nouveau nom, on ne reecrit jamais un .woff2). Sans
     cette regle, les cinq polices repartaient revalider a chaque ouverture. */
  const police = await call("/css/fonts/manrope-latin.woff2", { headers: { Cookie: cookie } });
  check("une police est immutable sans porter de version",
    (police.headers.get("Cache-Control") || "").includes("immutable"),
    police.headers.get("Cache-Control"));
  check("et elle reste privee comme le reste",
    (police.headers.get("Cache-Control") || "").includes("private"));
  /* La regle porte sur l'extension, pas sur le dossier : une police posee
     ailleurs sous /css doit se comporter pareil. */
  const ailleurs = await call("/css/autre.woff2", { headers: { Cookie: cookie } });
  check("la regle suit l'extension et non le dossier",
    (ailleurs.headers.get("Cache-Control") || "").includes("immutable"),
    ailleurs.headers.get("Cache-Control"));
}

// 13. Le cache local de wrangler ne part ni dans le depot ni dans les assets.
//     Il contient l'identifiant et le nom du compte Cloudflare, et il a ete
//     versionne puis servi pendant trois semaines avant qu'un audit le voie.
{
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const gitignore = readFileSync(join(root, ".gitignore"), "utf8");
  const assetsignore = readFileSync(join(root, ".assetsignore"), "utf8");
  check("le cache wrangler est ignore par git", /^\.wrangler\/?$/m.test(gitignore));
  check("le cache wrangler n'est pas televerse comme asset", /^\.wrangler\/?$/m.test(assetsignore));
}

// v8.73 : politique de securite, en-tetes, limite d'essais de connexion.
{
  const { readFileSync } = await import("node:fs");
  const { createHash } = await import("node:crypto");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const index = readFileSync(join(root, "index.html"), "utf8");
  const debut = index.indexOf("<script>") + 8, finScript = index.indexOf("</script>", debut);
  const empreinte = "sha256-" + createHash("sha256").update(index.slice(debut, finScript), "utf8").digest("base64");
  check("l'empreinte du script du theme correspond a index.html (sinon il serait bloque)",
    empreinte === EMPREINTE_SCRIPT_THEME, empreinte + " contre " + EMPREINTE_SCRIPT_THEME);
  check("un seul script en ligne dans index.html", (index.match(/<script>/g) || []).length === 1);
  check("aucun script en ligne n'est autorise en dehors de celui-la", !POLITIQUE_SECURITE.includes("'unsafe-inline'; ") || !/script-src[^;]*unsafe-inline/.test(POLITIQUE_SECURITE));
  check("le lecteur des videos est autorise", /frame-src https:\/\/www\.youtube-nocookie\.com/.test(POLITIQUE_SECURITE));
  check("personne ne peut encadrer le carnet", POLITIQUE_SECURITE.includes("frame-ancestors 'none'"));

  const bon = await post("/login", { username: "Chris", password: "correct-horse", next: "/" });
  const cookie = (bon.headers.get("Set-Cookie") || "").split(";")[0];
  const pageSite = await call("/", { headers: { Cookie: cookie } });
  check("la page du site porte la politique de securite", (pageSite.headers.get("Content-Security-Policy") || "") === POLITIQUE_SECURITE);
  check("et nosniff", pageSite.headers.get("X-Content-Type-Options") === "nosniff");

  let essais = 0;
  const envLimite = { ...env, LOGIN_LIMITER: { limit: async () => ({ success: ++essais <= 2 }) } };
  const essai = () => worker.fetch(new Request("https://site.test/login", { method: "POST", body: new URLSearchParams({ username: "Chris", password: "faux" }) }), envLimite);
  await essai(); await essai();
  const bloque = await essai();
  check("au-dela de la limite, la connexion repond 429", bloque.status === 429, String(bloque.status));
  check("avec un message lisible", (await bloque.text()).includes("Trop d'essais"));
}

console.log(failures === 0 ? "\nTOUT PASSE" : `\n${failures} ECHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
