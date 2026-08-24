import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { AssetPanelLibrary } from "./asset-panel-library";
import type { UserAsset } from "../lib/assets";

const libraryTexture: UserAsset = {
  id: "user-texture-1",
  label: "浙江贴图",
  kind: "province-texture",
  src: "data:image/png;base64,texture",
  provinceIds: ["浙江省"],
  source: "user",
};

const decorationAsset: UserAsset = {
  id: "user-decoration-1",
  label: "校门插画",
  kind: "decoration",
  src: "data:image/png;base64,decoration",
  provinceIds: [],
  source: "user",
};

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

type PanelProps = ComponentProps<typeof AssetPanelLibrary>;

function renderPanel(overrides: Partial<PanelProps> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const props: PanelProps = {
    libraryTextures: [libraryTexture],
    userGlobalAssets: [decorationAsset],
    assetUsageById: {},
    processing: false,
    onApplyBackground: vi.fn(),
    onApplyMatting: vi.fn(),
    onDeleteUserAsset: vi.fn(),
    onInferThemes: vi.fn(async () => {}),
    onNotice: vi.fn(),
    ...overrides,
  };
  flushSync(() => root.render(<AssetPanelLibrary {...props} />));
  return { container };
}

function expectDecorativeSvg(button: Element) {
  const svg = button.querySelector("svg");
  expect(svg).not.toBeNull();
  expect(svg?.getAttribute("aria-hidden")).toBe("true");
}

describe("AssetPanelLibrary", () => {
  it("keeps delete button names while hiding the trash icons from AT", () => {
    const { container } = renderPanel();

    const textureDelete = container.querySelector('button[aria-label="删除素材 浙江贴图"]');
    expect(textureDelete).not.toBeNull();
    expectDecorativeSvg(textureDelete!);

    const assetDelete = container.querySelector('button[aria-label="删除素材 校门插画"]');
    expect(assetDelete).not.toBeNull();
    expectDecorativeSvg(assetDelete!);
  });

  it("hides the scissors icon of the matting button while keeping its name", () => {
    const { container } = renderPanel();

    // 抠图按钮只对未抠图、非 SVG 的装饰素材显示。
    const matting = container.querySelector('button[aria-label="自动抠图 校门插画"]');
    expect(matting).not.toBeNull();
    expectDecorativeSvg(matting!);
  });

  it("does not show the matting button once matting has been applied", () => {
    const { container } = renderPanel({
      userGlobalAssets: [{ ...decorationAsset, mattingApplied: true }],
    });

    expect(container.querySelector('button[aria-label="自动抠图 校门插画"]')).toBeNull();
    expect(container.querySelector('button[aria-label="删除素材 校门插画"]')).not.toBeNull();
  });
});
