import { describe, expect, it } from "vitest";
import { projectPackageDisplayName } from "./project-package";
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

  it("round-trips through projectPackageDisplayName so re-importing an export restores the name", () => {
    const exported = projectPackageFileName({ name: "三年二班蹭饭图", updatedAt: "2026-08-24T02:00:00.000Z" });
    expect(projectPackageDisplayName(exported)).toBe("三年二班蹭饭图");
    // 早期只带日期后缀的导出文件同样认。
    expect(projectPackageDisplayName("三年二班蹭饭图-2026-08-23.json")).toBe("三年二班蹭饭图");
    expect(projectPackageDisplayName("毕业2024-06-30-工程包-2026-08-23.cengfan")).toBe("毕业2024-06-30");
    // 名字本身就是一串日期时不能剥空：没有前导连字符就不算后缀。
    expect(projectPackageDisplayName("2026-01-01.json")).toBe("2026-01-01");
  });
});
