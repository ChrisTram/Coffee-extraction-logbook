/* Tests of the catalog MCP server, no network, no file written.
 *
 *   node tools/logbook-mcp.test.mjs
 *
 * The server runs in-process against the REAL Worker (worker/index.js, so
 * the bearer check and handleSync) backed by a fake one-row D1. The token is
 * a fake value passed in memory. What is checked: the protocol, every tool,
 * that a write sends only its own rows and leaves the others and the
 * tombstones alone, and that the token never shows in any output. */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../worker/index.js";
import { createLogbookServer, loadApp, readToken, checkedBaseUrl, DEFAULT_PROTOCOL, TOOLS } from "./logbook-mcp.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
function check(label, condition, detail) {
  if (!condition) failures += 1;
  console.log(`${condition ? "OK  " : "FAIL"} ${label}${!condition && detail ? ` -> ${detail}` : ""}`);
}

const TOKEN = "fake-test-token-0123456789abcdefghijklmnopqrstuv";
const T = Date.now() - 3600000;
const seed = {
  schema: 23,
  tables: {
    coffees: [
      { id: "c1", updated_at: T, name: "Ethiopia Guji", roaster: "Shin", roast: "Claire", process: "Nature", bag_size_g: 200, price_vnd: 150000, active: 1, added_date: "2026-09-01" },
      { id: "c2", updated_at: T, name: "Ethiopia Sidamo", roaster: "Shin", roast: "Claire", process: "Lavé", bag_size_g: 200, active: 1, added_date: "2026-09-01" },
      { id: "c3", updated_at: T, name: "Kenya AA", roaster: "Là Việt", active: 0, added_date: "2026-08-01" },
    ],
    extractions: [
      { id: "e1", updated_at: T, date_time: "2026-09-20T08:15", coffee_id: "c1", method: "Switch", recipe: "Switch 1:15",
        dose_g: 15, water_g: 225, grind_dial: "1.5.0", temperature_c: 92, total_time_s: 190, score_10: 8,
        descriptors: "fruité, sucré", comment: "très bon" },
      { id: "e2", updated_at: T, date_time: "2026-09-21T08:15", coffee_id: "c2", method: "Brikka", recipe: "Brikka classique",
        dose_g: 16, water_g: 150, score_10: 6 },
    ],
    recipes: [
      { id: "r1", updated_at: T, name: "Switch 1:15", method: "Switch", dose: 15, water: 225, active: 1 },
      { id: "r2", updated_at: T, name: "Brikka classique", method: "Brikka", dose: 16, water: 150, active: 1 },
      { id: "r3", updated_at: T, name: "Recette cachée", method: "Switch", dose: 15, water: 225, active: 0 },
    ],
    cups: [],
    purchases: [],
    settings: [{ id: "moi", updated_at: T, dose_g: 15, schema_version: 23 }],
  },
  tombstones: { coffees: { gone: T - 1000 }, extractions: { e0: T - 2000 }, recipes: {}, cups: {}, purchases: {}, settings: {} },
};

function makeDb(doc) {
  const docs = new Map([["state", JSON.stringify(doc)]]);
  return {
    docs,
    exec: async () => {},
    prepare: sql => ({
      bind: (...args) => ({
        first: async () => (docs.has(args[0]) ? { payload: docs.get(args[0]) } : null),
        run: async () => { if (/^INSERT/.test(sql)) docs.set(args[0], args[1]); },
      }),
    }),
  };
}

const app = loadApp();
const outputs = [];
const logs = [];
const requests = [];

function makeServer({ db, token, envToken, fetchOverride }) {
  const env = {
    AUTH_USERNAME: "Chris", AUTH_PASSWORD: "correct-horse", AUTH_SECRET: "signing-key-for-tests",
    ASSETS: { fetch: async () => new Response("site") },
    DB: db, TOOLS_TOKEN: envToken === undefined ? TOKEN : envToken,
  };
  const fetch = fetchOverride || (async (url, init) => {
    requests.push({ url, method: init.method, body: JSON.parse(init.body) });
    return worker.fetch(new Request(url, init), env);
  });
  return createLogbookServer({
    app, fetch, getToken: () => token, baseUrl: "https://site.test", version: "test",
    log: line => logs.push(line),
  });
}

