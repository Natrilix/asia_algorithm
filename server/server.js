/**
 * Optional patient lookup service for the ISNCSCI worksheet.
 *
 * This exists only for sites that want to search the on-prem MSSQL warehouse
 * directly. Sites using the Power BI provider do not need it at all — the
 * worksheet is a static site and this process is not part of it.
 *
 * Design constraints, deliberately:
 *   - One route. It answers a patient search and nothing else.
 *   - Read-only. The connection should use a login with SELECT on one view.
 *   - The SQL lives in configuration, not in this file, because every
 *     warehouse names its columns differently. It is executed as a
 *     parameterised statement; the search text is never concatenated in.
 *   - No framework, so the only dependency is the SQL driver.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const DEFAULTS = {
  port: 8081,
  host: '127.0.0.1',
  basePath: '/api/patients/search',
  healthPath: '/health',
  maxResults: 25,
  minQueryLength: 2,
  maxQueryLength: 64,
  /** Requests per client per window. */
  rateLimit: { windowMs: 60_000, max: 60 },
  /** Empty means same-origin only: no CORS headers are sent. */
  allowedOrigins: [],
  /** Header the reverse proxy sets with the authenticated user, for the audit log. */
  userHeader: 'x-forwarded-user',
  /** When true, a request without an authenticated user is refused. */
  requireUser: false,
  auditLogPath: '',
  sql: {
    /**
     * Must return the columns the worksheet expects. `@q` is the search text
     * and `@limit` the row cap; both are bound parameters.
     */
    query: `
      SELECT TOP (@limit)
        MRN            AS mrn,
        FamilyName     AS familyName,
        GivenName      AS givenName,
        DateOfBirth    AS dateOfBirth,
        Sex            AS sex,
        Ward           AS ward,
        EncounterId    AS encounter
      FROM dbo.vw_AdmittedPatients
      WHERE MRN = @q OR FamilyName LIKE @q + '%'
      ORDER BY FamilyName, GivenName
    `,
    connection: {
      server: '',
      database: '',
      user: '',
      password: '',
      options: { encrypt: true, trustServerCertificate: false },
    },
  },
};

/* ------------------------------------------------------------------ config */

function loadConfig() {
  const file = process.env.ISNCSCI_LOOKUP_CONFIG ?? path.join(HERE, 'config.json');
  let fileConfig = {};
  if (fs.existsSync(file)) {
    fileConfig = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  const config = deepMerge(DEFAULTS, fileConfig);

  // Environment wins, so credentials need never be written to disk.
  const env = process.env;
  config.port = Number(env.PORT ?? config.port);
  config.host = env.HOST ?? config.host;
  config.sql.connection.server = env.MSSQL_SERVER ?? config.sql.connection.server;
  config.sql.connection.database = env.MSSQL_DATABASE ?? config.sql.connection.database;
  config.sql.connection.user = env.MSSQL_USER ?? config.sql.connection.user;
  config.sql.connection.password = env.MSSQL_PASSWORD ?? config.sql.connection.password;
  return config;
}

function deepMerge(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) {
    return base;
  }
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = (value && typeof value === 'object' && !Array.isArray(value)
      && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key]))
      ? deepMerge(base[key], value)
      : value;
  }
  return result;
}

/* -------------------------------------------------------------- rate limit */

function createRateLimiter({ windowMs, max }) {
  const hits = new Map();
  return function allow(key) {
    const now = Date.now();
    const record = hits.get(key);
    if (!record || now > record.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      // Opportunistic sweep; the map only ever holds active clients.
      if (hits.size > 5000) {
        for (const [existing, value] of hits) {
          if (now > value.resetAt) {
            hits.delete(existing);
          }
        }
      }
      return true;
    }
    record.count += 1;
    return record.count <= max;
  };
}

/* ------------------------------------------------------------------- audit */

