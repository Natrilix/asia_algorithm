/**
 * Patient lookup provider registry.
 *
 * Every provider resolves to the same normalised record (see `record.js`) so
 * the rest of the app neither knows nor cares where the patient list came from.
 * Which one runs is a single line in `config.json`, which is what makes this
 * deployable at sites that can expose a Power BI model, sites that can expose
 * an internal API, and sites that can expose neither.
 */

import { createDemoProvider } from './demo.js';
import { createRestProvider } from './rest.js';
import { createPowerBiProvider } from './powerbi.js';

export { normaliseRecord, normaliseQuery, toIsoDate } from './record.js';

const FACTORIES = {
  demo: createDemoProvider,
  rest: createRestProvider,
  powerbi: createPowerBiProvider,
};

/**
 * @returns {{name: string, enabled: boolean, search: (query: string) => Promise<object[]>,
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
