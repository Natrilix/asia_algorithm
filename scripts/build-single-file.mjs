/**
 * Builds `webapp/dist/isncsci-worksheet.html` — the whole application as one
 * file that runs from a file share.
 *
 * Why this exists: browsers refuse to load external ES modules over `file://`
 * and block `fetch` there entirely, so the multi-file app in `webapp/` only
 * works from a web server. An *inline* module script does run, so the build
 * inlines the CSS, the module graph and the JSON data into a single document.
 *
 * The modules are wrapped in per-module scopes rather than concatenated, so
 * top-level names cannot collide (the algorithm bundle and our own code both
 * declare `NOT_DETERMINABLE`, for instance).
 *
 * Run: npm run build:single-file
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEBAPP = path.join(ROOT, 'webapp');
const ENTRY = 'js/app.js';
const OUTPUT = path.join(WEBAPP, 'dist/isncsci-worksheet.html');

/* --------------------------------------------------------- module graph */

/** Every `import`/`export ... from` specifier in a module, in source order. */
function findDependencies(source) {
  const specifiers = [];
  const pattern = /(?:^|\n)\s*(?:import|export)\b[\s\S]*?from\s*['"]([^'"]+)['"]/g;
  let match = pattern.exec(source);
  while (match) {
    specifiers.push(match[1]);
    match = pattern.exec(source);
  }
  return specifiers;
}

function resolve(fromId, specifier) {
  if (!specifier.startsWith('.')) {
    throw new Error(`Only relative imports are supported, got "${specifier}" in ${fromId}`);
  }
  return path.posix.normalize(path.posix.join(path.posix.dirname(fromId), specifier));
}

/**
 * Depth-first walk producing modules in dependency order. The graph must be
 * acyclic — a cycle would mean a module reading another's exports before they
 * exist, so we fail loudly rather than emit something subtly broken.
 */
function collectModules(entry) {
  const ordered = [];
  const state = new Map(); // id -> 'visiting' | 'done'

  const visit = (id, stack) => {
    if (state.get(id) === 'done') {
      return;
    }
    if (state.get(id) === 'visiting') {
      throw new Error(`Import cycle: ${[...stack, id].join(' -> ')}`);
    }
    state.set(id, 'visiting');

    const source = fs.readFileSync(path.join(WEBAPP, id), 'utf8');
    for (const specifier of findDependencies(source)) {
      visit(resolve(id, specifier), [...stack, id]);
    }

    state.set(id, 'done');
    ordered.push({ id, source });
  };

  visit(entry, []);
  return ordered;
}

/* ----------------------------------------------------------- transform */

/**
 * Rewrites ES module syntax to assignments against a `__exports` object and a
 * `__require` function. This handles the subset of the syntax this codebase
 * uses; anything unrecognised is left alone and will fail loudly at runtime
 * rather than silently misbehave.
 */
