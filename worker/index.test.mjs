import worker from "./index.js";

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

console.log(failures === 0 ? "\nTOUT PASSE" : `\n${failures} ECHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
