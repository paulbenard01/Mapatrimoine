# PCI Map: case study (draft)

> Draft for Paul to rewrite in his own voice before publishing. Facts and numbers are from the repository on 2026-10-10; anything marked *[Paul]* needs his input.

## English

### In one sentence

An interactive, bilingual map of France's national inventory of intangible cultural heritage that puts all 543 published elements where they live, says when the yearly ones happen, and turns each documented element into a printable mediation sheet.

Live site: <https://paulbenard01.github.io/Mapatrimoine/> · Code and data: <https://github.com/paulbenard01/Mapatrimoine>

### The problem

The Ministère de la Culture's *Inventaire national du patrimoine culturel immatériel* is rich but hard to use for the public: a long web page of titles grouped by theme, each linking to a PDF fiche of 20 to 50 pages. Nothing says where a practice lives on a map, and the fiches have no date field, so "when can I see it?" is buried in prose (often as a movable feast such as Good Friday). As a cultural mediator I wanted a tool that answers three visitor questions: *what is around me, when does it happen, and how do I talk about it with a group?*

### What I built

- **The whole inventory on a map**: 543 elements, 1,029 pins (several when a practice spans several towns), donut-chart clusters showing the mix of themes, and a list view that is a full alternative to the map (keyboard-operable, screen-reader announced).
- **Every element described**: 76 elements documented in detail from their fiche, and a short own-words summary in French and English for the other 467, all searchable in both languages; 530 with a credited picture.
- **Yearly events with evidence**: 71 events with a computed next occurrence, including 15 movable feasts calculated from Easter, a 12-month strip and a "this month" filter. Each date shows its evidence: a quote of at most 25 words from the fiche with its page, the organiser pages checked online, and a confidence level.
- **Announced dates**: a daily build matches DATAtourisme's open listing of about 80,000 tourist-office events to the documented events, so a visitor sees, for example, the 2027 dates of each band's outing at the Limoux carnival.
- **Mediation sheets**: for each documented element, a printable A4 sheet in French and English side by side: summary, picture, places, dates, three discussion questions and five vocabulary terms.
- **UNESCO flag**: the 34 inventory elements covered by one of France's UNESCO inscriptions carry a tag, a filter and a box explaining what the inscription means.
- **A Resources page for teachers and mediators**: 99 printable worksheets (the 34 UNESCO ones extended to two pages with context, the meaning of the inscription and a class activity), four one-hour lesson plans (primaire, collège, lycée, université) built around investigation, debate and creation, and eight guided stories that fly the map from element to element, by idea (giants and beasts, festive fires, voices) or by territory (Pays basque, Flandre, Outre-mer, Paris's diasporas).
- **Archive links**: 158 checked links to public audio and video archives (INA, UNESCO, Dastum, Gallica and others) for 103 elements.
- **Open data**: the structured facts, summaries, places, UNESCO links and timing rules can be downloaded as CSV and JSON under the Licence Ouverte 2.0.
- **Near me without tracking**: distance is computed on the device; no cookies, analytics or API keys.

### How I worked

- **Sources first.** The inventory page, the official list, the fiches, PCI Lab (the ministry and CIRDOC's online edition of the inventory), the government geo API and DATAtourisme are all public; each is cited on the site, and every non-trivial choice is logged with the alternative I rejected (`docs/decisions.md`).
- **Data ethics as rules, enforced by tests.** Fiches name community members and give their contacts: the repository never stores fiche text, and a CI test fails if any committed file contains an email or phone pattern. Fiches unpublished at the bearers' request are excluded. Summaries never name private individuals or workshops. Photos showing an identifiable child are not used.
- **Honesty about uncertainty.** Dates carry a confidence level and the inventory's own caveat ("typical timing; confirm with the organisers"); approximate places are labelled as such; a generated checklist (`docs/review.md`) tracks which texts and sheets I have reviewed.
- **Small, tested code.** A Python pipeline (scraping politely at one request per second with a cache, validation against JSON Schemas) and a TypeScript site (Vite, MapLibre). All date logic lives in one tested module. There are 82 pipeline tests and 62 front-end tests, a keyboard smoke test, CI on every push, and automatic deployment to GitHub Pages.

### What I learned *[Paul]*

- *e.g. what reading 70+ fiches taught me about how communities describe their own heritage.*
- *e.g. the gap between an inventory written for safeguarding and the questions visitors ask.*
- *e.g. trade-offs between completeness and verified precision (short summaries vs. curated records).*

### What's next

- Finish reviewing the remaining texts (worksheets, lessons, stories).
- Curate timing for the 42 events that only have a short summary.
- Test the mediation sheets with a real group *[Paul: school, association, museum?]* and adapt the questions by audience.
- A calendar export (.ics), more stories by region, and games for younger visitors.

### How it was made

Designed, directed and reviewed by Paul Benard. Code, data curation and drafts were produced with Claude Code (Anthropic) as an assistant, under the rules above. *[Paul: adjust to how you want to present this.]*

## Français

### En une phrase

Une carte interactive et bilingue de l'Inventaire national du patrimoine culturel immatériel qui situe les 543 éléments publiés, indique quand ont lieu les événements annuels et fait de chaque élément documenté une fiche de médiation imprimable.

### Le problème

L'Inventaire du ministère de la Culture est riche mais difficile d'accès pour le public : une longue page de titres classés par domaine, chacun renvoyant à une fiche PDF de 20 à 50 pages. Rien ne situe les pratiques sur une carte, et les fiches n'ont pas de champ de date : « quand puis-je y assister ? » est noyé dans le texte, souvent sous la forme d'une fête mobile comme le Vendredi saint. Comme médiateur, je voulais un outil qui réponde à trois questions de visiteur : *qu'y a-t-il autour de moi, quand cela a-t-il lieu, et comment en parler avec un groupe ?*

### Ce que j'ai réalisé

- **Tout l'Inventaire sur une carte** : 543 éléments, 1 029 points (plusieurs quand une pratique s'étend sur plusieurs communes), des regroupements en anneaux qui montrent les domaines présents, et une liste qui remplace entièrement la carte (utilisable au clavier, annoncée aux lecteurs d'écran).
- **Chaque élément décrit** : 76 éléments documentés en détail d'après leur fiche, et un court résumé rédigé par mes soins en français et en anglais pour les 467 autres, consultable par recherche dans les deux langues. 530 éléments sont illustrés, avec crédits.
- **Événements annuels sourcés** : 71 événements avec leur prochaine date calculée, dont 15 fêtes mobiles calculées depuis Pâques, une frise des 12 mois et un filtre « ce mois-ci ». Chaque date affiche ses sources : une citation de 25 mots au plus tirée de la fiche avec sa page, les pages d'organisateurs consultées et un niveau de fiabilité.
- **Dates annoncées** : chaque jour, la construction du site rapproche des événements documentés les quelque 80 000 manifestations publiées par les offices de tourisme dans DATAtourisme (données ouvertes).
- **Fiches de médiation** : pour chaque élément documenté, une fiche A4 imprimable, français et anglais côte à côte, avec résumé, image, lieux, dates, trois questions pour en parler et cinq mots de vocabulaire.
- **Signalement UNESCO** : les 34 éléments couverts par une inscription de la France à l'UNESCO portent une étiquette, un filtre et un encadré qui explique ce que signifie l'inscription.
- **Une page Ressources pour enseignants et médiateurs** : 99 fiches de travail imprimables (les 34 fiches UNESCO enrichies sur deux pages : contexte, sens de l'inscription, activité de classe), quatre séances d'une heure (primaire, collège, lycée, université) fondées sur l'enquête, le débat et la création, et huit parcours guidés qui font voyager la carte d'élément en élément, par idée (géants et bêtes, feux de fête, voix) ou par territoire (Pays basque, Flandre, Outre-mer, Paris des diasporas).
- **Archives** : 158 liens vérifiés vers des archives sonores et audiovisuelles publiques (INA, UNESCO, Dastum, Gallica…) pour 103 éléments.
- **Données ouvertes** : faits structurés, résumés, lieux, liens UNESCO et règles de dates téléchargeables en CSV et JSON sous Licence Ouverte 2.0.
- **« Autour de moi » sans pistage** : la distance est calculée sur l'appareil ; ni cookie, ni mesure d'audience, ni clé d'API.

### Méthode

Sources publiques citées et choix consignés (`docs/decisions.md`). Les règles d'éthique des données sont vérifiées par des tests : aucun texte de fiche ni donnée personnelle n'est publié, les fiches dépubliées à la demande des porteurs sont exclues. L'incertitude est affichée : niveau de fiabilité des dates, lieux approximatifs signalés, relecture suivie dans une liste générée. Le code est sobre et testé, avec intégration continue et déploiement automatique.

### Suite

Terminer la relecture des textes, documenter les dates des 42 événements qui n'ont qu'un résumé court, tester les fiches et les séances avec un groupe réel, puis proposer un export calendrier, d'autres parcours régionaux et des jeux pour les plus jeunes.
