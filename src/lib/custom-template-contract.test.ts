import { describe, expect, it } from "vitest";
import { createProjectDocument } from "./project-document";
import { applyCustomTemplateToProject, createCustomTemplateFromProject } from "./template-store";

const makeProject = () => createProjectDocument({ students: [], templateId: "original", dataView: "province" });

describe("custom visual template contract", () => {
  it("applies appearance without replacing current geometry, content or object identity", () => {
    const source = makeProject();
    source.canvas.width = 2800;
    source.canvas.backgroundColor = "#fedcba";
    source.map.x = 410;
    source.map.scale = 1.6;
    source.map.landColor = "#ccaaee";
    source.cards = { ...source.cards, grouping: "city", maxWidth: 310, x: 900, layoutMode: "radial", positions: { old: { x: 100, y: 200 } }, visibleFields: ["city"], background: "#ccddff" };
    source.textElements[0] = { ...source.textElements[0]!, content: "去年的标题", x: 999, color: "#112299" };
    source.guests.people = [{ id: "old-guest", name: "旧嘉宾", visibility: true }];
    const custom = createCustomTemplateFromProject({ name: "只用外观", baseTemplateId: "original", scope: "visual", overrides: {}, scene: source, students: [] });
    const current = makeProject();
    current.cards = {
      ...current.cards, grouping: "university", positions: { current: { x: 690, y: 400 } }, visibleFields: ["name"], layoutMode: "grid", allowMapOverlap: false,
      positionPolicies: { "university:测试大学": "locked" }, positionSources: { "university:测试大学": "manual" },
      styleOverrides: { "university:测试大学": { background: "#008800" } },
      fieldFonts: { name: "current-font" }, fieldTypography: { name: { fontSize: 25, color: "#220022" } },
    };
    current.students = [{ id: "current", name: "当前学生", university: "测试大学", city: "北京市", visibility: true }];
    current.textElements[0] = { ...current.textElements[0]!, id: "current-title", content: "今年的标题", x: 120 };
    current.guests.people = [{ id: "current-guest", name: "当前嘉宾", visibility: true }];

    const result = applyCustomTemplateToProject(current, custom);

    expect(result.canvas.backgroundColor).toBe(source.canvas.backgroundColor);
    expect(result.map.landColor).toBe(source.map.landColor);
    expect(result.cards.background).toBe(source.cards.background);
    expect(result.canvas.width).toBe(current.canvas.width);
    expect(result.map.x).toBe(current.map.x);
    expect(result.map.scale).toBe(current.map.scale);
    for (const key of ["grouping", "x", "maxWidth", "positions", "layoutMode", "allowMapOverlap", "visibleFields", "positionPolicies", "positionSources", "styleOverrides", "fieldFonts", "fieldTypography"] as const) expect(result.cards[key], key).toEqual(current.cards[key]);
    expect(result.students).toEqual(current.students);
    expect(result.guests.people).toEqual(current.guests.people);
    expect(result.textElements[0]).toMatchObject({ id: "current-title", content: "今年的标题", x: 120, color: "#112299" });
    expect(result.assetElements).toEqual(current.assetElements);
    expect(result.dataView).toBe(current.dataView);
    expect(result.style.mapScale).toBe(current.map.scale);
    expect(result.style.visibleFields).toEqual(current.cards.visibleFields);
  });

  it("preserves the current map source, province visibility and texture placement", () => {
    const source = makeProject();
    source.map.renderSource = { kind: "image", assetId: "old-map", src: "old-map.svg", fit: "contain", opacity: 1 };
    source.map.provinceStyles = {
      北京市: { visible: true, appearance: { kind: "texture", assetId: "paint", src: "paint.svg", fit: "cover", offsetX: 999, customWidth: 800, sizingMode: "custom" } },
    };
    const custom = createCustomTemplateFromProject({ name: "省份配色", baseTemplateId: "original", scope: "visual", overrides: {}, scene: source, students: [] });
    const current = makeProject();
    current.map.provinceStyles = {
      北京市: { visible: false, appearance: { kind: "texture", assetId: "current", src: "current.svg", fit: "contain", offsetX: 12, offsetY: 30, customWidth: 110, sizingMode: "custom" } },
    };

    const result = applyCustomTemplateToProject(current, custom);

    expect(result.map.renderSource).toEqual(current.map.renderSource);
    expect(result.map.provinceStyles?.北京市).toMatchObject({ visible: false, appearance: { src: "paint.svg", offsetX: 12, offsetY: 30, customWidth: 110, sizingMode: "custom" } });
    result.map.provinceStyles!.北京市!.appearance = { kind: "manual-color", color: "#000000" };
    expect(current.map.provinceStyles.北京市?.appearance?.kind).toBe("texture");
    expect(custom.scene?.map.provinceStyles?.北京市?.appearance?.kind).toBe("texture");
  });

  it("applies layout scope explicitly and keeps the province data view in sync", () => {
    const source = makeProject();
    source.cards.positions = { 北京市: { x: 200, y: 300 } };
    const custom = createCustomTemplateFromProject({ name: "完整排版", baseTemplateId: "original", scope: "layout", overrides: {}, scene: source, students: [] });
    const current = makeProject();
    current.dataView = "university";
    current.cards.grouping = "university";
    const result = applyCustomTemplateToProject(current, custom);
    expect(result.cards).toEqual(custom.scene?.cards);
    expect(result.dataView).toBe("province");
    result.cards.positions!.北京市!.x = 400;
    expect(custom.scene?.cards.positions?.北京市?.x).toBe(200);
  });
});
