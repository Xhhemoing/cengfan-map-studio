import { describe, expect, it } from "vitest";
import { MAX_CUSTOM_TEMPLATES, captureCustomTemplate, withCapturedTemplate } from "./template-capture";
import { createProjectDocument } from "./project-document";
import { createSystemTemplate } from "./template-document";
import type { CustomTemplateRecord } from "./template-store";

function project() {
  const document = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  document.map = { ...document.map, scale: 1.5, landColor: "#123456" };
  document.canvas = { ...document.canvas, backgroundColor: "#ffeecc" };
  return document;
}

describe("captureCustomTemplate", () => {
  it("captures the current canvas on top of the built-in template", () => {
    const record = captureCustomTemplate({ name: "  我的版式  ", scope: "visual", project: project() });

    expect(record.name).toBe("我的版式");
    expect(record.scope).toBe("visual");
    expect(record.baseTemplateId).toBe("original");
    expect(record.document.map.landColor).toBe("#123456");
  });

  it("produces a complete template document rather than a sparse patch", () => {
    const base = createSystemTemplate("original");

    const record = captureCustomTemplate({ name: "版式", scope: "layout", project: project() });

    // 覆盖项要叠在内置模板上:直接塞画布状态会丢掉工程没碰过的字段,套用时退回系统默认。
    expect(Object.keys(record.document)).toEqual(expect.arrayContaining(Object.keys(base)));
    expect(Object.keys(record.document.map)).toEqual(expect.arrayContaining(Object.keys(base.map)));
  });
});

describe("withCapturedTemplate", () => {
  it("puts the newest template first and drops the overflow", () => {
    const existing = Array.from({ length: MAX_CUSTOM_TEMPLATES }, (_unused, index) => ({ id: `t${index}` } as CustomTemplateRecord));

    const next = withCapturedTemplate(existing, { id: "fresh" } as CustomTemplateRecord);

    expect(next).toHaveLength(MAX_CUSTOM_TEMPLATES);
    expect(next[0]!.id).toBe("fresh");
    expect(next.at(-1)!.id).toBe(`t${MAX_CUSTOM_TEMPLATES - 2}`);
  });
});
