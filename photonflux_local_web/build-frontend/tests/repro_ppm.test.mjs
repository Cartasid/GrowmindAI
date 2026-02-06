import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateDose } from '../services/doserService.ts';
import { DEFAULT_PLAN } from '../constants.ts';

test('calculateDose should have non-zero P in Mid Veg', () => {
  const inputs = {
    phase: 'Mid Veg',
    reservoir: 100,
    substrate: 'coco',
    trend: 'neutral',
    tipburn: 'no',
    pale: 'no',
    caMgDeficiency: 'no',
    claw: 'no',
    phDrift: 'normal',
  };
  const t = (k) => k;
  const weekTag = (p) => '';
  const planConfig = DEFAULT_PLAN.wedding_cake.coco;

  const results = calculateDose(inputs, planConfig, t, weekTag);
  console.log('PPM P:', results.ppm.P);
  console.log('PPM K:', results.ppm.K);
  console.log('NPK Ratio:', results.npkRatio);

  assert.ok(results.ppm.P > 0, 'Phosphorus should be greater than 0');
});