function createAuditLog(config) {
  const stream = config.auditLogPath
    ? fs.createWriteStream(config.auditLogPath, { flags: 'a' })
    : null;

  /**
   * Records that a search happened and how many rows it matched — never the
   * rows themselves. Enough to answer "who looked up whom", which is the
   * question an audit of a patient index has to answer.
   */
  return function audit(entry) {
    const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
    if (stream) {
      stream.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  };
}

/* --------------------------------------------------------------- database */

async function createSearcher(config) {
  const { default: sql } = await import('mssql');
  const pool = new sql.ConnectionPool(config.sql.connection);
  const ready = pool.connect();

  return async function search(query, limit) {
    await ready;
    const request = pool.request();
    request.input('q', sql.NVarChar(config.maxQueryLength), query);
    request.input('limit', sql.Int, limit);
    const result = await request.query(config.sql.query);
    return result.recordset ?? [];
  };
}

/* ---------------------------------------------------------------- handler */

function sanitiseQuery(value, maxLength) {
  return String(value ?? '')
    .replace(/[^\p{L}\p{N} '\-.]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function toIsoDate(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (!value) {
    return '';
  }
  const text = String(value);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  return match ? match[1] : '';
}

function shapeRow(row) {
  const text = (value) => (value === null || value === undefined ? '' : String(value).trim());
  return {
    mrn: text(row.mrn),
    familyName: text(row.familyName),
    givenName: text(row.givenName),
    dateOfBirth: toIsoDate(row.dateOfBirth),
    sex: text(row.sex),
    ward: text(row.ward),
    encounter: text(row.encounter),
  };
}

function send(response, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  response.end(body);
}

function corsHeaders(config, request) {
  const origin = request.headers.origin;
  if (!origin || !config.allowedOrigins.includes(origin)) {
    return {};
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  };
}

export async function createServer(config = loadConfig()) {
  const allow = createRateLimiter(config.rateLimit);
  const audit = createAuditLog(config);
  const search = await createSearcher(config);

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
    const cors = corsHeaders(config, request);

    if (request.method === 'OPTIONS') {
      response.writeHead(204, { ...cors, 'Access-Control-Allow-Headers': 'Accept' });
      response.end();
      return;
    }

    if (url.pathname === config.healthPath) {
      send(response, 200, { status: 'ok' }, cors);
      return;
    }

    if (url.pathname !== config.basePath || request.method !== 'GET') {
      send(response, 404, { error: 'Not found.' }, cors);
      return;
    }

    const client = request.socket.remoteAddress ?? 'unknown';
    const user = request.headers[config.userHeader] ?? '';

    if (config.requireUser && !user) {
      send(response, 401, { error: 'Authentication required.' }, cors);
      return;
    }

    if (!allow(user || client)) {
      send(response, 429, { error: 'Too many searches. Please wait a moment.' }, cors);
      return;
    }

    const query = sanitiseQuery(url.searchParams.get('q'), config.maxQueryLength);
    if (query.length < config.minQueryLength) {
      send(response, 400, { error: `Enter at least ${config.minQueryLength} characters.` }, cors);
      return;
    }

    const limit = Math.min(
      Number(url.searchParams.get('limit')) || config.maxResults,
      config.maxResults,
    );

    try {
      const rows = await search(query, limit);
      const results = rows.map(shapeRow);
      audit({ event: 'search', user, client, query, results: results.length });
      send(response, 200, { results }, cors);
    } catch (error) {
      audit({ event: 'search-failed', user, client, query, message: error.message });
      // The client is told nothing about the database.
      send(response, 502, { error: 'The patient index is unavailable.' }, cors);
    }
  });
}

/* Started directly (rather than imported by a test) — listen. */
if (process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`) {
  const config = loadConfig();
  createServer(config).then((server) => {
    server.listen(config.port, config.host, () => {
      process.stdout.write(
        `ISNCSCI patient lookup listening on http://${config.host}:${config.port}${config.basePath}\n`,
      );
    });
  }).catch((error) => {
    process.stderr.write(`Failed to start: ${error.message}\n`);
    process.exitCode = 1;
  });
}

export { DEFAULTS, sanitiseQuery, shapeRow, toIsoDate, createRateLimiter };
