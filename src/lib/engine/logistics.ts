// Logistics line suggestion from total material tonnage. Suggestion only,
// source manual, confidence L: the estimator accepts or edits the lump line.
// Rule (Tarun, 1 Sep 2026): under 1 ton use a pickup; otherwise
// ceil(tonnage / truck capacity) trucks at the truck rate. Island site
// profiles add a barge at the per-ton rate (source: Al Maya Island 2026,
// 16,000 AED for 80 t). Mainland sites get trucks only.
import type { Confidence, EngineSettings, SiteProfileRef } from "./types";

export interface LogisticsSuggestion {
  vehicle: "pickup" | "truck";
  trips: number;
  vehicleCost: number;
  bargeCost: number;
  total: number;
  description: string;
  source: "suggestion";
  confidence: Confidence;
}

export function suggestLogistics(
  tonnage: number,
  site: SiteProfileRef,
  settings: EngineSettings
): LogisticsSuggestion | null {
  if (!(tonnage > 0)) return null;

  const capacity = settings.logisticsTruckCapacityTons ?? 4;
  const truckCost = settings.logisticsTruckCost ?? 2000;
  const pickupCost = settings.logisticsPickupCost ?? 0;
  const bargePerTon = settings.logisticsBargePerTon ?? 200;

  const usePickup = tonnage < 1;
  const trips = usePickup ? 1 : Math.ceil(tonnage / capacity);
  const vehicleCost = usePickup ? pickupCost : trips * truckCost;
  const bargeCost = site.isIsland ? tonnage * bargePerTon : 0;
  const total = vehicleCost + bargeCost;

  const parts: string[] = [];
  parts.push(
    usePickup
      ? `pickup for ${tonnage} t`
      : `${trips} truck${trips === 1 ? "" : "s"} for ${tonnage} t`
  );
  if (site.isIsland) parts.push(`barge at ${bargePerTon} per ton`);

  return {
    vehicle: usePickup ? "pickup" : "truck",
    trips,
    vehicleCost,
    bargeCost,
    total,
    description: `Logistics: ${parts.join(", ")}`,
    source: "suggestion",
    confidence: "L",
  };
}
