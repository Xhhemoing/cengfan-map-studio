import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("prepared-card-content type boundaries", () => {
  it("does not import source from the components layer", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/prepared-card-content.ts"), "utf8");

    expect(source).not.toMatch(/\bfrom\s+["'][^"']*components\//);
  });
});
