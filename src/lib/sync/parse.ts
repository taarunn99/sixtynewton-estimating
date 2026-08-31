// Parses pack quantity and unit out of a Zoho Books item name.
// Examples seen in the Lapiz Blue item list:
//   "Primer SN A+B 20 KG"                      -> 20 kg
//   "Primer G jerrycan 25kg"                   -> 25 kg
//   "Eco Prim Grip Plus bucket 10"             -> needs unit, unmatched
//   "Mapesil AC Zero 123 crt 310ml (box of 12)"-> 0.31 L
//   "Mapenet 150 roll 50m x 1m"                -> 50 sqm
//   "Ultraplan Eco 20 bag 23 kg"               -> 23 kg

export type ParsedPack = {
  pack_qty: number;
  pack_unit: "kg" | "L" | "sqm" | "lm" | "pcs";
};

type Rule = { re: RegExp; toPack: (m: RegExpMatchArray) => ParsedPack | null };

const n = (s: string) => parseFloat(s.replace(/,/g, ""));

const RULES: Rule[] = [
  // Roll or sheet dimensions: "50m x 1m", "1 x 50 m", "1.05x20m"
  {
    re: /(\d+(?:\.\d+)?)\s*m?\s*[x×]\s*(\d+(?:\.\d+)?)\s*m\b/i,
    toPack: (m) => ({ pack_qty: n(m[1]) * n(m[2]), pack_unit: "sqm" }),
  },
  // Weight: "20 KG", "25kg", "5.5 kg"
  {
    re: /(\d+(?:[.,]\d+)?)\s*kgs?\b/i,
    toPack: (m) => ({ pack_qty: n(m[1]), pack_unit: "kg" }),
  },
  // Grams: "500 g", "900gm", "750 gms"
  {
    re: /(\d+(?:[.,]\d+)?)\s*g(?:m|ms|rams)?\b/i,
    toPack: (m) => ({ pack_qty: n(m[1]) / 1000, pack_unit: "kg" }),
  },
  // Litres: "20 L", "5ltr", "10 litre", "4 lt"
  {
    re: /(\d+(?:[.,]\d+)?)\s*(?:l|lt|ltr|ltrs|litre|litres|liter|liters)\b/i,
    toPack: (m) => ({ pack_qty: n(m[1]), pack_unit: "L" }),
  },
  // Millilitres: "310ml", "600 ML"
  {
    re: /(\d+(?:[.,]\d+)?)\s*ml\b/i,
    toPack: (m) => ({ pack_qty: n(m[1]) / 1000, pack_unit: "L" }),
  },
  // Square metres: "4 sqm", "5 m2", "2.5 sq m", "sq.mtr"
  {
    re: /(\d+(?:[.,]\d+)?)\s*(?:sqm|sq\.?\s?m(?:tr)?s?|m2|m²)\b/i,
    toPack: (m) => ({ pack_qty: n(m[1]), pack_unit: "sqm" }),
  },
  // Linear metres: "10 lm", "25 mtr", "50 m" (only when clearly a length token)
  {
    re: /(\d+(?:[.,]\d+)?)\s*(?:lm|rm|mtr|mtrs|meter|meters|metre|metres)\b/i,
    toPack: (m) => ({ pack_qty: n(m[1]), pack_unit: "lm" }),
  },
  // Pieces: "12 pcs", "box of 12", "10 nos", "pack of 6", "6 pc"
  {
    re: /(?:box|pack|set|ctn|carton)\s+of\s+(\d+)/i,
    toPack: (m) => ({ pack_qty: n(m[1]), pack_unit: "pcs" }),
  },
  {
    re: /(\d+)\s*(?:pcs?|pieces?|nos)\b/i,
    toPack: (m) => ({ pack_qty: n(m[1]), pack_unit: "pcs" }),
  },
];

export function parsePack(itemName: string): ParsedPack | null {
  for (const rule of RULES) {
    const m = itemName.match(rule.re);
    if (m) {
      const parsed = rule.toPack(m);
      if (parsed && parsed.pack_qty > 0) return parsed;
    }
  }
  return null;
}

// Colour and pack tokens stripped, for duplicate detection and colour-variant
// grouping: two active items with the same normalised name whose costs differ
// by more than 5x are duplicate suspects.
const COLOUR_WORDS = [
  "white", "black", "grey", "gray", "beige", "ivory", "cream", "sand", "silver",
  "anthracite", "jasmine", "manhattan", "cement", "terracotta", "brown", "red",
  "blue", "green", "yellow", "transparent", "clear", "zero",
];

export function normaliseName(itemName: string): string {
  let s = itemName.toLowerCase();
  s = s.replace(/\(.*?\)/g, " ");
  for (const rule of RULES) s = s.replace(new RegExp(rule.re.source, "gi"), " ");
  for (const w of COLOUR_WORDS) s = s.replace(new RegExp(`\\b${w}\\b`, "g"), " ");
  s = s.replace(/\b\d+(?:[.,]\d+)?\b/g, " ");
  s = s.replace(/[^a-z]+/g, " ").replace(/\s+/g, " ").trim();
  return s;
}
