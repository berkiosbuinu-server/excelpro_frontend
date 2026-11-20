# Actions et procédures : écrire

## Action : une écriture simple

Une **action** ajoute ou modifie **une ligne d'une seule table**, avec des paramètres. Onglet **Requêtes** → *+ Action (écriture)*. Elle protège contre les modifications simultanées grâce à la version de la ligne.

Exemples : « valider une commande », « changer le statut d'un client ».

## Procédure : plusieurs étapes, une seule transaction

Une **procédure** enchaîne plusieurs opérations sur **plusieurs tables**. Le serveur les exécute **ensemble** : si une étape échoue ou si une vérification n'est pas satisfaite, **rien n'est écrit**. Onglet **Requêtes** → *+ Procédure (plusieurs étapes)*.

### Les types d'étapes

| Étape | Rôle |
|---|---|
| **Vérifier une condition** | Continue seulement si la condition est vraie, sinon annule tout avec votre message (ex. « Stock insuffisant »). |
| **Lire une ligne** | Lit (et verrouille) une ligne pour réutiliser ses valeurs dans les étapes suivantes. |
| **Ajouter une ligne** | Crée une ligne dans une table. |
| **Modifier une ligne** | Change des colonnes, ou **augmente de** un montant (utile pour un stock ou un total). |
| **Supprimer une ligne** | Supprime une ligne. |
| **Pour chaque ligne de la liste…** | Répète des étapes pour chaque élément d'une liste reçue (les lignes d'une facture). |

### D'où viennent les valeurs ?

- **Valeur fixe** : un texte ou un nombre saisi.
- **Paramètre** : fourni par l'appelant.
- **Résultat d'étape / ligne** : une colonne d'une étape précédente nommée (ex. `produit.prix`) ou de la ligne en cours (`item.quantite`).
- **Calcul** : addition, soustraction, multiplication, division de deux valeurs.

### Exemple : créer une facture

Paramètres : `numero` (texte), `client` (texte), `lignes` (liste de lignes avec les champs `id, produit, qte`).

1. **Ajouter une ligne** dans `factures` : numéro = paramètre `numero`, client = paramètre `client`, total = 0. Nommez l'étape `f`.
2. **Pour chaque ligne de `lignes`** :
   1. **Lire une ligne** de `produits` (clé = `item.produit`), nommée `p`.
   2. **Vérifier** : `p.stock` est supérieur ou égal à `item.qte`, sinon « Stock insuffisant ».
   3. **Ajouter une ligne** dans `lignes` (facture = `numero`, produit = `item.produit`, quantité = `item.qte`).
   4. **Modifier** `produits` (clé = `item.produit`) : stock **augmente de** `item.qte × −1`.
   5. **Modifier** `factures` (clé = `numero`) : total **augmente de** `p.prix × item.qte`.
3. **Résultat renvoyé** : la facture (`f`).

Si le stock manque pour la 2ᵉ ligne, la facture, la 1ʳᵉ ligne et la baisse de stock sont **toutes annulées**.

### Appeler une procédure

- **VBA** : `Procedure_CreerFacture "F100", "Dupont", Range("A2:C10")`. La liste de lignes est une **plage de cellules** : une ligne par élément, colonnes dans l'ordre des champs. Les lignes vides sont ignorées.
- **API** : `POST /act/creer-facture` avec `{ "params": { … }, "idempotencyKey": "…" }`.

### Éviter les doublons : la clé d'idempotence

Si la connexion coupe, vous ne savez pas si la facture a été créée. Envoyez toujours un `idempotencyKey` (VBA : le dernier argument facultatif `bk_idem`), **unique par opération** (ex. `facture-F100`). Si l'appel est renvoyé avec la même clé, le serveur **ne refait rien** et rend le même résultat avec `replayed: true`.

### Limites

- 30 étapes au plus, 3 « pour chaque », 200 lignes par liste, 20 paramètres.
- Une colonne protégée (mot de passe) ne peut être écrite qu'à partir d'un **paramètre**.
- Si la clé d'une table est générée par le serveur, utilisez le résultat d'une étape nommée (`f.id`) pour la réutiliser.
- Les restrictions de lignes du rôle s'appliquent à chaque table touchée.
- **Procédure publique** (case à cocher dans l'éditeur) : appelable sans connexion avec une clé de type « connexion », pour une inscription. Elle ne peut qu'**ajouter** et **vérifier** (jamais lire, modifier ni supprimer), dans la limite de 30 appels par heure. Voir [Éditeurs](#10-editeurs).
