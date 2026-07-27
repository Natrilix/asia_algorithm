/**
 * Lookup adapter tests — normalisation, DAX escaping and result mapping.
 * These run without a browser: no provider is constructed, only its pure parts.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { normaliseRecord, normaliseQuery, toIsoDate } from '../js/lookup/record.js';
import { escapeDaxLiteral, sanitiseQuery, buildDax, mapRows } from '../js/lookup/powerbi.js';
import { mergeConfig, DEFAULT_CONFIG } from '../js/config.js';
import {
  sanitiseQuery as serverSanitise, shapeRow, createRateLimiter,
  corsHeaders, preflightHeaders, allowedHeaderNames,
} from '../../server/server.js';

test('records are normalised to strings whatever the source sent', () => {
  const record = normaliseRecord({
    mrn: 10004821,
    familyName: '  Testpatient ',
    givenName: null,
    dateOfBirth: '1978-02-03T00:00:00.000Z',
    ward: undefined,
  }, 'Power BI');

  assert.deepEqual(record, {
    mrn: '10004821',
    familyName: 'Testpatient',
    givenName: '',
    dateOfBirth: '1978-02-03',
    sex: '',
    ward: '',
    encounter: '',
    source: 'Power BI',
  });
});

test('dates arrive in several shapes and leave as yyyy-mm-dd', () => {
  assert.equal(toIsoDate('1978-02-03'), '1978-02-03');
  assert.equal(toIsoDate('1978-02-03T11:22:33Z'), '1978-02-03');
  assert.equal(toIsoDate('1978-02-03 00:00:00'), '1978-02-03');
  assert.equal(toIsoDate(''), '');
  assert.equal(toIsoDate(null), '');
  assert.equal(toIsoDate('not a date'), '');
});

test('short queries are rejected before a provider is called', () => {
  const config = mergeConfig(DEFAULT_CONFIG, { lookup: { minQueryLength: 3 } });
  assert.equal(normaliseQuery('ab', config), '');
  assert.equal(normaliseQuery('abc', config), 'abc');
  assert.equal(normaliseQuery('  Smith   John ', config), 'Smith John');
});

test('DAX interpolation cannot break out of the string literal', () => {
  // DAX escapes a double quote by doubling it. A closing quote in user input
  // must not be able to terminate the literal and append an expression.
  assert.equal(escapeDaxLiteral('Smith" || 1=1 //'), 'Smith"" || 1=1 //');
  assert.equal(escapeDaxLiteral('a\u0000b\u001fc'), 'abc', 'control characters are removed');

  const dax = buildDax('FILTER(t, CONTAINSSTRING(t[MRN], "{{query}}"))', 'Smith"');
  assert.equal(dax, 'FILTER(t, CONTAINSSTRING(t[MRN], "Smith"""))');
  assert.equal((dax.match(/"/g) ?? []).length % 2, 0, 'quotes stay balanced');
});

/**
 * Every function name DAX actually defines that this project might reasonably
 * use. The point is not completeness — it is that a name absent from here is
 * assumed to be a typo or an invention until someone confirms it exists.
 */
const DAX_FUNCTIONS = new Set([
  'CONTAINSSTRING', 'CONTAINSSTRINGEXACT', 'SEARCH', 'FIND', 'SUBSTITUTE',
  'LEFT', 'RIGHT', 'MID', 'LEN', 'TRIM', 'UPPER', 'LOWER', 'FORMAT', 'CONCATENATE',
  'FILTER', 'TOPN', 'SELECTCOLUMNS', 'ADDCOLUMNS', 'SUMMARIZE', 'SUMMARIZECOLUMNS',
  'CALCULATETABLE', 'CALCULATE', 'VALUES', 'DISTINCT', 'ALL', 'RELATED',
  'IF', 'AND', 'OR', 'NOT', 'BLANK', 'ISBLANK', 'COALESCE', 'SWITCH',
]);

