/* Cloudflare Worker : porte d'entree du site.
 *
 * Le site lui meme est 100 pour cent statique et ne connait rien de
 * l'authentification. Ce Worker s'intercale devant les fichiers statiques
 * (assets.run_worker_first = true dans wrangler.jsonc) et ne les sert que
 * si la requete porte un cookie de session valide.
 *
 * Un seul compte, pas d'inscription, pas de reinitialisation. Les trois
 * valeurs sensibles sont des secrets Cloudflare, jamais dans le depot :
 *   AUTH_USERNAME  l'identifiant
 *   AUTH_PASSWORD  le mot de passe
 *   AUTH_SECRET    la cle de signature des cookies de session
 * Si l'une manque, le Worker refuse tout (fermeture par defaut).
 *
 * Ouvrir index.html en file:// continue de marcher exactement comme avant :
 * ce fichier n'existe que sur Cloudflare.
 */

const SESSION_COOKIE = "cel_session";
const SESSION_DAYS = 30;
const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;
const LOGIN_PATH = "/login";
const LOGOUT_PATH = "/logout";
const FAILED_ATTEMPT_DELAY_MS = 700;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const config = readConfig(env);

    if (!config) return misconfigured();

    if (url.pathname === LOGOUT_PATH) return logout(url);

    const signedIn = await hasValidSession(request, config);

    if (url.pathname === LOGIN_PATH) {
      if (request.method === "POST") return submitLogin(request, config, url);
      if (signedIn) return redirectTo("/", url);
      return loginResponse(safeTarget(url.searchParams.get("next")), null, 200);
    }

    if (!signedIn) {
      const wanted = encodeURIComponent(url.pathname + url.search);
      return redirectTo(`${LOGIN_PATH}?next=${wanted}`, url);
    }

    return servePrivately(await env.ASSETS.fetch(request));
  },
};

/* ---------- Configuration ---------- */

function readConfig(env) {
  const username = env.AUTH_USERNAME;
  const password = env.AUTH_PASSWORD;
  const secret = env.AUTH_SECRET;
  if (!username || !password || !secret) return null;
  return { username, password, secret };
}

function misconfigured() {
  return new Response(
    "Authentification non configuree. Definir les secrets AUTH_USERNAME, " +
      "AUTH_PASSWORD et AUTH_SECRET sur le projet Cloudflare.\n\n" +
      "Authentication is not configured. Set the AUTH_USERNAME, AUTH_PASSWORD " +
      "and AUTH_SECRET secrets on the Cloudflare project.",
    { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

/* ---------- Signature et session ---------- */

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

/* Comparaison a temps constant : on compare les HMAC des deux valeurs plutot
   que les valeurs elles memes, un attaquant ne controle pas la sortie. */
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

/* ---------- Ecrans ---------- */

async function submitLogin(request, config, url) {
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

/* Anti redirection ouverte : on n'accepte qu'un chemin interne. */
function safeTarget(value) {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value === LOGIN_PATH || value.startsWith(`${LOGIN_PATH}?`)) return "/";
  return value;
}

/* Le contenu est prive : jamais de cache partage, jamais d'indexation. */
function servePrivately(response) {
  const copy = new Response(response.body, response);
  copy.headers.set("Cache-Control", "private, no-cache, must-revalidate");
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

/* ---------- Encodage ---------- */

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

/* ---------- Page de connexion ----------
   Autonome, aux couleurs du theme sombre du site. Bilingue comme le reste
   de l'interface : les textes portent data-fr et data-en, la langue suit le
   meme reglage localStorage que l'application (cle "langue"). */

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
    --fond: #171009;
    --panneau: #221709;
    --encre: #f3e8d8;
    --texte: #ddcdb9;
    --attenue: #a3876f;
    --accent: #d98741;
    --accent-fort: #eb9a52;
    --lignes: #3c2a18;
    --danger: #e06c5a;
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
    background: var(--fond) radial-gradient(1200px 600px at 80% -10%, #2a1c10 0%, #171009 55%);
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
    background: #1b1208;
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
    try { if (localStorage.getItem("langue") === "en") lang = "en"; } catch (e) { /* indisponible */ }

    var bouton = document.getElementById("bascule-langue");

    function appliquer() {
      document.documentElement.lang = lang;
      var noeuds = document.querySelectorAll("[data-fr]");
      for (var i = 0; i < noeuds.length; i += 1) {
        noeuds[i].textContent = noeuds[i].getAttribute("data-" + lang);
      }
      bouton.textContent = lang === "fr" ? "EN" : "FR";
    }

    bouton.addEventListener("click", function () {
      lang = lang === "fr" ? "en" : "fr";
      try { localStorage.setItem("langue", lang); } catch (e) { /* indisponible */ }
      appliquer();
    });

    appliquer();
  })();
</script>
</html>`;
}
