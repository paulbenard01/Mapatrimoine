# Data notice / Avertissement sur les données

## Source

All heritage data comes from the **Inventaire national du patrimoine culturel immatériel**, published by the **Ministère de la Culture** (France) at
<https://www.culture.gouv.fr/thematiques/patrimoine-culturel-immateriel/le-patrimoine-culturel-immateriel/l-inventaire-national-du-patrimoine-culturel-immateriel>.
Credit: Ministère de la Culture, Inventaire national du patrimoine culturel immatériel. The inventory fiches are written with and by the communities that carry each practice.

## Licence uncertainty

The inventory fiches do not state a licence. The culture.gouv.fr site's legal notice applies the Licence Ouverte / Etalab 2.0 to its content "unless stated otherwise". We have not found an explicit statement for the fiches, so this repository treats their reuse conservatively (see below). If you are the rights holder and object to anything here, please open an issue.

## What this repository republishes

- The list of published elements as it appears on the inventory page: official name, ID, theme(s), year of inclusion and link to the fiche (`web/public/data/inventory.json`).
- For every element, place names and coordinates of communes/départements/regions (from the French government geo API, `geo.api.gouv.fr`). For curated elements they come from the fiche; for the others from the fiche's "Localisation" field as published on [PCI Lab](https://www.pci-lab.fr) (ministère de la Culture and CIRDOC) or from the fiche read online, with the source linked on the site. Only place names are taken.
- One picture per element where available: a [Wikimedia Commons](https://commons.wikimedia.org) file, shown with its author and licence as stated on its file page; otherwise the fiche image published on PCI Lab, displayed from pci-lab.fr (not copied into this repository), credited to the inventory fiche and linking to its PCI Lab page. For 42 elements with neither, one photo taken from the official fiche PDF is served by the site (`web/public/img/fiches/`, resized, metadata removed), credited to the fiche, whose own photo credits apply. The rights in fiche images stay with their holders; if you hold them and object, please open an issue and the photo will be removed.
- Short summaries written in our own words (FR and EN), for documented elements and, in `data/summaries.yaml`, for the rest of the inventory (read from the fiche text published on PCI Lab or from the official fiche). They are unreviewed drafts until marked `reviewed`.
- Printable mediation sheets (`data/mediation/`): discussion questions and vocabulary written for this site, drafts.
- Announced event dates from [DATAtourisme](https://www.datatourisme.fr) (ADN Tourisme, published on data.gouv.fr under the Licence Ouverte 2.0): event title, dates, commune, a web link and the publishing tourist office, matched automatically to documented events. Contacts, addresses and descriptions from DATAtourisme are not kept.
- Short quotes (at most 25 words) used as evidence for event timing, with the page number.
- Links back to the official fiche on culture.gouv.fr.
- For event dates, links to public pages of organisers, town halls and tourism boards, with a one-line summary in our own words of what each page states and the date we checked it. Contact details from those pages are not copied.

## What it does not republish

- Fiche PDFs or their full text (they are downloaded locally for curation only and git-ignored), and no fiche images other than the 42 photos described above.
- Personal data found in the fiches (names, emails, phone numbers of community members). A CI test blocks email and phone patterns.
- Elements whose fiche was unpublished at the request of the bearers ("Fiche dépubliée à la demande de ..."): they are excluded entirely.

## Timing disclaimer

Event dates are typical timing derived from the official inventory, not a programme. Confirm exact dates with the organisers.

## Code licence

The source code is under the MIT licence (`LICENSE`), Paul Benard's decision to confirm. This MIT licence does not cover the data from the Ministère de la Culture described above.

---

**FR (résumé).** Les données proviennent de l'Inventaire national du PCI (Ministère de la Culture). Les fiches n'indiquent pas de licence ; le site culture.gouv.fr applique par défaut la Licence Ouverte Etalab 2.0 « sauf mention contraire ». Ce dépôt ne republie ni les PDF ni le texte intégral des fiches, ni aucune donnée personnelle, et exclut les fiches dépubliées à la demande des porteurs. Il publie des faits structurés (dont les lieux de chaque élément, d'après la fiche ou son champ « Localisation » sur PCI Lab), des résumés rédigés par nos soins, des citations de 25 mots au plus et des liens vers les fiches officielles. Les images viennent de Wikimedia Commons (auteur et licence indiqués) ou, à défaut, de l'image de la fiche affichée depuis PCI Lab, créditée et non copiée ; pour 42 éléments sans l'une ni l'autre, une photo tirée de la fiche officielle est hébergée par le site, créditée à la fiche (les ayants droit peuvent en demander le retrait). Dates indicatives : vérifiez auprès des organisateurs.