test('the default Power BI query only calls functions DAX defines', () => {
  // The shipped default is submitted verbatim to executeQueries, and nothing in
  // this suite can reach a tenant to find out that a function does not exist.
  // An invented name (SEARCHSTRING, say) would otherwise fail for every site
  // that deployed the defaults, and only at run time.
  const { dax } = DEFAULT_CONFIG.lookup.powerbi;
  const called = [...dax.matchAll(/([A-Z][A-Z0-9_]{2,})\s*\(/g)].map((match) => match[1]);

  assert.ok(called.length > 0, 'the default query calls at least one function');
  for (const name of called) {
    assert.ok(DAX_FUNCTIONS.has(name), `"${name}" is not a DAX function`);
  }

  // The detector has to be able to fail, or the assertion above proves nothing.
  const invented = [...'FILTER(t, SEARCHSTRING("x", t[MRN], 1, 0) > 0)'
    .matchAll(/([A-Z][A-Z0-9_]{2,})\s*\(/g)].map((match) => match[1]);
  assert.ok(invented.includes('SEARCHSTRING'));
  assert.ok(!DAX_FUNCTIONS.has('SEARCHSTRING'), 'the invented name is rejected');
});

test('the default query interpolates and stays balanced', () => {
  const { dax } = DEFAULT_CONFIG.lookup.powerbi;
  assert.match(dax, /\{\{query\}\}/, 'the template has a placeholder to fill');

  const built = buildDax(dax, "O'Brien\" || 1=1");
  assert.doesNotMatch(built, /\{\{query\}\}/, 'every placeholder is replaced');
  assert.equal((built.match(/"/g) ?? []).length % 2, 0, 'quotes stay balanced');
  assert.equal((built.match(/\(/g) ?? []).length, (built.match(/\)/g) ?? []).length,
    'parentheses stay balanced');
});

test('the query is reduced to characters a name can contain', () => {
  assert.equal(sanitiseQuery("O'Brien-Smith Jr."), "O'Brien-Smith Jr.");
  assert.equal(sanitiseQuery('x'.repeat(200)).length, 64);
  // Hyphens and full stops are legitimate in names, so they survive; the
  // characters that could change the shape of a query do not.
  for (const character of ['"', ';', '(', ')', '[', ']', '|', '&', '=', '<', '>', '\\']) {
    assert.doesNotMatch(sanitiseQuery(`Smith${character}`), /[";()[\]|&=<>\\]/);
  }
});

test('Power BI rows map by full or short column name', () => {
  const rows = mapRows(
    [{ 'Admitted Patients[MRN]': '123', GivenName: 'Alex' }],
    { mrn: 'Admitted Patients[MRN]', givenName: 'Admitted Patients[GivenName]' },
  );
  assert.equal(rows[0].mrn, '123');
  assert.equal(rows[0].givenName, 'Alex', 'falls back to the unqualified column name');
  assert.equal(rows[0].source, 'Power BI');
});

test('config merges deeply without losing untouched defaults', () => {
  const merged = mergeConfig(DEFAULT_CONFIG, { lookup: { provider: 'rest', rest: { url: '/x' } } });
  assert.equal(merged.lookup.provider, 'rest');
  assert.equal(merged.lookup.rest.url, '/x');
  assert.equal(merged.lookup.rest.credentials, 'include', 'sibling defaults survive');
  assert.equal(merged.pageSize, 'A4');
  assert.deepEqual(mergeConfig(DEFAULT_CONFIG, null), DEFAULT_CONFIG);
});

test('the server sanitises and shapes the same way the browser does', () => {
  assert.equal(serverSanitise("Smith'; DROP TABLE x", 64), "Smith' DROP TABLE x");
  assert.equal(serverSanitise('x'.repeat(100), 64).length, 64);

  assert.deepEqual(shapeRow({
    mrn: 42,
    familyName: ' Testpatient ',
    dateOfBirth: new Date('1978-02-03T00:00:00Z'),
    extra: 'ignored',
  }), {
    mrn: '42',
    familyName: 'Testpatient',
    givenName: '',
    dateOfBirth: '1978-02-03',
    sex: '',
    ward: '',
    encounter: '',
  });
});

test('the rate limiter allows a burst then refuses', () => {
  const allow = createRateLimiter({ windowMs: 60_000, max: 3 });
  assert.equal(allow('user'), true);
  assert.equal(allow('user'), true);
  assert.equal(allow('user'), true);
  assert.equal(allow('user'), false, 'the fourth call in the window is refused');
  assert.equal(allow('other'), true, 'limits are per client');
});

/* ------------------------------------------------------------------- CORS */

const corsConfig = {
  allowedOrigins: ['https://isncsci.example.internal'],
  allowedHeaders: ['Accept', 'X-Api-Key'],
};
const asRequest = (headers) => ({ headers });

test('CORS headers are only sent to an allowed origin', () => {
  const allowed = corsHeaders(corsConfig, asRequest({ origin: 'https://isncsci.example.internal' }));
  assert.equal(allowed['Access-Control-Allow-Origin'], 'https://isncsci.example.internal');
  assert.equal(allowed.Vary, 'Origin', 'the response varies by origin so caches stay correct');

  assert.deepEqual(corsHeaders(corsConfig, asRequest({ origin: 'https://evil.example' })), {});
  assert.deepEqual(corsHeaders(corsConfig, asRequest({})), {}, 'same-origin needs no headers');
});

test('preflight allows the configured request headers and GET', () => {
  // The REST provider sends whatever headers a site configures. Without them
  // named here the browser blocks the request before it is ever sent, so a
  // cross-origin deployment using an API key would fail with the origin allowed.
  const cors = corsHeaders(corsConfig, asRequest({ origin: 'https://isncsci.example.internal' }));
  const preflight = preflightHeaders(corsConfig, cors);

  const allowed = preflight['Access-Control-Allow-Headers'].split(', ');
  assert.ok(allowed.includes('X-Api-Key'), 'a configured custom header is permitted');
  assert.ok(allowed.includes('Accept'));
  assert.equal(preflight['Access-Control-Allow-Methods'], 'GET, OPTIONS');
  assert.ok(Number(preflight['Access-Control-Max-Age']) > 0);
});

test('preflight tells a disallowed origin nothing', () => {
  const cors = corsHeaders(corsConfig, asRequest({ origin: 'https://evil.example' }));
  assert.deepEqual(preflightHeaders(corsConfig, cors), {},
    'the allowlist is not advertised to origins that cannot use it');
});

test('header names that could forge a response header are dropped', () => {
  const names = allowedHeaderNames({
    allowedHeaders: ['X-Api-Key', 'Bad\r\nX-Injected: 1', 'Also Bad', '', 'X-Ok'],
  });
  assert.deepEqual(names, ['Accept', 'X-Api-Key', 'X-Ok']);
  assert.ok(names.every((name) => !/[\r\n\s:]/.test(name)));
});

test('Accept survives a site narrowing the allowlist', () => {
  // The provider always sends Accept, so losing it would break every request.
  assert.deepEqual(allowedHeaderNames({ allowedHeaders: [] }), ['Accept']);
  assert.deepEqual(allowedHeaderNames({}), ['Accept']);
});
