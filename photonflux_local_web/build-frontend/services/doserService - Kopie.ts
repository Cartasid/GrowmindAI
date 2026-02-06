import type { NutrientProfile, Phase, StageClass, ManagedPlan } from '../types';
import { PROF_A, PROF_B, PROF_C, PROF_BURST, PROF_TIDE, PROF_HELIX, PROF_LIGAND, QUENCH_DOSE_G_L, PROF_QUENCH } from '../constants';
import { getWeekNumber } from '../utils';

export interface DoserInput {
  phase: Phase;
  reservoir: number;
  substrate: 'coco' | 'soil' | 'rockwool';
  trend: 'neutral' | 'higher' | 'lower';
  tipburn: 'yes' | 'no';
  pale: 'yes' | 'no';
  caMgDeficiency: 'yes' | 'no';
  claw: 'yes' | 'no';
  phDrift: 'normal' | 'high' | 'low';
  startDate?: string;
}

export interface WeighRow {
  name: string;
  amount: number;
  unit: string;
  note: string;
  tagClass: string;
  perPlant?: boolean;
}

export interface CalculationResult {
  baseLabel: string;
  baseValues: { A: number; X: number; BZ: number; Xname: string; additives: string; };
  deltaValues: { A: number; X: number; BZ: number; Xname: string; };
  adjustedValues: { A: number; X: number; BZ: number; Xname: string; additives: string; ec: string; };
  weighTable: WeighRow[];
  ppm: Required<NutrientProfile>;
  npkRatio: string;
  stageClass: StageClass;
}

const getStageClass = (phase: Phase): StageClass => {
  const p = String(phase);
  // Support both internal keys and common translations
  if (["Early Veg", "Mid Veg", "Late Veg", "Frühe Veg", "Mitte Veg", "Späte Veg"].includes(p)) return "VEG";

  const weekNumber = getWeekNumber(p as Phase);
  if (weekNumber === null) {
      // Fallback for cases where phase might be a translation not in the list above
      if (p.toLowerCase().includes('veg') || p.toLowerCase().includes('wachstum')) return "VEG";
      return "VEG";
  }

  if (weekNumber === 1) return "B1";
  if (weekNumber <= 3) return "P23";
  if (weekNumber <= 8) return "P47";
  if (weekNumber === 9) return "W8"; // Late flower, slightly reduced intensity
  return "RIPEN";
};

const r2 = (v: number) => Math.round(v * 100) / 100;

