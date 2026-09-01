import { test } from '@playwright/test';
import { resolve } from 'node:path';
import { serveStatic, validateFrozenV15 } from '../tools/validate-v15-frozen.mjs';
import './defense-v15.spec.mjs';
import './troy-run-fixed-v15.spec.mjs';
import './troy-run-v15.spec.mjs';
import './v15-debt-closure.spec.mjs';

let frozenServer;
test.beforeAll(() => {
  const root = resolve(import.meta.dirname, 'fixtures/v15-frozen');
  validateFrozenV15({ root, manifestPath: resolve(import.meta.dirname, '../baselines/v15-frozen.json') });
  frozenServer = serveStatic(root, 4175);
});
test.afterAll(() => { frozenServer.close(); frozenServer.closeAllConnections(); frozenServer.unref(); });
