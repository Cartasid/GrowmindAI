import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const loadModule = async () => {
  const entryUrl = new URL('./cultivarTestEntry.ts', import.meta.url);
  const result = await build({
    entryPoints: [fileURLToPath(entryUrl)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  });
  const code = result.outputFiles[0].text;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  return import(moduleUrl);
};

const modulePromise = loadModule();

const EXPECTED_CULTIVARS = ['wedding_cake', 'blue_dream', 'amnesia_haze'];
const EXPECTED_SUBSTRATES = ['coco', 'soil', 'rockwool'];

test('CULTIVARS includes expected cultivars', async () => {
  const { CULTIVARS } = await modulePromise;
  for (const cultivar of EXPECTED_CULTIVARS) {
    assert.ok(
      CULTIVARS.includes(cultivar),
      `Expected cultivar "${cultivar}" to be part of CULTIVARS.`,
    );
  }
});

test('Every cultivar exposes a managed plan for each substrate', async () => {
  const { CULTIVARS, DEFAULT_PLAN } = await modulePromise;
  for (const cultivar of CULTIVARS) {
    const cultivarPlans = DEFAULT_PLAN[cultivar];
    assert.ok(cultivarPlans, `Missing default plan definition for cultivar "${cultivar}".`);
    for (const substrate of EXPECTED_SUBSTRATES) {
      const plan = cultivarPlans[substrate];
      assert.ok(plan, `Missing ${substrate} plan for cultivar "${cultivar}".`);
      assert.strictEqual(plan.id, 'default', `Default plan id for ${cultivar}/${substrate} should be 'default'.`);
      assert.ok(Array.isArray(plan.plan) && plan.plan.length > 0, `Plan for ${cultivar}/${substrate} must contain entries.`);
    }
  }
});
