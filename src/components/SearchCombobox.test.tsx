import { type ReactElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it } from "vitest";
import { searchCities, searchUniversities } from "../lib/search-catalog";
import {
  SearchCombobox,
  type SearchComboboxOption,
} from "./SearchCombobox";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

function render(element: ReactElement): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(element));
  return container;
}

function changeInput(input: HTMLInputElement, value: string): void {
  flushSync(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function pressKey(input: HTMLInputElement, key: string): void {
  flushSync(() => input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
}

function click(element: Element): void {
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function universityOptions(query: string): SearchComboboxOption[] {
  return searchUniversities(query).map((university) => ({
    value: university.name,
    label: university.name,
    detail: university.city,
  }));
}

function cityOptions(query: string): SearchComboboxOption[] {
  return searchCities(query).map((city) => ({
    value: city.name,
    label: city.name,
    detail: city.province,
  }));
}

function ComboboxHarness({
  label,
  options,
  portal = false,
}: {
  label: string;
  options: (query: string) => SearchComboboxOption[];
  portal?: boolean;
}) {
  const [value, setValue] = useState("");
  return (
    <>
      <SearchCombobox
        label={label}
        value={value}
        placeholder={label}
        searchOptions={options}
        portal={portal}
        onChange={setValue}
      />
      <output data-testid="selected-value">{value}</output>
    </>
  );
}

describe("SearchCombobox", () => {
  it("selects the canonical university suggestion for an alias", async () => {
    const container = await render(<ComboboxHarness label="录取院校" options={universityOptions} />);
    const input = container.querySelector<HTMLInputElement>('input[aria-label="录取院校"]')!;

    await changeInput(input, "北大");
    const option = [...container.querySelectorAll('[role="option"]')].find(
      (element) => element.textContent?.includes("北京大学"),
    )!;
    await click(option);

    expect(container.querySelector('[data-testid="selected-value"]')?.textContent).toBe("北京大学");
  });

  it("selects the canonical city suggestion with its province detail", async () => {
    const container = await render(<ComboboxHarness label="城市" options={cityOptions} />);
    const input = container.querySelector<HTMLInputElement>('input[aria-label="城市"]')!;

    await changeInput(input, "杭州");
    expect(container.textContent).toContain("杭州市 · 浙江省");
    const option = container.querySelector('[role="option"]')!;
    await click(option);

    expect(container.querySelector('[data-testid="selected-value"]')?.textContent).toBe("杭州市");
  });

  it("supports ArrowDown, Enter, and Escape without rejecting free text", async () => {
    const container = await render(<ComboboxHarness label="录取院校" options={universityOptions} />);
    const input = container.querySelector<HTMLInputElement>('input[aria-label="录取院校"]')!;

    await changeInput(input, "北大");
    await pressKey(input, "ArrowDown");
    await pressKey(input, "Enter");
    expect(input.value).toBe("北京大学");

    await changeInput(input, "自定义学院");
    expect(input.value).toBe("自定义学院");
    await pressKey(input, "Escape");
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("mounts portal suggestions outside the combobox clipping context", async () => {
    const container = render(<ComboboxHarness label="城市" options={cityOptions} portal />);
    const input = container.querySelector<HTMLInputElement>('input[aria-label="城市"]')!;

    await changeInput(input, "杭州");

    const list = document.body.querySelector<HTMLElement>(".search-combobox__list--portal");
    expect(list).not.toBeNull();
    expect(container.contains(list)).toBe(false);
    expect(list?.getAttribute("role")).toBe("listbox");
  });

  it("caps portal height to the available viewport space", async () => {
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 80 });
    const container = render(<ComboboxHarness label="城市" options={cityOptions} portal />);
    const input = container.querySelector<HTMLInputElement>('input[aria-label="城市"]')!;
    Object.defineProperty(input, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 30,
        height: 20,
        left: 20,
        right: 180,
        top: 10,
        width: 160,
        x: 20,
        y: 10,
        toJSON: () => ({}),
      }),
    });

    await changeInput(input, "杭州");

    const list = document.body.querySelector<HTMLElement>(".search-combobox__list--portal");
    expect(Number.parseFloat(list?.style.maxHeight ?? "0")).toBeLessThanOrEqual(42);
    Object.defineProperty(window, "innerHeight", { configurable: true, value: originalInnerHeight });
  });
});
