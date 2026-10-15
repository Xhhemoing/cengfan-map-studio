import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { createDefaultScene } from "../../lib/scene-document";
import { patchCardStyles } from "../../lib/card-settings-scope";
import { CardScopeInspector } from "./CardScopeInspector";

const roots: Root[] = [];
afterEach(() => {
  flushSync(() => { for (const root of roots.splice(0)) root.unmount(); });
  document.querySelectorAll("[data-scope-test-container]").forEach((node) => node.remove());
});
function mount() {
  const container = document.createElement("div");
  container.setAttribute("data-scope-test-container", ""); document.body.append(container);
  const root = createRoot(container); roots.push(root);
  const onPatch = vi.fn(); const onReset = vi.fn();
  const cards = patchCardStyles(createDefaultScene("original").cards, ["北京"], { fontSize: 24 });
  flushSync(() => root.render(<CardScopeInspector cards={cards} ids={["北京", "上海"]} userFonts={[]} onPatch={onPatch} onReset={onReset} />));
  return { container, onPatch, onReset, root, cards };
}
function changeSelect(container: HTMLElement, id: string, value: string) {
  const select = container.querySelector<HTMLSelectElement>(`#${id}`)!;
  select.value = value;
  flushSync(() => select.dispatchEvent(new Event("change", { bubbles: true })));
}

describe("card scope inspector", () => {
  it("makes the selected scope explicit and excludes whole-document controls", () => {
    const { container, onPatch } = mount();
    expect(container.querySelector("#cards-edit-scope")?.textContent).toContain("已选 2 个展示框");
    expect(container.querySelector("#cards-grouping")).toBeNull();
    expect(container.querySelector("#cards-layout-mode")).toBeNull();
    expect(container.querySelector("#cards-x")).toBeNull();
    expect(container.querySelector("#cards-maxWidth")).not.toBeNull();
    changeSelect(container, "cards-position-policy", "locked");
    expect(onPatch).toHaveBeenCalledWith({ type: "cards", ids: ["北京", "上海"], scopeGrouping: "province" }, { positionPolicy: "locked" });
    flushSync(() => [...container.querySelectorAll("button")].find((button) => button.textContent === "恢复所选框的全局继承")!.click());
    expect(onPatch).toHaveBeenLastCalledWith({ type: "cards", ids: ["北京", "上海"], scopeGrouping: "province" }, { resetStyleOverrides: true });
  });
  it("requires a visible scope switch before editing global grouping", () => {
    const { container, onPatch } = mount();
    changeSelect(container, "cards-edit-scope", "all");
    expect(container.querySelector("#cards-grouping")).not.toBeNull();
    changeSelect(container, "cards-grouping", "city");
    expect(onPatch).toHaveBeenCalledWith({ type: "cards" }, { grouping: "city" });
  });
  it("patches only the edited field for multi-selection instead of copying other values", () => {
    const { container, onPatch } = mount();
    const input = container.querySelector<HTMLInputElement>("#cards-font-name-color")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "#abcdef");
    flushSync(() => input.dispatchEvent(new Event("input", { bubbles: true })));
    flushSync(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ type: "cards", ids: ["北京", "上海"], scopeGrouping: "province" }, { fieldTypography: { name: { color: "#abcdef" } } });
  });
});


describe("scoped size controls and input continuity", () => {
  it("exposes content width as a bounded range without changing actual font sizes", () => {
    const { container, onPatch } = mount();
    changeSelect(container, "cards-width-mode", "content");
    expect(onPatch).toHaveBeenCalledWith({ type: "cards", ids: ["北京", "上海"], scopeGrouping: "province" }, { widthMode: "content" });
    expect(container.querySelector("#cards-minFontSize")).not.toBeNull();
    expect(container.textContent).toContain("高度随内容撑开");
  });
  it("keeps a focused field and its pending draft while project defaults update", () => {
    const { container, root, cards, onPatch, onReset } = mount();
    const input = container.querySelector<HTMLInputElement>("#cards-font-name-size")!;
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "27");
    flushSync(() => input.dispatchEvent(new Event("input", { bubbles: true })));
    const next = { ...cards, textColor: "#abcdef" };
    flushSync(() => root.render(<CardScopeInspector cards={next} ids={["北京", "上海"]} userFonts={[]} onPatch={onPatch} onReset={onReset} />));
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("27");
    expect(onPatch).not.toHaveBeenCalled();
    flushSync(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ type: "cards", ids: ["北京", "上海"], scopeGrouping: "province" }, { fieldTypography: { name: { fontSize: 27 } } });
  });
});


describe("unavailable scoped targets", () => {
  it("requires an explicit user scope change before exposing global controls", () => {
    const { root, cards, container, onPatch, onReset } = mount();
    flushSync(() => root.render(<CardScopeInspector cards={cards} ids={[]} unavailableSelection userFonts={[]} onPatch={onPatch} onReset={onReset} />));
    expect(container.textContent).toContain("分组已更改");
    expect(container.querySelector("#cards-background")).toBeNull();
    flushSync(() => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(container.querySelector("#cards-background")).not.toBeNull();
    expect(onPatch).not.toHaveBeenCalled();
  });
});
