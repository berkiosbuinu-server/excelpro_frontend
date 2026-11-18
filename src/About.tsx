import { Logo, PlatformIcon, PLATFORM_COLORS } from "./visuals";

export function About({ onStart, onHosting }: { onStart: () => void; onHosting: () => void }) {
  const platforms = ["windows", "android", "linux", "ios", "macos", "web"];
  return (
    <div className="about-page">
      <section className="about-hero">
        <div className="about-hero-copy">
          <span className="about-kicker">NOTRE HISTOIRE · NOTRE VISION</span>
          <h1>Et si votre Excel pouvait <em>aller beaucoup plus loin&nbsp;?</em></h1>
          <p>ExcelPro est né d'une conviction simple : un classeur Excel peut être bien plus qu'un fichier posé sur un ordinateur. Il peut devenir une véritable application, un outil partagé et une source de données accessible.</p>
          <div className="about-actions"><button className="primary big" onClick={onStart}>Découvrir la conversion</button><button className="big ghost" onClick={onHosting}>Découvrir l'hébergement</button></div>
        </div>
        <div className="about-hero-art" aria-hidden="true"><div className="about-orbit orbit-one"/><div className="about-orbit orbit-two"/><div className="about-logo-card"><Logo size={76}/><strong>ExcelPro</strong><span>Du tableur à l'application</span></div><span className="about-float float-a">.XLSX</span><span className="about-float float-b">API</span><span className="about-float float-c">APP</span></div>
      </section>

      <section className="about-section">
        <div className="about-section-heading"><span className="about-kicker">LE CONSTAT</span><h2>Excel est puissant. Mais ses limites deviennent visibles quand les besoins grandissent.</h2><p>Beaucoup d'activités ont été construites autour de classeurs devenus essentiels au quotidien. Pourtant, leur utilisation peut vite se compliquer.</p></div>
        <div className="about-challenge-grid">
          <article className="about-info-card"><span className="about-card-icon">↗</span><h3>Des fichiers difficiles à partager</h3><p>Plusieurs versions circulent, les modifications se croisent et il devient difficile de savoir quel fichier contient les bonnes informations.</p></article>
          <article className="about-info-card"><span className="about-card-icon">⌘</span><h3>Une dépendance à l'ordinateur</h3><p>Un outil conçu pour Excel sur PC n'est pas toujours pratique à utiliser sur téléphone, tablette ou dans un environnement web.</p></article>
          <article className="about-info-card"><span className="about-card-icon">⚙</span><h3>Des macros et interfaces fragiles</h3><p>Les macros VBA, UserForms, formules et automatismes peuvent dépendre de la version d'Office, du système ou de la configuration de chaque poste.</p></article>
          <article className="about-info-card"><span className="about-card-icon">⇄</span><h3>Le travail à plusieurs devient complexe</h3><p>Quand une activité se développe, il faut mieux organiser les accès, centraliser les données et permettre à plusieurs utilisateurs de travailler sur les mêmes informations.</p></article>
        </div>
      </section>

      <section className="about-quote"><span className="about-kicker">NOTRE CONVICTION</span><h2>Vous ne devriez pas avoir à abandonner des années de travail simplement parce que vos besoins ont évolué.</h2><p>Nous voulons aider chacun à faire évoluer ses outils, sans perdre la logique métier, les données et l'expérience déjà construites dans Excel.</p></section>

      <section className="about-section about-solutions">
        <div className="about-section-heading"><span className="about-kicker">CE QUE NOUS CONSTRUISONS</span><h2>Un pont entre vos classeurs et des applications modernes.</h2><p>ExcelPro rassemble plusieurs services complémentaires pour accompagner cette évolution.</p></div>
        <div className="about-service-grid">
          <article className="about-service-card"><div className="about-service-number">01</div><h3>Conversion de classeurs en applications</h3><p>Faites analyser votre fichier, identifiez les éléments à adapter, puis transformez votre solution Excel en application destinée à différents environnements.</p><div className="about-platforms">{platforms.map(p => <span key={p} title={p} style={{color:PLATFORM_COLORS[p]}}><PlatformIcon id={p} size={21}/></span>)}</div><small>Windows · Android · Linux · iOS · macOS · Web</small></article>
          <article className="about-service-card"><div className="about-service-number">02</div><h3>Vérification et accompagnement</h3><p>Avant la conversion, le classeur peut être analysé et vérifié. Les rapports permettent de comprendre les éléments compatibles, ceux qui nécessitent des adaptations et les points à examiner.</p><small>Analyse · simulation · rapport · accompagnement</small></article>
          <article className="about-service-card"><div className="about-service-number">03</div><h3>Hébergement de données et API</h3><p>Publiez les données de vos classeurs dans un environnement centralisé. ExcelPro expose des routes API pour lire et modifier les données depuis Excel, Python ou vos propres applications.</p><small>PostgreSQL · API REST · accès aux données</small></article>
          <article className="about-service-card"><div className="about-service-number">04</div><h3>Requêtes et actions sans code</h3><p>Créez des routes personnalisées pour lire des données, appliquer des filtres, calculer des totaux, regrouper des résultats ou exécuter des actions métier, sans devoir programmer chaque endpoint.</p><small>Requêtes · actions · exemples VBA prêts à copier</small></article>
        </div>
      </section>

      <section className="about-purpose">
        <div><span className="about-kicker">POURQUOI EXCELPRO ?</span><h2>Rendre la technologie plus accessible, sans rendre le travail plus compliqué.</h2></div>
        <div className="about-purpose-copy"><p>Notre raison d'être est de donner une nouvelle portée aux solutions que les personnes, les entrepreneurs, les écoles, les organisations et les entreprises ont déjà créées avec Excel.</p><p>Nous voulons réduire la distance entre une idée et un outil utilisable : conserver ce qui fonctionne, faciliter le passage à des applications modernes et ouvrir la voie à des usages connectés et collaboratifs.</p><p>ExcelPro ne cherche pas à dévaloriser Excel. Au contraire, nous partons de sa popularité et de sa souplesse pour aider ses utilisateurs à franchir une nouvelle étape.</p></div>
      </section>

      <section className="about-author"><div className="about-author-mark">KT</div><div><span className="about-kicker">À L'ORIGINE DU PROJET</span><h2>Kionga Timothée Splane</h2><p>Auteur du projet ExcelPro</p><p className="about-author-note">Une initiative portée par l'envie de transformer les difficultés concrètes rencontrées avec les outils bureautiques en solutions numériques plus accessibles, utiles et évolutives.</p></div></section>

      <section className="about-final"><span className="about-kicker">LA SUITE S'ÉCRIT AVEC VOUS</span><h2>Votre classeur a déjà une histoire. Donnons-lui de nouvelles possibilités.</h2><p>Découvrez comment ExcelPro peut accompagner votre projet, de l'analyse du fichier à son utilisation comme application ou source de données.</p><div className="about-actions"><button className="primary big" onClick={onStart}>Commencer avec mon fichier</button><button className="big about-light-button" onClick={onHosting}>Explorer l'hébergement</button></div></section>
    </div>
  );
}
