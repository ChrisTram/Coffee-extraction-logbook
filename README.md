# Brew journal: Brikka and Switch

**A notebook for two coffee makers, a grinder and a shelf of Vietnamese beans.
It records what you brewed, then tells you which of your settings actually
makes a better cup.**

Brewing at home produces a number of small decisions every morning: dose, grind
dial, water temperature, flame, which recipe, which bean, how long. Tasting
notes on paper never survive the comparison stage, because comparing means
holding thirty cups in your head at once. This site does that part. You log a
cup in about twenty seconds, and it keeps the arithmetic.

It is built around one specific setup, and it does not pretend otherwise: a
Bialetti **Brikka** (pressure moka), a Hario **Switch** (immersion and
percolation in one dripper), a **Timemore C5** hand grinder, and coffee bought
in Vietnam. Recipes, grind conversions, warnings and vocabulary are all written
for that kit. Everything is editable, so another setup is a matter of rewriting
the recipes and the coffees, not the code.

It is a single HTML page. No install, no build, no framework, no account, no
tracking, no network needed. Your data stays in CSV files on your own disk.

## What it does

- **Log a cup.** One required field, the dose. Everything else is optional and
  pre-filled from the chosen recipe: water, temperature, grind, flame. A timer
  with the recipe's stages runs beside the form, and works out the drawdown on
  its own. Quick entry on the phone asks three things: coffee, recipe, score.
- **Tell you what works.** The dashboard reads your history and writes plain
  sentences: this recipe beats that one on this bean, this flame setting suits
  you, your cups are better in the first week after opening the bag. Each one
  shows the two averages it compares, how many cups are behind them, and
  whether the gap is solid or merely likely. When nothing is solid enough, it
  stays quiet rather than inventing a trend.
- **Keep the recipes straight.** Eleven verified recipes ship with the site
  (three Brikka, eight Switch), each with its settings, its step-by-step, what
  it is good for, and which of your coffees suit it. Yours can be added, and
  the originals restored in one click.
- **Convert your grind.** One engine for the whole site: dial position, clicks,
  microns, and the range each brewing method wants, from the official Timemore
  diagram, redrawn as an SVG chart in the Guide.
- **Follow your beans.** Bags, prices, freshness windows, cost per cup, and the
  percentage of real coffee for the blends sold in Vietnam, with a warning when
  a cup would go through paper it should not.
- **Work everywhere, offline.** Installable as an app on the phone, usable with
  no connection, and syncable between devices if you host it yourself.

## The six screens

| Screen | What you do there |
|---|---|
| **Dashboard** | The last cup in full, the key figures, the 30-day chart, the activity calendar, and what your data says |
| **New brew** | The form and the timer, with the recipe and the coffee card beside them |
| **History** | Every cup, filterable and sortable, with a detail card on hover, a comparator and a CSV export |
| **My best settings** | The best combination found for each coffee, and what is still missing to conclude |
| **Guide** | Recipes, grinder converter, taste diagnosis, vocabulary, shops and buying list |
| **Settings** | Defaults, language, data, and everything else |

## Where your data lives

Your data never goes online. It lives in CSV files on your disk and in your
browser's local storage. The server, when you use one, only checks your
password and serves the site's files.

Hosted, the site sits at a private address behind a single username and
password. A session lasts 30 days, so in practice you almost never retype it.
Locally, over `file://`, there is no login at all: double-clicking
`index.html` opens the site directly. To sign out of a device, go to `/logout`.
If you lose a phone, change the `AUTH_SECRET` secret in Cloudflare and every
open session drops at once.

## Getting around

On a desktop, a fixed rail on the left carries the six screens, a **New cup**
button, the sync status and the language, theme and **Data** buttons. Under
1024px the rail becomes a **More** sheet that slides up from the bottom, and a
bottom bar takes the three screens you use daily. The floating button for quick
entry only exists on the phone; on a desktop, New cup opens the full form.

## French or English

The EN / FR button in the rail switches the whole interface, including the
Guide, the charts, the warnings and the messages. French is the default and the
choice is remembered. Taste descriptors and diagnoses are translated on display
only: the values stored in the CSV files stay in French, so your data does not
move by a single byte when you switch languages. The contents of your recipes
and coffees (names, steps, notes) are yours and show exactly as you wrote them.
The whole translation layer lives in `js/i18n.js` and `js/i18n.en.js`.

## Quick start

1. Double-click `index.html`, or drag it into Chrome.
2. On first launch you get three choices:
   - **Create a data folder**: pick a folder on your disk. The site creates
     `cafes.csv` and `extractions.csv` there with your 5 starting coffees, then
     writes to them on every add or edit.
   - **Open an existing folder**: pick up a folder that already holds those
     files.
   - **Load the demo**: 65 brews over 6 weeks, to explore the site.

