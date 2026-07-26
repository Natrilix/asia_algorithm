/**
 * Runtime configuration.
 *
 * The app ships with working defaults and reads `config.json` from its own
 * directory at start-up. Deployments change behaviour by editing that one file
 * — there is no build step and nothing is baked into the JavaScript.
 */

export const DEFAULT_CONFIG = {
  /** Shown in the header and on the exported form. */
  institutionName: 'ISNCSCI worksheet',
  siteName: '',

  /** 'A4' or 'Letter'. Both render landscape. */
  pageSize: 'A4',

  /**
   * Patient identifier fields the clinician must supply before exporting.
   * Three points of identification is the default institutional requirement.
   */
  requiredPatientFields: ['name', 'mrn', 'dateOfBirth'],

  /** Label used for the medical record number throughout the UI. */
  mrnLabel: 'MRN',

  /**
   * Keep an in-progress exam in sessionStorage so a reload does not lose work.
   * This stores patient identifiers in the browser for the life of the tab.
   * Set to false where local policy forbids it.
   */
  autosave: true,

  /** Patient lookup. provider: 'none' | 'demo' | 'rest' | 'powerbi'. */
  lookup: {
    provider: 'demo',
    minQueryLength: 2,
    maxResults: 25,

    /** provider: 'rest' */
    rest: {
      url: '/api/patients/search',
      queryParameter: 'q',
      /** 'include' sends cookies / Windows auth; 'omit' for anonymous. */
      credentials: 'include',
      /** Optional static headers, e.g. an API key injected by the web server. */
      headers: {},
    },

    /** provider: 'powerbi' — browser-only path, no backend required. */
    powerbi: {
      tenantId: '',
      clientId: '',
      datasetId: '',
      groupId: '',
      /**
       * DAX evaluated against the semantic model. `{{query}}` is replaced with
       * the sanitised, DAX-escaped search text. Column names in the result are
       * mapped by `resultColumns` below.
       */
      dax: [
        'EVALUATE',
        'TOPN(',
        '  25,',
        '  FILTER(',
        "    'Admitted Patients',",
        "    SEARCHSTRING(\"{{query}}\", 'Admitted Patients'[MRN], 1, 0) > 0",
        "      || SEARCHSTRING(\"{{query}}\", 'Admitted Patients'[FamilyName], 1, 0) > 0",
        '  ),',
        "  'Admitted Patients'[FamilyName], ASC",
        ')',
      ].join('\n'),
      resultColumns: {
        mrn: 'Admitted Patients[MRN]',
        familyName: 'Admitted Patients[FamilyName]',
        givenName: 'Admitted Patients[GivenName]',
        dateOfBirth: 'Admitted Patients[DateOfBirth]',
        sex: 'Admitted Patients[Sex]',
        ward: 'Admitted Patients[Ward]',
        encounter: 'Admitted Patients[EncounterId]',
      },
    },
  },

  /**
   * Optional "send to record" action. Disabled unless `url` is set. The PDF is
   * POSTed as multipart/form-data alongside the patient identifiers.
   */
  upload: {
    url: '',
    credentials: 'include',
    headers: {},
    buttonLabel: 'Send to record',
  },
};

let cachedConfig = null;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Deep merge that lets a config file override only the keys it cares about. */
export function mergeConfig(base, override) {
  if (!isPlainObject(override)) {
    return base;
  }
  const result = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = mergeConfig(result[key], value);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Loads `config.json`. A missing file is not an error — the defaults are a
 * complete, working configuration (demo lookup, no upload).
 */
export async function loadConfig(url = 'config.json') {
  if (cachedConfig) {
    return cachedConfig;
  }
  let override = null;
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (response.ok) {
      override = await response.json();
    }
  } catch (error) {
    // Opening index.html straight from the filesystem blocks fetch; the
    // defaults still give a usable app, so this is deliberately not fatal.
    override = null;
  }
  cachedConfig = mergeConfig(DEFAULT_CONFIG, override);
  return cachedConfig;
}

export function getConfig() {
  return cachedConfig ?? DEFAULT_CONFIG;
}

/** Test seam: install a configuration without touching the network. */
export function setConfig(config) {
  cachedConfig = mergeConfig(DEFAULT_CONFIG, config);
  return cachedConfig;
}
