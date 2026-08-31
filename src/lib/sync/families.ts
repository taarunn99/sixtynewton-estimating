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
];

export function matchFamily(itemName: string): string | null {
  for (const rule of FAMILY_RULES) {
    if (rule.pattern.test(itemName)) return rule.family;
  }
  return null;
}
