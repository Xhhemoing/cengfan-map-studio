import { describe, expect, it } from "vitest";
import {
  describeExportSize,
  describeExportSizeWarning,
  estimateExportSize,
  estimateJsonBytes,
  exportSizeBytes,
  isExportOverLimit,
  utf8ByteLength,
} from "./export-size-estimate";
import { MAX_PROJECT_PACKAGE_BYTES } from "./import-file-limits";

/** 造一条 data URL，让它序列化后至少占 `bytes` 字节。 */
function assetOfBytes(id: string, bytes: number) {
  return { id, label: "大图", kind: "decoration", provinceIds: [], src: `data:image/png;base64,${"A".repeat(bytes)}` };
}

describe("export-size-estimate", () => {
  it("counts UTF-8 bytes rather than UTF-16 code units", () => {
    expect(utf8ByteLength("abc")).toBe(3);
    // 汉字 3 字节、带音标的拉丁字母 2 字节、emoji 是一个 4 字节代理对。
    expect(utf8ByteLength("蹭饭")).toBe(6);
    expect(utf8ByteLength("é")).toBe(2);
    expect(utf8ByteLength("🍚")).toBe(4);
    expect(utf8ByteLength("名单🍚ok")).toBe(6 + 4 + 2);
    // 落单的高位代理按替换字符的 3 字节算，不要越界读下一个码元。
    expect(utf8ByteLength("\ud83c")).toBe(3);
  });

  it("measures a serialized value the way the exporters write it", () => {
    const value = { kind: "cengfan-project-package", name: "毕业去向" };
    expect(estimateJsonBytes(value)).toBe(utf8ByteLength(JSON.stringify(value, null, 2)));
    expect(estimateJsonBytes(undefined)).toBe(0);
  });

  it("splits the estimate into a base and a resource half", () => {
    const estimate = estimateExportSize({
      rest: { project: { students: [] } },
      assets: [assetOfBytes("asset-1", 1024)],
      fonts: [{ id: "font-1", src: `data:font/ttf;base64,${"B".repeat(2048)}` }],
    });

    expect(estimate.limitBytes).toBe(MAX_PROJECT_PACKAGE_BYTES);
    expect(estimate.resourceBytes).toBeGreaterThan(3 * 1024);
    expect(estimate.baseBytes).toBeLessThan(200);
    expect(exportSizeBytes(estimate, true)).toBe(estimate.baseBytes + estimate.resourceBytes);
    expect(exportSizeBytes(estimate, false)).toBe(estimate.baseBytes);
  });

  it("flags a package that only fits once the resources are dropped", () => {
    const estimate = estimateExportSize({
      rest: { project: { students: [] } },
      assets: [assetOfBytes("asset-huge", MAX_PROJECT_PACKAGE_BYTES + 1)],
      fonts: [],
    });

    expect(isExportOverLimit(estimate, true)).toBe(true);
    expect(isExportOverLimit(estimate, false)).toBe(false);

    const warning = describeExportSizeWarning(estimate, true);
    expect(warning).toContain("超过导入上限 24.0 MB");
    expect(warning).toContain("以后无法再导入回来");
    expect(warning).toContain("取消勾选「包含资源包」");
    expect(describeExportSizeWarning(estimate, false)).toBeNull();
  });

  it("stops recommending the checkbox when the project alone is over budget", () => {
    const estimate = estimateExportSize({
      rest: { note: "x".repeat(MAX_PROJECT_PACKAGE_BYTES + 1) },
      assets: [assetOfBytes("asset-1", 1024)],
    });

    const warning = describeExportSizeWarning(estimate, true);
    expect(warning).toContain("请先精简名单、模板与素材后再导出");
    expect(warning).not.toContain("取消勾选");
    expect(describeExportSizeWarning(estimate, false)).toContain("请先精简名单、模板与素材后再导出");
  });

  it("describes the resource share only while the checkbox is on", () => {
    const estimate = estimateExportSize({
      rest: { project: {} },
      assets: [assetOfBytes("asset-1", 2 * 1024 * 1024)],
    });

    expect(describeExportSize(estimate, true)).toMatch(/^预计导出约 2\.0 MB（其中资源包约 2\.0 MB）$/);
    expect(describeExportSize(estimate, false)).toMatch(/^预计导出约 \d+ KB$/);
  });

  it("keeps a resource-free workspace out of the parenthetical", () => {
    const estimate = estimateExportSize({ rest: { project: {} }, assets: [], fonts: [] });
    expect(describeExportSize(estimate, true)).not.toContain("其中资源包");
    expect(describeExportSizeWarning(estimate, true)).toBeNull();
  });
});
