# Requêtes : lire et calculer

Une **requête** est une lecture enregistrée. Une fois créée, elle devient une route, une fonction VBA et un exemple prêts à l'emploi. Onglet **Requêtes** → *+ Requête*.

## Ce qu'une requête sait faire

- **Choisir les colonnes** à renvoyer.
- **Filtrer** : est égal à, différent de, supérieur, inférieur (ou égal), contient, commence par, est vide, n'est pas vide.
- **Paramètres** : une valeur du filtre laissée libre, saisie à l'appel (ex. `client`, `date_debut`).
- **Trier** et **limiter** le nombre de lignes.
- **Totaux et regroupements** : somme, moyenne, minimum, maximum, comptage par groupe (ex. chiffre d'affaires par client).
- **Jointures** : relier plusieurs tables.

## Joindre plusieurs tables

Exemple de rapport : *nom de l'utilisateur, date, produit vendu, montant, client*.

1. Choisissez la table de départ (ex. `vente`).
2. *Ajouter une jointure* : choisissez la table à relier (ex. `client`) et les colonnes qui se correspondent (ex. `vente.client_id` = `client.id`).
3. Type de jointure :
   - **Gauche** : garde toutes les lignes de départ, même sans correspondance.
   - **Interne** : ne garde que les lignes qui ont une correspondance.
4. Choisissez les colonnes de chaque table. En cas de nom identique, la colonne est préfixée par le nom de la table (`client_nom`).

Limites : 5 jointures au plus par requête, 3 conditions au plus par jointure.

## Essayer

Le bouton **Essayer** exécute la requête avec des valeurs de test et montre le résultat avant de l'utiliser dans Excel.

## Utiliser une requête

- **Dans Excel** : copiez la route `/q/<nom>` dans Power Query (ajoutez `?format=csv`), ou appelez la fonction VBA générée.
- **Depuis une application** : `GET /q/<nom>?client=Dupont`.

## Droits

Les rôles autorisent chaque requête par son nom. Les restrictions de lignes d'un rôle s'appliquent aussi aux requêtes et aux totaux.