const stored = db => JSON.parse(db.docs.get("state"));
const rowOf = (db, table, id) => stored(db).tables[table].find(r => r.id === id);
async function call(server, name, args) {
  const res = await server.handleMessage({ jsonrpc: "2.0", id: outputs.length + 1, method: "tools/call", params: { name, arguments: args } });
  outputs.push(JSON.stringify(res));
  const result = res.result || {};
  return { text: (result.content && result.content[0] && result.content[0].text) || "", isError: !!result.isError, raw: res };
}

const db = makeDb(seed);
const server = makeServer({ db, token: TOKEN });

// 1. Protocol
{
  const init = await server.handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
  outputs.push(JSON.stringify(init));
  check("initialize echoes the client's protocol version", init.result.protocolVersion === "2025-03-26");
  check("initialize names the server coffee-logbook", init.result.serverInfo.name === "coffee-logbook");
  check("initialize announces the tools capability", !!init.result.capabilities.tools);
  const bare = await server.handleMessage({ jsonrpc: "2.0", id: 2, method: "initialize", params: {} });
  check("without a client version, 2025-06-18", bare.result.protocolVersion === DEFAULT_PROTOCOL && DEFAULT_PROTOCOL === "2025-06-18");
  check("notifications/initialized gets no answer",
    (await server.handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" })) === null);
  const ping = await server.handleMessage({ jsonrpc: "2.0", id: 3, method: "ping" });
  check("ping answers an empty result", ping.id === 3 && JSON.stringify(ping.result) === "{}");
  const unknown = await server.handleMessage({ jsonrpc: "2.0", id: 4, method: "resources/list" });
  check("an unknown method gets -32601", unknown.error && unknown.error.code === -32601);
  const parse = JSON.parse(await server.handleLine("{not json"));
  check("unreadable JSON gets -32700", parse.error && parse.error.code === -32700 && parse.id === null);
  const badTool = await server.handleMessage({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "delete_coffee", arguments: {} } });
  check("an unknown tool gets -32602", badTool.error && badTool.error.code === -32602);

  const list = await server.handleMessage({ jsonrpc: "2.0", id: 6, method: "tools/list" });
  const names = list.result.tools.map(t => t.name);
  check("tools/list gives the eight tools",
    JSON.stringify(names) === JSON.stringify(["list_coffees", "get_coffee", "add_coffee", "edit_coffee", "archive_coffee", "add_bag", "correct_stock", "recent_cups"]),
    names.join());
  check("no delete tool", !names.some(n => /delete|remove/.test(n)));
  check("every tool has a description and an object schema",
    list.result.tools.every(t => t.description && t.inputSchema && t.inputSchema.type === "object"));
  check("add_coffee requires the name", JSON.stringify(TOOLS.find(t => t.name === "add_coffee").inputSchema.required) === '["name"]');
  check("the server sends the app's schema", server.schema === 23);
}

// 2. Reading
{
  requests.length = 0;
  const r = await call(server, "list_coffees", {});
  check("list_coffees lists the active coffees", !r.isError && r.text.includes("Ethiopia Guji") && r.text.includes("Ethiopia Sidamo"), r.text);
  check("but not the archived one by default", !r.text.includes("Kenya AA"));
  check("a read is one POST with an empty payload at the app schema",
    requests.length === 1 && requests[0].method === "POST" && requests[0].body.schema === 23 &&
    Object.keys(requests[0].body.tables).length === 0 && Object.keys(requests[0].body.tombstones).length === 0);
  check("the call goes to the tools endpoint", requests[0].url === "https://site.test/api/tools/sync");
  const all = await call(server, "list_coffees", { include_archived: true });
  check("include_archived shows the archived coffee", all.text.includes("Kenya AA") && all.text.includes("archivé"));
  check("the document is untouched by reads", JSON.stringify(stored(db).tables) === JSON.stringify(seed.tables) &&
    JSON.stringify(stored(db).tombstones) === JSON.stringify(seed.tombstones));

  const one = await call(server, "get_coffee", { coffee: "ethiopia GUJI" });
  check("get_coffee by name, case-insensitive", !one.isError && one.text.includes("[id c1]") && one.text.includes("Tasses : 1"), one.text);
  const accent = await call(server, "get_coffee", { coffee: "la viet" });
  check("get_coffee ignores accents", accent.text.includes("[id c3]"), accent.text);
  const byId = await call(server, "get_coffee", { coffee: "c2" });
  check("get_coffee by id", byId.text.includes("Ethiopia Sidamo"));
  const amb = await call(server, "get_coffee", { coffee: "ethiopia" });
  check("an ambiguous name returns the candidates", !amb.isError && amb.text.includes("Plusieurs cafés") &&
    amb.text.includes("[id c1]") && amb.text.includes("[id c2]"), amb.text);
  const none = await call(server, "get_coffee", { coffee: "Panama" });
  check("an unknown name is a clear error", none.isError && none.text.includes("Aucun café"));

  const cups = await call(server, "recent_cups", {});
  check("recent_cups lists the last cups, newest first", cups.text.indexOf("Ethiopia Sidamo") < cups.text.indexOf("Ethiopia Guji") &&
    cups.text.includes("note 8/10") && cups.text.includes("mouture 1.5.0") && cups.text.includes("92 °C") &&
    cups.text.includes("temps 3:10") && cups.text.includes("fruité, sucré") && cups.text.includes("très bon"), cups.text);
  const cupsOne = await call(server, "recent_cups", { coffee: "guji", limit: 5 });
  check("recent_cups for one coffee", cupsOne.text.includes("Ethiopia Guji") && !cupsOne.text.includes("Brikka classique"), cupsOne.text);
}

// 3. Ambiguity and refusals write nothing
{
  const before = JSON.stringify(stored(db).tables);
  requests.length = 0;
  const amb = await call(server, "edit_coffee", { coffee: "ethiopia", process: "Honey" });
  check("an ambiguous edit does nothing", amb.text.includes("rien n'a été modifié") && JSON.stringify(stored(db).tables) === before);
  check("and sends no row", requests.every(r => Object.keys(r.body.tables).length === 0));
  const recipe = await call(server, "add_coffee", { name: "Brésil Cerrado", recommended_recipe: "Inexistante" });
  check("an unknown recipe is refused", recipe.isError && recipe.text.includes("Recette inconnue"), recipe.text);
  check("listing the recipe names", recipe.text.includes("Switch 1:15") && recipe.text.includes("Brikka classique"));
  check("only the live ones", !recipe.text.includes("Recette cachée"));
  const dup = await call(server, "add_coffee", { name: "ethiopia guji", roaster: "SHIN" });
  check("a duplicate active coffee is refused", dup.isError && dup.text.includes("existe déjà"), dup.text);
  const badDate = await call(server, "add_coffee", { name: "Brésil", roast_date: "2026-02-31" });
  check("an impossible date is refused", badDate.isError && badDate.text.includes("Date invalide"));
  const badRoast = await call(server, "add_coffee", { name: "Brésil", roast: "Blonde" });
  check("an unknown roast is refused", badRoast.isError && badRoast.text.includes("Claire, Medium, Foncée"));
  check("none of the refusals wrote anything", JSON.stringify(stored(db).tables) === before);
}

// 4. add_coffee, add_bag, list_coffees: 250 g remaining
let newId = "";
{
  requests.length = 0;
  const today = app.DATA_SCHEMA.localDateToday();
  const add = await call(server, "add_coffee", { name: "Colombia Huila", roaster: "Shin", roast: "medium", process: "Lavé",
    bag_size_g: 250, price_vnd: 180000, recommended_method: "Switch", recommended_recipe: "switch 1:15", pre_ground: false });
  check("add_coffee succeeds", !add.isError && add.text.includes("Café ajouté"), add.text);
  newId = (/\[id (c[^\]]+)\]/.exec(add.text) || [])[1] || "";
  const row = rowOf(db, "coffees", newId);
  check("the coffee is stored with an app id", !!row && /^c[a-z0-9]{6,}$/.test(newId), newId);
  check("normalised like the app (roast and recipe canonical, added today, active)",
    row && row.roast === "Medium" && row.recommended_recipe === "Switch 1:15" && row.added_date === today && row.active === 1 &&
    row.pre_ground === 0 && row.real_coffee_pct === 100, JSON.stringify(row));
  check("stamped now", row && row.updated_at > T && Math.abs(row.updated_at - Date.now()) < 60000);
  const write = requests.filter(r => Object.keys(r.body.tables).length)[0];
  check("the write sends only the new row", write && write.body.tables.coffees.length === 1 &&
    Object.keys(write.body.tables).join() === "coffees" && Object.keys(write.body.tombstones).length === 0, JSON.stringify(write && write.body));
  check("the other rows are untouched", JSON.stringify(stored(db).tables.coffees.filter(c => c.id !== newId)) === JSON.stringify(seed.tables.coffees) &&
    JSON.stringify(stored(db).tables.extractions) === JSON.stringify(seed.tables.extractions));
  check("the tombstones are untouched", JSON.stringify(stored(db).tombstones) === JSON.stringify(seed.tombstones));
  check("a read and a write, nothing else", requests.length === 2 && requests.every(r => r.method === "POST"));

  const bag = await call(server, "add_bag", { coffee: "colombia", bag_size_g: 250 });
  check("add_bag succeeds", !bag.isError && bag.text.includes("Sachet ajouté") && bag.text.includes("ouvert le " + today), bag.text);
  const bags = stored(db).tables.purchases;
  check("one bag stored, opened today, bought today", bags.length === 1 && bags[0].coffee_id === newId &&
    bags[0].opened_date === today && bags[0].purchase_date === today && /^a/.test(bags[0].id), JSON.stringify(bags));
  check("the coffee follows its bag like addPurchase (size, price, roast date)", rowOf(db, "coffees", newId).bag_size_g === 250 &&
    rowOf(db, "coffees", newId).price_vnd === 180000 && rowOf(db, "coffees", newId).roast_date === "");

  const list = await call(server, "list_coffees", {});
  const line = list.text.split("\n").find(l => l.includes("Colombia Huila")) || "";
  check("list_coffees shows 250 g remaining", line.includes("reste 250 g sur 250 g"), line);
  check("and the opening date", line.includes("ouvert le " + today), line);
  check("and the recommended method and recipe", line.includes("méthode Switch") && line.includes("Switch 1:15"), line);

  const withBag = await call(server, "add_coffee", { name: "Guatemala", roaster: "Shin", bag_size_g: 340, opened_today: true });
  const gid = (/\[id (c[^\]]+)\]/.exec(withBag.text) || [])[1];
  check("add_coffee with opened_today also creates the first bag",
    stored(db).tables.purchases.some(p => p.coffee_id === gid && p.opened_date === today && p.bag_size_g === 340) &&
    withBag.text.includes("reste 340 g"), withBag.text);
}

