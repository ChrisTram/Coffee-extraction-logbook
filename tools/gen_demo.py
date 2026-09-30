# Demo dataset generator. Run once only, frozen output.
# Absolute rule: no em dash or en dash in the outputs.
import csv, io, random, datetime

random.seed(42)

TODAY = datetime.date(2026, 8, 9)
START = TODAY - datetime.timedelta(days=41)  # 6 weeks

COFFEES = [
    {
        "id": "c1", "name": "Trung Nguyên Sáng Tạo 4", "roaster": "Trung Nguyên",
        "origin": "Buôn Ma Thuột, Vietnam", "species": "Blend Arabica, Robusta, Excelsa, Catimor",
        "process": "Torréfaction traditionnelle avec additifs", "roast": "Foncée",
        "pre_ground": 1, "real_coffee_pct": 82, "tag": "café aromatisé",
        "roaster_notes": "Corps rond, sucré, faible acidité, arôme persistant. Étiquette : café 82 pour cent, soja torréfié, sirop de sucre brun, substitut de beurre, arômes de synthèse, beurre.",
        "bag_size_g": 340, "price_vnd": 148800, "roast_date": "2026-05-20",
        "recommended_method": "Brikka", "recommended_recipe": "Brikka classique", "active": 1,
    },
    {
        "id": "c2", "name": "Bana Cofe G4", "roaster": "Bana Cofe",
        "origin": "Vietnam", "species": "Robusta",
        "process": "Rang bơ", "roast": "Foncée",
        "pre_ground": 1, "real_coffee_pct": 100, "tag": "",
        "roaster_notes": "Beurre, caramel, sucre roux, déjà moulu",
        "bag_size_g": 250, "price_vnd": 87000, "roast_date": "2026-06-15",
        "recommended_method": "Brikka", "recommended_recipe": "Brikka classique", "active": 1,
    },
    {
        "id": "c3", "name": "Cà Phê Mít Liberica", "roaster": "Fine Coffee Agency",
        "origin": "Vietnam", "species": "Liberica",
        "process": "Natural", "roast": "Medium",
        "pre_ground": 0, "real_coffee_pct": 100, "tag": "",
        "roaster_notes": "Jacquier mûr, cacao, amande",
        "bag_size_g": 200, "price_vnd": 280000, "roast_date": "2026-06-20",
        "recommended_method": "Les deux", "recommended_recipe": "The Coffee Chronicler's Recipe", "active": 1,
    },
    {
        "id": "c4", "name": "Là Việt Balanced", "roaster": "Là Việt",
        "origin": "Đà Lạt, Vietnam", "species": "Arabica",
        "process": "Lavé", "roast": "Medium",
        "pre_ground": 0, "real_coffee_pct": 100, "tag": "café de référence",
        "roaster_notes": "100 pour cent arabica, medium, Đà Lạt, rien d'ajouté",
        "bag_size_g": 250, "price_vnd": 125000, "roast_date": "2026-06-22",
        "recommended_method": "Les deux", "recommended_recipe": "The Coffee Chronicler's Recipe", "active": 1,
    },
    {
        "id": "c5", "name": "Là Việt Strong", "roaster": "Là Việt",
        "origin": "Đà Lạt, Vietnam", "species": "Blend arabica et robusta",
        "process": "Classique", "roast": "Foncée",
        "pre_ground": 0, "real_coffee_pct": 100, "tag": "",
        "roaster_notes": "Corps fort, amertume marquée",
        "bag_size_g": 250, "price_vnd": 125000, "roast_date": "2026-06-10",
        "recommended_method": "Brikka", "recommended_recipe": "Brikka classique", "active": 0,
    },
]

DESCR = {
    "c1": ["chocolat noir", "rond", "caramel", "sucre roux", "malt"],
    "c2": ["caramel", "sucre roux", "noisette", "chocolat noir", "sirupeux"],
    "c3": ["jacquier", "fruits mûrs", "cacao", "amande", "banane"],
    "c4": ["noisette", "caramel", "chocolat noir", "miel", "fruits rouges"],
    "c5": ["brûlé", "terreux", "réglisse", "tabac"],
}

COMMENTS_EARLY = [
    "Trop amer, la langue reste râpeuse longtemps.",
    "Sorti brûlant, je pense que j'ai laissé trop longtemps sur le feu.",
    "Écoulement très lent, la mouture est sûrement trop fine.",
    "Astringent, bouche qui se resserre, je moudrai plus grossier demain.",
    "Acide au début puis amer, lit mal aplani je pense.",
    "Pas terrible, mais je note tout pour comparer.",
]
COMMENTS_MID = [
    "Mieux qu'hier, l'amertume recule.",
    "Un numéro plus grossier et déjà plus doux.",
    "Bon équilibre mais un peu creux, je tenterai plus chaud.",
    "Le jacquier commence à sortir, très plaisant.",
    "Correct, ratio à revoir peut être.",
]
COMMENTS_LATE = [
    "Excellente tasse, ronde et sucrée, exactement ce que je cherche.",
    "Le réglage 1.2.0 est le bon pour la Brikka, je ne touche plus.",
    "Superbe, notes de jacquier bien mûres, zéro amertume.",
    "Très propre, sucrosité longue, je garde cette recette.",
    "La Sherrycipe du matin, deux minutes chrono et c'est très bon.",
    "Parfait pour le matin, doux et rond.",
]

