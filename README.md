# Test Directory Changes

Why wasn't a test offered then? Compare an R code in the NHS England **rare and inherited disease National Genomic
Test Directory** on the date a patient was seen with the current version (or any other version), and see when each
change was published. It's for answering complaints and queries about testing that wasn't offered in the past.

A companion to the [GeneRoute Test Directory Explorer](https://generoute.co.uk/test-directory-explorer/), in the same
style and reading the directory the same way. Independent: not an NHS website. Nothing entered leaves the browser.

## What it shows

Enter an R code (or a condition: old and retired names are searched too) and the date the patient was seen:

- **Versions**: the release in force on that date, and the release you're comparing with (latest by default), with
  links to the original documents (PDF opens at the right page).
- **Summary for a reply**: a plain-English paragraph to copy, e.g. "Seen on 12 March 2020: the directory in force was
  v1.2… The entry for R208 changed in 3 of the 9 versions published since: • v4 (1 October 2022): eligibility criteria
  changed…". It also covers codes that didn't exist yet, codes since removed (with likely replacements) and renames.
- **When it changed**: a timeline of every release, with what changed for this code in each one, plus the
  spreadsheet's own change notes.
- **Eligibility criteria**: then vs now, word by word (side by side or inline). Whole added criteria stay whole lines.
- **Tests**: tests added, removed and changed (target, method, commissioning, family structure, scope).
- **Genes**: green genes on each PanelApp panel named for the tests, at the GMS signed-off version in force on each
  date, with the genes added and removed.
- **Other sections**: overlapping indications, where in pathway, requesting specialties.

There's also a **What changed in a version** view: every code that changed in one release, filterable by criteria,
tests, new, removed or renamed. Every view has a shareable link (e.g. `#R208&seen=2020-03-12`) and prints cleanly.

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
