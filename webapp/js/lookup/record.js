/**
 * The normalised patient record, and the coercion every provider runs its rows
 * through.
 *
 * Kept separate from `lookup/index.js` so the providers can depend on it
 * without depending on the registry that loads them — the registry imports the
 * providers, so anything they share has to live outside it.
 */

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

/** Trims and length-checks a query before any provider sees it. */
export function normaliseQuery(value, config) {
  const query = String(value ?? '').trim().replace(/\s+/g, ' ');
  const minimum = config.lookup?.minQueryLength ?? 2;
  return query.length >= minimum ? query : '';
}
