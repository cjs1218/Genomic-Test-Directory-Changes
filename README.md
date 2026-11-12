# Test Directory Changes

Why wasn't a test offered then? Compare an R code in the NHS England **rare and inherited disease National Genomic
Test Directory** on the date a patient was seen with the current version (or any other version), and see when each
change was published. It's for answering complaints and queries about testing that wasn't offered in the past.

A companion to the [GeneRoute Test Directory Explorer](https://generoute.co.uk/test-directory-explorer/), in the same
style and reading the directory the same way. Independent: not an NHS website. Nothing entered leaves the browser.

## What it shows

Type an R code, a condition (old and retired names too) or a gene, choose it from the suggestions, and enter the date the
patient was seen. The page then shows, in this order:

- **Short answer**: plain English to copy into a reply. Which version applied then and which applies now, when the
  criteria and tests changed (by month), and the criteria wording then and now, quoted. Retired codes say what replaced
  them, citing NHS England's change log where that is the source. A *detailed record* (every change, with genes) sits
  underneath for notes.
- **Eligibility criteria: what changed**: each changed line as a "then / now" pair with the changed words marked
  (changes only in spacing, punctuation or list numbering are ignored). Also available side by side or as full text.
- **When it changed**: the versions that changed the criteria, tests, name or code, each dated. Each criteria change
  opens to show that step's wording change. "Show every version" adds the minor ones.
- **Tests**, **Genes** (PanelApp genes signed off for NHS testing on each date) and the other criteria sections.

When a version's criteria document isn't held (currently v9.2), its criteria are taken from the nearest version that is,
and the page says so. There is also a **What changed in a version** view and a list of the **Versions held**. Every view
has a shareable link (e.g. `#R208&seen=2019-06-01`) and prints cleanly.

**Dates.** A change is dated by the release it first appears in, and a release is taken to be in force from its
publication date (or `inForceFrom` in the manifest, when a release says otherwise) until the next one.

## Structure

```
index.html, style.css      The page (GeneRoute teal palette; light, dark and print)
js/core.js                 Logic with no page code (release on a date, word/line differences, genes on a date, summary)
js/app.js                  The page code; loads each release and panel history only when needed
data/                      Generated (do not edit): releases.js, changes.js, v/<release>.js, panels/<panel id>.js
sources/manifest.json      Every release: id, label, publication date, files, document links
sources/files/             The original spreadsheets and PDFs (saved by hand from the web archive; see sources/README.md)
sources/parsed/            Each release parsed to JSON (checked in, so differences are reproducible and reviewable)
sources/panelapp/          PanelApp download cache (signed-off gene lists never change)
tools/parse_version.py     Spreadsheet + PDF → sources/parsed/<id>.json (column aliases for older layouts)
tools/extract_criteria.py  Verbatim criteria from the PDF text (shared with GeneRoute)
tools/import_generoute.py  Import a release GeneRoute has already parsed (used for v9.1)
tools/build_site.py        Parsed releases → data/ (what changed for each code in each release; possible replacement codes)
tools/panel_history.py     PanelApp sign-off history → data/panels/
tests/                     npm test
```

Retired codes: `build_site.py` suggests replacements automatically: a code that mentions the old one, or a new code
with a similar name. These show as "possibly replaced by". To confirm or correct one, add it to
`sources/code-links.json`:

```json
{ "links": [ { "from": "R27", "release": "v3", "to": ["R28"], "note": "merged into R28" } ] }
```

## Updating

See [sources/README.md](sources/README.md) to add a release. Then `npm run parse && npm run build && npm run panels && npm test`.
Needs Python 3 with openpyxl, `pdftotext` (poppler) and Node 22. To view it locally: `npm run serve` and open http://localhost:8000.

Publishing: in the repository settings, turn on GitHub Pages from the `main` branch root.
