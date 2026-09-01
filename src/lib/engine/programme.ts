// Programme and compression. Spec section 4.4.
import type { EngineSettings, ProgrammeResult, SiteProfileRef } from "./types";

export function computeProgramme(args: {
  baseCrewDays: number | null;
  programmeDaysRequested: number | null;
  programmeHoursPerDay: number | null;
  cureDaysTotal: number;
  labourSubtotal: number;
  mobilisationPerCrew: number;
  site: SiteProfileRef;
  settings: EngineSettings;
}): ProgrammeResult {
  const {
    baseCrewDays,
    programmeDaysRequested,
    cureDaysTotal,
    labourSubtotal,
    mobilisationPerCrew,
    site,
    settings,
  } = args;

  const none: ProgrammeResult = {
    applied: false,
    infeasible: false,
    crewsRequired: 1,
    crewHoursTotal: 0,
    availableHoursPerCrew: 0,
    congestionPct: 0,
    upliftTotal: 0,
    explanation: "",
  };
  if (!baseCrewDays || !programmeDaysRequested) return none;

  const siteHoursPerDay = Math.min(
    args.programmeHoursPerDay ?? settings.workingHoursPerDay,
    site.allowedHoursPerDay
  );
  const siteDaysPerWeek = Math.min(settings.workingDaysPerWeek, site.allowedDaysPerWeek);

  const crewHoursTotal = baseCrewDays * settings.workingHoursPerDay;
  const availableHoursPerCrew =
    programmeDaysRequested * siteHoursPerDay * (siteDaysPerWeek / 7);

  if (cureDaysTotal > programmeDaysRequested) {
    return {
      ...none,
      applied: true,
      infeasible: true,
      crewHoursTotal,
      availableHoursPerCrew,
      explanation: `Cure time alone is ${cureDaysTotal} calendar days, more than the ${programmeDaysRequested} day deadline. No crew size makes this feasible.`,
    };
  }

  const crewsRequired = Math.max(1, Math.ceil(crewHoursTotal / availableHoursPerCrew));
  const congestionPct = settings.congestionLossPerExtraCrew * (crewsRequired - 1);
  const extraMobilisation = (crewsRequired - 1) * mobilisationPerCrew;
  const supervision =
    crewsRequired > 1
      ? (settings.supervisorDayCost ?? 650) * programmeDaysRequested
      : 0;
  const upliftTotal = labourSubtotal * congestionPct + extraMobilisation + supervision;

  const explanation =
    crewsRequired > 1
      ? `${baseCrewDays} crew-days at ${settings.workingHoursPerDay} h = ${Math.round(crewHoursTotal)} crew-hours. Site allows ${siteHoursPerDay} h/day, ${siteDaysPerWeek}-day week, so ${programmeDaysRequested} calendar days give ${Math.round(availableHoursPerCrew)} hours per crew. ${crewsRequired} crews needed: congestion +${Math.round(congestionPct * 100)}% on labour, ${crewsRequired}x mobilisation and tools, supervision ${programmeDaysRequested} days.`
      : `One crew fits the deadline: ${Math.round(crewHoursTotal)} crew-hours against ${Math.round(availableHoursPerCrew)} available.`;

  return {
    applied: true,
    infeasible: false,
    crewsRequired,
    crewHoursTotal,
    availableHoursPerCrew,
    congestionPct,
    upliftTotal,
    explanation,
  };
}
