import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  containsForbiddenDash,
  assertNoForbiddenDashes,
  replaceForbiddenDashes,
} from "../src/lib/text/no-dashes";

const ROOTS = ["src", "scripts", "supabase"];
const EXTS = new Set([".ts", ".tsx", ".css", ".sql", ".json", ".md"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(p, out);
    } else if (EXTS.has(p.slice(p.lastIndexOf(".")))) {
      out.push(p);
    }
  }
  return out;
}

describe("no em or en dashes anywhere in the source tree", () => {
  const files = ROOTS.flatMap((r) => {
    try {
      return walk(join(process.cwd(), r));
    } catch {
      return [];
    }
  });

  it("scans a non-empty file set", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [f.replace(process.cwd() + "/", "")]))(
    "%s contains no em or en dash",
    (rel) => {
      const content = readFileSync(join(process.cwd(), rel), "utf8");
      const lines = content.split("\n");
      const bad = lines
        .map((line, i) => (containsForbiddenDash(line) ? `${rel}:${i + 1}` : null))
        .filter(Boolean);
      expect(bad).toEqual([]);
    }
  );
});

describe("no-dashes helpers for generated output", () => {
  const em = "\u2014";
  const en = "\u2013";

  it("detects both dash characters", () => {
    expect(containsForbiddenDash(`a ${em} b`)).toBe(true);
    expect(containsForbiddenDash(`a ${en} b`)).toBe(true);
    expect(containsForbiddenDash("a - b")).toBe(false);
  });

  it("assert throws on a forbidden dash", () => {
    expect(() => assertNoForbiddenDashes("fine text")).not.toThrow();
    expect(() => assertNoForbiddenDashes(`bad ${em} text`)).toThrow();
  });

  it("replace rewrites dashes to commas", () => {
    expect(replaceForbiddenDashes(`cost ${em} floor`)).toBe("cost, floor");
    expect(containsForbiddenDash(replaceForbiddenDashes(`a${en}b${em}c`))).toBe(false);
  });
});
