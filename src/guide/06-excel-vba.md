# Utiliser les données dans Excel

Trois façons de relier votre classeur Excel aux données hébergées.

## 1. Macro VBA (lecture et écriture)

Idéal pour des boutons, des formulaires et de la saisie.

1. Créez une **clé d'API** (onglet *API & clés*).
2. Onglet **API & clés** → section *Exemples prêts à coller* → *Macro VBA* → *Copier l'exemple*. Le code contient déjà l'adresse de votre base et votre clé.
3. Dans Excel : **Alt+F11** → *Fichier* → *Importer un fichier…*, ou collez le code dans un **nouveau module**.
4. Enregistrez le classeur en **.xlsm**.

### Fonctions générées

Pour chaque table, ExcelPro génère des fonctions nommées d'après elle :

- `<Table>_Charger(plage)` : charge toute la table (en-têtes et lignes) à partir de la cellule indiquée.
- `<Table>_Lire(clé)` et `<Table>_Chercher(colonne, valeur)` : lisent une ligne.
- `<Table>_Ajouter(…)`, `<Table>_Modifier(clé, …)`, `<Table>_Supprimer(clé)` : écrivent une ligne. Les arguments portent le nom des colonnes (arguments nommés : `Vente_Ajouter numero:="T1", ttc:=1160`). La version de la ligne est vérifiée pour refuser les écrasements.
- `Berkios_ChargerTout` : charge toutes les tables dans des feuilles.
- `BK_Connexion(nom, motDePasse)` : connecte un utilisateur (voir *Utilisateurs, rôles et clés*).
- `<Table>_Modifications(curseur)` : renvoie ce qui a changé depuis votre dernière synchronisation.
- `Requete_<Nom>(plage, …)` : écrit le résultat d'une requête enregistrée dans une plage ; `Requete_<Nom>_Valeur(…)` renvoie la première valeur (idéal pour un total).
- `Action_<Nom>(…)` et `Procedure_<Nom>(…)` : une fonction par action ou procédure.

Exemple :

```vb
Sub ChargerVentes()
    Vente_Charger Sheets("Ventes").Range("A1")
End Sub

Sub NouvelleFacture()
    Dim r As String
    r = Procedure_CreerFacture("F100", "Dupont", Sheets("Saisie").Range("A2:C10"), "facture-F100")
    MsgBox "Facture créée"
End Sub
```

En cas de refus du serveur (ex. « Stock insuffisant »), l'erreur VBA porte le message du serveur.

## 2. Power Query (lecture seule, sans macro)

Idéal pour des tableaux de bord qui se rafraîchissent.

1. Onglet **API & clés** → *Exemples prêts à coller* → *Power Query (Excel)* → copiez l'exemple.
2. Dans Excel : *Données* → *Obtenir des données* → *À partir d'autres sources* → *Requête vide* → *Éditeur avancé*, collez, validez.
3. Pour un rapport sur plusieurs tables, utilisez une **requête enregistrée** avec `?format=csv`.

## 3. Complément Excel (synchronisation à double sens)

Panneau latéral « ExcelPro — Hébergement » qui charge une table dans une feuille, détecte vos modifications et les renvoie. Voir le chapitre [Synchronisation](#07-synchronisation).

**Installation (manuelle pour l'instant)** : téléchargez le fichier `manifest.xml` à la racine du site ExcelPro, puis dans Excel : *Insertion* → *Compléments* → *Mes compléments* → *Gérer mes compléments* → *Charger mon complément*. Le complément s'ouvre ensuite depuis le ruban.

## Conseils

- **Ne renommez pas, ne déplacez pas, ne supprimez pas** les colonnes d'une feuille chargée.
- Ne mettez pas la clé d'API dans un classeur que vous partagez largement : préférez des **sessions utilisateur** (chapitre *Utilisateurs, rôles et clés*).
- Un classeur qui contient du VBA doit être enregistré en `.xlsm` et ses macros activées.
