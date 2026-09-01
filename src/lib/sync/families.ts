// Curated regex table linking Books item names to product families.
// The sync links first by the exact representative item name from the seed,
// then by these patterns, then sends the item to the review queue.
// The `family` string must match product_families.name exactly (workbook names).
// Starter table covering the main product lines; extend from the review queue.

export type FamilyRule = { pattern: RegExp; family: string };

export const FAMILY_RULES: FamilyRule[] = [
  // Mapei primers
  { pattern: /\bprimer\s*sn\b/i, family: "Mapei Primer SN (epoxy primer)" },
  { pattern: /\bprimer\s*grip\b/i, family: "Mapei Primer Grip (10 kg)" },
  { pattern: /\bprimer\s*g\b/i, family: "Mapei Primer G" },
  { pattern: /\beco\s*prim\s*grip\s*plus/i, family: "Mapei Eco Prim Grip Plus" },
  { pattern: /\beco\s*prim\s*grip/i, family: "Mapei Eco Prim Grip (10 kg)" },
  { pattern: /\beco\s*prim\s*pu\s*1k/i, family: "Mapei Eco Prim PU 1K" },
  { pattern: /\beco\s*prim\s*t\b/i, family: "Mapei Eco Prim T Plus" },

  // Mapei tile adhesives
  { pattern: /\bkeraflex\s+maxi.*white/i, family: "Mapei Keraflex Maxi S1 Zero White (25 kg)" },
  { pattern: /\bkeraflex\s+maxi/i, family: "Mapei Keraflex Maxi S1 Zero Grey (25 kg)" },
  { pattern: /\bkeraflex\b/i, family: "Mapei Keraflex Grey (25 kg)" },

  // Mapei grouts and sealants
  { pattern: /\bultracolor\s+plus/i, family: "Mapei Ultracolor Plus (5 kg)" },
  { pattern: /\bkerapoxy\s+adhesive/i, family: "Mapei Kerapoxy Adhesive (10 kg, pools)" },
  { pattern: /\bkerapoxy\s+cq/i, family: "Mapei Kerapoxy CQ (3 kg)" },
  { pattern: /\bkerapoxy\s+easy\s+design/i, family: "Mapei Kerapoxy Easy Design (3 kg)" },
  { pattern: /\bkerapoxy\b.*\b5\s*kg/i, family: "Mapei Kerapoxy (5 kg epoxy)" },
  { pattern: /\bkerapoxy\b/i, family: "Mapei Kerapoxy (10 kg epoxy)" },
  { pattern: /\bmapesil\s+lm/i, family: "Mapei Mapesil LM (310 ml, marble)" },
  { pattern: /\bmapesil\s+ac/i, family: "Mapei Mapesil AC (310 ml)" },

  // Mapei waterproofing
  { pattern: /\bmapelastic\s+smart/i, family: "Mapei Mapelastic Smart" },
  { pattern: /\bmapelastic\s+easy/i, family: "Mapei Mapelastic Easy (A+B 24 kg)" },
  { pattern: /\bmapelastic\s+foundation/i, family: "Mapei Mapelastic Foundation" },
  { pattern: /\bmapelastic\s+aquadefense/i, family: "Mapei Mapelastic Aquadefense Zero" },
  { pattern: /\bmapelastic\s+zero/i, family: "Mapei Mapelastic Zero (A+B)" },
  { pattern: /\bmapelastic\b/i, family: "Mapei Mapelastic (A+B 32 kg)" },
  { pattern: /\bpurtop\s*1000/i, family: "Mapei Purtop 1000 N (A+B)" },
  { pattern: /\bpurtop\s*500/i, family: "Mapei Purtop 500 N (A+B drum)" },
  { pattern: /\bpurtop\s*200/i, family: "Mapei Purtop 200 (A+B set)" },
  { pattern: /\bpurtop\s*easy/i, family: "Mapei Purtop Easy" },
  { pattern: /\bmapenet\s*150/i, family: "Mapei Mapenet 150 (1x50 m)" },
  { pattern: /\bmapetex\b/i, family: "Mapei Mapetex Sel (25x1 m)" },

  // Mapei levelling and screed
  { pattern: /\bultraplan\s+eco\s*20/i, family: "Mapei Ultraplan Eco 20 (23 kg)" },
  { pattern: /\bultraplan\s+eco/i, family: "Mapei Ultraplan Eco (23 kg)" },
  { pattern: /\bultraplan\s+maxi\s+fibre/i, family: "Mapei Ultraplan Maxi Fibre" },
  { pattern: /\bultraplan\s+maxi/i, family: "Mapei Ultraplan Maxi (25 kg)" },
  { pattern: /\bultraplan\s+contract/i, family: "Mapei Ultraplan Contract (25 kg)" },
  { pattern: /\bultraplan\s+fast/i, family: "Mapei Ultraplan Fast Track (23 kg)" },
  { pattern: /\bultraplan\s+trade/i, family: "Mapei Ultraplan Trade (25 kg)" },
  { pattern: /\bultraplan\b/i, family: "Mapei Ultraplan (23 kg)" },
  { pattern: /\btopcem\s+pronto/i, family: "Mapei Topcem Pronto (25 kg ready-mix)" },
  { pattern: /\btopcem\b/i, family: "Mapei Topcem (20 kg binder)" },

  // Mapei resin floors
  { pattern: /\bmapefloor\s+i\s*300/i, family: "Mapei Mapefloor I 300 SL (A+B+C 47 kg)" },
  { pattern: /\bmapefloor\s+(?:i\s*900|i\s*910)/i, family: "Mapei Mapefloor I 900 / I 910 primer" },
  { pattern: /\bmapefloor\s+fc\s*200/i, family: "Mapei Mapefloor FC 200 ME (A+B 25.5 kg) roller coat" },
  { pattern: /\bmapefloor\s+finish\s*450/i, family: "Mapei Mapefloor Finish 450 ME (A+B 22.5 kg)" },
  { pattern: /\bmapefloor\s+finish\s*52/i, family: "Mapei Mapefloor Finish 52 W (A+B)" },
  { pattern: /\bmapefloor\s+finish\s*53/i, family: "Mapei Mapefloor Finish 53 W/L (A+B 11 kg)" },
  { pattern: /\bmapefloor\s+finish\s*58/i, family: "Mapei Mapefloor Finish 58 W (A+B)" },
  { pattern: /\bmapecoat\s+tns\s+base/i, family: "Mapei Mapecoat TNS Base Coat (20 kg)" },
  { pattern: /\bmapecoat\s+tns\s+finish\s*1/i, family: "Mapei Mapecoat TNS Finish 1 (20 kg)" },
  { pattern: /\bmapecoat\s+tns\s+finish\s*4/i, family: "Mapei Mapecoat TNS Finish 4 (20 kg)" },
  { pattern: /\bmapecoat\s+tns\s+line/i, family: "Mapei Mapecoat TNS Line (5 kg)" },
  { pattern: /\bmapecoat\s+tns\s+primer/i, family: "Mapei Mapecoat TNS Primer EPW (A+B)" },
  { pattern: /\bmapecoat\s+i\s*w\b/i, family: "Mapei Mapecoat I W (epoxy, tanks)" },

  // Kerakoll
  { pattern: /\bfugabella\b/i, family: "Kerakoll Fugabella Color (3 kg)" },
  { pattern: /\bfugalite\b/i, family: "Kerakoll Fugalite Color (epoxy)" },
  { pattern: /\baquastop\s*nanoflex/i, family: "Kerakoll Aquastop Nanoflex" },
  { pattern: /\baquastop\s*flex/i, family: "Kerakoll Aquastop Flex (A+B)" },
  { pattern: /\bh40\s*icon/i, family: "Kerakoll H40 Icon (25 kg)" },
  { pattern: /\bh40\b/i, family: "Kerakoll H40 Gel (25 kg)" },
  { pattern: /\bbiogel\b/i, family: "Kerakoll Biogel No Limits" },
  { pattern: /\bbioflex\b/i, family: "Kerakoll Bioflex (25 kg)" },
  { pattern: /\bpragma\b/i, family: "Kerakoll Pragma Flex (25 kg)" },
  { pattern: /\bcementoresina\b/i, family: "Kerakoll Cementoresina" },
  { pattern: /kerakoll.*silicone/i, family: "Kerakoll Silicone Color" },
  { pattern: /\bactive\s*prime/i, family: "Kerakoll Active Prime Grip" },
  { pattern: /\bmicroresina\b/i, family: "Kerakoll Microresina KK2 (incl. primer)" },
  { pattern: /\bwallcrete\b/i, family: "Kerakoll Wallcrete Living KK72 (incl. primer)" },
  { pattern: /kerakoll.*absolute|absolute.*kerakoll/i, family: "Kerakoll Absolute decorative paint" },
  { pattern: /\bdecor\s*kk\s*72/i, family: "Kerakoll Absolute decorative paint" },

  // Weber
  { pattern: /weberdry\s*prime\s*wb/i, family: "Weber weberdry Prime WB" },
  { pattern: /weberdry\s*prime\s*sb/i, family: "Weber weberdry Prime SB" },
  { pattern: /weberdry\s*110/i, family: "Weber weberdry 110 FX" },
  { pattern: /weberdry\s*116/i, family: "Weber weberdry 116 FX" },
  { pattern: /weberdry\s*136/i, family: "Weber weberdry 136 FX" },
  { pattern: /weberdry\s*130/i, family: "Weber weberdry 130 PR" },
  { pattern: /weberdry\s*150/i, family: "Weber weberdry 150 BLC" },
  { pattern: /weberdry\s*360/i, family: "Weber weberdry 360 PU" },
  { pattern: /weberdry\s*fabric/i, family: "Weber weberdry Fabric FX (50 lm)" },
  { pattern: /\bbiflex\b/i, family: "Weber Biflex PL anti-root 4 mm (10 sqm)" },
  { pattern: /epo\s*450/i, family: "Weber webertec Epo 450 PC kit (27.8 kg)" },
  { pattern: /webercol\s*premium/i, family: "Weber webercol Premium (25 kg)" },
  { pattern: /webercol\s*flex/i, family: "Weber webercol Flex kit" },
  { pattern: /webercol\s*plus/i, family: "Weber webercol Plus (25 kg)" },
  { pattern: /\bweberjoint\b/i, family: "Weber weberjoint (20 kg)" },

  // Fosroc
  { pattern: /nitocote\s*cm\s*210|\bcm\s*210\b/i, family: "Fosroc Nitocote CM210" },
  { pattern: /renderoc\s*hs/i, family: "Fosroc Renderoc HS (25 kg)" },
  { pattern: /renderoc\s*fc/i, family: "Fosroc Renderoc FC (25 kg)" },
  { pattern: /renderoc\s*la/i, family: "Fosroc Renderoc LA (25 kg, flowable)" },

  // Laticrete
  { pattern: /hydro\s*ban/i, family: "Laticrete Hydro Ban" },
  { pattern: /latascreed\s*pm\s*30/i, family: "Laticrete Latascreed PM30 (50 kg)" },
  { pattern: /permacolor/i, family: "Laticrete Permacolor Grout FS (5 kg)" },
  { pattern: /laticrete\s*254|254\s*platinum/i, family: "Laticrete 254 Platinum Rapid" },
  { pattern: /latapoxy/i, family: "Laticrete Latapoxy Stone Adhesive (10 L)" },

  // Awazel
  { pattern: /awazel\s*py\s*40|py\s*40\s*l/i, family: "Awazel PY40 L 4 mm SBS" },
];

// Brands that are tools, trims and accessories, never priced as materials by
// the estimating engine. Review queue items from these brands are resolved as
// not applicable.
export const NOT_APPLICABLE_BRANDS = [
  "dewalt", "profilpas", "bihui", "rubi", "montolit", "vixtron",
];

export function isNotApplicableBrand(itemName: string, brand: string | null): boolean {
  const hay = `${itemName} ${brand ?? ""}`.toLowerCase();
  return NOT_APPLICABLE_BRANDS.some((b) => hay.includes(b));
}

export function matchFamily(itemName: string): string | null {
  for (const rule of FAMILY_RULES) {
    if (rule.pattern.test(itemName)) return rule.family;
  }
  return null;
}