// 5. edit_coffee touches one field
{
  const before = rowOf(db, "coffees", newId);
  const others = JSON.stringify(stored(db).tables.coffees.filter(c => c.id !== newId));
  const edit = await call(server, "edit_coffee", { coffee: newId, process: "Honey" });
  const after = rowOf(db, "coffees", newId);
  const changed = Object.keys(after).filter(k => JSON.stringify(after[k]) !== JSON.stringify(before[k])).sort();
  check("edit_coffee changes only the field asked and the stamp", !edit.isError && changed.join() === "process,updated_at", changed.join());
  check("the new value is stored", after.process === "Honey" && after.updated_at > before.updated_at);
  check("the summary shows the change", edit.text.includes("Lavé → Honey"), edit.text);
  check("the other coffees did not move", JSON.stringify(stored(db).tables.coffees.filter(c => c.id !== newId)) === others);
  const same = await call(server, "edit_coffee", { coffee: newId, process: "honey".replace("h", "H") });
  check("an edit with nothing new writes nothing", same.text.includes("Aucun changement") && rowOf(db, "coffees", newId).updated_at === after.updated_at);
  const clash = await call(server, "edit_coffee", { coffee: newId, name: "Ethiopia Guji" });
  check("renaming onto another active coffee is refused", clash.isError && rowOf(db, "coffees", newId).name === "Colombia Huila");
}

