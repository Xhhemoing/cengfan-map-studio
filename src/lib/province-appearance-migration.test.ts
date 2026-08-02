import { describe, expect, it } from "vitest";
import { migrateProjectPayload } from "./project-migration";

describe("project migration province appearance", () => {
  it("restores explicit appearances and map fill controls from a saved project", () => {
    const migrated = migrateProjectPayload({
      schemaVersion: 2,
      map: {
        x: 350,
        y: 120,
        width: 800,
        height: 690,
        scale: 1,
        landColor: "#e6ebea",
        activeColor: "#215d75",
        edgeColor: "#c4cbd1",
        showProvinceLabels: true,
        fillMode: "manual",
        emptyProvinceFill: "transparent",
        provinceStyles: {
          浙江省: {
            appearance: {
              kind: "texture",
              assetId: "asset-zhejiang",
              src: "data:image/png;base64,zhejiang",
              fit: "contain",
            },
          },
          北京市: {
            appearance: { kind: "manual-color", color: "#cc5544" },
          },
        },
      },
    });

    expect(migrated.map.fillMode).toBe("manual");
    expect(migrated.map.emptyProvinceFill).toBe("transparent");
    expect(migrated.map.provinceStyles?.浙江省).toEqual({
      appearance: {
        kind: "texture",
        assetId: "asset-zhejiang",
        src: "data:image/png;base64,zhejiang",
        fit: "contain",
        sizingMode: "province",
      },
    });
    expect(migrated.map.provinceStyles?.北京市).toEqual({
      appearance: { kind: "manual-color", color: "#cc5544" },
    });
  });

  it("restores texture scale and overflow flags", () => {
    const migrated = migrateProjectPayload({
      schemaVersion: 2,
      map: {
        provinceStyles: {
          浙江省: {
            appearance: {
              kind: "texture",
              assetId: "asset-zhejiang",
              src: "data:image/png;base64,zhejiang",
              fit: "cover",
              scale: 1.5,
              overflow: true,
            },
          },
        },
      },
    });

    expect(migrated.map.provinceStyles?.浙江省).toEqual({
      appearance: {
        kind: "texture",
        assetId: "asset-zhejiang",
        src: "data:image/png;base64,zhejiang",
        fit: "cover",
        scale: 1.5,
        overflow: true,
        sizingMode: "province",
      },
    });
  });

  it("keeps legacy fill and texture source values compatible with the new appearance model", () => {
    const migrated = migrateProjectPayload({
      schemaVersion: 2,
      map: {
        x: 350,
        y: 120,
        width: 800,
        height: 690,
        scale: 1,
        provinceStyles: {
          浙江省: { textureSrc: "data:image/png;base64,legacy" },
          北京市: { fill: "#225588" },
        },
      },
    });

    expect(migrated.map.provinceStyles?.浙江省).toEqual({ textureSrc: "data:image/png;base64,legacy" });
    expect(migrated.map.provinceStyles?.北京市).toEqual({ fill: "#225588" });
  });
});