## Linking the CSV folder

The **Data** button, at the foot of the rail, creates or opens a data folder at
any time. Once linked, a badge shows its name next to the sync status, and every
save is written straight to the CSV files. Chrome asks for write permission
again on the first action after each reopen. That is normal, that is its
security model.

**Import a CSV** and **Export to CSV** live in that same Data panel, so they are
never more than two gestures away from any screen. The History screen also has
its own export button, which respects the filters currently applied.

The CSV files stay readable and editable in a spreadsheet (Excel, LibreOffice,
Google Sheets). If you edit them by hand, reopen the folder through Data, Open
an existing folder, to reload.

## Moving from the demo to your real data

Two ways:

- **Data, Create a data folder**: drops the demo and starts again from your 5
  starting coffees and zero brews, in real files.
- **Data, Import a CSV**: if you already have your own files, import them one at
  a time. The site works out on its own whether a file is a coffees table or a
  brews table, and replaces the matching one.

The **Demo** badge disappears as soon as you leave the demo set. The files in
`demo/` are a copy of the embedded demo, editable in a spreadsheet if you want
to see the expected format.

## Everything is edited in the interface

- **Coffees**: the pencil next to the coffee menu on the New brew screen. Add,
  edit, activate.
- **Recipes**: the Manage recipes button in the Guide, or the Edit button on any
  recipe card. Everything is editable, including the step-by-step (one per line,
  `0:45 text` for a timed step, `- text` otherwise). The original recipes can be
  restored to their verified version in one click, and your own recipes are free
  to add. Renaming a recipe updates the history and the coffees that recommend
  it.
- Recipes live in a third file, `recettes.csv`, alongside the other two.

Eleven recipes ship with the site: three for the Brikka (classic, classic with
preheated water, and one milk recipe covering both flat white and cappuccino)
and eight for the Switch.

## Quick entry

The floating button opens a sheet that rises from the bottom, on the phone. Three
things: coffee, recipe, score. The date is set to now, and the dose, water,
temperature and grind are taken from the recipe, with the actual figures shown
so you can see what you are about to save. For the detail (timer, diagnosis,
descriptors) the Full entry link sits right beside it.

## Required fields and pre-ground coffees

Only one field is required, the dose, marked with a red star. Everything else is
optional, including the coffee and the date, which fills itself with the current
time if left empty.

A coffee can be marked "pre-ground" in its card. The grind field then switches
off and shows "bag default": the dial does not apply, no value is stored, and
the history shows "bag default" instead of a setting. Those brews stay out of
the score-against-grind scatter, which is deliberate: they say nothing about
your grinder.

## If folder linking does not work

The File System Access API exists in Chrome and Edge. Firefox does not offer it,
and Brave disables it by default (turn it on in brave://flags, search for File
System Access API). The site detects this, explains it in the Data panel, and
keeps working in browser mode: everything is kept in IndexedDB, with Import and
Export CSV for backups.

## The timer

The timer lives in the right-hand column of the New brew screen, folded under
the recipe card, and opens with a click on its header. The elapsed time stays
readable while folded, and it opens itself when you start it and refuses to fold
away while it runs.

Start, Pause, Resume as often as you like, Stop and report, Reset. The selected
recipe's stages show below it, current stage large and next one small with a
countdown, with a soft beep at each stage that a checkbox turns off. Drawdown is
worked out on its own, from the "open" stage to the moment you stop the timer.

## Coffees that are not pure

Every coffee carries a percentage of real coffee (the thành phần line on the
label). Below 100 the coffee gets a warning dot, the site warns you against
brewing it in the Switch (the paper would hold back the soy, the sugar and the
fats), and the cost per cup shows a second figure scaled to the real coffee.

## Conversion basis

The whole site works in 8.32 microns per click (the official Timemore diagram),
so 416 microns per rotation and a stop at 1248 microns. The official diagram is
rebuilt as SVG in the Guide, with the 13 methods, the particle-size bands, the
hatched out-of-reach zone and your four markers.

## During full entry

The right-hand column always shows the selected recipe (settings, steps, access
to the step-by-step) and the coffee card (profile, stated notes,
recommendations, price per gram, age since roasting with the freshness window).
Temperature is optional: with no thermometer, water that has just boiled and
stopped bubbling is around 95 degrees. The volume field offers a clickable
estimate worked out from the water, the dose and the method (the Switch paper
holds about 2 g of water per gram of coffee, the Brikka noticeably less).

## Diagnosis and descriptors: why two separate fields

The diagnosis answers "what do I fix" (one choice, with its correction shown);
the descriptors answer "what do I taste" (multi-select, arranged by the families
of the SCA flavour wheel). Merging them would make the diagnosis ring
unreadable: it measures the health of your brews, not your taste.

