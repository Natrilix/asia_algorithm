/**
 * Patient lookup providers.
 *
 * Every provider resolves to the same normalised record so the rest of the app
 * neither knows nor cares where the patient list came from. Which one runs is a
 * single line in `config.json`, which is what makes this deployable at sites
 * that can expose a Power BI model, sites that can expose an internal API, and
 * sites that can expose neither.
 */

import { createDemoProvider } from './demo.js';
import { createRestProvider } from './rest.js';
import { createPowerBiProvider } from './powerbi.js';

/**
 * @typedef {object} PatientRecord
 * @property {string} mrn
 * @property {string} familyName
 * @property {string} givenName
 * @property {string} dateOfBirth ISO `yyyy-mm-dd`
 * @property {string} [sex]
 * @property {string} [ward]
 * @property {string} [encounter]
 * @property {string} [source] provenance, shown to the user
 */

const FACTORIES = {
  demo: createDemoProvider,
  rest: createRestProvider,
  powerbi: createPowerBiProvider,
};

/**
 * @returns {{name: string, enabled: boolean, search: (query: string) => Promise<PatientRecord[]>,
 *            signIn?: () => Promise<void>, handleRedirect?: () => Promise<boolean>}}
 */
export function createLookupProvider(config) {
  const settings = config.lookup ?? {};
  const factory = FACTORIES[settings.provider];
  if (!factory) {
    return {
      name: 'none',
      enabled: false,
      async search() {
        return [];
      },
    };
  }
  return factory(config);
}

/** Trims and length-checks a query before any provider sees it. */
export function normaliseQuery(value, config) {
  const query = String(value ?? '').trim().replace(/\s+/g, ' ');
  const minimum = config.lookup?.minQueryLength ?? 2;
  return query.length >= minimum ? query : '';
}

/**
 * Coerces a provider's row into the normalised shape, so a stray null or a
 * `Date` from a JSON payload cannot reach the form.
 */
export function normaliseRecord(row, source = '') {
  const text = (value) => (value === null || value === undefined ? '' : String(value).trim());
  return {
    mrn: text(row.mrn),
    familyName: text(row.familyName),
    givenName: text(row.givenName),
    dateOfBirth: toIsoDate(row.dateOfBirth),
    sex: text(row.sex),
    ward: text(row.ward),
    encounter: text(row.encounter),
    source: text(row.source) || source,
  };
}

/**
 * Accepts the date shapes these back ends actually emit — ISO strings, ISO
 * date-times, and SQL `yyyy-mm-dd hh:mm:ss` — and returns `yyyy-mm-dd`.
 */
export function toIsoDate(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const text = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  const pad = (input) => String(input).padStart(2, '0');
  return `${parsed.getUTCFullYear()}-${pad(parsed.getUTCMonth() + 1)}-${pad(parsed.getUTCDate())}`;
}
