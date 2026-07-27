/**
 * Power BI provider — the zero-backend path.
 *
 * The browser signs the clinician in with Entra ID and then posts DAX straight
 * at the semantic model's `executeQueries` endpoint. Nothing is hosted beyond
 * the static files, and the query runs as the signed-in user, so Power BI's own
 * row-level security decides which patients they can see rather than a service
 * account we would otherwise have to secure ourselves.
 *
 * Deployment needs (see docs/DEPLOYMENT.md):
 *   - an Entra app registration with a *Single-page application* redirect URI;
 *   - delegated permission `Dataset.Read.All` for the Power BI Service;
 *   - the tenant setting "Dataset Execute Queries REST API" enabled.
 */

import { EntraAuth, SignInRequiredError } from '../auth/pkce.js';
import { normaliseRecord } from './record.js';

const SCOPE = 'https://analysis.windows.net/powerbi/api/Dataset.Read.All';
const MAX_QUERY_LENGTH = 64;

/**
 * Makes a user-supplied string safe to interpolate into a DAX string literal.
 * DAX escapes a double quote by doubling it; everything else that could change
 * the shape of the expression is removed rather than escaped.
 */
export function escapeDaxLiteral(value) {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, MAX_QUERY_LENGTH)
    .replace(/"/g, '""');
}

/** Only the characters a name or record number can legitimately contain. */
export function sanitiseQuery(value) {
  return String(value ?? '')
    .replace(/[^A-Za-z0-9 '\-.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

export function buildDax(template, query) {
  return String(template ?? '').replace(/\{\{\s*query\s*\}\}/g, escapeDaxLiteral(query));
}

export function createPowerBiProvider(config) {
  const settings = config.lookup ?? {};
  const powerbi = settings.powerbi ?? {};
  const auth = new EntraAuth({
    tenantId: powerbi.tenantId,
    clientId: powerbi.clientId,
    scopes: [SCOPE],
    redirectUri: powerbi.redirectUri,
  });

  const endpoint = powerbi.groupId
    ? `https://api.powerbi.com/v1.0/myorg/groups/${encodeURIComponent(powerbi.groupId)}/datasets/${encodeURIComponent(powerbi.datasetId)}/executeQueries`
    : `https://api.powerbi.com/v1.0/myorg/datasets/${encodeURIComponent(powerbi.datasetId)}/executeQueries`;

  return {
    name: 'powerbi',
    enabled: Boolean(auth.isConfigured() && powerbi.datasetId),
    label: 'Power BI semantic model',
    requiresSignIn: true,

    handleRedirect: () => auth.handleRedirect(),
    signIn: () => auth.signIn(),
    signOut: () => auth.signOut(),
    isSignedIn: () => Boolean(auth.readSession()),

    async search(query, { signal } = {}) {
      if (!powerbi.datasetId) {
        throw new Error('No Power BI dataset is configured.');
      }
      const token = await auth.getAccessToken();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          queries: [{ query: buildDax(powerbi.dax, sanitiseQuery(query)) }],
          serializerSettings: { includeNulls: true },
        }),
        signal,
      });

      if (response.status === 401) {
        auth.signOut();
        throw new SignInRequiredError();
      }
      if (!response.ok) {
        throw new Error(await describeError(response));
      }

      const payload = await response.json();
      const rows = payload?.results?.[0]?.tables?.[0]?.rows ?? [];
      return mapRows(rows, powerbi.resultColumns ?? {}).slice(0, settings.maxResults ?? 25);
    },
  };
}

/** Renames DAX result columns (`'Table'[Column]`) to the normalised field names. */
export function mapRows(rows, columnMap) {
  const entries = Object.entries(columnMap);
  return rows.map((row) => {
    const mapped = {};
    for (const [field, column] of entries) {
      mapped[field] = row[column] ?? row[stripTablePrefix(column)] ?? '';
    }
    return normaliseRecord(mapped, 'Power BI');
  });
}

function stripTablePrefix(column) {
  const match = /\[(.+)\]$/.exec(String(column));
  return match ? match[1] : column;
}

async function describeError(response) {
  const detail = await response.json().catch(() => null);
  const message = detail?.error?.['pbi.error']?.details?.[0]?.detail?.value
    ?? detail?.error?.message;
  if (response.status === 403) {
    return message
      || 'Power BI refused the query. Check that the "Dataset Execute Queries REST API" '
      + 'tenant setting is enabled and that you have access to the dataset.';
  }
  return message || `Power BI returned an error (${response.status}).`;
}
