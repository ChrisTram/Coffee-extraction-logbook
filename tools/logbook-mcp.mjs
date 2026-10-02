#!/usr/bin/env node
/* The coffee catalog over MCP (v9.12).
 *
 *   node tools/logbook-mcp.mjs     (started by Claude Code, see .mcp.json)
 *
 * A Model Context Protocol server, stdio transport: JSON-RPC 2.0, one message
 * per line on stdin and stdout. No dependency. stdout carries the protocol
 * and nothing else: every log goes to stderr.
 *
 * WHAT IT DOES: lets Claude read and edit the coffee catalog of the logbook
 * (coffees, bags, stock) and read the last cups, through the site's tools API
 * (POST /api/tools/sync, worker/index.js). That endpoint is the device sync
 * itself: what this server sends merges row by row by updated_at, exactly
 * like a phone. There is no delete tool, on purpose.
 *
 * THE APP'S OWN CODE: the rows are built by the browser scripts themselves
 * (normalizeCoffee, stampRow, newId, bagStock...), loaded in a Node vm like
 * the tests do. A coffee added here is the coffee the app would have written.
 *
 * THE TOKEN: read from the LOGBOOK_TOKEN environment variable, or else from
 * the file ~/.coffee-logbook/token. This file only READS it: creating it is
 * Chris's own step (DOCUMENTATION.md, section 14). It is never printed,
 * logged, or included in any answer or error: every outgoing text goes
 * through redact() as a last guard.
 *
 * FLOW OF A CALL: one POST with an empty payload reads the merged document;
 * a write sends ONLY the new or changed rows in a second POST, and checks
 * them in the merged document the server answers with (the document it has
 * just stored). Two calls per write keeps clear of the site's attempt limit
 * (ten calls a minute). */

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createInterface } from "node:readline";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const DEFAULT_URL = "https://coffee-extraction-logbook.lysstudio-contact.workers.dev";
export const TOOLS_PATH = "/api/tools/sync";
export const DEFAULT_PROTOCOL = "2025-06-18";
const MIN_TOKEN_LENGTH = 32;
const TIMEOUT_MS = 15000;
const DOC_POINTER = "DOCUMENTATION.md, section 14 « Catalogue par MCP »";

/* The browser scripts the server needs, in page order. data-migrations.js
   only gives CURRENT_SCHEMA: the schema this server announces is the app's,
   never a copy that could drift. */
const APP_SCRIPTS = ["js/legacy-names.js", "js/tools.js", "js/grind.js", "js/recipes.js",
  "js/data-schema.js", "js/data-calcs.js", "js/data-migrations.js"];

export function loadApp(log) {
  const say = (...parts) => { if (log) log(parts.map(String).join(" ")); };
  const quietConsole = { log: say, info: say, warn: say, error: say, debug: say };
  const source = APP_SCRIPTS.map(f => readFileSync(join(ROOT, f), "utf8")).join("\n;\n");
  const context = vm.createContext({ console: quietConsole });
  const app = vm.runInContext(source + "\n;({ LEGACY, TOOLS, DATA_SCHEMA, DATA_CALCS, DATA_MIGRATIONS });",
    context, { filename: "logbook-app.js" });
  const emptyState = { coffees: [], extractions: [], recipes: [], cups: [], purchases: [], settings: [], tombstones: {} };
  const { CURRENT_SCHEMA } = app.DATA_MIGRATIONS.forState(emptyState, {
    markDeleted() {}, currentSettings: () => app.DATA_SCHEMA.normalizeSettings({}),
  });
  return { ...app, CURRENT_SCHEMA };
}

export function siteVersion() {
  try {
    const html = readFileSync(join(ROOT, "index.html"), "utf8");
    const m = /<meta name="app-version" content="([^"]+)"/.exec(html);
    return m ? m[1] : "0";
  } catch (error) {
    return "0";
  }
}

/* Reads the token, never writes it. The environment first, then the file.
   A BOM (Notepad saves one) and the line end are dropped. */
export function readToken(env = process.env, home = homedir()) {
  const fromEnv = String(env.LOGBOOK_TOKEN || "").replace(/^\uFEFF/, "").trim();
  if (fromEnv) return fromEnv;
  const file = join(home, ".coffee-logbook", "token");
  try {
    if (existsSync(file)) return readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)[0].trim();
  } catch (error) { /* unreadable: treated as absent */ }
  return "";
}

/* The token never travels in clear to a remote host: https only, plain http
   for a local test server alone. */
export function checkedBaseUrl(value) {
  const raw = String(value || DEFAULT_URL).trim().replace(/\/+$/, "");
  let url;
  try { url = new URL(raw); } catch (error) { return null; }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.hostname.endsWith(".localhost");
  if (url.protocol === "https:" || (url.protocol === "http:" && local)) return url.origin;
  return null;
}

class ToolError extends Error {}

const fold = s => String(s === undefined || s === null ? "" : s)
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const ROASTS = ["Claire", "Medium", "Foncée"];
const METHODS = ["Brikka", "Switch", "Les deux"];
const COFFEE_TEXT_FIELDS = { name: 120, roaster: 120, origin: 120, species: 120, process: 120, roaster_notes: 2000 };

/* ---------- Tool definitions ---------- */

