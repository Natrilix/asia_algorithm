/**
 * Copies the freshly built ESM bundle into the worksheet's vendor directory.
 *
 * `esm/` is gitignored because it is build output of the library, but the
 * worksheet is meant to deploy as static files with no build step — so it keeps
 * a committed copy. Run `npm run build:webapp-vendor` after changing anything
 * under `src/` and commit the result.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'esm/ISNCSCI.js');
const TARGET = path.join(ROOT, 'webapp/vendor/isncsci.esm.js');

if (!fs.existsSync(SOURCE)) {
  process.stderr.write(`${SOURCE} does not exist. Run "npm run build" first.\n`);
  process.exit(1);
}

// The source map comment is dropped: the .map file is not shipped with the
// worksheet, and a dangling reference makes browser dev tools complain.
const bundle = fs.readFileSync(SOURCE, 'utf8').replace(/^\/\/# sourceMappingURL=.*$/m, '');

const banner = '/* Built from src/ by "npm run build:webapp-vendor". Do not edit by hand. */\n';
fs.mkdirSync(path.dirname(TARGET), { recursive: true });
fs.writeFileSync(TARGET, banner + bundle);

process.stdout.write(`Vendored ${path.relative(ROOT, SOURCE)} -> ${path.relative(ROOT, TARGET)}\n`);
