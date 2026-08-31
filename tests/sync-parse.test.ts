import { describe, it, expect } from "vitest";
import { parsePack, normaliseName } from "../src/lib/sync/parse";
import { matchFamily, FAMILY_RULES } from "../src/lib/sync/families";

describe("parsePack", () => {
  it("parses weights", () => {
    expect(parsePack("Primer SN A+B 20 KG")).toEqual({ pack_qty: 20, pack_unit: "kg" });
    expect(parsePack("Primer G jerrycan 25kg")).toEqual({ pack_qty: 25, pack_unit: "kg" });
    expect(parsePack("Ultraplan Eco 20 bag 23 kg")).toEqual({ pack_qty: 23, pack_unit: "kg" });
    expect(parsePack("Additive 500 g sachet")).toEqual({ pack_qty: 0.5, pack_unit: "kg" });
  });

  it("parses volumes", () => {
    expect(parsePack("Mapesil AC Zero 123 crt 310ml (box of 12)")).toEqual({
      pack_qty: 0.31,
      pack_unit: "L",
    });
    expect(parsePack("Eco Prim T Plus 10 L drum")).toEqual({ pack_qty: 10, pack_unit: "L" });
    expect(parsePack("Cleaner 5ltr")).toEqual({ pack_qty: 5, pack_unit: "L" });
  });

  it("parses roll dimensions to sqm", () => {
    expect(parsePack("Mapenet 150 roll 50m x 1m")).toEqual({ pack_qty: 50, pack_unit: "sqm" });
    expect(parsePack("Mapetex Sel 25 m x 1 m")).toEqual({ pack_qty: 25, pack_unit: "sqm" });
  });

  it("parses lengths and pieces", () => {
    expect(parsePack("Backer rod 25 mtr coil")).toEqual({ pack_qty: 25, pack_unit: "lm" });
    expect(parsePack("Tile spacers pack of 6")).toEqual({ pack_qty: 6, pack_unit: "pcs" });
    expect(parsePack("Corner piece 12 pcs")).toEqual({ pack_qty: 12, pack_unit: "pcs" });
  });

  it("returns null when nothing matches", () => {
    expect(parsePack("Eco Prim Grip Plus bucket")).toBeNull();
    expect(parsePack("Site survey service")).toBeNull();
  });
});

describe("normaliseName", () => {
  it("strips pack sizes and colours so variants collide", () => {
    const a = normaliseName("Purtop 500 N drum 525 kg Grey");
    const b = normaliseName("Purtop 500 N drum 220 kg White");
    expect(a).toBe(b);
  });

  it("keeps different products apart", () => {
    expect(normaliseName("Keraflex Maxi S1 25kg")).not.toBe(
      normaliseName("Kerapoxy CQ 3kg")
    );
  });
});

describe("matchFamily", () => {
  it("maps item names to workbook family names", () => {
    expect(matchFamily("Keraflex Maxi S1 Zero Grey bag 25 kg")).toBe(
      "Mapei Keraflex Maxi S1 Zero Grey (25 kg)"
    );
    expect(matchFamily("MAPEI ULTRACOLOR PLUS 134 SILK 5KG")).toBe(
      "Mapei Ultracolor Plus (5 kg)"
    );
    expect(matchFamily("Purtop 500 N part A drum")).toBe("Mapei Purtop 500 N (A+B drum)");
    expect(matchFamily("Random unrelated item")).toBeNull();
  });

  it("orders more specific patterns before generic ones", () => {
    expect(matchFamily("Ultraplan Maxi 25 kg")).toBe("Mapei Ultraplan Maxi (25 kg)");
    expect(matchFamily("Ultraplan 23 kg bag")).toBe("Mapei Ultraplan (23 kg)");
    expect(matchFamily("Mapelastic Smart part B")).toBe("Mapei Mapelastic Smart");
    expect(matchFamily("Mapelastic 32 kg kit")).toBe("Mapei Mapelastic (A+B 32 kg)");
  });

  it("every rule references a plausible family name", () => {
    for (const rule of FAMILY_RULES) {
      expect(rule.family.length).toBeGreaterThan(3);
    }
  });
});