CUPS = {"Brikka": ["Loveramics Flat White Egg", "Loveramics Espresso Egg"],
        "Switch": ["Classic Mug"]}

def dial_from_clicks(clicks):
    r = clicks // 50
    n = (clicks % 50) // 5
    c = clicks % 5
    return f"{r}.{n}.{c}"

def clamp(v, lo, hi):
    return max(lo, min(hi, v))

days = []
d = START
while d <= TODAY:
    days.append(d)
    d += datetime.timedelta(days=1)
skip = set()
i = 4
while i < len(days) - 2:
    if random.random() < 0.18:
        gap = random.choice([1, 1, 2, 3])
        for g in range(gap):
            if i + g < len(days) - 1:
                skip.add(i + g)
        i += gap + 3
    else:
        i += 1
active_days = [dd for idx, dd in enumerate(days) if idx not in skip]

extractions = []
eid = 0

# Switch recipes: name -> (target dial in clicks, approx total, draw weight)
SWITCH_RECIPES = [
    ("The Coffee Chronicler's Recipe", 80, 180, 50),
    ("The Coffee Chronicler's Recipe (Sweet)", 80, 180, 15),
    ("Le Costaud (Bloom)", 70, 210, 10),
    ("Le Costaud (Immersion)", 75, 165, 15),
    ("La Sherrycipe", 100, 110, 8),
    ("The Tetsu Devil", 100, 205, 2),
]

for day in active_days:
    progress = (day - START).days / 41.0
    n_today = random.choices([1, 2, 3], weights=[45, 40, 15])[0]
    hours = sorted(random.sample([7, 8, 9, 13, 14, 15, 16], n_today))
    for h in hours:
        eid += 1
        minute = random.randint(0, 59)
        dt = f"{day.isoformat()}T{h:02d}:{minute:02d}"

        if progress < 0.2 and random.random() < 0.25:
            coffee = "c5"
        else:
            coffee = random.choices(["c1", "c2", "c3", "c4"], weights=[22, 18, 28, 32])[0]

        if coffee in ("c1", "c2", "c5"):
            method = "Brikka"
        else:
            method = random.choices(["Switch", "Brikka"], weights=[70, 30])[0]

        noise = random.choice([-5, 0, 0, 5])
        agitation = ""
        added_water = ""
        milk = ""
        preheated = ""
        if method == "Brikka":
            recipe = "Brikka classique"
            dose, water, vol = (12, 85, 78) if coffee == "c2" else (14, 100, 90)
            temp = random.choice([80, 85, 90])
            target = 60
            clicks = int(round(target - 12 * (1 - progress) + noise * (1 - progress * 0.6)))
            clicks = clamp(clicks, 40, 79)
            total = random.randint(230, 320)
            drawdown = random.randint(22, 45)
            cup = random.choice(CUPS["Brikka"])
            preheated = 1 if random.random() < 0.9 else ""
            if progress > 0.5 and random.random() < 0.2:
                added_water = random.choice([10, 15, 20])
        else:
            names, weights = zip(*[(x[0], x[3]) for x in SWITCH_RECIPES])
            recipe = random.choices(names, weights=weights)[0]
            target, base_t, _ = next((x[1], x[2], x[3]) for x in SWITCH_RECIPES if x[0] == recipe)
            # Advanced recipes mostly show up at the end of the period.
            if recipe in ("La Sherrycipe", "The Tetsu Devil") and progress < 0.55:
                recipe = "The Coffee Chronicler's Recipe"
                target, base_t = 80, 180
            dose, water = 15, 225
            temp = {"Le Costaud (Bloom)": random.choice([94, 95, 96]),
                    "Le Costaud (Immersion)": random.choice([92, 93, 94])}.get(recipe, 92)
            clicks = int(round(target - 12 * (1 - progress) + noise * (1 - progress * 0.6)))
            clicks = clamp(clicks, 54, 110)
            vol = water - random.randint(28, 38)
            too_fine = clicks < target - 6
            total = base_t + random.randint(-15, 25) + (18 if too_fine else 0)
            drawdown = random.randint(38, 70) + (15 if too_fine else 0)
            cup = CUPS["Switch"][0]
            if recipe in ("Le Costaud (Bloom)", "Le Costaud (Immersion)"):
                agitation = 3

        dial = "" if coffee in ("c1", "c2") else dial_from_clicks(clicks)

        ideal = 60 if method == "Brikka" else next(x[1] for x in SWITCH_RECIPES if x[0] == recipe)
        dial_gap = abs(clicks - ideal)
        base = 5.0 + 3.9 * progress
        score = base - dial_gap * 0.08 + random.uniform(-0.6, 0.6)
        if coffee == "c5":
            score = random.uniform(2.5, 4.5)
        score = clamp(round(score * 2) / 2, 2, 9.5)
        if coffee != "c5":
            score = max(score, 3.5)

        too_fine = clicks < ideal - 6
        too_coarse = clicks > ideal + 6
        if coffee == "c5":
            diag = "Brûlé (défaut du sachet)"
        elif too_fine:
            diag = random.choices(
                ["Sur-extrait (amer)", "Astringent", "Acide ET amer (extraction inégale)"],
                weights=[55, 30, 15])[0]
        elif too_coarse:
            diag = "Sous-extrait (acide)"
        elif score >= 7:
            diag = "Équilibré"
        else:
            diag = random.choices(
                ["Équilibré", "Sur-extrait (amer)", "Sous-extrait (acide)", "Trop léger (aqueux)"],
                weights=[40, 25, 20, 15])[0]

        pool = list(DESCR[coffee])
        tags = random.sample(pool, k=min(len(pool), random.choice([2, 2, 3])))
        if diag in ("Sur-extrait (amer)", "Astringent", "Brûlé (défaut du sachet)") and "brûlé" not in tags:
            tags.append("brûlé")
        if diag == "Sous-extrait (acide)" and coffee in ("c3", "c4"):
            tags.append("agrume")
        if score >= 8 and "rond" not in tags and random.random() < 0.4:
            tags.append("rond")

        comment = ""
        roll = random.random()
        if coffee == "c5" and roll < 0.7:
            comment = "Goût de cendre, aucun réglage n'y changera rien, sachet abandonné."
        elif roll < 0.30:
            if progress < 0.35:
                comment = random.choice(COMMENTS_EARLY)
            elif progress < 0.7:
                comment = random.choice(COMMENTS_MID)
            else:
                comment = random.choice(COMMENTS_LATE)

        extractions.append({
            "id": f"e{eid}", "date_time": dt, "coffee_id": coffee, "method": method,
            "recipe": recipe, "dose_g": dose, "water_g": water, "grind_dial": dial,
            "temperature_c": temp, "total_time_s": total, "flow_time_s": drawdown,
            "yield_ml": vol, "added_water_ml": added_water, "milk_ml": milk,
            "stir_count": agitation, "cup": cup, "preheated_water": preheated,
            "score_10": score, "diagnostic": diag,
            "descriptors": "|".join(tags), "comment": comment,
        })

