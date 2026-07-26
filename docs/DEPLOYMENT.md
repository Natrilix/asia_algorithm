# Deploying the ISNCSCI worksheet

The worksheet in `webapp/` is a static site. There is no build step, no
framework, no package to install and no outbound request to any third party.
Copy the directory onto a web server and it works.

Everything below is about the two things that *can* need infrastructure: looking
up a patient, and (optionally) sending the finished PDF somewhere.

- [Quick start](#quick-start)
- [Hosting](#hosting)
- [Configuration](#configuration)
- [Patient lookup](#patient-lookup)
  - [Option A — Power BI, no backend](#option-a--power-bi-no-backend)
  - [Option B — an internal REST endpoint](#option-b--an-internal-rest-endpoint)
  - [Option C — the bundled MSSQL service](#option-c--the-bundled-mssql-service)
- [Sending the PDF to the record](#sending-the-pdf-to-the-record)
- [Information governance](#information-governance)
- [Maintenance](#maintenance)

## Quick start

```bash
npm run serve:webapp        # http://localhost:8080, demo patient data
```

The shipped `webapp/config.json` uses the `demo` lookup provider, which reads
`webapp/data/demo-patients.json`. No real patient data is involved, so this is
safe for training and demonstrations.

## Hosting

Any static web server will do. Two things matter:

1. **Serve `webapp/` over HTTP(S), not `file://`.** The app is made of ES
   modules and reads `config.json` with `fetch`; browsers block both on
   `file://` origins. (It degrades rather than breaks — you get the built-in
   defaults and no lookup — but do not deploy that way.)
2. **Serve `.js` as `text/javascript` and `.json` as `application/json`.**
   Default on nginx and modern IIS; older IIS installs may need the MIME type
   added.

Minimal nginx, with the optional lookup service behind the same origin:

```nginx
server {
    listen 443 ssl;
    server_name isncsci.example.internal;

    root /var/www/isncsci/webapp;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
        add_header Cache-Control "no-cache";
    }

    # Only if you deploy the bundled lookup service (Option C).
    location /api/ {
        proxy_pass http://127.0.0.1:8081/api/;
        proxy_set_header X-Forwarded-User $remote_user;
    }
}
```

On IIS, publish `webapp/` as the site root; if you use Windows Authentication,
the browser will authenticate the user before the app loads and the `rest`
lookup provider will inherit that session automatically.

## Configuration

Edit `webapp/config.json`. `webapp/config.sample.json` is a fully commented
copy, and `webapp/js/config.js` holds the defaults — anything you omit falls
back to those.

| Key | Purpose |
| --- | --- |
| `institutionName` | Shown in the header and printed on the form. |
| `pageSize` | `"A4"` (default) or `"Letter"`. Both render landscape. |
| `mrnLabel` | Rename "MRN" to whatever your site calls it (URN, UR, NHI…). |
| `requiredPatientFields` | Which identifiers must be present before export. Default `["name", "mrn", "dateOfBirth"]` — the three points of identification. Also accepts `familyName`, `sex`, `encounter`, `examDate`, `examiner`. |
| `autosave` | Keep an in-progress exam in `sessionStorage`. See [Information governance](#information-governance). |
| `lookup` | See below. |
| `upload` | Optional "send to record" button. |

The export is blocked until every required identifier *and* every one of the 132
exam values is present; the app names what is missing and jumps to it.

## Patient lookup

Set `lookup.provider` to `demo`, `rest`, `powerbi`, or `none` (which hides the
search box entirely and leaves the identifiers to be typed).

Whichever you choose, results are normalised to the same record:

```json
{
  "mrn": "10004821",
  "familyName": "Testpatient",
  "givenName": "Alex",
  "dateOfBirth": "1978-02-03",
  "sex": "M",
  "ward": "Spinal Unit 4B",
  "encounter": "ENC-2026-004821"
}
```

### Option A — Power BI, no backend

The browser signs the clinician into Entra ID and queries the semantic model
directly. Nothing is hosted but static files, and because the query runs *as the
signed-in user*, the model's own row-level security decides what they can see.

**1. Register the app** in Entra ID → App registrations → New registration:

- Redirect URI platform: **Single-page application** (this is what makes the
  browser token exchange work — do not choose "Web").
- Redirect URI: the exact page URL, e.g.
  `https://isncsci.example.internal/index.html`.
- API permissions → Power BI Service → Delegated → `Dataset.Read.All`, then
  grant admin consent.

No client secret is needed or wanted; the flow uses PKCE.

**2. Enable the tenant setting.** Power BI admin portal → Tenant settings →
*Dataset Execute Queries REST API*, enabled for the relevant security group.
Without this, queries fail with HTTP 403.

**3. Configure**:

```json
{
  "lookup": {
    "provider": "powerbi",
    "powerbi": {
      "tenantId": "<directory (tenant) ID>",
      "clientId": "<application (client) ID>",
      "datasetId": "<semantic model ID>",
      "groupId": "<workspace ID, or \"\" for My workspace>",
      "dax": "EVALUATE TOPN(25, FILTER('Admitted Patients', SEARCHSTRING(\"{{query}}\", 'Admitted Patients'[MRN], 1, 0) > 0 || SEARCHSTRING(\"{{query}}\", 'Admitted Patients'[FamilyName], 1, 0) > 0), 'Admitted Patients'[FamilyName], ASC)",
      "resultColumns": {
        "mrn": "Admitted Patients[MRN]",
        "familyName": "Admitted Patients[FamilyName]",
        "givenName": "Admitted Patients[GivenName]",
        "dateOfBirth": "Admitted Patients[DateOfBirth]",
        "sex": "Admitted Patients[Sex]",
        "ward": "Admitted Patients[Ward]",
        "encounter": "Admitted Patients[EncounterId]"
      }
    }
  }
}
```

Find `datasetId` and `groupId` in the workspace URL:
`app.powerbi.com/groups/<groupId>/datasets/<datasetId>/…`.

Adjust the DAX to your model's table and column names, keeping the `{{query}}`
placeholder. It is substituted into a DAX **string literal**: the search text is
stripped to letters, digits, spaces, apostrophes, hyphens and full stops, capped
at 64 characters, and any double quote is doubled so it cannot terminate the
literal. Keep `{{query}}` inside quotes — do not use it as a bare identifier.

`resultColumns` maps the DAX result column names to the record fields. The
mapper also accepts the unqualified column name, so `Admitted Patients[MRN]`
and `MRN` both resolve.

**Limits worth knowing:** `executeQueries` returns at most 100,000 rows / 1,000
columns and one query per call, and is not available for models with a live
connection to Analysis Services. A `TOPN` filtered search is well inside all of
this.

### Option B — an internal REST endpoint

If your team already exposes a patient search, point at it:

```json
{
  "lookup": {
    "provider": "rest",
    "rest": { "url": "/api/patients/search", "queryParameter": "q", "credentials": "include" }
  }
}
```

The app issues `GET <url>?q=<text>&limit=<n>` and accepts either a bare array or
`{ "results": [ … ] }`. With `credentials: "include"` and a same-origin URL it
rides the site's existing session, so Windows Authentication needs no extra
configuration. Unknown fields are ignored and dates are accepted as ISO,
ISO date-time, or SQL `yyyy-mm-dd hh:mm:ss`.

### Option C — the bundled MSSQL service

For sites whose only source is the on-prem warehouse, `server/` contains a
minimal read-only service that answers exactly the contract in Option B. See
[`server/README.md`](../server/README.md). It is optional and nothing in the
worksheet depends on it.

## Sending the PDF to the record

By default the clinician downloads or prints the PDF and files it as usual. If
you have a document-intake endpoint, set `upload.url` and a "Send to record"
button appears in the export dialog. It POSTs `multipart/form-data`:

| Part | Content |
| --- | --- |
| `file` | The PDF, named `ISNCSCI-<Family>-<Given>-<MRN>-<examDate>.pdf` |
| `mrn`, `familyName`, `givenName`, `dateOfBirth`, `encounter` | Patient identifiers |
| `examDate`, `examTime`, `examiner` | Examination details |
| `documentType` | Always `ISNCSCI` |

Leave `upload.url` empty and the button never appears.

## Information governance

Points your privacy or security review will ask about:

- **No third-party requests.** No CDN, no analytics, no web fonts, no telemetry.
  The only outbound calls are the ones you configure: your lookup source and, if
  set, your upload endpoint. The PDF is generated in the browser.
- **Autosave uses `sessionStorage`, never `localStorage`.** An in-progress exam
  survives an accidental reload but is discarded when the tab closes, which
  matters on a shared ward workstation. Set `"autosave": false` to disable it
  entirely; "New exam" clears it immediately.
- **Entra tokens also live in `sessionStorage`** and are cleared on sign-out or
  when the tab closes. No client secret exists to leak — the PKCE flow does not
  use one.
- **The PDF carries identifiers in its metadata** (`/Title`, `/Keywords`) as well
  as on every page, which is what document management systems index on. If your
  site would rather it did not, remove the identifier arguments in
  `pdfMetadata()` in `webapp/js/export.js`.
- **Every page repeats the three points of identification**, in the header band
  and again in the footer, so a page separated from the rest is still
  identifiable.
- **The bundled service logs the search, not the results** — see
  [`server/README.md`](../server/README.md).

### A note on the ASIA form

This produces our own worksheet layout carrying the same fields as the ISNCSCI
worksheet. It is deliberately **not** a reproduction of ASIA's copyrighted form
artwork. If your institution wants to publish or distribute the official form,
take that up with ASIA separately — the classification algorithm in `src/` is
Apache-2.0 licensed, but the printed form is not covered by that licence.

The classification itself comes from the Praxis Spinal Cord Institute algorithm
in `src/`, unchanged. This project adds a user interface around it; it does not
alter how anything is classified.

## Maintenance

The worksheet uses a committed copy of the algorithm at
`webapp/vendor/isncsci.esm.js` so it needs no build step to run. After changing
anything under `src/`:

```bash
npm run build:webapp-vendor   # rebuilds and re-vendors the bundle
npm run test:webapp           # model, render and lookup checks
npm test                      # the library's own suite
git add webapp/vendor/isncsci.esm.js
```

`npm run test:webapp` runs `webapp/test/*.check.js` with the Node test runner.
They are named `.check.js` rather than `.test.js` so Jest, which owns the
TypeScript suite, leaves them alone.