const coffeeRef = { type: "string", description: "Identifiant du café (ex. c1a2b3) ou son nom, sans tenir compte des majuscules ni des accents ; un morceau du nom suffit s'il ne désigne qu'un café." };
const dateField = desc => ({ type: "string", description: desc + " Format AAAA-MM-JJ.", pattern: "^(\\d{4}-\\d{2}-\\d{2})?$" });
const coffeeFields = {
  roaster: { type: "string", description: "Torréfacteur." },
  origin: { type: "string", description: "Origine (pays, région, ferme)." },
  species: { type: "string", description: "Espèce : Arabica, Robusta, mélange..." },
  process: { type: "string", description: "Traitement : lavé, nature, honey..." },
  roast: { type: "string", enum: ["", ...ROASTS], description: "Torréfaction." },
  roaster_notes: { type: "string", description: "Notes du torréfacteur, telles qu'écrites sur le sachet." },
  bag_size_g: { type: "number", exclusiveMinimum: 0, description: "Taille du sachet, en grammes." },
  price_vnd: { type: "number", minimum: 0, description: "Prix du sachet, en dongs." },
  roast_date: dateField("Date de torréfaction."),
  recommended_method: { type: "string", enum: ["", ...METHODS], description: "Méthode recommandée." },
  recommended_recipe: { type: "string", description: "Recette recommandée : doit être le nom d'une recette existante du carnet." },
  pre_ground: { type: "boolean", description: "Café vendu déjà moulu." },
  real_coffee_pct: { type: "number", minimum: 1, maximum: 100, description: "Part de vrai café en pour cent (moins de 100 pour un café aromatisé)." },
};

export const TOOLS = [
  {
    name: "list_coffees",
    description: "Liste les cafés du carnet (actifs par défaut) : torréfacteur, torréfaction, traitement, méthode et recette recommandées, grammes restants dans le sachet en cours, date d'ouverture.",
    inputSchema: {
      type: "object",
      properties: { include_archived: { type: "boolean", description: "Inclure aussi les cafés archivés." } },
      additionalProperties: false,
    },
  },
  {
    name: "get_coffee",
    description: "Fiche complète d'un café : tous ses champs, ses sachets, son stock et un résumé de ses tasses. Si plusieurs cafés correspondent, renvoie la liste des candidats sans rien faire.",
    inputSchema: { type: "object", properties: { coffee: coffeeRef }, required: ["coffee"], additionalProperties: false },
  },
  {
    name: "add_coffee",
    description: "Ajoute un café au catalogue. Refuse un doublon actif (même nom et même torréfacteur). Avec opened_date ou opened_today, crée aussi son premier sachet, ouvert ce jour-là.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nom du café." },
        ...coffeeFields,
        opened_date: dateField("Crée le premier sachet, ouvert à cette date."),
        opened_today: { type: "boolean", description: "Crée le premier sachet, ouvert aujourd'hui." },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "edit_coffee",
    description: "Modifie un café : seuls les champs fournis changent, les autres restent tels quels. Une chaîne vide efface un champ texte, null efface un nombre.",
    inputSchema: {
      type: "object",
      properties: {
        coffee: coffeeRef,
        name: { type: "string", description: "Nouveau nom." },
        ...coffeeFields,
        bag_size_g: { type: ["number", "null"], description: "Taille du sachet, en grammes (null pour effacer)." },
        price_vnd: { type: ["number", "null"], description: "Prix du sachet, en dongs (null pour effacer)." },
        active: { type: "boolean", description: "true pour réactiver un café archivé." },
      },
      required: ["coffee"],
      additionalProperties: false,
    },
  },
  {
    name: "archive_coffee",
    description: "Archive un café (il disparaît des listes actives). Rien n'est supprimé : edit_coffee avec active true le réactive.",
    inputSchema: { type: "object", properties: { coffee: coffeeRef }, required: ["coffee"], additionalProperties: false },
  },
  {
    name: "add_bag",
    description: "Enregistre un nouveau sachet d'un café, comme le bouton « Nouveau sachet » de l'app : la fiche du café prend la taille, le prix et la date de torréfaction du sachet, et le stock repart de ce sachet.",
    inputSchema: {
      type: "object",
      properties: {
        coffee: coffeeRef,
        bag_size_g: { type: "number", exclusiveMinimum: 0, description: "Taille du sachet en grammes (par défaut celle de la fiche du café)." },
        price_vnd: { type: "number", minimum: 0, description: "Prix en dongs (par défaut celui de la fiche du café)." },
        purchase_date: dateField("Date d'achat, aujourd'hui par défaut."),
        roast_date: dateField("Date de torréfaction du sachet (vide si inconnue)."),
        opened_date: dateField("Date d'ouverture, aujourd'hui par défaut ; chaîne vide si le sachet attend au placard."),
      },
      required: ["coffee"],
      additionalProperties: false,
    },
  },
  {
    name: "correct_stock",
    description: "Corrige le stock d'un café : les grammes réellement restants dans le sachet en cours, pesés ou estimés. Seules les tasses suivantes seront décomptées.",
    inputSchema: {
      type: "object",
      properties: { coffee: coffeeRef, grams: { type: "number", minimum: 0, description: "Grammes restants." } },
      required: ["coffee", "grams"],
      additionalProperties: false,
    },
  },
  {
    name: "recent_cups",
    description: "Les dernières tasses, éventuellement pour un seul café : date, café, méthode, recette, dose, eau, mouture, température, temps total, note, descripteurs, commentaire.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Nombre de tasses, 10 par défaut." },
        coffee: { ...coffeeRef, description: "Limiter à ce café (identifiant ou nom)." },
      },
      additionalProperties: false,
    },
  },
];

