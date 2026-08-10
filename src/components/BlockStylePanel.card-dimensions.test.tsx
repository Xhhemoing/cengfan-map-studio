import { useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "../lib/project-document";
import type { CardSettings } from "../lib/scene-document";
import { BlockStylePanel } from "./BlockStylePanel";

function ControlledPanel({ onPatch }: { onPatch: (patch: Partial<CardSettings>) => void }) {
  const [cards, setCards] = useState(() => createProjectDocument({
    students: [],
    templateId: "original",
    dataView: "province",
  }).cards);
  return <BlockStylePanel
    cards={cards}
    onPatch={(patch) => {
      onPatch(patch);
      setCards((current) => ({ ...current, ...patch }));
    }}
  />;
}

describe("BlockStylePanel card dimensions", () => {
  it("offers province textures in data cards as an opt-in setting", () => {
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<ControlledPanel onPatch={onPatch} />));

    const toggle = container.querySelector("#block-card-show-province-texture") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    flushSync(() => toggle.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ showProvinceTexture: true });

    flushSync(() => root.unmount());
  });

  it("commits card width only after the field loses focus", () => {
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<ControlledPanel onPatch={onPatch} />));
    const width = container.querySelector("#block-card-width") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

    width.focus();
    flushSync(() => {
      setter?.call(width, "350");
      width.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onPatch).not.toHaveBeenCalled();
    expect(width.value).toBe("350");
    flushSync(() => width.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onPatch).toHaveBeenLastCalledWith({ maxWidth: 350 });

    width.focus();
    flushSync(() => {
      setter?.call(width, "250");
      width.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onPatch).toHaveBeenCalledTimes(1);
    flushSync(() => width.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onPatch).toHaveBeenLastCalledWith({ maxWidth: 250 });
    expect(width.value).toBe("250");
    expect(container.querySelector("#block-card-bottom-padding")).not.toBeNull();

    flushSync(() => root.unmount());
  });
});