print(f"{len(extractions)} brews over {len(active_days)} days")

COFFEE_COLS = ["id", "name", "roaster", "origin", "species", "process", "roast",
             "pre_ground", "real_coffee_pct", "tag", "roaster_notes", "bag_size_g",
             "price_vnd", "roast_date", "recommended_method", "recommended_recipe",
             "added_date", "active"]
EXT_COLS = ["id", "date_time", "coffee_id", "method", "recipe", "dose_g", "water_g",
            "grind_dial", "temperature_c", "total_time_s", "flow_time_s",
            "yield_ml", "added_water_ml", "milk_ml", "stir_count", "cup", "preheated_water",
            "score_10", "diagnostic", "descriptors", "comment"]

def to_csv(rows, cols):
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=cols, lineterminator="\n")
    w.writeheader()
    for r in rows:
        # added_date stays empty in the demo: the site migration derives it
        # from each coffee's first brew on load.
        w.writerow({k: r.get(k, "") for k in cols})
    return buf.getvalue()

coffees_csv = to_csv(COFFEES, COFFEE_COLS)
ext_csv = to_csv(extractions, EXT_COLS)

for txt, name in [(coffees_csv, "coffees"), (ext_csv, "extractions")]:
    assert "\u2013" not in txt and "\u2014" not in txt, name
    assert "`" not in txt, name

with open("/home/claude/tracker/demo/coffees-demo.csv", "w", encoding="utf-8") as f:
    f.write(coffees_csv)
with open("/home/claude/tracker/demo/extractions-demo.csv", "w", encoding="utf-8") as f:
    f.write(ext_csv)

with open("/home/claude/tracker/js/demo-data.js", "w", encoding="utf-8") as f:
    f.write("// Embedded demo dataset. Identical to the files in the demo folder.\n")
    f.write("// Generated once, do not edit by hand: go through the CSVs.\n")
    f.write('"use strict";\n')
    f.write("const DEMO_COFFEES_CSV = `" + coffees_csv + "`;\n")
    f.write("const DEMO_EXTRACTIONS_CSV = `" + ext_csv + "`;\n")

from collections import Counter
scores_s1 = [e["score_10"] for e in extractions if e["date_time"] < (START + datetime.timedelta(days=10)).isoformat()]
scores_s6 = [e["score_10"] for e in extractions if e["date_time"] >= (TODAY - datetime.timedelta(days=10)).isoformat()]
print("average score start:", round(sum(scores_s1)/len(scores_s1), 2), "end:", round(sum(scores_s6)/len(scores_s6), 2))
print(Counter(e["method"] for e in extractions))
print(Counter(e["recipe"] for e in extractions))
bana_switch = [e for e in extractions if e["coffee_id"] in ("c1", "c2") and e["method"] == "Switch"]
print("c1/c2 in the Switch:", len(bana_switch))
