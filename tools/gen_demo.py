# Générateur du jeu de démonstration. Exécuté une seule fois, sortie figée.
# Règle absolue : aucun tiret cadratin ni demi-cadratin dans les sorties.
import csv, io, random, datetime

random.seed(42)

TODAY = datetime.date(2026, 8, 9)
START = TODAY - datetime.timedelta(days=41)  # 6 semaines

CAFES = [
    {
        "id": "c1", "nom": "Trung Nguyên Sáng Tạo 4", "torrefacteur": "Trung Nguyên",
        "origine": "Buôn Ma Thuột, Vietnam", "espece": "Blend Arabica, Robusta, Excelsa, Catimor",
        "procede": "Torréfaction traditionnelle avec additifs", "torrefaction": "Foncée",
        "deja_moulu": 1, "pourcentage_cafe_reel": 82, "tag": "café aromatisé",
        "notes_annoncees": "Corps rond, sucré, faible acidité, arôme persistant. Étiquette : café 82 pour cent, soja torréfié, sirop de sucre brun, substitut de beurre, arômes de synthèse, beurre.",
        "format_grammes": 340, "prix_vnd": 148800, "date_torrefaction": "2026-05-20",
        "machine_recommandee": "Brikka", "recette_recommandee": "Brikka classique", "actif": 1,
    },
    {
        "id": "c2", "nom": "Bana Cofe G4", "torrefacteur": "Bana Cofe",
        "origine": "Vietnam", "espece": "Robusta",
        "procede": "Rang bơ", "torrefaction": "Foncée",
        "deja_moulu": 1, "pourcentage_cafe_reel": 100, "tag": "",
        "notes_annoncees": "Beurre, caramel, sucre roux, déjà moulu",
        "format_grammes": 250, "prix_vnd": 87000, "date_torrefaction": "2026-06-15",
        "machine_recommandee": "Brikka", "recette_recommandee": "Brikka classique", "actif": 1,
    },
    {
        "id": "c3", "nom": "Cà Phê Mít Liberica", "torrefacteur": "Fine Coffee Agency",
        "origine": "Vietnam", "espece": "Liberica",
        "procede": "Natural", "torrefaction": "Medium",
        "deja_moulu": 0, "pourcentage_cafe_reel": 100, "tag": "",
        "notes_annoncees": "Jacquier mûr, cacao, amande",
        "format_grammes": 200, "prix_vnd": 280000, "date_torrefaction": "2026-06-20",
        "machine_recommandee": "Les deux", "recette_recommandee": "The Coffee Chronicler's Recipe", "actif": 1,
    },
    {
        "id": "c4", "nom": "Là Việt Balanced", "torrefacteur": "Là Việt",
        "origine": "Đà Lạt, Vietnam", "espece": "Arabica",
        "procede": "Lavé", "torrefaction": "Medium",
        "deja_moulu": 0, "pourcentage_cafe_reel": 100, "tag": "café de référence",
        "notes_annoncees": "100 pour cent arabica, medium, Đà Lạt, rien d'ajouté",
        "format_grammes": 250, "prix_vnd": 125000, "date_torrefaction": "2026-06-22",
        "machine_recommandee": "Les deux", "recette_recommandee": "The Coffee Chronicler's Recipe", "actif": 1,
    },
    {
        "id": "c5", "nom": "Là Việt Strong", "torrefacteur": "Là Việt",
        "origine": "Đà Lạt, Vietnam", "espece": "Blend arabica et robusta",
        "procede": "Classique", "torrefaction": "Foncée",
        "deja_moulu": 0, "pourcentage_cafe_reel": 100, "tag": "",
        "notes_annoncees": "Corps fort, amertume marquée",
        "format_grammes": 250, "prix_vnd": 125000, "date_torrefaction": "2026-06-10",
        "machine_recommandee": "Brikka", "recette_recommandee": "Brikka classique", "actif": 0,
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

TASSES = {"Brikka": ["Loveramics Flat White Egg", "Loveramics Espresso Egg"],
          "Switch": ["Classic Mug"]}

def dial_from_crans(crans):
    r = crans // 50
    n = (crans % 50) // 5
    c = crans % 5
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

# Recettes Switch : nom -> (dial cible en crans, total approx, poids de tirage)
SWITCH_RECETTES = [
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
            cafe = "c5"
        else:
            cafe = random.choices(["c1", "c2", "c3", "c4"], weights=[22, 18, 28, 32])[0]

        if cafe in ("c1", "c2", "c5"):
            methode = "Brikka"
        else:
            methode = random.choices(["Switch", "Brikka"], weights=[70, 30])[0]

        noise = random.choice([-5, 0, 0, 5])
        agitation = ""
        eau_ajoutee = ""
        lait = ""
        prechauffee = ""
        if methode == "Brikka":
            recette = "Brikka classique"
            dose, eau, vol = (12, 85, 78) if cafe == "c2" else (14, 100, 90)
            temp = random.choice([80, 85, 90])
            target = 60
            crans = int(round(target - 12 * (1 - progress) + noise * (1 - progress * 0.6)))
            crans = clamp(crans, 40, 79)
            total = random.randint(230, 320)
            ecoul = random.randint(22, 45)
            tasse = random.choice(TASSES["Brikka"])
            prechauffee = 1 if random.random() < 0.9 else ""
            if progress > 0.5 and random.random() < 0.2:
                eau_ajoutee = random.choice([10, 15, 20])
        else:
            noms, poids = zip(*[(x[0], x[3]) for x in SWITCH_RECETTES])
            recette = random.choices(noms, weights=poids)[0]
            cible, base_t, _ = next((x[1], x[2], x[3]) for x in SWITCH_RECETTES if x[0] == recette)
            # Les avancées apparaissent surtout en fin de période.
            if recette in ("La Sherrycipe", "The Tetsu Devil") and progress < 0.55:
                recette = "The Coffee Chronicler's Recipe"
                cible, base_t = 80, 180
            dose, eau = 15, 225
            temp = {"Le Costaud (Bloom)": random.choice([94, 95, 96]),
                    "Le Costaud (Immersion)": random.choice([92, 93, 94])}.get(recette, 92)
            crans = int(round(cible - 12 * (1 - progress) + noise * (1 - progress * 0.6)))
            crans = clamp(crans, 54, 110)
            vol = eau - random.randint(28, 38)
            trop_fin = crans < cible - 6
            total = base_t + random.randint(-15, 25) + (18 if trop_fin else 0)
            ecoul = random.randint(38, 70) + (15 if trop_fin else 0)
            tasse = TASSES["Switch"][0]
            if recette in ("Le Costaud (Bloom)", "Le Costaud (Immersion)"):
                agitation = 3

        dial = "" if cafe in ("c1", "c2") else dial_from_crans(crans)

        ideal = 60 if methode == "Brikka" else next(x[1] for x in SWITCH_RECETTES if x[0] == recette)
        ecart = abs(crans - ideal)
        base = 5.0 + 3.9 * progress
        note = base - ecart * 0.08 + random.uniform(-0.6, 0.6)
        if cafe == "c5":
            note = random.uniform(2.5, 4.5)
        note = clamp(round(note * 2) / 2, 2, 9.5)
        if cafe != "c5":
            note = max(note, 3.5)

        trop_fin = crans < ideal - 6
        trop_gros = crans > ideal + 6
        if cafe == "c5":
            diag = "Brûlé (défaut du sachet)"
        elif trop_fin:
            diag = random.choices(
                ["Sur-extrait (amer)", "Astringent", "Acide ET amer (extraction inégale)"],
                weights=[55, 30, 15])[0]
        elif trop_gros:
            diag = "Sous-extrait (acide)"
        elif note >= 7:
            diag = "Équilibré"
        else:
            diag = random.choices(
                ["Équilibré", "Sur-extrait (amer)", "Sous-extrait (acide)", "Trop léger (aqueux)"],
                weights=[40, 25, 20, 15])[0]

        pool = list(DESCR[cafe])
        tags = random.sample(pool, k=min(len(pool), random.choice([2, 2, 3])))
        if diag in ("Sur-extrait (amer)", "Astringent", "Brûlé (défaut du sachet)") and "brûlé" not in tags:
            tags.append("brûlé")
        if diag == "Sous-extrait (acide)" and cafe in ("c3", "c4"):
            tags.append("agrume")
        if note >= 8 and "rond" not in tags and random.random() < 0.4:
            tags.append("rond")

        comment = ""
        roll = random.random()
        if cafe == "c5" and roll < 0.7:
            comment = "Goût de cendre, aucun réglage n'y changera rien, sachet abandonné."
        elif roll < 0.30:
            if progress < 0.35:
                comment = random.choice(COMMENTS_EARLY)
            elif progress < 0.7:
                comment = random.choice(COMMENTS_MID)
            else:
                comment = random.choice(COMMENTS_LATE)

        extractions.append({
            "id": f"e{eid}", "date_heure": dt, "cafe_id": cafe, "methode": methode,
            "recette": recette, "dose_g": dose, "eau_g": eau, "mouture_dial": dial,
            "temperature_c": temp, "temps_total_s": total, "temps_ecoulement_s": ecoul,
            "volume_extrait_ml": vol, "eau_ajoutee_ml": eau_ajoutee, "lait_ml": lait,
            "agitation_nb": agitation, "tasse": tasse, "eau_prechauffee": prechauffee,
            "note_sur_10": note, "diagnostic": diag,
            "descripteurs": "|".join(tags), "commentaire": comment,
        })

print(f"{len(extractions)} extractions sur {len(active_days)} jours")

CAFE_COLS = ["id", "nom", "torrefacteur", "origine", "espece", "procede", "torrefaction",
             "deja_moulu", "pourcentage_cafe_reel", "tag", "notes_annoncees", "format_grammes",
             "prix_vnd", "date_torrefaction", "machine_recommandee", "recette_recommandee",
             "date_ajout", "actif"]
EXT_COLS = ["id", "date_heure", "cafe_id", "methode", "recette", "dose_g", "eau_g",
            "mouture_dial", "temperature_c", "temps_total_s", "temps_ecoulement_s",
            "volume_extrait_ml", "eau_ajoutee_ml", "lait_ml", "agitation_nb", "tasse", "eau_prechauffee",
            "note_sur_10", "diagnostic", "descripteurs", "commentaire"]

def to_csv(rows, cols):
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=cols, lineterminator="\n")
    w.writeheader()
    for r in rows:
        # date_ajout reste vide dans la demo : la migration du site la deduit
        # de la premiere extraction de chaque cafe au chargement.
        w.writerow({k: r.get(k, "") for k in cols})
    return buf.getvalue()

cafes_csv = to_csv(CAFES, CAFE_COLS)
ext_csv = to_csv(extractions, EXT_COLS)

for txt, name in [(cafes_csv, "cafes"), (ext_csv, "extractions")]:
    assert "\u2013" not in txt and "\u2014" not in txt, name
    assert "`" not in txt, name

with open("/home/claude/tracker/demo/cafes-demo.csv", "w", encoding="utf-8") as f:
    f.write(cafes_csv)
with open("/home/claude/tracker/demo/extractions-demo.csv", "w", encoding="utf-8") as f:
    f.write(ext_csv)

with open("/home/claude/tracker/js/demo-data.js", "w", encoding="utf-8") as f:
    f.write("// Jeu de démonstration embarqué. Identique aux fichiers du dossier demo.\n")
    f.write("// Généré une fois, ne pas éditer à la main : passer par les CSV.\n")
    f.write('"use strict";\n')
    f.write("const DEMO_CAFES_CSV = `" + cafes_csv + "`;\n")
    f.write("const DEMO_EXTRACTIONS_CSV = `" + ext_csv + "`;\n")

from collections import Counter
notes_s1 = [e["note_sur_10"] for e in extractions if e["date_heure"] < (START + datetime.timedelta(days=10)).isoformat()]
notes_s6 = [e["note_sur_10"] for e in extractions if e["date_heure"] >= (TODAY - datetime.timedelta(days=10)).isoformat()]
print("note moyenne debut:", round(sum(notes_s1)/len(notes_s1), 2), "fin:", round(sum(notes_s6)/len(notes_s6), 2))
print(Counter(e["methode"] for e in extractions))
print(Counter(e["recette"] for e in extractions))
bana_switch = [e for e in extractions if e["cafe_id"] in ("c1", "c2") and e["methode"] == "Switch"]
print("c1/c2 en Switch:", len(bana_switch))
