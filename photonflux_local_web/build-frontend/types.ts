// FIX: Create full content for types.ts based on its usage across the application.
import type { AnalysisResult } from './services/aiService';

export type Language = 'en' | 'de';
export type Cultivar = 'wedding_cake' | 'blue_dream' | 'amnesia_haze';
export type Substrate = 'coco' | 'soil' | 'rockwool';
export type Trend = 'neutral' | 'higher' | 'lower';
export type Tipburn = 'yes' | 'no';
export type Pale = 'yes' | 'no';
export type CaMgDeficiency = 'yes' | 'no';
export type Claw = 'yes' | 'no';
export type PHDrift = 'normal' | 'high' | 'low';
export type WeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, 1 = Monday, ...


export type VegPhase = 'Early Veg' | 'Mid Veg' | 'Late Veg';
export type FloweringPhase = `W${number}`;
export type Phase = VegPhase | FloweringPhase;

export type SilicateUnit = 'per_liter' | 'per_plant';

export interface PlanEntry {
  phase: Phase;
  A: number;
  X: number;
  BZ: number;
  pH: string;
  EC: string;
  Tide?: number;
  Helix?: number;
  Ligand?: number;
  Silicate?: number;
  SilicateUnit?: SilicateUnit;
  durationDays?: number;
  notes?: string[];
}

export type Plan = PlanEntry[];

export interface ManagedPlan {
  id: string;
  name: string;
  description?: string;
  plan: Plan;
  waterProfile: NutrientProfile;
  osmosisShare: number; // Fraction between 0 and 1 representing the proportion of RO water
  isDefault?: boolean;
}

export interface NutrientProfile {
  N?: number;
  P?: number;
  K?: number;
  Ca?: number;
  Mg?: number;
  S?: number;
  Na?: number;
  Fe?: number;
  B?: number;
  Mo?: number;
  Mn?: number;
  Zn?: number;
  Cu?: number;
  Cl?: number;
}

export type NutrientKey = keyof NutrientProfile;

export type PlanOptimizerStage = 'veg' | 'flower' | 'ripen';

export type NutrientTargets = Partial<Record<NutrientKey, number>>;

export interface PlanOptimizerWeekInput {
  phase: string;
  stage: PlanOptimizerStage;
  targets: NutrientTargets;
}

export interface PlanOptimizationSuggestion {
  phase: string;
  stage?: string;
  A: number;
  X: number;
  BZ: number;
  pH?: string;
  EC?: string;
  achieved?: NutrientTargets;
  diff?: NutrientTargets;
  notes?: string;
}

export interface PlanOptimizationResponse {
  plan: PlanOptimizationSuggestion[];
  summary?: string;
}

export type StageClass = "VEG" | "B1" | "P23" | "P47" | "W8" | "RIPEN";

export type JournalEntryType = 'Observation' | 'Feeding' | 'Pest' | 'Training' | 'Harvest';
export type JournalPriority = 'Critical' | 'High' | 'Medium' | 'Low';

export interface StageAnalysisResult {
  stage: 'Vegetative' | 'Flowering' | 'Ripening';
  confidence: 'High' | 'Medium' | 'Low';
  reasoning: string;
}

export interface HarvestDetails {
  wetWeight?: number; // in g
  dryWeight?: number; // in g
  trimWeight?: number; // in g
  qualityRating?: number; // 1-5
  densityRating?: number; // 1-5
  terpenProfile?: string;
  resinProduction?: 'Low' | 'Medium' | 'High';
  dryingNotes?: string;
}

export interface Grow {
  id: string;
  name: string;
  cultivar: Cultivar;
  substrate: Substrate;
  startDate: string;
  endDate?: string;
  status: 'active' | 'completed' | 'archived';
  notes?: string;
  settings?: {
    haSensorMapping?: HASensorMapping;
  };
}

export interface HASensorMapping {
  temp?: string;
  humidity?: string;
  ec?: string;
  ph?: string;
  ppfd?: string;
  co2?: string;
  rootTemp?: string;
  leafTemp?: string;
  vpd?: string;
  vwc?: string;
  soilEc?: string;
}

export interface JournalEntry {
  id: string; // Using string for UUIDs or timestamps
  growId?: string; // Reference to the Grow cycle
  date: string; // ISO 8601 format
  phase: Phase;
  entryType: JournalEntryType;
  priority: JournalPriority;
  notes: string;
  images: string[]; // base64 encoded strings
  tags: string[];
  metrics: {
    plantHeight?: number; // in cm
    temp?: number; // in °C
    humidity?: number; // in %
    ec?: number;
    ph?: number;
    ppfd?: number; // Lichtintensität
    co2?: number; // CO2-Gehalt in ppm
    rootTemp?: number; // Wurzeltemperatur in °C
    leafTemp?: number; // Blatttemperatur in °C
    vpd?: number; // VPD in kPa
    vwc?: number; // VWC in %
    soilEc?: number; // Boden EC
  };
  feedingDetails?: {
    A: number;
    X: number;
    BZ: number;
    EC: string;
    pH: string;
  };
  adjustments?: {
    trend: Trend;
    tipburn: Tipburn;
    pale: Pale;
    caMgDeficiency: CaMgDeficiency;
    claw: Claw;
    phDrift: PHDrift;
  };
  aiAnalysisResult?: AnalysisResult;
  harvestDetails?: HarvestDetails;
  relatedEntryId?: string; // Verknüpfung zu einem anderen Eintrag
}