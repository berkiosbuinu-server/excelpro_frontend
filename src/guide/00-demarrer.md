# Démarrer avec ExcelPro

ExcelPro transforme votre classeur Excel en **base de données hébergée** : vos feuilles deviennent des tables, accessibles depuis Excel (macros VBA, Power Query, complément), un site web ou une application mobile, sans que vous écriviez de serveur.

## Ce que vous obtenez

- Vos données stockées sur un serveur sécurisé, avec une **version** par ligne qui protège contre les écrasements.
- Une **API générée automatiquement** : lire, ajouter, modifier, supprimer.
- Du **code VBA prêt à coller** dans votre classeur.
- Des **requêtes** (filtres, jointures entre tables, totaux), des **actions** et des **procédures** (plusieurs étapes en une seule opération).
- Des **utilisateurs connectés** avec des **rôles** : chacun ne voit et ne modifie que ce qui lui est permis.

## Le parcours en 6 étapes

1. **Choisir une offre** (section *Tarifs* du menu). Sans offre, l'hébergement n'est pas disponible. Voir le chapitre [Offres et abonnement](#02-offres).
2. **Importer votre classeur** : *Mon hébergement* → *Sélectionner un classeur*. Voir [Importer votre classeur](#01-importer).
3. **Simuler puis publier** : vérifiez le rapport, cochez la confirmation, cliquez sur *Publier les données*.
4. **Créer une clé d'API** et copier le code VBA (onglet *API & clés*, section *Exemples prêts à coller*). Voir [Excel et VBA](#06-excel-vba).
5. **Ajouter des requêtes, actions ou procédures** (onglet *Requêtes*) pour vos écrans et vos rapports.
6. **Définir les droits** (onglet *Droits*) si vos applications ont des utilisateurs. Voir [Utilisateurs, rôles et clés](#05-droits).

## Le vocabulaire

| Mot | Signification |
|---|---|
| **Classeur hébergé** | Un fichier Excel importé : il devient une base avec une table par feuille ou tableau. |
| **Table** | Une feuille (ou un tableau) : des colonnes typées et des lignes. |
| **Clé de la table** | La colonne qui identifie une ligne de façon unique (ex. numéro de facture). |
| **Clé d'API** | Un mot de passe de connexion pour une application (Excel, site…). |
| **Requête** | Une lecture enregistrée (filtres, jointures, totaux). |
| **Action** | Une écriture enregistrée sur une seule ligne d'une table. |
| **Procédure** | Plusieurs étapes exécutées ensemble : tout réussit, ou rien n'est écrit. |
| **Rôle** | Un profil d'utilisateur (ex. vendeur, comptable) avec des droits précis. |

> **Bon à savoir.** Une clé d'API donne accès aux données de *ce* classeur. Ne la partagez pas et ne la collez jamais dans une page web publique : pour un site, faites connecter les utilisateurs avec leur mot de passe (chapitre *Utilisateurs, rôles et clés*).
