# Dépannage et questions fréquentes

## L'hébergement n'apparaît pas

La page **Mon hébergement** n'est visible qu'avec une offre active. Choisissez-en une dans *Tarifs*.

## « Offre requise » ou « Offre expirée »

- **402 NO_PLAN** : aucune offre. Abonnez-vous.
- **402 PLAN_EXPIRED** : l'offre a expiré. Vos données restent lisibles ; renouvelez pour écrire de nouveau.
- **Quota atteint** : le message dit lequel. Lignes, clés, requêtes : erreur 403 ; appels du mois : erreur 429. Passez à une offre supérieure ou libérez de la place.

## L'import est refusé ou des lignes sont rejetées

- Lisez le **rapport de simulation** : il donne la raison ligne par ligne.
- Causes fréquentes : clé en double, texte dans une colonne de nombres, date illisible, ligne vide au milieu, colonne sensible réglée sur *Rejeter la ligne*.
- Si le message parle de limites d'offre : cliquez sur *Changer d'offre*.

## « Conflit de version » (409) à la modification

Quelqu'un a modifié la ligne avant vous. Relisez la ligne pour obtenir la version actuelle, appliquez votre changement, renvoyez. Dans le complément Excel, utilisez **Synchroniser** et réglez le conflit.

## Une procédure répond 409 avec mon message

C'est voulu : l'une de ses **vérifications** a échoué (ex. « Stock insuffisant »). **Rien n'a été écrit.** Corrigez la saisie et recommencez.

## Une procédure répond 404

Une étape cherche une ligne qui n'existe pas (ex. un code produit inconnu). Rien n'a été écrit. Vérifiez les valeurs envoyées.

## J'ai renvoyé la même facture deux fois

Si vous utilisez un `idempotencyKey` identique, le serveur ne recrée rien. Sans clé, le numéro de facture déjà utilisé est refusé (doublon de clé). Utilisez toujours une clé d'idempotence pour les opérations importantes.

## Le VBA ne fonctionne pas

- Enregistrez en **.xlsm** et activez les macros.
- Vérifiez que l'adresse et la clé en haut du module sont exactes.
- Le code est écrit en caractères simples (sans accents) : ne le modifiez pas avec un éditeur qui ajoute des caractères spéciaux.
- Utilisez les noms **générés** pour votre classeur (ex. `Vente_Charger` si la table s'appelle `vente`).

## Un utilisateur ne voit pas ses données

- Vérifiez son **rôle** dans la table des utilisateurs, puis l'onglet **Droits**.
- Les rôles sont lus à la connexion : demandez-lui de se reconnecter.
- Une restriction de lignes (ex. « vendeur = mon identifiant ») masque les lignes dont la colonne ne correspond pas.

## J'ai perdu ou exposé une clé d'API

1. Onglet **API & clés** → **Révoquer** la clé concernée.
2. Créez-en une nouvelle et mettez-la à jour dans vos applications.

## Sauvegardes

La durée de conservation des sauvegardes figure dans le tableau comparatif des offres. Pour une restauration ou une question sur vos sauvegardes, contactez le support.

## Besoin d'aide ?

Écrivez au support avec : le nom de votre classeur, l'heure approximative, la route ou la fonction concernée et le message d'erreur exact.
