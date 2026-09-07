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
  // Added to the tiling labour suggestion for wall installation (default 10)
  tilingWallUplift?: number;
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
  // Application-only list price (material by client). Either a fixed rate or
  // tiling anchors interpolated linearly on tile area. Source Tarun Sep 2026.
  applicationOnly?: {
    rate?: number | null;
    tiling?: { smallArea: number; smallRate: number; largeArea: number; largeRate: number };
  } | null;
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
  // labour (labour model redesign, UPDATE_LABOUR_MODEL.md): labour is an
  // editable input with an engine suggestion, never a nudge target
  labourOverride?: number;
  // absorb labour in margin: zeroes this line's labour, stage stays on quote
  absorbLabour?: boolean;
  // tiling: wall installation adds the wall uplift to the labour suggestion
  wallInstallation?: boolean;
  applicationRateOverride?: number;
  productivityOverride?: number;
  // pricing
  marginOverride?: number;
  // site factor: upper floor or roof multiplies calculated price
  upperFloorOrRoof?: boolean;
  // application-only mode: client supplies material
  materialByClient?: boolean;
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
  // Head contractor's verbal total labour figure for the whole job. When set,
  // it distributes across labour-bearing lines pro rata to their suggestions;
  // per-line labour overrides win over their share. Never a nudge target.
  labourJobTotal?: number | null;
}

// Labour per sqm anchors on tile area, floor installation. Interpolate
// linearly between consecutive anchors; wall installation adds wallUplift.
export interface TileLabourAnchor {
  areaSqm: number;
  labourPerSqm: number;
  note?: string | null;
}

// Past labour values from issued quote lines (same stage), the first
// suggestion source. Distinct from HistoryPoint, which carries full rates.
export interface LabourHistoryPoint {
  stageId: string;
  labourPerUnit: number;
}

export interface ReferenceData {
  settings: EngineSettings;
  // Tile labour ladder (admin editable, confidence M) and past labour values
  tileLabourAnchors?: TileLabourAnchor[];
  labourHistory?: LabourHistoryPoint[];
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

export type LabourSource =
  | "manual"
  | "job total"
  | "absorbed"
  | "history median"
  | "tile ladder"
  | "application-only rate"
  | "labour tier"
  | "none";

export interface LineBreakdown {
  lineId: string;
  materialPerUnit: number;
  // Effective labour used in the suggested price: override, job-total share,
  // zero when absorbed, else the suggestion
  labourPerUnit: number;
  // The engine suggestion and where it came from, shown greyed beside the input
  labourSuggestedPerUnit: number;
  labourSource: LabourSource;
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
  // Sum of line labour suggestions x qty, greyed beside the job-total box
  labourSuggestedTotal: number;
  // The head contractor figure, echoed back when set
  labourJobTotal: number | null;
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
