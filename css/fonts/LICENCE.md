# Polices embarquées

Les deux familles sont sous **SIL Open Font License 1.1**, qui autorise
explicitement la redistribution avec un logiciel, y compris dans un dépôt
public, tant que la licence accompagne les fichiers. C'est ce que fait ce
fichier.

| Famille | Fichiers | Auteur | Source |
|---|---|---|---|
| Instrument Serif | `instrument-serif-latin.woff2`, `instrument-serif-latin-ext.woff2` | Rodrigo Fuenzalida, Jan Sindler | https://fonts.google.com/specimen/Instrument+Serif |
| Manrope | `manrope-latin.woff2`, `manrope-latin-ext.woff2`, `manrope-vietnamese.woff2` | Mikhail Sharanda | https://fonts.google.com/specimen/Manrope |

Texte complet de la licence : https://scripts.sil.org/OFL

## Pourquoi les fichiers sont ici et pas sur un CDN

Le site doit s'ouvrir en `file://` et fonctionner hors ligne. Une balise vers
`fonts.googleapis.com` ferait deux choses qu'on ne veut pas : afficher le repli
à la première ouverture sans réseau, et faire clignoter la page au moment où la
vraie police arrive. Ils sont donc précachés par `sw.js` comme le reste.

## Ce qui est embarqué, et ce qui ne l'est pas

Latin et latin étendu pour les deux familles, plus le **vietnamien pour
Manrope** : les cafés de Chris s'appellent « Trung Nguyên Sáng Tạo » et
« Là Việt ». Cyrillique et grec sont écartés, ils ne servent à rien ici.

Instrument Serif n'a pas de sous-ensemble vietnamien chez Google Fonts. Les
caractères comme ạ, ế, ữ retombent donc sur Georgia, glyphe par glyphe. Voir
`DECISIONS.md`, section « La refonte Comptoir ».

## Remplacer une police

Ne jamais réécrire le contenu d'un `.woff2` sous le même nom : `worker/index.js`
les sert avec un cache d'un an et sans `?v=`, précisément parce qu'un fichier de
police ne bouge pas. Pour en changer, ajouter un fichier sous un nouveau nom et
mettre à jour `@font-face` dans `css/socle.css` ainsi que la liste de précache
de `sw.js`.