/* ---------- The server ---------- */

export function createLogbookServer(options = {}) {
  const log = options.log || (() => {});
  const app = options.app || loadApp(log);
  const S = app.DATA_SCHEMA;
  const fetchImpl = options.fetch || globalThis.fetch;
  const getToken = options.getToken || (() => readToken());
  const baseUrl = checkedBaseUrl(options.baseUrl);
  const version = options.version || siteVersion();
  let knownToken = "";

  /* The last guard: whatever leaves this server goes through here. */
  function redact(text) {
    let out = String(text);
    for (const secret of [knownToken]) {
      if (secret && secret.length >= 8) out = out.split(secret).join("[jeton masqué]");
    }
    return out;
  }

  /* ---------- Network ---------- */

  async function exchange(token, payload) {
    if (!baseUrl) {
      throw new ToolError("Adresse du carnet refusée : LOGBOOK_URL doit être une adresse https. Voir " + DOC_POINTER + ".");
    }
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    let response;
    try {
      response = await fetchImpl(baseUrl + TOOLS_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify(payload),
        signal: abort.signal,
      });
    } catch (error) {
      throw new ToolError("Le carnet ne répond pas (réseau coupé ou délai dépassé). Réessaie dans un moment.");
    } finally {
      clearTimeout(timer);
    }
    let body = null;
    try { body = await response.json(); } catch (error) { body = null; }
    const status = response.status;
    if (status === 404) {
      throw new ToolError("La fonction n'est pas activée sur le site : le secret TOOLS_TOKEN du Worker manque ou fait moins de 32 caractères. Voir " + DOC_POINTER + ".");
    }
    if (status === 401) {
      throw new ToolError("Le site refuse le jeton : la valeur de LOGBOOK_TOKEN (ou du fichier .coffee-logbook/token) ne correspond pas au secret TOOLS_TOKEN du Worker. Voir " + DOC_POINTER + ".");
    }
    if (status === 429) throw new ToolError("Trop d'appels en une minute (limite du site). Attends une minute puis réessaie.");
    if (status === 409) {
      const wanted = body && body.schema ? " (" + body.schema + ")" : "";
      throw new ToolError("Le carnet est à une version de données plus récente" + wanted + " que cet outil (" + app.CURRENT_SCHEMA +
        ") : mets le dépôt à jour puis redémarre Claude Code. Rien n'a été écrit.");
    }
    if (status === 503) throw new ToolError("La synchronisation n'est pas configurée sur le site (base D1 absente).");
    if (!response.ok || !body || typeof body !== "object" || !body.tables) {
      const code = body && typeof body.error === "string" ? ", motif " + body.error : "";
      throw new ToolError("Le site a répondu une erreur (code " + status + code + "). Rien n'a été modifié de ce côté.");
    }
    // The logbook clock, like the app: stamps follow the server time.
    if (Number(body.serverTime)) S.setClockOffset(Number(body.serverTime) - Date.now());
    return app.LEGACY.renameDocument(body);
  }

  function snapshot(doc) {
    const t = doc.tables || {};
    const list = name => (Array.isArray(t[name]) ? t[name] : []);
    const state = {
      coffees: list("coffees").map(r => S.normalizeCoffee(r)),
      extractions: list("extractions").map(r => S.normalizeExtraction(r)),
      recipes: list("recipes").map(r => S.normalizeRecipe(r)),
      cups: list("cups").map(r => S.normalizeCup(r)),
      purchases: list("purchases").map(r => S.normalizePurchase(r)),
      settings: list("settings").map(r => S.normalizeSettings(r)).slice(0, 1),
    };
    // Same fallback as the app's adoptTables: no recipe stored means the seeds.
    if (!state.recipes.length) state.recipes = S.defaultRecipes();
    const raw = {};
    for (const name of ["coffees", "purchases"]) raw[name] = new Map(list(name).map(r => [r.id, r]));
    const calcs = app.DATA_CALCS.forState(state);
    const dose = (state.settings[0] || S.normalizeSettings({})).dose_g;
    return { state, raw, calcs, dose };
  }

  const emptyRead = () => ({ schema: app.CURRENT_SCHEMA, tables: {}, tombstones: {} });

  async function read(token) {
    return snapshot(await exchange(token, emptyRead()));
  }

  /* Sends only the given rows, then finds each of them in the merged
     document the server stored. A row stamped later elsewhere in between
     still counts as written: the merge did its job. */
  async function write(token, tables) {
    const doc = await exchange(token, { schema: app.CURRENT_SCHEMA, tables, tombstones: {} });
    const after = snapshot(doc);
    for (const [name, rows] of Object.entries(tables)) {
      const stored = (doc.tables && doc.tables[name]) || [];
      for (const row of rows) {
        const found = stored.find(r => r.id === row.id);
        if (!found || Number(found.updated_at) < Number(row.updated_at)) {
          throw new ToolError("Écriture envoyée mais introuvable à la relecture (" + name + " " + row.id + "). Vérifie dans l'app avant de recommencer.");
        }
      }
    }
    return after;
  }

  /* ---------- Lookups and checks ---------- */

  function findCoffee(snap, query) {
    const q = String(query === undefined || query === null ? "" : query).trim();
    if (!q) throw new ToolError("Indique le café : son identifiant ou son nom.");
    const coffees = snap.state.coffees;
    const byId = coffees.find(c => c.id === q);
    if (byId) return { coffee: byId };
    const fq = fold(q);
    const label = c => fold(c.name + " " + c.roaster);
    const exact = coffees.filter(c => fold(c.name) === fq || label(c) === fq);
    let matches = exact.length ? exact : coffees.filter(c => fold(c.name).includes(fq) || label(c).includes(fq));
    if (matches.length > 1) {
      const active = matches.filter(c => c.active !== 0);
      if (active.length === 1) matches = active;
    }
    if (!matches.length) {
      const names = coffees.filter(c => c.active !== 0).map(c => c.name).join(", ");
      throw new ToolError("Aucun café ne correspond à « " + q + " »." + (names ? " Cafés actifs : " + names + "." : ""));
    }
    if (matches.length > 1) return { candidates: matches };
    return { coffee: matches[0] };
  }

  function candidatesText(query, candidates, wrote) {
    return "Plusieurs cafés correspondent à « " + query + " »" + (wrote ? ", rien n'a été modifié" : "") +
      ". Précise avec l'identifiant :\n" + candidates.map(c => "- " + coffeeTitle(c) + (c.active === 0 ? " (archivé)" : "")).join("\n");
  }

  function isDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + "T12:00:00Z");
    return !isNaN(d) && d.toISOString().slice(0, 10) === value;
  }

  function checkDate(field, value, allowEmpty) {
    const v = String(value === undefined || value === null ? "" : value).trim();
    if (v === "" && allowEmpty) return "";
    if (!isDate(v)) throw new ToolError("Date invalide pour " + field + " : « " + v + " » (format attendu AAAA-MM-JJ).");
    return v;
  }

  function checkNumber(field, value, min, max, exclusiveMin) {
    const n = Number(value);
    if (typeof value === "boolean" || value === "" || !Number.isFinite(n) || n < min || (exclusiveMin && n === min) || n > max) {
      throw new ToolError("Valeur invalide pour " + field + " : « " + value + " ».");
    }
    return n;
  }

  function liveRecipeNames(snap) {
    return snap.state.recipes.filter(r => r.active !== 0).map(r => r.name);
  }

  function checkRecipe(snap, value) {
    const v = String(value || "").trim();
    if (!v) return "";
    const names = liveRecipeNames(snap);
    const hit = names.find(n => fold(n) === fold(v));
    if (!hit) throw new ToolError("Recette inconnue : « " + v + " ». Recettes du carnet : " + names.join(", ") + ".");
    return hit;
  }

  /* Validates the coffee fields present in args. Absent fields stay absent;
     with `clearable`, "" and null clear a field (edit). */
  function coffeeChanges(snap, args, clearable) {
    const out = {};
    for (const [field, max] of Object.entries(COFFEE_TEXT_FIELDS)) {
      if (args[field] === undefined) continue;
      const v = String(args[field] === null ? "" : args[field]).trim();
      if (v.length > max) throw new ToolError("Texte trop long pour " + field + " (" + max + " caractères au plus).");
      out[field] = v;
    }
    if ("name" in out && !out.name) throw new ToolError("Le nom du café ne peut pas être vide.");
    if (args.roast !== undefined) {
      const v = String(args.roast || "").trim();
      const hit = ROASTS.find(r => fold(r) === fold(v));
      if (v && !hit) throw new ToolError("Torréfaction invalide : « " + v + " ». Valeurs possibles : " + ROASTS.join(", ") + ".");
      out.roast = hit || "";
    }
    if (args.recommended_method !== undefined) {
      const v = String(args.recommended_method || "").trim();
      const hit = METHODS.find(m => fold(m) === fold(v));
      if (v && !hit) throw new ToolError("Méthode invalide : « " + v + " ». Valeurs possibles : " + METHODS.join(", ") + ".");
      out.recommended_method = hit || "";
    }
    if (args.recommended_recipe !== undefined) out.recommended_recipe = checkRecipe(snap, args.recommended_recipe);
    for (const [field, min, max, exclusive] of [["bag_size_g", 0, 10000, true], ["price_vnd", 0, 1e9, false]]) {
      if (args[field] === undefined) continue;
      if (clearable && (args[field] === null || args[field] === "")) { out[field] = ""; continue; }
      out[field] = checkNumber(field, args[field], min, max, exclusive);
    }
    if (args.roast_date !== undefined) out.roast_date = checkDate("roast_date", args.roast_date, true);
    if (args.pre_ground !== undefined) out.pre_ground = args.pre_ground === true || Number(args.pre_ground) === 1 ? 1 : 0;
    if (args.real_coffee_pct !== undefined && args.real_coffee_pct !== null && args.real_coffee_pct !== "") {
      out.real_coffee_pct = checkNumber("real_coffee_pct", args.real_coffee_pct, 1, 100);
    }
    return out;
  }

  function duplicateOf(snap, name, roaster, exceptId) {
    return snap.state.coffees.find(c => c.id !== exceptId && c.active !== 0 &&
      fold(c.name) === fold(name) && fold(c.roaster) === fold(roaster));
  }

  /* The app's addPurchase: a stamped bag, and the coffee record follows it
     (size, price, roast date, even when empty). `coffee` is a copy that the
     caller sends. */
  function newBag(snap, coffee, purchase) {
    const bag = S.stampRow(S.normalizePurchase({ ...purchase, coffee_id: coffee.id }));
    bag.id = S.newId("a", snap.state.purchases);
    if (bag.bag_size_g !== "") coffee.bag_size_g = bag.bag_size_g;
    if (bag.price_vnd !== "") coffee.price_vnd = bag.price_vnd;
    coffee.roast_date = bag.roast_date;
    S.stampRow(coffee);
    return bag;
  }

  // A row to send: the stored row's unknown columns are kept, never dropped.
  const withStored = (snap, table, row) => ({ ...(snap.raw[table].get(row.id) || {}), ...row });

  const today = () => S.localDateToday();
  // The cups' local time, to the minute, as correctStock writes it.
  function localMinute() {
    const d = new Date(S.clockNow());
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  /* ---------- Formatting ---------- */

  const coffeeTitle = c => c.name + (c.roaster ? " (" + c.roaster + ")" : "") + " [id " + c.id + "]";
  const grams = n => (Math.round(Number(n) * 10) / 10).toLocaleString("fr-FR") + " g";
  const money = n => Number(n).toLocaleString("fr-FR") + " ₫";

  function stockText(snap, coffee) {
    const stock = snap.calcs.bagStock(coffee.id, snap.dose);
    if (!stock) return "stock inconnu (taille de sachet non renseignée)";
    return "reste " + grams(Math.max(0, stock.remaining)) + " sur " + grams(stock.format) +
      (stock.corrected ? " (compté le " + stock.corrected.replace("T", " à ") + ")" : "");
  }

  function openedText(snap, coffee) {
    const bag = snap.calcs.currentBag(coffee.id);
    if (!bag) return "";
    return bag.opened_date ? "ouvert le " + bag.opened_date : "sachet pas encore ouvert";
  }

  function coffeeLine(snap, c) {
    const parts = [c.roast, c.process, c.origin,
      c.recommended_method ? "méthode " + c.recommended_method : "",
      c.recommended_recipe ? "recette « " + c.recommended_recipe + " »" : "",
      stockText(snap, c), openedText(snap, c), c.active === 0 ? "archivé" : ""].filter(Boolean);
    return "- " + coffeeTitle(c) + (parts.length ? " : " + parts.join(" · ") : "");
  }

  function duration(s) {
    const n = Number(s);
    if (!(n > 0)) return "";
    return Math.floor(n / 60) + ":" + String(Math.round(n % 60)).padStart(2, "0");
  }

  function cupLine(snap, e) {
    const coffee = snap.state.coffees.find(c => c.id === e.coffee_id);
    const parts = [
      String(e.date_time || "").replace("T", " "),
      coffee ? coffee.name : (e.coffee_id ? "café supprimé" : "sans café"),
      e.method, e.recipe ? "recette « " + e.recipe + " »" : "",
      e.dose_g !== "" ? "dose " + e.dose_g + " g" : "",
      e.water_g !== "" ? "eau " + e.water_g + " g" : "",
      e.grind_dial ? "mouture " + e.grind_dial : "",
      e.temperature_c !== "" ? e.temperature_c + " °C" : "",
      duration(e.total_time_s) ? "temps " + duration(e.total_time_s) : "",
      e.score_10 !== "" ? "note " + e.score_10 + "/10" : "",
      e.failed === 1 ? "ratée" : "",
      e.descriptors ? "descripteurs : " + e.descriptors : "",
      e.comment ? "commentaire : « " + e.comment + " »" : "",
    ].filter(Boolean);
    return "- " + parts.join(" · ");
  }

  /* ---------- The tools ---------- */

  const handlers = {
    async list_coffees(token, args) {
      const snap = await read(token);
      const all = args.include_archived === true;
      const coffees = snap.state.coffees.filter(c => all || c.active !== 0)
        .sort((a, b) => (a.active === 0) - (b.active === 0) || a.name.localeCompare(b.name, "fr"));
      if (!coffees.length) return all ? "Le catalogue est vide." : "Aucun café actif dans le catalogue.";
      return (all ? "Cafés du carnet (" : "Cafés actifs (") + coffees.length + ") :\n" + coffees.map(c => coffeeLine(snap, c)).join("\n");
    },

    async get_coffee(token, args) {
      const snap = await read(token);
      const found = findCoffee(snap, args.coffee);
      if (found.candidates) return candidatesText(args.coffee, found.candidates, false);
      const c = found.coffee;
      const field = (label, v) => (v === "" || v === undefined || v === null ? "" : label + " : " + v);
      const bags = snap.state.purchases.filter(a => a.coffee_id === c.id)
        .sort((a, b) => String(b.opened_date || b.purchase_date).localeCompare(String(a.opened_date || a.purchase_date)));
      const cups = snap.state.extractions.filter(e => e.coffee_id === c.id)
        .sort((a, b) => String(b.date_time).localeCompare(String(a.date_time)));
      const scores = cups.map(e => e.score_10).filter(v => v !== "" && Number.isFinite(Number(v))).map(Number);
      const lines = [
        coffeeTitle(c) + (c.active === 0 ? " (archivé)" : ""),
        field("Origine", c.origin), field("Espèce", c.species), field("Traitement", c.process),
        field("Torréfaction", c.roast), field("Date de torréfaction", c.roast_date),
        field("Notes du torréfacteur", c.roaster_notes),
        field("Méthode recommandée", c.recommended_method), field("Recette recommandée", c.recommended_recipe),
        field("Taille du sachet", c.bag_size_g === "" ? "" : grams(c.bag_size_g)),
        field("Prix", c.price_vnd === "" ? "" : money(c.price_vnd)),
        c.pre_ground === 1 ? "Vendu moulu" : "",
        c.real_coffee_pct < 100 ? "Part de vrai café : " + c.real_coffee_pct + " %" : "",
        field("Étiquette", c.tag), field("Ajouté le", c.added_date),
        "Stock : " + stockText(snap, c) + (openedText(snap, c) ? ", " + openedText(snap, c) : ""),
        bags.length ? "Sachets (" + bags.length + ") :\n" + bags.slice(0, 5).map(a => "  - acheté le " + (a.purchase_date || "?") +
          (a.bag_size_g !== "" ? ", " + grams(a.bag_size_g) : "") + (a.price_vnd !== "" ? ", " + money(a.price_vnd) : "") +
          (a.opened_date ? ", ouvert le " + a.opened_date : ", pas encore ouvert") +
          (a.roast_date ? ", torréfié le " + a.roast_date : "") + " [id " + a.id + "]").join("\n") : "Aucun sachet enregistré.",
        cups.length ? "Tasses : " + cups.length + ", la dernière le " + String(cups[0].date_time).replace("T", " à ") +
          (scores.length ? ", note moyenne " + (Math.round(scores.reduce((x, y) => x + y, 0) / scores.length * 10) / 10) + "/10" : "")
          : "Aucune tasse avec ce café.",
      ].filter(Boolean);
      return lines.join("\n");
    },

    async add_coffee(token, args) {
      const snap = await read(token);
      if (typeof args.name !== "string" || !args.name.trim()) throw new ToolError("Le nom du café est obligatoire.");
      const changes = coffeeChanges(snap, args, false);
      const dup = duplicateOf(snap, changes.name, changes.roaster || "", null);
      if (dup) throw new ToolError("Ce café existe déjà et il est actif : " + coffeeTitle(dup) + ". Rien n'a été ajouté.");
      let opened = "";
      if (args.opened_date !== undefined && String(args.opened_date).trim() !== "") opened = checkDate("opened_date", args.opened_date, false);
      else if (args.opened_today === true) opened = today();

      const input = { ...changes, active: 1 };
      // Same rule as the coffee form: under 100 percent real coffee, it is flavoured.
      if (Number(input.real_coffee_pct) < 100) input.tag = "café aromatisé";
      const coffee = S.stampRow(S.normalizeCoffee(input));
      coffee.id = S.newId("c", snap.state.coffees);
      if (!coffee.added_date) coffee.added_date = S.localDateToday();
      const tables = { coffees: [coffee] };
      if (opened) {
        const day = today();
        tables.purchases = [newBag(snap, coffee, {
          purchase_date: opened < day ? opened : day,
          bag_size_g: coffee.bag_size_g, price_vnd: coffee.price_vnd, roast_date: coffee.roast_date,
          opened_date: opened,
        })];
      }
      const after = await write(token, tables);
      const stored = after.state.coffees.find(c => c.id === coffee.id) || coffee;
      return "Café ajouté : " + coffeeTitle(stored) + "." +
        (opened ? " Premier sachet ouvert le " + opened + ", " + stockText(after, stored) + "." : "") +
        (stored.bag_size_g === "" ? " Taille de sachet non renseignée : le stock ne pourra pas être calculé." : "");
    },

    async edit_coffee(token, args) {
      const snap = await read(token);
      const found = findCoffee(snap, args.coffee);
      if (found.candidates) return candidatesText(args.coffee, found.candidates, true);
      const current = found.coffee;
      const changes = coffeeChanges(snap, args, true);
      if (typeof args.active === "boolean") changes.active = args.active ? 1 : 0;
      const next = S.normalizeCoffee({ ...current, ...changes });
      next.id = current.id;
      if (!next.added_date) next.added_date = current.added_date || "";
      if (Number(next.real_coffee_pct) < 100 && !next.tag) next.tag = "café aromatisé";
      const changed = Object.keys(next).filter(k => k !== "updated_at" && String(next[k]) !== String(current[k]));
      if (!changed.length) return "Aucun changement pour " + coffeeTitle(current) + " : les valeurs fournies sont déjà celles du carnet.";
      if (next.active !== 0) {
        const dup = duplicateOf(snap, next.name, next.roaster, current.id);
        if (dup) throw new ToolError("Un autre café actif porte déjà ce nom chez ce torréfacteur : " + coffeeTitle(dup) + ". Rien n'a été modifié.");
      }
      S.stampRow(next);
      const after = await write(token, { coffees: [withStored(snap, "coffees", next)] });
      const stored = after.state.coffees.find(c => c.id === next.id) || next;
      const show = v => (v === "" ? "(vide)" : String(v));
      return "Café modifié : " + coffeeTitle(stored) + ".\n" +
        changed.map(k => "- " + k + " : " + show(current[k]) + " → " + show(stored[k])).join("\n");
    },

    async archive_coffee(token, args) {
      const snap = await read(token);
      const found = findCoffee(snap, args.coffee);
      if (found.candidates) return candidatesText(args.coffee, found.candidates, true);
      const current = found.coffee;
      if (current.active === 0) return coffeeTitle(current) + " est déjà archivé. Rien n'a été modifié.";
      const next = S.stampRow({ ...current, active: 0 });
      await write(token, { coffees: [withStored(snap, "coffees", next)] });
      return "Café archivé : " + coffeeTitle(current) + ". Rien n'est supprimé, ses tasses et ses sachets restent ; edit_coffee avec active true le réactive.";
    },

    async add_bag(token, args) {
      const snap = await read(token);
      const found = findCoffee(snap, args.coffee);
      if (found.candidates) return candidatesText(args.coffee, found.candidates, true);
      const current = found.coffee;
      const size = args.bag_size_g !== undefined ? checkNumber("bag_size_g", args.bag_size_g, 0, 10000, true) : current.bag_size_g;
      const price = args.price_vnd !== undefined ? checkNumber("price_vnd", args.price_vnd, 0, 1e9) : current.price_vnd;
      const purchaseDate = args.purchase_date !== undefined && String(args.purchase_date).trim() !== ""
        ? checkDate("purchase_date", args.purchase_date, false) : today();
      const roastDate = args.roast_date !== undefined ? checkDate("roast_date", args.roast_date, true) : "";
      const openedDate = args.opened_date !== undefined ? checkDate("opened_date", args.opened_date, true) : today();
      const coffee = { ...current };
      const bag = newBag(snap, coffee, {
        purchase_date: purchaseDate, bag_size_g: size, price_vnd: price, roast_date: roastDate, opened_date: openedDate,
      });
      const after = await write(token, { purchases: [bag], coffees: [withStored(snap, "coffees", coffee)] });
      const stored = after.state.coffees.find(c => c.id === coffee.id) || coffee;
      return "Sachet ajouté pour " + coffeeTitle(stored) + " : " + (bag.bag_size_g !== "" ? grams(bag.bag_size_g) : "taille inconnue") +
        (bag.price_vnd !== "" ? ", " + money(bag.price_vnd) : "") + ", acheté le " + bag.purchase_date +
        (bag.opened_date ? ", ouvert le " + bag.opened_date : ", pas encore ouvert") +
        (bag.roast_date ? ", torréfié le " + bag.roast_date : "") + ". Stock : " + stockText(after, stored) + ".";
    },

    async correct_stock(token, args) {
      const snap = await read(token);
      const found = findCoffee(snap, args.coffee);
      if (found.candidates) return candidatesText(args.coffee, found.candidates, true);
      const current = found.coffee;
      if (args.grams === undefined || args.grams === null || args.grams === "") throw new ToolError("Indique les grammes restants.");
      const g = Math.round(checkNumber("grams", args.grams, 0, 10000) * 10) / 10;
      const when = localMinute();
      const bag = snap.calcs.currentBag(current.id);
      let tables;
      if (!bag) {
        const coffee = { ...current };
        const created = newBag(snap, coffee, {
          purchase_date: when.slice(0, 10),
          bag_size_g: Number(coffee.bag_size_g) > 0 ? coffee.bag_size_g : Math.max(g, 1),
          price_vnd: coffee.price_vnd, roast_date: coffee.roast_date,
          remaining_g: g, remaining_at: when,
        });
        tables = { purchases: [created], coffees: [withStored(snap, "coffees", coffee)] };
      } else {
        const next = S.stampRow({ ...bag, remaining_g: g, remaining_at: when });
        tables = { purchases: [withStored(snap, "purchases", next)] };
      }
      const after = await write(token, tables);
      const stored = after.state.coffees.find(c => c.id === current.id) || current;
      return "Stock corrigé pour " + coffeeTitle(stored) + " : " + grams(g) + " le " + when.replace("T", " à ") +
        (bag ? "" : " (aucun sachet enregistré : un sachet a été créé pour porter le compte)") + ". Stock : " + stockText(after, stored) + ".";
    },

    async recent_cups(token, args) {
      const snap = await read(token);
      const limit = args.limit === undefined ? 10 : Math.round(checkNumber("limit", args.limit, 1, 50));
      let cups = snap.state.extractions;
      let scope = "";
      if (args.coffee !== undefined && String(args.coffee).trim() !== "") {
        const found = findCoffee(snap, args.coffee);
        if (found.candidates) return candidatesText(args.coffee, found.candidates, false);
        cups = cups.filter(e => e.coffee_id === found.coffee.id);
        scope = " avec " + coffeeTitle(found.coffee);
      }
      cups = [...cups].sort((a, b) => String(b.date_time).localeCompare(String(a.date_time))).slice(0, limit);
      if (!cups.length) return "Aucune tasse" + scope + ".";
      return "Dernières tasses" + scope + " (" + cups.length + ") :\n" + cups.map(e => cupLine(snap, e)).join("\n");
    },
  };

  /* Tool calls run one after the other: two writes never interleave their
     read and their write. */
  let queue = Promise.resolve();

  async function runTool(name, args) {
    const token = String(getToken() || "").trim();
    if (token) knownToken = token;
    const text = (message, isError) => ({ content: [{ type: "text", text: redact(message) }], isError: !!isError });
    if (!token) {
      return text("Le catalogue par MCP n'est pas encore configuré : aucun jeton trouvé (variable d'environnement LOGBOOK_TOKEN, " +
        "ou fichier .coffee-logbook\\token dans le dossier personnel). Pour l'activer, voir " + DOC_POINTER + ".", true);
    }
    if (token.length < MIN_TOKEN_LENGTH) {
      return text("Le jeton trouvé fait moins de " + MIN_TOKEN_LENGTH + " caractères : le site le refuserait. Voir " + DOC_POINTER + ".", true);
    }
    try {
      return text(await handlers[name](token, args && typeof args === "object" ? args : {}), false);
    } catch (error) {
      if (error instanceof ToolError) return text(error.message, true);
      log("tool " + name + " failed: " + redact(error && error.message));
      return text("Erreur inattendue dans l'outil " + name + " : " + (error && error.message) + ". Rien n'a été confirmé.", true);
    }
  }

  function callTool(name, args) {
    const run = queue.then(() => runTool(name, args));
    queue = run.catch(() => {});
    return run;
  }

  /* ---------- JSON-RPC ---------- */

  const reply = (id, result) => ({ jsonrpc: "2.0", id, result });
  const fail = (id, code, message) => ({ jsonrpc: "2.0", id: id === undefined ? null : id, error: { code, message } });

  async function handleMessage(msg) {
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) return fail(null, -32600, "Invalid Request");
    // A response to a request we never sent: nothing to say.
    if (typeof msg.method !== "string") return msg.id !== undefined && ("result" in msg || "error" in msg) ? null : fail(msg.id, -32600, "Invalid Request");
    const notification = !("id" in msg);
    const params = msg.params && typeof msg.params === "object" ? msg.params : {};
    switch (msg.method) {
      case "initialize":
        return reply(msg.id, {
          protocolVersion: typeof params.protocolVersion === "string" && params.protocolVersion ? params.protocolVersion : DEFAULT_PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "coffee-logbook", version },
          instructions: "Catalogue des cafés du carnet d'extraction de Chris : lire, ajouter et modifier des cafés, des sachets et le stock, " +
            "et lire les dernières tasses. Aucune suppression possible ; archive_coffee archive. Réponses en français.",
        });
      case "notifications/initialized":
      case "notifications/cancelled":
        return null;
      case "ping":
        return notification ? null : reply(msg.id, {});
      case "tools/list":
        return reply(msg.id, { tools: TOOLS });
      case "tools/call": {
        const name = params.name;
        if (!Object.prototype.hasOwnProperty.call(handlers, name)) return fail(msg.id, -32602, "Unknown tool: " + String(name));
        const result = await callTool(name, params.arguments);
        return notification ? null : reply(msg.id, result);
      }
      default:
        return notification ? null : fail(msg.id, -32601, "Method not found: " + msg.method);
    }
  }

  /* One line in, at most one line out. Unparseable JSON gets the standard
     parse error. The output goes through redact() one last time. */
  async function handleLine(line) {
    const trimmed = String(line).trim();
    if (!trimmed) return null;
    let msg;
    try { msg = JSON.parse(trimmed); } catch (error) { return redact(JSON.stringify(fail(null, -32700, "Parse error"))); }
    let response;
    try {
      response = await handleMessage(msg);
    } catch (error) {
      log("message failed: " + redact(error && error.message));
      response = msg && msg.id !== undefined ? fail(msg.id, -32603, "Internal error") : null;
    }
    return response ? redact(JSON.stringify(response)) : null;
  }

  return { handleMessage, handleLine, callTool, redact, tools: TOOLS, schema: app.CURRENT_SCHEMA };
}

/* ---------- stdio ---------- */

export function startStdio() {
  const log = message => process.stderr.write("[coffee-logbook] " + message + "\n");
  const server = createLogbookServer({ log, baseUrl: process.env.LOGBOOK_URL || DEFAULT_URL });
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  // The client went away: nothing left to answer. No explicit exit
  // otherwise, so the last answers are flushed before the process ends.
  process.stdout.on("error", () => process.exit(0));
  lines.on("line", async line => {
    const out = await server.handleLine(line);
    if (out) process.stdout.write(out + "\n");
  });
  log("ready, schema " + server.schema + (readToken() ? "" : ", no token yet (see DOCUMENTATION.md section 14)"));
}

const invokedDirectly = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) startStdio();
