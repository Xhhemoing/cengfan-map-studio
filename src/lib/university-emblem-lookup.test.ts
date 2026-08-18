import { afterEach, describe, expect, it } from "vitest";
import {
  loadUniversityEmblemMap,
  peekUniversityEmblem,
  resetUniversityEmblemMapForTests,
} from "./university-emblem-lookup";

afterEach(() => {
  resetUniversityEmblemMapForTests();
});

describe("university emblem lookup", () => {
  it("does not expose emblem paths before the catalog chunk loads", () => {
    expect(peekUniversityEmblem("浙江大学")).toBeUndefined();
  });

  it("loads emblem paths on demand without keeping a static catalog import", async () => {
    const map = await loadUniversityEmblemMap();
    expect(map["浙江大学"]).toBe("/emblems/浙江大学.webp");
    expect(peekUniversityEmblem("浙江大学")).toBe("/emblems/浙江大学.webp");
  });
});
