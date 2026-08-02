import { describe, expect, it } from "vitest";
import {
  createSystemTemplate,
  mergeTemplateDocuments,
  type TemplateDocument,
} from "./template-document";

describe("template document", () => {
  it("creates a complete system template with default layers", () => {
    const template = createSystemTemplate("scenery");

    expect(template.id).toBe("scenery");
    expect(template.canvas).toMatchObject({ width: 1500, height: 1000 });
    expect(template.background.type).toBe("color");
    expect(template.map.scale).toBe(1);
    expect(template.cards.preset).toBe("standard");
    expect(template.cards.grouping).toBe("province");
    expect(template.markers.style).toBe("pin");
    expect(template.visibleFields).toEqual(["name", "university", "city"]);
  });

  it("merges project overrides on top of system template without mutating base", () => {
    const base = createSystemTemplate("original");
    const override: Partial<TemplateDocument> = {
      background: {
        ...base.background,
        color: "#edf3e9",
        opacity: 0.92,
      },
      map: {
        ...base.map,
        scale: 1.12,
      },
      cards: {
        ...base.cards,
        grouping: "city",
        preset: "compact",
      },
      visibleFields: ["name", "university"],
    };

    const merged = mergeTemplateDocuments(base, override);

    expect(merged.background.color).toBe("#edf3e9");
    expect(merged.map.scale).toBe(1.12);
    expect(merged.cards.grouping).toBe("city");
    expect(merged.cards.preset).toBe("compact");
    expect(merged.visibleFields).toEqual(["name", "university"]);
    expect(base.background.color).not.toBe("#edf3e9");
    expect(base.cards.grouping).toBe("province");
  });

  it("keeps regional assets as province-bound optional decorations", () => {
    const template = createSystemTemplate("regional");
    const withAssets = mergeTemplateDocuments(template, {
      regionalAssets: {
        浙江省: [
          {
            id: "asset-zhejiang-1",
            label: "西湖剪影",
            src: "/assets/regional/zhejiang-westlake.svg",
            mode: "overlay",
            opacity: 0.85,
            scale: 1,
          },
        ],
      },
    });

    expect(withAssets.regionalAssets["浙江省"]).toHaveLength(1);
    expect(withAssets.regionalAssets["浙江省"]?.[0]?.mode).toBe("overlay");
    expect(template.regionalAssets).toEqual({});
  });
});
