# Fiches approfondies : protocole et format

Ce dossier porte le programme de recherche qui transforme les fiches UNESCO de PCI Map en dossiers de connaissance (demande de Paul, 2026-10-20). Tout est public et rédigé en français. Les fiches servent à tenir une conversation d'interlocuteur averti : histoire, pratique, parcours d'inscription, sauvegarde, enjeux et débats.

## Fichiers

| Chemin | Contenu |
|---|---|
| `content/elements/<clé>.md` | Une fiche par inscription UNESCO ; `<clé>` est la clé de `data/unesco.yaml` (ex. `aubusson-tapestry`). Candidatures : `biou-arbois.md`. |
| `content/dossiers/<NN>-<slug>.md` | Les dossiers thématiques transversaux (01 à 10). |
| `content/glossaire.md` | Le glossaire (40 à 60 termes). |
| `recherche/suivi.md` | État de chaque fiche : à faire, en recherche, rédigé, vérifié. |
| `recherche/a-telecharger.md` | Documents que l'UNESCO empêche de télécharger automatiquement. |
| `recherche/notes/<clé>.md` | Notes de lot : documents à télécharger, points à vérifier, surprises. |
| `sources/<clé>/` | PDF téléchargés à la main par Paul. **Jamais versionnés** (`.gitignore`). |

`pci build` valide tout ce qui est dans `content/` et publie les fiches sur le site (`?dossier=<clé>`).

## Hiérarchie des sources

1. **UNESCO** : page de l'élément, dossier de candidature (ICH-01, ICH-02, ICH-03), rapport de l'Organe d'évaluation, décision du Comité (numéro du type `5.COM 6.14`), rapports périodiques (dont le rapport de la France de 2021, public), vidéos officielles.
2. **Ministère de la Culture** : fiche de l'Inventaire national (culture.gouv.fr, pci-lab.fr), communiqués, dossiers de presse.
3. **Porteurs** : sites officiels des associations, collectivités, musées.
4. **Recherche** : OpenEdition (*Ethnologie française*, *Terrain*, *In Situ*, *Cahiers du CFPCI*…), Cairn, HAL, theses.fr. Trois à cinq références clés par élément.
5. **Presse de qualité**, pour l'actualité et les débats.

Wikipédia sert à trouver des pistes, jamais de source unique. Ne pas contourner un blocage de téléchargement : noter le document dans `recherche/notes/<clé>.md` (titre, URL).

## Règles de fiabilité

