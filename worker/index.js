/* Cloudflare Worker: the site's front door.
 *
 * The site itself is 100 percent static and knows nothing about
 * authentication. This Worker sits in front of the static files
 * (assets.run_worker_first = true in wrangler.jsonc) and only serves them
 * if the request carries a valid session cookie.
 *
 * A single account, no sign-up, no reset. The three sensitive values are
 * Cloudflare secrets, never in the repository:
 *   AUTH_USERNAME  the username
 *   AUTH_PASSWORD  the password
 *   AUTH_SECRET    the signing key of the session cookies
 * If one is missing, the Worker refuses everything (fail closed).
 *
 * Opening index.html over file:// keeps working exactly as before:
 * this file only exists on Cloudflare.
 */

import { sauvegarderDocument, handleSync } from "./sync.js";

const SESSION_COOKIE = "cel_session";
const SESSION_DAYS = 30;
const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;
const LOGIN_PATH = "/login";
const LOGOUT_PATH = "/logout";
const SYNC_PATH = "/api/sync";
const FAILED_ATTEMPT_DELAY_MS = 700;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export default {
  /* The daily backup of the document (v8.71), triggered by the cron in
     wrangler.jsonc. Without a bound database, nothing to back up. */
  async scheduled(event, env, ctx) {
    if (!env.DB) return;
    ctx.waitUntil(sauvegarderDocument(env.DB, Date.now()).catch(e => console.error("sauvegarde", e && e.message)));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const missing = missingSecrets(env);
    if (missing.length > 0) return misconfigured(missing);

    const config = readConfig(env);

    if (url.pathname === LOGOUT_PATH) return logout(url);

    const signedIn = await hasValidSession(request, config);

    if (url.pathname === LOGIN_PATH) {
      if (request.method === "POST") return submitLogin(request, config, url, env);
      if (signedIn) return redirectTo("/", url);
      return loginResponse(safeTarget(url.searchParams.get("next")), null, 200);
    }

    // The sync API sits BEHIND the same session as everything else. An
    // unauthenticated call gets a 401 in JSON, not a redirect: the client
    // then knows it must send the user to /login instead of parsing an HTML
    // page as if it were data.
    if (url.pathname === SYNC_PATH) {
      if (!signedIn) {
        return new Response(JSON.stringify({ erreur: "session-expiree" }), {
          status: 401,
          headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
      return handleSync(request, env);
    }

    if (!signedIn) {
      const wanted = encodeURIComponent(url.pathname + url.search);
      return redirectTo(`${LOGIN_PATH}?next=${wanted}`, url);
    }

    return servePrivately(await minifyIfUseful(await env.ASSETS.fetch(request), url), url);
  },
};

/* ---------- Configuration ---------- */

const REQUIRED_SECRETS = ["AUTH_USERNAME", "AUTH_PASSWORD", "AUTH_SECRET"];

/* Names the missing secrets. The NAMES are not sensitive, they are in the
   public repository; the values are obviously never returned. Without
   this, a 503 does not say which of the three is missing and diagnosis is
   done blind. */
function missingSecrets(env) {
  return REQUIRED_SECRETS.filter((name) => {
    const value = env[name];
    return typeof value !== "string" || value.trim() === "";
  });
}

function readConfig(env) {
  return {
    username: env.AUTH_USERNAME,
    password: env.AUTH_PASSWORD,
    secret: env.AUTH_SECRET,
  };
}

function misconfigured(missing) {
  const list = missing.join(", ");
  return new Response(
    "Authentification non configuree.\n\n" +
      `Manquant ou vide : ${list}\n\n` +
      "A definir dans le dashboard Cloudflare, sur le Worker, onglet Settings, " +
      "section Variables and Secrets, type Secret. Les noms sont sensibles a la " +
      "casse et ne doivent pas comporter d'espace.\n\n" +
      "---\n\n" +
      "Authentication is not configured.\n\n" +
      `Missing or empty: ${list}\n\n` +
      "Set these in the Cloudflare dashboard, on the Worker, Settings tab, " +
      "Variables and Secrets section, as type Secret. Names are case sensitive " +
      "and must not contain spaces.",
    {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    }
  );
}

/* ---------- Signing and session ---------- */

async function importKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function sign(secret, payload) {
  const key = await importKey(secret);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return base64UrlEncode(new Uint8Array(mac));
}

async function verifySignature(secret, payload, signature) {
  const bytes = base64UrlDecode(signature);
  if (!bytes) return false;
  const key = await importKey(secret);
  return crypto.subtle.verify("HMAC", key, bytes, encoder.encode(payload));
}

/* Constant-time comparison: we compare the HMACs of both values rather
   than the values themselves, an attacker does not control the output. */
async function passwordMatches(config, submitted) {
  if (typeof submitted !== "string" || submitted.length === 0) return false;
  const [given, expected] = await Promise.all([
    sign(config.secret, `password:${submitted}`),
    sign(config.secret, `password:${config.password}`),
  ]);
  return given === expected;
}

async function issueSession(config) {
  const expiresAt = Date.now() + SESSION_MAX_AGE * 1000;
  const payload = `${config.username}\n${expiresAt}`;
  const signature = await sign(config.secret, payload);
  return `${base64UrlEncode(encoder.encode(payload))}.${signature}`;
}

async function hasValidSession(request, config) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return false;

  const separator = token.lastIndexOf(".");
  if (separator < 1) return false;

  const rawPayload = base64UrlDecode(token.slice(0, separator));
  if (!rawPayload) return false;

  const payload = decoder.decode(rawPayload);
  if (!(await verifySignature(config.secret, payload, token.slice(separator + 1)))) return false;

  const [username, rawExpiry] = payload.split("\n");
  if (username !== config.username) return false;

  const expiresAt = Number(rawExpiry);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function sessionCookie(value, maxAge) {
  return `${SESSION_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const equals = part.indexOf("=");
    if (equals === -1) continue;
    if (part.slice(0, equals).trim() === name) return part.slice(equals + 1).trim();
  }
  return null;
}

/* ---------- Screens ---------- */

async function submitLogin(request, config, url, env) {
  /* A REAL ATTEMPT LIMIT (v8.73). The 700 ms delay after a failure did not
     slow down attempts fired in parallel. The Cloudflare limit (binding
     LOGIN_LIMITER, wrangler.jsonc) counts attempts per address; without
     the binding, only the delay remains. */
  if (env && env.LOGIN_LIMITER) {
    try {
      const { success } = await env.LOGIN_LIMITER.limit({ key: request.headers.get("CF-Connecting-IP") || "inconnue" });
      if (!success) return loginResponse("/", "trop", 429);
    } catch (error) { /* limit unavailable: carry on with the delay */ }
  }
  let form;
  try {
    form = await request.formData();
  } catch (error) {
    return loginResponse("/", "invalide", 400);
  }

  const username = String(form.get("username") || "").trim();
  const password = String(form.get("password") || "");
  const target = safeTarget(String(form.get("next") || "/"));

  const usernameOk = username.toLowerCase() === config.username.toLowerCase();
  const passwordOk = await passwordMatches(config, password);

  if (!usernameOk || !passwordOk) {
    await new Promise((resolve) => setTimeout(resolve, FAILED_ATTEMPT_DELAY_MS));
    return loginResponse(target, "refuse", 401);
  }

  const response = redirectTo(target, url);
  response.headers.append("Set-Cookie", sessionCookie(await issueSession(config), SESSION_MAX_AGE));
  return response;
}

function logout(url) {
  const response = redirectTo(LOGIN_PATH, url);
  response.headers.append("Set-Cookie", sessionCookie("", 0));
  return response;
}

function redirectTo(path, url) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: new URL(path, url).toString(),
      "Cache-Control": "no-store",
    },
  });
}

/* Open redirect guard: only an internal path is accepted. */
function safeTarget(value) {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value === LOGIN_PATH || value.startsWith(`${LOGIN_PATH}?`)) return "/";
  return value;
}

/* The content is private: never a shared cache, never indexing.

   Code files carry their version in the URL (js/app.js?v=7.82, see
   tools/bump_version.mjs): a given URL will never change content again, so
   the browser can keep it for a year without revalidating. Without this,
   every opening went back to the network for sixteen files already on the
   device. Everything else, index.html first, stays no-cache: it is the one
   carrying the new URLs when the version changes. */
const IMMUTABLE_PATH = /^\/(js|css)\//;

/* Fonts have no ?v= and will not get one: the version lives in index.html
   and sw.js, not in the stylesheet, and adding a third place to write it
   would be one more thing to forget on each bump. A font file is immutable
   by CONTRACT: the content of a .woff2 is never replaced under the same
   name, another one is published. Without this line, the five fonts went
   back to revalidate on every opening. */
const FONT_PATH = /\.woff2?$/;

/* MINIFYING WITHOUT A BUILD STEP (v8.75). The stylesheet carries 45 KB of
   comments, and the page 14 KB: they document the repository but have no
   business on the phone. They are stripped at serve time, nothing changes
   in the sources. Only the comments: no whitespace touched in the HTML (the
   messages to copy are in <pre>), and the stylesheet keeps its lines.
   Versioned files are immutable: their minified version is cached by URL,
   computed once. */
export function allegerCss(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map(l => l.trim()).filter(Boolean).join("\n");
}
export function allegerHtml(text) {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}
async function minifyIfUseful(response, url) {
  if (!response.ok) return response;
  const type = String(response.headers.get("Content-Type") || "");
  const css = type.includes("text/css"), html = type.includes("text/html");
  if (!css && !html) return response;
  const cache = typeof caches !== "undefined" && url.searchParams.has("v") ? caches.default : null;
  if (cache) {
    const cached = await cache.match(url.toString());
    if (cached) return cached;
  }
  const text = await response.text();
  const minified = new Response(css ? allegerCss(text) : allegerHtml(text), response);
  minified.headers.delete("Content-Length");
  if (cache) await cache.put(url.toString(), minified.clone());
  return minified;
}

/* THE APP'S SECURITY POLICY (v8.73). Second lock behind escaping: no
   script runs unless it comes from the site, except the small theme script
   in index.html, allowed by its hash. A test recomputes that hash:
   changing this script without updating it would block it, and the test
   flags it first. The recipe video player comes from youtube-nocookie.
   And nobody can frame the logbook in their page. */
export const EMPREINTE_SCRIPT_THEME = "sha256-E0DO0KwBV+TWsbuy+0OAxmRouDQMDfBZSyl6f2Ek81E=";
export const POLITIQUE_SECURITE = [
  "default-src 'self'",
  "script-src 'self' '" + EMPREINTE_SCRIPT_THEME + "'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src https://www.youtube-nocookie.com",
  "media-src 'self' blob:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

function servePrivately(response, url) {
  const copy = new Response(response.body, response);
  copy.headers.set("X-Content-Type-Options", "nosniff");
  copy.headers.set("Referrer-Policy", "same-origin");
  if (String(copy.headers.get("Content-Type") || "").includes("text/html")) {
    copy.headers.set("Content-Security-Policy", POLITIQUE_SECURITE);
  }
  const versioned = url && IMMUTABLE_PATH.test(url.pathname) &&
    (url.searchParams.has("v") || FONT_PATH.test(url.pathname));
  copy.headers.set(
    "Cache-Control",
    versioned ? "private, max-age=31536000, immutable" : "private, no-cache, must-revalidate"
  );
  copy.headers.set("X-Robots-Tag", "noindex, nofollow");
  return copy;
}

function loginResponse(target, error, status) {
  return new Response(loginPage(target, error), {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/* ---------- Encoding ---------- */

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value) {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch (error) {
    return null;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ---------- Login page ----------
   Self-contained, in the colours of the site's dark theme. Bilingual like
   the rest of the interface: the texts carry data-fr and data-en, the
   language follows the same localStorage setting as the app (key
   "langue"). */

function loginPage(target, error) {
  const messages = {
    refuse: {
      fr: "Identifiant ou mot de passe incorrect.",
      en: "Wrong username or password.",
    },
    invalide: {
      fr: "Formulaire illisible, reessaie.",
      en: "Could not read the form, please try again.",
    },
    trop: {
      fr: "Trop d'essais depuis cette adresse. Attends une minute.",
      en: "Too many attempts from this address. Wait a minute.",
    },
  };
  const message = messages[error];

  return `<!doctype html>
<html lang="fr" data-theme="sombre">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Carnet d'extraction</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%E2%98%95%3C/text%3E%3C/svg%3E">
<style>
  :root {
    --fond: #111113;
    --panneau: #18181b;
    --encre: #f4f1ec;
    --texte: #d2cdc6;
    --attenue: #99938b;
    --accent: #e8bb85;
    --accent-fort: #f4cd9d;
    --lignes: rgba(255, 255, 255, 0.08);
    --danger: #ef8a78;
    --serif: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif;
    --sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color-scheme: dark;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
    font-family: var(--sans);
    color: var(--texte);
    background: var(--fond) radial-gradient(1100px 520px at 85% -8%, rgba(232, 187, 133, 0.07) 0%, #111113 60%);
  }
  .carte {
    width: 100%;
    max-width: 380px;
    background: var(--panneau);
    border: 1px solid var(--lignes);
    border-radius: 14px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
    padding: 32px 28px;
  }
  .tasse { font-size: 34px; line-height: 1; }
  h1 {
    font-family: var(--serif);
    color: var(--encre);
    font-size: 25px;
    font-weight: 600;
    margin: 14px 0 4px;
  }
  p.sous { margin: 0 0 24px; color: var(--attenue); font-size: 14px; }
  label {
    display: block;
    font-size: 13px;
    color: var(--attenue);
    margin-bottom: 6px;
  }
  input {
    width: 100%;
    padding: 11px 13px;
    margin-bottom: 16px;
    font: inherit;
    color: var(--encre);
    background: #2a1e14;
    border: 1px solid var(--lignes);
    border-radius: 9px;
  }
  input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
    border-color: var(--accent);
  }
  button {
    width: 100%;
    padding: 12px;
    font: inherit;
    font-weight: 600;
    color: #201406;
    background: var(--accent);
    border: 0;
    border-radius: 9px;
    cursor: pointer;
    transition: background 220ms cubic-bezier(0.4, 0, 0.2, 1);
  }
  button:hover { background: var(--accent-fort); }
  .erreur {
    margin: 0 0 18px;
    padding: 10px 12px;
    font-size: 14px;
    color: var(--danger);
    background: rgba(224, 108, 90, 0.1);
    border: 1px solid rgba(224, 108, 90, 0.4);
    border-radius: 9px;
  }
  .pied {
    margin: 22px 0 0;
    font-size: 12px;
    color: var(--attenue);
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .langue {
    background: none;
    border: 0;
    width: auto;
    padding: 0;
    font: inherit;
    color: var(--attenue);
    cursor: pointer;
    text-decoration: underline;
  }
  .langue:hover { color: var(--accent); background: none; }
</style>
<div class="carte">
  <div class="tasse">&#9749;</div>
  <h1>Carnet d'extraction</h1>
  <p class="sous" data-fr="Site prive. Connecte toi pour continuer."
     data-en="Private site. Sign in to continue.">Site prive. Connecte toi pour continuer.</p>

  ${message ? `<p class="erreur" role="alert" data-fr="${escapeHtml(message.fr)}" data-en="${escapeHtml(message.en)}">${escapeHtml(message.fr)}</p>` : ""}

  <form method="post" action="${escapeHtml(LOGIN_PATH)}">
    <input type="hidden" name="next" value="${escapeHtml(target)}">

    <label for="username" data-fr="Identifiant" data-en="Username">Identifiant</label>
    <input id="username" name="username" type="text" autocomplete="username"
           autocapitalize="none" autocorrect="off" spellcheck="false" required autofocus>

    <label for="password" data-fr="Mot de passe" data-en="Password">Mot de passe</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>

    <button type="submit" data-fr="Entrer" data-en="Sign in">Entrer</button>
  </form>

  <p class="pied">
    <span data-fr="Session gardee 30 jours." data-en="Session kept for 30 days.">Session gardee 30 jours.</span>
    <button type="button" class="langue" id="bascule-langue">EN</button>
  </p>
</div>
<script>
  (function () {
    var lang = "fr";
    try { if (localStorage.getItem("langue") === "en") lang = "en"; } catch (e) { /* unavailable */ }

    var button = document.getElementById("bascule-langue");

    function apply() {
      document.documentElement.lang = lang;
      var nodes = document.querySelectorAll("[data-fr]");
      for (var i = 0; i < nodes.length; i += 1) {
        nodes[i].textContent = nodes[i].getAttribute("data-" + lang);
      }
      button.textContent = lang === "fr" ? "EN" : "FR";
    }

    button.addEventListener("click", function () {
      lang = lang === "fr" ? "en" : "fr";
      try { localStorage.setItem("langue", lang); } catch (e) { /* unavailable */ }
      apply();
    });

    apply();
  })();
</script>
</html>`;
}
