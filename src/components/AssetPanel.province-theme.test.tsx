import { describe, expect, it, vi } from "vitest";
import { flushSync } from "react-dom";
import { installAssetPanelTestHarness, renderPanel } from "./asset-panel-test-harness";

installAssetPanelTestHarness();

describe("AssetPanel province theme matching", () => {
  it("infers a background for the selected texture", async () => {
    const onApplyProvinceThemes = vi.fn();
    const beijingTexture = {
      appearance: {
        kind: "texture" as const,
        assetId: "texture-beijing",
        src: "data:image/png;base64,beijing",
        fit: "contain" as const,
      },
    };
    const { container } = renderPanel({
      selectedProvince: "北京市",
      selectedProvinceStyle: beijingTexture,
      provinceStyles: { 北京市: beijingTexture },
      onApplyProvinceThemes,
    });

    const button = container.querySelector<HTMLButtonElement>('button[aria-label="智能匹配北京市底色"]');
    expect(button).not.toBeNull();
    flushSync(() => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    await vi.waitFor(() => expect(onApplyProvinceThemes).toHaveBeenCalledWith({
      北京市: expect.objectContaining({ backgroundColor: "#f4dfdc", confidence: 0.9 }),
    }));
    expect(container.textContent).toContain("已智能匹配北京市底色");
  });

  it("matches every textured province in one action without replacing manual-color provinces", async () => {
    const onApplyProvinceThemes = vi.fn();
    const beijingTexture = {
      appearance: { kind: "texture" as const, assetId: "texture-beijing", src: "data:image/png;base64,beijing", fit: "contain" as const },
    };
    const { container } = renderPanel({
      selectedProvince: "北京市",
      selectedProvinceStyle: beijingTexture,
      provinceStyles: {
        北京市: beijingTexture,
        浙江省: { appearance: { kind: "texture", assetId: "texture-zhejiang", src: "data:image/png;base64,zhejiang", fit: "contain" } },
        上海市: { appearance: { kind: "manual-color", color: "#112233" } },
      },
      provinceAdjacency: { 北京市: ["浙江省"], 浙江省: ["北京市"] },
      onApplyProvinceThemes,
    });

    const button = container.querySelector<HTMLButtonElement>('button[aria-label="一键智能匹配所有省份底色"]');
    expect(button?.textContent).toContain("一键匹配全部 2 省");
    flushSync(() => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    await vi.waitFor(() => expect(onApplyProvinceThemes).toHaveBeenCalledWith({
      北京市: expect.objectContaining({ backgroundColor: "#f4dfdc" }),
      浙江省: expect.objectContaining({ backgroundColor: "#dce8f4" }),
    }));
    expect(onApplyProvinceThemes.mock.calls[0]?.[0]).not.toHaveProperty("上海市");
    expect(container.textContent).toContain("已匹配 2 个省份底色");
  });
});
