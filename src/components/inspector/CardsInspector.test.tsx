import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { createProjectDocument } from "../../lib/project-document";
import { CardsInspector } from "./CardsInspector";

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("CardsInspector", () => {
  it("adjusts the cards layer with a z-index input and quick buttons", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, zIndex: 12 };
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<CardsInspector cards={project.cards} onPatch={onPatch} onReset={vi.fn()} />));

    const input = container.querySelector("#cards-zindex") as HTMLInputElement;
    expect(input.value).toBe("12");
    input.focus();
    flushSync(() => setInputValue(input, "30"));
    expect(onPatch).not.toHaveBeenCalled();
    flushSync(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ zIndex: 30 });

    onPatch.mockClear();
    expect(Array.from(container.querySelectorAll(".inspector-actions button")).map((button) => button.textContent))
      .toEqual(["上移", "下移", "置顶", "置底"]);
    flushSync(() => (container.querySelector("button[aria-label='数据框下移']") as HTMLButtonElement).dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ zIndex: 11 });
    flushSync(() => (container.querySelector("button[aria-label='数据框置底']") as HTMLButtonElement).dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ zIndex: -100 });

    flushSync(() => root.unmount());
  });

  it("offers compact layout independently from visual presets", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<CardsInspector cards={project.cards} onPatch={onPatch} onReset={vi.fn()} />));

    const presets = container.querySelector("#cards-preset") as HTMLSelectElement;
    expect(Array.from(presets.options).map((option) => option.value)).toEqual(["standard", "ticket", "photo", "borderless"]);
    const compact = container.querySelector("#cards-compact-layout") as HTMLInputElement;
    expect(compact.checked).toBe(false);
    flushSync(() => compact.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ compactLayout: true });

    const showCount = container.querySelector("#cards-show-count") as HTMLInputElement;
    expect(showCount.checked).toBe(true);
    flushSync(() => showCount.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ showCount: false });

    flushSync(() => root.unmount());
  });

  it("switches layout modes and limits auto balance to quadrant mode", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<CardsInspector cards={project.cards} onPatch={onPatch} onReset={vi.fn()} />));

    const mode = container.querySelector("#cards-layout-mode") as HTMLSelectElement;
    const balance = container.querySelector("#cards-auto-balance") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    expect(Array.from(mode.options).map((option) => option.value)).toEqual([
      "quadrant",
      "radial",
      "right-stack",
      "grid",
    ]);
    expect(balance.disabled).toBe(false);

    flushSync(() => {
      setter?.call(mode, "radial");
      mode.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onPatch).toHaveBeenCalledWith({ layoutMode: "radial" });

    flushSync(() => root.render(
      <CardsInspector cards={{ ...project.cards, layoutMode: "radial" }} onPatch={onPatch} onReset={vi.fn()} />,
    ));
    expect((container.querySelector("#cards-auto-balance") as HTMLInputElement).disabled).toBe(true);

    flushSync(() => root.unmount());
  });

  it("offers an explicit switch for allowing cards over the map", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<CardsInspector cards={project.cards} onPatch={onPatch} onReset={vi.fn()} />));

    const toggle = container.querySelector("#cards-allow-map-overlap") as HTMLInputElement;
    expect(toggle).not.toBeNull();
    expect(toggle.checked).toBe(false);
    flushSync(() => toggle.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ allowMapOverlap: true });

    flushSync(() => root.unmount());
  });

  it("offers an opt-in switch for province textures in data cards", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<CardsInspector cards={project.cards} onPatch={onPatch} onReset={vi.fn()} />));

    const toggle = container.querySelector("#cards-show-province-texture") as HTMLInputElement;
    expect(toggle).not.toBeNull();
    expect(toggle.checked).toBe(false);
    flushSync(() => toggle.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ showProvinceTexture: true });

    flushSync(() => root.unmount());
  });

  it("defers numeric card edits until blur", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<CardsInspector cards={project.cards} onPatch={onPatch} onReset={vi.fn()} />));

    expect(container.querySelector('label[for="cards-maxWidth"]')?.textContent).toContain("卡片宽度");
    const whitespace = container.querySelector("#cards-horizontal-padding") as HTMLInputElement;
    expect(whitespace).not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    flushSync(() => {
      setter?.call(whitespace, "24");
      whitespace.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onPatch).not.toHaveBeenCalled();
    flushSync(() => whitespace.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ horizontalPadding: 24 });
    expect(container.querySelector("#cards-bottom-padding")).not.toBeNull();

    flushSync(() => root.unmount());
  });

  it("exposes city subsections only for province-grouped cards", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<CardsInspector cards={project.cards} onPatch={onPatch} onReset={vi.fn()} />));

    const toggle = container.querySelector("#cards-city-subgroups") as HTMLInputElement;
    expect(toggle).not.toBeNull();
    expect(toggle.checked).toBe(true);
    flushSync(() => toggle.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ citySubgroups: false });

    flushSync(() => root.render(<CardsInspector cards={{ ...project.cards, grouping: "city" }} onPatch={onPatch} onReset={vi.fn()} />));
    expect((container.querySelector("#cards-city-subgroups") as HTMLInputElement).disabled).toBe(true);
    flushSync(() => root.unmount());
  });

  it("keeps expression and name presentation settings out of the compact inspector", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<CardsInspector cards={project.cards} onPatch={vi.fn()} onReset={vi.fn()} />));

    expect(container.querySelector(".cards-expressions")).toBeNull();
    expect(container.querySelector(".cards-name-format")).toBeNull();

    flushSync(() => root.unmount());
  });


  it("exposes per-field font selectors and patches fieldFonts", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <CardsInspector
        cards={project.cards}
        userFonts={[{
          id: "font-user-1",
          label: "手写体",
          family: "font-user-1",
          src: "data:font/ttf;base64,AA==",
          format: "truetype",
          source: "user",
        }]}
        onPatch={onPatch}
        onReset={vi.fn()}
      />,
    ));

    for (const id of ["cards-font", "cards-font-title", "cards-font-name", "cards-font-university", "cards-font-city"]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
    expect(container.querySelectorAll(".font-editor [data-font-preview]")).toHaveLength(5);

    const nameFont = container.querySelector("#cards-font-name") as HTMLSelectElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    flushSync(() => {
      setter?.call(nameFont, "font-user-1");
      nameFont.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onPatch).toHaveBeenCalledWith({ fieldFonts: { name: "font-user-1" } });

    const unified = container.querySelector("#cards-font") as HTMLSelectElement;
    flushSync(() => {
      setter?.call(unified, "font-system-kaiti");
      unified.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onPatch).toHaveBeenCalledWith({
      fieldFonts: {
        title: "font-system-kaiti",
        name: "font-system-kaiti",
        university: "font-system-kaiti",
        city: "font-system-kaiti",
      },
    });

    flushSync(() => root.unmount());
  });

  it("keeps data-card font controls available when other advanced settings are collapsed", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <CardsInspector cards={project.cards} onPatch={onPatch} onReset={vi.fn()} mode="global" collapsible />,
    ));

    const details = container.querySelector<HTMLDetailsElement>(".property-panel__advanced");
    expect(details).not.toBeNull();
    expect(details?.querySelector(".cards-expressions")).toBeNull();
    expect(details?.querySelector("#cards-padding")).not.toBeNull();
    expect(details?.querySelector(".cards-field-fonts")).toBeNull();
    expect(container.querySelector(".cards-field-fonts")).not.toBeNull();
    expect(details?.querySelector("#cards-connector-dash")).not.toBeNull();
    expect(details?.querySelector("#cards-visible-name")).not.toBeNull();
    // 核心控件保持在折叠之外
    expect(container.querySelector(".property-panel__advanced #cards-preset")).toBeNull();
    expect(container.querySelector("#cards-preset")).not.toBeNull();
    expect(container.querySelector(".property-panel__advanced #cards-connector-color")).toBeNull();

    root.unmount();
  });

  it("keeps remaining advanced controls open by default", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <CardsInspector cards={project.cards} onPatch={onPatch} onReset={vi.fn()} mode="global" />,
    ));

    expect(container.querySelector(".property-panel__advanced")).toBeNull();
    expect(container.querySelector(".cards-expressions")).toBeNull();
    expect(container.querySelector("#cards-field-fonts")).toBeNull();

    root.unmount();
  });

  it("toggles no-wrap fields per visible field", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, visibleFields: ["name", "university"], noWrapFields: ["name"] };
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<CardsInspector cards={project.cards} onPatch={onPatch} onReset={vi.fn()} />));

    const name = container.querySelector("#cards-nowrap-name") as HTMLInputElement;
    const city = container.querySelector("#cards-nowrap-city") as HTMLInputElement;
    expect(name.checked).toBe(true);
    expect(city.disabled).toBe(true);

    flushSync(() => name.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ noWrapFields: [] });

    onPatch.mockClear();
    flushSync(() => (container.querySelector("#cards-nowrap-university") as HTMLInputElement).dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ noWrapFields: ["name", "university"] });

    flushSync(() => root.unmount());
  });
});
