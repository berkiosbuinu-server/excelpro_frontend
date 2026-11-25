# Publier un site web

ExcelPro héberge le site créé avec BERKIOS Graphic (moteur « Site web (HTML) ») ou tout site statique.

## Offres

- **Starter** : 2 $ par mois, payé d'abord pour 5 mois. 1 site, 100 Mo, adresse `votre-nom.sites.berkios.online`, 3 versions.
- **Pro** : 10 $ par mois. 5 sites, 1 Go par site, 3 domaines personnalisés par site, variables d'environnement, 10 versions.
- Paiement annuel : −20 %.

## Publier

1. Ouvrez **Mes sites**, choisissez une offre, puis créez un site.
2. Onglet **Publier** : choisissez le dossier généré, ou un fichier .zip. La page d'accueil doit être `index.html`.
3. Cliquez **Mettre en ligne**. Chaque publication crée une version ; l'onglet **Versions** permet de revenir en arrière.

## Déployer depuis Git

Au lieu de déposer un dossier à la main, reliez votre dépôt **GitHub, GitLab, Bitbucket** ou Gitea : onglet **Déploiements** → « Déploiement depuis Git ».

1. Collez l'adresse du dépôt (`https://github.com/compte/mon-site.git`), la branche (`main` par défaut) et, si besoin, le dossier à publier (`dist`, `public`…). Laissez vide pour publier la racine.
2. Cliquez sur **Connecter le dépôt**, puis sur **Déployer maintenant**. Chaque déploiement crée une nouvelle version (vous pouvez revenir en arrière).
3. Pour que chaque `git push` mette le site à jour, ajoutez un **webhook** dans votre dépôt (Settings → Webhooks) avec l'adresse et le secret affichés, au format `application/json`.

**Dépôt privé :** utilisez l'adresse SSH (`git@github.com:compte/depot.git`). Nous générons une clé de déploiement : ajoutez-la en lecture seule dans le dépôt (GitHub : Settings → Deploy keys).

**Important :** aucune compilation n'est faite sur nos serveurs. Les fichiers du dépôt sont publiés tels quels, et `index.html` doit se trouver à la racine du dossier choisi. Pour un site React, Vite ou similaire, poussez le dossier compilé. Les fichiers cachés (`.env`, `.git`…) ne sont jamais publiés.

## Variables d'environnement (Pro)

Écrivez `%%NOM%%` dans vos pages : la valeur est insérée à la publication. Ces valeurs sont **publiques** : n'y mettez jamais de secret.

## Domaine personnalisé (Pro)

1. Ajoutez votre domaine, puis créez chez votre registrar l'enregistrement TXT (ou CNAME) indiqué et cliquez **Vérifier** : cela prouve que le domaine est à vous.
2. Pointez ensuite le domaine vers notre serveur : un enregistrement **A** vers l'adresse IP affichée (domaine principal), ou un **CNAME** vers l'adresse `.sites.berkios.online` de votre site (sous-domaine comme `www`). Supprimez un éventuel enregistrement AAAA.
3. Quelques minutes plus tard, le certificat HTTPS est obtenu automatiquement et l'écran affiche « HTTPS actif ». En cas d'échec, corrigez le DNS puis cliquez **Réessayer**.

Voir aussi [le guide de démarrage](00-demarrer.md).

## Fin d'abonnement

Après l'échéance, le site reste en ligne 7 jours en lecture seule, puis il est suspendu. Renouvelez pour le remettre en ligne.
