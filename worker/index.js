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
  /* La sauvegarde quotidienne du document (v8.71), declenchee par le cron de
     wrangler.jsonc. Sans base liee, rien a sauvegarder. */
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

    // L'API de synchronisation est DERRIÈRE la même session que le reste. Un
    // appel non authentifié reçoit un 401 en JSON, pas une redirection : le
    // client sait alors qu'il doit renvoyer l'utilisateur sur /login au lieu de
    // parser une page HTML comme si c'était des données.
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

    return servePrivately(await allegerSiUtile(await env.ASSETS.fetch(request), url), url);
  },
};

/* ---------- Configuration ---------- */

const REQUIRED_SECRETS = ["AUTH_USERNAME", "AUTH_PASSWORD", "AUTH_SECRET"];

/* Nomme les secrets absents. Les NOMS ne sont pas sensibles, ils sont dans le
   depot public; les valeurs ne sont evidemment jamais rendues. Sans ca, un
   503 ne dit pas laquelle des trois manque et le diagnostic se fait a
   l'aveugle. */
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

async function submitLogin(request, config, url, env) {
  /* UNE VRAIE LIMITE D'ESSAIS (v8.73). Le délai de 700 ms après un échec ne
     freinait pas des essais lancés en parallèle. La limite de Cloudflare
     (binding LOGIN_LIMITER, wrangler.jsonc) compte les essais par adresse ;
     sans binding, on garde le seul délai. */
  if (env && env.LOGIN_LIMITER) {
    try {
      const { success } = await env.LOGIN_LIMITER.limit({ key: request.headers.get("CF-Connecting-IP") || "inconnue" });
      if (!success) return loginResponse("/", "trop", 429);
    } catch (error) { /* limite indisponible : on continue avec le délai */ }
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

/* Anti redirection ouverte : on n'accepte qu'un chemin interne. */
function safeTarget(value) {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value === LOGIN_PATH || value.startsWith(`${LOGIN_PATH}?`)) return "/";
  return value;
}

/* Le contenu est prive : jamais de cache partage, jamais d'indexation.

   Les fichiers de code portent leur version dans l'URL (js/app.js?v=7.82,
   voir tools/bump_version.mjs) : une URL donnee ne changera plus jamais de
   contenu, donc le navigateur peut la garder un an sans revalider. Sans ca,
   chaque ouverture repartait sur le reseau pour seize fichiers deja presents
   sur l'appareil. Tout le reste, index.html en tete, reste en no-cache : c'est
   lui qui porte les nouvelles URL quand la version change. */
const IMMUTABLE_PATH = /^\/(js|css)\//;

/* Les polices n'ont pas de ?v= et n'en auront pas : la version vit dans
   index.html et sw.js, pas dans la feuille de style, et ajouter un troisieme
   endroit ou l'ecrire serait un oubli de plus a chaque montee. Un fichier de
   police est immuable par CONTRAT : on ne remplace jamais le contenu d'un
   .woff2 sous le meme nom, on en publie un autre. Sans cette ligne, les cinq
   polices repartaient revalider a chaque ouverture. */
const FONT_PATH = /\.woff2?$/;

/* ALLÉGER SANS ÉTAPE DE BUILD (v8.75). La feuille de style porte 45 Ko de
   commentaires, et la page 14 Ko : ils documentent le dépôt mais n'ont rien à
   faire dans le téléphone. Ils sont retirés au moment de servir, rien ne change
   dans les sources. Seulement les commentaires : pas d'espaces touchés dans le
   HTML (les messages à copier sont en <pre>), et la feuille garde ses lignes.
   Les fichiers versionnés sont immuables : leur version allégée est mise en
   cache par URL, calculée une fois. */
export function allegerCss(texte) {
  return texte.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map(l => l.trim()).filter(Boolean).join("\n");
}
export function allegerHtml(texte) {
  return texte.replace(/<!--[\s\S]*?-->/g, "");
}
async function allegerSiUtile(response, url) {
  if (!response.ok) return response;
  const type = String(response.headers.get("Content-Type") || "");
  const css = type.includes("text/css"), html = type.includes("text/html");
  if (!css && !html) return response;
  const cache = typeof caches !== "undefined" && url.searchParams.has("v") ? caches.default : null;
  if (cache) {
    const deja = await cache.match(url.toString());
    if (deja) return deja;
  }
  const texte = await response.text();
  const allege = new Response(css ? allegerCss(texte) : allegerHtml(texte), response);
  allege.headers.delete("Content-Length");
  if (cache) await cache.put(url.toString(), allege.clone());
  return allege;
}

/* LA POLITIQUE DE SÉCURITÉ DE L'APPLI (v8.73). Deuxième verrou derrière
   l'échappement : aucun script ne s'exécute s'il ne vient pas du site, sauf le
   petit script du thème dans index.html, autorisé par son empreinte. Un test
   recalcule cette empreinte : modifier ce script sans la mettre à jour le
   bloquerait, le test le signale avant. Le lecteur des vidéos de recettes vient
   de youtube-nocookie. Et personne ne peut encadrer le carnet dans sa page. */
export const EMPREINTE_SCRIPT_THEME = "sha256-nY9y9O22i6u8EQ2vZ5f6UkDQTs/tpCtl0HirifsGAJ8=";
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
