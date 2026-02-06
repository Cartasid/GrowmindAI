import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const loadModule = async () => {
  const entryUrl = new URL('./utilsEntry.ts', import.meta.url);
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

test('computePlanSchedule preserves the provided start date', async () => {
  const { computePlanSchedule } = await modulePromise;

  const plan = [
    {
      phase: 'Early Veg',
      A: 1.12,
      X: 0.85,
      BZ: 0.1,
      pH: '',
      EC: '',
      durationDays: 7,
    },
    {
      phase: 'Mid Veg',
      A: 1.2,
      X: 0.9,
      BZ: 0.12,
      pH: '',
      EC: '',
      durationDays: 7,
    },
  ];

  const schedule = computePlanSchedule(plan, '2025-10-12', 1);
  assert.equal(schedule.length, 2);

  const [first, second] = schedule;
  assert.equal(first.start.toISOString(), '2025-10-12T00:00:00.000Z');
  assert.equal(first.end.toISOString(), '2025-10-19T00:00:00.000Z');
  assert.equal(second.start.toISOString(), '2025-10-19T00:00:00.000Z');
});
