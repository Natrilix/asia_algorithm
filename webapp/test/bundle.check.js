/**
 * Single-file build tests.
 *
 * The bundle is what actually gets deployed to a file share, and a browser will
 * not tell you it is broken until someone opens it. These checks run the real
 * builder and assert the properties that make it work from a `file://` URL:
 * one document, nothing external, no leftover module syntax, and every module
 * present in dependency order.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const BUNDLE = path.join(ROOT, 'webapp/dist/isncsci-worksheet.html');

let bundle = '';

test('the bundler runs and produces one document', () => {
  execFileSync('node', ['scripts/build-single-file.mjs'], { cwd: ROOT, stdio: 'pipe' });
  assert.ok(existsSync(BUNDLE), 'the bundle was written');
  bundle = readFileSync(BUNDLE, 'utf8');
  assert.match(bundle, /^<!DOCTYPE html>/);
  assert.match(bundle, /<\/html>\s*$/);
});

test('nothing is loaded from outside the file', () => {
  // A file:// page cannot fetch anything, so every reference has to be inline.
  assert.doesNotMatch(bundle, /<script[^>]+src=/i, 'no external scripts');
  assert.doesNotMatch(bundle, /<link[^>]+rel="stylesheet"/i, 'no external stylesheets');
  assert.doesNotMatch(bundle, /<img[^>]+src=/i, 'no images');
  assert.doesNotMatch(bundle, /https?:\/\/[^"'\s)]+\.(?:js|css|woff2?|png|svg)/i, 'no remote assets');
  assert.equal((bundle.match(/<script/gi) ?? []).length, 1, 'exactly one script element');
  assert.match(bundle, /<script type="module">/, 'the script is inline');
});

test('no ES module syntax survives into the inline script', () => {
  const script = /<script type="module">([\s\S]*)<\/script>/.exec(bundle)[1];
  // `import`/`export` statements would be legal in a module but would refer to
  // files that cannot be fetched; they must all have been rewritten.
  assert.doesNotMatch(script, /^\s*import\s+[\w{*]/m, 'no import statements');
  assert.doesNotMatch(script, /^\s*export\s+/m, 'no export statements');
  assert.doesNotMatch(script, /from\s+['"]\.\.?\//m, 'no relative specifiers');
});

test('every module is registered, entry last', () => {
  const ids = [...bundle.matchAll(/__modules\["([^"]+)"\]/g)].map((match) => match[1]);
  const unique = new Set(ids);

  for (const expected of [
    'js/app.js', 'js/model.js', 'js/classify.js', 'js/form.js', 'js/results.js',
    'js/patient.js', 'js/export.js', 'js/config.js', 'js/lookup/index.js',
    'js/lookup/record.js', 'js/lookup/demo.js', 'js/lookup/rest.js',
    'js/lookup/powerbi.js', 'js/auth/pkce.js', 'js/render/worksheet.js',
    'js/render/pdf.js', 'js/render/svg.js', 'js/render/fonts.js',
    'js/render/drawing.js', 'vendor/isncsci.esm.js',
  ]) {
    assert.ok(unique.has(expected), `${expected} is bundled`);
  }

  // Dependency order: a module must be defined before anything that requires it.
  assert.equal(ids[ids.length - 1], 'js/app.js', 'the entry point is registered last');
  assert.ok(ids.indexOf('js/lookup/record.js') < ids.indexOf('js/lookup/demo.js'));
  assert.ok(ids.indexOf('vendor/isncsci.esm.js') < ids.indexOf('js/classify.js'));
});

test('per-module scoping keeps colliding top-level names apart', () => {
  // The algorithm bundle declares `var NOT_DETERMINABLE` and js/classify.js
  // declares `const NOT_DETERMINABLE`. Concatenated flat into one scope that is
  // a SyntaxError, which is why each module gets its own function scope.
  const declarations = (bundle.match(/(?:var|const|let)\s+NOT_DETERMINABLE\s*=/g) ?? []).length;
  assert.ok(declarations >= 2, `expected the colliding declarations, found ${declarations}`);

  const script = /<script type="module">([\s\S]*)<\/script>/.exec(bundle)[1];
  assert.doesNotThrow(
    () => new Function(script.replace(/\bwindow\./g, 'globalThis.')),
    'the bundle parses as valid JavaScript',
  );
});

test('the data that fetch would have loaded is baked in', () => {
  assert.match(bundle, /window\.__ISNCSCI_CONFIG__ = \{/, 'configuration is inlined');
  assert.match(bundle, /window\.__ISNCSCI_DEMO_PATIENTS__ = \[/, 'demo fixture is inlined');
});

test('inlined content cannot terminate the script element early', () => {
  const script = /<script type="module">([\s\S]*?)<\/script>/.exec(bundle)[1];
  // If any inlined string contained a literal </script the element would end
  // there and the rest of the bundle would render as text.
  assert.ok(script.length > 100_000, 'the whole bundle is inside one script element');
  assert.doesNotMatch(script, /<\/script/i);
});
