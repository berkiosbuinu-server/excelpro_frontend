# Éditeurs : une application, plusieurs clients

Vous vendez ou louez la **même application** (ex. une gestion de pharmacie) à plusieurs entreprises. Chaque client ne doit voir **que ses données**, et vous ne voulez **rien reconfigurer** quand un nouveau client arrive. ExcelPro le fait avec **un seul classeur** et une colonne d'isolation (ex. `pharmacy_id`).

## Principe

Toutes les tables qui portent la colonne (produits, clients, ventes…) sont **automatiquement filtrées** : chaque utilisateur ne voit, ne modifie et ne supprime que les lignes de **son** client. Quand il crée une ligne, la colonne est **imposée par le serveur** : il ne peut pas écrire chez un autre client (erreur 403), et les lignes d'un autre client lui apparaissent comme inexistantes (404).

## Mise en place (une seule fois)

1. **Colonne** : chaque table de données contient la colonne d'isolation (ex. `pharmacy_id`). Les tables sans cette colonne restent **partagées** par tous (ex. un catalogue commun).
2. **Utilisateurs** : la table de connexion contient aussi cette colonne : chaque utilisateur est rattaché à son client.
3. Onglet **Droits** → cochez **Plusieurs clients**, choisissez la colonne, et (facultatif) la **table des clients** (ex. `pharmacies`) : un utilisateur ne voit que sa propre fiche client.
4. Cochez les rôles qui **voient tous les clients** (ex. `support`, `admin-editeur`).
5. Définissez les rôles habituels (gérant, vendeur…) comme au chapitre [Utilisateurs, rôles et clés](#05-droits).

## Inscription d'un nouveau client, sans vous

Créez une **procédure publique** (chapitre [Actions et procédures](#04-actions-procedures)) nommée par exemple `inscrire-pharmacie` : elle ajoute la fiche client, puis son premier utilisateur gérant avec la colonne d'isolation. Fixez le rôle (« gerant ») dans les étapes : ne le laissez pas en paramètre.

Votre page d'inscription l'appelle avec une clé de type **connexion** (`POST /imports/<id>/signup/inscrire-pharmacie`). Le client peut ensuite se connecter immédiatement : **aucune intervention de votre part**.

## Règles à respecter

- **Dans les applications des clients, utilisez des sessions utilisateur, jamais une clé en lecture-écriture** : une clé n'est pas soumise à l'isolation et voit tous les clients.
- Les identifiants de connexion doivent être **uniques pour tout le classeur**, pas seulement dans un client (ex. une adresse e-mail).
- La procédure publique est limitée à **30 appels par heure** et ne peut qu'ajouter des lignes.
- Les rôles sont lus à la connexion : après un changement, l'utilisateur doit se reconnecter.

## Limite du nombre de clients et prix

Votre offre Éditeur est choisie **selon votre nombre de clients** (1 à 10, 11 à 50, 51 à 100, 101 à 500, au-delà sur devis) : voir le chapitre [Offres et abonnement](#02-offres). Les clients comptés sont les lignes de la table des clients.

Quand le palier est atteint, vos clients actuels continuent de fonctionner et l'inscription d'un nouveau client est refusée (403 `QUOTA_CLIENTS`) jusqu'au palier supérieur. Votre page d'inscription doit afficher un message clair dans ce cas.
