// 仅供 AssetPanel 测试使用的共享装置：从 src/components/AssetPanel.test.tsx 原样搬出的
// 模块替身、挂载登记与 renderPanel 助手，供按域拆分后的
// src/components/AssetPanel.*.test.tsx 共用。
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, vi } from "vitest";
import { AssetPanel } from "./AssetPanel";

vi.mock("../lib/background-removal", () => ({
  removeBackground: vi.fn(async (src: string) => src),
}));

vi.mock("../lib/image-color", () => ({
  extractImageColor: vi.fn(async () => "#d05a45"),
  extractImageTheme: vi.fn(async (src: string) => ({
    primaryColor: "#c74433",
    identityColor: "#c74433",
    supportingColor: "#3470a8",
    backgroundColor: src.includes("beijing") ? "#f4dfdc" : "#dce8f4",
    outlineColor: "#765b58",
    haloColor: "#fff9ed",
    confidence: src.includes("beijing") ? 0.9 : 0.6,
    diagnostics: {},
  })),
  optimizeNeighborThemeColors: vi.fn((themes: unknown) => themes),
}));

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

/**
 * Registers the file-level teardown every AssetPanel suite depends on.
 *
 * An assertion throwing before an inline unmount leaves the root mounted for the rest of
 * the run, so React's scheduler can wake up against a torn-down jsdom. The `setupFiles`
 * leaked-root guard reports a missing net, it does not stand in for one.
 */
export function installAssetPanelTestHarness(): void {
  afterEach(() => {
    flushSync(() => {
      for (const { root, container } of mounted.splice(0)) {
        root.unmount();
        container.remove();
      }
    });
  });
}

export function renderPanel(overrides: Partial<React.ComponentProps<typeof AssetPanel>> = {}) {
  const container = document.createElement("div");
  const root = createRoot(container);
  mounted.push({ root, container });
  const props = {
    onApplyBackground: vi.fn(),
    onCreateLandmark: vi.fn(),
    onCreateDecoration: vi.fn(),
    provinces: ["北京市", "浙江省"],
    userAssets: [],
    ...overrides,
  };
  flushSync(() => root.render(<AssetPanel {...props} />));
  return { container, props };
}
