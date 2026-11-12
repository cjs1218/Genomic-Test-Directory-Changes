# Historic releases: how to add one

The UK Government Web Archive won't let scripts download files (it shows a "confirm you are human" check). So each
historic release is saved by hand, once. It takes about 2 minutes per release.

## 1. Find the release in the web archive

Open the [archive timeline for the National genomic test directory page](https://webarchive.nationalarchives.gov.uk/ukgwa/timeline/https:/www.england.nhs.uk/publication/national-genomic-test-directories/).
Pick a capture from each period, oldest first. On the archived page, the **Rare and inherited disease** section shows
"Version X. Published DATE" under each document.

## 2. Save both files

From that archived page, save:

- **National genomic test directory for rare and inherited disease** (`.xlsx`)
- **Rare and inherited disease eligibility criteria** (`.pdf`). The earliest releases may have no separate PDF; that's fine.

Keep the original file names. Put them in `sources/files/`. On GitHub, open that folder, choose **Add file → Upload files**,
and commit.

## 3. Note the details

Copy this block for each release:

```
Version:            e.g. v1.2
Published:          e.g. 1 October 2019   (the "Published" date on the page)
In force from:      only if the document says a different date
Spreadsheet file:   file name
Criteria PDF file:  file name
Archive page URL:   the address of the archived page you saved from
```

Then either add an entry to `sources/manifest.json` (copy an existing entry) or pass the details to Claude to add.

## 4. Build

```
npm run parse          # every release with files: sources/parsed/<id>.json, with a list of things to check
npm run build          # data/ for the app
npm run panels         # PanelApp gene history for any new panels (slow: be patient, it is rate limited)
npm test
```

Read the `check:` lines `npm run parse` prints. Older releases lay out the spreadsheet and PDF differently, so a
release's first parse needs checking: open a few R codes in the app and compare them with the PDF.

## Releases checklist

Tick each one off as it's added. The list of releases comes from the archive. The v9 spreadsheet's change column
mentions May and July 2025 publications, so there are releases between v8 and v9.

| Release | Published | Files saved | Parsed and checked |
|---|---|---|---|
| v9.2 | 9 November 2026 | spreadsheet ✓, criteria PDF ☐ | spreadsheet ✓ |
| v9.1 | 20 May 2026 (directory v9, 8 April 2026) | imported from GeneRoute | ✓ |
| … older releases from the archive | | ☐ | ☐ |
