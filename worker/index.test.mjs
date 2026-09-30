import worker, { THEME_SCRIPT_HASH, SECURITY_POLICY, minifyCss, minifyHtml } from "./index.js";

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

// 1. Anonymous on the root: redirects to /login, keeping the destination
const anon = await call("/");
check("anonymous is redirected", anon.status === 302, `status ${anon.status}`);
check("anonymous does not see the site", !(await anon.text()).includes("LE SITE"));

const deep = await call("/index.html?x=1");
check(
  "destination preserved",
  deep.headers.get("Location").endsWith("/login?next=%2Findex.html%3Fx%3D1"),
  deep.headers.get("Location")
);

// 2. The login page renders and is bilingual
const page = await call("/login");
const html = await page.text();
check("login serves HTML", page.status === 200 && html.includes("Carnet d'extraction"));
check("login is bilingual", html.includes('data-en="Username"') && html.includes('data-fr="Identifiant"'));
check("login is not indexable", page.headers.get("X-Robots-Tag").includes("noindex"));

// 3. Wrong password, wrong username
const wrongPass = await post("/login", { username: "Chris", password: "nope", next: "/" });
check("wrong password refused", wrongPass.status === 401, `status ${wrongPass.status}`);
check("wrong password sets no cookie", !wrongPass.headers.get("Set-Cookie"));

const wrongUser = await post("/login", { username: "Eve", password: "correct-horse", next: "/" });
check("wrong username refused", wrongUser.status === 401, `status ${wrongUser.status}`);

// 4. Good creds: 30-day cookie, HttpOnly, Secure, SameSite
const good = await post("/login", { username: "Chris", password: "correct-horse", next: "/historique" });
const setCookie = good.headers.get("Set-Cookie") || "";
check("good creds redirect", good.status === 302, `status ${good.status}`);
check("back to the destination", (good.headers.get("Location") || "").endsWith("/historique"));
check("cookie HttpOnly", setCookie.includes("HttpOnly"));
check("cookie Secure", setCookie.includes("Secure"));
check("cookie SameSite=Lax", setCookie.includes("SameSite=Lax"));
check("cookie 30 days", setCookie.includes(`Max-Age=${30 * 24 * 3600}`), setCookie);

// 5. Case-insensitive username
const casing = await post("/login", { username: "  chris ", password: "correct-horse", next: "/" });
check("username is case-insensitive", casing.status === 302, `status ${casing.status}`);

// 6. With the cookie: the site is served
const cookie = setCookie.split(";")[0];
const inside = await call("/", { headers: { Cookie: cookie } });
const insideBody = await inside.text();
check("valid session serves the site", inside.status === 200 && insideBody.includes("LE SITE"));
check("content not cacheable in shared caches", (inside.headers.get("Cache-Control") || "").includes("private"));

// 7. Tampered cookie: broken signature
const [name, value] = cookie.split("=");
const tampered = `${name}=${value.slice(0, -3)}AAA`;
const forged = await call("/", { headers: { Cookie: tampered } });
check("tampered signature rejected", forged.status === 302, `status ${forged.status}`);

// 8. Cookie signed with ANOTHER key
const otherEnv = { ...env, AUTH_SECRET: "another-key" };
const otherLogin = await worker.fetch(
  new Request("https://site.test/login", { method: "POST", body: new URLSearchParams({ username: "Chris", password: "correct-horse", next: "/" }) }),
  otherEnv
);
const otherCookie = (otherLogin.headers.get("Set-Cookie") || "").split(";")[0];
const crossed = await call("/", { headers: { Cookie: otherCookie } });
check("cookie from another key rejected", crossed.status === 302, `status ${crossed.status}`);

// 9. Open redirect
const openRedirect = await post("/login", { username: "Chris", password: "correct-horse", next: "//evil.example/x" });
check(
  "open redirect blocked",
  (openRedirect.headers.get("Location") || "").startsWith("https://site.test/"),
  openRedirect.headers.get("Location")
);
const schemeRedirect = await post("/login", { username: "Chris", password: "correct-horse", next: "https://evil.example/x" });
check(
  "absolute next blocked",
  (schemeRedirect.headers.get("Location") || "") === "https://site.test/",
  schemeRedirect.headers.get("Location")
);

