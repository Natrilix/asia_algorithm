/**
 * Demo provider — a local fixture file, so the app can be developed,
 * demonstrated and trained on without touching a real patient index.
 */

import { normaliseRecord } from './index.js';

export function createDemoProvider(config) {
  const settings = config.lookup ?? {};
  let cache = null;

  async function load() {
    if (cache) {
      return cache;
    }
    const response = await fetch('data/demo-patients.json', { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error('The demo patient list could not be loaded.');
    }
    const rows = await response.json();
    cache = rows.map((row) => normaliseRecord(row, 'Demo data'));
    return cache;
  }

  return {
    name: 'demo',
    enabled: true,
    label: 'Demo data (no real patients)',
    async search(query) {
      const rows = await load();
      const needle = query.toLowerCase();
      return rows
        .filter((row) => row.mrn.toLowerCase().includes(needle)
          || row.familyName.toLowerCase().includes(needle)
          || row.givenName.toLowerCase().includes(needle))
        .slice(0, settings.maxResults ?? 25);
    },
  };
}
