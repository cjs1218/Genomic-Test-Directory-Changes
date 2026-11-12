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

Spreadsheets are all parsed. The eligibility criteria PDFs are still needed for every release except v9.1, whose
criteria come from GeneRoute; without them the criteria wording can't be compared.

| Release | Published | Spreadsheet | Criteria PDF |
|---|---|---|---|
| 2018/19 | October 2018 | ✓ | ☐ (Annex 1, testing criteria) |
| 2019/20 | March 2019 | ✓ | ☐ |
| 2020/21 | August 2020 | ✓ | ☐ |
| 2021/22 | October 2021 | ✓ | ☐ |
| 2021/22 v2 | October 2021 (corrections; exact date not stated) | ✓ | ☐ |
| v3 | April 2022 | ✓ | ☐ |
| v3.1 | August 2022 (front sheet still says v3 April 2022) | ✓ | ☐ |
| v4 | 31 October 2022 | ✓ | ☐ |
| v5 | April 2023 | ✓ | ☐ |
| v5.1 | June 2023 | ✓ | ☐ |
| v6 | January 2024 | ✓ | ☐ |
| v7 | July 2024 (file named "eligibility-criteria-v7-updated" but it is the directory spreadsheet) | ✓ | ☐ |
| v7.1 | January 2025 | ✓ | ☐ |
| v8.0 | May 2025 | ☐ missing | ☐ |
| v8.1 | 9 July 2025 | ✓ | ☐ |
| v9 | 8 April 2026 | ✓ | ☐ |
| v9.1 | 20 May 2026 (criteria update; directory still v9) | (v9) | ✓ from GeneRoute |
| v9.2 | 9 November 2026 | ✓ | ☐ |

Releases mentioned by the spreadsheets but not found yet: December 2017 and March 2018 (before the 2018/19 directory);
September 2020 (the 2021/22 change column says "Changes since September 2020"; it may be the same as the August 2020
file); v8.0 (May 2025).