// 10. Logout
const bye = await call("/logout", { headers: { Cookie: cookie } });
check("logout clears the cookie", (bye.headers.get("Set-Cookie") || "").includes("Max-Age=0"));

// 11. Missing secrets: fail closed, and say which ones
const naked = await worker.fetch(new Request("https://site.test/"), { ASSETS: env.ASSETS });
const nakedBody = await naked.text();
check("without secrets, 503", naked.status === 503, `status ${naked.status}`);
check("without secrets, nothing is served", !nakedBody.includes("LE SITE"));
check(
  "without secrets, all three names are listed",
  ["AUTH_USERNAME", "AUTH_PASSWORD", "AUTH_SECRET"].every((n) => nakedBody.includes(n))
);

const partial = await worker.fetch(new Request("https://site.test/"), {
  ...env,
  AUTH_SECRET: undefined,
});
const partialBody = await partial.text();
check("a single missing secret, 503", partial.status === 503, `status ${partial.status}`);
check("the missing secret is named", partialBody.includes("Manquant ou vide : AUTH_SECRET"));
check("present secrets are not named as missing", !partialBody.includes("AUTH_USERNAME,"));
check("no secret value is leaked", !partialBody.includes("correct-horse"));

// A secret that is empty or only whitespace counts as missing
const blank = await worker.fetch(new Request("https://site.test/"), { ...env, AUTH_PASSWORD: "   " });
check("empty secret treated as missing", blank.status === 503, `status ${blank.status}`);

// 12. Expired session (we force an expiry in the past)
const realNow = Date.now;
Date.now = () => realNow() - 31 * 24 * 3600 * 1000;
const oldLogin = await post("/login", { username: "Chris", password: "correct-horse", next: "/" });
Date.now = realNow;
const oldCookie = (oldLogin.headers.get("Set-Cookie") || "").split(";")[0];
const expired = await call("/", { headers: { Cookie: oldCookie } });
check("expired session rejected", expired.status === 302, `status ${expired.status}`);

// 12 bis. HTTP cache: a VERSIONED code file is kept for a year, everything
//     else revalidates every time. The version in the URL is what makes the
//     promise hold: a new deploy changes the URL.
{
  const versioned = await call("/js/app.js?v=7.82", { headers: { Cookie: cookie } });
  check("a versioned script is immutable", (versioned.headers.get("Cache-Control") || "").includes("immutable"));
  check("and still private", (versioned.headers.get("Cache-Control") || "").includes("private"));
  const css = await call("/css/base.css?v=7.82", { headers: { Cookie: cookie } });
  check("the versioned stylesheet too", (css.headers.get("Cache-Control") || "").includes("immutable"));
  const bare = await call("/js/app.js", { headers: { Cookie: cookie } });
  check("without a version, a script revalidates", (bare.headers.get("Cache-Control") || "").includes("no-cache"));
  const page = await call("/index.html?v=7.82", { headers: { Cookie: cookie } });
  check("the page never becomes immutable, even with ?v", (page.headers.get("Cache-Control") || "").includes("no-cache"));
  const manifest = await call("/manifest.json", { headers: { Cookie: cookie } });
  check("nor does the manifest", (manifest.headers.get("Cache-Control") || "").includes("no-cache"));

  /* Fonts have no ?v= and never will: the version lives in index.html and
     sw.js, not in the stylesheet. They are immutable by contract (we publish
     a new name, we never rewrite a .woff2). Without this rule, the five fonts
     went back to revalidate on every open. */
  const font = await call("/css/fonts/manrope-latin.woff2", { headers: { Cookie: cookie } });
  check("a font is immutable without carrying a version",
    (font.headers.get("Cache-Control") || "").includes("immutable"),
    font.headers.get("Cache-Control"));
  check("and it stays private like the rest",
    (font.headers.get("Cache-Control") || "").includes("private"));
  /* The rule is about the extension, not the folder: a font placed elsewhere
     under /css must behave the same. */
  const elsewhere = await call("/css/autre.woff2", { headers: { Cookie: cookie } });
  check("the rule follows the extension, not the folder",
    (elsewhere.headers.get("Cache-Control") || "").includes("immutable"),
    elsewhere.headers.get("Cache-Control"));
}

