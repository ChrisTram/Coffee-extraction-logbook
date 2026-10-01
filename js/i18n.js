// Internationalisation: French by default, English as a toggle.
// Three mechanisms:
// 1. UI: text mapping for all the static content of the page.
//    Each French text fragment is the key, the English text the value.
// 2. T: templates for strings built in JavaScript, with variables.
// 3. Display maps for data values (diagnostics, descriptors):
//    the stored value stays French, only the display changes.
"use strict";

const I18N = (() => {

  let lang = "fr";
  /* Saved wish, NOT the current language: switching before the bundle is here
     would show a page that declares itself English and renders French as fallback.
     prepare(), called at startup, decides once the bundle has arrived. */
  let wantedLanguage = "fr";
  try {
    const l = localStorage.getItem("lang");
    if (l === "en") wantedLanguage = "en";
  } catch (e) { /* unavailable */ }

  // ---------- 1. Static content: French to English ----------

  /* Empty in French, filled by js/i18n.en.js when switching to English. In
     French these tables are useless: the matching translation function
     returns its input unchanged. */
  const UI = {};

  // ---------- 2. Templates for dynamic strings ----------

  const T = {
    doc_title: { fr: "Carnet d'extraction : Brikka et Switch" },

    kpi_today: { fr: "aujourd'hui" },
    date_today: { fr: "Aujourd'hui" },
    history_actions: { fr: "Actions sur cette tasse" },
    brew_view_recipe: { fr: "La recette" },
    recipe_never_made: { fr: "jamais faite" },
    stock_chip_title: { fr: "{c} : il reste {g} g, environ {n} tasse{s}. Ouvrir la fiche." },
    stock_chip_empty_title: { fr: "{c} : sachet vide. Ouvrir la fiche pour racheter." },
    stock_chip_empty: { fr: "vide" },
    guide_brew: { fr: "Brasser" },
    guide_door_recipes: { fr: "{n} recettes, pas à pas" },
    guide_door_grinder: { fr: "réglages et conversions" },
    guide_door_diagnosis: { fr: "acide, amer, léger : que corriger" },
    guide_door_rules: { fr: "ce qui ne change jamais" },
    guide_door_vocabulary: { fr: "{n} mots expliqués" },
    guide_door_shops: { fr: "où acheter, quoi prendre" },
    guide_door_gear: { fr: "Brikka, Switch, moulin" },
    guide_door_messages: { fr: "en vietnamien, à copier" },
    guide_door_other: { fr: "à lire" },
    guide_for_you: { fr: "Pour ton {c}" },
    guide_starting: { fr: "la recette de départ" },
    guide_to_try: { fr: "une autre à essayer" },
    guide_at_home: { fr: "chez toi {m}" },
    guide_type_recipe: { fr: "recette" },
    guide_type_word: { fr: "vocabulaire" },
    guide_type_tip: { fr: "guide" },
    guide_no_result: { fr: "Rien pour « {q} » dans le Guide." },
    journal_unknown_coffee: { fr: "Café inconnu" },
    journal_since: { fr: "depuis le {d}" },
    journal_from_to: { fr: "du {a} au {b}" },
    journal_no_bag: { fr: "sans sachet" },
    journal_open: { fr: "en cours · {g} g" },
    journal_finished: { fr: "fini" },
    journal_cups: { fr: "{n} tasse{s}" },
    journal_average: { fr: "moyenne, {n} notées" },
    journal_best: { fr: "la meilleure" },
    journal_per_cup: { fr: "la tasse" },
    journal_best_setting: { fr: "Meilleur réglage : {r}, {n}." },
    journal_see_all: { fr: "Voir les {n} autre{s} tasse{s}" },
    sheet_kpi_cups: { fr: "tasses" },
    sheet_kpi_average: { fr: "de moyenne" },
    sheet_kpi_best: { fr: "la meilleure" },
    sheet_kpi_cost: { fr: "la tasse" },
    sheet_tabs: { fr: "Rubriques de la fiche" },
    sheet_tab_setting: { fr: "Réglage" },
    sheet_tab_tastes: { fr: "Goûts" },
    sheet_tab_bags: { fr: "Sachets" },
    sheet_tab_cups: { fr: "Tasses" },
    pivot_recipes: { fr: "{n} recettes" },
    pivot_heat: { fr: "feu {f}" },
    pivot_bubbles: { fr: "bulles à {t}" },
    pivot_to_measure: { fr: "à mesurer" },
    pivot_clicks: { fr: "{n} crans" },
    pivot_beeps_on: { fr: "bips au chrono" },
    pivot_beeps_off: { fr: "sans bip" },
    recap_day: { fr: "{j} : {n} tasse{s}, voir dans l'historique" },
    recap_day_rated: { fr: "{j} : {n} tasse{s}, {m} de moyenne, voir dans l'historique" },
    history_filter: { fr: "Filtrer" },
    history_filter_count: { fr: "Filtrer ({n})" },
    history_filter_coffee: { fr: "Café" },
    history_filter_diagnosis: { fr: "Diagnostic" },
    history_filter_botched: { fr: "Ratées" },
    history_filter_score: { fr: "Note ≥ {n}" },
    history_filter_from: { fr: "Depuis le {d}" },
    history_filter_on: { fr: "Le {d}" },
    history_filter_until: { fr: "Jusqu'au {d}" },
    history_filter_remove: { fr: "Retirer le filtre {f}" },
    date_yesterday: { fr: "Hier" },
    kpi_week: { fr: "cette semaine" },
    kpi_total: { fr: "au total" },
    kpi_score: { fr: "note moyenne globale" },
    kpi_score_7d: { fr: "note moyenne 7 jours" },
    kpi_caffeine: { fr: "caféine par jour, 7 jours (estimation)" },

    chart_trend: { fr: "Tendance, moyenne des 5 dernières tasses" },
    chart_daily_score: { fr: "Note moyenne du jour" },
    chart_coffee_grams: { fr: "Café consommé (g)" },
    tip_coffee_grams: { fr: "{g} g de café" },
    chart_brews: { fr: "Extractions" },
    axis_score: { fr: "Note sur 10" },
    axis_average_score: { fr: "Note moyenne" },
    axis_grind: { fr: "Mouture (microns)" },
    axis_coffee_age: { fr: "Âge du café (jours après torréfaction)" },
    unit_days: { fr: "jours" },
    tip_caffeine: { fr: "Caféine : environ {mg} mg" },
    count_brews: { fr: "{n} extractions" },

    // Automatic dashboard insights. Sentences built in JS, hence T
    // templates and not UI entries. Avoid variable plurals in the
    // wording: numbers arrive already formatted.
    /* The sentences NO LONGER carry the figures (v8.36): they are in the
       evidence just below, and reading them twice adds nothing. */
    finding_coffee_lever: { fr: "Sur ton {coffee} en {machine}, {lever} {value} sort au dessus du reste." },
    finding_global: { fr: "Toutes tasses confondues : {p}" },
    lever_heat: { fr: "puissance de feu" },
    lever_preheat: { fr: "eau préchauffée" },
    lever_recipe: { fr: "recette" },
    lever_dose: { fr: "dose" },
    lever_grind: { fr: "mouture" },
    lever_bag_age: { fr: "âge du paquet" },
    finding_bag_fresh: { fr: "dans la première semaine après ouverture" },
    finding_bag_middle: { fr: "entre 1 et 3 semaines après ouverture" },
    finding_bag_old: { fr: "au delà de 3 semaines après ouverture" },
    finding_bag: { fr: "Tes tasses sont meilleures {when}." },
    finding_recipes: { fr: "{winner} passe devant {loser}." },
    finding_time_morning: { fr: "le matin" },
    finding_time_afternoon: { fr: "l'après midi" },
    finding_time_evening: { fr: "le soir" },
    finding_time: { fr: "Tes tasses {when} sortent mieux qu’au reste de la journée." },


    finding_heat: { fr: "Sur la Brikka, une puissance de feu de {heat} te réussit mieux." },
    /* Three more insights (v8.42): data already entered that no rule
       was reading. */
    finding_temp: { fr: "Au Switch, l'eau {range} te réussit mieux." },
    finding_temp_low: { fr: "sous 91 °C" },
    finding_temp_middle: { fr: "entre 91 et 93 °C" },
    finding_temp_high: { fr: "à 94 °C et plus" },
    finding_rest_temp: { fr: "les autres températures" },
    finding_preheat: { fr: "Sur la Brikka, l'eau {what} te réussit mieux." },
    finding_preheat_yes: { fr: "préchauffée" },
    finding_preheat_no: { fr: "froide au départ" },
    finding_stir: { fr: "Au Switch, tes tasses {what} sortent mieux." },
    finding_stir_yes: { fr: "remuées" },
    finding_stir_no: { fr: "sans agitation" },

    /* The evidence under the sentence (v8.36). */
    finding_rest: { fr: "le reste" },
    finding_rest_time: { fr: "le reste du temps" },
    finding_rest_day: { fr: "le reste de la journée" },
    finding_rest_settings: { fr: "les autres réglages" },
    finding_previous: { fr: "Constat précédent" },
    finding_next: { fr: "Constat suivant" },
    /* The rank of the latest cup (v8.39). */
    rank_among: { fr: "Parmi tes {n} tasses notées de {coffee}" },
    rank_best: { fr: "La meilleure" },
    rank_joint_best: { fr: "La meilleure, à égalité" },
    rank_position: { fr: "{k}e sur {n}" },
    rank_above: { fr: "{x} au-dessus de ta moyenne" },
    rank_below: { fr: "{x} sous ta moyenne" },
    rank_on_average: { fr: "dans ta moyenne" },
    rank_average: { fr: "ta moyenne {m}" },
    rank_aria: { fr: "{n} tasses notées de {coffee}, moyenne {m}, celle-ci à {score}" },
    rank_recipe: { fr: "recette {v}" },
    rank_your_average: { fr: "ta moyenne {v}" },
    rank_per_cup: { fr: "la tasse" },
    /* The readings of the analyses (v8.39). */
    reading_coffees: { fr: "{a} tient la tête avec {ma} de moyenne ; {b} ferme la marche à {mb}." },
    reading_coffees_two: { fr: "{a} passe devant {b}, {ma} contre {mb}." },
    reading_recipes: { fr: "{a} est ta recette la mieux notée, {ma} de moyenne ; {b} la moins réussie, {mb}." },
    reading_recipes_two: { fr: "{a} passe devant {b}, {ma} contre {mb}." },
    reading_switch_ahead: { fr: "Le Switch fait mieux que la Brikka de {x} point{s} en moyenne.{often}" },
    reading_brikka_ahead: { fr: "La Brikka fait mieux que le Switch de {x} point{s} en moyenne.{often}" },
    reading_often_brikka: { fr: " La Brikka reste celle que tu utilises le plus." },
    reading_often_switch: { fr: " Le Switch reste celui que tu utilises le plus." },
    reading_machines_level: { fr: "Les deux machines se valent : {mb} en Brikka, {ms} au Switch." },
    reading_tastes: { fr: "Tes bonnes tasses parlent de {a}. {p} tire la note vers le bas." },
    reading_tastes_no_worst: { fr: "Tes bonnes tasses parlent de {a}." },
    reading_and: { fr: " et de " },
    reading_diagnosis: { fr: "Le diagnostic le plus fréquent : {d}, {n} fois sur {t}." },
    reading_grind_brikka: { fr: "À la Brikka, la molette {d} donne ta meilleure moyenne : {x} sur {n} tasses." },
    reading_grind_switch: { fr: "Au Switch, la molette {d} donne ta meilleure moyenne : {x} sur {n} tasses." },
    axis_score_short: { fr: "note" },
    axis_cups: { fr: "tasses" },
    chart_cups_per_day: { fr: "Tasses du jour" },
    finding_versus: { fr: "<b>{h}</b> contre {b}" },
    finding_counts: { fr: "{h} et {b} tasses" },
    finding_solid: { fr: "Solide" },
    finding_likely: { fr: "Probable" },
    finding_empty: { fr: "Pas encore assez de matière. Une tendance ne veut dire quelque chose qu'à partir de {n} extractions notées dans chacun des groupes comparés." },
    // States of the sync between devices.
    sync_local: { fr: "Synchronisation indisponible en local : tes données restent sur cet appareil." },
    sync_demo: { fr: "Démonstration : rien n'est synchronisé." },
    sync_in_progress: { fr: "Synchronisation en cours..." },
    sync_ok: { fr: "Synchronisé à {h}." },
    sync_offline: { fr: "Hors ligne. Tes saisies sont gardées ici et partiront à la prochaine synchro." },
    sync_session: { fr: "Session expirée, reconnecte toi pour synchroniser." },
    sync_not_configured: { fr: "Synchronisation pas encore configurée sur le serveur (base D1 à lier)." },
    sync_error: { fr: "Synchronisation en échec. Tes données locales sont intactes." },
    sync_outdated: { fr: "Une version plus récente du carnet est en ligne : recharge la page pour synchroniser." },
    update_reload: { fr: "Recharger" },
    update_ready: { fr: "Nouvelle version du carnet prête." },
    folder_reauthorize: { fr: "à réautoriser, touche ici" },
    folder_reauthorized: { fr: "Dossier réautorisé : les CSV sont de nouveau écrits." },
    folder_refused: { fr: "Permission refusée : les CSV ne sont pas écrits, tes données restent ici et sur le serveur." },
    toast_storage_failed: { fr: "Impossible d'enregistrer sur cet appareil (stockage plein ?). La synchro garde une copie." },
    import_unknown: { fr: "Fichier non reconnu : ni cafés, ni extractions, ni recettes, ni tasses, ni sachets, ni réglages." },
    import_json_unreadable: { fr: "Ce fichier JSON n'est pas un export complet du carnet." },
    import_preview: { fr: "{n} lignes pour la table {t} : {added} nouvelles, {changed} modifiées. Les lignes absentes du fichier restent en place." },
    import_preview_all: { fr: "Export complet du carnet, {n} lignes, fusionnées avec les tiennes comme une synchro." },
    import_without_id: { fr: "{n} sans identifiant en recevront un." },
    import_duplicates: { fr: "{n} identifiants en double : la dernière ligne gagne." },
    import_ok: { fr: "Importer" },
    sync_never: { fr: "Pas encore synchronisé." },
    sync_size: { fr: "Attention : le document synchronisé occupe {p} pour cent de la place que le serveur accepte. Il faudra archiver l'historique avant d'atteindre 100." },
    toast_sync_ok: { fr: "Synchronisé" },
    toast_sync_failed: { fr: "Synchronisation impossible" },

    dash_brikka_brews: { fr: "extractions Brikka" },
    dash_switch_brews: { fr: "extractions Switch" },
    detail_score: { fr: "note moyenne" },
    dial: { fr: "molette" },
    botched_badge: { fr: "ratée" },
    history_mark_botched: { fr: "Marquer comme ratée, pour l'écarter des analyses" },
    history_unmark_botched: { fr: "Ne plus la compter comme ratée" },
    toast_botched: { fr: "Marquée ratée, écartée des analyses." },
    toast_unbotched: { fr: "Rendue aux analyses." },
    botched_badge_title: { fr: "Geste manqué, écartée des analyses. Elle reste comptée dans les tasses, les grammes et le coût." },
    botched_excluded: { fr: "{n} tasse(s) ratée(s) écartée(s) des analyses." },

    heatmap_aria: { fr: "Extractions par jour" },
    heatmap_none: { fr: "aucune extraction" },
    heatmap_one: { fr: "{n} extraction" },
    heatmap_many: { fr: "{n} extractions" },
    heatmap_score: { fr: "note moyenne {x}" },
    // Cards that can stay empty with perfectly valid data.
    // Each message gives the REAL cause and the action that unblocks it.
    empty_nothing: { fr: "Aucune extraction notée pour l'instant. Note tes tasses et ce graphique se remplira." },
    empty_grind_preground: { fr: "Tous tes cafés extraits sont marqués déjà moulus, donc aucun réglage de molette n'est enregistré : ce n'est pas un bug. Une extraction avec un café en grains et le nuage démarre." },
    empty_grind: { fr: "Aucun réglage de molette enregistré sur tes extractions notées." },
    empty_tastes_none: { fr: "Tu n'as pas encore coché de descripteurs. Coche ce que tu sens en saisie, et ce graphique te dira quels goûts annoncent tes bonnes tasses." },
    empty_tastes_threshold: { fr: "Aucun descripteur n'atteint encore 3 tasses. Continue à cocher les mêmes mots et le classement apparaîtra." },
    tastes_score: { fr: "Note moyenne des tasses où tu as coché le descripteur, à partir de {n} tasses. Vert au dessus de ta moyenne ({m}), rouge en dessous." },
    empty_duel_one_machine: { fr: "Tu n'as encore utilisé qu'une seule machine. Passe un même café en Brikka et au Switch pour les comparer." },
    empty_duel: { fr: "Aucun café n'est encore passé dans les deux machines avec une note." },

    // Stock of the current bag.
    stock_left: { fr: "reste {g} g, environ {n} tasses" },
    stock_empty: { fr: "sachet fini" },
    stock_title: { fr: "Sachet de {f} g. {c} g consommés, {r} g restants. Estimation à {d} g par tasse, {src}." },
    stock_dose_average: { fr: "ta dose moyenne sur ce café" },
    stock_dose_fallback: { fr: "la dose de repli, ce café n'a pas encore d'extraction" },
    not_rated_yet: { fr: "pas encore notée" },
    btn_new_bag: { fr: "Nouveau sachet" },
    bag_title: { fr: "Nouveau sachet : {n}" },
    toast_bag: { fr: "Sachet enregistre" },
    toast_draft: { fr: "Brouillon repris" },

    // Expandable detail and comparator of the history.
    detail_coffee: { fr: "Café" },
    detail_method: { fr: "Méthode" },
    detail_recipe: { fr: "Recette" },
    detail_dose: { fr: "Dose" },
    detail_water: { fr: "Eau" },
    detail_ratio: { fr: "Ratio" },
    detail_grind: { fr: "Mouture" },
    detail_temp: { fr: "Température" },
    detail_heat_power: { fr: "Puissance de feu" },
    detail_preheated: { fr: "Eau préchauffée" },
    detail_total: { fr: "Temps total" },
    detail_drawdown: { fr: "Écoulement" },
    detail_kettle: { fr: "Bouilloire sur le feu" },
    temp_estimate: { fr: "{d} sur le feu donne environ {t} °C." },
    temp_advice: { fr: "Pour {t} °C, laisse la bouilloire environ {d} sur le feu." },
    temp_no_kettle: { fr: "Pour estimer le degré depuis le temps de chauffe : chronomètre une fois ta bouilloire, de l'eau du robinet au gros bouillon, et pose ce temps dans Paramètres, Ma bouilloire." },
    toast_param_boil: { fr: "Le temps d'ébullition doit être entre 30 secondes et 30 minutes." },
    toast_param_bubbles: { fr: "Les premières bulles viennent avant le gros bouillon : un temps plus court que l'ébullition." },
    detail_volume: { fr: "Volume extrait" },
    detail_water_added: { fr: "Eau ajoutée" },
    detail_milk: { fr: "Lait" },
    detail_stirring: { fr: "Agitation" },
    detail_cup: { fr: "Tasse" },
    detail_drink: { fr: "Volume boisson" },
    detail_cost: { fr: "Coût" },
    detail_score: { fr: "Note" },
    detail_diagnosis: { fr: "Diagnostic" },
    detail_descriptors: { fr: "Descripteurs" },
    detail_comment: { fr: "Commentaire" },
    detail_nothing: { fr: "Rien de plus à montrer sur cette extraction." },
    history_edit: { fr: "Ouvrir en édition" },
    history_details: { fr: "Voir le détail" },
    history_details_hide: { fr: "Masquer le détail" },
    history_compare: { fr: "Comparer avec une autre" },
    compare_one: { fr: "1 extraction sélectionnée, choisis en une seconde." },
    compare_two: { fr: "2 extractions sélectionnées." },
    compare_gap: { fr: "{x} point d écart entre les deux. Les lignes surlignées sont les seules différences." },
    compare_no_score: { fr: "Une des deux tasses n a pas de note. Les lignes surlignées sont les différences." },
    yes: { fr: "oui" },
    no: { fr: "non" },

    // My best settings screen.
    setting_average: { fr: "{m} de moyenne sur {n} tasses" },
    setting_over: { fr: "sur {n} tasses" },
    setting_better: { fr: "{x} point de mieux que ta moyenne sur ce café" },
    setting_worse: { fr: "{x} point sous ta moyenne sur ce café" },
    setting_heat: { fr: "feu {f} / 10" },
    setting_redo: { fr: "Refaire cette tasse" },
    setting_prefilled: { fr: "Saisie préremplie avec ce réglage" },
    setting_none: { fr: "Aucune tasse notée sur ce café pour l instant." },
    setting_not_enough: { fr: "Encore {n} tasse au même réglage et un gagnant apparaîtra. Il en faut {s} identiques." },
    setting_below_average: { fr: "Aucun réglage ne se détache encore : ceux que tu as refaits au moins {s} fois restent sous ta moyenne. Ta meilleure tasse, {score} / 10, vient d'un réglage joué {k} fois : refais-le encore {n} fois pour savoir s'il tient." },
    setting_scattered: { fr: "Assez de tasses, mais chacune à un réglage différent. Refais {n} fois ton réglage le plus joué plutôt que d en essayer un nouveau." },
    setting_no_coffee: { fr: "Ajoute un café pour voir tes réglages ici." },

    param_empty: { fr: "aucune" },
    param_temp_heat: { fr: "dépend de la puissance du feu" },
    toast_param_ok: { fr: "{n} recette(s) mise(s) à jour." },
    toast_param_fallbacks: { fr: "Valeurs de repli enregistrées." },
    toast_param_dose: { fr: "La dose de repli doit être supérieure à zéro." },
    toast_param_heat: { fr: "La puissance de feu de repli doit être entre 1 et 10." },

    milk_no_volume: { fr: "Renseigne le volume extrait pour que le lait se calcule tout seul." },

    param_dial_detail: { fr: "{c} crans, environ {m} microns" },

    toast_edit_dropped: { fr: "Modification abandonnée, tu repars sur une saisie neuve." },

    dial_both: { fr: "Ce réglage marche sur la Brikka ET sur le Switch." },
    dial_brikka: { fr: "Bon pour la Brikka, trop fin pour le Switch." },
    dial_switch: { fr: "Bon pour le Switch, trop grossier pour la Brikka." },
    dial_none: { fr: "Hors plage pour tes deux machines." },
    dial_finer: { fr: "Plus FIN, vers la gauche : l'eau traverse plus lentement, tu extrais davantage. Plus de corps et de sucrosité, puis de l'amertume et de l'astringence si tu vas trop loin." },
    dial_coarser: { fr: "Plus GROSSIER, vers la droite : l'eau passe plus vite, tu extrais moins. Plus clair et plus vif, puis acide et creux si tu vas trop loin." },
    dial_current: { fr: "C'est ton réglage enregistré, {m}." },
    dial_gap: { fr: "{n} cran(s) à {direction} depuis ton réglage enregistré, {m}. Un numéro entier vaut 5 crans : en dessous, ça ne se sent pas en tasse." },
    dial_open: { fr: "ouvrir" },
    dial_close: { fr: "fermer" },
    conv_apply: { fr: "Utiliser comme réglage par défaut" },
    conv_already: { fr: "C'est déjà ton réglage par défaut" },
    toast_dial_applied: { fr: "Réglage par défaut : {m}. La saisie le prérempli maintenant." },

    bag_open_days: { fr: "Paquet ouvert depuis {n} jour(s)." },
    detail_days_open: { fr: "Jours d'ouverture" },

    cost_per_cup: { fr: "{v} la tasse de {d} g" },
    cost_real: { fr: "({v} en café réel)" },

    toast_undo: { fr: "Annuler" },
    toast_restored: { fr: "Extraction rétablie." },

    aside_scaled: { fr: "versements adaptés à {e} g" },

    ratio_cup_short: { fr: "en tasse" },
    ratio_boiler: { fr: "{e} g d eau pour {d} g de café. C est la convention universelle du café, celle qui se compare à n importe quelle recette. Sur la Brikka, l eau comptée est celle de la chaudière." },
    ratio_brew: { fr: "Ratio d infusion : {e} g d eau divisés par {d} g de café. Sur le Switch l eau versée traverse le café, donc c est le bon calcul." },
    ratio_drink_short: { fr: "boisson" },
    ratio_nothing: { fr: "Renseigne la dose et l eau, ou le volume extrait, pour voir le ratio." },

    kpi_consistency: { fr: "régularité, à café et recette égaux" },
    /* The three figures taken out of the tiles: they read inline. */
    dash_last_cup: { fr: "Dernière tasse, {q}" },
    dash_out_of_10: { fr: "sur 10" },
    quick_now: { fr: "maintenant, {h}" },
    history_highlight: { fr: "{n} tasse{s} depuis le {d}" },
    history_summary_cups: { fr: "tasses" },
    history_summary_average: { fr: "moyenne" },
    history_summary_best: { fr: "la meilleure" },
    history_summary_botched: { fr: "ratées" },
    history_summary_none: { fr: "aucune" },
    heatmap_title: { fr: "Les {n} dernières semaines" },
    heatmap_legend_less: { fr: "moins" },
    heatmap_legend_more: { fr: "4 et plus" },
    tastes_more: { fr: "toutes les familles ({n} de plus)" },
    tastes_fewer: { fr: "moins de familles" },
    detail_time: { fr: "Temps total" },
    detail_heat: { fr: "Puissance de feu" },
    quick_from_recipe: { fr: "{v} : repris de la recette" },
    dash_minutes_ago: { fr: "il y a {n} min" },
    dash_hours_ago: { fr: "il y a {n} h" },
    dash_days_ago: { fr: "il y a {n} j" },

    heatmap_stat_cups: { fr: "tasses" },
    heatmap_stat_days: { fr: "jours actifs" },
    heatmap_stat_streak_now: { fr: "série en cours" },
    heatmap_stat_streak_max: { fr: "meilleure série" },
    heatmap_stat_week: { fr: "tasses par semaine" },
    heatmap_summary_empty: { fr: "Aucune extraction sur les {s} dernières semaines." },
    weekdays: { fr: "Lun|Mar|Mer|Jeu|Ven|Sam|Dim" },
    months_short: { fr: "janv.|févr.|mars|avr.|mai|juin|juil.|août|sept.|oct.|nov.|déc." },

    range_aria: { fr: "Plages de mouture par méthode" },
    range_microns: { fr: "microns" },
    range_tip: { fr: "{name} : {min} à {max} µm, molette {dial}" },
    range_ref_tip: { fr: "{dial} : {usage}, {clicks} crans, environ {u} µm" },

    conv_clicks: { fr: "crans" },
    conv_about: { fr: "environ" },
    conv_microns: { fr: "microns" },
    conv_band: { fr: "bande" },
    conv_fits: { fr: "compatible :" },
    conv_outside: { fr: "hors de toute plage recommandée" },
    conv_error: { fr: "Format attendu : rotation.numéro.cran, par exemple 1.5.0 (rotation 0 à 3, numéro 0 à 9, cran 0 à 4, butée à 3.0.0)." },
    range_under: { fr: "moins de {x}" },
    range_from_to: { fr: "{a} à {b}" },

    grind_format: { fr: "Format attendu : rotation.numéro.cran, par exemple 1.5.0" },
    grind_too_fine: { fr: "Mouture plus fine que la plage {m} ({dial}). Risque de sur-extraction, amertume et écoulement bouché." },
    grind_too_coarse: { fr: "Mouture plus grossière que la plage {m} ({dial}). Risque de sous-extraction et de tasse acide et creuse." },

    warn_rang_bo: { fr: "Café rang bơ : le filtre papier retient le beurre qui fait son intérêt, il est fait pour la Brikka ou le phin. À tenter quand même au Switch, en baissant la température, et à noter." },
    matrix_or: { fr: "ou" },
    toast_unlinked: { fr: "Dossier délié : les CSV ne sont plus écrits. Tes données restent ici et sur le serveur." },
    sheet_delete_bag: { fr: "Supprimer ce sachet" },
    sheet_stock_aria: { fr: "Il reste {g} g dans le sachet. Corriger à la main" },
    sheet_stock_label: { fr: "Il reste dans le sachet" },
    sheet_stock_to_count: { fr: "à compter" },
    sheet_stock_help: { fr: "Pèse le sachet ou estime : le stock repart de ce chiffre, et chaque tasse suivante s'en retire." },
    sheet_stock_save: { fr: "Enregistrer" },
    sheet_stock_cancel: { fr: "Annuler" },
    sheet_stock_correct: { fr: "Corriger" },
    sheet_stock_enter: { fr: "Saisir ce qu'il reste" },
    sheet_stock_counted: { fr: "Compté à la main le {d}, les tasses suivantes s'en retirent." },
    toast_stock_corrected: { fr: "Stock corrigé : {g} g" },
    confirm_delete_bag: { fr: "Supprimer le sachet acheté le {d} ? Ses tasses restent, seul le sachet part." },
    toast_bag_deleted: { fr: "Sachet supprimé" },
    param_col_dose: { fr: "dose (g)" },
    param_col_water: { fr: "eau (g)" },
    param_col_temp: { fr: "température (°C)" },
    param_col_heat: { fr: "puissance de feu" },
    param_col_dial: { fr: "molette" },
    bubble_aria: { fr: "La tasse du {q}" },
    history_more: { fr: "Afficher {n} de plus ({t} restantes)" },
    matrix_at_home: { fr: "chez toi : {m} sur {n} tasses" },
    matrix_best: { fr: "ta meilleure ici : {r}, {m}" },
    warn_brikka_profile: { fr: "Café noté pour la Brikka : son corps et son chocolat, le papier du Switch les aplatit. À tenter quand même pour comparer, et à noter." },
    warn_wet_hulled: { fr: "Wet hulled dans le Switch : déconseillé, le papier écrase ce profil. La Brikka lui va mieux." },
    warn_dark_roast: { fr: "Torréfaction foncée dans le Switch : déconseillé, le papier accentue l'amertume sèche. La Brikka lui va mieux." },
    warn_brikka_recommended: { fr: "Ce café est noté pour la Brikka. Le Switch marchera mais ce n'est pas là qu'il donne le meilleur." },
    warn_switch_recommended: { fr: "Ce café est noté pour le Switch. La pression de la Brikka peut amplifier son acidité." },

    entry_new: { fr: "Nouvelle extraction" },
    entry_duplicated: { fr: "Nouvelle extraction (dupliquée)" },
    entry_edit: { fr: "Modifier l'extraction" },
    entry_save: { fr: "Enregistrer l'extraction" },
    entry_save_changes: { fr: "Enregistrer la modification" },
    chrono_start: { fr: "Démarrer le chrono" },
    chrono_stop: { fr: "Arrêter et reporter" },
    live_ratio: { fr: "Ratio :" },
    live_grind: { fr: "Mouture :" },
    live_cost: { fr: "Coût :" },
    live_detail: { fr: "{c} crans, {u} µm" },
    live_invalid: { fr: "format invalide" },
    volume_estimate: { fr: "Estimation : {v} ml, reprendre" },
    volume_title: { fr: "Volume estimé pour la méthode {m}, cliquer pour remplir le champ" },

    aside_pick_recipe: { fr: "Choisis une recette pour voir ses étapes ici." },
    aside_pick_coffee: { fr: "Choisis un café pour voir sa fiche ici." },
    aside_step_by_step: { fr: "Mode pas à pas" },
    aside_recommended: { fr: "Recommandé, " },
    aside_machine: { fr: "machine : {m}" },
    aside_recipe: { fr: "recette : {r}" },
    aside_roast: { fr: "torréfaction {t}" },
    aside_price: { fr: "{p} les {g} g, soit {pg} ₫ le gramme" },
    aside_age: { fr: "Torréfié il y a {j} jour{s}, {f}" },
    fresh_degassing: { fr: "encore en dégazage, idéal dans quelques jours" },
    fresh_ok: { fr: "dans la fenêtre utile de 1 à 6 semaines" },
    fresh_old: { fr: "au delà de la fenêtre de 6 semaines" },

    pick_coffee: { fr: "Choisir un café" },
    inactive_suffix: { fr: "(inactif)" },
    all: { fr: "Tous" },
    list_machine: { fr: "machine : {m}" },
    list_inactive: { fr: "inactif" },
    list_added: { fr: "ajouté le {d}" },
    list_hidden: { fr: "masquée" },
    list_custom: { fr: "recette personnelle" },
    btn_edit: { fr: "Modifier" },
    badge_default: { fr: "Par défaut" },
    badge_advanced: { fr: "Avancée" },
    recipe_for_which: { fr: "Pour quels cafés :" },
    recipe_coffees: { fr: "Cafés associés :" },
    form_new_coffee: { fr: "Nouveau café" },
    form_new_recipe: { fr: "Nouvelle recette" },
    form_edit: { fr: "Modifier : {n}" },
    none: { fr: "Aucune" },

    tetsu_40: { fr: "Les 40 premiers pourcents : sucre contre acidité" },
    tetsu_60: { fr: "Les 60 derniers pourcents : le corps" },
    tetsu_line: { fr: "jusqu'à <b>{c} g</b>, soit {p} g" },
    tetsu_end: { fr: "Le bloom se compte : 45 s, le lit gonfle mais ne se vide pas. Ensuite, verser dès que la surface devient mate : plus de reflet d'eau, juste le café mouillé (environ 30 à 40 s à 15 g). Ni flaque, ni lit sec qui attend." },
    walkthrough_bed: { fr: ", dès que la surface devient mate" },

    walkthrough_start: { fr: "Démarrer" },
    walkthrough_stop: { fr: "Arrêter" },
    walkthrough_restart: { fr: "Reprendre à zéro" },
    walkthrough_pour: { fr: "Verser jusqu'à {c} g, soit {p} g{b}." },
    walkthrough_first: { fr: "Verser {c} g{b}, vanne OUVERTE, tourbillon doux pour tout mouiller. Puis attendre 45 s : le lit gonfle mais ne se vide pas, c'est normal." },
    walkthrough_bloom: { fr: " (bloom)" },
    walkthrough_drain: { fr: "Laisser s'écouler entièrement." },

    history_count: { fr: "{n} extraction{s} sur {t}" },
    range_less_than: { fr: "moins de {x}" },

    status_linked: { fr: "Dossier lié : \"{n}\". Chaque ajout ou modification est écrit dans les CSV, avec copie de travail dans le navigateur." },
    status_demo: { fr: "Jeu de démonstration actif, stocké dans le navigateur. Lie un dossier ou importe tes CSV pour passer à tes vraies données." },
    status_browser: { fr: "Données stockées dans le navigateur uniquement. Lie un dossier pour qu'elles vivent dans de vrais fichiers CSV sur ton disque." },
    status_counts: { fr: " ({c} cafés, {e} extractions)" },

    toast_saved: { fr: "Extraction enregistrée" },
    toast_updated: { fr: "Extraction modifiée" },
    toast_deleted: { fr: "Extraction supprimée" },
    toast_duplicated: { fr: "Extraction dupliquée, ajuste et enregistre" },
    dictate: { fr: "Dicter" },
    dictate_listening: { fr: "J'écoute, touche pour finir" },
    dictate_refused: { fr: "Le micro est refusé : autorise-le dans les réglages du navigateur" },
    dictate_network: { fr: "La dictée a besoin d'une connexion" },
    twins_title: { fr: "Tes tasses jumelles" },
    twins_rule: { fr: "Même recette, molette à {c} crans près." },
    twins_rule_preground: { fr: "Même recette, même café." },
    twins_same: { fr: "même café, même molette" },
    twins_same_preground: { fr: "même café" },
    twins_other_coffee: { fr: "un autre café" },
    twins_dial: { fr: "molette {d} ({c})" },
    twins_heat: { fr: "feu {f}" },
    twins_click: { fr: "{n} cran" },
    twins_clicks: { fr: "{n} crans" },
    twins_average: { fr: "Moyenne {m} sur {n} tasses." },
    wheel_times: { fr: "{n} fois" },
    wheel_reading: { fr: "Ta famille la plus cochée : {f}, {n} fois. Celle de tes meilleures tasses : {m}, {x} de moyenne." },
    wheel_reading_alone: { fr: "Ta famille la plus cochée : {f}, {n} fois, et c'est aussi celle de tes meilleures tasses." },
    brew_no_recipe: { fr: "Sans recette" },
    brew_of: { fr: "sur {t}" },
    brew_pour_to: { fr: "verse jusqu'à" },
    brew_next_in: { fr: "suivant dans {t}" },
    brew_step_n: { fr: "étape {n} sur {t}" },
    brew_tap: { fr: "touche l'écran pour la suite" },
    brew_timer: { fr: "chrono" },
    brew_total: { fr: "{v} sur {e} {u} versés" },
    brew_ready: { fr: "Prêt" },
    brew_waiting: { fr: "Au départ : {text}" },
    brew_no_stages: { fr: "Cette recette n'a pas de paliers minutés : le chrono compte, les étapes sont dessous." },
    brew_valve_open: { fr: "Vanne ouverte" },
    brew_valve_closed: { fr: "Vanne fermée" },
    brew_next: { fr: "Dans {d} s : {text}" },
    brew_start_again: { fr: "Recommencer" },
    library_at_home: { fr: "Chez toi : {m} de moyenne sur {n} tasses" },
    library_not_tried: { fr: "Pas encore essayée chez toi" },
    drawing_podium_empty: { fr: "Il faut {n} tasses notées sur une même recette pour monter sur le podium." },
    drawing_podium_aria: { fr: "{r}, {m} de moyenne, ouvrir dans le Guide" },
    drawing_podium_count: { fr: "{n} tasses" },
    drawing_podium_reading: { fr: "Ta meilleure recette : {r}, {m} de moyenne sur {n} tasses." },
    drawing_progress_empty: { fr: "Il faut au moins six tasses notées pour tracer ta progression." },
    drawing_milestone_bag: { fr: "{c} ouvert" },
    drawing_milestone_recipe: { fr: "1re {r}" },
    drawing_progress_up: { fr: "Sur cinq tasses, ta moyenne est passée de {a} à {b} depuis le {d}." },
    drawing_progress_down: { fr: "Sur cinq tasses, ta moyenne est descendue de {a} à {b} depuis le {d}." },
    drawing_ribbon_empty: { fr: "Aucun sachet ces trois derniers mois : ajoute tes achats dans Mes cafés." },
    drawing_ribbon_aria: { fr: "Sachet de {c}, {n} tasses, ouvrir sa fiche" },
    drawing_ribbon_reading: { fr: "Ton meilleur sachet : {a}, {x}. Le moins bon : {b}, {y}." },
    drawing_ribbon_short: { fr: "Un ruban par sachet, de son ouverture à sa dernière tasse ; plus il est plein, mieux ses tasses étaient notées." },
    drawings_panel_help: { fr: "Coche ceux que tu veux voir, et range-les avec les flèches. Le choix suit sur tous tes appareils." },
    drawings_panel_up: { fr: "Monter {d}" },
    drawings_panel_down: { fr: "Descendre {d}" },
    drawings_panel_reset: { fr: "Revenir à l'ordre d'origine" },
    drawings_panel_done: { fr: "Terminé" },
    bubble_close: { fr: "Fermer" },
    bubble_redo: { fr: "Refaire" },
    recap_title: { fr: "Ta semaine, du {a} au {b}" },
    recap_close: { fr: "Refermer" },
    recap_cups: { fr: "tasses" },
    recap_average: { fr: "de moyenne, {n} notées" },
    recap_best: { fr: "la meilleure, {j}" },
    bubble_open_sheet: { fr: "Ouvrir la fiche de ce café" },
    library_video: { fr: "▶ Voir la vidéo" },
    library_youtube: { fr: "Ouvrir sur YouTube" },
    library_source: { fr: "Voir la source" },
    bubble_other_coffees: { fr: "autres cafés" },
    recap_no_coffee: { fr: "café non renseigné" },
    recap_no_recipe: { fr: "sans recette" },
    recap_bars: { fr: "Tasses par jour, du lundi au dimanche" },
    recap_better: { fr: "{x} point{s} de mieux que la semaine d'avant." },
    recap_worse: { fr: "{x} point{s} de moins que la semaine d'avant." },
    recap_coffee: { fr: "Semaine surtout {c} : {n} tasses sur {t}." },
    recap_opened: { fr: "Sachet de {c} ouvert {j}." },
    sheet_fingerprint: { fr: "Son empreinte, contre tes autres cafés" },
    sheet_trajectory: { fr: "Ta trajectoire sur ce café" },
    sheet_grinder: { fr: "Ce café sur le moulin" },
    sheet_compare: { fr: "Comparer avec un autre café" },
    sheet_compare_pick: { fr: "Choisir un café…" },
    sheet_duo_aria: { fr: "Empreintes de {a} et de {b}, superposées" },
    sheet_cmp_score: { fr: "Moyenne" },
    sheet_cmp_machine: { fr: "Surtout" },
    sheet_cmp_setting: { fr: "Meilleur réglage" },
    sheet_cmp_window: { fr: "Fraîcheur" },
    sheet_cmp_cost: { fr: "Coût" },
    sheet_cmp_taste: { fr: "Goût qui revient" },
    sheet_cmp_average: { fr: "{m}, {n} tasses" },
    sheet_cmp_no_setting: { fr: "pas encore assez de tasses" },
    sheet_cmp_days: { fr: "jours {a} à {b} du sachet" },
    sheet_cmp_no_window: { fr: "pas encore de fenêtre" },
    drawing_fingerprint_empty_other: { fr: "Il faut {n} tasses de chaque café avec des goûts cochés pour comparer leurs empreintes." },
    drawing_fingerprint_reading_other: { fr: "Plus de {p} que {c}, moins de {m}." },
    drawing_fingerprint_close_other: { fr: "Son profil ressemble à celui de {c}." },
    drawing_fingerprint_empty: { fr: "Il faut {n} tasses de ce café avec des goûts cochés pour dessiner son empreinte." },
    drawing_fingerprint_reading: { fr: "Plus de {p} que tes autres cafés, moins de {m}." },
    drawing_fingerprint_close: { fr: "Son profil ressemble à celui de tes autres cafés." },
    drawing_trajectory_empty: { fr: "Il faut {n} tasses notées de ce café avec une molette pour tracer ta trajectoire." },
    drawing_trajectory_reading: { fr: "{n} tasses de {r}, dans l'ordre. La meilleure : {d}, {c}, {x}." },
    drawing_degrees: { fr: "{v} °C" },
    drawing_shelf_empty: { fr: "Aucun sachet enregistré : ajoute-en un dans Mes cafés pour remplir l'étagère." },
    drawing_jar_aria: { fr: "{c}, environ {n} tasses, ouvrir sa fiche" },
    drawing_cups_left: { fr: "{n} restantes" },
    drawing_one_cup_left: { fr: "1 restante" },
    drawing_bag_empty: { fr: "sachet vide" },
    drawing_shelf_rebuy: { fr: "À racheter bientôt : {c}." },
    drawing_shelf_ok: { fr: "Liseré cuivre : dans ta fenêtre de fraîcheur. Rouge : passée. Gris : pas encore, ou pas assez de tasses pour le dire." },
    drawing_clock_empty: { fr: "Il faut au moins {n} tasses notées ces trois derniers mois." },
    drawing_morning: { fr: "Le matin" },
    drawing_afternoon: { fr: "L'après-midi" },
    drawing_evening: { fr: "Le soir" },
    drawing_average: { fr: "{m} de moyenne, {n} tasses" },
    drawing_clock_reading: { fr: "{a}, tes tasses sortent mieux. {b}, elles baissent." },
    drawing_clock_level: { fr: "Tes tasses se valent d'un moment à l'autre de la journée." },
    drawing_spectrum_empty: { fr: "Il faut {n} tasses diagnostiquées sur une même recette pour la placer." },
    drawing_under: { fr: "sous-extrait" },
    drawing_balanced: { fr: "équilibré" },
    drawing_over: { fr: "sur-extrait" },
    drawing_spectrum_over: { fr: "{r} penche vers le sur-extrait : moudre un peu plus gros." },
    drawing_spectrum_under: { fr: "{r} penche vers le sous-extrait : moudre un peu plus fin." },
    drawing_spectrum_centre: { fr: "Tes recettes tombent autour de l'équilibre." },
    drawing_grinder_empty: { fr: "Aucune tasse notée avec une molette : les cafés déjà moulus n'y paraissent pas." },
    drawing_grinder_reading: { fr: "Ta zone dorée ({m}) : de {a} à {b}, {x} de moyenne sur {n} tasses." },
    drawing_grinder_no_zone: { fr: "Pas encore de zone dorée : il faut {n} tasses notées à trois crans près." },
    correction_next: { fr: "Pour la prochaine : {q}." },
    correction_then: { fr: "Si ça ne suffit pas : {q}." },
    correction_grind: { fr: "molette {from} → {to} ({e} crans, {a} → {b} µm)" },
    correction_temperature: { fr: "eau à {to} °C au lieu de {from}" },
    correction_heat: { fr: "feu {to} au lieu de {from}" },
    correction_water: { fr: "{to} g d'eau au lieu de {from}" },
    correction_dose: { fr: "{to} g de café au lieu de {from}" },
    correction_prepare: { fr: "Préparer la prochaine" },
    correction_ready: { fr: "La prochaine tasse t'attend dans la saisie, correction appliquée" },
    sheet_view: { fr: "Fiche du café" },
    sheet_highlight: { fr: "Fiche café" },
    sheet_average: { fr: "moyenne, {n} tasses notées" },
    sheet_not_rated: { fr: "pas encore de tasse notée" },
    sheet_mostly: { fr: "{m} surtout" },
    sheet_bag: { fr: "Sachet en cours" },
    sheet_gauge: { fr: "{r} g restants sur {f}" },
    sheet_out_of: { fr: "sur {f}" },
    sheet_cups: { fr: "environ {n} tasses" },
    sheet_rebuy: { fr: "Réachat conseillé." },
    sheet_shop: { fr: "Chez {t}" },
    sheet_no_stock: { fr: "Pas de sachet enregistré : ajoute-le dans Mes cafés pour suivre le stock." },
    sheet_day: { fr: "jour {n}" },
    sheet_window_legend: { fr: "ta fenêtre, jours {a} à {b}" },
    sheet_opened: { fr: "Jour {n} du sachet, ouvert le {d}." },
    sheet_window: { fr: "Tes tasses sont meilleures du jour {a} au jour {b} : {x} de moyenne, contre {y} en dehors." },
    sheet_before: { fr: "Ta fenêtre s'ouvre dans {n} jour(s)." },
    sheet_inside: { fr: "Tu es dedans, encore {n} jour(s)." },
    sheet_inside_edge: { fr: "Tu es dedans, au dernier jour que tes tasses documentent." },
    sheet_after: { fr: "Tu en es sorti depuis {n} jour(s)." },
    sheet_no_window: { fr: "Pas encore de fenêtre : il faut {n} tasses notées sur au moins deux périodes du sachet." },
    sheet_curve: { fr: "Note selon le jour du sachet" },
    sheet_curve_empty: { fr: "Il faut au moins deux tasses notées sur un sachet ouvert pour tracer la courbe." },
    sheet_curve_aria: { fr: "Note de chaque tasse selon le jour du sachet, {n} tasses, avec la moyenne par période" },
    sheet_tastes: { fr: "Goûts qui reviennent" },
    sheet_tastes_empty: { fr: "Aucun goût coché sur ce café pour l'instant." },
    sheet_wheel_aria: { fr: "Roue des arômes de ce café" },
    sheet_setting: { fr: "Meilleur réglage" },
    sheet_latest: { fr: "Dernières tasses" },
    sheet_inactive: { fr: "Ce café est désactivé : réactive-le dans Mes cafés pour le brasser" },
    toast_redo: { fr: "Les réglages de ta dernière tasse sont repris, la note reste à donner" },
    toast_redo_empty: { fr: "Pas encore de tasse à refaire : voici une saisie neuve" },
    toast_coffee: { fr: "Café enregistré" },
    toast_recipe: { fr: "Recette enregistrée" },
    toast_recipe_restored: { fr: "Recette rétablie à sa version d'origine" },
    toast_recipe_deleted: { fr: "Recette supprimée" },
    toast_demo: { fr: "Démonstration chargée" },
    toast_reset: { fr: "Données réinitialisées" },
    toast_folder: { fr: "Dossier \"{n}\" lié" },
    toast_export_all: { fr: "Les six tables en CSV et le fichier complet logbook-full.json téléchargés" },
    toast_export_filter: { fr: "CSV du filtre courant téléchargé" },
    toast_import: { fr: "{n} lignes importées dans la table {t}" },
    toast_copied: { fr: "Message copié" },
    toast_times: { fr: "Temps reportés dans le formulaire" },
    toast_marked: { fr: "Début de l'écoulement marqué" },
    toast_pick_coffee: { fr: "Choisis un café d'abord" },
    toast_dose: { fr: "Renseigne au moins la dose" },
    toast_fs_unavailable: { fr: "Liaison de fichiers non disponible dans ce navigateur (Chrome ou Edge requis, Brave : activer l'API dans brave://flags)" },
    bag_default: { fr: "défaut paquet" },
    preground_aside: { fr: "Déjà moulu, ne pas moudre : le sucre et les graisses encrassent les meules. Mouture par défaut du paquet." },
    warn_flavoured: { fr: "{pct} pour cent de café, le reste est du soja, du sucre et des graisses que le filtre papier retiendrait. Ce café va en Brikka ou en phin." },
    percent_coffee: { fr: "café" },
    badge_benchmark: { fr: "étalon" },
    live_real_cost: { fr: "café réel {v}" },
    live_drink: { fr: "Boisson :" },
    live_milk: { fr: "lait" },
    aside_real_price: { fr: "Café réel : {pr} ₫ le gramme." },
    milk_two: { fr: "{t} ml de tasse moins {v} ml de café : {e} ml à remplir. Verser {l} ml de lait froid en flat white, {c} ml en cappuccino : le lait gonfle en moussant, et plus il mousse moins il en faut." },
    milk_declared: { fr: "Volume de café repris de la recette, faute de mesure." },
    milk_cup_too_small: { fr: "Tasse plus petite que l'extraction : pas de lait, et ne pas tout verser." },
    milk_pick_cup: { fr: "Choisis une tasse pour calculer le lait." },
    toast_cup_invalid: { fr: "Donne un nom et une contenance à la tasse" },
    btn_delete: { fr: "Supprimer" },
    family_chronicler: { fr: "Même famille : Chronicler" },
    family_costaud: { fr: "Les deux Costaud" },
    timer_start: { fr: "Démarrer" },
    timer_pause: { fr: "Pause" },
    timer_resume: { fr: "Reprendre" },
    timer_ready: { fr: "Prêt : les paliers de la recette s'affichent ici." },
    timer_next: { fr: "Puis à {t} (dans {d} s) : {text}" },
    timer_last: { fr: "Dernier palier passé : arrêt manuel quand la tasse est servie." },
    grind_dial_rotations: { fr: "Rotations depuis le zéro" },
    range_tip_short: { fr: "{min} à {max} µm, {minC} à {maxC} crans, molette {dial}" },
    toast_pick_recipe: { fr: "Choisis une recette" },
    toast_recipe_name: { fr: "Donne un nom à la recette" },
    toast_grind_invalid: { fr: "Mouture invalide, format attendu : 1.5.0" },
    toast_quick: { fr: "Extraction enregistrée : {r}, note {n}" },
    toast_quick_unrated: { fr: "Extraction enregistrée : {r}, pas encore notée" },
    toast_link_failed: { fr: "Liaison impossible" },
    table_coffees: { fr: "cafés" },
    table_extractions: { fr: "extractions" },
    table_recipes: { fr: "recettes" },
    table_cups: { fr: "tasses" },
    table_purchases: { fr: "sachets" },
    table_settings: { fr: "réglages" },
    table_all: { fr: "toutes les tables" },

    confirm_delete: { fr: "Supprimer cette extraction ?" },
    confirm_demo: { fr: "Remplacer les données actuelles par la démonstration ? (Exporte les d'abord si tu veux les garder.)" },
    confirm_reset: { fr: "Repartir de zéro ? Les extractions sont effacées et les 5 cafés de départ restaurés. (Exporte d'abord si besoin.)" },
    confirm_restore: { fr: "Rétablir la version d'origine de cette recette ? Tes modifications seront perdues." },
    confirm_delete_recipe: { fr: "Supprimer cette recette personnelle ?" },
    confirm_title: { fr: "Tu confirmes ?" },
    confirm_ok: { fr: "Confirmer" },
  };

  // ---------- 3. Display maps for data values ----------

  /* Empty in French, filled by js/i18n.en.js when switching to English. In
     French these tables are useless: the matching translation function
     returns its input unchanged. */
  const DIAG = {};

  /* Empty in French, filled by js/i18n.en.js when switching to English. In
     French these tables are useless: the matching translation function
     returns its input unchanged. */
  const TAGS = {};

  // Short definition of each descriptor, shown as a tooltip and under the
  // block when a tag is ticked. Format: { fr, en }. No double quotes
  // in the texts (they go into title attributes).
  /* The definitions, in French here, in English in i18n.en.js. */
  const TAGS_INFO = {
    "acidité vive": "Vivacité agréable, qui rend la tasse vivante. Une qualité, pas un défaut.",
    "acidulé": "Petite pointe acide franche et plaisante, comme une pomme croquante.",
    "aigre": "Acidité sèche et agressive, sans profondeur. Signature d une sous extraction.",
    "citronné": "Acidité qui tire vers le citron. Agréable dosée, mordante si elle domine.",
    "vinaigré": "Acidité poussée jusqu au vinaigre. Toujours un défaut.",
    "astringent": "Sensation TACTILE, pas un goût : la bouche s assèche et se resserre, comme après un thé trop infusé.",
    "rugueux": "Texture râpeuse et rude en bouche, sans finesse.",
    "aqueux": "Aucune matière, la tasse ressemble à de l eau colorée.",
    "rance": "Goût de gras oxydé, de vieille noix. Café trop vieux ou mal conservé.",
    "phénolique": "Note médicamenteuse ou de plastique. Défaut du grain, aucun réglage ne l enlève.",
    "rond": "Sensation pleine et douce en bouche, sans angle ni agressivité.",
    "sirupeux": "Épais et enveloppant, coule comme un sirop.",
    "crémeux": "Texture riche qui rappelle la crème, sans lait ajouté.",
    "beurré": "Fondant et gras comme du beurre, typique des cafés rang bơ vietnamiens.",
    "gras": "Texture huileuse qui nappe le palais, plus lourd que crémeux.",
    "velouté": "Doux et dense à la fois, comme un velouté de légumes.",
    "soyeux": "Lisse et fluide, glisse comme de la soie.",
    "liquoreux": "Riche et concentré comme un vin doux ou un porto.",
    "sec": "Finale qui assèche la bouche, comme un vin tannique.",
    "léger": "Corps mince, proche du thé, peu de matière.",
    "chocolat noir": "Cacao intense, amertume noble du chocolat à 70 pour cent et plus.",
    "chocolat au lait": "Chocolat doux et sucré, plus rond que le chocolat noir.",
    "cacao": "Poudre de cacao sec, moins sucré que le chocolat.",
    "noisette": "Noix douce et grillée, classique des arabicas lavés.",
    "amande": "Note de noix plus fine, légèrement sucrée.",
    "cacahuète": "Arachide grillée, fréquent sur les robustas.",
    "caramel": "Sucre cuit, doux et légèrement grillé.",
    "sucre roux": "Sucré rustique, cassonade ou sucre complet.",
    "miel": "Douceur florale et parfumée.",
    "vanille": "Douceur ronde de gousse ou de crème vanillée.",
    "mélasse": "Sucre foncé et dense, presque réglissé.",
    "praliné": "Noix caramélisée, entre noisette et caramel.",
    "banane": "Fruit jaune bien mûr, souvent sur les naturals fermentés.",
    "jacquier": "Fruit tropical sucré et musqué, signature du Liberica.",
    "fruits tropicaux": "Mangue, ananas, litchi : exotique et juteux.",
    "fruit de la passion": "Tropical très aromatique, acidité tranchante.",
    "fruits mûrs": "Fruité confit, très mûr, presque compoté.",
    "fruits rouges": "Fraise, framboise : fruité vif et acidulé.",
    "cerise": "Fruit rouge foncé, entre sucré et acidulé.",
    "fruits secs": "Raisin sec, datte, figue : fruité concentré et sucré.",
    "raisin": "Jus de raisin frais, tirant vers le vineux.",
    "pomme": "Acidité croquante et propre, comme une pomme verte.",
    "agrume": "Citron, orange, pamplemousse : acidité brillante.",
    "pêche": "Fruit à noyau doux, acidité délicate.",
    "floral": "Parfum de fleurs, délicat et aérien.",
    "jasmin": "Floral précis et parfumé, typique des arabicas clairs.",
    "rose": "Floral intense, presque parfum de loukoum.",
    "thé noir": "Tanins fins et finale sèche de thé infusé.",
    "thé vert": "Végétal frais, léger et herbacé.",
    "épices": "Chaleur épicée générale, difficile à isoler.",
    "cannelle": "Épice douce et boisée.",
    "clou de girofle": "Épice chaude, presque médicinale, très aromatique.",
    "réglisse": "Anisé et sucré-amer, note sombre.",
    "poivre": "Piquant léger en fin de bouche, courant sur les robustas.",
    "malt": "Céréale sucrée, rappelle la bière blonde ou l'Ovomaltine.",
    "pain grillé": "Croûte de pain, signe d'une torréfaction bien menée.",
    "biscuit": "Pâtisserie sèche et beurrée, douceur céréalière.",
    "vineux": "Rappelle le vin rouge : acidité et rondeur fermentées.",
    "fermenté": "Fruité alcooleux ou lacté, typique des process anaérobies.",
    "rhum": "Alcool sucré et boisé, canne à sucre fermentée.",
    "fumé": "Fumée de bois, feu de camp, thé lapsang : marqué mais pas âcre.",
    "tabac": "Feuille de tabac blond séchée, sucré-boisé, plutôt noble.",
    "cuir": "Cuir, selle, un peu animal : fréquent sur les robustas et les vieux natural.",
    "salé": "Une sensation salée et creuse, comme l'eau salée de la calibration : la signature d'une sous-extraction.",
    "métallique": "Goût de fer, de pièce de monnaie. À la Brikka : flamme trop forte en fin d'écoulement, ou panier mal rincé.",
    "cassis": "Baie noire acidulée, typique des lavés du Kenya.",
    "prune": "Fruit à noyau sombre et juteux, entre la cerise et le pruneau.",
    "orange": "Agrume doux et sucré, moins mordant que le citron.",
    "sucre de canne": "Sucré clair et propre, moins profond que la cassonade.",
    "brûlé": "Torréfaction poussée trop loin : âcre, carbonisé, désagréable.",
    "cendre": "Cendre froide, sec et poussiéreux : défaut net.",
    "caoutchouc": "Pneu ou gomme, défaut classique des robustas poussés.",
    "terreux": "Terre humide, sous-bois, champignon : un trait courant des robustas, pas forcément un défaut.",
    "boisé": "Bois sec, crayon, tonneau : un trait du liberica, ou le signe d'un café vieilli.",
    "moisi": "Humidité et moisissure, défaut de stockage du grain.",
    "papier": "Carton ou papier mouillé, café éventé ou filtre mal rincé.",
  };

  /* Empty in French, filled by js/i18n.en.js when switching to English. In
     French these tables are useless: the matching translation function
     returns its input unchanged. */
  const GROUPS = {};

  const METHODS = {}; // filled by js/i18n.en.js

  const MACHINES = {}; // filled by js/i18n.en.js

  // ---------- Engine ----------

  const registry = []; // { node, fr, en }
  const attrEntries = []; // { el, attr, fr, en }: placeholder, title, aria-label
  let scanDone = false;
  /* Did the scan have a dictionary at hand? In French there is none,
     and an empty scan records nothing: it must be redone when the
     English bundle arrives. See mergeBundle(). */
  let scanHadDict = false;

  const ZONES_JS = "#grid-recipes,#h-body,#kpis,#latest-list,#recipes-list,#coffees-list," +
    "#conv-result,#table-ranges,#warnings,#aside-recipe,#aside-coffee,#duel-machines," +
    "#tetsu-block,#wt-steps,#g-heatmap,#ruler,#f-diagnostic,#f-descriptors,#f-recipe,#f-coffee," +
    "#h-coffee,#h-diagnostic,#q-coffee,#q-recipe,#c-recipe,#db-status,#toast,#wt-params," +
    "#insights,#sync-status,#heatmap-stats,#version-site,#comparison-count,#tuning-list," +
    "#comparison-summary,#comparison-titles,#comparison-body," +
    "#empty-grind,#empty-tastes,#empty-duel,#rating-tastes,#param-recipes,#rating-shown," +
    "#aside-twins,#wheel-detail,#reading-aromas,#empty-aromas,#f-dictate-text,#sheet-content," +
    "#br-machine,#br-title,#br-dose,#br-over,#br-target,#br-valve,#br-instruction,#br-next,#br-timeline," +
    "#br-go,#br-rating-spoken," +
    "#drawing-etagere,#drawing-horloge,#drawing-spectre,#drawing-moulin," +
    "#drawing-etagere-reading,#drawing-horloge-reading,#drawing-spectre-reading,#drawing-moulin-reading," +
    "#card-recap,#legend-30d,#aside-video,#matrix-recipes,#sheet-comparison,#sheet-duo,#sheet-footprint,#sheet-trajectory,#sheet-grinder," +
    "#drawings-panel,#bubble-cup,#drawing-frise,#drawing-podium,#drawing-progression,#drawing-frise-reading,#drawing-podium-reading,#drawing-progression-reading";

  function scan() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "PRE" || tag === "CODE" || tag === "TEXTAREA") {
          return NodeFilter.FILTER_REJECT;
        }
        if (p.closest(ZONES_JS)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = walker.nextNode())) {
      const raw = n.nodeValue;
      const key = raw.trim();
      if (!key || !UI[key]) continue;
      const lead = (raw.match(/^\s*/) || [""])[0];
      const trail = /\s$/.test(raw) ? " " : "";
      registry.push({ node: n, fr: raw, en: lead + UI[key] + trail });
    }

    /* TEXT ATTRIBUTES. The walk above only sees text nodes:
       placeholders, tooltips and screen reader labels escape it,
       and so stayed French in English mode.

       Same rule as for text, and that is what makes the pass safe: recorded
       ONLY if they have a dictionary entry. The grinder field placeholder
       is "1.5.0" or "du paquet" depending on whether the coffee is pre-ground,
       and the entry code decides that: with no entry, it is never captured, so
       never rewritten here.

       Zones regenerated by JS are excluded, as for text. Keeping a
       reference to them would be worse than useless: the node is replaced on
       every render, and the code regenerating it already translates what it writes. */
    ["placeholder", "title", "aria-label"].forEach(attr => {
      document.querySelectorAll("[" + attr + "]").forEach(el => {
        if (el.closest && el.closest(ZONES_JS)) return;
        const fr = el.getAttribute(attr);
        if (fr && UI[fr]) attrEntries.push({ el, attr, fr, en: UI[fr] });
      });
    });
    scanDone = true;
    scanHadDict = Object.keys(UI).length > 0;
  }

  function applyStatic() {
    if (!scanDone) scan();
    registry.forEach(r => {
      try { r.node.nodeValue = lang === "en" ? r.en : r.fr; } catch (e) { /* node gone */ }
    });
    document.documentElement.setAttribute("data-lang", lang);
    document.documentElement.setAttribute("lang", lang);
    document.title = t("doc_title");
    attrEntries.forEach(a => {
      try { a.el.setAttribute(a.attr, lang === "en" ? a.en : a.fr); } catch (e) { /* node gone */ }
    });
  }

  function t(key, vars) {
    const e = T[key];
    let s = e ? (e[lang] || e.fr) : key;
    if (vars) Object.keys(vars).forEach(k => { s = s.split("{" + k + "}").join(vars[k]); });
    return s;
  }

  // hasOwnProperty (v8.77): a coffee named « constructor » showed a function in English.
  function tr(text) { return lang === "en" && Object.prototype.hasOwnProperty.call(UI, text) ? UI[text] : text; }
  // Grinder range "0.8.3 à 1.5.4": the "à" becomes "to" in English.
  function dialRange(s) { return lang === "en" ? String(s).replace(" à ", " to ") : s; }
  function diag(d) { return lang === "en" ? (DIAG[d] || d) : d; }
  function tag(d) { return lang === "en" ? (TAGS[d] || d) : d; }
  /* The values are French STRINGS, and the English bundle replaces them
     with a { fr, en } pair on load. So both forms are accepted:
     a bare string means French. */
  function tagInfo(d) {
    const e = TAGS_INFO[d];
    if (!e) return "";
    return typeof e === "string" ? e : (e[lang] || e.fr);
  }
  function group(g) { return lang === "en" ? (GROUPS[g] || g) : g; }
  function method(m) { return lang === "en" ? (METHODS[m] || m) : m; }
  function machine(m) { return lang === "en" ? (MACHINES[m] || m) : m; }
  function locale() { return lang === "en" ? "en-GB" : "fr-FR"; }
  function days() { return t("weekdays").split("|"); }
  function months() { return t("months_short").split("|"); }

  const subscribers = [];
  function subscribe(fn) { subscribers.push(fn); }

  /* LOADING THE ENGLISH BUNDLE.

     The dictionaries above are empty in French, on purpose:
     tr(), diag(), tag() and friends return their input unchanged as long as
     the language is "fr", and templates fall back on their French half.
     French therefore has literally no use for 29 KB gzipped of English.

     The bundle fills them IN PLACE, without reassigning the constants: the rest
     of the file keeps its references, nothing needs rewiring. */
  let enBundle = null;

  function mergeBundle(p) {
    if (!p) return false;
    /* The previous scan ran without a dictionary, so it recorded
       nothing: it must be redone now that the bundle is here. The
       condition matters. Rescanning after a translation was already applied
       would record the displayed English as the French text, and
       switching back to French would render English. */
    if (!scanHadDict) { scanDone = false; registry.length = 0; attrEntries.length = 0; }
    Object.entries(p.T || {}).forEach(([k, v]) => { if (T[k]) T[k].en = v; });
    Object.entries(p.TAGS_INFO || {}).forEach(([k, v]) => {
      if (TAGS_INFO[k] !== undefined) TAGS_INFO[k] = { fr: TAGS_INFO[k], en: v };
    });
    [["UI", UI], ["DIAG", DIAG], ["TAGS", TAGS], ["GROUPS", GROUPS],
      ["METHODS", METHODS], ["MACHINES", MACHINES]].forEach(([name, target]) => {
      Object.assign(target, p[name] || {});
    });
    return true;
  }

  function loadEnglish() {
    if (enBundle) return enBundle;
    if (typeof I18N_EN !== "undefined") { mergeBundle(I18N_EN); enBundle = Promise.resolve(true); return enBundle; }
    enBundle = new Promise(resolve => {
      const s = document.createElement("script");
      s.src = TOOLS.versionedUrl("js/i18n.en.js");
      s.onload = () => resolve(mergeBundle(typeof I18N_EN !== "undefined" ? I18N_EN : null));
      // Load failure: stay in French rather than show a half
      // translated site. enBundle goes back to null to allow a retry.
      s.onerror = () => { enBundle = null; resolve(false); };
      document.head.appendChild(s);
    });
    return enBundle;
  }

  function applyLanguage(next) {
    lang = next;
    try { localStorage.setItem("lang", lang); } catch (e) { /* unavailable */ }
    applyStatic();
    subscribers.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  }

  async function toggleLanguage() {
    const target = lang === "fr" ? "en" : "fr";
    if (target === "en" && !await loadEnglish()) return;
    applyLanguage(target);
  }

  /* Called at startup when the saved language is English: the bundle
     must be here BEFORE the first render, otherwise the page shows in French and then
     flickers. */
  async function prepare(wantedLang) {
    if (wantedLang !== "en") return;
    if (await loadEnglish()) lang = "en";
  }

  return {
    t, tr, dialRange, diag, tag, tagInfo, group, method, machine, locale, days, months,
    subscribe, toggleLanguage, applyStatic, prepare,
    wantedLanguage: () => wantedLanguage,
    lang: () => lang,
  };
})();
