# L'API en bref

Chaque classeur hébergé a une adresse de base, affichée dans l'onglet **API & clés** :

```
https://server.berkios.online/admin/v1/excel-cloud/imports/<identifiant>/data
```

L'onglet **Routes** liste toutes les routes de votre classeur, avec un bouton pour les essayer ; l'onglet **Exemples** donne du code prêt à coller (Power Query, VBA, curl).

## S'authentifier

Envoyez la clé d'API ou le jeton de session dans l'en-tête :

```
Authorization: Bearer <clé ou jeton>
```

## Routes par table

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/` | Liste des tables et colonnes |
| GET | `/<table>?limit=50&offset=0&orderBy=<col>&direction=asc&f.<col>=<valeur>` | Lister (pagination, tri, filtre) |
| GET | `/<table>?format=csv` | Exporter en CSV |
| GET | `/<table>/<clé>` | Lire une ligne |
| POST | `/<table>` | Ajouter : `{ "values": { … } }` |
| PUT | `/<table>/<clé>` | Modifier : `{ "expectedVersion": 3, "values": { … } }` |
| DELETE | `/<table>/<clé>` | Supprimer : `{ "expectedVersion": 3 }` |
| GET | `/<table>/_changes?cursor=…` | Modifications depuis un curseur (synchronisation) |
| GET | `/q/<nom>?<paramètres>` | Exécuter une requête enregistrée |
| POST | `/act/<nom>` | Exécuter une action ou une procédure : `{ "params": { … } }` |
| POST | `/login` | Connecter un utilisateur (renvoie un jeton) |
| GET | `/session` | Vérifier la session en cours |
| POST | `/logout` | Fermer la session |

## La version d'une ligne

Chaque ligne a une `_berkios_version` qui augmente à chaque modification. Pour modifier ou supprimer, vous envoyez la version que vous avez lue (`expectedVersion`). Si quelqu'un a modifié la ligne entre-temps, le serveur répond **409** : relisez la ligne, puis réessayez.

## Exemple curl

```bash
curl -H "Authorization: Bearer $CLE" \
  "https://server.berkios.online/admin/v1/excel-cloud/imports/ID/data/vente?limit=10"

curl -X PUT -H "Authorization: Bearer $CLE" -H "Content-Type: application/json" \
  -d '{"expectedVersion":1,"values":{"ttc":1200}}' \
  "https://server.berkios.online/admin/v1/excel-cloud/imports/ID/data/vente/5"
```

## Codes de réponse

| Code | Signification |
|---|---|
| 200 / 201 | Réussi / créé |
| 401 | Clé ou jeton absent, invalide ou expiré |
| 402 | Offre absente, ou offre expirée (lecture seule) |
| 403 | Droits insuffisants, ou quota atteint (lignes, clés, requêtes) |
| 404 | Table, ligne, requête ou action introuvable |
| 409 | Conflit de version, doublon de clé, ou vérification refusée (ex. « Stock insuffisant ») |
| 422 | Valeur ou paramètre invalide |
| 429 | Quota mensuel d'appels atteint, ou trop de tentatives de connexion : patientez |

Chaque réponse porte un en-tête `X-Berkios-Quota` qui résume votre consommation.