- **Chaque affirmation factuelle** (date, chiffre, institution, décision) renvoie à une source numérotée : `[S3]`. Chaque source a son URL et sa date de consultation.
- **Faits, interprétations, débats** : les distinguer. Une interprétation dit qui l'avance ; un débat présente les positions.
- **Non vérifié** : écrire `[À VÉRIFIER]` à côté, jamais le présenter comme acquis. Deux sources contradictoires : le dire.
- **Chiffres** : datés et sourcés, sinon aucun chiffre.
- **Ne jamais inventer** un numéro de décision, de dossier ou une URL.
- **Droits** : résumer et reformuler. Citations courtes uniquement (25 mots au plus), entre « », avec leur source. Ne jamais recopier un dossier de candidature ou un article.
- **Personnes** : nommer les personnes importantes dans leur rôle public (présidents d'association, élus, Maîtres d'art, chercheurs et leurs publications, responsables d'institution). Jamais de coordonnées, jamais de données privées. (Décision de Paul, 2026-10-20 : exception à la règle « pas de noms », limitée aux fiches approfondies.)

## Format d'une fiche d'élément

Un fichier Markdown avec un en-tête YAML. L'en-tête porte ce que l'interface et la page « Préparer un rendez-vous » réutilisent (rubriques 1, 2 et 11) ; le corps porte les autres rubriques. Le site numérote les rubriques de 1 à 14 et génère lui-même la 1 (carte d'identité, complétée par `data/unesco.yaml` et l'Inventaire), la 2, la 11 et la 14 (sources et fiabilité).

```yaml
---
key: aubusson-tapestry          # clé de data/unesco.yaml
status: inscribed               # inscribed | nominated
# title_fr / title_en / list / year / unesco_url : seulement pour status: nominated
#   (sinon repris de data/unesco.yaml)
decision: "4.COM 13.xx [S2]"    # numéro de décision du Comité, avec sa source
unesco_file: "00250 [S1]"       # numéro du dossier UNESCO
states: [France]
extensions:                     # historique des extensions, ou []
  - "2018 : … [S3]"
domains: [craftsmanship]        # oral | performing-arts | social-practices | nature-knowledge | craftsmanship
territories: >-
  Régions, départements, communes concernés [S4].
communities: >-
  Communautés, groupes et porteurs [S4].
bodies:                         # organismes référents
  - "Cité internationale de la tapisserie (Aubusson) : rôle [S5]"
inventory: []                   # fiches d'Inventaire en plus de celles de data/unesco.yaml (candidatures)
summary_30s: >-
  Quatre phrases à dire de vive voix.
key_facts:                      # 5 ou 6 faits à connaître, sourcés
  - "… [S1]"
conversation:
  vocabulary:                   # le vocabulaire juste
    - {term: "inscrit", note: "et non « classé » : …"}
  mistakes: ["…"]               # erreurs fréquentes à éviter
  sensitive: ["…"]              # sujets sensibles
  questions:                    # 5 questions par type d'interlocuteur
    association: ["…?"]
    local_authority: ["…?"]
    researcher: ["…?"]
    institution: ["…?"]         # DRAC, ethnopôle, musée, ministère
sources:
  - {id: S1, title: "…", publisher: "UNESCO", url: "https://…", consulted: 2026-10-20, kind: unesco}
  # kind: unesco | ministere | porteur | recherche | presse | autre
last_checked: 2026-10-20
---
```

Corps : ces titres `##`, exactement, dans cet ordre (la rubrique « Enjeux et débats actuels » seulement si des débats existent) :

```markdown
## Description approfondie
## Histoire et contexte
### Chronologie            (liste de 8 à 15 dates : « - **1983** : … [S7] »)
## Parcours d'inscription
## Sauvegarde et viabilité
## Enjeux et débats actuels
## Chiffres clés
## Qui est qui
## Lien avec le rapport périodique   (indicateurs du Cadre global de résultats, I1 à I26)
## Comparaisons
## Ressources
```

- **Description approfondie** : ce qui se pratique, gestes et savoirs, acteurs et rôles, calendrier, lieux, objets et instruments, transmission, fonctions sociales aujourd'hui.
- **Histoire et contexte** : origines connues ou revendiquées (distinguer histoire et récit identitaire), évolutions et ruptures, reconnaissances antérieures (labels, Maîtres d'art, IG/IGP, monuments historiques…), chronologie.
- **Parcours d'inscription** : qui a porté la candidature et comment ; étapes (Inventaire, choix, dépôt, évaluation, décision) ; recommandation de l'Organe d'évaluation et points soulevés ; renvois ; extensions ; ce que l'inscription a changé d'après les rapports périodiques.
- **Sauvegarde et viabilité** : mesures annoncées dans le dossier, mesures mises en œuvre, état de la transmission, menaces.
- **Enjeux et débats actuels** : commercialisation et tourisme, folklorisation et authenticité, propriété intellectuelle et IG, bien-être animal et faune sauvage, climat, place des femmes et inclusion, conflits d'usage, tensions entre communautés ou États ; seulement ce qui existe pour l'élément.
- **Chiffres clés** : praticiens, événements, poids économique, formations ; datés et sourcés.
- **Qui est qui** : institutions et associations du réseau et leur rôle ; chercheurs de référence et leurs publications ; personnes importantes dans leur rôle public.
- **Lien avec le rapport périodique** : indicateurs `I1` à `I26` illustrés par l'élément, avec une phrase d'explication chacun.
- **Comparaisons** : éléments proches dans d'autres pays et dans l'Inventaire national.
- **Ressources** : dossier de candidature, décision, rapports, fiche d'inventaire, vidéo, 3 à 5 références scientifiques, 2 ou 3 articles de presse récents (liens).

Longueur : 1 500 à 2 500 mots (en-tête compris) ; l'essentiel doit tenir dans les rubriques 1, 2 et 11. Français clair et précis. Blocs YAML : préférer `>-` ou les guillemets doubles (« : » casse le YAML nu).

## Format d'un dossier thématique

```yaml
---
number: 2
title: "La politique française du PCI"
elements: [aubusson-tapestry, fest-noz]   # clés des fiches concernées
sources: [...]                            # même format que les fiches
last_checked: 2026-10-20
---
```

Corps libre en titres `##`, 1 000 à 2 000 mots, mêmes règles de sources (`[Sn]`, `[À VÉRIFIER]`).

## Méthode

1. **Pilote** : tapisserie d'Aubusson, fest-noz et dossier n° 2 ; Paul relit avant la suite.
2. **Production** : lots de 3 à 5 éléments, dans l'ordre de priorité ; sous-agents en parallèle, même format.
3. **Vérification indépendante** : un agent qui n'a pas rédigé la fiche contrôle chaque date, chiffre et nom par rapport à la source citée, corrige ou marque `[À VÉRIFIER]`, et teste les liens.
4. **Suivi** : `recherche/suivi.md` ; `pci check-links` détecte les liens morts.
5. **Fin de lot** : fiches produites et vérifiées, points `[À VÉRIFIER]` restants, documents à télécharger, cinq lignes au plus de choses surprenantes ou controversées.
6. **Décembre 2026** : rappel programmé (15 décembre) pour mettre à jour le Biou d'Arbois et l'extension de la transhumance après la session du Comité.
