// Pure engine types. No I/O anywhere in lib/engine.

export type Driver =
  | "coverage"
  | "thickness"
  | "roll"
  | "board"
  | "linear"
  | "each"
  | "bought_in"
  | "labour_only";

export type Confidence = "H" | "M" | "L";
export type Unit = "sqm" | "lm" | "nos" | "lump";
export type NudgeSeverity = "info" | "warn" | "block";

export interface EngineSettings {
  intercompanyFactor: number;
  vatRate: number;
  defaultMargin: number;
  defaultOverhead: number;
  defaultWaste: number;
  workingHoursPerDay: number;
  workingDaysPerWeek: number;
  congestionLossPerExtraCrew: number;
  supervisorDayCost?: number;
  noiseLabourUplift?: number;
  // Crew reference and programme estimates (suggestions, confidence L)
  baselineProductivityPerCrewDay?: number;
  // Upper floor or roof factor on calculated price, clamped to 1.20
  upperFloorFactor?: number;
  // Logistics suggestion rates
  logisticsPickupCost?: number;
  logisticsTruckCost?: number;
  logisticsTruckCapacityTons?: number;
  logisticsBargePerTon?: number;
}

export interface FamilyRef {
  id: string;
  name: string;
  driver: Driver;
  packQty: number | null;
  packUnit: string | null;
  booksCost: number | null;
  costFlag?: "ok" | "zero_cost" | "duplicate_suspect";
  manualCost: number | null;
  manualPackQty: number | null;
  manualPackUnit?: string | null;
  coverageValue: number | null;
  coverageUnit: string | null;
  defaultMultiplier: number | null;
  wastePct: number | null;
  coverageConfidence: Confidence | null;
}

export interface TierRef {
  id: string;
  name: string;
  crewSize: number | null;
  crewDayCost: number | null;
  applicationRatePerSqm: number | null;
  confidence: Confidence | null;
}

export interface SiteProfileRef {
  allowedHoursPerDay: number;
  allowedDaysPerWeek: number;
  labourMultiplier: number;
  mobilisationMultiplier: number;
  transportPerTrip: number;
  permitLump: number;
  parkingPerDay: number;
  noiseRestricted: boolean;
  isIsland?: boolean;
}

export interface StageRef {
  id: string;
  name: string;
  discipline: string;
  cureDays: number | null;
  consumablePerSqm: number | null;
  productivity: number | null;
  productivityConfidence: Confidence | null;
  // Speed weight scales baseline productivity for programme crew-day
  // estimates only, never for pricing. Confidence L.
  speedWeight?: number | null;
  // Share of first-coat time each subsequent coat takes (0.4 epoxy, 1.0 WP)
  subsequentCoatFactor?: number | null;
}

export interface LineInputs {
  // material
  thicknessMm?: number;
  thicknessCm?: number;
  coats?: number;
  wastePct?: number;
  netUnitsPerPack?: number;
  lmPerPack?: number;
  pcsPerPack?: number;
  pcsPerOutputUnit?: number;
  // grout and adhesive
  tileLengthMm?: number;
  tileWidthMm?: number;
  tileThicknessMm?: number;
  jointWidthMm?: number;
  jointDepthMm?: number;
  groutType?: "cementitious" | "epoxy";
  backButter?: boolean;
  // sealant
  sealantJointWidthMm?: number;
  sealantJointDepthMm?: number;
  // bought in
  boughtInCost?: number;
  cuttingWastePct?: number;
  markupPct?: number;
  // labour
  applicationRateOverride?: number;
  productivityOverride?: number;
  // pricing
  marginOverride?: number;
  // site factor: upper floor or roof multiplies calculated price
  upperFloorOrRoof?: boolean;
  // extra material lines summed in (secondary families)
  secondaryFamilyIds?: string[];
}

export interface LineInput {
  id: string;
  stageId?: string | null;
  familyId?: string | null;
  tierId?: string | null;
  description: string;
  qty: number;
  unit: Unit;
  included: boolean;
  isRateOnly?: boolean;
  quotedRate?: number | null;
  inputs: LineInputs;
}

export interface QuoteInput {
  lines: LineInput[];
  siteProfile: SiteProfileRef;
  programmeDaysRequested?: number | null;
  programmeHoursPerDay?: number | null;
  baseProgrammeCrewDays?: number | null;
  marginPct?: number;
  overheadPct?: number;
}

export interface ReferenceData {
  settings: EngineSettings;
  familiesById: Map<string, FamilyRef>;
  tiersById: Map<string, TierRef>;
  stagesById: Map<string, StageRef>;
}

export interface HistoryPoint {
  stageId: string | null;
  familyId: string | null;
  unitPrice: number;
  quoteNumber: string;
  quoteDate: string;
  siteLabel?: string;
}

export interface Nudge {
  rule: string;
  severity: NudgeSeverity;
  message: string;
  lineId?: string;
}

export interface LineBreakdown {
  lineId: string;
  materialPerUnit: number;
  labourPerUnit: number;
  consumablesPerUnit: number;
  equipmentPerUnit: number;
  // Reference only, never applied to the price
  crewCostReferencePerUnit: number | null;
  costPerUnit: number;
  floorPerUnit: number;
  calculatedPerUnit: number;
  quotedPerUnit: number | null;
  lineCost: number;
  lineFloor: number;
  lineCalculated: number;
  lineQuoted: number | null;
  nudges: Nudge[];
}

export interface ProgrammeResult {
  applied: boolean;
  infeasible: boolean;
  crewsRequired: number;
  crewHoursTotal: number;
  availableHoursPerCrew: number;
  congestionPct: number;
  upliftTotal: number;
  explanation: string;
}

export interface QuoteTotals {
  lines: LineBreakdown[];
  floorSubtotal: number;
  calculatedSubtotal: number;
  quotedSubtotal: number;
  programme: ProgrammeResult;
  vatFloor: number;
  vatCalculated: number;
  vatQuoted: number;
  totalFloor: number;
  totalCalculated: number;
  totalQuoted: number;
  nudges: Nudge[];
}
