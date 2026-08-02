import { describe, expect, it, vi } from "vitest";
import { createProjectDocument, applyTransaction } from "./project-document";
import { createProvinceThemeTransaction, createSceneTransaction } from "./inspector-operations";

describe("createSceneTransaction", () => {
  it("keeps canonical and compatibility background image state synchronized", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const withBackground = applyTransaction(
      project,
      createSceneTransaction(
        { type: "canvas" },
        { backgroundImageSrc: "data:image/png;base64,background" },
      ),
    );
    expect(withBackground.canvas.backgroundImageSrc).toBe("data:image/png;base64,background");
    expect(withBackground.style.backgroundImageSrc).toBe("data:image/png;base64,background");

    const cleared = applyTransaction(
      withBackground,
      createSceneTransaction({ type: "canvas" }, { backgroundImageSrc: undefined }),
    );
    expect(cleared.canvas.backgroundImageSrc).toBeUndefined();
    expect(cleared.style.backgroundImageSrc).toBeUndefined();
  });

  it("applies province texture appearance without crypto.randomUUID", () => {
    const originalCrypto = globalThis.crypto;
    vi.stubGlobal("crypto", { ...globalThis.crypto, randomUUID: undefined });
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const next = applyTransaction(
      project,
      createSceneTransaction(
        { type: "province", province: "浙江省" },
        {
          appearance: {
            kind: "texture",
            assetId: "asset-1",
            src: "data:image/png;base64,abc",
            fit: "cover",
          },
        },
      ),
    );
    expect(next.map.provinceStyles?.["浙江省"]?.appearance).toEqual({
      kind: "texture",
      assetId: "asset-1",
      src: "data:image/png;base64,abc",
      fit: "cover",
    });
    vi.stubGlobal("crypto", originalCrypto);
  });
});

describe("createProvinceThemeTransaction", () => {
  it("applies inferred fills as one undoable change while preserving textures and manual colors", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.map.provinceStyles = {
      北京市: {
        appearance: { kind: "texture", assetId: "beijing", src: "beijing.png", fit: "contain", offsetX: 12 },
      },
      上海市: { appearance: { kind: "manual-color", color: "#112233" } },
    };

    const next = applyTransaction(project, createProvinceThemeTransaction({
      北京市: { backgroundColor: "#f4dfdc" },
      上海市: { backgroundColor: "#dce8f4" },
    }));

    expect(next.map.provinceStyles?.北京市).toMatchObject({
      fill: "#f4dfdc",
      appearance: { kind: "texture", assetId: "beijing", offsetX: 12 },
    });
    expect(next.map.provinceStyles?.上海市?.appearance).toEqual({ kind: "manual-color", color: "#112233" });
    expect(next.map.provinceStyles?.上海市?.fill).toBeUndefined();
    expect(next.history.past).toHaveLength(1);
    expect(next.history.past[0]?.label).toBe("一键匹配 2 个省份底色");
  });
});
