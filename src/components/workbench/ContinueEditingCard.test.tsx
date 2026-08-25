import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { ContinueEditingCard } from "./ContinueEditingCard";
import type { LocalWorkspaceEntry } from "../../lib/local-workspace-entry";
import { createProjectDocument } from "../../lib/project-document";
import { createProjectPackage } from "../../lib/project-package";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function makeEntry(): LocalWorkspaceEntry {
  return {
    source: "mirror",
    pack: createProjectPackage({
      project: createProjectDocument({ students: [], templateId: "original", dataView: "province" }),
      assets: [],
      fonts: [],
      customTemplates: [],
      renderSettings: { mode: "normal", fixedFps: 20 },
      now: new Date("2026-08-13T00:00:00.000Z"),
    }),
  };
}

function renderCard() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const onResume = vi.fn();
  flushSync(() => root.render(<ContinueEditingCard entry={makeEntry()} onResume={onResume} />));
  return { container, onResume };
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  vi.restoreAllMocks();
});

describe("ContinueEditingCard", () => {
  it("keeps the button's single accessible name", () => {
    const { container } = renderCard();
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="继续编辑本地内容"]');
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain("继续编辑本地内容");
  });

  it("pins aria-hidden on the History icon svg itself, inside the hidden span", () => {
    const { container } = renderCard();
    const span = container.querySelector(".workbench-resume-icon");
    expect(span?.getAttribute("aria-hidden")).toBe("true");
    const icon = container.querySelector(".workbench-resume-icon svg");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });

  it("calls onResume when the card is clicked", () => {
    const { container, onResume } = renderCard();
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="继续编辑本地内容"]')!;
    flushSync(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onResume).toHaveBeenCalledTimes(1);
  });
});