// 13. The local wrangler cache goes neither into the repo nor into the assets.
//     It holds the Cloudflare account id and name, and it was committed and
//     then served for three weeks before an audit caught it.
{
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const gitignore = readFileSync(join(root, ".gitignore"), "utf8");
  const assetsignore = readFileSync(join(root, ".assetsignore"), "utf8");
  check("the wrangler cache is ignored by git", /^\.wrangler\/?$/m.test(gitignore));
  check("the wrangler cache is not uploaded as an asset", /^\.wrangler\/?$/m.test(assetsignore));
}

// v8.73: security policy, headers, login attempt limit.
{
  const { readFileSync } = await import("node:fs");
  const { createHash } = await import("node:crypto");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const index = readFileSync(join(root, "index.html"), "utf8");
  const start = index.indexOf("<script>") + 8, scriptEnd = index.indexOf("</script>", start);
  const hash = "sha256-" + createHash("sha256").update(index.slice(start, scriptEnd), "utf8").digest("base64");
  check("the theme script hash matches index.html (otherwise it would be blocked)",
    hash === THEME_SCRIPT_HASH, hash + " vs " + THEME_SCRIPT_HASH);
  check("a single inline script in index.html", (index.match(/<script>/g) || []).length === 1);
  check("no inline script is allowed other than that one", !SECURITY_POLICY.includes("'unsafe-inline'; ") || !/script-src[^;]*unsafe-inline/.test(SECURITY_POLICY));
  check("the video player is allowed", /frame-src https:\/\/www\.youtube-nocookie\.com/.test(SECURITY_POLICY));
  check("nobody can frame the notebook", SECURITY_POLICY.includes("frame-ancestors 'none'"));

  const goodLogin = await post("/login", { username: "Chris", password: "correct-horse", next: "/" });
  const cookie = (goodLogin.headers.get("Set-Cookie") || "").split(";")[0];
  const sitePage = await call("/", { headers: { Cookie: cookie } });
  check("the site page carries the security policy", (sitePage.headers.get("Content-Security-Policy") || "") === SECURITY_POLICY);
  check("and nosniff", sitePage.headers.get("X-Content-Type-Options") === "nosniff");

  let attempts = 0;
  const limitedEnv = { ...env, LOGIN_LIMITER: { limit: async () => ({ success: ++attempts <= 2 }) } };
  const attempt = () => worker.fetch(new Request("https://site.test/login", { method: "POST", body: new URLSearchParams({ username: "Chris", password: "faux" }) }), limitedEnv);
  await attempt(); await attempt();
  const blocked = await attempt();
  check("past the limit, login answers 429", blocked.status === 429, String(blocked.status));
  check("with a readable message", (await blocked.text()).includes("Trop d'essais"));
}

// v8.75: stylesheet and page served without comments, content intact.
{
  const css = "/* un commentaire\n sur deux lignes */\n.a { color: red; }\n\n  .b { content: \"x\"; }\n";
  check("the stylesheet loses its comments and blank lines", minifyCss(css) === '.a { color: red; }\n.b { content: "x"; }');
  const html = "<p>a</p><!-- note -->\n<pre>ligne 1\n  ligne 2</pre>";
  check("the page loses its comments without touching <pre> whitespace", minifyHtml(html) === "<p>a</p>\n<pre>ligne 1\n  ligne 2</pre>");
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const realCss = ["base", "screens", "dialogs", "finishing"].map(f => readFileSync(join(root, "css/" + f + ".css"), "utf8")).join("\n");
  const slimmed = minifyCss(realCss);
  check("the real stylesheet keeps all its braces", (slimmed.match(/\{/g) || []).length === (realCss.replace(/\/\*[\s\S]*?\*\//g, "").match(/\{/g) || []).length);
  check("and shrinks by at least a quarter", slimmed.length < realCss.length * 0.75, slimmed.length + " / " + realCss.length);
  const index = readFileSync(join(root, "index.html"), "utf8");
  const start = index.indexOf("<script>"), end = index.indexOf("</script>", start);
  check("the theme script stays identical (its hash does not change)", minifyHtml(index).includes(index.slice(start, end)));
}

// v9.06: the login page reads the language under its English key, and still under the French one.
{
  const res = await worker.fetch(new Request("https://site.test/login"), env);
  const html = await res.text();
  check("the login page reads the language key lang, and langue from before v9.06",
    html.includes('localStorage.getItem("lang") || localStorage.getItem("langue")') && html.includes('localStorage.setItem("lang", lang)'));
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
