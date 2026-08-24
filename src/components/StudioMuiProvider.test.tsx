import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it } from "vitest";
import { StudioMuiProvider } from "./StudioMuiProvider";
import { CompactButton } from "./StudioUi";

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

function createTrackedRoot(container: HTMLElement): Root {
  const root = createRoot(container);
  mounted.push({ root, container });
  return root;
}

// An assertion throwing before an inline unmount leaves the root mounted for the rest of
// the run, so React's scheduler can wake up against a torn-down jsdom.
afterEach(() => {
  flushSync(() => {
    for (const { root, container } of mounted.splice(0)) {
      root.unmount();
      container.remove();
    }
  });
});

describe("StudioMuiProvider", () => {
  it("preserves shared compact-button density under the provider", () => {
    const container = document.createElement("div");
    const root = createTrackedRoot(container);

    flushSync(() =>
      root.render(
        <StudioMuiProvider>
          <CompactButton variant="secondary">导出工程</CompactButton>
        </StudioMuiProvider>,
      ),
    );

    const button = container.querySelector<HTMLElement>(".compact-button");
    expect(button).not.toBeNull();
    expect(button?.getAttribute("data-studio-density")).toBe("compact");
  });
});
