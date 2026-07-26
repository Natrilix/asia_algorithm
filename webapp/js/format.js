/**
 * Shared display formatting.
 *
 * Dates are rendered as `3 Feb 1978` rather than a numeric form: on a document
 * that may be read in any country, `03/02/1978` is genuinely ambiguous.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Formats an ISO `yyyy-mm-dd` (as produced by `<input type="date">`). */
export function formatDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? '').trim());
  if (!match) {
    return String(iso ?? '').trim();
  }
  const [, year, month, day] = match;
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) {
    return iso;
  }
  return `${Number(day)} ${monthName} ${year}`;
}

/** Formats an ISO `HH:mm` as 24-hour `HH:mm`, tolerating seconds. */
export function formatTime(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? '').trim());
  if (!match) {
    return String(value ?? '').trim();
  }
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

export function formatDateTime(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `FAMILY, Given` — the conventional order on a clinical document. */
export function formatPatientName(patient) {
  const family = String(patient?.familyName ?? '').trim();
  const given = String(patient?.givenName ?? '').trim();
  if (family && given) {
    return `${family.toUpperCase()}, ${given}`;
  }
  return family ? family.toUpperCase() : given;
}

/** Strips characters that are unsafe or awkward in a download filename. */
export function safeFilename(value, fallback = 'isncsci') {
  const cleaned = String(value ?? '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || fallback;
}

/** Today's date as `yyyy-mm-dd`, for pre-filling the exam date. */
export function todayIso(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Current local time as `HH:mm`. */
export function nowTimeIso(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
