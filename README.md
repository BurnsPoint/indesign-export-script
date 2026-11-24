# InDesign Multi-Format Export Script

## Files
- `export-open-doc-formats.jsx` - ExtendScript for Adobe InDesign.

## What It Exports
For each page in the active document, the script creates:
- PDF (Print) using preset `PRINT` -> format `NOBLEED`
- PDF (Print) using preset `PRINT_BLEED` -> format `BLEED`
- PDF (Interactive) -> format `WEB`
- PNG (High quality, 150 dpi, non-transparent) -> format `PNG@150`
- PNG (High quality, 300 dpi, non-transparent) -> format `PNG@300`

## Output Structure
Exports are written next to the INDD file (or Desktop if the document is unsaved), inside:
- `_exports/{Document Name}/NOBLEED/`
- `_exports/{Document Name}/BLEED/`
- `_exports/{Document Name}/WEB/`
- `_exports/{Document Name}/PNG/` (contains both `PNG@150` and `PNG@300`)

Only the folders for enabled export formats are created. The `PNG` folder is created if either `PNG150` or `PNG300` is enabled.

If `_exports/{Document Name}` already exists when you click `Continue`, it is moved to:
- `_exports/_ss/moved_{Datetime}/{Document Name}`
before the new export starts.

Filename format:
`{Document Name}-{Format}-{Page number}.{extension}`

Example:
`MyBrochure-PNG@300-12.png`

## Optional CSV Page Settings
If a settings CSV exists next to the INDD file, each row controls one page (row 1 = page 1, row 2 = page 2, etc.).

When several INDD files are in the same folder, use document-specific CSV files. The script checks for settings in this order:
- `{Document Name}_indd_export_settings.csv`
- `indd_export_settings_{Document Name}.csv`
- `{Document Name}.csv`
- `indd_export_settings.csv`

The shared `indd_export_settings.csv` remains the fallback if no document-specific CSV exists.

Column 1 rules:
- `0` -> do not export that page
- leading `/` -> do not export that page
- leading `#` -> do not export that page (the row still corresponds to its page)
- non-empty text -> use that text instead of page number in filename suffix
- empty -> use the actual page number (default behavior)

Column 2 rules:
- `p` -> append the page dimensions in millimeters as `-WIDTHxHEIGHT`
- empty -> do not append dimensions

Example CSV rows:
- `PageOneName,p`
- `0,`
- `/PageOneName,p`
- `#PageOneName,p`
- `,p`
- `FORMATS,NOBLEED|WEB|PNG300`

When any page is skipped with `#` or `/`, existing export folders and other files are kept in place. Only files that the new export will overwrite are copied to the archive. If no files will be overwritten, no archive is created.

Example output:
- `{Document Name}-{Format}-PageOneName-430x452.pdf`

If the CSV file is missing, all pages export with default page-number suffixes.

## Optional Global Format Row
The final non-empty CSV row can be used to set formats for the whole export:
- `FORMATS,NOBLEED|WEB|PNG300`

Accepted format tokens:
- `NOBLEED`
- `BLEED`
- `WEB`
- `PNG150`
- `PNG300`

If the `FORMATS,...` row is missing, the default is all formats.

## Confirmation Dialogs
- Before export starts, a confirmation dialog shows:
  - export location
  - pages to export
  - formats to export
- Choose `Continue` to proceed or `Cancel` to stop.
- At completion, a dialog includes an `Open Export Folder` button.

## Install
1. Copy `export-open-doc-formats.jsx` to your InDesign Scripts folder:
   - In InDesign: `Window > Utilities > Scripts`
   - Right-click `User` and choose `Reveal in Finder` (macOS) or `Reveal in Explorer` (Windows)
   - Put the `.jsx` file in that folder

## Use
1. Open your InDesign document.
2. In the Scripts panel, double-click `export-open-doc-formats.jsx`.
3. Wait for the completion alert, then check the output folders.

## Notes
- Required PDF export presets must exist in InDesign: `PRINT` and `PRINT_BLEED`.