// 6. correct_stock
{
  const fix = await call(server, "correct_stock", { coffee: "Colombia Huila", grams: 120 });
  check("correct_stock succeeds", !fix.isError && fix.text.includes("Stock corrigé"), fix.text);
  const bag = stored(db).tables.purchases.find(p => p.coffee_id === newId);
  check("the count lands on the current bag, at the minute", bag.remaining_g === 120 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(bag.remaining_at), JSON.stringify(bag));
  check("no new bag when one exists", stored(db).tables.purchases.filter(p => p.coffee_id === newId).length === 1);
  const list = await call(server, "list_coffees", {});
  const line = list.text.split("\n").find(l => l.includes("Colombia Huila")) || "";
  check("list_coffees then shows 120 g", line.includes("reste 120 g sur 250 g"), line);
  const noBag = await call(server, "correct_stock", { coffee: "c2", grams: 80 });
  const created = stored(db).tables.purchases.find(p => p.coffee_id === "c2");
  check("without a bag, one is created to hold the count, like the app", !noBag.isError && created && created.remaining_g === 80 &&
    created.bag_size_g === 200, JSON.stringify(created));
  const negative = await call(server, "correct_stock", { coffee: "c2", grams: -5 });
  check("a negative count is refused", negative.isError);
}

// 7. archive_coffee
{
  const arch = await call(server, "archive_coffee", { coffee: "Colombia Huila" });
  check("archive_coffee succeeds", !arch.isError && arch.text.includes("Café archivé"), arch.text);
  check("the coffee is kept, inactive", rowOf(db, "coffees", newId).active === 0);
  const list = await call(server, "list_coffees", {});
  check("an archived coffee leaves the default list", !list.text.includes("Colombia Huila"));
  const again = await call(server, "archive_coffee", { coffee: newId });
  check("archiving twice writes nothing", again.text.includes("déjà archivé"));
  const back = await call(server, "edit_coffee", { coffee: newId, active: true });
  check("edit_coffee active true brings it back", !back.isError && rowOf(db, "coffees", newId).active === 1);
}

