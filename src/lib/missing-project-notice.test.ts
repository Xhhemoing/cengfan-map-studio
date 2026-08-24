import { describe, expect, it } from "vitest";
import { resolveMissingProjectNotice } from "./missing-project-notice";

describe("resolveMissingProjectNotice", () => {
  it("claims deletion only when the whole read ran on the persistent store", () => {
    const notice = resolveMissingProjectNotice({
      reason: "not-found",
      healthAtRequest: "persistent",
      health: "persistent",
    });

    expect(notice.kind).toBe("deleted");
    expect(notice.title).toBe("项目不存在或已删除");
  });

  it("never claims deletion while the store is degraded", () => {
    const notice = resolveMissingProjectNotice({
      reason: "not-found",
      healthAtRequest: "memory",
      health: "memory",
    });

    expect(notice.kind).toBe("unconfirmed");
    expect(notice.title).not.toContain("已删除");
    expect(notice.detail).not.toContain("已删除");
    expect(notice.detail).toContain("本机数据库已降级");
    expect(notice.detail).toContain("无法确认");
  });

  it("says the database dropped mid-read when it degraded after the request started", () => {
    const notice = resolveMissingProjectNotice({
      reason: "not-found",
      healthAtRequest: "persistent",
      health: "memory",
    });

    expect(notice.kind).toBe("unconfirmed");
    expect(notice.detail).toContain("读取途中");
    expect(notice.detail).toContain("请不要清理浏览器数据");
  });

  it("does not treat a copy read out of the memory fallback as disk truth after recovery", () => {
    const notice = resolveMissingProjectNotice({
      reason: "not-found",
      healthAtRequest: "memory",
      health: "persistent",
    });

    expect(notice.kind).toBe("unconfirmed");
  });

  it("reports a failed read as unreadable rather than deleted", () => {
    for (const health of ["persistent", "memory"] as const) {
      const notice = resolveMissingProjectNotice({ reason: "read-failed", healthAtRequest: health, health });

      expect(notice.kind).toBe("unconfirmed");
      expect(notice.title).toBe("无法读取这个项目");
      expect(notice.detail).toContain("无法确认");
      expect(notice.detail).toContain("这不等于它已经被删除");
    }
  });
});
