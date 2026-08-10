import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { describe, expect, it } from "vitest";
import { StudioMuiProvider } from "./StudioMuiProvider";
import { CompactButton } from "./StudioUi";

describe("StudioMuiProvider", () => {
  it("renders compact MUI buttons with studio density under the provider", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    flushSync(() =>
      root.render(
        <StudioMuiProvider>
          <CompactButton variant="secondary">导出工程</CompactButton>
        </StudioMuiProvider>,
      ),
    );

    const button = container.querySelector<HTMLElement>(".MuiButton-root");
    expect(button).not.toBeNull();
    expect(button?.getAttribute("data-studio-density")).toBe("compact");

    flushSync(() => root.unmount());
  });
});