// 8. No token: a clear message, no call
{
  let calls = 0;
  const bare = makeServer({ db, token: "", fetchOverride: async () => { calls++; throw new Error("no"); } });
  const r = await call(bare, "list_coffees", {});
  check("without a token, a French message pointing to the documentation",
    r.isError && r.text.includes("pas encore configuré") && r.text.includes("DOCUMENTATION.md"), r.text);
  const w = await call(bare, "add_coffee", { name: "X" });
  check("for every tool, writes included", w.isError && w.text.includes("pas encore configuré"));
  check("and no network call at all", calls === 0);
  const list = await bare.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  check("tools/list still works without a token", list.result.tools.length === 8);
}

// 9. Server side refusals
{
  const off = makeServer({ db, token: TOKEN, envToken: "" });
  const r = await call(off, "list_coffees", {});
  check("feature off on the site: a clear message", r.isError && r.text.includes("TOOLS_TOKEN"), r.text);
  const OTHER = "another-fake-token-9876543210zyxwvutsrqponmlk";
  const wrong = makeServer({ db, token: OTHER });
  const w = await call(wrong, "list_coffees", {});
  check("a wrong token: the site refuses, said plainly", w.isError && w.text.includes("refuse le jeton"), w.text);
  check("without ever repeating that token", !w.text.includes(OTHER) && !outputs.join("").includes(OTHER));
  const newer = makeDb({ ...seed, schema: 24 });
  const ahead = makeServer({ db: newer, token: TOKEN });
  const a = await call(ahead, "add_coffee", { name: "Y" });
  check("a document newer than the tool: refused, nothing written", a.isError && a.text.includes("plus récente") &&
    !stored(newer).tables.coffees.some(c => c.name === "Y"), a.text);
  const short = makeServer({ db, token: "short-token" });
  const s = await call(short, "list_coffees", {});
  check("a token under 32 characters is caught before any call", s.isError && s.text.includes("32 caractères"));
}

