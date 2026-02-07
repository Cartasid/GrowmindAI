export type Cultivar = 'wedding_cake' | 'blue_dream' | 'amnesia_haze';
export type Substrate = 'coco' | 'soil' | 'rockwool';
export type Phase = string;
export type Language = 'en' | 'de';

export interface AnalyzerInputs {
  trend?: string;
  tipburn?: string;
  pale?: string;
  caMgDeficiency?: string;
  claw?: string;
  phDrift?: string;
  substrate?: string;
}

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
  SilicateUnit?: 'per_liter' | 'per_plant';
  durationDays?: number;
  notes?: string[];
}

export interface ObservationAdjustments {
  ecTrend?: { low?: number; high?: number };
  phDrift?: { up?: number; down?: number };
  tipburn?: { mild?: number; strong?: number };
  pale?: { mild?: number; strong?: number };
  caMgDeficiency?: { mild?: number; strong?: number };
  claw?: { mild?: number; strong?: number };
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

export interface ManagedPlan {
  id: string;
  name: string;
  description?: string;
  plan: PlanEntry[];
  waterProfile: NutrientProfile;
  osmosisShare: number;
  startDate?: string;
  observationAdjustments?: ObservationAdjustments;
  isDefault?: boolean;
}

export type Plan = PlanEntry[];

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

export type JournalEntryType = 'Observation' | 'Feeding' | 'Pest' | 'Training' | 'Harvest';
export type JournalPriority = 'Critical' | 'High' | 'Medium' | 'Low';

export interface JournalMetrics {
  plantHeight?: number;
  temp?: number;
  humidity?: number;
  ec?: number;
  ph?: number;
  ppfd?: number;
  co2?: number;
  rootTemp?: number;
  leafTemp?: number;
  vpd?: number;
  vwc?: number;
  soilEc?: number;
}

export interface FeedingDetails {
  A: number;
  X: number;
  BZ: number;
  EC: string;
  pH: string;
}

export interface Adjustments {
  trend?: string;
  tipburn?: string;
  pale?: string;
  caMgDeficiency?: string;
  claw?: string;
  phDrift?: string;
}

export interface HarvestDetails {
  wetWeight?: number;
  dryWeight?: number;
  trimWeight?: number;
  qualityRating?: number;
  densityRating?: number;
  terpenProfile?: string;
  resinProduction?: 'Low' | 'Medium' | 'High';
  dryingNotes?: string;
}

export interface JournalEntry {
  id: string;
  growId?: string;
  date: string;
  phase: Phase;
  entryType: JournalEntryType;
  priority: JournalPriority;
  notes: string;
  images: string[];
  tags: string[];
  metrics: JournalMetrics;
  feedingDetails?: FeedingDetails;
  adjustments?: Adjustments;
  aiAnalysisResult?: AiAnalysisResponse;
  harvestDetails?: HarvestDetails;
  relatedEntryId?: string;
}

export interface StageAnalysisResult {
  stage: 'Vegetative' | 'Flowering' | 'Ripening';
  confidence: 'High' | 'Medium' | 'Low';
  reasoning: string;
}

export interface AiAnalysisIssue {
  issue: string;
  confidence: string;
  explanation: string;
}

export interface AiAnalysisResponse {
  potentialIssues: AiAnalysisIssue[];
  recommendedActions: string[];
  disclaimer: string;
}
