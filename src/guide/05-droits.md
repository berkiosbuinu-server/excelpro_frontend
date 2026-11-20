# Utilisateurs, rôles et clés

Il y a **deux façons** de se connecter aux données. Choisissez la bonne.

| | Clé d'API | Session utilisateur |
|---|---|---|
| Qui l'utilise | Une application de confiance (votre classeur, un script) | Chaque personne qui se connecte à votre application |
| Comment | La clé est dans le code | Nom + mot de passe → jeton temporaire |
| Droits | Lecture seule ou lecture-écriture, sur tout le classeur | **Rôles** : table par table, ligne par ligne |
| Où la mettre | Jamais dans une page web publique | Dans l'application, après connexion |

## Clés d'API

Onglet **API & clés** → nom (ex. « Facture automatisée ») → *Lecture et écriture* ou *Lecture seule* → *+ Créer une clé*.

- La clé complète **n'apparaît qu'une fois** : copiez-la tout de suite (*Copier la clé*).
- Une clé perdue ou compromise se **révoque** (bouton *Révoquer*) sans toucher aux autres.
- Une clé par application, pour pouvoir couper l'une sans casser les autres.
- Le nombre de clés dépend de votre offre.

## Utilisateurs connectés

1. Importez une table des utilisateurs (ex. `parametre`) avec : l'**identifiant** (nom), le **mot de passe** (colonne protégée par hachage) et une colonne **rôle**.
2. L'application appelle la route de connexion avec l'identifiant et le mot de passe. Le serveur vérifie le mot de passe sans jamais le renvoyer, et rend un **jeton de session** (valable quelques heures).
3. L'application envoie ce jeton à chaque appel. Les droits du rôle s'appliquent.

Après 5 échecs de connexion en 15 minutes, le compte est temporairement verrouillé.

## Rôles et droits

Onglet **Droits**. Pour chaque rôle :

- Les **tables** accessibles et les opérations : lire, créer, modifier, supprimer.
- Les **requêtes**, **actions** et **procédures** que le rôle peut appeler.
- Des **restrictions de lignes** : par exemple, un vendeur ne voit que les lignes où `vendeur` = son identifiant de connexion. Les lignes qu'il crée lui sont automatiquement attribuées.

Dès que les droits sont actifs, **tout ce qui n'est pas autorisé est refusé**. Les restrictions s'appliquent partout : lecture, export, modification, suppression, requêtes, totaux, actions et procédures.

Les rôles sont lus à la connexion : après un changement de rôle, l'utilisateur doit se reconnecter.

> **Plusieurs applications, un seul backend.** Vous pouvez relier plusieurs applications (classeur, site, mobile) au même classeur hébergé, chacune avec sa clé ou ses sessions. Les écritures concurrentes sont protégées par les versions de lignes.

> **Vous vendez l'application à plusieurs entreprises ?** Activez l'isolation par client : voir le chapitre [Éditeurs](#10-editeurs).
