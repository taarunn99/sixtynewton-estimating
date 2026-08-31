const FORBIDDEN = /[\u2013\u2014]/;
const FORBIDDEN_WITH_SPACING = /\s*[\u2013\u2014]\s*/g;

export function containsForbiddenDash(s: string): boolean {
  return FORBIDDEN.test(s);
}

export function assertNoForbiddenDashes(s: string, context = "generated text"): string {
  if (containsForbiddenDash(s)) {
    throw new Error(`Em or en dash found in ${context}. Use commas, colons or full stops.`);
  }
  return s;
}

export function replaceForbiddenDashes(s: string): string {
  return s.replace(FORBIDDEN_WITH_SPACING, ", ");
}
