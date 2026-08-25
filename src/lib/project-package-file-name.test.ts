import { describe, expect, it } from "vitest";
import { projectPackageFileName } from "./project-package-file-name";

describe("projectPackageFileName", () => {
  it("names the package after the project and its update day", () => {
    expect(projectPackageFileName({ name: "备份项目", updatedAt: "2026-08-24T02:00:00.000Z" }))
      .toBe("备份项目-工程包-2026-08-24.json");
  });

  it("falls back to the default base name when the project name is unusable", () => {
    expect(projectPackageFileName({ name: "   ", updatedAt: "2026-08-24T02:00:00.000Z" }))
      .toBe("我的毕业去向图-工程包-2026-08-24.json");
  });

  it("keeps only the calendar day so two exports on the same day share a name", () => {
    const morning = projectPackageFileName({ name: "一班", updatedAt: "2026-08-24T01:00:00.000Z" });
    const evening = projectPackageFileName({ name: "一班", updatedAt: "2026-08-24T23:59:59.000Z" });
    expect(morning).toBe("一班-工程包-2026-08-24.json");
    expect(evening).toBe(morning);
  });
});
