import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "../lib/project-document";
import { TypographyPanel } from "./TypographyPanel";

const userFont = {
  id: "font-user-1",
  label: "陕西手写体",
  family: "font-user-1",
  src: "data:font/ttf;base64,AA==",
  format: "truetype" as const,
  source: "user" as const,
};

function setSelect(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  flushSync(() => {
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("TypographyPanel", () => {
  it("groups province, guest, personnel-list and free-text font controls in one tool", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.guests.people = [{ id: "guest-1", name: "张老师", title: "特邀嘉宾", visibility: true }];
    const onApplyFont = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);

    flushSync(() => root.render(
      <TypographyPanel
        project={project}
        provinces={["陕西省", "浙江省"]}
        userFonts={[userFont]}
        onApplyFont={onApplyFont}
        onPatch={vi.fn()}
      />,
    ));

    expect(container.textContent).toContain("字体工具");
    expect(container.textContent).toContain("省份名称");
    expect(container.textContent).toContain("特邀嘉宾");
    expect(container.textContent).toContain("人员名单");
    expect(container.textContent).toContain("画布文本");

    setSelect(container.querySelector("#typography-province") as HTMLSelectElement, "陕西省");
    setSelect(container.querySelector("#typography-province-font") as HTMLSelectElement, userFont.id);
    expect(onApplyFont).toHaveBeenCalledWith(
      { type: "province-label", province: "陕西省" },
      userFont.id,
      false,
    );

    flushSync(() => container.querySelector<HTMLInputElement>("#typography-province-all")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    setSelect(container.querySelector("#typography-province-font") as HTMLSelectElement, "font-system-kaiti");
    expect(onApplyFont).toHaveBeenLastCalledWith(
      { type: "province-label", province: "陕西省" },
      "font-system-kaiti",
      true,
    );

    flushSync(() => root.unmount());
  });

  it("can apply one guest font to all guests and one personnel font to all names", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.guests.people = [{ id: "guest-1", name: "张老师", title: "特邀嘉宾", visibility: true }];
    const onApplyFont = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <TypographyPanel project={project} provinces={["陕西省"]} onApplyFont={onApplyFont} onPatch={vi.fn()} />,
    ));

    flushSync(() => container.querySelector<HTMLInputElement>("#typography-guest-all")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    setSelect(container.querySelector("#typography-guest-font") as HTMLSelectElement, "font-system-serif");
    expect(onApplyFont).toHaveBeenCalledWith(
      { type: "guest-person", id: "guest-1" },
      "font-system-serif",
      true,
    );

    setSelect(container.querySelector("#typography-roster-font") as HTMLSelectElement, "font-system-mono");
    expect(onApplyFont).toHaveBeenLastCalledWith(
      { type: "card-field", field: "name" },
      "font-system-mono",
      true,
    );

    flushSync(() => root.unmount());
  });

  it("writes independent province and personnel typography overrides", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <TypographyPanel project={project} provinces={["陕西省"]} onApplyFont={vi.fn()} onPatch={onPatch} />,
    ));

    const provinceSize = container.querySelector<HTMLInputElement>("#typography-province-size")!;
    const numberSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    flushSync(() => {
      numberSetter?.call(provinceSize, "16");
      provinceSize.dispatchEvent(new Event("input", { bubbles: true }));
      provinceSize.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(onPatch).toHaveBeenCalledWith({ type: "map" }, { provinceLabelTypography: { fontSize: 16 } });

    const rosterSize = container.querySelector<HTMLInputElement>("#typography-roster-size")!;
    flushSync(() => {
      numberSetter?.call(rosterSize, "18");
      rosterSize.dispatchEvent(new Event("input", { bubbles: true }));
      rosterSize.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(onPatch).toHaveBeenCalledWith({ type: "cards" }, { fieldTypography: { name: { fontSize: 18 } } });
    flushSync(() => root.unmount());
  });

  it("writes the global line-height multiplier to canvas settings", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <TypographyPanel project={project} provinces={["陕西省"]} onApplyFont={vi.fn()} onPatch={onPatch} />,
    ));

    expect(container.textContent).toContain("全局行距");

    const lineHeight = container.querySelector<HTMLInputElement>("#typography-line-height")!;
    const numberSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    flushSync(() => {
      numberSetter?.call(lineHeight, "1.5");
      lineHeight.dispatchEvent(new Event("change", { bubbles: true }));
      lineHeight.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(onPatch).toHaveBeenCalledWith({ type: "canvas" }, { lineHeight: 1.5 });
    flushSync(() => root.unmount());
  });
});
