# Patient lookup service (optional)

A single read-only endpoint that lets the ISNCSCI worksheet search the on-prem
MSSQL warehouse for currently admitted patients.

**You probably do not need this.** The worksheet in `../webapp` is a static site.
If your patients are reachable through a Power BI semantic model, use the
`powerbi` lookup provider instead and deploy nothing but static files. This
service is for sites where the warehouse is the only available source.

## What it does

`GET /api/patients/search?q=<text>&limit=<n>` → `{ "results": [ … ] }`

```json
{
  "results": [
    {
      "mrn": "10004821",
      "familyName": "Testpatient",
      "givenName": "Alex",
      "dateOfBirth": "1978-02-03",
      "sex": "M",
      "ward": "Spinal Unit 4B",
      "encounter": "ENC-2026-004821"
    }
  ]
}
```

`GET /health` → `{ "status": "ok" }`

## Setup

```bash
cd server
npm install                     # installs the mssql driver, the only dependency
cp config.example.json config.json
$EDITOR config.json             # set the connection and the SQL
npm start
```

Then point the worksheet at it in `webapp/config.json`:

```json
{ "lookup": { "provider": "rest", "rest": { "url": "/api/patients/search" } } }
```

Serve the static site and this service under the same origin (an IIS or nginx
reverse proxy mapping `/api/` here and everything else to `webapp/`). Same-origin
means no CORS configuration and no tokens: the browser simply sends the session
the user already has.

## Configuration

Config comes from `config.json`, overridden by environment variables. Put
credentials in the environment so they never sit on disk.

| Key | Environment | Notes |
| --- | --- | --- |
| `port`, `host` | `PORT`, `HOST` | Defaults to `127.0.0.1:8081` — bind to localhost and front it with a proxy. |
| `sql.connection.server` | `MSSQL_SERVER` | |
| `sql.connection.database` | `MSSQL_DATABASE` | |
| `sql.connection.user` | `MSSQL_USER` | Omit both user and password to use integrated auth via the driver. |
| `sql.connection.password` | `MSSQL_PASSWORD` | |
| `sql.query` | — | Your SELECT. Must return the column aliases above. `@q` and `@limit` are bound parameters. |
| `requireUser` / `userHeader` | — | Refuse requests without an authenticated user, taken from a header your proxy sets. |
| `rateLimit` | — | Per user (or per IP when anonymous). |
| `auditLogPath` | — | JSON lines. Defaults to stdout. |
| `allowedOrigins` | — | Leave empty for same-origin deployments. |
| `allowedHeaders` | `["Accept"]` | Request headers a cross-origin caller may send. If the worksheet is configured with `lookup.rest.headers` — an API key, say — name them here or the browser blocks the request at preflight. `Accept` is always allowed. |

## Security notes

- **Use a dedicated SQL login** with `SELECT` on one view and nothing else. The
  service never issues anything but your configured statement.
- **The search text is a bound parameter**, never string-concatenated, and is
  additionally stripped to letters, digits, spaces, apostrophes, hyphens and
  full stops before it reaches the driver.
- **Errors are opaque to the client.** A database failure returns
  "The patient index is unavailable"; the detail goes to the audit log only.
- **The audit log records the search, not the results** — timestamp, user,
  client address, query text and a row count. That is what an audit of a patient
  index needs to answer, without turning the log into a second copy of the
  patient list.
- **Do not expose this outside the internal network.** It has no authentication
  of its own by design; it trusts the proxy in front of it.
