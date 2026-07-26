# ISNCSCI worksheet

A browser-based ISNCSCI (ASIA) examination form for institutional use: enter the
exam, see the classification live, and export a PDF that carries the patient's
identification and is fit to file in the medical record.

Built on the Praxis Spinal Cord Institute classification algorithm in `../src`,
which is used unchanged.

## What it is

**Static files. No build step, no dependencies, no CDN.** Copy this directory to
a web server and it runs. Everything — the grid, the classification, the SVG
preview, the PNG, and the PDF writer — is plain ES modules in `js/`.

```bash
npm run serve:webapp       # from the repository root, then open localhost:8080
```

## What it adds over the public form

- **Three points of patient identification**, enforced before export and
  repeated in the header band and footer of every page.
- **Patient lookup** of currently admitted patients, from a Power BI semantic
  model (no backend at all), an internal REST endpoint, or the optional MSSQL
  service in `../server`.
- **Institution-specific configuration** — name, paper size, the label your site
  uses for the MRN, which identifiers are mandatory.
- **An optional "send to record" upload** for document-intake endpoints.

See [`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md) for hosting and setup.

## Using it

Keyboard first — an exam is 132 values, so it is built to be filled in without
touching the mouse:

| Key | Action |
| --- | --- |
| `0`–`2` (sensory), `0`–`5` (motor) | Enter the value and move down |
| `N` | Not testable (`NT`) |
| `*` | Cycle the non-SCI flag: none → `*` → `**` → none |
| `↑` `↓` `←` `→` | Move between cells |
| `Enter` | Jump to the next cell without a value |
| `Backspace` | Clear the cell |
| `Esc` | Close the keypad |

A keypad also pops up beside the active cell for touch screens.

**The star flags matter to the result.** `*` records an impairment that is not
due to the spinal cord injury and is *not* to be counted as normal; `**` records
one that *is* to be counted as normal for classification. Values that are
already normal (`2` sensory, `5` motor) cannot be starred. This mirrors
`isNormalSensory` in `../src/classification/common.ts` — the algorithm, not this
app, decides what the flags mean.

Export is blocked until the exam is complete and the required identifiers are
present; the results panel lists exactly what is missing and clicking an entry
jumps to that cell.

## Layout

```
index.html            page shell
css/app.css           all styling, including the print stylesheet
config.json           deployment configuration (see config.sample.json)
data/                 demo patient fixture
vendor/               committed build of the algorithm (npm run build:webapp-vendor)
js/
  app.js              entry point and wiring
  config.js           configuration loading and defaults
  model.js            exam state, validation, JSON round-trip
  classify.js         wrapper over the algorithm, plus provisional subtotals
  isncsci-data.js     levels, allowed values, star rules
  form.js             the data-entry grid
  results.js          live classification panel
  patient.js          identification fields and their validation
  lookup-panel.js     the search UI
  export.js           PDF / PNG / SVG / JSON / print / upload
  format.js           date and name formatting
  auth/pkce.js        Entra ID sign-in (authorisation code + PKCE)
  lookup/             demo, rest and powerbi providers behind one interface
  render/
    drawing.js        display list primitives
    worksheet.js      the printable form layout
    svg.js            display list -> SVG (preview, PNG)
    pdf.js            display list -> vector PDF
    fonts.js          Helvetica metrics for measuring and wrapping
test/                 node --test suites (npm run test:webapp)
```

The worksheet is described once as a display list and rendered to both SVG and
PDF, so the preview on screen is the document that gets filed. The PDF is real
vector output with selectable text in the base-14 Helvetica faces — no embedded
font, no rasterisation, and no PDF library.
