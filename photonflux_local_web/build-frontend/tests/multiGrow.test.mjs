import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Mock fetch before loading the module
global.fetch = mock.fn(() => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({ data: [] })
}));

const loadModule = async () => {
  const entryUrl = new URL('./multiGrowEntry.ts', import.meta.url);
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

test('growService handles adding grows', async () => {
  const { addGrow, getGrows, saveGrows } = await modulePromise;

  // Clear cache for test
  await saveGrows([]);

  const newGrow = {
    name: "Test Grow",
    cultivar: "blue_dream",
    substrate: "coco",
    startDate: "2024-01-01",
    status: "active"
  };

  const added = await addGrow(newGrow);
  assert.strictEqual(added.name, "Test Grow");
  assert.ok(added.id.startsWith('grow-') || added.id === 'test-uuid');

  const all = getGrows();
  assert.strictEqual(all.length, 1);
  assert.strictEqual(all[0].name, "Test Grow");
});

test('journalService uses growId for keys', async () => {
  const { loadJournal, saveJournal } = await modulePromise;

  const growId = "grow-123";
  const entries = [{ id: "e1", notes: "Test note", date: new Date().toISOString() }];

  saveJournal(growId, entries);
  const loaded = loadJournal(growId);

  assert.strictEqual(loaded.length, 1);
  assert.strictEqual(loaded[0].notes, "Test note");
});