## Design choices, and why

- **Three CSV files rather than one with a type column**: the tables share no
  columns at all. A single file would have mixed the schemas, with empty columns
  everywhere, painful to edit in a spreadsheet.
- **Linking a folder rather than two separate files**: one gesture instead of
  two, and the site finds both files by name. That is the File System Access API
  (Chrome, Edge). The working copy in IndexedDB is always up to date, so nothing
  is lost if the folder is not linked or the permission expires.
- **Chart.js bundled in `js/vendor/`** instead of a CDN: the site works with no
  connection, in the kitchen, on a phone. The calendar heatmap and the grind
  ruler are hand-written SVG, because no light library does them well.
- **The two fonts are in the repository** (`css/fonts/`, Instrument Serif and
  Manrope, both OFL). Same reason: a CDN link would show the fallback on the
  first offline open and then flash when the real font arrived.
- **The demo embedded as JS** (`js/demo-data.js`) alongside the CSV files in
  `demo/`: Chrome blocks `fetch` on local files over `file://`, so the demo has
  to live in the code to load in one click.
- **The method colours everything**: Brikka blue `#2a78d6`, Switch orange
  `#eb6834`, both machines pink `#cc79a7`, in every chart, chip and dot. These
  are colour-blind safe and do not change between themes.
- **No green anywhere**, including for "good". Favourable states take the terra
  cotta accent, unfavourable ones keep red. A test refuses the whole green band
  of the hue circle.
- **The converter and the entry form share one engine** (`js/grind.js`): one
  range table, one formula, so the entry warning and the reference page can
  never disagree.

## Small extras

- Duplicate a brew in one click from the history, to make the same one again.
- Hovering a history row shows everything the row has no column for: drawdown,
  temperature, volumes, cup, cost, all the tasting notes.
- The Tetsu 4:6 step-by-step recalculates itself from the chosen variants.
- The cost of the cup shows live during entry, as soon as the coffee has a price
  and a format.
- Three palettes, remembered: a light one, and two darks, Graphite (near-black
  and neutral, crema accent) and Night (deep ink blue, copper accent). The
  theme button cycles through them.
- The Guide carries the shops, the buying list with links, the buying rules, the
  equipment care and the Vietnamese messages, each with a Copy button.

## Folder structure

```
tracker/
  index.html            the single page, all the static HTML
  css/socle.css         fonts, tokens (dark and light themes), base, navigation
  css/ecrans.css        the screens
  css/fenetres.css      dialogs, guide, quick entry, tooltips
  css/finitions.css     responsive and last overrides, loaded LAST
  css/fonts/            the two bundled fonts, woff2, under the OFL
  js/outils.js          shared pure functions (average, dates, version)
  js/i18n.js            translation, French half and the mechanism
  js/i18n.en.js         English pack, loaded on demand
  js/grind.js           grinder conversions (dial, clicks, microns, ranges)
  js/recettes.js        starting recipes and coffees, warning rules
  js/sync.js            device-to-device sync, client side
  js/data*.js           CSV, IndexedDB, File System Access, migrations, maths
  js/reglages.js        best settings per coffee, pure calculation
  js/charts.js          Chart.js charts (on demand), SVG heatmap and ruler
  js/ui-noyau.js        shared interface tools, theme, navigation
  js/ui-constats.js     the computed insights and their carousel
  js/ui-derniere.js     the last cup card
  js/ui-tableau.js      dashboard: calendar, analyses, recent cups
  js/ui-saisie.js       form and timer
  js/ui-saisie-aside.js the entry side panel and twin cups
  js/ui-pilules.js      diagnostic and taste pills
  js/ui-brouillon.js    entry draft (localStorage)
  js/ui-rapide.js       quick entry sheet
  js/ui-historique.js   history, filters, comparator, best settings
  js/ui-guide.js        recipes, grinder, step-by-step
  js/ui-catalogue.js    coffees, bags, editable recipes, settings screen
  js/app.js             startup and global wiring
  js/demo-data.js       the embedded demo, loaded on demand
  js/vendor/chart.umd.js   Chart.js 4.4.4, local, no network dependency
  sw.js, manifest.json, icons/   installable PWA, offline
  worker/               login gate and Cloudflare sync (online only)
  demo/                 the same demo data as editable CSV
  tools/                tests and generators
```

The full technical documentation is in `DOCUMENTATION.md`, the decisions and
their reasoning in `DECISIONS.md`, the version history in `CHANGELOG.md`. Those
three are in French, like the code comments and the interface; this README is in
English because the repository is public.

Backup: the linked data folder holds everything that is yours. Copying it is
backing it up.
