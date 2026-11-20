# Offres et abonnement

L'hébergement nécessite une offre. Les prix sont en **dollars américains**.

| Offre | Pour qui | Prix / mois | Classeurs | Lignes | Appels API / mois | Clés | Requêtes et actions |
|---|---|---|---|---|---|---|---|
| **Solo** | Indépendant, un classeur | 3 $ | 1 | 10 000 | 30 000 | 2 | 10 |
| **Équipe** | Petite entreprise | 15 $ | 3 | 200 000 | 500 000 | 5 | 30 |
| **Entreprise** | Plusieurs services | 39 $ | 10 | 1 000 000 | 3 000 000 | 20 | 60 |
| **Éditeur** | Vous vendez votre application Excel | dès 30 $ (selon vos clients) | 10 | 300 000 à 5 000 000 | 1 000 000 à 15 000 000 | 50 | 60 |

Les prix et limites exacts sont dans la section *Tarifs*, qui fait foi.

## Durées et réductions

- **Mensuel** : le prix du mois.
- **3 mois payés = 4 mois** : vous payez 3 mois, vous en recevez 4.
- **Annuel** : **−30 %** sur 12 mois.

## S'abonner

1. Section *Tarifs* → choisissez l'offre, puis la période.
2. Payez par mobile money ou virement vers le numéro indiqué, puis saisissez la **référence** de la transaction.
3. L'équipe valide votre paiement. Votre offre est alors activée (ou prolongée à partir de son échéance si vous renouvelez).

## Suivre sa consommation

Dans *Mon hébergement*, la vue d'ensemble affiche vos quotas : classeurs, lignes, appels du mois, clés, requêtes. Un **avertissement apparaît à 80 %** ; à 100 %, l'opération concernée est refusée avec un message clair (appels API : erreur 429 ; lignes, clés, requêtes : erreur 403).

## À l'échéance

- Votre offre **expire** : vos données restent **consultables**, mais l'importation et toutes les modifications (ajout, modification, suppression, actions) sont suspendues.
- Renouvelez depuis *Renouveler mon offre* : tout reprend sans perte.

## Changer d'offre

Si un import dépasse vos limites, ou si vous atteignez un quota, passez à l'offre supérieure depuis la section *Tarifs*.

**En cours de période**, choisissez *Monter maintenant* : vous ne payez que la **différence de prix au prorata des jours restants**, et votre échéance ne change pas. Exemple : il reste la moitié de la période et vous passez de 30 $ à 89 $ par mois : vous payez environ la moitié de 59 $. Vous pouvez aussi choisir une période complète à la place.

La montée au prorata a besoin d'une offre **payante en cours**, dont il faut créditer le temps restant. Pendant un **essai**, ou après une **expiration**, il n'y a rien à créditer : vous choisissez simplement une période complète. Les jours d'essai non utilisés **s'ajoutent** alors à votre période payée.

Les réglages particuliers faits par le support sont **conservés** quand vous renouvelez la même offre. Quand vous montez de palier, un réglage devenu inférieur à la nouvelle offre est abandonné (il ne bride jamais la montée), et un réglage supérieur est conservé.

Dans *Mon hébergement*, un message vous prévient à **80 %** de votre palier de clients, avec un bouton pour passer au palier supérieur.

## Offre Éditeur : le prix suit votre nombre de clients

Vous payez selon le nombre de **clients finaux** (les entreprises à qui vous revendez votre application) : plus vous en avez, moins chacun vous coûte.

| Palier | Prix / mois | Lignes | Appels API / mois |
|---|---|---|---|
| 1 à 10 clients | 30 $ | 300 000 | 1 000 000 |
| 11 à 50 clients | 89 $ | 1 000 000 | 3 000 000 |
| 51 à 100 clients | 149 $ | 2 000 000 | 6 000 000 |
| 101 à 500 clients | 299 $ | 5 000 000 | 15 000 000 |
| Plus de 500, ou illimité | sur devis | sur mesure | sur mesure |

- Les autres limites sont les mêmes à tous les paliers : 10 classeurs, 50 clés, 60 requêtes et actions.
- Quand votre palier est atteint, **vos clients existants continuent de fonctionner** ; seule l'inscription d'un **nouveau** client est refusée (erreur 403 `QUOTA_CLIENTS`). Passez au palier supérieur depuis la section *Tarifs* : l'inscription reprend aussitôt.
- Vous répercutez librement ce coût dans le prix que vous facturez à vos clients. Voir [Éditeurs](#10-editeurs).
