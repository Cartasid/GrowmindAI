import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const loadModule = async () => {
  const entryUrl = new URL('./journalMetricsChartEntry.ts', import.meta.url);
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

const baseEntry = {
  phase: 'W1',
  entryType: 'Observation',
  priority: 'Medium',
  notes: '',
  images: [],
  tags: [],
};

test('buildMetricSeries sorts metric points by date', async () => {
  const { buildMetricSeries } = await modulePromise;
  const entries = [
    {
      ...baseEntry,
      id: 'late',
      date: '2024-03-12T00:00:00.000Z',
      metrics: { plantHeight: 32, temp: 24.5, humidity: 55, ec: 1.9, ph: 5.9 },
    },
    {
      ...baseEntry,
      id: 'early',
      date: '2024-03-05T00:00:00.000Z',
      metrics: { plantHeight: 28, temp: 23.1, humidity: 60, ec: 1.8, ph: 6.0 },
    },
  ];

  const series = buildMetricSeries(entries);

  assert.deepEqual(
    series.temp.points.map((point) => point.entryId),
    ['early', 'late'],
    'Temperature points should be ordered from earliest to latest entry',
  );
  assert.strictEqual(series.plantHeight.points[0].value, 28);
  assert.strictEqual(series.ph.points[1].value, 5.9);
});

test('buildMetricSeries ignores missing or invalid metric values', async () => {
  const { buildMetricSeries } = await modulePromise;
  const entries = [
    {
      ...baseEntry,
      id: 'valid',
      date: '2024-04-01T00:00:00.000Z',
      metrics: { plantHeight: 40, ec: 2.1 },
    },
    {
      ...baseEntry,
      id: 'invalid',
      date: '2024-04-02T00:00:00.000Z',
      metrics: { plantHeight: Number.NaN, ec: undefined },
    },
    {
      ...baseEntry,
      id: 'missing',
      date: '2024-04-03T00:00:00.000Z',
      metrics: {},
    },
  ];

  const series = buildMetricSeries(entries);

  assert.strictEqual(series.plantHeight.points.length, 1);
  assert.strictEqual(series.plantHeight.points[0].entryId, 'valid');
  assert.strictEqual(series.ec.points.length, 1);
});
