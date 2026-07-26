/**
 * Generic REST provider.
 *
 * Points at any endpoint that answers a search with JSON. With
 * `credentials: 'include'` it rides the site's existing Windows/intranet
 * authentication, so a site that already has an internal API needs no tokens,
 * no app registration and no code changes here — only a URL in config.json.
 *
 * Expected response, either shape:
 *   [ { mrn, familyName, givenName, dateOfBirth, sex, ward, encounter }, ... ]
 *   { results: [ ... ] }
 */

import { normaliseRecord } from './index.js';

export function createRestProvider(config) {
  const settings = config.lookup ?? {};
  const rest = settings.rest ?? {};

  return {
    name: 'rest',
    enabled: Boolean(rest.url),
    label: 'Institutional patient index',

    async search(query, { signal } = {}) {
      if (!rest.url) {
        throw new Error('No lookup endpoint is configured.');
      }
      const url = new URL(rest.url, window.location.href);
      url.searchParams.set(rest.queryParameter || 'q', query);
      if (settings.maxResults) {
        url.searchParams.set('limit', String(settings.maxResults));
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        credentials: rest.credentials || 'include',
        headers: { Accept: 'application/json', ...(rest.headers ?? {}) },
        signal,
      });

      if (response.status === 401 || response.status === 403) {
        throw new Error('You are not authorised to search the patient index.');
      }
      if (!response.ok) {
        throw new Error(`The patient index returned an error (${response.status}).`);
      }

      const payload = await response.json();
      const rows = Array.isArray(payload) ? payload : (payload.results ?? []);
      if (!Array.isArray(rows)) {
        throw new Error('The patient index returned an unexpected response.');
      }
      return rows
        .map((row) => normaliseRecord(row, 'Patient index'))
        .slice(0, settings.maxResults ?? 25);
    },
  };
}
