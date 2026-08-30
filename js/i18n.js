// Internationalisation : français par défaut, anglais en bascule.
// Trois mécanismes :
// 1. UI : correspondance de textes pour tout le contenu statique de la page.
//    Chaque fragment de texte français est la clé, l'anglais la valeur.
// 2. T : gabarits pour les chaînes construites en JavaScript, avec variables.
// 3. Cartes d'affichage pour les valeurs de données (diagnostics, descripteurs) :
//    la valeur stockée reste française, seul l'affichage change.
"use strict";

const I18N = (() => {

  let lang = "fr";
  /* Souhait enregistré, PAS la langue courante : basculer avant d'avoir le paquet
     afficherait une page qui se déclare anglaise et rend du français par repli.
     C'est preparer(), appelée au démarrage, qui tranche une fois le paquet là. */
  let langueSouhaitee = "fr";
  try {
    const l = localStorage.getItem("langue");
    if (l === "en") langueSouhaitee = "en";
  } catch (e) { /* indisponible */ }

  // ---------- 1. Contenu statique : français vers anglais ----------

  /* Vide en français, rempli par js/i18n.en.js au passage en anglais. En
     français ces tables ne servent à rien : la fonction de traduction
     correspondante renvoie son entrée telle quelle. */
  const UI = {};

  // ---------- 2. Gabarits pour les chaînes dynamiques ----------

  const T = {
    doc_title: { fr: "Carnet d'extraction : Brikka et Switch" },

    kpi_auj: { fr: "aujourd'hui" },
    kpi_semaine: { fr: "cette semaine" },
    kpi_total: { fr: "au total" },
    kpi_note: { fr: "note moyenne globale" },
    kpi_note7: { fr: "note moyenne 7 jours" },
    kpi_cafeine: { fr: "caféine par jour, 7 jours (estimation)" },

    l_tendance: { fr: "Tendance, moyenne des 5 dernières tasses" },
    l_note_jour: { fr: "Note moyenne du jour" },
    l_cafe_g: { fr: "Café consommé (g)" },
    tip_cafe_g: { fr: "{g} g de café" },
    l_extractions: { fr: "Extractions" },
    axe_note: { fr: "Note sur 10" },
    axe_note_moy: { fr: "Note moyenne" },
    axe_mouture: { fr: "Mouture (microns)" },
    axe_age: { fr: "Âge du café (jours après torréfaction)" },
    unite_jours: { fr: "jours" },
    tip_cafeine: { fr: "Caféine : environ {mg} mg" },
    b_extractions: { fr: "{n} extractions" },

    // Insights automatiques du tableau de bord. Phrases construites en JS, donc
    // gabarits T et pas entrées UI. Éviter les pluriels variables dans les
    // formulations : les nombres arrivent déjà formatés.
    ins_cafe_levier: { fr: "Sur ton {cafe} en {machine} : {levier} {valeur} donne {haut} de moyenne sur {n} tasses, contre {bas} pour le reste." },
    ins_global: { fr: "Toutes tasses confondues : {p}" },
    lev_feu: { fr: "puissance de feu" },
    lev_prechauffage: { fr: "eau préchauffée" },
    lev_recette: { fr: "recette" },
    lev_dose: { fr: "dose" },
    lev_mouture: { fr: "mouture" },
    lev_paquet: { fr: "âge du paquet" },
    ins_paquet_frais: { fr: "dans la première semaine après ouverture" },
    ins_paquet_median: { fr: "entre 1 et 3 semaines après ouverture" },
    ins_paquet_vieux: { fr: "au delà de 3 semaines après ouverture" },
    ins_paquet: { fr: "Tes tasses sont meilleures {quand} : {haut} de moyenne contre {bas} le reste du temps." },
    ins_recettes: { fr: "{gagnante} passe devant {perdante} : {haut} de moyenne contre {bas}." },
    ins_moment_matin: { fr: "le matin" },
    ins_moment_aprem: { fr: "l'après midi" },
    ins_moment_soir: { fr: "le soir" },
    ins_moment: { fr: "Tes tasses {quand} sortent mieux : {haut} de moyenne contre {bas} au reste de la journée." },


    ins_puissance: { fr: "Sur la Brikka, une puissance de feu de {feu} te réussit mieux : {haut} de moyenne contre {bas} aux autres réglages." },

    ins_vide: { fr: "Pas encore assez de matière. Une tendance ne veut dire quelque chose qu'à partir de {n} extractions notées dans chacun des groupes comparés." },
    // États de la synchronisation entre appareils.
    sync_local: { fr: "Synchronisation indisponible en local : tes données restent sur cet appareil." },
    sync_demo: { fr: "Démonstration : rien n'est synchronisé." },
    sync_encours: { fr: "Synchronisation en cours..." },
    sync_ok: { fr: "Synchronisé à {h}." },
    sync_horsligne: { fr: "Hors ligne. Tes saisies sont gardées ici et partiront à la prochaine synchro." },
    sync_session: { fr: "Session expirée, reconnecte toi pour synchroniser." },
    sync_nonconf: { fr: "Synchronisation pas encore configurée sur le serveur (base D1 à lier)." },
    sync_erreur: { fr: "Synchronisation en échec. Tes données locales sont intactes." },
    sync_jamais: { fr: "Pas encore synchronisé." },
    t_sync_ok: { fr: "Synchronisé" },
    t_sync_ko: { fr: "Synchronisation impossible" },

    d_ext_brikka: { fr: "extractions Brikka" },
    d_ext_switch: { fr: "extractions Switch" },
    d_note: { fr: "note moyenne" },
    molette: { fr: "molette" },

    hm_aria: { fr: "Extractions par jour" },
    hm_aucune: { fr: "aucune extraction" },
    hm_n: { fr: "{n} extraction" },
    hm_ns: { fr: "{n} extractions" },
    hm_note: { fr: "note moyenne {x}" },
    // Cartes qui peuvent rester vides avec des données parfaitement valides.
    // Chaque message donne la cause RÉELLE et l'action qui la débloque.
    vide_rien: { fr: "Aucune extraction notée pour l'instant. Note tes tasses et ce graphique se remplira." },
    vide_mouture_moulu: { fr: "Tous tes cafés extraits sont marqués déjà moulus, donc aucun réglage de molette n'est enregistré : ce n'est pas un bug. Une extraction avec un café en grains et le nuage démarre." },
    vide_mouture: { fr: "Aucun réglage de molette enregistré sur tes extractions notées." },
    vide_gouts_aucun: { fr: "Tu n'as pas encore coché de descripteurs. Coche ce que tu sens en saisie, et ce graphique te dira quels goûts annoncent tes bonnes tasses." },
    vide_gouts_seuil: { fr: "Aucun descripteur n'atteint encore 3 tasses. Continue à cocher les mêmes mots et le classement apparaîtra." },
    gouts_note: { fr: "Note moyenne des tasses où tu as coché le descripteur, à partir de {n} tasses. Vert au dessus de ta moyenne ({m}), rouge en dessous." },
    vide_duel_une_machine: { fr: "Tu n'as encore utilisé qu'une seule machine. Passe un même café en Brikka et au Switch pour les comparer." },
    vide_duel: { fr: "Aucun café n'est encore passé dans les deux machines avec une note." },

    // Stock du sachet en cours.
    stock_reste: { fr: "reste {g} g, environ {n} tasses" },
    stock_vide: { fr: "sachet fini" },
    stock_titre: { fr: "Sachet de {f} g. {c} g consommés, {r} g restants. Estimation à {d} g par tasse, {src}." },
    stock_dose_moy: { fr: "ta dose moyenne sur ce café" },
    stock_dose_defaut: { fr: "la dose de repli, ce café n'a pas encore d'extraction" },
    n_pas_notee: { fr: "pas encore notée" },
    btn_sachet: { fr: "Nouveau sachet" },
    sachet_titre: { fr: "Nouveau sachet : {n}" },
    t_sachet: { fr: "Sachet enregistre" },
    t_brouillon: { fr: "Brouillon repris" },

    // Détail dépliable et comparateur de l historique.
    d_cafe: { fr: "Café" },
    d_methode: { fr: "Méthode" },
    d_recette: { fr: "Recette" },
    d_dose: { fr: "Dose" },
    d_eau: { fr: "Eau" },
    d_ratio: { fr: "Ratio" },
    d_mouture: { fr: "Mouture" },
    d_temp: { fr: "Température" },
    d_puissance: { fr: "Puissance de feu" },
    d_prechauffee: { fr: "Eau préchauffée" },
    d_total: { fr: "Temps total" },
    d_ecoulement: { fr: "Écoulement" },
    d_volume: { fr: "Volume extrait" },
    d_eau_ajoutee: { fr: "Eau ajoutée" },
    d_lait: { fr: "Lait" },
    d_agitation: { fr: "Agitation" },
    d_tasse: { fr: "Tasse" },
    d_boisson: { fr: "Volume boisson" },
    d_cout: { fr: "Coût" },
    d_note: { fr: "Note" },
    d_diagnostic: { fr: "Diagnostic" },
    d_descripteurs: { fr: "Descripteurs" },
    d_commentaire: { fr: "Commentaire" },
    d_rien: { fr: "Rien de plus à montrer sur cette extraction." },
    h_editer: { fr: "Ouvrir en édition" },
    h_detail: { fr: "Voir le détail" },
    h_comparer: { fr: "Comparer avec une autre" },
    cmp_une: { fr: "1 extraction sélectionnée, choisis en une seconde." },
    cmp_deux: { fr: "2 extractions sélectionnées." },
    cmp_ecart: { fr: "{x} point d écart entre les deux. Les lignes surlignées sont les seules différences." },
    cmp_sans_note: { fr: "Une des deux tasses n a pas de note. Les lignes surlignées sont les différences." },
    oui: { fr: "oui" },
    non: { fr: "non" },

    // Ecran Mes meilleurs reglages.
    rg_moyenne: { fr: "{m} de moyenne sur {n} tasses" },
    rg_sur: { fr: "sur {n} tasses" },
    rg_mieux: { fr: "{x} point de mieux que ta moyenne sur ce café" },
    rg_moins: { fr: "{x} point sous ta moyenne sur ce café" },
    rg_feu: { fr: "feu {f} / 10" },
    rg_refaire: { fr: "Refaire cette tasse" },
    rg_preremplie: { fr: "Saisie préremplie avec ce réglage" },
    rg_aucune: { fr: "Aucune tasse notée sur ce café pour l instant." },
    rg_pas_assez: { fr: "Encore {n} tasse au même réglage et un gagnant apparaîtra. Il en faut {s} identiques." },
    rg_eparpille: { fr: "Assez de tasses, mais chacune à un réglage différent. Refais {n} fois ton réglage le plus joué plutôt que d en essayer un nouveau." },
    rg_sans_cafe: { fr: "Ajoute un café pour voir tes réglages ici." },

    param_vide: { fr: "aucune" },
    param_temp_feu: { fr: "dépend de la puissance du feu" },
    t_param_ok: { fr: "{n} recette(s) mise(s) à jour." },
    t_param_replis: { fr: "Valeurs de repli enregistrées." },
    t_param_dose: { fr: "La dose de repli doit être supérieure à zéro." },
    t_param_feu: { fr: "La puissance de feu de repli doit être entre 1 et 10." },

    lait_sans_volume: { fr: "Renseigne le volume extrait pour que le lait se calcule tout seul." },

    param_molette_detail: { fr: "{c} crans, environ {m} microns" },

    t_edition_abandonnee: { fr: "Modification abandonnée, tu repars sur une saisie neuve." },

    cm_deux: { fr: "Ce réglage marche sur la Brikka ET sur le Switch." },
    cm_brikka: { fr: "Bon pour la Brikka, trop fin pour le Switch." },
    cm_switch: { fr: "Bon pour le Switch, trop grossier pour la Brikka." },
    cm_aucune: { fr: "Hors plage pour tes deux machines." },
    cm_plus_fin: { fr: "Plus FIN, vers la gauche : l'eau traverse plus lentement, tu extrais davantage. Plus de corps et de sucrosité, puis de l'amertume et de l'astringence si tu vas trop loin." },
    cm_plus_grossier: { fr: "Plus GROSSIER, vers la droite : l'eau passe plus vite, tu extrais moins. Plus clair et plus vif, puis acide et creux si tu vas trop loin." },
    cm_actuel: { fr: "C'est ton réglage enregistré, {m}." },
    cm_ecart: { fr: "{n} cran(s) à {sens} depuis ton réglage enregistré, {m}. Un numéro entier vaut 5 crans : en dessous, ça ne se sent pas en tasse." },
    cm_ouvrir: { fr: "ouvrir" },
    cm_fermer: { fr: "fermer" },
    cv_appliquer: { fr: "Utiliser comme réglage par défaut" },
    cv_deja: { fr: "C'est déjà ton réglage par défaut" },
    t_molette_appliquee: { fr: "Réglage par défaut : {m}. La saisie le prérempli maintenant." },

    ap_jours: { fr: "Paquet ouvert depuis {n} jour(s)." },
    d_ouvert: { fr: "Jours d'ouverture" },

    cout_tasse: { fr: "{v} la tasse de {d} g" },
    cout_reel: { fr: "({v} en café réel)" },

    t_annuler: { fr: "Annuler" },
    t_restauree: { fr: "Extraction rétablie." },

    a_adapte: { fr: "versements adaptés à {e} g" },

    rt_tasse_court: { fr: "en tasse" },
    rt_chaudiere: { fr: "{e} g d eau pour {d} g de café. C est la convention universelle du café, celle qui se compare à n importe quelle recette. Sur la Brikka, l eau comptée est celle de la chaudière." },
    rt_infusion: { fr: "Ratio d infusion : {e} g d eau divisés par {d} g de café. Sur le Switch l eau versée traverse le café, donc c est le bon calcul." },
    rt_boisson_court: { fr: "boisson" },
    rt_rien: { fr: "Renseigne la dose et l eau, ou le volume extrait, pour voir le ratio." },

    kpi_regularite: { fr: "régularité, écart moyen à ta moyenne" },

    hm_st_tasses: { fr: "tasses" },
    hm_st_jours: { fr: "jours actifs" },
    hm_st_serie_now: { fr: "série en cours" },
    hm_st_serie_max: { fr: "meilleure série" },
    hm_st_semaine: { fr: "tasses par semaine" },
    hm_resume_vide: { fr: "Aucune extraction sur les {s} dernières semaines." },
    jours: { fr: "Lun|Mar|Mer|Jeu|Ven|Sam|Dim" },
    mois: { fr: "janv.|févr.|mars|avr.|mai|juin|juil.|août|sept.|oct.|nov.|déc." },

    rg_aria: { fr: "Plages de mouture par méthode" },
    rg_microns: { fr: "microns" },
    rg_tip: { fr: "{nom} : {min} à {max} µm, molette {mol}" },
    rg_ref_tip: { fr: "{dial} : {usage}, {crans} crans, environ {u} µm" },

    cv_crans: { fr: "crans" },
    cv_environ: { fr: "environ" },
    cv_microns: { fr: "microns" },
    cv_bande: { fr: "bande" },
    cv_compatible: { fr: "compatible :" },
    cv_hors: { fr: "hors de toute plage recommandée" },
    cv_erreur: { fr: "Format attendu : rotation.numéro.cran, par exemple 1.5.0 (rotation 0 à 3, numéro 0 à 9, cran 0 à 4, butée à 3.0.0)." },
    plage_moins_u: { fr: "moins de {x}" },
    plage_a: { fr: "{a} à {b}" },

    g_format: { fr: "Format attendu : rotation.numéro.cran, par exemple 1.5.0" },
    g_fine: { fr: "Mouture plus fine que la plage {m} ({mol}). Risque de sur-extraction, amertume et écoulement bouché." },
    g_grosse: { fr: "Mouture plus grossière que la plage {m} ({mol}). Risque de sous-extraction et de tasse acide et creuse." },

    w_rangbo: { fr: "Café rang bơ : le filtre papier retient une partie du beurre. À tenter quand même, en baissant la température, et à noter." },
    w_wethulled: { fr: "Wet hulled dans le Switch : déconseillé, le papier écrase ce profil. La Brikka lui va mieux." },
    w_foncee: { fr: "Torréfaction foncée dans le Switch : déconseillé, le papier accentue l'amertume sèche. La Brikka lui va mieux." },
    w_brikka_reco: { fr: "Ce café est noté pour la Brikka. Le Switch marchera mais ce n'est pas là qu'il donne le meilleur." },
    w_switch_reco: { fr: "Ce café est noté pour le Switch. La pression de la Brikka peut amplifier son acidité." },

    s_nouvelle: { fr: "Nouvelle extraction" },
    s_dupliquee: { fr: "Nouvelle extraction (dupliquée)" },
    s_modifier: { fr: "Modifier l'extraction" },
    s_enregistrer: { fr: "Enregistrer l'extraction" },
    s_enregistrer_modif: { fr: "Enregistrer la modification" },
    chrono_start: { fr: "Démarrer le chrono" },
    chrono_stop: { fr: "Arrêter et reporter" },
    lv_ratio: { fr: "Ratio :" },
    lv_mouture: { fr: "Mouture :" },
    lv_cout: { fr: "Coût :" },
    lv_detail: { fr: "{c} crans, {u} µm" },
    lv_invalide: { fr: "format invalide" },
    vol_estime: { fr: "Estimation : {v} ml, reprendre" },
    vol_titre: { fr: "Volume estimé pour la méthode {m}, cliquer pour remplir le champ" },

    a_choisir_recette: { fr: "Choisis une recette pour voir ses étapes ici." },
    a_choisir_cafe: { fr: "Choisis un café pour voir sa fiche ici." },
    a_pap: { fr: "Mode pas à pas" },
    a_reco: { fr: "Recommandé, " },
    a_machine: { fr: "machine : {m}" },
    a_recette: { fr: "recette : {r}" },
    a_torref: { fr: "torréfaction {t}" },
    a_prix: { fr: "{p} les {g} g, soit {pg} ₫ le gramme" },
    a_age: { fr: "Torréfié il y a {j} jour{s}, {f}" },
    f_degaz: { fr: "encore en dégazage, idéal dans quelques jours" },
    f_ok: { fr: "dans la fenêtre utile de 1 à 6 semaines" },
    f_vieux: { fr: "au delà de la fenêtre de 6 semaines" },

    choisir_cafe: { fr: "Choisir un café" },
    inactif: { fr: "(inactif)" },
    tous: { fr: "Tous" },
    li_machine: { fr: "machine : {m}" },
    li_inactif: { fr: "inactif" },
    li_ajoute: { fr: "ajouté le {d}" },
    li_masquee: { fr: "masquée" },
    li_perso: { fr: "recette personnelle" },
    btn_modifier: { fr: "Modifier" },
    badge_defaut: { fr: "Par défaut" },
    badge_avancee: { fr: "Avancée" },
    r_pourqui: { fr: "Pour quels cafés :" },
    r_cafes: { fr: "Cafés associés :" },
    fc_nouveau: { fr: "Nouveau café" },
    fr_nouvelle: { fr: "Nouvelle recette" },
    f_modif: { fr: "Modifier : {n}" },
    aucune: { fr: "Aucune" },

    te_40: { fr: "Les 40 premiers pourcents : sucre contre acidité" },
    te_60: { fr: "Les 60 derniers pourcents : le corps" },
    te_ligne: { fr: "verser <b>{p} g</b>, total {c} g" },
    te_fin: { fr: "Verser à chaque fois que le lit vient de s'assécher en surface, environ toutes les 30 à 45 secondes." },

    pap_demarrer: { fr: "Démarrer" },
    pap_arreter: { fr: "Arrêter" },
    pap_reprendre: { fr: "Reprendre à zéro" },
    pap_verser: { fr: "Verser {p} g{b}, total {c} g. Attendre que le lit s'assèche en surface." },
    pap_bloom: { fr: " (bloom)" },
    pap_drain: { fr: "Laisser s'écouler entièrement." },

    h_compte: { fr: "{n} extraction{s} sur {t}" },
    plus_gros: { fr: "moins de {x}" },

    statut_lie: { fr: "Dossier lié : \"{n}\". Chaque ajout ou modification est écrit dans les CSV, avec copie de travail dans le navigateur." },
    statut_demo: { fr: "Jeu de démonstration actif, stocké dans le navigateur. Lie un dossier ou importe tes CSV pour passer à tes vraies données." },
    statut_nav: { fr: "Données stockées dans le navigateur uniquement. Lie un dossier pour qu'elles vivent dans de vrais fichiers CSV sur ton disque." },
    statut_compte: { fr: " ({c} cafés, {e} extractions)" },

    t_enregistree: { fr: "Extraction enregistrée" },
    t_modifiee: { fr: "Extraction modifiée" },
    t_supprimee: { fr: "Extraction supprimée" },
    t_dupliquee: { fr: "Extraction dupliquée, ajuste et enregistre" },
    t_cafe: { fr: "Café enregistré" },
    t_recette: { fr: "Recette enregistrée" },
    t_retablie: { fr: "Recette rétablie à sa version d'origine" },
    t_recette_supprimee: { fr: "Recette supprimée" },
    t_demo: { fr: "Démonstration chargée" },
    t_reinit: { fr: "Données réinitialisées" },
    t_dossier: { fr: "Dossier \"{n}\" lié" },
    t_export_tout: { fr: "cafes.csv, extractions.csv et recettes.csv téléchargés" },
    t_export_filtre: { fr: "CSV du filtre courant téléchargé" },
    t_import: { fr: "{n} lignes importées dans la table {t}" },
    t_copie: { fr: "Message copié" },
    t_temps: { fr: "Temps reportés dans le formulaire" },
    t_marque: { fr: "Début de l'écoulement marqué" },
    t_choisis_cafe: { fr: "Choisis un café d'abord" },
    t_dose: { fr: "Renseigne au moins la dose" },
    t_fs: { fr: "Liaison de fichiers non disponible dans ce navigateur (Chrome ou Edge requis, Brave : activer l'API dans brave://flags)" },
    paquet: { fr: "défaut paquet" },
    paquet_aside: { fr: "Déjà moulu, ne pas moudre : le sucre et les graisses encrassent les meules. Mouture par défaut du paquet." },
    w_aromatise: { fr: "{pct} pour cent de café, le reste est du soja, du sucre et des graisses que le filtre papier retiendrait. Ce café va en Brikka ou en phin." },
    pct_cafe: { fr: "café" },
    badge_etalon: { fr: "étalon" },
    lv_cout_reel: { fr: "café réel {v}" },
    lv_boisson: { fr: "Boisson :" },
    lv_lait: { fr: "lait" },
    a_prix_reel: { fr: "Café réel : {pr} ₫ le gramme." },
    lait_calc: { fr: "Calcul : {t} ml de tasse moins {v} ml de café = {l} ml de lait." },
    lait_trop_petit: { fr: "Tasse plus petite que l'extraction : pas de lait, et ne pas tout verser." },
    lait_choisir_tasse: { fr: "Choisis une tasse pour calculer le lait." },
    t_tasse_invalide: { fr: "Donne un nom et une contenance à la tasse" },
    btn_supprimer: { fr: "Supprimer" },
    fam_chronicler: { fr: "Même famille : Chronicler" },
    fam_costaud: { fr: "Les deux Costaud" },
    ch_demarrer: { fr: "Démarrer" },
    ch_pause: { fr: "Pause" },
    ch_reprendre: { fr: "Reprendre" },
    ch_pret: { fr: "Prêt : les paliers de la recette s'affichent ici." },
    ch_suivante: { fr: "Puis à {t} (dans {d} s) : {texte}" },
    ch_derniere: { fr: "Dernier palier passé : arrêt manuel quand la tasse est servie." },
    dg_rotations: { fr: "Rotations depuis le zéro" },
    rg_tip_court: { fr: "{min} à {max} µm, {minC} à {maxC} crans, molette {mol}" },
    t_choisis_recette: { fr: "Choisis une recette" },
    t_nom_recette: { fr: "Donne un nom à la recette" },
    t_mouture_invalide: { fr: "Mouture invalide, format attendu : 1.5.0" },
    t_rapide: { fr: "Extraction enregistrée : {r}, note {n}" },
    t_liaison: { fr: "Liaison impossible" },
    tbl_cafes: { fr: "cafés" },
    tbl_extractions: { fr: "extractions" },
    tbl_recettes: { fr: "recettes" },

    c_suppr: { fr: "Supprimer cette extraction ?" },
    c_demo: { fr: "Remplacer les données actuelles par la démonstration ? (Exporte les d'abord si tu veux les garder.)" },
    c_vider: { fr: "Repartir de zéro ? Les extractions sont effacées et les 5 cafés de départ restaurés. (Exporte d'abord si besoin.)" },
    c_retablir: { fr: "Rétablir la version d'origine de cette recette ? Tes modifications seront perdues." },
    c_suppr_recette: { fr: "Supprimer cette recette personnelle ?" },
  };

  // ---------- 3. Cartes d'affichage pour les valeurs de données ----------

  /* Vide en français, rempli par js/i18n.en.js au passage en anglais. En
     français ces tables ne servent à rien : la fonction de traduction
     correspondante renvoie son entrée telle quelle. */
  const DIAG = {};

  /* Vide en français, rempli par js/i18n.en.js au passage en anglais. En
     français ces tables ne servent à rien : la fonction de traduction
     correspondante renvoie son entrée telle quelle. */
  const TAGS = {};

  // Définition courte de chaque descripteur, affichée en infobulle et sous le
  // bloc quand on coche un tag. Format : { fr, en }. Pas de guillemets doubles
  // dans les textes (ils partent dans des attributs title).
  /* Les définitions, en français ici, en anglais dans i18n.en.js. */
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
    "brûlé": "Torréfaction poussée trop loin : âcre, carbonisé, désagréable.",
    "cendre": "Cendre froide, sec et poussiéreux : défaut net.",
    "caoutchouc": "Pneu ou gomme, défaut classique des robustas poussés.",
    "terreux": "Terre humide, sous-bois, champignon : courant sur les robustas.",
    "boisé": "Bois sec, crayon, tonneau : souvent un café vieilli.",
    "moisi": "Humidité et moisissure, défaut de stockage du grain.",
    "papier": "Carton ou papier mouillé, café éventé ou filtre mal rincé.",
  };

  /* Vide en français, rempli par js/i18n.en.js au passage en anglais. En
     français ces tables ne servent à rien : la fonction de traduction
     correspondante renvoie son entrée telle quelle. */
  const GROUPES = {};

  const METH = {}; // rempli par js/i18n.en.js

  const MACHINES = {}; // rempli par js/i18n.en.js

  // ---------- Moteur ----------

  const registre = []; // { node, fr, en, prefixe, suffixe }
  const attributs = []; // { el, attr, fr, en } : placeholder, title, aria-label
  let scanFait = false;
  /* Le scan a-t-il eu un dictionnaire sous la main ? En français il n'y en a
     pas, et un scan à vide n'enregistre rien : il devra être refait quand le
     paquet anglais arrivera. Voir fusionnerPaquet(). */
  let scanAvecDico = false;

  const ZONES_JS = "#grille-recettes,#h-corps,#kpis,#dernieres-liste,#recettes-liste,#cafes-liste," +
    "#conv-resultat,#table-plages,#avertissements,#aside-recette,#aside-cafe,#duel-machines," +
    "#tetsu-bloc,#pap-etapes,#g-heatmap,#reglette,#f-diagnostic,#f-descripteurs,#f-recette,#f-cafe," +
    "#h-cafe,#h-diagnostic,#q-cafe,#q-recette,#c-recette,#donnees-statut,#toast,#pap-params," +
    "#insights,#sync-statut,#heatmap-stats,#version-site,#comparaison-compte,#reglages-liste," +
    "#comparaison-resume,#comparaison-titres,#comparaison-corps," +
    "#vide-mouture,#vide-gouts,#vide-duel,#note-gouts,#param-recettes,#note-affichee";

  function scanner() {
    const marche = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
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
    while ((n = marche.nextNode())) {
      const brut = n.nodeValue;
      const cle = brut.trim();
      if (!cle || !UI[cle]) continue;
      const debut = (brut.match(/^\s*/) || [""])[0];
      const fin = /\s$/.test(brut) ? " " : "";
      registre.push({ node: n, fr: brut, en: debut + UI[cle] + fin });
    }

    /* LES ATTRIBUTS DE TEXTE. Le parcours ci-dessus ne voit que des nœuds de
       texte : les fonds de champ, les infobulles et les étiquettes pour lecteurs
       d'écran lui échappent, et restaient donc en français en mode anglais.

       Même règle que le texte, et c'est ce qui rend le passage sûr : enregistrés
       SEULEMENT s'ils ont une entrée au dictionnaire. Le fond du champ molette
       vaut "1.5.0" ou "du paquet" selon que le café est déjà moulu, et c'est le
       code de saisie qui en décide : sans entrée, il n'est jamais capturé, donc
       jamais réécrit ici.

       Les zones régénérées par le JS sont exclues comme pour le texte. Y garder
       une référence serait pire qu'inutile : le nœud est remplacé à chaque
       rendu, et le code qui le régénère traduit déjà ce qu'il écrit. */
    ["placeholder", "title", "aria-label"].forEach(attr => {
      document.querySelectorAll("[" + attr + "]").forEach(el => {
        if (el.closest && el.closest(ZONES_JS)) return;
        const fr = el.getAttribute(attr);
        if (fr && UI[fr]) attributs.push({ el, attr, fr, en: UI[fr] });
      });
    });
    scanFait = true;
    scanAvecDico = Object.keys(UI).length > 0;
  }

  function appliquerStatique() {
    if (!scanFait) scanner();
    registre.forEach(r => {
      try { r.node.nodeValue = lang === "en" ? r.en : r.fr; } catch (e) { /* noeud disparu */ }
    });
    document.documentElement.setAttribute("data-lang", lang);
    document.documentElement.setAttribute("lang", lang);
    document.title = t("doc_title");
    attributs.forEach(a => {
      try { a.el.setAttribute(a.attr, lang === "en" ? a.en : a.fr); } catch (e) { /* noeud disparu */ }
    });
  }

  function t(cle, vars) {
    const e = T[cle];
    let s = e ? (e[lang] || e.fr) : cle;
    if (vars) Object.keys(vars).forEach(k => { s = s.split("{" + k + "}").join(vars[k]); });
    return s;
  }

  function tr(texte) { return lang === "en" ? (UI[texte] || texte) : texte; }
  // Plage de molette "0.8.3 à 1.5.4" : le "à" devient "to" en anglais.
  function mol(s) { return lang === "en" ? String(s).replace(" à ", " to ") : s; }
  function diag(d) { return lang === "en" ? (DIAG[d] || d) : d; }
  function tag(d) { return lang === "en" ? (TAGS[d] || d) : d; }
  /* Les valeurs sont des CHAINES francaises, et le paquet anglais les remplace
     par un couple { fr, en } au chargement. On accepte donc les deux formes :
     une chaine seule veut dire francais. */
  function tagInfo(d) {
    const e = TAGS_INFO[d];
    if (!e) return "";
    return typeof e === "string" ? e : (e[lang] || e.fr);
  }
  function groupe(g) { return lang === "en" ? (GROUPES[g] || g) : g; }
  function methode(m) { return lang === "en" ? (METH[m] || m) : m; }
  function machine(m) { return lang === "en" ? (MACHINES[m] || m) : m; }
  function locale() { return lang === "en" ? "en-GB" : "fr-FR"; }
  function jours() { return t("jours").split("|"); }
  function mois() { return t("mois").split("|"); }

  const abonnes = [];
  function abonner(fn) { abonnes.push(fn); }

  /* CHARGEMENT DU PAQUET ANGLAIS.

     Les dictionnaires ci-dessus sont vides en français, et c'est volontaire :
     tr(), diag(), tag() et compagnie renvoient leur entrée telle quelle tant que
     la langue vaut "fr", et les gabarits se rabattent sur leur moitié française.
     Le français n'a donc littéralement aucun usage de 29 Ko gzippés d'anglais.

     Le paquet les remplit SUR PLACE, sans réaffecter les constantes : le reste du
     fichier garde ses références, il n'y a rien à recâbler. */
  let paquetEn = null;

  function fusionnerPaquet(p) {
    if (!p) return false;
    /* Le scan précédent s'est fait sans dictionnaire, donc il n'a rien
       enregistré : il faut le refaire maintenant que le paquet est là. La
       condition compte. Rescanner après une traduction déjà appliquée
       enregistrerait l'anglais affiché comme étant le texte français, et le
       retour au français rendrait de l'anglais. */
    if (!scanAvecDico) { scanFait = false; registre.length = 0; attributs.length = 0; }
    Object.entries(p.T || {}).forEach(([k, v]) => { if (T[k]) T[k].en = v; });
    Object.entries(p.TAGS_INFO || {}).forEach(([k, v]) => {
      if (TAGS_INFO[k] !== undefined) TAGS_INFO[k] = { fr: TAGS_INFO[k], en: v };
    });
    [["UI", UI], ["DIAG", DIAG], ["TAGS", TAGS], ["GROUPES", GROUPES],
      ["METH", METH], ["MACHINES", MACHINES]].forEach(([nom, cible]) => {
      Object.assign(cible, p[nom] || {});
    });
    return true;
  }

  function chargerAnglais() {
    if (paquetEn) return paquetEn;
    if (typeof I18N_EN !== "undefined") { fusionnerPaquet(I18N_EN); paquetEn = Promise.resolve(true); return paquetEn; }
    paquetEn = new Promise(resolve => {
      const s = document.createElement("script");
      s.src = "js/i18n.en.js";
      s.onload = () => resolve(fusionnerPaquet(typeof I18N_EN !== "undefined" ? I18N_EN : null));
      // Échec de chargement : on reste en français plutôt que d'afficher une
      // moitié de site traduite. paquetEn revient à null pour permettre un retry.
      s.onerror = () => { paquetEn = null; resolve(false); };
      document.head.appendChild(s);
    });
    return paquetEn;
  }

  function appliquerLangue(nouvelle) {
    lang = nouvelle;
    try { localStorage.setItem("langue", lang); } catch (e) { /* indisponible */ }
    appliquerStatique();
    abonnes.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  }

  async function basculer() {
    const cible = lang === "fr" ? "en" : "fr";
    if (cible === "en" && !await chargerAnglais()) return;
    appliquerLangue(cible);
  }

  /* Appelée au démarrage quand la langue enregistrée est l'anglais : le paquet
     doit être là AVANT le premier rendu, sinon la page s'affiche en français puis
     clignote. */
  async function preparer(langueVoulue) {
    if (langueVoulue !== "en") return;
    if (await chargerAnglais()) lang = "en";
  }

  return {
    t, tr, mol, diag, tag, tagInfo, groupe, methode, machine, locale, jours, mois,
    abonner, basculer, appliquerStatique, preparer,
    langueSouhaitee: () => langueSouhaitee,
    lang: () => lang,
  };
})();