export const calculateDose = (inputs: DoserInput, planConfig: ManagedPlan, t: (key: string) => string, weekTag: (phase: Phase) => string): CalculationResult | null => {
  const base = planConfig.plan.find(p => p.phase === inputs.phase);
  if (!base) return null;

  const cls = getStageClass(inputs.phase);
  const currentWeekNumber = getWeekNumber(inputs.phase);
  const weekNumbers = planConfig.plan
    .map(entry => getWeekNumber(entry.phase))
    .filter((week): week is number => week !== null);
  const maxWeekNumber = weekNumbers.length ? Math.max(...weekNumbers) : null;

  let dA = 0, dX = 0, dB = 0;
  
  const isHigherEC = inputs.trend === 'higher';
  const isLowerEC = inputs.trend === 'lower';

  if (inputs.claw === 'yes') dA -= 0.10;
  if (inputs.pale === 'yes' && !isHigherEC) dA += 0.10;
  if (inputs.caMgDeficiency === 'yes' && !isHigherEC && inputs.claw === 'no') dA += 0.05;
  if (inputs.caMgDeficiency === 'yes') dX += 0.05;
  if (cls !== "VEG") {
    if (inputs.tipburn === 'yes' && isHigherEC) dX -= 0.04;
    if (cls === 'P47' && isLowerEC) dX += 0.02;
  }
  if (inputs.tipburn === 'yes' || isHigherEC) dB -= 0.02;

  if (inputs.phDrift === 'high') {
    let dA_ph = -0.05, dX_ph = +0.03, dB_ph = +0.02;
    if (isHigherEC) { dX_ph = 0; dB_ph = 0; dB += -0.02; }
    dA += dA_ph; dX += dX_ph; dB += dB_ph;
  } else if (inputs.phDrift === 'low') {
    dA += +0.05; dX += -0.03; dB += -0.02;
  }
  
  const Araw = r2(base.A + dA);
  const Xraw = r2(base.X + dX);
  const Braw = r2(base.BZ + dB);

  const A = Math.max(0, Araw);
  const X = Math.max(0, Xraw);
  const BZ = Math.max(0, Braw);

  const Xname = (cls === "VEG" ? t('B_name') : t('C_name'));
  const tag = weekTag(inputs.phase);
  const baseLabel = `${t('phases')[inputs.phase] || inputs.phase}${tag ? ` · ${tag}` : ''}`;
  const tideAmount = base.Tide || 0;
  const helixAmount = base.Helix || 0;
  const ligandAmount = base.Ligand || 0;
  const silicateAmount = typeof base.Silicate === 'number' ? base.Silicate : 0;
  const silicateUnit = base.SilicateUnit === 'per_plant' ? 'per_plant' : 'per_liter';
  const noteText = (base.notes || []).map(noteKey => t(noteKey)).join(' ');
  
  let additivesString = '';
  if (tideAmount > 0) additivesString += ` • Tide ${tideAmount.toFixed(2)} g/L`;
  if (helixAmount > 0) additivesString += ` • Helix ${helixAmount.toFixed(2)} ml/L`;
  if (ligandAmount > 0) additivesString += ` • Ligand ${ligandAmount.toFixed(2)} ml/L`;
  if (silicateAmount > 0) {
    if (silicateUnit === 'per_liter') {
      additivesString += ` • ${t('silicate_name')} ${silicateAmount.toFixed(2)} g/L`;
    } else {
      additivesString += ` • ${t('silicate_name')} ${silicateAmount.toFixed(2)} g/${t('per_plant_short')}`;
    }
  }

  const weighTable: WeighRow[] = [];
  weighTable.push({ name: t('A_name'), amount: A, unit: 'g', note: (cls === "RIPEN" ? t('no_A_ripen') : ''), tagClass: 'nutrient-core' });
  weighTable.push({ name: Xname, amount: X, unit: 'g', note: '', tagClass: cls === 'VEG' ? 'nutrient-vec' : 'nutrient-pulse' });
  weighTable.push({ name: t('BURST_name'), amount: BZ, unit: 'g', note: ((cls === "VEG" || cls === "B1" || cls === "RIPEN") ? t('not_in_veg') : ''), tagClass: 'nutrient-burst' });

  if (tideAmount > 0) weighTable.push({ name: "Tide", amount: tideAmount, unit: "g", note: "", tagClass: '' });
  if (helixAmount > 0) {
      const isRipenPhase = currentWeekNumber !== null && currentWeekNumber >= 9;
      const pulseNote = !isRipenPhase ? t('helix_pulse_note') : "";
      weighTable.push({ name: "Helix", amount: helixAmount, unit: "ml", note: pulseNote, tagClass: '' });
  }
  if (ligandAmount > 0) weighTable.push({ name: "Ligand", amount: ligandAmount, unit: "ml", note: "", tagClass: '' });
  if (silicateAmount > 0) {
      const perPlant = silicateUnit === 'per_plant';
      weighTable.push({
          name: t('silicate_name'),
          amount: silicateAmount,
          unit: 'g',
          note: noteText || (perPlant ? t('apply_per_plant') : ''),
          tagClass: '',
          perPlant,
      });
  }

  if (cls === "RIPEN" && maxWeekNumber !== null && currentWeekNumber === maxWeekNumber) {
      weighTable.push({ name: "Quench", amount: QUENCH_DOSE_G_L, unit: "g", note: t('ripen_only_note'), tagClass: '' });
  }

  const profX = (cls === 'VEG' ? PROF_B : PROF_C);
  const ppm: Required<NutrientProfile> = {N:0,P:0,K:0,Ca:0,Mg:0,S:0,Na:0,Fe:0,B:0,Mo:0,Mn:0,Zn:0,Cu:0,Cl:0};
  
  const addPpm = (profile: NutrientProfile, multiplier: number) => {
    for (const key in profile) {
      const k = key as keyof NutrientProfile;
      ppm[k] = (ppm[k] || 0) + (profile[k] || 0) * multiplier;
    }
  };

  addPpm(PROF_A, A);
  addPpm(profX, X);
  addPpm(PROF_BURST, BZ);
  if (tideAmount > 0) addPpm(PROF_TIDE, tideAmount);
  if (helixAmount > 0) addPpm(PROF_HELIX, helixAmount);
  if (ligandAmount > 0) addPpm(PROF_LIGAND, ligandAmount);

  if (cls === "RIPEN" && maxWeekNumber !== null && currentWeekNumber === maxWeekNumber) {
    addPpm(PROF_QUENCH, QUENCH_DOSE_G_L);
  }

  const osmosisShare = Math.min(1, Math.max(0, planConfig.osmosisShare ?? 0));
  const baseWaterFactor = 1 - osmosisShare;
  if (baseWaterFactor > 0) {
    addPpm(planConfig.waterProfile || {}, baseWaterFactor);
  }

  // Corrected NPK ratio calculation
  const { N, P, K } = ppm;
  let npkRatio = '0:0:0';
  const positiveValues = [N, P, K].filter(v => v > 0);
  
  if (positiveValues.length > 0) {
      const divisor = Math.min(...positiveValues);
      if (divisor > 0) {
        const ratioN = (N / divisor).toFixed(1);
        const ratioP = (P / divisor).toFixed(1);
        const ratioK = (K / divisor).toFixed(1);
        npkRatio = `${ratioN}:${ratioP}:${ratioK}`;
      }
  }


  return {
    baseLabel,
    baseValues: { A: base.A, X: base.X, BZ: base.BZ, Xname, additives: additivesString },
    deltaValues: { A: Araw - base.A, X: Xraw - base.X, BZ: Braw - base.BZ, Xname },
    adjustedValues: { A, X, BZ, Xname, additives: additivesString, ec: base.EC },
    weighTable,
    ppm,
    npkRatio,
    stageClass: cls,
  };
};
