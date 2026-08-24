import { describe, expect, it } from "vitest";
import { createSystemTemplate } from "./template-document";
import { createDefaultDisplayFrame } from "./display-frame";
import { createProjectDocument } from "./project-document";
import {
  applyCustomTemplateToProject,
  createCustomTemplateFromProject,
  dropOversizedTemplateDocumentImages,
  loadCustomTemplates,
} from "./template-store";
import type { TemplateDocument } from "./template-document";

const CUSTOM_TEMPLATES_KEY = "cengfan-map-studio:custom-templates";

function adapterWith(records: unknown[]) {
  const storage = new Map<string, string>([[CUSTOM_TEMPLATES_KEY, JSON.stringify(records)]]);
  return {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  };
}

describe("template store", () => {
  it("saves visual style without student data", () => {
    const custom = createCustomTemplateFromProject({
      name: "我的山河海报",
      baseTemplateId: "scenery",
      scope: "visual",
      overrides: {
        background: {
          type: "color",
          color: "#edf3e9",
          opacity: 1,
          blur: 0,
          layer: "behind-map",
        },
        map: {
          scale: 1.1,
          offsetX: 0,
          offsetY: 0,
          landColor: "#dfead9",
          activeColor: "#387563",
          edgeColor: "#a9c4b2",
          edgeStyle: "solid",
          edgeWidth: 1,
          showProvinceLabels: false,
          provinceStyles: {},
        },
      },
      students: [
        {
          id: "s1",
          name: "林舟",
          university: "北京大学",
          city: "北京市",
          visibility: true,
        },
      ],
    });

    expect(custom.name).toBe("我的山河海报");
    expect(custom.baseTemplateId).toBe("scenery");
    expect(JSON.stringify(custom)).not.toContain("林舟");
    expect(JSON.stringify(custom)).not.toContain("北京大学");
    expect(custom.document.map.scale).toBe(1.1);
  });

  it("reads previously persisted custom templates from storage", () => {
    const base = createSystemTemplate("q");
    const custom = createCustomTemplateFromProject({
      name: "Q 版班级模板",
      baseTemplateId: "q",
      scope: "layout",
      overrides: {
        cards: {
          ...base.cards,
          preset: "compact",
          grouping: "city",
        },
      },
      students: [],
    });

    expect(loadCustomTemplates(adapterWith([custom]))).toEqual([custom]);
  });

  it("loads legacy template records without importing student data", () => {
    const storage = new Map<string, string>([
      [
        "cengfan-map-studio:custom-templates",
        JSON.stringify([{
          id: "custom-legacy",
          name: "旧模板",
          baseTemplateId: "original",
          scope: "visual",
          document: createSystemTemplate("original"),
          students: [{ id: "should-not-load", name: "不应出现" }],
          createdAt: "2026-07-24T00:00:00.000Z",
        }]),
      ],
    ]);
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };

    const loaded = loadCustomTemplates(adapter);

    expect(loaded).toHaveLength(1);
    expect(loaded[0]).not.toHaveProperty("students");
    expect(JSON.stringify(loaded)).not.toContain("不应出现");
  });

  it("drops legacy student data when loading templates", () => {
    const custom = createCustomTemplateFromProject({
      name: "可复用模板",
      baseTemplateId: "original",
      scope: "layout",
      overrides: {},
      students: [],
    });
    const legacyRecord = {
      ...custom,
      students: [{ id: "student-1", name: "不应保存" }],
      document: {
        ...custom.document,
        students: [{ id: "student-2", name: "嵌套人员" }],
      },
    } as unknown as typeof custom;

    const loaded = loadCustomTemplates(adapterWith([legacyRecord]));

    expect(JSON.stringify(loaded)).not.toContain("不应保存");
    expect(JSON.stringify(loaded)).not.toContain("嵌套人员");
    expect(loaded[0]?.document).toEqual(custom.document);
  });

  it("captures canonical scene elements without students", () => {
    const custom = createCustomTemplateFromProject({
      name: "含场景素材的模板",
      baseTemplateId: "original",
      scope: "visual",
      overrides: {},
      scene: {
        canvas: { width: 1800, height: 1200, safeMargin: 48, backgroundColor: "#ffffff", backgroundFit: "contain", backgroundOpacity: 0.8 },
        map: { x: 400, y: 140, width: 900, height: 760, scale: 1.2, landColor: "#eeeeee", activeColor: "#123456", edgeColor: "#789abc", edgeStyle: "solid", edgeWidth: 1, showProvinceLabels: true, provinceStyles: {} },
        cards: { preset: "compact", grouping: "city", x: 1180, y: 160, maxWidth: 280, padding: 14, gap: 18, columns: "auto", background: "#ffffff", opacity: 1, textColor: "#112233", fontSize: 12, connectorStyle: "curve", connectorColor: "#123456", connectorWidth: 1.5, connectorDash: "dashed", visibleFields: ["name"] },
        guests: {
          title: "特邀嘉宾 · 老师名单",
          x: 48,
          y: 980,
          width: 280,
          padding: 14,
          background: "#ffffff",
          opacity: 0.92,
          textColor: "#1c3154",
          fontSize: 13,
          visibility: true,
          people: [],
        },
        textElements: [{ id: "text-title", role: "title", content: "新标题", x: 80, y: 120, fontSize: 44, color: "#112233", fontWeight: 700, textAlign: "left", maxWidth: 600, visibility: true }],
        assetElements: [{ id: "asset-1", assetId: "source-1", label: "地标", src: "data:image/svg+xml,%3Csvg/%3E", kind: "landmark", province: "北京市", x: 200, y: 240, width: 80, height: 80, rotation: 0, opacity: 1, zIndex: 1, visibility: true }],
      },
      students: [{ id: "student-1", name: "不应保存", university: "北京大学", city: "北京市", visibility: true }],
    });

    expect(custom.document.canvas.width).toBe(1800);
    expect(custom.document.map.scale).toBe(1.2);
    expect(custom.document.cards.preset).toBe("standard");
    expect(custom.scene?.cards.compactLayout).toBe(true);
    expect(JSON.stringify(custom)).not.toContain("不应保存");
  });

  it("applies the saved scene without replacing current students", () => {
    const custom = createCustomTemplateFromProject({
      name: "可应用场景",
      baseTemplateId: "scenery",
      scope: "visual",
      overrides: {},
      scene: {
        ...createProjectDocument({ students: [], templateId: "scenery", dataView: "province" }),
      },
      students: [],
    });
    const project = createProjectDocument({
      students: [{ id: "current", name: "当前学生", university: "浙江大学", city: "杭州市", visibility: true }],
      templateId: "original",
      dataView: "province",
    });

    const next = applyCustomTemplateToProject(project, custom);

    expect(next.students).toEqual(project.students);
    expect(next.templateId).toBe("scenery");
    expect(next.canvas).toEqual(custom.scene?.canvas);
    expect(next.map).toEqual(custom.scene?.map);
    expect(next.cards).toEqual(custom.scene?.cards);
    expect(next.textElements).toEqual(custom.scene?.textElements);
    expect(next.assetElements).toEqual(custom.scene?.assetElements);
  });

  it("preserves an uploaded image map when saving and applying an overall template", () => {
    const scene = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    scene.map.renderSource = {
      kind: "image",
      assetId: "map-image-1",
      src: "[screenshot]-map",
      fit: "contain",
      opacity: 0.75,
      composition: "replace",
      clipToMap: false,
      zIndex: 25,
    };
    const custom = createCustomTemplateFromProject({
      name: "图片地图模板",
      baseTemplateId: "original",
      scope: "visual",
      overrides: {},
      scene,
      students: [],
    });
    const project = createProjectDocument({ students: [], templateId: "q", dataView: "province" });

    const next = applyCustomTemplateToProject(project, custom);

    expect(next.map.renderSource).toEqual(scene.map.renderSource);
  });

  it("preserves display frame variants when loading and applying a scene template", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const frame = createDefaultDisplayFrame();
    frame.mode = "flow";
    project.cards = {
      ...project.cards,
      positions: { 浙江省: { x: 640, y: 280 } },
      displayFrame: frame,
    };
    const custom = createCustomTemplateFromProject({
      name: "展示框模板",
      baseTemplateId: "original",
      scope: "layout",
      overrides: {},
      scene: project,
      students: [],
    });
    const loaded = loadCustomTemplates(adapterWith([custom]));
    const applied = applyCustomTemplateToProject(createProjectDocument({ students: [], templateId: "q", dataView: "province" }), loaded[0]!);

    expect(loaded[0]?.scene?.cards.displayFrame?.mode).toBe("flow");
    expect(applied.cards.displayFrame?.mode).toBe("flow");
    expect(applied.cards.positions).toEqual({ 浙江省: { x: 640, y: 280 } });
  });

  it("drops only the template document images that break the caller's byte budget", () => {
    const huge = "data:image/png;base64,HUGE";
    const small = "data:image/png;base64,AA==";
    const document = createSystemTemplate("original");
    document.background = { ...document.background, type: "image", imageSrc: huge };
    document.map = {
      ...document.map,
      provinceStyles: {
        浙江省: { textureSrc: huge },
        北京市: { textureSrc: small, appearance: { kind: "texture", assetId: "asset-1", src: huge, fit: "contain" } },
        上海市: { appearance: { kind: "manual-color", color: "#123456" } },
      } as TemplateDocument["map"]["provinceStyles"],
    };
    document.regionalAssets = {
      浙江省: [
        { id: "regional-huge", label: "巨幅地域图", src: huge, mode: "overlay", opacity: 1, scale: 1 },
        { id: "regional-small", label: "地域图", src: small, mode: "overlay", opacity: 1, scale: 1 },
      ],
    };

    const result = dropOversizedTemplateDocumentImages(document, (src) => src === huge);

    expect(result.dropped).toBe(4);
    expect(result.document.background.imageSrc).toBeUndefined();
    expect(result.document.background.type).toBe("color");
    expect(result.document.map.provinceStyles?.浙江省?.textureSrc).toBeUndefined();
    expect(result.document.map.provinceStyles?.北京市?.textureSrc).toBe(small);
    expect(result.document.map.provinceStyles?.北京市).not.toHaveProperty("appearance");
    expect(result.document.map.provinceStyles?.上海市).toHaveProperty("appearance");
    expect(result.document.regionalAssets.浙江省?.map((regional) => regional.id)).toEqual(["regional-small"]);
    expect(JSON.stringify(result.document)).not.toContain(huge);
  });

  it("returns the same template document when every image fits the budget", () => {
    const document = createSystemTemplate("original");
    document.background = { ...document.background, type: "image", imageSrc: "data:image/png;base64,AA==" };

    const result = dropOversizedTemplateDocumentImages(document, () => false);

    expect(result.dropped).toBe(0);
    expect(result.document).toBe(document);
  });

  it("maps legacy custom templates into canonical visual fields when applying", () => {
    const custom = createCustomTemplateFromProject({
      name: "旧格式模板",
      baseTemplateId: "scenery",
      scope: "visual",
      overrides: {
        background: {
          type: "color",
          color: "#123456",
          opacity: 1,
          blur: 0,
          layer: "behind-map",
        },
        map: {
          scale: 1.25,
          offsetX: 12,
          offsetY: 24,
          landColor: "#eeeeee",
          activeColor: "#345678",
          edgeColor: "#789abc",
          edgeStyle: "solid",
          edgeWidth: 1,
          showProvinceLabels: false,
          provinceStyles: {},
        },
        cards: {
          ...createSystemTemplate("scenery").cards,
          preset: "compact",
        },
        visibleFields: ["name"],
      },
      students: [],
    });
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });

    const next = applyCustomTemplateToProject(project, custom);

    expect(next.canvas.backgroundColor).toBe("#123456");
    expect(next.map).toMatchObject({ scale: 1.25, x: 12, y: 24, landColor: "#eeeeee", activeColor: "#345678", edgeColor: "#789abc", showProvinceLabels: false });
    expect(next.cards.preset).toBe("compact");
    expect(next.cards.visibleFields).toEqual(["name"]);
  });
});
