import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const loadModule = async () => {
  const entryUrl = new URL('./analyzerNotesEntry.ts', import.meta.url);
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

test('buildAnalyzerNotes omits empty sections', async () => {
  const { buildAnalyzerNotes } = await modulePromise;
  const output = buildAnalyzerNotes('  ', {
    problemLocation: '   ',
    problemSpread: '',
    recentChanges: undefined,
  });
  assert.strictEqual(output, '', 'Expected empty input to produce an empty string.');
});

test('buildAnalyzerNotes trims values and keeps structure', async () => {
  const { buildAnalyzerNotes } = await modulePromise;
  const output = buildAnalyzerNotes('  Leaves curling  ', {
    problemLocation: ' upper canopy ',
    problemSpread: 'rapid',
    recentChanges: ' lowered EC ',
  });
  assert.strictEqual(
    output,
    'Leaves curling\nProblem location: upper canopy\nSpread speed: rapid\nRecent changes: lowered EC',
  );
});
