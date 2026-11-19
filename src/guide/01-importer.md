# Importer votre classeur

## Avant d'importer : préparer le fichier

Un import fonctionne mieux quand le classeur est **propre** :

- Une feuille = une table, avec **une seule ligne d'en-têtes** (noms de colonnes) en haut.
- Pas de cellules fusionnées, pas de lignes de total au milieu des données, pas de lignes vides.
- Une **colonne qui identifie chaque ligne** (numéro de facture, code produit…) sans doublons. Si elle n'existe pas, ExcelPro génère une clé.
- Une même colonne contient un seul type de valeur (que des nombres, que des dates, que du texte).
- Formats acceptés : `.xlsx`, `.xlsm`, `.xls`. La taille maximale est indiquée sous le bouton de sélection.

## Les étapes

1. **Mon hébergement** → *Sélectionner un classeur*. ExcelPro analyse le fichier : feuilles, colonnes, types, tableaux.
2. **Champs sensibles.** Si une colonne ressemble à un mot de passe ou à un secret, choisissez son traitement :
   - *Protéger (hachage scrypt)* : la valeur est transformée de façon irréversible. Utile pour les mots de passe de vos utilisateurs.
   - *Ne pas importer la valeur* : la colonne est ignorée.
   - *Rejeter la ligne* : les lignes concernées ne sont pas importées.
3. **① Simuler l'importation.** Rien n'est écrit : vous obtenez un rapport (lignes lues, valides, rejetées, et pourquoi).
4. Lisez le rapport. Corrigez le fichier si des lignes sont rejetées, puis relancez la simulation.
5. Cochez *Je confirme la publication de ces données*, puis **Publier les données →**.
6. Une fois terminé, le **tableau de bord** apparaît : tables, données, requêtes, droits, clés, routes, exemples.

## Taille et offre

Avant la publication, ExcelPro compare votre fichier aux limites de votre offre (classeurs, lignes). Si elles sont dépassées, un message vous le dit et propose **Changer d'offre** ; la publication reste bloquée tant que le fichier ne rentre pas.

## Après l'import : ce qu'il faut savoir

- Les **noms de tables et de colonnes** sont normalisés (minuscules, sans accents ni espaces : « Nom du client » devient `nom_du_client`). Ce sont ces noms que vous utiliserez dans le code et les requêtes.
- Chaque ligne reçoit une **version**. Elle sert à refuser une modification faite à partir d'une donnée périmée (voir *Synchronisation*).
- Réimporter un fichier crée une nouvelle importation ; pour mettre à jour une base existante, passez par l'API, le VBA ou le complément Excel plutôt que de tout réimporter.
