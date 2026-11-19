# Synchronisation à double sens

La synchronisation garde une feuille Excel et la base hébergée **d'accord** dans les deux sens, sans écraser le travail de personne.

## Principe

À chaque chargement, la feuille garde en mémoire (dans une feuille cachée) **l'état du serveur** et un **curseur**. Ensuite :

- **Recevoir** : le serveur envoie uniquement ce qui a changé depuis le curseur : lignes créées, modifiées, supprimées.
- **Envoyer** : vos modifications locales sont comparées à l'état mémorisé, puis envoyées ligne par ligne, chacune avec sa **version**.

## Utiliser le complément Excel

1. Ouvrez le panneau ExcelPro, choisissez la base et la table.
2. **Charger depuis le serveur** : la table s'écrit dans une feuille.
3. Travaillez dans la feuille : modifiez, ajoutez des lignes (et, si vous cochez l'option, supprimez-en).
4. **🔄 Synchroniser** : reçoit les changements du serveur, les fusionne avec les vôtres, puis liste ce qui sera envoyé.
5. **Voir mes modifications** pour contrôler, puis **⬆ Envoyer au serveur**.

## Ce que la fusion fait toute seule

| Situation | Résultat |
|---|---|
| Changé seulement sur le serveur | Appliqué dans votre feuille. |
| Changé seulement chez vous | Conservé, prêt à envoyer. |
| Même ligne, **colonnes différentes** | Fusionné automatiquement. |
| Même colonne, **même valeur** des deux côtés | Pas de conflit. |
| Ligne supprimée sur le serveur, non modifiée chez vous | Retirée de votre feuille. |

## Les conflits

Un **conflit** est un vrai désaccord : la **même colonne** a changé des deux côtés avec des valeurs différentes, ou une ligne supprimée d'un côté a été modifiée de l'autre. Le panneau *lignes à arbitrer* montre, pour chacune, votre valeur et celle du serveur :

- **Garder le serveur** : votre feuille prend la valeur du serveur.
- **Garder la mienne** : votre valeur sera envoyée, en remplaçant celle du serveur, au prochain envoi.
- Les boutons *Tout : garder…* règlent tous les conflits d'un coup.

**Rien n'est écrasé tant que vous n'avez pas choisi.** L'envoi est bloqué tant qu'il reste des conflits. Même sans cela, le serveur refuse toute modification basée sur une version périmée.

## Limites à connaître

- Après **90 jours** sans synchronisation, rechargez la feuille complètement.
- Une ligne ajoutée **sans clé** (clé générée par le serveur) peut apparaître en double si un envoi est partiellement refusé : rechargez la feuille.
- Les **utilisateurs à droits par ligne** reçoivent leurs changements, pas les suppressions de lignes qu'ils ne voient pas.
- Les suppressions faites **directement dans PostgreSQL** (hors API) ne sont pas suivies.
- Des **mises à jour automatiques** en arrière-plan ne sont pas incluses : la synchronisation se déclenche par le bouton.
