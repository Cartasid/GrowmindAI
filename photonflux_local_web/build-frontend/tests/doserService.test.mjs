import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const loadModule = async () => {
  const entryUrl = new URL('./doserServiceEntry.ts', import.meta.url);
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

const createTranslator = () => {
  const dictionary = {
    phases: {
      'W3': 'Week 3',
      'W5': 'Week 5',
    },
    B_name: 'B (VECTOR)',
    C_name: 'C (PULSE)',
    BURST_name: 'BURST',
    silicate_name: 'Silicate',
    per_plant_short: 'plant',
    no_A_ripen: 'No A in ripen',
    not_in_veg: 'Not in veg',
    helix_pulse_note: 'Helix note',
    ripen_only_note: 'Ripen note',
  };
  return (key) => dictionary[key] ?? key;
};

const weekTag = () => '';

const computeExpectedPpm = ({
  A,
  X,
  profileX,
  BZ,
  tide,
  helix,
  ligand,
  quench,
  baseWaterFactor,
  waterProfile,
}, profiles) => {
  const totals = {};
  const accumulate = (profile, multiplier) => {
    if (!profile || !multiplier) return;
    for (const [nutrient, value] of Object.entries(profile)) {
      if (typeof value !== 'number' || value === 0) continue;
      totals[nutrient] = (totals[nutrient] ?? 0) + value * multiplier;
    }
  };
  accumulate(profiles.PROF_A, A);
  accumulate(profileX, X);
  accumulate(profiles.PROF_BURST, BZ);
  accumulate(profiles.PROF_TIDE, tide);
  accumulate(profiles.PROF_HELIX, helix);
  accumulate(profiles.PROF_LIGAND, ligand);
  accumulate(profiles.PROF_QUENCH, quench);
  if (baseWaterFactor > 0) {
    accumulate(waterProfile, baseWaterFactor);
  }
  return totals;
};

const basePlanConfig = {
  id: 'test-plan',
  name: 'Test Plan',
  description: '',
  waterProfile: { N: 5, Ca: 30, Mg: 10, S: 8 },
  osmosisShare: 0.25,
  isDefault: false,
  plan: [
    {
      phase: 'W3',
      A: 0.9,
      X: 0.6,
      BZ: 0.15,
      Tide: 0.5,
      Helix: 0.2,
      Ligand: 0.1,
      Silicate: undefined,
      SilicateUnit: undefined,
      pH: '',
      EC: '',
      durationDays: 7,
      notes: [],
    },
    {
      phase: 'W5',
      A: 1.28,
      X: 1.28,
      BZ: 0.18,
      Tide: 0,
      Helix: 0,
      Ligand: 0,
      Silicate: undefined,
      SilicateUnit: undefined,
      pH: '',
      EC: '',
      durationDays: 7,
      notes: [],
    },
  ],
};

const clonePlanConfig = () => ({
  ...basePlanConfig,
  plan: basePlanConfig.plan.map(entry => ({ ...entry })),
});

const ppmKeysToCheck = ['N', 'P', 'K', 'Ca', 'Mg', 'S', 'Na', 'Fe', 'B', 'Mo', 'Mn', 'Zn', 'Cu'];

const withinTolerance = (actual, expected, tolerance = 1e-6) => Math.abs(actual - expected) <= tolerance;

test('calculateDose accumulates ppm contributions without clamp side effects', async () => {
  const {
    calculateDose,
    PROF_A,
    PROF_C,
    PROF_BURST,
    PROF_TIDE,
    PROF_HELIX,
    PROF_LIGAND,
    PROF_QUENCH,
  } = await modulePromise;

  const translator = createTranslator();
  const planConfig = clonePlanConfig();

  const inputs = {
    phase: 'W3',
    reservoir: 100,
    substrate: 'coco',
    trend: 'neutral',
    tipburn: 'no',
    pale: 'yes',
    caMgDeficiency: 'no',
    claw: 'no',
    phDrift: 'normal',
    startDate: undefined,
  };

  const result = calculateDose(inputs, planConfig, translator, weekTag);
  assert.ok(result, 'calculateDose should return a result');

  assert.strictEqual(result.adjustedValues.A, 1.0);
  assert.strictEqual(result.adjustedValues.X, 0.6);
  assert.strictEqual(result.adjustedValues.BZ, 0.15);

  const expected = computeExpectedPpm({
    A: 1.0,
    X: 0.6,
    profileX: PROF_C,
    BZ: 0.15,
    tide: 0.5,
    helix: 0.2,
    ligand: 0.1,
    quench: 0,
    baseWaterFactor: 1 - planConfig.osmosisShare,
    waterProfile: planConfig.waterProfile,
  }, {
    PROF_A,
    PROF_BURST,
    PROF_TIDE,
    PROF_HELIX,
    PROF_LIGAND,
    PROF_QUENCH,
  });

  for (const key of ppmKeysToCheck) {
    const actualValue = result.ppm[key] ?? 0;
    const expectedValue = expected[key] ?? 0;
    assert.ok(
      withinTolerance(actualValue, expectedValue),
      `ppm mismatch for ${key}: expected ${expectedValue}, received ${actualValue}`,
    );
  }
});

test('ppm values use raw doser outputs without clamping', async () => {
  const {
    calculateDose,
    PROF_A,
    PROF_C,
    PROF_BURST,
    PROF_TIDE,
    PROF_HELIX,
    PROF_LIGAND,
    PROF_QUENCH,
  } = await modulePromise;

  const translator = createTranslator();
  const planConfig = clonePlanConfig();

  const inputs = {
    phase: 'W5',
    reservoir: 100,
    substrate: 'coco',
    trend: 'neutral',
    tipburn: 'no',
    pale: 'no',
    caMgDeficiency: 'yes',
    claw: 'no',
    phDrift: 'high',
    startDate: undefined,
  };

  const result = calculateDose(inputs, planConfig, translator, weekTag);
  assert.ok(result, 'calculateDose should return a result');

  assert.strictEqual(result.adjustedValues.A, 1.28);
  assert.strictEqual(result.adjustedValues.X, 1.36);
  assert.strictEqual(result.adjustedValues.BZ, 0.2);

  const expected = computeExpectedPpm({
    A: 1.28,
    X: 1.36,
    profileX: PROF_C,
    BZ: 0.2,
    tide: 0,
    helix: 0,
    ligand: 0,
    quench: 0,
    baseWaterFactor: 1 - planConfig.osmosisShare,
    waterProfile: planConfig.waterProfile,
  }, {
    PROF_A,
    PROF_BURST,
    PROF_TIDE,
    PROF_HELIX,
    PROF_LIGAND,
    PROF_QUENCH,
  });

  for (const key of ppmKeysToCheck) {
    const actualValue = result.ppm[key] ?? 0;
    const expectedValue = expected[key] ?? 0;
    assert.ok(
      withinTolerance(actualValue, expectedValue),
      `ppm mismatch for ${key}: expected ${expectedValue}, received ${actualValue}`,
    );
  }
});