// 10. The token never shows
{
  const leaky = makeServer({ db, token: TOKEN, fetchOverride: async () =>
    new Response(JSON.stringify({ error: "echo " + TOKEN }), { status: 500, headers: { "Content-Type": "application/json" } }) });
  const r = await call(leaky, "list_coffees", {});
  check("an error that would carry the token is masked", r.isError && !r.text.includes(TOKEN) && r.text.includes("jeton masqué"), r.text);
  const line = await server.handleLine(JSON.stringify({ jsonrpc: "2.0", id: 99, method: "tools/call", params: { name: "get_coffee", arguments: { coffee: TOKEN } } }));
  outputs.push(line);
  check("even when the token is typed as an argument", !line.includes(TOKEN));
  check("the token never appears in any output", !outputs.join("\n").includes(TOKEN));
  check("nor in any log line", !logs.join("\n").includes(TOKEN));
  check("the token travels only in the Authorization header, never in a body",
    requests.every(r => !JSON.stringify(r.body).includes(TOKEN)));
}

// 11. Configuration helpers (no file is read or written here)
{
  check("the token comes from LOGBOOK_TOKEN first", readToken({ LOGBOOK_TOKEN: "  \uFEFFabc  " }, join(ROOT, "no-such-home")) === "abc");
  check("no variable and no file: no token", readToken({}, join(ROOT, "no-such-home")) === "");
  check("https is accepted", checkedBaseUrl("https://example.test/") === "https://example.test");
  check("plain http to a remote host is refused", checkedBaseUrl("http://example.test") === null);
  check("plain http to localhost is accepted", checkedBaseUrl("http://127.0.0.1:8787") === "http://127.0.0.1:8787");
  check("the default address is the site's", checkedBaseUrl(undefined) === "https://coffee-extraction-logbook.lysstudio-contact.workers.dev");
}

// 12. Registration files: the server, never a secret
{
  for (const file of [join(ROOT, ".mcp.json"), join(ROOT, "..", ".mcp.json")]) {
    const ok = existsSync(file);
    const text = ok ? readFileSync(file, "utf8") : "";
    let entry = null;
    try { entry = JSON.parse(text).mcpServers["coffee-logbook"]; } catch (error) { entry = null; }
    const script = entry && entry.args && entry.args[0];
    check(file.replace(ROOT, "tracker") + " declares the stdio server",
      !!entry && entry.command === "node" && /tools\/logbook-mcp\.mjs$/.test(String(script).replace(/\\/g, "/")) && existsSync(script), text);
    check(file.replace(ROOT, "tracker") + " carries no token and no env", !/token|secret|"env"/i.test(text));
  }
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