function transform(id, source) {
  // Names declared in this module, which get an assignment appended at the end.
  // Re-exports (`export { x } from './y.js'`) are assigned inline instead —
  // there is no local binding for them to reference.
  const exported = new Set();
  let code = source;

  // export { a, b } from './x.js'  ->  re-export each name
  code = code.replace(
    /export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]\s*;?/g,
    (whole, names, specifier) => {
      const from = resolve(id, specifier);
      return names.split(',').map((entry) => {
        const [name, alias] = entry.split(/\s+as\s+/).map((s) => s.trim());
        if (!name) {
          return '';
        }
        return `__exports[${JSON.stringify(alias ?? name)}] = __require(${JSON.stringify(from)})[${JSON.stringify(name)}];`;
      }).join('\n');
    },
  );

  // import Default, { a, b as c } from './x.js'
  code = code.replace(
    /import\s+([\s\S]*?)\s+from\s*['"]([^'"]+)['"]\s*;?/g,
    (whole, clause, specifier) => {
      const from = JSON.stringify(resolve(id, specifier));
      const namedMatch = /\{([\s\S]*)\}/.exec(clause);
      const defaultName = clause.replace(/\{[\s\S]*\}/, '').replace(/,/g, '').trim();

      const parts = [];
      if (defaultName) {
        parts.push(`const ${defaultName} = __require(${from}).default;`);
      }
      if (namedMatch) {
        const bindings = namedMatch[1].split(',').map((entry) => {
          const [name, alias] = entry.split(/\s+as\s+/).map((s) => s.trim());
          if (!name) {
            return '';
          }
          return alias ? `${name}: ${alias}` : name;
        }).filter(Boolean).join(', ');
        if (bindings) {
          parts.push(`const { ${bindings} } = __require(${from});`);
        }
      }
      return parts.join('\n');
    },
  );

  // export default <expression>;
  code = code.replace(/export\s+default\s+/g, () => {
    exported.add('default');
    return '__exports.default = ';
  });

  // export function|class|const|let|var <name>
  code = code.replace(
    /export\s+(async\s+)?(function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    (whole, asyncKeyword, keyword, name) => {
      exported.add(name);
      return `${asyncKeyword ?? ''}${keyword} ${name}`;
    },
  );

  // export { a, b as c };
  code = code.replace(/export\s*\{([^}]*)\}\s*;?/g, (whole, names) => {
    for (const entry of names.split(',')) {
      const [name, alias] = entry.split(/\s+as\s+/).map((s) => s.trim());
      if (name) {
        exported.add(alias ?? name);
      }
    }
    return '';
  });

  if (/(^|\n)\s*(import|export)\s/.test(code)) {
    const leftover = /(^|\n)(\s*(?:import|export)\s[^\n]*)/.exec(code)[2].trim();
    throw new Error(`Unhandled module syntax in ${id}: ${leftover}`);
  }

  // Exports are assigned at the end so hoisted declarations are all defined.
  const assignments = [...exported]
    .filter((name) => name !== 'default')
    .map((name) => `__exports[${JSON.stringify(name)}] = ${name};`)
    .join('\n');

  return `${code}\n${assignments}`;
}

/* -------------------------------------------------------------- output */

/** `</script>` inside inlined content would end the script element early. */
function safeForInlineScript(text) {
  return text.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
}

function readJson(relative) {
  const file = path.join(WEBAPP, relative);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

function build() {
  const modules = collectModules(ENTRY);
  const css = fs.readFileSync(path.join(WEBAPP, 'css/app.css'), 'utf8');
  const html = fs.readFileSync(path.join(WEBAPP, 'index.html'), 'utf8');

  const config = readJson('config.json') ?? {};
  const demoPatients = readJson('data/demo-patients.json') ?? [];

  const registry = modules.map(({ id, source }) => (
    `__modules[${JSON.stringify(id)}] = function (__exports, __require) {\n`
    + `${transform(id, source)}\n`
    + '};'
  )).join('\n\n');

  const runtime = `
// Built by scripts/build-single-file.mjs. Do not edit; edit webapp/ instead.
const __modules = {};
const __cache = {};
function __require(id) {
  if (__cache[id]) {
    return __cache[id];
  }
  const exports = {};
  __cache[id] = exports;
  __modules[id](exports, __require);
  return exports;
}

// fetch() is unavailable on file:// URLs, so the data those calls would have
// loaded is baked in here instead.
window.__ISNCSCI_CONFIG__ = ${JSON.stringify(config)};
window.__ISNCSCI_DEMO_PATIENTS__ = ${JSON.stringify(demoPatients)};

${registry}

__require(${JSON.stringify(ENTRY)});
`;

  // Strip the external references and inline everything in their place. The
  // tags are checked in the source, not the result: the bundled code legitimately
  // mentions "js/app.js" as its entry module id.
  const styleTag = /\s*<link rel="stylesheet" href="css\/app\.css">/;
  const scriptTag = /\s*<script type="module" src="js\/app\.js"><\/script>/;
  for (const [name, pattern] of [['stylesheet link', styleTag], ['module script', scriptTag]]) {
    if (!pattern.test(html)) {
      throw new Error(`index.html no longer contains the expected ${name}.`);
    }
  }

  let output = html
    .replace(styleTag, `\n<style>\n${css}\n</style>`)
    .replace(scriptTag, `\n<script type="module">\n${safeForInlineScript(runtime)}\n</script>`);

  output = output.replace(
    '<title>ISNCSCI worksheet</title>',
    '<title>ISNCSCI worksheet</title>\n'
    + '<!-- Single-file build: works from a file share. Rebuild with '
    + '"npm run build:single-file". -->',
  );

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, output);

  const kb = (fs.statSync(OUTPUT).size / 1024).toFixed(0);
  process.stdout.write(
    `Bundled ${modules.length} modules -> ${path.relative(ROOT, OUTPUT)} (${kb} kB)\n`,
  );
}

build();
